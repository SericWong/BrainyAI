import { AiboxBot } from "./index";
import { AIBoxUser } from "./aiboxUser";
import IconAIBoxGPT4 from "data-base64:~assets/simple-icons_openai.svg";
import {
    type BotCompletionParams,
    type BotConstructorParams,
    type ConversationResponseCb,
    type IBot
} from "~libs/chatbot/IBot";
import { ConversationResponse, ResponseMessageType } from "~libs/open-ai/open-ai-interface";
import { ChatError, ErrorCode } from "~utils/errors";
export class AiboxGPT4oMiniBot extends AiboxBot {
    static botName = 'GPT4o-mini';
    static logoSrc = IconAIBoxGPT4;
    static desc = 'AIBox GPT4o-mini model - Advanced language model';
    static maxTokenLimit = 128000;
    static modelId = 1;  // 对应后端模型ID

    protected getModelId(): number {
        return AiboxGPT4oMiniBot.modelId;
    }

    static async checkModelCanUse(): Promise<boolean> {
        const [, canUse] = await this.checkIsLogin();
        if (!canUse) return false;
        
        return AIBoxUser.getInstance().canUseModel(this.modelId);
    }

    async completion({prompt, rid, cb, fileRef}: BotCompletionParams): Promise<void> {
        const [checkErr, isLogin] = await AiboxGPT4oMiniBot.checkIsLogin();
        if (checkErr || !isLogin) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                message_type: ResponseMessageType.ERROR,
                error: checkErr ?? new ChatError(ErrorCode.UNAUTHORIZED)
            }));
        }

        if (!await AiboxGPT4oMiniBot.checkModelCanUse()) {
            return cb(rid, new ConversationResponse({
                conversation_id: this.botSession.session.botConversationId,
                message_type: ResponseMessageType.ERROR,
                error: new ChatError(ErrorCode.MODEL_NO_PERMISSION)
            }));
        }

        return super.completion({prompt, rid, cb, fileRef});
    }
} 