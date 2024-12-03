import { AiboxBot } from "./index";
import { AIBoxUser } from "./aiboxUser";
import IconAIBoxClaude35Sonnet from "data-base64:~assets/simple-icons_claude.svg";
import {
    type BotCompletionParams,
    type BotConstructorParams,
    type ConversationResponseCb,
    type IBot
} from "~libs/chatbot/IBot";
import { ConversationResponse, ResponseMessageType } from "~libs/open-ai/open-ai-interface";
import { ChatError, ErrorCode } from "~utils/errors";
export class AiboxClaude35SonnetBot extends AiboxBot {
    static botName = 'Claude-3.5-Sonnet';
    static logoSrc = IconAIBoxClaude35Sonnet;
    static desc = 'AIBox Claude-3.5-Sonnet model - Advanced language model';
    static maxTokenLimit = 128000;
    static modelId = 23;  // 对应后端模型ID

    protected getModelId(): number {
        return AiboxClaude35SonnetBot.modelId;
    }

    static async checkModelCanUse(): Promise<boolean> {
        const [, canUse] = await this.checkIsLogin();
        if (!canUse) return false;
        
        return AIBoxUser.getInstance().canUseModel(this.modelId);
    }

    async completion({prompt, rid, cb, fileRef}: BotCompletionParams): Promise<void> {
        const [checkErr, isLogin] = await AiboxClaude35SonnetBot.checkIsLogin();
        if (checkErr || !isLogin) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                message_type: ResponseMessageType.ERROR,
                error: checkErr ?? new ChatError(ErrorCode.UNAUTHORIZED)
            }));
        }

        if (!await AiboxClaude35SonnetBot.checkModelCanUse()) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                message_type: ResponseMessageType.ERROR,
                error: new ChatError(ErrorCode.MODEL_NO_PERMISSION)
            }));
        }

        return super.completion({prompt, rid, cb, fileRef});
    }
} 