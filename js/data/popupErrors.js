import TabManager from '../services/TabManager.js';
import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ApiClient } from '../core/http/ApiClient.js';

/**
 * Cổng truy cập dữ liệu lỗi cho popup: API server và cache trong background.
 *
 * flattenErrors và sortErrors là hàm thuần nên test được; phần còn lại là I/O.
 */
export class ErrorManager {
    /**
     * Flatten a domain payload ({ path: [{ full_url, data }] }) into a flat error list.
     */
    static flattenErrors(domainData) {
        const allErrors = [];
        domainData?.path?.forEach((pathItem) => {
            if (Array.isArray(pathItem?.data)) {
                allErrors.push(...pathItem.data);
            }
        });
        return allErrors;
    }

    /**
     * Read the domain payload straight from the API server.
     */
    static async fetchErrorsFromApi(domainName) {
        const apiData = await ApiClient.get(ConfigurationManager.API.ENDPOINTS.GET_DOMAIN_DATA, {
            params: { domain: domainName },
        });
        return apiData?.data ?? null;
    }

    /**
     * Errors already cached in the background worker. Instant, may be stale.
     */
    static async loadCachedErrors() {
        const domainName = await TabManager.getCurrentTabDomain();
        if (!domainName) return [];

        const response = await TabManager.sendMessageToBackground({
            action: 'getErrors',
            domainName,
        });
        return this.flattenErrors(response);
    }

    /**
     * Always hit the server, refresh the background cache, and fall back to
     * that cache when the request fails.
     */
    static async loadFreshErrors() {
        const domainName = await TabManager.getCurrentTabDomain();
        if (!domainName) return [];

        try {
            const domainData = await this.fetchErrorsFromApi(domainName);
            if (!domainData) throw new Error('Empty API payload');

            await TabManager.sendMessageToBackground({
                action: ConfigurationManager.ACTIONS.SET_ERRORS,
                errors: domainData,
                domainName,
            });
            return this.flattenErrors(domainData);
        } catch (error) {
            console.error('Failed to fetch errors in popup, falling back to cache', error);
            return await this.loadCachedErrors();
        }
    }

    static async deleteError(errorId) {
        const currentTab = await TabManager.getCurrentTab();
        if (!currentTab || !currentTab[0]) return;

        const domainName = await TabManager.getCurrentTabDomain();
        return await TabManager.sendMessageToBackground({
            action: 'removeError',
            errorId,
            domainName,
        });
    }

    static async clearAllErrors() {
        const currentTab = await TabManager.getCurrentTab();
        if (!currentTab || !currentTab[0]) return;

        const domainName = await TabManager.getCurrentTabDomain();
        return await TabManager.sendMessageToBackground({
            action: 'clearAllErrors',
            domainName,
        });
    }

    static sortErrors(errors) {
        const statusOrder = { open: 1, resolved: 2, closed: 3 };
        return errors.sort((first, second) => {
            const statusDiff =
                statusOrder[first.status || 'open'] - statusOrder[second.status || 'open'];
            return statusDiff !== 0
                ? statusDiff
                : new Date(second.timestamp) - new Date(first.timestamp);
        });
    }
}
