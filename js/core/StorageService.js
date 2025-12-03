/**
 * StorageService - Abstraction layer for Chrome Storage API
 * Provides type-safe, promise-based storage operations with error handling
 * @module StorageService
 */

import { ErrorLogger } from '../utils/ErrorLogger.js';

export class StorageService {
    /**
     * Get items from chrome.storage.local
     * @param {string|string[]|Object} keys - Keys to retrieve
     * @returns {Promise<Object>} Retrieved data
     * @throws {Error} If chrome.storage is not available
     */
    static async get(keys) {
        if (!chrome?.storage?.local) {
            ErrorLogger.error('Chrome storage API not available', {
                context: 'StorageService.get',
            });
            throw new Error('Chrome storage API not available');
        }

        try {
            const result = await chrome.storage.local.get(keys);
            return result;
        } catch (error) {
            ErrorLogger.error('Failed to get storage data', { keys, error });
            throw error;
        }
    }

    /**
     * Set items in chrome.storage.local
     * @param {Object} items - Items to store
     * @returns {Promise<void>}
     * @throws {Error} If chrome.storage is not available
     */
    static async set(items) {
        if (!chrome?.storage?.local) {
            ErrorLogger.error('Chrome storage API not available', {
                context: 'StorageService.set',
            });
            throw new Error('Chrome storage API not available');
        }

        try {
            await chrome.storage.local.set(items);
            ErrorLogger.debug('Storage data set successfully', { keys: Object.keys(items) });
        } catch (error) {
            ErrorLogger.error('Failed to set storage data', { items, error });
            throw error;
        }
    }

    /**
     * Remove items from chrome.storage.local
     * @param {string|string[]} keys - Keys to remove
     * @returns {Promise<void>}
     * @throws {Error} If chrome.storage is not available
     */
    static async remove(keys) {
        if (!chrome?.storage?.local) {
            ErrorLogger.error('Chrome storage API not available', {
                context: 'StorageService.remove',
            });
            throw new Error('Chrome storage API not available');
        }

        try {
            await chrome.storage.local.remove(keys);
            ErrorLogger.debug('Storage data removed successfully', { keys });
        } catch (error) {
            ErrorLogger.error('Failed to remove storage data', { keys, error });
            throw error;
        }
    }

    /**
     * Clear all items from chrome.storage.local
     * @returns {Promise<void>}
     * @throws {Error} If chrome.storage is not available
     */
    static async clear() {
        if (!chrome?.storage?.local) {
            ErrorLogger.error('Chrome storage API not available', {
                context: 'StorageService.clear',
            });
            throw new Error('Chrome storage API not available');
        }

        try {
            await chrome.storage.local.clear();
            ErrorLogger.debug('Storage cleared successfully');
        } catch (error) {
            ErrorLogger.error('Failed to clear storage', { error });
            throw error;
        }
    }

    /**
     * Get a single item with default value if not found
     * @param {string} key - Key to retrieve
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {Promise<*>} Retrieved value or default
     */
    static async getSafe(key, defaultValue = null) {
        try {
            const result = await this.get(key);
            return result[key] !== undefined ? result[key] : defaultValue;
        } catch (error) {
            ErrorLogger.warn('Failed to get storage data, returning default', {
                key,
                defaultValue,
                error,
            });
            return defaultValue;
        }
    }

    /**
     * Check if a key exists in storage
     * @param {string} key - Key to check
     * @returns {Promise<boolean>} True if key exists
     */
    static async has(key) {
        try {
            const result = await this.get(key);
            return result[key] !== undefined;
        } catch (error) {
            ErrorLogger.warn('Failed to check storage key existence', { key, error });
            return false;
        }
    }
}
