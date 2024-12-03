import type {PlasmoCSConfig} from "plasmo";
import CInStandaloneWindowChallenge from "~component/xframe/challenge/c-in-standalone-window-challenge";
import {
    MESSAGE_ACTION_CHAT_PROVIDER_AUTH_SUCCESS,
    WINDOW_FOR_REMOVE_STORAGE_KEY
} from "~utils";
import {AiboxBot} from "~libs/chatbot/aibox";
import {Logger} from "~utils/logger";
import { Storage } from "@plasmohq/storage"

export const config: PlasmoCSConfig = {
    matches: ['https://chat.aibox365.cn/*--opaw*'],
    all_frames: true,
    run_at: 'document_start'
};
const APP_KEY_PREFIX =  "ChatPLUS_"; 
const STORAGE_ACCESS_TOKEN_KEY = APP_KEY_PREFIX + "Authorization";
const STORAGE_SESSION_ID_KEY = "ChatPLUS_SESSION_ID";
export default function AiboxInStandaloneAuthWindow() {
    console.log("AiboxInStandaloneAuthWindow component mounted");
    const targetSourceValidator = function () {
        Logger.log("AIBox auth validator start");
        const accessToken = localStorage.getItem(STORAGE_ACCESS_TOKEN_KEY);
        const sessionId = localStorage.getItem(STORAGE_SESSION_ID_KEY);
        const storage = new Storage();

        // 如果是首次加载登录页面，保存必要的参数
        if (location.pathname === '/login') {
            const authKey = new URLSearchParams(location.search).get(AiboxBot.AUTH_WINDOW_KEY);
            const windowKey = new URLSearchParams(location.search).get(WINDOW_FOR_REMOVE_STORAGE_KEY);
            
            
            if (authKey) {
                storage.set('temp_auth_key', authKey).then(() => {
                    Logger.log("Saved auth key:", authKey);
                });
            }
            if (windowKey) {
                storage.set('temp_window_key', windowKey).then(() => {
                    Logger.log("Saved window key:", windowKey);
                });
            }
        }
        
        const authed = !!accessToken && !!sessionId;
        
        if(authed) {
            AiboxBot.setAccessToken(accessToken);
            AiboxBot.setSessionId(sessionId);

            // 从 sessionStorage 获取保存的参数
            /*
            const aiboxAuthKey = sessionStorage.getItem('temp_auth_key');
            
            
            Logger.log("Retrieved saved keys:", { aiboxAuthKey });
            
            if (aiboxAuthKey) {
                void chrome.runtime.sendMessage(chrome.runtime.id, {
                    action: MESSAGE_ACTION_CHAT_PROVIDER_AUTH_SUCCESS,
                    authKey: aiboxAuthKey
                });
                // 用完后清除
                sessionStorage.removeItem('temp_auth_key');
            }
            */
           // 改成这个
            storage.get('temp_auth_key').then(aiboxAuthKey => {
                Logger.log("Retrieved saved keys:", { aiboxAuthKey });
                
                if (aiboxAuthKey) {
                    void chrome.runtime.sendMessage(chrome.runtime.id, {
                        action: MESSAGE_ACTION_CHAT_PROVIDER_AUTH_SUCCESS,
                        authKey: aiboxAuthKey
                    });
                    // 将 sessionStorage.removeItem 改成 storage.remove
                    storage.remove('temp_auth_key').then(() => {
                        Logger.log("Removed temp auth key。");
                    });
                }
            });
        }

        return authed;
    };
    console.log("AiboxInStandaloneAuthWindow rendering");
    return <div>
        <CInStandaloneWindowChallenge checkInterval={1500} verifySuccessValidator={targetSourceValidator}/>
    </div>;
}
