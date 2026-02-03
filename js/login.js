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

        emailInput.addEventListener('input', () => {
            this.updateEmailState(emailInput);
        });

        emailInput.addEventListener('blur', () => {
            this.updateEmailState(emailInput, { showEmptyAsInvalid: true });
        });

        passwordInput.addEventListener('input', () => {
            this.updatePasswordState(passwordInput);
        });

        passwordInput.addEventListener('blur', () => {
            this.updatePasswordState(passwordInput, { showEmptyAsInvalid: true });
        });

        // Password visibility toggle
        if (togglePassword) {
            togglePassword.addEventListener('click', () => {
                const type = passwordInput.type === 'password' ? 'text' : 'password';
                passwordInput.type = type;
                togglePassword.setAttribute(
                    'aria-label',
                    type === 'text' ? 'Hide password' : 'Show password'
                );

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
     * Apply validation state to an input element
     * @param {HTMLInputElement} input - Input element
     * @param {string|null} state - "valid", "invalid", or null to clear
     */
    setInputState(input, state) {
        if (!input) {
            return;
        }

        if (!state) {
            input.removeAttribute('data-state');
            return;
        }

        input.setAttribute('data-state', state);
    }

    /**
     * Update email input validation state
     * @param {HTMLInputElement} input - Email input
     * @param {Object} options - Validation options
     * @param {boolean} options.showEmptyAsInvalid - Mark empty as invalid
     * @returns {boolean} True if valid
     */
    updateEmailState(input, { showEmptyAsInvalid = false } = {}) {
        if (!input) {
            return false;
        }

        const value = input.value.trim();

        if (value.length === 0) {
            this.setInputState(input, showEmptyAsInvalid ? 'invalid' : null);
            return false;
        }

        const isValid = ValidationService.isValidEmail(value);
        this.setInputState(input, isValid ? 'valid' : 'invalid');
        return isValid;
    }

    /**
     * Update password input validation state
     * @param {HTMLInputElement} input - Password input
     * @param {Object} options - Validation options
     * @param {boolean} options.showEmptyAsInvalid - Mark empty as invalid
     * @returns {boolean} True if valid
     */
    updatePasswordState(input, { showEmptyAsInvalid = false } = {}) {
        if (!input) {
            return false;
        }

        const value = input.value.trim();

        if (value.length === 0) {
            this.setInputState(input, showEmptyAsInvalid ? 'invalid' : null);
            return false;
        }

        const isValid = ValidationService.isNonEmptyString(value, 1);
        this.setInputState(input, isValid ? 'valid' : 'invalid');
        return isValid;
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
        const emailIsValid = this.updateEmailState(emailInput, { showEmptyAsInvalid: true });
        const passwordIsValid = this.updatePasswordState(passwordInput, { showEmptyAsInvalid: true });

        if (!emailIsValid) {
            this.showError('Invalid email address');
            return;
        }

        if (!passwordIsValid) {
            this.showError('Please enter your password');
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
                this.showSuccess(result.message || 'Login successful');
                await this.saveAuthState(result.data);
                this.redirectToMain();

                // Refresh current tab
                await TabsService.reloadTab();
                window.close();
            } else {
                this.showError(result.message || 'Login failed');
            }
        } catch (error) {
            ErrorLogger.error('Login error', { error });
            this.showError('An error occurred, please try again');
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
                accessToken: data.token || data.accessToken || null,
                roles: data.roles || [],
                permissions: data.permissions || [],
                loginTime: new Date().toISOString(),
            };

            await StorageService.set({
                [ConfigurationManager.STORAGE_KEYS.IS_AUTHENTICATED]: true,
                [ConfigurationManager.STORAGE_KEYS.USER_INFO]: userInfo,
            });

            ErrorLogger.info('Auth state saved', {
                userId: userInfo.id,
                roles: userInfo.roles,
                permissions: userInfo.permissions,
            });
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
            loginBtn.textContent = show ? 'Verifying...' : 'Sign In';
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
            errorEl.setAttribute('aria-hidden', 'false');
        }

        if (successEl) {
            successEl.style.display = 'none';
            successEl.setAttribute('aria-hidden', 'true');
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
            successEl.setAttribute('aria-hidden', 'false');
        }

        if (errorEl) {
            errorEl.style.display = 'none';
            errorEl.setAttribute('aria-hidden', 'true');
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
            errorEl.setAttribute('aria-hidden', 'true');
        }

        if (successEl) {
            successEl.style.display = 'none';
            successEl.setAttribute('aria-hidden', 'true');
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
