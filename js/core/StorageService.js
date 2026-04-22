import { ErrorLogger } from '../utils/ErrorLogger.js';

export class StorageService {
    /**
     * Read one or many keys from local extension storage.
     */
    static async get(keys) {
        if (!chrome?.storage?.local)
            throw (
                ErrorLogger.error('Chrome storage API not available', {
                    context: 'StorageService.get',
                }),
                new Error('Chrome storage API not available')
            );

        try {
            return await chrome.storage.local.get(keys);
        } catch (error) {
            throw (ErrorLogger.error('Failed to get storage data', { keys, error }), error);
        }
    }

    /**
     * Persist key-value pairs to local extension storage.
     */
    static async set(items) {
        if (!chrome?.storage?.local)
            throw (
                ErrorLogger.error('Chrome storage API not available', {
                    context: 'StorageService.set',
                }),
                new Error('Chrome storage API not available')
            );

        try {
            await chrome.storage.local.set(items);
            ErrorLogger.debug('Storage data set successfully', { keys: Object.keys(items) });
        } catch (error) {
            throw (ErrorLogger.error('Failed to set storage data', { items, error }), error);
        }
    }

    /**
     * Remove one or many keys from local extension storage.
     */
    static async remove(keys) {
        if (!chrome?.storage?.local)
            throw (
                ErrorLogger.error('Chrome storage API not available', {
                    context: 'StorageService.remove',
                }),
                new Error('Chrome storage API not available')
            );

        try {
            await chrome.storage.local.remove(keys);
            ErrorLogger.debug('Storage data removed successfully', { keys });
        } catch (error) {
            throw (ErrorLogger.error('Failed to remove storage data', { keys, error }), error);
        }
    }

    /**
     * Clear all local extension storage data.
     */
    static async clear() {
        if (!chrome?.storage?.local)
            throw (
                ErrorLogger.error('Chrome storage API not available', {
                    context: 'StorageService.clear',
                }),
                new Error('Chrome storage API not available')
            );

        try {
            await chrome.storage.local.clear();
            ErrorLogger.debug('Storage cleared successfully');
        } catch (error) {
            throw (ErrorLogger.error('Failed to clear storage', { error }), error);
        }
    }

    /**
     * Read a single key and return a fallback value when access fails or key is missing.
     */
    static async getSafe(key, defaultValue = null) {
        try {
            const storedValues = await this.get(key);
            return storedValues[key] !== undefined ? storedValues[key] : defaultValue;
        } catch (error) {
            return (
                ErrorLogger.warn('Failed to get storage data, returning default', {
                    key,
                    defaultValue,
                    error,
                }),
                defaultValue
            );
        }
    }

    /**
     * Check whether a key exists in local storage.
     */
    static async has(key) {
        try {
            return (await this.get(key))[key] !== undefined;
        } catch (error) {
            return (
                ErrorLogger.warn('Failed to check storage key existence', { key, error }),
                false
            );
        }
    }
}
