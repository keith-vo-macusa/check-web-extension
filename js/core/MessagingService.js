/**
 * MessagingService - Abstraction layer for Chrome Messaging API
 * Provides reliable message passing between extension components
 * @module MessagingService
 */

import { ErrorLogger } from '../utils/ErrorLogger.js';

export class MessagingService {
    /**
     * Send message to background script
     * @param {Object} message - Message to send
     * @param {number} timeout - Timeout in milliseconds (default: 5000)
     * @returns {Promise<*>} Response from background script
     * @throws {Error} If messaging fails or times out
     */
    static async sendToBackground(message, timeout = 5000) {
        if (!chrome?.runtime?.sendMessage) {
            ErrorLogger.error('Chrome runtime messaging not available', {
                context: 'MessagingService.sendToBackground',
            });
            throw new Error('Chrome runtime messaging not available');
        }

        try {
            const response = await Promise.race([
                chrome.runtime.sendMessage(message),
                this._createTimeout(timeout),
            ]);

            return response;
        } catch (error) {
            if (error.message?.includes('Extension context invalidated')) {
                ErrorLogger.warn('Extension context invalidated', { message });
                throw new Error('Extension needs reload');
            }

            ErrorLogger.error('Failed to send message to background', { message, error });
            throw error;
        }
    }

    /**
     * Send message to content script in active tab
     * @param {Object} message - Message to send
     * @param {number} tabId - Optional tab ID (defaults to active tab)
     * @param {number} timeout - Timeout in milliseconds (default: 5000)
     * @returns {Promise<*>} Response from content script
     * @throws {Error} If messaging fails or content script not available
     */
    static async sendToContentScript(message, tabId = null, timeout = 5000) {
        if (!chrome?.tabs?.sendMessage) {
            ErrorLogger.error('Chrome tabs messaging not available', {
                context: 'MessagingService.sendToContentScript',
            });
            throw new Error('Chrome tabs messaging not available');
        }

        try {
            let targetTabId = tabId;

            if (!targetTabId) {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tabs || tabs.length === 0) {
                    throw new Error('No active tab found');
                }
                targetTabId = tabs[0].id;
            }

            const response = await Promise.race([
                chrome.tabs.sendMessage(targetTabId, message),
                this._createTimeout(timeout),
            ]);

            return response;
        } catch (error) {
            if (error.message?.includes('Receiving end does not exist')) {
                ErrorLogger.warn('Content script not available in tab', { message, tabId });
                throw new Error('Content script not available');
            }

            ErrorLogger.error('Failed to send message to content script', {
                message,
                tabId,
                error,
            });
            throw error;
        }
    }

    /**
     * Send message to all tabs
     * @param {Object} message - Message to send
     * @returns {Promise<Array>} Array of responses (successful ones)
     */
    static async broadcastToAllTabs(message) {
        if (!chrome?.tabs?.query) {
            ErrorLogger.error('Chrome tabs API not available', {
                context: 'MessagingService.broadcastToAllTabs',
            });
            return [];
        }

        try {
            const tabs = await chrome.tabs.query({});
            const promises = tabs.map((tab) =>
                chrome.tabs.sendMessage(tab.id, message).catch(() => null),
            );

            const results = await Promise.all(promises);
            return results.filter((result) => result !== null);
        } catch (error) {
            ErrorLogger.error('Failed to broadcast message to tabs', { message, error });
            return [];
        }
    }

    /**
     * Create a message listener
     * @param {Function} handler - Handler function (message, sender, sendResponse) => void
     * @returns {Function} Cleanup function to remove listener
     */
    static addListener(handler) {
        if (!chrome?.runtime?.onMessage) {
            ErrorLogger.error('Chrome runtime messaging not available', {
                context: 'MessagingService.addListener',
            });
            return () => {};
        }

        const wrappedHandler = (message, sender, sendResponse) => {
            try {
                const result = handler(message, sender, sendResponse);

                // If handler returns a promise, wait for it
                if (result instanceof Promise) {
                    result
                        .then((response) => sendResponse(response))
                        .catch((error) => {
                            ErrorLogger.error('Message handler error', { message, error });
                            sendResponse({ error: error.message });
                        });
                    return true; // Keep channel open for async response
                }

                return result;
            } catch (error) {
                ErrorLogger.error('Message handler threw error', { message, error });
                sendResponse({ error: error.message });
                return false;
            }
        };

        chrome.runtime.onMessage.addListener(wrappedHandler);

        // Return cleanup function
        return () => {
            chrome.runtime.onMessage.removeListener(wrappedHandler);
        };
    }

    /**
     * Create a timeout promise
     * @private
     * @param {number} ms - Timeout in milliseconds
     * @returns {Promise} Promise that rejects after timeout
     */
    static _createTimeout(ms) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Message timeout after ${ms}ms`)), ms);
        });
    }

    /**
     * Check if extension context is valid
     * @returns {boolean} True if context is valid
     */
    static isContextValid() {
        try {
            return chrome?.runtime?.id !== undefined;
        } catch {
            return false;
        }
    }
}
