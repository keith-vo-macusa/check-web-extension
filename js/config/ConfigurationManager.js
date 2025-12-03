/**
 * ConfigurationManager - Centralized configuration management
 * Provides access to application constants and configuration
 * @module ConfigurationManager
 */

export class ConfigurationManager {
    /**
     * Breakpoint types for responsive design
     */
    static BREAKPOINTS = {
        ALL: 'all',
        DESKTOP: 'desktop',
        TABLET: 'tablet',
        MOBILE: 'mobile',
    };

    /**
     * Breakpoint thresholds in pixels
     */
    static BREAKPOINT_THRESHOLDS = {
        DESKTOP_MIN: 1024,
        TABLET_MIN: 768,
        TABLET_MAX: 1023,
        MOBILE_MAX: 767,
    };

    /**
     * Error status types
     */
    static ERROR_STATUS = {
        OPEN: 'open',
        RESOLVED: 'resolved',
        CLOSED: 'closed',
    };

    /**
     * Error types
     */
    static ERROR_TYPES = {
        BORDER: 'border',
        RECT: 'rect',
    };

    /**
     * Notification types
     */
    static NOTIFICATION_TYPES = {
        BUG_FOUND: 'bug_found',
        BUG_FIXED: 'bug_fixed',
    };

    /**
     * User-facing messages
     */
    static MESSAGES = {
        bug_found: 'Bạn có chắc muốn gửi thông báo lỗi không?',
        bug_fixed: 'Bạn có chắc muốn gửi thông báo đã sửa tất cả lỗi không?',
        remove_error: 'Bạn có chắc muốn xóa lỗi này không?',
        remove_all_errors: 'Bạn có chắc muốn xóa tất cả lỗi không?',
        change_status_error: 'Bạn có chắc muốn thay đổi trạng thái của lỗi này không?',
        loading: 'Đang xử lý...',
        extension_disconnected: 'Extension mất kết nối với web hiện tại',
        please_reload: 'Vui lòng reload lại trang',
        content_script_unavailable: 'Content script không khả dụng',
        login_required: 'Vui lòng đăng nhập để tiếp tục',
    };

    /**
     * API configuration
     */
    static API = {
        BASE_URL: 'https://wpm.macusaone.com/',
        ENDPOINTS: {
            LOGIN: 'api/loginForExt',
            SEND_NOTIFICATION: 'api/v1/websites/check-wise/ext/notification',
            GET_DOMAIN_DATA: 'api/v1/websites/check-wise/ext/',
            SET_DOMAIN_DATA: 'api/v1/websites/check-wise/ext/',
        },
        TIMEOUT: 10000, // 10 seconds
    };

    /**
     * Update checker configuration
     */
    static UPDATE_CONFIG = {
        VERSION_CHECK_URL:
            'https://raw.githubusercontent.com/keith-vo-macusa/check-web-extension/main/manifest.json',
        CHECK_INTERVAL_MINUTES: 1,
        RELEASE_URL: 'https://github.com/keith-vo-macusa/check-web-extension/releases/latest',
    };

    /**
     * Action message types for inter-component communication
     */
    static ACTIONS = {
        ACTIVATE: 'activate',
        DEACTIVATE: 'deactivate',
        GET_STATE: 'getState',
        SHOW_ALL_ERRORS: 'showAllErrors',
        HIDE_ALL_ERRORS: 'hideAllErrors',
        HIGHLIGHT_ERROR: 'highlightError',
        CLEAR_ALL_ERRORS: 'clearAllErrors',
        REMOVE_ERROR: 'removeError',
        CHECK_FIXED: 'checkFixed',
        DRAW_OPEN_ERRORS: 'drawOpenErrors',
        DRAW_RESOLVED_ERRORS: 'drawResolvedErrors',
        ERROR_ADDED: 'errorAdded',
        ERROR_DELETED: 'errorDeleted',
        SET_ERRORS_IN_CONTENT: 'setErrorsInContent',
        GET_ERRORS: 'getErrors',
        SET_ERRORS: 'setErrors',
        SET_UNAUTHORIZED: 'setUnauthorized',
        CHECK_AUTHORIZED: 'checkAuthorized',
        REMOVE_UNAUTHORIZED: 'removeUnauthorized',
        DOM_IS_READY: 'domIsReady',
        CHECK_FOR_UPDATES: 'checkForUpdates',
        OPEN_OR_RESIZE_ERROR_WINDOW: 'openOrResizeErrorWindow',
    };

    /**
     * Admin configuration
     */
    static ADMIN = {
        ROLE: 'SITE_CHECK_ADMIN',
    };

    /**
     * UI Configuration
     */
    static UI = {
        COMMENT_MAX_LENGTH: 500,
        DRAG_THRESHOLD_PX: 5,
        MIN_RECT_SIZE_PX: 10,
        SCROLL_DELAY_MS: 300,
        HIGHLIGHT_DURATION_MS: 4000,
        ANIMATION_TIMEOUT_MS: 500,
        RANGE_BREAKPOINT_PX: 20,
        DESKTOP_BREAKPOINT_PX: 1140,
        ERROR_CONTAINER_ID: 'testing-error-container',
    };

    /**
     * Window decoration sizes for different platforms
     */
    static WINDOW_DECORATIONS = {
        win32: { titleBar: 32, borderHorizontal: 16, borderVertical: 8 },
        darwin: { titleBar: 28, borderHorizontal: 0, borderVertical: 0 },
        linux: { titleBar: 35, borderHorizontal: 8, borderVertical: 8 },
    };

    /**
     * Storage keys
     */
    static STORAGE_KEYS = {
        USER_INFO: 'userInfo',
        IS_AUTHENTICATED: 'isAuthenticated',
        ERRORS_VISIBLE: 'errorsVisible',
        RESOLVED_ERRORS_VISIBLE: 'resolvedErrorsVisible',
        DRAW_OPEN_ERRORS: 'drawOpenErrors',
        DRAW_RESOLVED_ERRORS: 'drawResolvedErrors',
        ERROR_WINDOW_ID: 'errorWindowId',
        UPDATE_AVAILABLE: 'updateAvailable',
        LATEST_VERSION: 'latestVersion',
        UPDATE_URL: 'updateUrl',
        FEEDBACK: 'feedback',
        ERROR_LOGS: 'errorLogs',
    };

    /**
     * CSS class names
     */
    static CSS_CLASSES = {
        SELECTION_MODE: 'testing-selection-mode',
        HIGHLIGHT: 'testing-highlight',
        ERROR_BORDER: 'testing-error-border',
        ERROR_HIGHLIGHT: 'testing-error-highlight',
        DRAG_OVERLAY: 'testing-drag-overlay',
        MODAL_BACKDROP: 'testing-modal-backdrop',
        COMMENT_MODAL: 'testing-comment-modal',
        SHOW_ERROR: 'show-error',
        DRAW_OPEN_ERRORS: 'draw-open-errors',
        DRAW_RESOLVED_ERRORS: 'draw-resolved-errors',
        IS_POPUP: 'ext-is-popup',
    };

    /**
     * Get full API endpoint URL
     * @param {string} endpoint - Endpoint name from API.ENDPOINTS
     * @returns {string} Full URL
     */
    static getApiUrl(endpoint) {
        const endpointPath = this.API.ENDPOINTS[endpoint];
        if (!endpointPath) {
            throw new Error(`Unknown API endpoint: ${endpoint}`);
        }
        return this.API.BASE_URL + endpointPath;
    }

    /**
     * Get breakpoint type from width
     * @param {number} width - Window width in pixels
     * @returns {string} Breakpoint type
     */
    static getBreakpointType(width) {
        if (width >= this.BREAKPOINT_THRESHOLDS.DESKTOP_MIN) {
            return this.BREAKPOINTS.DESKTOP;
        }
        if (width >= this.BREAKPOINT_THRESHOLDS.TABLET_MIN) {
            return this.BREAKPOINTS.TABLET;
        }
        return this.BREAKPOINTS.MOBILE;
    }

    /**
     * Get current extension version
     * @returns {string} Version string
     */
    static getCurrentVersion() {
        return chrome?.runtime?.getManifest()?.version || '0.0.0';
    }

    /**
     * Get default storage values
     * @returns {Object} Default storage object
     */
    static getDefaultStorage() {
        return {
            [this.STORAGE_KEYS.UPDATE_AVAILABLE]: false,
            [this.STORAGE_KEYS.LATEST_VERSION]: this.getCurrentVersion(),
            [this.STORAGE_KEYS.UPDATE_URL]: this.UPDATE_CONFIG.RELEASE_URL,
        };
    }

    /**
     * Check if user is admin
     * @param {Object} userInfo - User info
     * @returns {boolean} True if admin
     */
    static isAdmin(userInfo) {
        return userInfo.roles.some((role) => role.name === this.ADMIN.ROLE);
    }
}
