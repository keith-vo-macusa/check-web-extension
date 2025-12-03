/**
 * TabManager - High-level tab operations (Refactored)
 * Uses TabsService for Chrome API calls
 * @module TabManager
 */

import { TabsService } from '../core/TabsService.js';
import { MessagingService } from '../core/MessagingService.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';

export default class TabManager {
    /**
     * Get current tab
     * @returns {Promise<chrome.tabs.Tab[]>} Array with current tab
     */
    static async getCurrentTab() {
        const tab = await TabsService.getActiveTab();
        return tab ? [tab] : [];
    }

    /**
     * Send message to content script in active tab
     * @param {Object} message - Message to send
     * @returns {Promise<*>} Response from content script
     */
    static async sendMessage(message) {
        try {
            return await MessagingService.sendToContentScript(message);
        } catch (error) {
            ErrorLogger.warn('Failed to send message to content script', { message, error });
            return null;
        }
    }

    /**
     * Send message to background script
     * @param {Object} message - Message to send
     * @returns {Promise<*>} Response from background
     */
    static async sendMessageToBackground(message) {
        try {
            return await MessagingService.sendToBackground(message);
        } catch (error) {
            ErrorLogger.error('Failed to send message to background', { message, error });
            throw error;
        }
    }

    /**
     * Get current tab URL
     * @returns {Promise<string|null>} Current URL
     */
    static async getCurrentTabUrl() {
        return await TabsService.getCurrentUrl();
    }

    /**
     * Get current tab domain
     * @returns {Promise<string|null>} Current domain
     */
    static async getCurrentTabDomain() {
        return await TabsService.getCurrentDomain();
    }

    /**
     * Get current tab ID
     * @returns {Promise<number|null>} Tab ID
     */
    static async getCurrentTabId() {
        const tab = await TabsService.getActiveTab();
        return tab?.id || null;
    }

    /**
     * Get current tab title
     * @returns {Promise<string|null>} Tab title
     */
    static async getCurrentTabTitle() {
        const tab = await TabsService.getActiveTab();
        return tab?.title || null;
    }

    /**
     * Create new tab
     * @param {string} url - URL to open
     * @returns {Promise<chrome.tabs.Tab|null>} Created tab
     */
    static async createTab(url) {
        return await TabsService.createTab(url);
    }

    /**
     * Update tab
     * @param {number} tabId - Tab ID
     * @param {Object} updateInfo - Update properties
     * @returns {Promise<chrome.tabs.Tab|null>} Updated tab
     */
    static async updateTab(tabId, updateInfo) {
        return await TabsService.updateTab(tabId, updateInfo);
    }

    /**
     * Reload tab
     * @param {number} tabId - Tab ID
     * @returns {Promise<boolean>} True if successful
     */
    static async reloadTab(tabId) {
        return await TabsService.reloadTab(tabId);
    }

    /**
     * Close tab
     * @param {number} tabId - Tab ID
     * @returns {Promise<boolean>} True if successful
     */
    static async closeTab(tabId) {
        return await TabsService.closeTab(tabId);
    }

    /**
     * Get tab by ID
     * @param {number} tabId - Tab ID
     * @returns {Promise<chrome.tabs.Tab|null>} Tab
     */
    static async getTabById(tabId) {
        return await TabsService.getTab(tabId);
    }

    /**
     * Reload current tab
     * @returns {Promise<boolean>} True if successful
     */
    static async reloadCurrentTab() {
        const tab = await TabsService.getActiveTab();
        if (!tab) {
            return false;
        }
        return await TabsService.reloadTab(tab.id);
    }

    /**
     * Close current tab
     * @returns {Promise<boolean>} True if successful
     */
    static async closeCurrentTab() {
        const tab = await TabsService.getActiveTab();
        if (!tab) {
            return false;
        }
        return await TabsService.closeTab(tab.id);
    }
}
