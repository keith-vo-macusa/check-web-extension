/**
 * TabsService - Abstraction layer for Chrome Tabs API
 * Provides tab management functionality with error handling
 * @module TabsService
 */

import { ErrorLogger } from '../utils/ErrorLogger.js';

export class TabsService {
    /**
     * Get the currently active tab
     * @returns {Promise<chrome.tabs.Tab|null>} Active tab or null
     */
    static async getActiveTab() {
        if (!chrome?.tabs?.query) {
            ErrorLogger.error('Chrome tabs API not available', {
                context: 'TabsService.getActiveTab',
            });
            return null;
        }

        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            return tabs && tabs.length > 0 ? tabs[0] : null;
        } catch (error) {
            ErrorLogger.error('Failed to get active tab', { error });
            return null;
        }
    }

    /**
     * Get tab by ID
     * @param {number} tabId - Tab ID
     * @returns {Promise<chrome.tabs.Tab|null>} Tab or null
     */
    static async getTab(tabId) {
        if (!chrome?.tabs?.get) {
            ErrorLogger.error('Chrome tabs API not available', {
                context: 'TabsService.getTab',
            });
            return null;
        }

        try {
            const tab = await chrome.tabs.get(tabId);
            return tab;
        } catch (error) {
            ErrorLogger.error('Failed to get tab', { tabId, error });
            return null;
        }
    }

    /**
     * Get all tabs matching query
     * @param {Object} queryInfo - Chrome tabs query info
     * @returns {Promise<chrome.tabs.Tab[]>} Array of tabs
     */
    static async queryTabs(queryInfo = {}) {
        if (!chrome?.tabs?.query) {
            ErrorLogger.error('Chrome tabs API not available', {
                context: 'TabsService.queryTabs',
            });
            return [];
        }

        try {
            const tabs = await chrome.tabs.query(queryInfo);
            return tabs || [];
        } catch (error) {
            ErrorLogger.error('Failed to query tabs', { queryInfo, error });
            return [];
        }
    }

    /**
     * Create a new tab
     * @param {string} url - URL to open
     * @param {Object} options - Additional tab options
     * @returns {Promise<chrome.tabs.Tab|null>} Created tab or null
     */
    static async createTab(url, options = {}) {
        if (!chrome?.tabs?.create) {
            ErrorLogger.error('Chrome tabs API not available', {
                context: 'TabsService.createTab',
            });
            return null;
        }

        try {
            const tab = await chrome.tabs.create({ url, ...options });
            ErrorLogger.debug('Tab created successfully', { url, tabId: tab.id });
            return tab;
        } catch (error) {
            ErrorLogger.error('Failed to create tab', { url, options, error });
            return null;
        }
    }

    /**
     * Update a tab
     * @param {number} tabId - Tab ID
     * @param {Object} updateInfo - Update properties
     * @returns {Promise<chrome.tabs.Tab|null>} Updated tab or null
     */
    static async updateTab(tabId, updateInfo) {
        if (!chrome?.tabs?.update) {
            ErrorLogger.error('Chrome tabs API not available', {
                context: 'TabsService.updateTab',
            });
            return null;
        }

        try {
            const tab = await chrome.tabs.update(tabId, updateInfo);
            ErrorLogger.debug('Tab updated successfully', { tabId, updateInfo });
            return tab;
        } catch (error) {
            ErrorLogger.error('Failed to update tab', { tabId, updateInfo, error });
            return null;
        }
    }

    /**
     * Reload a tab
     * @param {number} tabId - Tab ID (defaults to active tab)
     * @returns {Promise<boolean>} True if successful
     */
    static async reloadTab(tabId = null) {
        if (!chrome?.tabs?.reload) {
            ErrorLogger.error('Chrome tabs API not available', {
                context: 'TabsService.reloadTab',
            });
            return false;
        }

        try {
            let targetTabId = tabId;

            if (!targetTabId) {
                const activeTab = await this.getActiveTab();
                if (!activeTab) {
                    throw new Error('No active tab found');
                }
                targetTabId = activeTab.id;
            }

            await chrome.tabs.reload(targetTabId);
            ErrorLogger.debug('Tab reloaded successfully', { tabId: targetTabId });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to reload tab', { tabId, error });
            return false;
        }
    }

    /**
     * Close a tab
     * @param {number} tabId - Tab ID
     * @returns {Promise<boolean>} True if successful
     */
    static async closeTab(tabId) {
        if (!chrome?.tabs?.remove) {
            ErrorLogger.error('Chrome tabs API not available', {
                context: 'TabsService.closeTab',
            });
            return false;
        }

        try {
            await chrome.tabs.remove(tabId);
            ErrorLogger.debug('Tab closed successfully', { tabId });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to close tab', { tabId, error });
            return false;
        }
    }

    /**
     * Get current tab URL
     * @returns {Promise<string|null>} URL or null
     */
    static async getCurrentUrl() {
        const tab = await this.getActiveTab();
        return tab?.url || null;
    }

    /**
     * Get current tab domain
     * @returns {Promise<string|null>} Domain or null
     */
    static async getCurrentDomain() {
        const url = await this.getCurrentUrl();

        if (!url) {
            return null;
        }

        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (error) {
            ErrorLogger.error('Failed to parse URL for domain', { url, error });
            return null;
        }
    }

    /**
     * Execute script in tab
     * @param {number} tabId - Tab ID
     * @param {Object} scriptDetails - Script details (func, args, files, etc.)
     * @returns {Promise<Array|null>} Script results or null
     */
    static async executeScript(tabId, scriptDetails) {
        if (!chrome?.scripting?.executeScript) {
            ErrorLogger.error('Chrome scripting API not available', {
                context: 'TabsService.executeScript',
            });
            return null;
        }

        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId },
                ...scriptDetails,
            });
            return results;
        } catch (error) {
            ErrorLogger.error('Failed to execute script', { tabId, scriptDetails, error });
            return null;
        }
    }
}
