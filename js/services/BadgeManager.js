/**
 * BadgeManager - Manages extension badge and error state (Refactored)
 * Singleton pattern with encapsulated state - no global mutable variables
 * @module BadgeManager
 */

import { StorageService } from '../core/StorageService.js';
import { TabsService } from '../core/TabsService.js';
import { MessagingService } from '../core/MessagingService.js';
import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import AuthManager from '../auth.js';

/**
 * BadgeManager class - manages badges and domain errors
 */
export class BadgeManager {
    /**
     * Private constructor - use getInstance()
     */
    constructor() {
        if (BadgeManager.instance) {
            return BadgeManager.instance;
        }

        this.errors = new Map(); // domain -> error data
        this.unauthorizedDomains = new Set(); // domains that are not authorized

        this.setupListeners();
        BadgeManager.instance = this;
    }

    /**
     * Get singleton instance
     * @returns {BadgeManager} Singleton instance
     */
    static getInstance() {
        if (!BadgeManager.instance) {
            BadgeManager.instance = new BadgeManager();
        }
        return BadgeManager.instance;
    }

    /**
     * Setup Chrome API listeners
     * @private
     */
    setupListeners() {
        // Listen for tab activation
        chrome.tabs.onActivated.addListener(async ({ tabId }) => {
            await this.handleTabActivated(tabId);
        });

        // Listen for tab updates
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
            await this.handleTabUpdated(tabId, changeInfo, tab);
        });
    }

    /**
     * Handle tab activated event
     * @private
     * @param {number} tabId - Tab ID
     */
    async handleTabActivated(tabId) {
        try {
            const tab = await TabsService.getTab(tabId);
            if (!tab?.url) {
                return;
            }

            const domain = new URL(tab.url).hostname;
            await this.updateBadge(domain, tabId);
        } catch (error) {
            ErrorLogger.error('Failed to handle tab activated', { tabId, error });
            await this.clearBadge(tabId);
        }
    }

    /**
     * Handle tab updated event
     * @private
     * @param {number} tabId - Tab ID
     * @param {Object} changeInfo - Change info
     * @param {Object} tab - Tab object
     */
    async handleTabUpdated(tabId, changeInfo, tab) {
        if (changeInfo.status !== 'loading' || !tab?.url) {
            return;
        }

        try {
            const domain = new URL(tab.url).hostname;
            this.setUnauthorized(domain);

            // Check if user is logged in
            const userInfo = await StorageService.getSafe(
                ConfigurationManager.STORAGE_KEYS.USER_INFO,
            );

            if (!userInfo?.email) {
                return;
            }

            // Fetch data from API
            await this.fetchDataFromAPI(domain, tabId);
        } catch (error) {
            ErrorLogger.error('Failed to handle tab updated', { tabId, error });
        }
    }

    /**
     * Handle incoming messages
     * @param {Object} message - Message object
     * @param {Object} sender - Sender info
     * @param {Function} sendResponse - Response callback
     * @returns {boolean} True if async response
     */
    async handleMessage(message, sender, sendResponse) {
        const { action, domainName } = message;

        if (!domainName) {
            return false;
        }

        try {
            switch (action) {
                case ConfigurationManager.ACTIONS.SET_ERRORS:
                    await this.setErrors(domainName, message.errors);
                    await this.updateBadge(domainName);
                    sendResponse({ success: true });
                    break;

                case ConfigurationManager.ACTIONS.GET_ERRORS:
                    const errors = this.getErrors(domainName);
                    sendResponse(errors);
                    break;

                case ConfigurationManager.ACTIONS.SET_UNAUTHORIZED:
                    this.setUnauthorized(domainName);
                    sendResponse({ success: true });
                    break;

                case ConfigurationManager.ACTIONS.CHECK_AUTHORIZED:
                    const isAuthorized = this.isAuthorized(domainName);
                    sendResponse(isAuthorized);
                    break;

                case ConfigurationManager.ACTIONS.REMOVE_UNAUTHORIZED:
                    this.removeUnauthorized(domainName);
                    sendResponse({ success: true });
                    break;

                case ConfigurationManager.ACTIONS.DOM_IS_READY:
                    const domainErrors = this.getErrors(domainName);
                    if (sender?.tab?.id) {
                        await MessagingService.sendToContentScript(
                            { action: ConfigurationManager.ACTIONS.SET_ERRORS_IN_CONTENT },
                            sender.tab.id,
                        );
                    }
                    sendResponse({ success: true });
                    break;

                case ConfigurationManager.ACTIONS.CHECK_FIXED:
                    const toggleResult = await this.toggleErrorStatus(domainName, message.errorId);
                    sendResponse(toggleResult);
                    break;

                case ConfigurationManager.ACTIONS.REMOVE_ERROR:
                    const removeResult = await this.removeError(domainName, message.errorId);
                    sendResponse(removeResult);
                    break;

                case ConfigurationManager.ACTIONS.CLEAR_ALL_ERRORS:
                    const clearResult = await this.clearAllErrorsForDomain(domainName);
                    sendResponse(clearResult);
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            ErrorLogger.error('Failed to handle message', { action, domainName, error });
            sendResponse({ success: false, error: error.message });
        }

        return true; // Keep channel open for async response
    }

    /**
     * Count open errors for a domain
     * @private
     * @param {Object} domainData - Domain error data
     * @returns {number} Count of open errors
     */
    countOpenErrors(domainData) {
        if (!domainData?.path) {
            return 0;
        }

        return domainData.path.reduce((total, path) => {
            const openErrors =
                path.data?.filter(
                    (error) => error.status === ConfigurationManager.ERROR_STATUS.OPEN,
                ) || [];
            return total + openErrors.length;
        }, 0);
    }

    /**
     * Update badge for a domain
     * @param {string} domain - Domain name
     * @param {number} tabId - Optional specific tab ID
     */
    async updateBadge(domain, tabId = null) {
        try {
            // Clear badge first
            await chrome.action.setBadgeText({ text: '' });

            // Check if user is logged in
            const userInfo = await StorageService.getSafe(
                ConfigurationManager.STORAGE_KEYS.USER_INFO,
            );

            if (!userInfo?.email) {
                return;
            }

            // Get target tab
            let targetTabId = tabId;
            if (!targetTabId) {
                const activeTab = await TabsService.getActiveTab();
                if (!activeTab) {
                    return;
                }
                targetTabId = activeTab.id;

                // Check if active tab domain matches
                try {
                    const activeDomain = new URL(activeTab.url).hostname;
                    if (activeDomain !== domain) {
                        return;
                    }
                } catch (error) {
                    ErrorLogger.warn('Failed to parse active tab URL', {
                        url: activeTab.url,
                        error,
                    });
                    return;
                }
            }

            // Get error count
            const domainErrors = this.getErrors(domain);
            const count = this.countOpenErrors(domainErrors);

            // Update badge
            await chrome.action.setBadgeText({
                tabId: targetTabId,
                text: count > 0 ? count.toString() : '',
            });

            ErrorLogger.debug('Badge updated', { domain, count, tabId: targetTabId });
        } catch (error) {
            ErrorLogger.error('Failed to update badge', { domain, tabId, error });
        }
    }

    /**
     * Clear badge for a tab
     * @param {number} tabId - Tab ID
     */
    async clearBadge(tabId) {
        try {
            await chrome.action.setBadgeText({ text: '', tabId });
        } catch (error) {
            ErrorLogger.error('Failed to clear badge', { tabId, error });
        }
    }

    /**
     * Fetch error data from API
     * @private
     * @param {string} domain - Domain name
     * @param {number} tabId - Tab ID
     */
    async fetchDataFromAPI(domain, tabId) {
        const endpoint = `${ConfigurationManager.API.ENDPOINTS.GET_DOMAIN_DATA}?domain=${domain}`;
        const url = ConfigurationManager.API.BASE_URL + endpoint;

        try {
            // Get access token for authentication
            const accessToken = await AuthManager.getAccessToken();
            const headers = {
                'Content-Type': 'application/json',
            };

            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
            });

            if (!response.ok) {
                if (response.status >= 400 && response.status < 500) {
                    ErrorLogger.warn('Client error fetching domain data', {
                        domain,
                        status: response.status,
                    });
                } else if (response.status >= 500) {
                    ErrorLogger.error('Server error fetching domain data', {
                        domain,
                        status: response.status,
                    });
                }
                return;
            }

            const result = await response.json();

            // Update errors
            await this.setErrors(domain, result.data);

            // Update badge
            await this.updateBadge(domain, tabId);

            // Mark as authorized
            this.removeUnauthorized(domain);

            // Notify content script
            try {
                await MessagingService.sendToContentScript(
                    { action: ConfigurationManager.ACTIONS.SET_ERRORS_IN_CONTENT },
                    tabId,
                );
            } catch (error) {
                ErrorLogger.warn('Failed to notify content script', { domain, tabId, error });
            }

            ErrorLogger.info('Domain data fetched successfully', { domain });
        } catch (error) {
            if (error.name === 'AbortError') {
                ErrorLogger.error('API request timeout', { domain, error });
            } else {
                ErrorLogger.error('Failed to fetch domain data', { domain, error });
            }
        }
    }

    /**
     * Set errors for a domain
     * @param {string} domain - Domain name
     * @param {Object} errorData - Error data
     */
    async setErrors(domain, errorData) {
        this.errors.set(domain, errorData);
        ErrorLogger.debug('Errors set for domain', {
            domain,
            errorCount: errorData?.path?.length || 0,
        });
    }

    /**
     * Get errors for a domain
     * @param {string} domain - Domain name
     * @returns {Object} Error data
     */
    getErrors(domain) {
        return this.errors.get(domain) || { path: [] };
    }

    /**
     * Mark domain as unauthorized
     * @param {string} domain - Domain name
     */
    setUnauthorized(domain) {
        this.unauthorizedDomains.add(domain);
        ErrorLogger.debug('Domain marked as unauthorized', { domain });
    }

    /**
     * Remove domain from unauthorized list
     * @param {string} domain - Domain name
     */
    removeUnauthorized(domain) {
        this.unauthorizedDomains.delete(domain);
        ErrorLogger.debug('Domain removed from unauthorized list', { domain });
    }

    /**
     * Check if domain is authorized
     * @param {string} domain - Domain name
     * @returns {boolean} True if authorized
     */
    isAuthorized(domain) {
        return !this.unauthorizedDomains.has(domain);
    }

    /**
     * Clear all errors
     */
    clearAllErrors() {
        this.errors.clear();
        ErrorLogger.info('All errors cleared');
    }

    /**
     * Clear all unauthorized domains
     */
    clearAllUnauthorized() {
        this.unauthorizedDomains.clear();
        ErrorLogger.info('All unauthorized domains cleared');
    }

    /**
     * Remove single error
     * @param {string} domain - Domain name
     * @param {string} errorId - Error ID
     * @returns {Promise<Object>} Result object with success status
     */
    async removeError(domain, errorId) {
        try {
            const domainData = this.getErrors(domain);

            if (!domainData?.path) {
                return { success: false, message: 'Domain data not found' };
            }

            // Find and remove error
            let found = false;

            for (const pathItem of domainData.path) {
                const errorIndex = pathItem.data?.findIndex((e) => e.id === errorId);
                if (errorIndex !== -1) {
                    pathItem.data.splice(errorIndex, 1);
                    found = true;

                    // Remove empty path entries
                    if (pathItem.data.length === 0) {
                        const pathIndex = domainData.path.indexOf(pathItem);
                        domainData.path.splice(pathIndex, 1);
                    }

                    ErrorLogger.info('Error removed', { errorId });
                    break;
                }
            }

            if (!found) {
                return { success: false, message: 'Error not found' };
            }

            // Update API
            const updateSuccess = await this.updateErrorsToAPI(domain, domainData);

            if (updateSuccess) {
                // Update local cache
                await this.setErrors(domain, domainData);

                // Notify content script to refresh UI
                this.notifyContentScript();

                // Update badge
                await this.updateBadge(domain);

                return { success: true };
            }

            return { success: false, message: 'Failed to update API' };
        } catch (error) {
            ErrorLogger.error('Failed to remove error', { domain, errorId, error });
            return { success: false, message: error.message };
        }
    }

    /**
     * Clear all errors for a domain
     * @param {string} domain - Domain name
     * @returns {Promise<Object>} Result object with success status
     */
    async clearAllErrorsForDomain(domain) {
        try {
            const emptyData = { path: [] };

            // Update API
            const updateSuccess = await this.updateErrorsToAPI(domain, emptyData);

            if (updateSuccess) {
                // Update local cache
                await this.setErrors(domain, emptyData);

                // Notify content script to refresh UI
                this.notifyContentScript();

                // Update badge
                await this.updateBadge(domain);

                ErrorLogger.info('All errors cleared for domain', { domain });
                return { success: true };
            }

            return { success: false, message: 'Failed to update API' };
        } catch (error) {
            ErrorLogger.error('Failed to clear all errors', { domain, error });
            return { success: false, message: error.message };
        }
    }

    /**
     * Notify content script to refresh errors
     * @private
     */
    async notifyContentScript() {
        try {
            const activeTab = await TabsService.getActiveTab();
            if (activeTab?.id) {
                await MessagingService.sendToContentScript(
                    { action: ConfigurationManager.ACTIONS.SET_ERRORS_IN_CONTENT },
                    activeTab.id,
                ).catch(() => {
                    // Content script may not be available, ignore
                });
            }
        } catch (error) {
            ErrorLogger.error('Failed to notify content script', { error });
        }
    }

    /**
     * Toggle error status (open <-> resolved)
     * @param {string} domain - Domain name
     * @param {string} errorId - Error ID
     * @returns {Promise<Object>} Result object with success status
     */
    async toggleErrorStatus(domain, errorId) {
        try {
            const domainData = this.getErrors(domain);

            if (!domainData?.path) {
                return { success: false, message: 'Domain data not found' };
            }

            // Find and toggle error status
            let found = false;
            let updatedError = null;

            for (const pathItem of domainData.path) {
                const error = pathItem.data?.find((e) => e.id === errorId);
                if (error) {
                    const oldStatus = error.status;
                    error.status =
                        error.status === ConfigurationManager.ERROR_STATUS.OPEN
                            ? ConfigurationManager.ERROR_STATUS.RESOLVED
                            : ConfigurationManager.ERROR_STATUS.OPEN;
                    updatedError = error;
                    found = true;

                    ErrorLogger.info('Error status toggled', {
                        errorId,
                        oldStatus,
                        newStatus: error.status,
                    });
                    break;
                }
            }

            if (!found) {
                return { success: false, message: 'Error not found' };
            }

            // Update API
            const updateSuccess = await this.updateErrorsToAPI(domain, domainData);

            if (updateSuccess) {
                // Update local cache
                await this.setErrors(domain, domainData);

                // Notify content script to refresh UI
                this.notifyContentScript();

                // Update badge
                await this.updateBadge(domain);

                return { success: true };
            }

            return { success: false, message: 'Failed to update API' };
        } catch (error) {
            ErrorLogger.error('Failed to toggle error status', { domain, errorId, error });
            return { success: false, message: error.message };
        }
    }

    /**
     * Update errors to API
     * @private
     * @param {string} domain - Domain name
     * @param {Object} errorsData - Errors data structure
     * @returns {Promise<boolean>} True if successful
     */
    async updateErrorsToAPI(domain, errorsData) {
        try {
            const accessToken = await AuthManager.getAccessToken();
            const headers = {
                'Content-Type': 'application/json',
            };

            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }

            const response = await fetch(
                ConfigurationManager.API.BASE_URL +
                    ConfigurationManager.API.ENDPOINTS.SET_DOMAIN_DATA,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        domain: domain,
                        path: errorsData.path,
                    }),
                    signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
                },
            );

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            ErrorLogger.info('Errors updated to API successfully', { domain });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to update errors to API', { domain, error });
            return false;
        }
    }
}

/**
 * Export helper function for backward compatibility
 * @param {Object} message - Message object
 * @param {Object} sender - Sender info
 * @param {Function} sendResponse - Response callback
 * @returns {boolean} True if async response
 */
export async function handleBadgeAndErrors(message, sender, sendResponse) {
    const manager = BadgeManager.getInstance();
    return await manager.handleMessage(message, sender, sendResponse);
}
