import { TabsService } from '../core/TabsService.js';
import { MessagingService } from '../core/MessagingService.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';

export default class TabManager {
    /**
     * Return active tab wrapped as array for compatibility with existing callers.
     */
    static async getCurrentTab() {
        const activeTab = await TabsService.getActiveTab();
        return activeTab ? [activeTab] : [];
    }

    /**
     * Send message to active tab content script.
     */
    static async sendMessage(message) {
        try {
            return await MessagingService.sendToContentScript(message);
        } catch (error) {
            ErrorLogger.warn('Failed to send message to content script', {
                message,
                error,
            });
            return null;
        }
    }

    /**
     * Send message to background context.
     */
    static async sendMessageToBackground(message) {
        try {
            return await MessagingService.sendToBackground(message);
        } catch (error) {
            throw (
                ErrorLogger.error('Failed to send message to background', { message, error }),
                error
            );
        }
    }

    /**
     * Get current tab URL.
     */
    static async getCurrentTabUrl() {
        return await TabsService.getCurrentUrl();
    }

    /**
     * Get current tab domain.
     */
    static async getCurrentTabDomain() {
        return await TabsService.getCurrentDomain();
    }

    /**
     * Get current active tab id.
     */
    static async getCurrentTabId() {
        const activeTab = await TabsService.getActiveTab();
        return activeTab?.id || null;
    }

    /**
     * Get current active tab title.
     */
    static async getCurrentTabTitle() {
        const activeTab = await TabsService.getActiveTab();
        return activeTab?.title || null;
    }

    /**
     * Create a new tab.
     */
    static async createTab(url) {
        return await TabsService.createTab(url);
    }

    /**
     * Update tab by id.
     */
    static async updateTab(tabId, updateInfo) {
        return await TabsService.updateTab(tabId, updateInfo);
    }

    /**
     * Reload tab by id.
     */
    static async reloadTab(tabId) {
        return await TabsService.reloadTab(tabId);
    }

    /**
     * Close tab by id.
     */
    static async closeTab(tabId) {
        return await TabsService.closeTab(tabId);
    }

    /**
     * Get tab details by id.
     */
    static async getTabById(tabId) {
        return await TabsService.getTab(tabId);
    }

    /**
     * Reload currently active tab.
     */
    static async reloadCurrentTab() {
        const activeTab = await TabsService.getActiveTab();
        return !!activeTab && (await TabsService.reloadTab(activeTab.id));
    }

    /**
     * Close currently active tab.
     */
    static async closeCurrentTab() {
        const activeTab = await TabsService.getActiveTab();
        return !!activeTab && (await TabsService.closeTab(activeTab.id));
    }
}
