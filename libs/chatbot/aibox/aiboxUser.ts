import { Logger } from "~utils/logger";

export interface AIBoxUserInfo {
    id: number;
    username: string;
    nickname: string;
    avatar: string;
    chat_models: number[];    // 可用的模型列表
    chat_roles: string[];     // 可用的角色列表
    created_at: number;
    expired_time: number;
    img_calls: number;
    last_login_at: number;
    last_login_ip: string;
    power: number;           // 剩余点数
    salt: string;
    status: boolean;
    updated_at: number;
    vip: boolean;
}

export class AIBoxUser {
    private static instance: AIBoxUser;
    private userInfo: AIBoxUserInfo | null = null;

    private constructor() {}

    static getInstance(): AIBoxUser {
        if (!AIBoxUser.instance) {
            AIBoxUser.instance = new AIBoxUser();
        }
        return AIBoxUser.instance;
    }

    setUserInfo(info: AIBoxUserInfo) {
        this.userInfo = info;
        Logger.log("AIBox user info updated:", this.userInfo);
    }

    getUserInfo(): AIBoxUserInfo | null {
        return this.userInfo;
    }

    // 常用的判断方法
    canUseModel(modelId: number): boolean {
        return true;
        //return this.userInfo?.chat_models.includes(modelId) || false;
    }

    isVIP(): boolean {
        return this.userInfo?.vip || false;
    }

    getUserId(): number | null {
        return this.userInfo?.id || null;
    }

    getPower(): number {
        return this.userInfo?.power || 0;
    }

    getAvailableRoles(): string[] {
        return this.userInfo?.chat_roles || [];
    }
} 