export default class TabManager {
    static async getCurrentTab() {
        return await chrome.tabs.query({
            active: true,
            currentWindow: true
        });
    }

    static async sendMessage(message) {
        try {
            const tabs = await this.getCurrentTab();
            if (tabs && tabs[0]) {
                return await chrome.tabs.sendMessage(tabs[0].id, message);
            }
        } catch (error) {
            // Content script not available - this is normal for special pages
            console.log('Cannot send message to content script:', error.message);
            return null;
        }
    }

    static async sendMessageToBackground(message) {
        return await chrome.runtime.sendMessage(message);
    }

    static async getCurrentTabUrl() {
        const tabs = await this.getCurrentTab();
        return tabs[0].url;
    }

    static async getCurrentTabDomain() {
        const url = await this.getCurrentTabUrl();
        return new URL(url).hostname;
    }

    static async getCurrentTabId() {
        const tabs = await this.getCurrentTab();
        return tabs[0].id;
    }

    static async getCurrentTabTitle() {
        const tabs = await this.getCurrentTab();
        return tabs[0].title;
    }

    static async createTab(url) {
        return await chrome.tabs.create({
            url: url,
        });
    }

    static async updateTab(tabId, updateInfo) {
        return await chrome.tabs.update(tabId, updateInfo);
    }

    static async reloadTab(tabId) {
        return await chrome.tabs.reload(tabId);
    }

    static async closeTab(tabId) {
        return await chrome.tabs.remove(tabId);
    }

    static async getTabById(tabId) {
        return await chrome.tabs.get(tabId);
    }
    
    static async reloadCurrentTab() {
        const tabs = await this.getCurrentTab();
        return await chrome.tabs.reload(tabs[0].id);
    }

    static async closeCurrentTab() {
        const tabs = await this.getCurrentTab();
        return await chrome.tabs.remove(tabs[0].id);
    }
}