import { StorageService } from './core/StorageService.js';
import { ConfigurationManager } from './config/ConfigurationManager.js';
import { ErrorLogger } from './utils/ErrorLogger.js';

class AuthManager {
    constructor() {
        this.init();
    }

    /**
     * Initialize auth flow for pages that require redirect.
     */
    init() {
        this.checkAuthAndRedirect();
    }

    /**
     * Redirect authenticated users to popup page.
     */
    async checkAuthAndRedirect() {
        try {
            if (await AuthManager.isAuthenticated()) {
                window.location.href = 'popup.html';
            } else {
                ErrorLogger.info('User not authenticated');
            }
        } catch (error) {
            ErrorLogger.error('Error checking authentication', { error });
        }
    }

    /**
     * Check whether user has valid auth state in storage.
     */
    static async isAuthenticated() {
        try {
            const authState = await StorageService.get([
                ConfigurationManager.STORAGE_KEYS.IS_AUTHENTICATED,
                ConfigurationManager.STORAGE_KEYS.USER_INFO,
            ]);
            return (
                authState[ConfigurationManager.STORAGE_KEYS.IS_AUTHENTICATED] &&
                authState[ConfigurationManager.STORAGE_KEYS.USER_INFO]
            );
        } catch (error) {
            return (ErrorLogger.error('Error checking authentication status', { error }), false);
        }
    }

    /**
     * Get current user info from storage.
     */
    static async getUserInfo() {
        try {
            return await StorageService.getSafe(ConfigurationManager.STORAGE_KEYS.USER_INFO);
        } catch (error) {
            return (ErrorLogger.error('Error getting user info', { error }), null);
        }
    }

    /**
     * Get current access token from stored user info.
     */
    static async getAccessToken() {
        try {
            const userInfo = await StorageService.getSafe(ConfigurationManager.STORAGE_KEYS.USER_INFO);
            return userInfo?.accessToken || null;
        } catch (error) {
            return (ErrorLogger.error('Error getting access token', { error }), null);
        }
    }

    /**
     * Clear auth state from extension storage.
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
            return (ErrorLogger.error('Error during logout', { error }), false);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = AuthManager;
export default AuthManager;
