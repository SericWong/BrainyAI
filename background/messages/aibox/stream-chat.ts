import type {PlasmoMessaging} from "@plasmohq/messaging";
import {customChatFetch} from "~utils/custom-fetch-for-chat";
import {ChatError, ErrorCode} from "~utils/errors";
import {AiboxBot} from "~libs/chatbot/aibox";
import {Logger} from "~utils/logger";

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
    Logger.log("[Stream] Handler started with request:", {
        conversationId: req.body.conversationId,
        roleId: req.body.roleId,
        modelId: req.body.modelId
    });

    const sessionId = await AiboxBot.getSessionId();
    const userToken = await AiboxBot.getAccessToken();
    const {conversationId, prompt, roleId, modelId} = req.body;

    // 准备 WebSocket URL
    const wsUrl = `wss://chat.aibox365.cn/api/chat/new?session_id=${sessionId}&role_id=${roleId}&chat_id=${conversationId}&model_id=${modelId}&token=${userToken}`;
    Logger.log("[Stream] WebSocket URL:", wsUrl);
    
    let heartbeatTimer: NodeJS.Timeout;
    const ws = new WebSocket(wsUrl);

    const startHeartbeat = () => {
        Logger.log("[Stream] Sending heartbeat");
        clearTimeout(heartbeatTimer);
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({type: "heartbeat", content: "ping"}));
                heartbeatTimer = setTimeout(() => startHeartbeat(), 5000);
            } catch (error) {
                Logger.error("[Stream] Heartbeat error:", error);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            }
        }
    };

    ws.addEventListener('open', () => {
        Logger.log("[Stream] WebSocket connected, ready state:", ws.readyState);
        startHeartbeat();
    });

    ws.addEventListener('message', event => {
        Logger.log("[Stream] Received message type:", typeof event.data);
        
        if (event.data instanceof Blob) {
            const reader = new FileReader();
            reader.readAsText(event.data, "UTF-8");
            reader.onload = () => {
                try {
                    const data = JSON.parse(String(reader.result));
                    Logger.log("[Stream] Parsed message:", data);
                    
                    switch (data.type) {
                        case 'start':
                            Logger.log("[Stream] Chat started");
                            res.send({type: 'start'});
                            break;
                        case 'end':
                            Logger.log("[Stream] Chat ended");
                            res.send({type: 'end'});
                            clearTimeout(heartbeatTimer);
                            ws.close();
                            break;
                        default:
                            Logger.log("[Stream] Content received:", data.content);
                            res.send({type: 'content', content: data.content});
                    }
                } catch (e) {
                    Logger.error("[Stream] Parse message error:", e);
                    Logger.error("[Stream] Raw message:", reader.result);
                    res.send([new ChatError(ErrorCode.UNKNOWN_ERROR), null]);
                    ws.close();
                }
            };
        }
    });

    ws.addEventListener('close', (event) => {
        Logger.log("[Stream] WebSocket closed with code:", event.code, "reason:", event.reason);
        clearTimeout(heartbeatTimer);
    });

    ws.addEventListener('error', (error) => {
        Logger.error("[Stream] WebSocket error:", error);
        Logger.error("[Stream] WebSocket state:", ws.readyState);
        clearTimeout(heartbeatTimer);
        res.send([new ChatError(ErrorCode.NETWORK_ERROR), null]);
        ws.close();
    });
};

export default handler;
