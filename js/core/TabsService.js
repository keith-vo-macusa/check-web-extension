import { ErrorLogger } from '../utils/ErrorLogger.js';

export class TabsService {
    /**
     * Get the currently active tab in the current window.
     */
    static async getActiveTab() {
        if (!chrome?.tabs?.query)
            return (
                ErrorLogger.error('Chrome tabs API not available', {
                    context: 'TabsService.getActiveTab',
                }),
                null
            );

        try {
            const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            return activeTabs && activeTabs.length > 0 ? activeTabs[0] : null;
        } catch (error) {
            return (ErrorLogger.error('Failed to get active tab', { error }), null);
        }
    }

    /**
     * Get a tab by id.
     */
    static async getTab(tabId) {
        if (!chrome?.tabs?.get)
            return (
                ErrorLogger.error('Chrome tabs API not available', {
                    context: 'TabsService.getTab',
                }),
                null
            );

        try {
            return await chrome.tabs.get(tabId);
        } catch (error) {
            return (ErrorLogger.error('Failed to get tab', { tabId, error }), null);
        }
    }

    /**
     * Query tabs using Chrome query options.
     */
    static async queryTabs(queryInfo = {}) {
        if (!chrome?.tabs?.query)
            return (
                ErrorLogger.error('Chrome tabs API not available', {
                    context: 'TabsService.queryTabs',
                }),
                []
            );

        try {
            return (await chrome.tabs.query(queryInfo)) || [];
        } catch (error) {
            return (ErrorLogger.error('Failed to query tabs', { queryInfo, error }), []);
        }
    }

    /**
     * Create a new tab with a URL and optional tab options.
     */
    static async createTab(url, options = {}) {
        if (!chrome?.tabs?.create)
            return (
                ErrorLogger.error('Chrome tabs API not available', {
                    context: 'TabsService.createTab',
                }),
                null
            );

        try {
            const createdTab = await chrome.tabs.create({ url, ...options });
            return (
                ErrorLogger.debug('Tab created successfully', { url, tabId: createdTab.id }),
                createdTab
            );
        } catch (error) {
            return (
                ErrorLogger.error('Failed to create tab', { url, options, error }),
                null
            );
        }
    }

    /**
     * Update an existing tab.
     */
    static async updateTab(tabId, updateInfo) {
        if (!chrome?.tabs?.update)
            return (
                ErrorLogger.error('Chrome tabs API not available', {
                    context: 'TabsService.updateTab',
                }),
                null
            );

        try {
            const updatedTab = await chrome.tabs.update(tabId, updateInfo);
            return (
                ErrorLogger.debug('Tab updated successfully', { tabId, updateInfo }),
                updatedTab
            );
        } catch (error) {
            return (
                ErrorLogger.error('Failed to update tab', { tabId, updateInfo, error }),
                null
            );
        }
    }

    /**
     * Reload a specific tab, or the active tab when tabId is omitted.
     */
    static async reloadTab(tabId = null) {
        if (!chrome?.tabs?.reload)
            return (
                ErrorLogger.error('Chrome tabs API not available', {
                    context: 'TabsService.reloadTab',
                }),
                false
            );

        try {
            let targetTabId = tabId;
            if (!targetTabId) {
                const activeTab = await this.getActiveTab();
                if (!activeTab) throw new Error('No active tab found');
                targetTabId = activeTab.id;
            }

            await chrome.tabs.reload(targetTabId);
            ErrorLogger.debug('Tab reloaded successfully', { tabId: targetTabId });
            return true;
        } catch (error) {
            return (ErrorLogger.error('Failed to reload tab', { tabId, error }), false);
        }
    }

    /**
     * Close a tab by id.
     */
    static async closeTab(tabId) {
        if (!chrome?.tabs?.remove)
            return (
                ErrorLogger.error('Chrome tabs API not available', {
                    context: 'TabsService.closeTab',
                }),
                false
            );

        try {
            await chrome.tabs.remove(tabId);
            ErrorLogger.debug('Tab closed successfully', { tabId });
            return true;
        } catch (error) {
            return (ErrorLogger.error('Failed to close tab', { tabId, error }), false);
        }
    }

    /**
     * Return the URL of the active tab.
     */
    static async getCurrentUrl() {
        const activeTab = await this.getActiveTab();
        return activeTab?.url || null;
    }

    /**
     * Return the domain of the active tab URL.
     */
    static async getCurrentDomain() {
        const currentUrl = await this.getCurrentUrl();
        if (!currentUrl) return null;

        try {
            return new URL(currentUrl).hostname;
        } catch (error) {
            return (
                ErrorLogger.error('Failed to parse URL for domain', { url: currentUrl, error }),
                null
            );
        }
    }

    /**
     * Execute script details in the specified tab.
     */
    static async executeScript(tabId, scriptDetails) {
        if (!chrome?.scripting?.executeScript)
            return (
                ErrorLogger.error('Chrome scripting API not available', {
                    context: 'TabsService.executeScript',
                }),
                null
            );

        try {
            return await chrome.scripting.executeScript({ target: { tabId }, ...scriptDetails });
        } catch (error) {
            return (
                ErrorLogger.error('Failed to execute script', {
                    tabId,
                    scriptDetails,
                    error,
                }),
                null
            );
        }
    }
}
