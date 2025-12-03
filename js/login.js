/**
 * LoginManager - Login functionality (Refactored)
 * Modern ES6+, no jQuery, uses fetch API
 * @module LoginManager
 */

import { StorageService } from './core/StorageService.js';
import { ConfigurationManager } from './config/ConfigurationManager.js';
import { ValidationService } from './utils/ValidationService.js';
import { ErrorLogger } from './utils/ErrorLogger.js';
import { TabsService } from './core/TabsService.js';
import AuthManager from './auth.js';

class LoginManager {
    /**
     * Constructor
     */
    constructor() {
        this.init();
    }

    /**
     * Initialize login manager
     */
    init() {
        this.bindEvents();
        this.checkAuthStatus();
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        const form = document.getElementById('loginForm');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const togglePassword = document.getElementById('togglePassword');

        if (!form || !emailInput || !passwordInput) {
            ErrorLogger.error('Login form elements not found');
            return;
        }

        // Form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Auto-focus email field
        emailInput.focus();

        // Enter key on password
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleLogin();
            }
        });

        // Password visibility toggle
        if (togglePassword) {
            togglePassword.addEventListener('click', () => {
                const type = passwordInput.type === 'password' ? 'text' : 'password';
                passwordInput.type = type;

                const icon = togglePassword.querySelector('.eye-icon i');
                if (icon) {
                    if (type === 'password') {
                        icon.classList.remove('fa-eye');
                        icon.classList.add('fa-eye-slash');
                    } else {
                        icon.classList.remove('fa-eye-slash');
                        icon.classList.add('fa-eye');
                    }
                }
            });
        }
    }

    /**
     * Check authentication status
     */
    async checkAuthStatus() {
        try {
            const isAuth = await AuthManager.isAuthenticated();

            if (isAuth) {
                this.redirectToMain();
            }
        } catch (error) {
            ErrorLogger.error('Error checking auth status', { error });
        }
    }

    /**
     * Handle login
     */
    async handleLogin() {
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');

        if (!emailInput || !passwordInput) {
            return;
        }

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        // Validate input
        if (!ValidationService.isValidEmail(email)) {
            this.showError('Email không hợp lệ');
            return;
        }

        if (!ValidationService.isNonEmptyString(password, 1)) {
            this.showError('Vui lòng nhập mật khẩu');
            return;
        }

        // Show loading
        this.showLoading(true);
        this.hideMessages();

        try {
            const loginUrl =
                ConfigurationManager.API.BASE_URL + ConfigurationManager.API.ENDPOINTS.LOGIN;

            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(result.message || 'Đăng nhập thành công');
                await this.saveAuthState(result.data);
                this.redirectToMain();

                // Refresh current tab
                await TabsService.reloadTab();
                window.close();
            } else {
                this.showError(result.message || 'Đăng nhập thất bại');
            }
        } catch (error) {
            ErrorLogger.error('Login error', { error });
            this.showError('Có lỗi xảy ra, vui lòng thử lại');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Save authentication state
     * @param {Object} data - User data from API
     */
    async saveAuthState(data) {
        try {
            const userInfo = {
                id: data.id,
                name: data.name,
                email: data.email || null,
                accessToken: data.accessToken || null,
                loginTime: new Date().toISOString(),
            };

            await StorageService.set({
                [ConfigurationManager.STORAGE_KEYS.IS_AUTHENTICATED]: true,
                [ConfigurationManager.STORAGE_KEYS.USER_INFO]: userInfo,
            });

            ErrorLogger.info('Auth state saved', { userId: userInfo.id });
        } catch (error) {
            ErrorLogger.error('Error saving auth state', { error });
            throw error;
        }
    }

    /**
     * Redirect to main popup
     */
    redirectToMain() {
        window.location.href = 'popup.html';
    }

    /**
     * Show loading state
     * @param {boolean} show - Whether to show loading
     */
    showLoading(show) {
        const loading = document.getElementById('loading');
        const loginBtn = document.getElementById('loginBtn');

        if (loading) {
            loading.style.display = show ? 'block' : 'none';
        }

        if (loginBtn) {
            loginBtn.disabled = show;
            loginBtn.textContent = show ? 'Đang xác thực...' : 'Đăng nhập';
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        const errorEl = document.getElementById('errorMessage');
        const successEl = document.getElementById('successMessage');

        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }

        if (successEl) {
            successEl.style.display = 'none';
        }
    }

    /**
     * Show success message
     * @param {string} message - Success message
     */
    showSuccess(message) {
        const errorEl = document.getElementById('errorMessage');
        const successEl = document.getElementById('successMessage');

        if (successEl) {
            successEl.textContent = message;
            successEl.style.display = 'block';
        }

        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }

    /**
     * Hide all messages
     */
    hideMessages() {
        const errorEl = document.getElementById('errorMessage');
        const successEl = document.getElementById('successMessage');

        if (errorEl) {
            errorEl.style.display = 'none';
        }

        if (successEl) {
            successEl.style.display = 'none';
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new LoginManager();
    });
} else {
    new LoginManager();
}

export default LoginManager;
