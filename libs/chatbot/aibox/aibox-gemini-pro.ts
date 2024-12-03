import { AiboxBot } from "./index";
import { AIBoxUser } from "./aiboxUser";
import IconAIBoxGeminiPro from "data-base64:~assets/simple-icons_gemini.svg";
import {
    type BotCompletionParams,
    type BotConstructorParams,
    type ConversationResponseCb,
    type IBot
} from "~libs/chatbot/IBot";
import { ConversationResponse, ResponseMessageType } from "~libs/open-ai/open-ai-interface";
import { ChatError, ErrorCode } from "~utils/errors";
export class AiboxGeminiProBot extends AiboxBot {
    static botName = 'Gemini-1.5-pro';
    static logoSrc = IconAIBoxGeminiPro;
    static desc = 'AIBox Gemini model - Advanced language model';
    static maxTokenLimit = 128000;
    static modelId = 20;  // 对应后端模型ID

    protected getModelId(): number {
        return AiboxGeminiProBot.modelId;
    }

    static async checkModelCanUse(): Promise<boolean> {
        const [, canUse] = await this.checkIsLogin();
        if (!canUse) return false;
        
        return AIBoxUser.getInstance().canUseModel(this.modelId);
    }

    async completion({prompt, rid, cb, fileRef}: BotCompletionParams): Promise<void> {
        const [checkErr, isLogin] = await AiboxGeminiProBot.checkIsLogin();
        if (checkErr || !isLogin) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                message_type: ResponseMessageType.ERROR,
                error: checkErr ?? new ChatError(ErrorCode.UNAUTHORIZED)
            }));
        }

        if (!await AiboxGeminiProBot.checkModelCanUse()) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                message_type: ResponseMessageType.ERROR,
                error: new ChatError(ErrorCode.MODEL_NO_PERMISSION)
            }));
        }

        return super.completion({prompt, rid, cb, fileRef});
    }
} 