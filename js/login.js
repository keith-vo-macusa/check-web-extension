import { StorageService } from './core/StorageService.js';
import { ConfigurationManager } from './config/ConfigurationManager.js';
import { ValidationService } from './utils/ValidationService.js';
import { ErrorLogger } from './utils/ErrorLogger.js';
import { TabsService } from './core/TabsService.js';
import AuthManager from './auth.js';

class LoginManager {
    constructor() {
        this.init();
    }

    /**
     * Initialize page events and initial auth check.
     */
    init() {
        this.bindEvents();
        this.checkAuthStatus();
    }

    /**
     * Wire login form and password toggle events.
     */
    bindEvents() {
        const form = document.getElementById('loginForm');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const togglePasswordButton = document.getElementById('togglePassword');

        if (!(form && emailInput && passwordInput)) {
            ErrorLogger.error('Login form elements not found');
            return;
        }

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            this.handleLogin();
        });

        emailInput.focus();

        passwordInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') this.handleLogin();
        });

        if (!togglePasswordButton) return;
        togglePasswordButton.addEventListener('click', () => {
            const nextInputType = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = nextInputType;
            const eyeIcon = togglePasswordButton.querySelector('.eye-icon i');

            if (!eyeIcon) return;
            if (nextInputType === 'password') {
                eyeIcon.classList.remove('fa-eye');
                eyeIcon.classList.add('fa-eye-slash');
            } else {
                eyeIcon.classList.remove('fa-eye-slash');
                eyeIcon.classList.add('fa-eye');
            }
        });
    }

    /**
     * Redirect to main popup when user is already authenticated.
     */
    async checkAuthStatus() {
        try {
            (await AuthManager.isAuthenticated()) && this.redirectToMain();
        } catch (error) {
            ErrorLogger.error('Error checking auth status', { error });
        }
    }

    /**
     * Validate form and request login API.
     */
    async handleLogin() {
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        if (!emailInput || !passwordInput) return;

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!ValidationService.isValidEmail(email)) {
            this.showError('Email không hợp lệ');
            return;
        }

        if (!ValidationService.isNonEmptyString(password, 1)) {
            this.showError('Vui lòng nhập mật khẩu');
            return;
        }

        this.showLoading(true);
        this.hideMessages();
        try {
            const loginApiUrl =
                ConfigurationManager.API.BASE_URL + ConfigurationManager.API.ENDPOINTS.LOGIN;
            const response = await fetch(loginApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const responseData = await response.json();

            if (responseData.success) {
                this.showSuccess(responseData.message || 'Đăng nhập thành công');
                await this.saveAuthState(responseData.data);
                this.redirectToMain();
                await TabsService.reloadTab();
                window.close();
            } else {
                this.showError(responseData.message || 'Đăng nhập thất bại');
            }
        } catch (error) {
            ErrorLogger.error('Login error', { error });
            this.showError('Có lỗi xảy ra, vui lòng thử lại');
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Persist authenticated user information in extension storage.
     */
    async saveAuthState(authData) {
        try {
            const userInfo = {
                id: authData.id,
                name: authData.name,
                email: authData.email || null,
                accessToken: authData.token || authData.accessToken || null,
                roles: authData.roles || [],
                permissions: authData.permissions || [],
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
            throw (ErrorLogger.error('Error saving auth state', { error }), error);
        }
    }

    /**
     * Redirect to the main popup page.
     */
    redirectToMain() {
        window.location.href = 'popup.html';
    }

    /**
     * Toggle loading state on login form.
     */
    showLoading(isLoading) {
        const loadingElement = document.getElementById('loading');
        const loginButton = document.getElementById('loginBtn');

        if (loadingElement) loadingElement.style.display = isLoading ? 'block' : 'none';
        if (loginButton) {
            loginButton.disabled = isLoading;
            loginButton.textContent = isLoading ? 'Đang xác thực...' : 'Đăng nhập';
        }
    }

    /**
     * Show error message and hide success state.
     */
    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        const successElement = document.getElementById('successMessage');

        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }

        if (successElement) successElement.style.display = 'none';
    }

    /**
     * Show success message and hide error state.
     */
    showSuccess(message) {
        const errorElement = document.getElementById('errorMessage');
        const successElement = document.getElementById('successMessage');

        if (successElement) {
            successElement.textContent = message;
            successElement.style.display = 'block';
        }

        if (errorElement) errorElement.style.display = 'none';
    }

    /**
     * Hide both error and success messages.
     */
    hideMessages() {
        const errorElement = document.getElementById('errorMessage');
        const successElement = document.getElementById('successMessage');
        if (errorElement) errorElement.style.display = 'none';
        if (successElement) successElement.style.display = 'none';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new LoginManager();
    });
} else {
    new LoginManager();
}

export default LoginManager;
