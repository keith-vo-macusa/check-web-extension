import { StorageService } from '../core/StorageService.js';
import { TabsService } from '../core/TabsService.js';
import { MessagingService } from '../core/MessagingService.js';
import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import AuthManager from '../auth.js';

export class BadgeManager {
    /**
     * Create singleton badge manager and register tab listeners.
     */
    constructor() {
        if (BadgeManager.instance) return BadgeManager.instance;
        this.errors = new Map();
        this.unauthorizedDomains = new Set();
        this.setupListeners();
        BadgeManager.instance = this;
    }

    /**
     * Get singleton manager instance.
     */
    static getInstance() {
        if (!BadgeManager.instance) BadgeManager.instance = new BadgeManager();
        return BadgeManager.instance;
    }

    /**
     * Register listeners for tab lifecycle changes.
     */
    setupListeners() {
        chrome.tabs.onActivated.addListener(async ({ tabId }) => {
            await this.handleTabActivated(tabId);
        });
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
            await this.handleTabUpdated(tabId, changeInfo, tab);
        });
    }

    /**
     * Update badge when active tab changes.
     */
    async handleTabActivated(tabId) {
        try {
            const tab = await TabsService.getTab(tabId);
            if (!tab?.url) return;
            const domainName = new URL(tab.url).hostname;
            await this.updateBadge(domainName, tabId);
        } catch (error) {
            ErrorLogger.error('Failed to handle tab activated', { tabId, error });
            await this.clearBadge(tabId);
        }
    }

    /**
     * Fetch domain data during tab loading.
     */
    async handleTabUpdated(tabId, changeInfo, tab) {
        if (changeInfo.status === 'loading' && tab?.url)
            try {
                const domainName = new URL(tab.url).hostname;
                this.setUnauthorized(domainName);
                const userInfo = await StorageService.getSafe(ConfigurationManager.STORAGE_KEYS.USER_INFO);
                if (!userInfo?.email) return;
                await this.fetchDataFromAPI(domainName, tabId);
            } catch (error) {
                ErrorLogger.error('Failed to handle tab updated', { tabId, error });
            }
    }

    /**
     * Handle background messages related to error storage and badge state.
     */
    async handleMessage(message, sender, sendResponse) {
        const { action, domainName } = message;
        if (!domainName) return false;

        try {
            switch (action) {
                case ConfigurationManager.ACTIONS.SET_ERRORS:
                    await this.setErrors(domainName, message.errors);
                    await this.updateBadge(domainName);
                    sendResponse({ success: true });
                    break;
                case ConfigurationManager.ACTIONS.GET_ERRORS:
                    sendResponse(this.getErrors(domainName));
                    break;
                case ConfigurationManager.ACTIONS.SET_UNAUTHORIZED:
                    this.setUnauthorized(domainName);
                    sendResponse({ success: true });
                    break;
                case ConfigurationManager.ACTIONS.CHECK_AUTHORIZED:
                    sendResponse(this.isAuthorized(domainName));
                    break;
                case ConfigurationManager.ACTIONS.REMOVE_UNAUTHORIZED:
                    this.removeUnauthorized(domainName);
                    sendResponse({ success: true });
                    break;
                case ConfigurationManager.ACTIONS.DOM_IS_READY:
                    this.getErrors(domainName);
                    if (sender?.tab?.id) {
                        await MessagingService.sendToContentScript(
                            { action: ConfigurationManager.ACTIONS.SET_ERRORS_IN_CONTENT },
                            sender.tab.id,
                        );
                    }
                    sendResponse({ success: true });
                    break;
                case ConfigurationManager.ACTIONS.CHECK_FIXED:
                    sendResponse(await this.toggleErrorStatus(domainName, message.errorId));
                    break;
                case ConfigurationManager.ACTIONS.REMOVE_ERROR:
                    sendResponse(await this.removeError(domainName, message.errorId));
                    break;
                case ConfigurationManager.ACTIONS.CLEAR_ALL_ERRORS:
                    sendResponse(await this.clearAllErrorsForDomain(domainName));
                    break;
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            ErrorLogger.error('Failed to handle message', { action, domainName, error });
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }

    /**
     * Count OPEN status errors in all domain paths.
     */
    countOpenErrors(domainErrors) {
        return domainErrors?.path
            ? domainErrors.path.reduce(
                  (count, pathItem) =>
                      count +
                      (
                          pathItem.data?.filter(
                              (error) => error.status === ConfigurationManager.ERROR_STATUS.OPEN,
                          ) || []
                      ).length,
                  0,
              )
            : 0;
    }

    /**
     * Update badge count for provided domain/tab.
     */
    async updateBadge(domainName, tabId = null) {
        try {
            await chrome.action.setBadgeText({ text: '' });
            const userInfo = await StorageService.getSafe(ConfigurationManager.STORAGE_KEYS.USER_INFO);
            if (!userInfo?.email) return;

            let targetTabId = tabId;
            if (!targetTabId) {
                const activeTab = await TabsService.getActiveTab();
                if (!activeTab) return;
                targetTabId = activeTab.id;
                try {
                    if (new URL(activeTab.url).hostname !== domainName) return;
                } catch (error) {
                    ErrorLogger.warn('Failed to parse active tab URL', {
                        url: activeTab.url,
                        error,
                    });
                    return;
                }
            }

            const errorsData = this.getErrors(domainName);
            const openErrorsCount = this.countOpenErrors(errorsData);
            await chrome.action.setBadgeText({
                tabId: targetTabId,
                text: openErrorsCount > 0 ? openErrorsCount.toString() : '',
            });
            ErrorLogger.debug('Badge updated', {
                domain: domainName,
                count: openErrorsCount,
                tabId: targetTabId,
            });
        } catch (error) {
            ErrorLogger.error('Failed to update badge', { domain: domainName, tabId, error });
        }
    }

    /**
     * Clear badge text for a tab.
     */
    async clearBadge(tabId) {
        try {
            await chrome.action.setBadgeText({ text: '', tabId });
        } catch (error) {
            ErrorLogger.error('Failed to clear badge', { tabId, error });
        }
    }

    /**
     * Fetch error data for domain and sync local/cache/content-script state.
     */
    async fetchDataFromAPI(domainName, tabId) {
        const endpoint = `${ConfigurationManager.API.ENDPOINTS.GET_DOMAIN_DATA}?domain=${domainName}`;
        const url = ConfigurationManager.API.BASE_URL + endpoint;
        try {
            const accessToken = await AuthManager.getAccessToken();
            const headers = { 'Content-Type': 'application/json' };
            if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

            const response = await fetch(url, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
            });

            if (!response.ok)
                return void (response.status >= 400 && response.status < 500
                    ? ErrorLogger.warn('Client error fetching domain data', {
                          domain: domainName,
                          status: response.status,
                      })
                    : response.status >= 500 &&
                      ErrorLogger.error('Server error fetching domain data', {
                          domain: domainName,
                          status: response.status,
                      }));

            const responseData = await response.json();
            await this.setErrors(domainName, responseData.data);
            await this.updateBadge(domainName, tabId);
            this.removeUnauthorized(domainName);

            try {
                await MessagingService.sendToContentScript(
                    { action: ConfigurationManager.ACTIONS.SET_ERRORS_IN_CONTENT },
                    tabId,
                );
            } catch (error) {
                ErrorLogger.warn('Failed to notify content script', {
                    domain: domainName,
                    tabId,
                    error,
                });
            }

            ErrorLogger.info('Domain data fetched successfully', { domain: domainName });
        } catch (error) {
            if (error.name === 'AbortError') {
                ErrorLogger.error('API request timeout', { domain: domainName, error });
            } else {
                ErrorLogger.error('Failed to fetch domain data', { domain: domainName, error });
            }
        }
    }

    /**
     * Set cached errors for a domain.
     */
    async setErrors(domainName, errorsData) {
        this.errors.set(domainName, errorsData);
        ErrorLogger.debug('Errors set for domain', {
            domain: domainName,
            errorCount: errorsData?.path?.length || 0,
        });
    }

    /**
     * Get cached domain errors.
     */
    getErrors(domainName) {
        return this.errors.get(domainName) || { path: [] };
    }

    /**
     * Mark domain as unauthorized.
     */
    setUnauthorized(domainName) {
        this.unauthorizedDomains.add(domainName);
        ErrorLogger.debug('Domain marked as unauthorized', { domain: domainName });
    }

    /**
     * Remove domain unauthorized mark.
     */
    removeUnauthorized(domainName) {
        this.unauthorizedDomains.delete(domainName);
        ErrorLogger.debug('Domain removed from unauthorized list', { domain: domainName });
    }

    /**
     * Check whether domain is authorized.
     */
    isAuthorized(domainName) {
        return !this.unauthorizedDomains.has(domainName);
    }

    /**
     * Clear all cached errors.
     */
    clearAllErrors() {
        this.errors.clear();
        ErrorLogger.info('All errors cleared');
    }

    /**
     * Clear unauthorized domain cache.
     */
    clearAllUnauthorized() {
        this.unauthorizedDomains.clear();
        ErrorLogger.info('All unauthorized domains cleared');
    }

    /**
     * Remove one error from domain payload and persist.
     */
    async removeError(domainName, errorId) {
        try {
            const errorsData = this.getErrors(domainName);
            if (!errorsData?.path) return { success: false, message: 'Domain data not found' };

            let found = false;
            for (const pathItem of errorsData.path) {
                const index = pathItem.data?.findIndex((error) => error.id === errorId);
                if (index !== -1) {
                    pathItem.data.splice(index, 1);
                    found = true;
                    if (pathItem.data.length === 0) {
                        const pathIndex = errorsData.path.indexOf(pathItem);
                        errorsData.path.splice(pathIndex, 1);
                    }
                    ErrorLogger.info('Error removed', { errorId });
                    break;
                }
            }

            if (!found) return { success: false, message: 'Error not found' };
            if (await this.updateErrorsToAPI(domainName, errorsData)) {
                await this.setErrors(domainName, errorsData);
                this.notifyContentScript();
                await this.updateBadge(domainName);
                return { success: true };
            }
            return { success: false, message: 'Failed to update API' };
        } catch (error) {
            ErrorLogger.error('Failed to remove error', { domain: domainName, errorId, error });
            return { success: false, message: error.message };
        }
    }

    /**
     * Clear all domain errors and persist.
     */
    async clearAllErrorsForDomain(domainName) {
        try {
            const emptyErrors = { path: [] };
            if (await this.updateErrorsToAPI(domainName, emptyErrors)) {
                await this.setErrors(domainName, emptyErrors);
                this.notifyContentScript();
                await this.updateBadge(domainName);
                ErrorLogger.info('All errors cleared for domain', { domain: domainName });
                return { success: true };
            }
            return { success: false, message: 'Failed to update API' };
        } catch (error) {
            ErrorLogger.error('Failed to clear all errors', { domain: domainName, error });
            return { success: false, message: error.message };
        }
    }

    /**
     * Notify active content script to refresh rendered errors.
     */
    async notifyContentScript() {
        try {
            const activeTab = await TabsService.getActiveTab();
            activeTab?.id &&
                (await MessagingService.sendToContentScript(
                    { action: ConfigurationManager.ACTIONS.SET_ERRORS_IN_CONTENT },
                    activeTab.id,
                ).catch(() => {}));
        } catch (error) {
            ErrorLogger.error('Failed to notify content script', { error });
        }
    }

    /**
     * Toggle error status OPEN <-> RESOLVED and persist.
     */
    async toggleErrorStatus(domainName, errorId) {
        try {
            const errorsData = this.getErrors(domainName);
            if (!errorsData?.path) return { success: false, message: 'Domain data not found' };

            let found = false;
            for (const pathItem of errorsData.path) {
                const targetError = pathItem.data?.find((error) => error.id === errorId);
                if (targetError) {
                    const oldStatus = targetError.status;
                    targetError.status =
                        targetError.status === ConfigurationManager.ERROR_STATUS.OPEN
                            ? ConfigurationManager.ERROR_STATUS.RESOLVED
                            : ConfigurationManager.ERROR_STATUS.OPEN;
                    found = true;
                    ErrorLogger.info('Error status toggled', {
                        errorId,
                        oldStatus,
                        newStatus: targetError.status,
                    });
                    break;
                }
            }

            if (!found) return { success: false, message: 'Error not found' };
            if (await this.updateErrorsToAPI(domainName, errorsData)) {
                await this.setErrors(domainName, errorsData);
                this.notifyContentScript();
                await this.updateBadge(domainName);
                return { success: true };
            }
            return { success: false, message: 'Failed to update API' };
        } catch (error) {
            ErrorLogger.error('Failed to toggle error status', {
                domain: domainName,
                errorId,
                error,
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * Persist domain errors to backend API.
     */
    async updateErrorsToAPI(domainName, errorsData) {
        try {
            const accessToken = await AuthManager.getAccessToken();
            const headers = { 'Content-Type': 'application/json' };
            if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

            const response = await fetch(
                ConfigurationManager.API.BASE_URL +
                    ConfigurationManager.API.ENDPOINTS.SET_DOMAIN_DATA,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ domain: domainName, path: errorsData.path }),
                    signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
                },
            );

            if (!response.ok) throw new Error(`API returned ${response.status}`);
            ErrorLogger.info('Errors updated to API successfully', { domain: domainName });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to update errors to API', { domain: domainName, error });
            return false;
        }
    }
}

export async function handleBadgeAndErrors(message, sender, sendResponse) {
    const badgeManager = BadgeManager.getInstance();
    return await badgeManager.handleMessage(message, sender, sendResponse);
}
