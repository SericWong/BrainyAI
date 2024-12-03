import {useEffect} from "react";
import {
    MESSAGE_ACTION_RELOAD_SITE_FRAME,
    WINDOW_FOR_REMOVE_STORAGE_KEY
} from "~utils";
import {sendToBackground} from "@plasmohq/messaging";
import {Storage} from "@plasmohq/storage";
import type {SiteName} from "~provider/sidepanel/SidePanelProvider";
import { Logger } from "~utils/logger";

export default function CInStandaloneWindowChallenge({verifySuccessValidator, siteName, checkInterval}: {
    verifySuccessValidator(): boolean,
    siteName?: SiteName,
    checkInterval?: number
}) {
    useEffect(() => {
        const storage = new Storage();
        const interval = setInterval(() => {
            if (verifySuccessValidator()) {
                clearInterval(interval);

                if(siteName) {
                    void chrome.runtime.sendMessage(chrome.runtime.id, {
                        action: MESSAGE_ACTION_RELOAD_SITE_FRAME,
                        siteName
                    });
                }

                // 从 chrome.storage.session 获取 windowKey
                storage.get('temp_window_key').then((windowKeyFromStorage) => {
                    Logger.log("Window key from storage:", windowKeyFromStorage);
                    
                    const windowKeyFromUrl = new URLSearchParams(location.search).get(WINDOW_FOR_REMOVE_STORAGE_KEY);
                    Logger.log("Window key from URL:", windowKeyFromUrl);
                    
                    const windowKey = windowKeyFromStorage || windowKeyFromUrl || '';
                    Logger.log("Final window key:", windowKey);

                    storage.get(windowKey).then((windowId: any) => {
                        if (windowId) {
                            void sendToBackground({
                                name: "close-window",
                                body: {
                                    windowId
                                },
                            });
                            // 使用 storage.remove 清理存储
                            void storage.remove('temp_window_key');
                        }
                    });
                });
            }
        }, checkInterval ?? 200);

        return () => {
            clearInterval(interval);
        };
    }, []);

    return <div></div>;
}
