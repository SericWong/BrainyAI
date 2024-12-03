import  {BotSession} from "~libs/chatbot/BotSessionBase";

export default class AIBoxSessionSingleton {
    private static instance: AIBoxSessionSingleton | null;
    static globalConversationId: string;
    session: BotSession;

    private constructor() {
        this.session = new BotSession(AIBoxSessionSingleton.globalConversationId);
    }

    static destroy() {
        AIBoxSessionSingleton.globalConversationId = "";
        AIBoxSessionSingleton.instance = null;
    }

    static getInstance(globalConversationId: string) {
        if (globalConversationId !== AIBoxSessionSingleton.globalConversationId) {
            AIBoxSessionSingleton.destroy();
        }

        AIBoxSessionSingleton.globalConversationId = globalConversationId;

        if (!AIBoxSessionSingleton.instance) {
            AIBoxSessionSingleton.instance = new AIBoxSessionSingleton();
        }

        return AIBoxSessionSingleton.instance;
    }
}
