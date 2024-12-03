import {ChatError, ErrorCode} from "~utils/errors";
import {ConversationResponse, ResponseMessageType} from "~libs/open-ai/open-ai-interface";
import {sendToBackground} from "@plasmohq/messaging";
import {Storage} from "@plasmohq/storage";
import {
    appendParamToUrl,
    createUuid,
    IS_OPEN_IN_CHAT_AUTH_WINDOW,
    MESSAGE_ACTION_CHAT_PROVIDER_AUTH_SUCCESS,
    WINDOW_FOR_REMOVE_STORAGE_KEY
} from "~utils";
import {
    type BotCompletionParams,
    type BotConstructorParams,
    type ConversationResponseCb,
    type IBot
} from "~libs/chatbot/IBot";
import {BotBase} from "~libs/chatbot/BotBase";
import AIBoxSessionSingleton from "~libs/chatbot/aibox/aiboxSession";
import {SimpleBotMessage} from "~libs/chatbot/BotSessionBase";
import IconAibox from "data-base64:~assets/simple-icons_openai.svg";

import {Logger} from "~utils/logger";
import {KimiFileSingleton, KimiSupportedMimeTypes} from "~libs/chatbot/kimi/fileInstance";
import {checkModelSupportUploadPDF} from "~libs/chatbot/utils";
import {AIBoxUser} from "~libs/chatbot/aibox/aiboxUser";

const APP_KEY_PREFIX =  "ChatPLUS_"; 
const STORAGE_REFRESH_TOKEN_KEY = "kimi_refresh_token";
const STORAGE_ACCESS_TOKEN_KEY = APP_KEY_PREFIX + "Authorization";
const STORAGE_SESSION_ID_KEY = "ChatPLUS_SESSION_ID";

interface AiboxCreateConversation {
    id: string;
    name: string;
    thumb_status: {
        is_thumb_up: boolean;
        is_thumb_down: boolean;
    };
    created_at: string;
    is_example: boolean;
    status: string;
    type: string;
}

export class AiboxBot extends BotBase implements IBot {
    private fileInstance: KimiFileSingleton;
    static botName = 'aibox-v1';
    static logoSrc = IconAibox;
    static loginUrl = 'https://chat.aibox365.cn/login';
    static maxTokenLimit = 40000;
    static get supportUploadImage() {
        return checkModelSupportUploadPDF(KimiSupportedMimeTypes);
    }
    static get supportUploadPDF() {
        return checkModelSupportUploadPDF(KimiSupportedMimeTypes);
    }
    static desc = 'Suitable for online text generation, chatbots, text summarization, and creative writing.';
    botSession: AIBoxSessionSingleton;
    fileRefs: string[];

    constructor(params: BotConstructorParams) {
        super(params);
        this.botSession = AIBoxSessionSingleton.getInstance(params.globalConversationId);
        this.fileInstance = KimiFileSingleton.getInstance();
    }

    static AUTH_WINDOW_KEY = 'aibox_auth_key';

    static async getAccessToken(): Promise<string> {
        const storage = new Storage();
        const token = await storage.get(STORAGE_ACCESS_TOKEN_KEY) ?? "";
        return token.replace(/['"\\]/g, '');
    }

    static setAccessToken(token: string) {
        const storage = new Storage();
        void storage.set(STORAGE_ACCESS_TOKEN_KEY, token);
    }

    static async getSessionId(): Promise<string> {
        const storage = new Storage();
        const sessionId = await storage.get(STORAGE_SESSION_ID_KEY) ?? "";
        return sessionId.replace(/['"\\]/g, '');
    }
    
    static setSessionId(token: string) {
        const storage = new Storage();
        void storage.set(STORAGE_SESSION_ID_KEY, token);
    }

    static setRefreshToken(token: string) {
        const storage = new Storage();
        void storage.set(STORAGE_REFRESH_TOKEN_KEY, token);
    }

    static async getRefreshToken(): Promise<string> {
        const storage = new Storage();
        return (await storage.get(STORAGE_REFRESH_TOKEN_KEY) ?? "");
    }


    static async checkIsLogin(): Promise<[ChatError | null, boolean]> {
        Logger.log("AIBox checkIsLogin start");
        const [err1, data] = await sendToBackground({
            name: "aibox/prompt-snippet-instance",
        });
        
        Logger.log("AIBox checkIsLogin response:", { err1, data });
        
        if (err1) {
            if (err1.code === ErrorCode.UNAUTHORIZED) {
                Logger.log("AIBox unauthorized, opening login page");
                chrome.tabs.create({ 
                    url: "https://chat.aibox365.cn/login",
                    active: true
                });
                return [err1, false];
            } else {
                Logger.log("AIBox other error:", err1);
                return [err1, false];
            }
        }

        // 保存用户信息
        AIBoxUser.getInstance().setUserInfo(data);
        Logger.log("AIBox login check success");
        return [null, true];
    }

    static async checkModelCanUse(): Promise<boolean> {
        const [, canUse] = await this.checkIsLogin();
        return canUse;
    }

    async completion({prompt, rid, cb, fileRef, file}: BotCompletionParams) {
        try {
            if (!this.botSession.session.botConversationId) {
                const [err, conversation] = await this.createConversation();
                if (err || !conversation) {
                    throw err || new ChatError(ErrorCode.CONVERSATION_LIMIT);
                }
                this.botSession.session.botConversationId = conversation.id;
            }
            Logger.log("[StreamChat] completion with:", { 
                prompt, 
                rid, 
                conversationId: this.botSession.session.botConversationId 
            });
            await this.streamChat(prompt, rid, cb);
        } catch (e) {
            if (e instanceof ChatError) {
                throw e;
            }
            throw new ChatError(ErrorCode.NETWORK_ERROR);
        }
    }

    private static messageCallbacks: Map<string, (message: any) => void> = new Map();
    private static isListenerInitialized = false;

    private static initializeGlobalListener() {
        if (this.isListenerInitialized) return;

        chrome.runtime.onMessage.addListener((message) => {
            if (message.source !== 'aibox-stream') return;
            
            const callback = this.messageCallbacks.get(message.conversationId);
            if (callback) {
                callback(message);
                
                // 如果是结束消息，清理回调
                if (message.data.type === 'end' || message.data.type === 'error') {
                    this.messageCallbacks.delete(message.conversationId);
                }
            }
        });

        this.isListenerInitialized = true;
    }

    private async streamChat(prompt: string, rid: string, cb: ConversationResponseCb) {
        Logger.log("[StreamChat] Starting chat");
        
        // 用于累积消息内容
        let accumulatedText = '';

        // 确保全局监听器已初始化
        AiboxBot.initializeGlobalListener();

        const conversationId = this.botSession.session.botConversationId;
        Logger.log("[StreamChat] Using conversationId:", conversationId);
        
        // 设置这次对话的回调
        AiboxBot.messageCallbacks.set(conversationId, (message) => {
            Logger.log("[StreamChat] Received message:", message);
            const { type, content } = message.data;
            
            switch (type) {
                case 'start':
                    Logger.log("[StreamChat] Handling 'start' message");
                    cb(rid, new ConversationResponse({
                        conversation_id: conversationId,
                        message_type: ResponseMessageType.GENERATING
                    }));
                    break;

                case 'middle':
                    Logger.log("[StreamChat] Handling 'content' message:", content);
                    // 累加内容
                    accumulatedText += content;
                    cb(rid, new ConversationResponse({
                        conversation_id: conversationId,
                        message_type: ResponseMessageType.GENERATING,
                        message_text: accumulatedText
                    }));
                    break;

                case 'end':
                    Logger.log("[StreamChat] Handling 'end' message");
                    cb(rid, new ConversationResponse({
                        conversation_id: conversationId,
                        message_type: ResponseMessageType.DONE,
                        message_text: accumulatedText
                    }));
                    break;

                case 'error':
                    Logger.error("[StreamChat] Handling 'error' message:", message.data.error);
                    cb(rid, new ConversationResponse({
                        error: message.data.error,
                        message_type: ResponseMessageType.ERROR
                    }));
                    break;
            }
        });

        // 添加超时保护
        setTimeout(() => {
            if (AiboxBot.messageCallbacks.has(conversationId)) {
                Logger.error("[StreamChat] Timeout reached for conversationId:", conversationId);
                AiboxBot.messageCallbacks.delete(conversationId);
                cb(rid, new ConversationResponse({
                    error: new ChatError(ErrorCode.REQUEST_TIMEOUT_ABORT),
                    message_type: ResponseMessageType.ERROR
                }));
            }
        }, 30000);

        // 发送初始请求
        Logger.log("[StreamChat] Sending initial request");
        const [err, res] = await sendToBackground({
            name: "aibox/create-conversation",
            body: {
                type: 'chat',
                prompt,
                conversationId,
                modelId: this.getModelId(),
                roleId: this.getRoleId()
            }
        });

        // 检查初始连接是否成功
        if (err || res?.type !== 'connected') {
            Logger.error("[StreamChat] Initial connection failed:", { err, res });
            AiboxBot.messageCallbacks.delete(conversationId);
            return cb(rid, new ConversationResponse({
                error: err || new ChatError(ErrorCode.NETWORK_ERROR),
                message_type: ResponseMessageType.ERROR
            }));
        }

        Logger.log("[StreamChat] Initial connection successful");
    }

    async startAuth(): Promise<boolean> {
        const randomKey = '__window_key_' + Math.random() * 1000;
        const authValue = createUuid();
        
        console.log('[Auth Debug] Starting auth process', {
            randomKey,
            authValue
        });

        const url = appendParamToUrl(
            appendParamToUrl(
                appendParamToUrl(
                    AiboxBot.loginUrl,
                    IS_OPEN_IN_CHAT_AUTH_WINDOW,
                    '1'
                ),
                WINDOW_FOR_REMOVE_STORAGE_KEY,
                randomKey
            ),
            AiboxBot.AUTH_WINDOW_KEY,
            authValue
        );
        
        console.log('[Auth Debug] Generated auth URL:', url);

        const res = await sendToBackground({
            name: "open-new-window",
            body: {
                url,
                width: 800,
                height: 660,
                focused: true,
                screenWidth: window.screen.width,
                screenHeight: window.screen.height
            },
        });
        
        console.log('[Auth Debug] Window created with ID:', res);

        const storage = new Storage();
        await storage.set(randomKey, res);
        console.log('[Auth Debug] Stored window ID in storage:', {
            key: randomKey,
            value: res
        });

        return new Promise((resolve) => {
            console.log('[Auth Debug] Setting up message listener');
            const listener = function (message: any) {
                console.log('[Auth Debug] Received message:', message);
                if (message.action === MESSAGE_ACTION_CHAT_PROVIDER_AUTH_SUCCESS) {
                    console.log('[Auth Debug] Auth success message received', {
                        receivedKey: message.authKey,
                        expectedKey: authValue
                    });
                    if (message.authKey === authValue) {
                        console.log('[Auth Debug] Auth key matched, resolving promise');
                        chrome.runtime.onMessage.removeListener(listener);
                        resolve(true);
                    } else {
                        console.log('[Auth Debug] Auth key mismatch', {
                            received: message.authKey,
                            expected: authValue
                        });
                    }
                }
            };
            chrome.runtime.onMessage.addListener(listener);
        });
    }

    private async createConversation(): Promise<[ChatError?, AiboxCreateConversation?]> {
        const existingId = this.botSession.session.botConversationId;
        Logger.log("[CreateConversation] Starting with existing ID:", existingId);

        const [err, res] = await sendToBackground({
            name: "aibox/create-conversation",
            body: {
                type: 'create',
                conversationId: existingId,
                modelId: this.getModelId(),
                roleId: this.getRoleId()
            }
        });

        Logger.log("[CreateConversation] Background response:", { err, res });

        if (err) {
            Logger.error("[CreateConversation] Error:", err);
            return [err, undefined];
        }

        const conversation: AiboxCreateConversation = {
            id: res.conversationId,
            name: "New Conversation",
            thumb_status: {
                is_thumb_up: false,
                is_thumb_down: false
            },
            created_at: new Date().toISOString(),
            is_example: false,
            status: "active",
            type: "chat"
        };

        Logger.log("[CreateConversation] Created conversation:", conversation);
        this.botSession.session.setBotConversationId(conversation.id);
        Logger.log("[CreateConversation] Set conversation ID in session");

        return [undefined, conversation];
    }

    private async callPromptSnippetInstance(): Promise<[ChatError?, any?]> {
        const [err, res] = await sendToBackground({
            name: "aibox/prompt-snippet-instance",
        });

        return [err, res];
    }


    // private setAccessToken(access_token: string) {
    // }
    //
    // private setRefreshToken(refresh_token: string) {
    // }
    protected getModelId(): number | undefined {
        return undefined;
    }
    protected getRoleId(): number {
        return 1;  // 默认返回 1
    }

    startCaptcha(): Promise<boolean> {
        return Promise.resolve(false);
    }

    uploadFile(file: File): Promise<string> {
        return this.fileInstance.uploadFile(file, this.supportedUploadTypes);
    }

    get supportedUploadTypes() {
        return KimiSupportedMimeTypes;
    }

    getBotName(): string {
        return AiboxBot.logoSrc;
    }

    getLoginUrl(): string {
        return AiboxBot.loginUrl;
    }

    getLogoSrc(): string {
        return AiboxBot.logoSrc;
    }

    getRequireLogin(): boolean {
        return AiboxBot.requireLogin;
    }

    getSupportUploadImage(): boolean {
        return AiboxBot.supportUploadImage;
    }

    getSupportUploadPDF(): boolean {
        return AiboxBot.supportUploadPDF;
    }

    getPaidModel(): boolean {
        return AiboxBot.paidModel;
    }

    getMaxTokenLimit(): number {
        return AiboxBot.maxTokenLimit;
    }

    getNewModel(): boolean {
        return AiboxBot.newModel;
    }
}
