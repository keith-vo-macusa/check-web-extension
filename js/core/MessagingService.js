import { ErrorLogger } from '../utils/ErrorLogger.js';

export class MessagingService {
    /**
     * Send a message to the extension background context with timeout protection.
     */
    static async sendToBackground(message, timeoutMs = 5000) {
        if (!chrome?.runtime?.sendMessage)
            throw (
                ErrorLogger.error('Chrome runtime messaging not available', {
                    context: 'MessagingService.sendToBackground',
                }),
                new Error('Chrome runtime messaging not available')
            );

        try {
            return await Promise.race([
                chrome.runtime.sendMessage(message),
                this._createTimeout(timeoutMs),
            ]);
        } catch (error) {
            if (error.message?.includes('Extension context invalidated'))
                throw (
                    ErrorLogger.warn('Extension context invalidated', { message }),
                    new Error('Extension needs reload')
                );

            throw (
                ErrorLogger.error('Failed to send message to background', { message, error }),
                error
            );
        }
    }

    /**
     * Send a message to a tab content script. Uses active tab when tabId is omitted.
     */
    static async sendToContentScript(message, tabId = null, timeoutMs = 5000) {
        if (!chrome?.tabs?.sendMessage)
            throw (
                ErrorLogger.error('Chrome tabs messaging not available', {
                    context: 'MessagingService.sendToContentScript',
                }),
                new Error('Chrome tabs messaging not available')
            );

        try {
            let targetTabId = tabId;
            if (!targetTabId) {
                const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!activeTabs || activeTabs.length === 0) throw new Error('No active tab found');
                targetTabId = activeTabs[0].id;
            }

            return await Promise.race([
                chrome.tabs.sendMessage(targetTabId, message),
                this._createTimeout(timeoutMs),
            ]);
        } catch (error) {
            if (error.message?.includes('Receiving end does not exist'))
                throw (
                    ErrorLogger.warn('Content script not available in tab', {
                        message,
                        tabId,
                    }),
                    new Error('Content script not available')
                );

            throw (
                ErrorLogger.error('Failed to send message to content script', {
                    message,
                    tabId,
                    error,
                }),
                error
            );
        }
    }

    /**
     * Broadcast a message to all tabs and return successful responses only.
     */
    static async broadcastToAllTabs(message) {
        if (!chrome?.tabs?.query)
            return (
                ErrorLogger.error('Chrome tabs API not available', {
                    context: 'MessagingService.broadcastToAllTabs',
                }),
                []
            );

        try {
            const sendPromises = (await chrome.tabs.query({})).map((tab) =>
                chrome.tabs.sendMessage(tab.id, message).catch(() => null),
            );

            return (await Promise.all(sendPromises)).filter((response) => response !== null);
        } catch (error) {
            return (
                ErrorLogger.error('Failed to broadcast message to tabs', { message, error }),
                []
            );
        }
    }

    /**
     * Register a runtime message listener and return a cleanup function.
     */
    static addListener(handler) {
        if (!chrome?.runtime?.onMessage)
            return (
                ErrorLogger.error('Chrome runtime messaging not available', {
                    context: 'MessagingService.addListener',
                }),
                () => {}
            );

        const wrappedListener = (message, sender, sendResponse) => {
            try {
                const result = handler(message, sender, sendResponse);
                return result instanceof Promise
                    ? (result
                          .then((response) => sendResponse(response))
                          .catch((error) => {
                              ErrorLogger.error('Message handler error', { message, error });
                              sendResponse({ error: error.message });
                          }),
                      !0)
                    : result;
            } catch (error) {
                return (
                    ErrorLogger.error('Message handler threw error', { message, error }),
                    sendResponse({ error: error.message }),
                    !1
                );
            }
        };

        return (
            chrome.runtime.onMessage.addListener(wrappedListener),
            () => {
                chrome.runtime.onMessage.removeListener(wrappedListener);
            }
        );
    }

    /**
     * Create a rejecting Promise that enforces a maximum message duration.
     */
    static _createTimeout(timeoutMs) {
        return new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error(`Message timeout after ${timeoutMs}ms`)), timeoutMs);
        });
    }

    /**
     * Check whether the extension runtime context is still available.
     */
    static isContextValid() {
        try {
            return chrome?.runtime?.id !== undefined;
        } catch {
            return false;
        }
    }
}
