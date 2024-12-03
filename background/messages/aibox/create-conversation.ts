import type {PlasmoMessaging} from "@plasmohq/messaging";
import {ChatError, ErrorCode} from "~utils/errors";
import {AiboxBot} from "~libs/chatbot/aibox";
import {Logger} from "~utils/logger";
import { generateUUID } from "~utils/uuid";

// 扩展连接类型，添加 responseCallback
const wsConnections: Map<string, {
    ws: WebSocket;
    heartbeatTimer: NodeJS.Timeout;
    responseCallback: ((data: any) => void) | null;
}> = new Map();

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
    const { type } = req.body;
    
    if (type === 'create') {
        let { conversationId, roleId, modelId } = req.body;
        Logger.log("[Stream] Create handler started:", { conversationId, roleId, modelId });

        if (!conversationId || !wsConnections.has(conversationId)) {
            conversationId = generateUUID();
            Logger.log("[Stream] Generated new conversationId:", conversationId);
        } else {
            Logger.log("[Stream] Reusing existing conversationId:", conversationId);
            const existingConnection = wsConnections.get(conversationId);
            if (existingConnection && existingConnection.ws.readyState === WebSocket.OPEN) {
                return res.send([null, { conversationId }]);
            }
            wsConnections.delete(conversationId);
        }

        const sessionId = await AiboxBot.getSessionId();
        const userToken = await AiboxBot.getAccessToken();
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
            
            wsConnections.set(conversationId, {
                ws,
                heartbeatTimer,
                responseCallback: null
            });

            res.send([null, { conversationId }]);
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
                        
                        const connection = wsConnections.get(conversationId);
                        if (connection && connection.responseCallback) {
                            connection.responseCallback(data);
                        }
                    } catch (e) {
                        Logger.error("[Stream] Parse message error:", e);
                        Logger.error("[Stream] Raw message:", reader.result);
                    }
                };
            }
        });

        ws.addEventListener('close', (event) => {
            Logger.log("[Stream] WebSocket closed with code:", event.code, "reason:", event.reason);
            clearTimeout(heartbeatTimer);
            wsConnections.delete(conversationId);
        });

        ws.addEventListener('error', (error) => {
            Logger.error("[Stream] WebSocket error:", error);
            Logger.error("[Stream] WebSocket state:", ws.readyState);
            clearTimeout(heartbeatTimer);
            wsConnections.delete(conversationId);
            res.send([new ChatError(ErrorCode.NETWORK_ERROR), null]);
            ws.close();
        });

    } else if (type === 'chat') {
        const { conversationId, prompt, modelId, roleId } = req.body;
        Logger.log("[Stream] Chat handler started:", { conversationId, prompt, modelId, roleId });
        Logger.log("[Stream] Chat handler - Request details:", {
            req: {
                body: req.body,
                name: req.name,
                sender: req.sender,  // 这可能会显示请求的来源
            }
        });
        const connection = wsConnections.get(conversationId);
        if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
            return res.send([new ChatError(ErrorCode.NETWORK_ERROR), null]);
        }
        
        // 设置这次聊天的回调函数
        // 设置回调处理 WebSocket 消息
        connection.responseCallback = (data) => {
            Logger.log("[Stream] Sending message via chrome.runtime:", data);
            
            // 通过 chrome.runtime 发送消息
            chrome.runtime.sendMessage({
                source: 'aibox-stream',
                conversationId,  // 添加会话ID用于识别
                data: {
                    type: data.type,
                    content: data.content
                }
            });

            // 如果是结束消息，清理回调
            if (data.type === 'end') {
                connection.responseCallback = null;
            }
        };
        /*
        connection.responseCallback = (data) => {
            switch (data.type) {
                case 'start':
                    Logger.log("[Stream] Chat started");
                    res.send([null, {type: 'start'}]);  // 修改格式
                    break;
                case 'end':
                    Logger.log("[Stream] Chat ended");
                    res.send([null, {type: 'content', content: data.content}]);  // 修改格式
                    connection.responseCallback = null;
                    break;
                default:
                    Logger.log("[Stream] Content received:", data.content);
                    res.send([null, {type: 'content', content: data.content}]);  // 修改格式
            }
        };
        */
        // 发送消息
        try {
            connection.ws.send(JSON.stringify({ 
                type: "chat", 
                content: prompt
            }));
        } catch (error) {
            Logger.error("[Stream] Send message error:", error);
            connection.responseCallback = null;
            res.send([new ChatError(ErrorCode.NETWORK_ERROR), null]);
        }
    } else {
        Logger.error("[Stream] Invalid request type:", type);
        res.send([new ChatError(ErrorCode.UNKNOWN_ERROR), null]);
    }
};

export default handler;
export { wsConnections };
