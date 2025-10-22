/**
 * AuthManager - Authentication management (Refactored)
 * Uses StorageService for storage operations
 * @module AuthManager
 */

import { StorageService } from './core/StorageService.js';
import { ConfigurationManager } from './config/ConfigurationManager.js';
import { ErrorLogger } from './utils/ErrorLogger.js';

class AuthManager {
    /**
     * Constructor - initializes redirect check
     */
    constructor() {
        this.init();
    }

    /**
     * Initialize authentication check
     */
    init() {
        this.checkAuthAndRedirect();
    }

    /**
     * Check authentication and redirect if needed
     */
    async checkAuthAndRedirect() {
        try {
            const isAuth = await AuthManager.isAuthenticated();

            if (isAuth) {
                // User is authenticated, redirect to main popup
                window.location.href = 'popup.html';
            } else {
                ErrorLogger.info('User not authenticated');
            }
        } catch (error) {
            ErrorLogger.error('Error checking authentication', { error });
        }
    }

    /**
     * Check if user is authenticated
     * @returns {Promise<boolean>} True if authenticated
     */
    static async isAuthenticated() {
        try {
            const result = await StorageService.get([
                ConfigurationManager.STORAGE_KEYS.IS_AUTHENTICATED,
                ConfigurationManager.STORAGE_KEYS.USER_INFO,
            ]);

            return (
                result[ConfigurationManager.STORAGE_KEYS.IS_AUTHENTICATED] &&
                result[ConfigurationManager.STORAGE_KEYS.USER_INFO]
            );
        } catch (error) {
            ErrorLogger.error('Error checking authentication status', { error });
            return false;
        }
    }

    /**
     * Get user info from storage
     * @returns {Promise<Object|null>} User info or null
     */
    static async getUserInfo() {
        try {
            const userInfo = await StorageService.getSafe(
                ConfigurationManager.STORAGE_KEYS.USER_INFO,
            );
            return userInfo;
        } catch (error) {
            ErrorLogger.error('Error getting user info', { error });
            return null;
        }
    }

    /**
     * Logout user
     * @returns {Promise<boolean>} True if successful
     */
    static async logout() {
        try {
            await StorageService.remove([
                ConfigurationManager.STORAGE_KEYS.IS_AUTHENTICATED,
                ConfigurationManager.STORAGE_KEYS.USER_INFO,
            ]);
            ErrorLogger.info('User logged out successfully');
            return true;
        } catch (error) {
            ErrorLogger.error('Error during logout', { error });
            return false;
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}

export default AuthManager;
