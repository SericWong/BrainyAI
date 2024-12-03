import type {PlasmoMessaging} from "@plasmohq/messaging";
import {customChatFetch} from "~utils/custom-fetch-for-chat";
import {ChatError, ErrorCode} from "~utils/errors";
import {AiboxBot} from "~libs/chatbot/aibox";
import {Logger} from "~utils/logger";

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
    Logger.log("AIBox prompt-snippet-instance start");
    
    // 1. 获取并清理 token
    const sessionId = (await AiboxBot.getSessionId())?.replace(/['"\\]/g, '');
    const accessToken = (await AiboxBot.getAccessToken())?.replace(/['"\\]/g, '');
    
    // 2. 直接构造 headers 对象
    const headers = {
        "Chat-Token": sessionId,
        "Authorization": accessToken
    };

    // 3. 打印检查
    Logger.log("Clean headers:", headers);

    const r = await customChatFetch("https://chat.aibox365.cn/api/user/session", {
        method: "GET",
        headers: headers  // 直接使用对象而不是 Headers 实例
    });

    if (r.error) {
        return res.send([r.error, null]);
    }

    try {
        const result = await r.response?.json();
        Logger.log("AIBox API response:", result);
        if (result && result.code === 0) {
            // 成功，返回用户信息
            res.send([null, result.data]);
        } else if (result.code === 401) {
            // 未授权
            res.send([new ChatError(ErrorCode.UNAUTHORIZED), null]);
        } else {
            // 其他错误
            res.send([new ChatError(ErrorCode.UNKNOWN_ERROR), null]);
        }
    } catch (e) {
        Logger.log("AIBox API error:", e);
        res.send([new ChatError(ErrorCode.UNKNOWN_ERROR), null]);
    }
};

export default handler;
