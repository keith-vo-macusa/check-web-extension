// Auth.js - Quản lý authentication state cho Testing Assistant
class AuthManager {
    constructor() {
        this.init();
    }

    init() {
        this.checkAuthAndRedirect();
    }

    async checkAuthAndRedirect() {
        try {
            const result = await chrome.storage.local.get(['isAuthenticated', 'userInfo']);
            
            if (result.isAuthenticated && result.userInfo) {
                // User is authenticated, redirect to main popup
                window.location.href = 'popup.html';
            } else {
                // User is not authenticated, stay on login page
                console.log('User not authenticated');
            }
        } catch (error) {
            console.error('Error checking authentication:', error);
        }
    }

    static async isAuthenticated() {
        try {
            const result = await chrome.storage.local.get(['isAuthenticated', 'userInfo']);
            return result.isAuthenticated && result.userInfo;
        } catch (error) {
            console.error('Error checking authentication status:', error);
            return false;
        }
    }

    static async getUserInfo() {
        try {
            const result = await chrome.storage.local.get(['userInfo']);
            return result.userInfo || null;
        } catch (error) {
            console.error('Error getting user info:', error);
            return null;
        }
    }

    static async logout() {
        try {
            await chrome.storage.local.remove(['isAuthenticated', 'userInfo']);
            return true;
        } catch (error) {
            console.error('Error during logout:', error);
            return false;
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
} 