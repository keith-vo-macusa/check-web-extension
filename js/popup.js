/**
 * Website Testing Assistant - Popup Script
 * Manages the popup interface for the browser extension
 */

/**
 * Application Constants
 */
const ApplicationConstants = {
    BREAKPOINTS: {
        ALL: 'all',
        DESKTOP: 'desktop',
        TABLET: 'tablet',
        MOBILE: 'mobile',
    },

    NOTIFICATION_TYPES: {
        BUG_FOUND: 'bug_found',
        BUG_FIXED: 'bug_fixed',
    },

    NOTIFICATION_MESSAGES: {
        bug_found: 'Bạn có chắc muốn gửi thông báo lỗi không?',
        bug_fixed: 'Bạn có chắc muốn gửi thông báo đã sửa tất cả lỗi không?',
    },

    API_ENDPOINTS: {
        TELEGRAM_NOTIFICATION:
            'https://checkwise.macusaone.com/api_domain_data.php?action=send_telegram',
    },

    ADMIN_EMAIL: 'hana.web@macusaone.com',
};

/**
 * Browser API Compatibility Layer
 */
const BrowserAPIManager = {
    api: chrome,

    /**
     * Get browser storage data
     * @param {string|Array} keys - Storage keys to retrieve
     * @returns {Promise<Object>} Storage data
     */
    async getStorageData(keys) {
        return await this.api.storage.local.get(keys);
    },

    /**
     * Set browser storage data
     * @param {Object} data - Data to store
     * @returns {Promise<void>}
     */
    async setStorageData(data) {
        return await this.api.storage.local.set(data);
    },

    /**
     * Remove browser storage data
     * @param {string|Array} keys - Keys to remove
     * @returns {Promise<void>}
     */
    async removeStorageData(keys) {
        return await this.api.storage.local.remove(keys);
    },
};

/**
 * Application State Management
 * Manages the state of the popup interface
 */
class ApplicationStateManager {
    constructor() {
        this.currentState = {
            isActive: false,
            errorsVisible: true,
            resolvedErrorsVisible: false,
            selectedBreakpoint: ApplicationConstants.BREAKPOINTS.ALL,
            isRectMode: false,
            drawOpenErrors: false,
            drawResolvedErrors: false,
        };

        this.initializeState();
    }

    /**
     * Initialize default state
     */
    initializeState() {
        document.body.setAttribute('data-show-resolved', this.currentState.resolvedErrorsVisible);
    }

    /**
     * Update active state
     * @param {boolean} isActive - Active state
     */
    setActiveState(isActive) {
        this.currentState.isActive = isActive;
    }

    /**
     * Update errors visibility state
     * @param {boolean} isVisible - Visibility state
     */
    async setErrorsVisibility(isVisible) {
        this.currentState.errorsVisible = isVisible;
        await BrowserAPIManager.setStorageData({ errorsVisible: isVisible });
    }

    /**
     * Update selected breakpoint
     * @param {string} breakpoint - Breakpoint type
     */
    setSelectedBreakpoint(breakpoint) {
        this.currentState.selectedBreakpoint = breakpoint;
    }

    /**
     * Update resolved errors visibility
     * @param {boolean} isVisible - Visibility state
     */
    async setResolvedErrorsVisibility(isVisible) {
        this.currentState.resolvedErrorsVisible = isVisible;
        document.body.setAttribute('data-show-resolved', isVisible);
        await BrowserAPIManager.setStorageData({ resolvedErrorsVisible: isVisible });
    }

    /**
     * Update rectangle mode state
     * @param {boolean} isRectMode - Rectangle mode state
     */
    setRectModeState(isRectMode) {
        this.currentState.isRectMode = isRectMode;
    }

    /**
     * Update open errors drawing state
     * @param {boolean} shouldDraw - Drawing state
     */
    setDrawOpenErrorsState(shouldDraw) {
        this.currentState.drawOpenErrors = shouldDraw;
    }

    /**
     * Update resolved errors drawing state
     * @param {boolean} shouldDraw - Drawing state
     */
    setDrawResolvedErrorsState(shouldDraw) {
        this.currentState.drawResolvedErrors = shouldDraw;
    }

    /**
     * Get current state
     * @returns {Object} Current application state
     */
    getCurrentState() {
        return { ...this.currentState };
    }
}

/**
 * Error Data Management
 * Handles error data operations and filtering
 */
class ErrorDataManager {
    /**
     * Load all errors from background script
     * @returns {Promise<Array>} Array of error objects
     */
    static async loadAllErrors() {
        try {
            const tabs = await TabCommunicationManager.getCurrentActiveTab();
            if (!tabs || !tabs[0]) return [];

            const result = await TabCommunicationManager.sendMessageToBackground({
                action: 'getErrors',
            });

            let errors = [];
            if (result?.path) {
                result.path.forEach((path) => {
                    errors.push(...path.data);
                });
            }

            return errors;
        } catch (error) {
            console.error('Error loading errors:', error);
            return [];
        }
    }

    /**
     * Delete specific error by ID
     * @param {string} errorId - Error ID to delete
     * @returns {Promise<Object>} Operation result
     */
    static async deleteErrorById(errorId) {
        try {
            const tabs = await TabCommunicationManager.getCurrentActiveTab();
            if (!tabs || !tabs[0]) {
                throw new Error('No active tab found');
            }

            return await TabCommunicationManager.sendMessageToContentScript({
                action: 'removeError',
                errorId,
            });
        } catch (error) {
            console.error('Error deleting error:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Clear all errors
     * @returns {Promise<Object>} Operation result
     */
    static async clearAllErrors() {
        try {
            const tabs = await TabCommunicationManager.getCurrentActiveTab();
            if (!tabs || !tabs[0]) {
                throw new Error('No active tab found');
            }

            return await TabCommunicationManager.sendMessageToContentScript({
                action: 'clearAllErrors',
            });
        } catch (error) {
            console.error('Error clearing all errors:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Sort errors by status and timestamp
     * @param {Array} errors - Array of error objects
     * @returns {Array} Sorted error array
     */
    static sortErrorsByPriority(errors) {
        const statusPriorityMap = {
            open: 1,
            resolved: 2,
            closed: 3,
        };

        return errors.sort((errorA, errorB) => {
            // Sort by status priority first
            const statusDifference =
                statusPriorityMap[errorA.status || 'open'] -
                statusPriorityMap[errorB.status || 'open'];
            if (statusDifference !== 0) return statusDifference;

            // If same status, sort by timestamp (newest first)
            return new Date(errorB.timestamp) - new Date(errorA.timestamp);
        });
    }

    /**
     * Filter errors by breakpoint type
     * @param {Array} errors - Array of error objects
     * @param {string} breakpointType - Breakpoint type to filter by
     * @returns {Array} Filtered error array
     */
    static filterErrorsByBreakpoint(errors, breakpointType) {
        return errors.filter((error) => {
            if (breakpointType === ApplicationConstants.BREAKPOINTS.ALL) return true;
            if (!error.breakpoint) return false;
            return error.breakpoint.type === breakpointType;
        });
    }
}

/**
 * Tab Communication Management
 * Handles communication between popup, content scripts, and background
 */
class TabCommunicationManager {
    /**
     * Get current active tab
     * @returns {Promise<Array>} Array containing current tab
     */
    static async getCurrentActiveTab() {
        return await BrowserAPIManager.api.tabs.query({
            active: true,
            currentWindow: true,
        });
    }

    /**
     * Send message to content script
     * @param {Object} message - Message object
     * @returns {Promise<Object>} Response from content script
     */
    static async sendMessageToContentScript(message) {
        try {
            const tabs = await this.getCurrentActiveTab();
            if (tabs && tabs[0]) {
                return await BrowserAPIManager.api.tabs.sendMessage(tabs[0].id, message);
            }
            throw new Error('No active tab found');
        } catch (error) {
            console.log('Cannot send message to content script:', error.message);
            return null;
        }
    }

    /**
     * Send message to background script
     * @param {Object} message - Message object
     * @returns {Promise<Object>} Response from background script
     */
    static async sendMessageToBackground(message) {
        return await BrowserAPIManager.api.runtime.sendMessage(message);
    }
}

/**
 * Notification Management
 * Handles Telegram notifications and user alerts
 */
class NotificationManager {
    /**
     * Show confirmation dialog for sending notification
     * @param {Object} userInfo - User information
     * @param {string} notificationType - Type of notification
     * @returns {Promise<void>}
     */
    static async showNotificationConfirmation(userInfo, notificationType) {
        const message =
            ApplicationConstants.NOTIFICATION_MESSAGES[notificationType] ||
            'Bạn có chắc muốn gửi thông báo không?';

        const result = await Swal.fire({
            title: 'Gửi thông báo',
            text: message,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Gửi',
            cancelButtonText: 'Hủy',
        });

        if (result.isConfirmed) {
            await this.sendTelegramNotification(userInfo, notificationType);
        }
    }

    /**
     * Send Telegram notification
     * @param {Object} userInfo - User information
     * @param {string} notificationType - Type of notification
     * @returns {Promise<void>}
     */
    static async sendTelegramNotification(userInfo, notificationType) {
        try {
            const currentTab = await TabCommunicationManager.getCurrentActiveTab();
            const domainUrl = new URL(currentTab[0].url).hostname;
            const notificationButton = $('#sendNotification');

            const response = await $.ajax({
                type: 'POST',
                url: ApplicationConstants.API_ENDPOINTS.TELEGRAM_NOTIFICATION,
                data: JSON.stringify({
                    email: userInfo.email,
                    type: notificationType,
                    domain_url: domainUrl,
                }),
                dataType: 'json',
                beforeSend: function () {
                    notificationButton.prop('disabled', true);
                },
                complete: function () {
                    notificationButton.prop('disabled', false);
                },
            });

            if (response.success) {
                await Swal.fire({
                    title: 'Thông báo',
                    text: response.message,
                    icon: 'success',
                });
            }
        } catch (error) {
            await Swal.fire({
                title: 'Thông báo',
                text: error.responseJSON?.message || 'Có lỗi xảy ra khi gửi thông báo',
                icon: 'error',
            });
        }
    }
}

/**
 * User Interface Management
 * Manages all UI interactions and updates
 */
class UserInterfaceManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.initializeInterface();
    }

    /**
     * Initialize the user interface
     */
    async initializeInterface() {
        await this.setupInitialUIState();
        this.setupEventListeners();
        this.setupBreakpointFilters();
        this.checkForAvailableUpdates();
    }

    /**
     * Setup initial UI state from storage
     */
    async setupInitialUIState() {
        try {
            const storageData = await BrowserAPIManager.getStorageData([
                'errorsVisible',
                'drawOpenErrors',
                'drawResolvedErrors',
            ]);

            if (storageData.errorsVisible) {
                $('#toggleErrors').prop('checked', true);
            }

            $('#drawOpenErrors').prop('disabled', !storageData.errorsVisible);
            $('#drawResolvedErrors').prop('disabled', !storageData.errorsVisible);
            $('#drawOpenErrors').prop('checked', storageData.drawOpenErrors || false);
            $('#drawResolvedErrors').prop('checked', storageData.drawResolvedErrors || false);
        } catch (error) {
            console.error('Error setting up initial UI state:', error);
        }
    }

    /**
     * Check for available extension updates
     */
    async checkForAvailableUpdates() {
        try {
            const { latestVersion } = await BrowserAPIManager.getStorageData(['latestVersion']);
            if (latestVersion) {
                const currentVersion = BrowserAPIManager.api.runtime.getManifest().version;
                if (latestVersion !== currentVersion) {
                    this.showUpdateNotification();
                }
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
        }
    }

    /**
     * Show update notification dialog
     */
    async showUpdateNotification() {
        const result = await Swal.fire({
            title: 'Cập nhật',
            text: 'Có phiên bản mới có sẵn. Nhấp để cập nhật.',
            icon: 'info',
            confirmButtonText: 'Cập nhật',
            cancelButtonText: 'Hủy',
            showCancelButton: true,
        });

        if (result.isConfirmed) {
            BrowserAPIManager.api.tabs.create({
                url: 'https://github.com/keith-vo-macusa/check-web-extension/releases',
            });
        }
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Mode toggle
        $('#toggleMode').click(() => this.handleModeToggle());

        // Error visibility toggle
        $('#toggleErrors').change((event) => this.handleErrorsVisibilityToggle(event));

        // Resolved errors toggle
        $('#toggleResolvedErrors').change((event) => this.handleResolvedErrorsToggle(event));

        // Clear all errors
        $('#clearAll').click(() => this.handleClearAllErrors());

        // Drawing toggles
        $('#drawOpenErrors').change((event) => this.handleDrawOpenErrorsToggle(event));
        $('#drawResolvedErrors').change((event) => this.handleDrawResolvedErrorsToggle(event));

        // Auto-refresh handlers
        window.addEventListener('focus', () => this.refreshErrorDisplay());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.refreshErrorDisplay();
        });
    }

    /**
     * Setup breakpoint filter buttons
     */
    setupBreakpointFilters() {
        const { BREAKPOINTS } = ApplicationConstants;

        $('#controls').append(`
            <div class="breakpoint-filters">
                <button class="filter-btn active" data-breakpoint="${BREAKPOINTS.ALL}">Tất cả</button>
                <button class="filter-btn" data-breakpoint="${BREAKPOINTS.DESKTOP}">Desktop</button>
                <button class="filter-btn" data-breakpoint="${BREAKPOINTS.TABLET}">Tablet</button>
                <button class="filter-btn" data-breakpoint="${BREAKPOINTS.MOBILE}">Mobile</button>
            </div>
        `);

        $('.filter-btn').click((event) => this.handleBreakpointFilter(event));
    }

    /**
     * Handle mode toggle between active/inactive
     */
    async handleModeToggle() {
        const currentState = this.stateManager.getCurrentState();
        const newActiveState = !currentState.isActive;

        this.stateManager.setActiveState(newActiveState);
        await this.stateManager.setErrorsVisibility(newActiveState);

        try {
            await TabCommunicationManager.sendMessageToContentScript({
                action: newActiveState ? 'activate' : 'deactivate',
            });
        } catch (error) {
            console.log('Cannot toggle mode - content script not available');
            this.stateManager.setActiveState(false);
        }

        this.updateModeUI();
    }

    /**
     * Handle errors visibility toggle
     */
    async handleErrorsVisibilityToggle(event) {
        const isVisible = $(event.target).prop('checked');
        await this.stateManager.setErrorsVisibility(isVisible);

        $('#drawOpenErrors').prop('disabled', !isVisible);
        $('#drawResolvedErrors').prop('disabled', !isVisible);

        try {
            await TabCommunicationManager.sendMessageToContentScript({
                action: isVisible ? 'showAllErrors' : 'hideAllErrors',
            });
        } catch (error) {
            console.log('Cannot toggle errors visibility - content script not available');
        }
    }

    /**
     * Handle resolved errors visibility toggle
     */
    async handleResolvedErrorsToggle(event) {
        const isVisible = $(event.target).prop('checked');
        await this.stateManager.setResolvedErrorsVisibility(isVisible);
    }

    /**
     * Handle clear all errors action
     */
    async handleClearAllErrors() {
        const result = await Swal.fire({
            title: 'Xóa tất cả lỗi',
            text: 'Bạn có chắc muốn xóa tất cả lỗi không?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Xóa',
            cancelButtonText: 'Hủy',
        });

        if (result.isConfirmed) {
            try {
                const operationResult = await ErrorDataManager.clearAllErrors();
                if (operationResult?.success) {
                    this.refreshErrorDisplay();
                } else {
                    console.error('Error clearing all errors:', operationResult?.message);
                }
            } catch (error) {
                console.log('Cannot clear errors - content script not available');
            }
        }
    }

    /**
     * Handle draw open errors toggle
     */
    async handleDrawOpenErrorsToggle(event) {
        const shouldDraw = $(event.target).prop('checked');
        await BrowserAPIManager.setStorageData({ drawOpenErrors: shouldDraw });
        this.stateManager.setDrawOpenErrorsState(shouldDraw);

        try {
            await TabCommunicationManager.sendMessageToContentScript({
                action: 'drawOpenErrors',
                drawOpenErrors: shouldDraw,
            });
        } catch (error) {
            console.log('Cannot draw open errors - content script not available');
        }
    }

    /**
     * Handle draw resolved errors toggle
     */
    async handleDrawResolvedErrorsToggle(event) {
        const shouldDraw = $(event.target).prop('checked');
        await BrowserAPIManager.setStorageData({ drawResolvedErrors: shouldDraw });
        this.stateManager.setDrawResolvedErrorsState(shouldDraw);

        try {
            await TabCommunicationManager.sendMessageToContentScript({
                action: 'drawResolvedErrors',
                drawResolvedErrors: shouldDraw,
            });
        } catch (error) {
            console.log('Cannot draw resolved errors - content script not available');
        }
    }

    /**
     * Handle breakpoint filter selection
     */
    handleBreakpointFilter(event) {
        $('.filter-btn').removeClass('active');
        $(event.target).addClass('active');
        this.stateManager.setSelectedBreakpoint($(event.target).data('breakpoint'));
        this.refreshErrorDisplay();
    }

    /**
     * Update mode UI display
     */
    updateModeUI() {
        const currentState = this.stateManager.getCurrentState();
        const toggleButton = $('#toggleMode');
        const statusDisplay = $('#status');

        if (currentState.isActive) {
            toggleButton
                .html('<i class="fas fa-stop"></i> Dừng chọn lỗi')
                .removeClass('btn-primary')
                .addClass('active');
            statusDisplay
                .html(
                    '<i class="fas fa-play-circle"></i> Chế độ: Đang hoạt động - Click vào vùng lỗi',
                )
                .removeClass('inactive')
                .addClass('active');
        } else {
            toggleButton
                .html('<i class="fas fa-crosshairs"></i> Bắt đầu chọn lỗi')
                .removeClass('active')
                .addClass('btn-primary');
            statusDisplay
                .html('<i class="fas fa-pause-circle"></i> Chế độ: Không hoạt động')
                .removeClass('active')
                .addClass('inactive');
        }
    }

    /**
     * Refresh error list display
     */
    async refreshErrorDisplay() {
        try {
            const errors = await ErrorDataManager.loadAllErrors();
            this.displayErrorsInUI(errors);
        } catch (error) {
            console.error('Error refreshing error display:', error);
        }
    }

    /**
     * Display errors in the UI
     * @param {Array} errors - Array of error objects
     */
    displayErrorsInUI(errors) {
        const container = $('#errorsList');
        container.empty();

        const currentState = this.stateManager.getCurrentState();
        const filteredErrors = ErrorDataManager.filterErrorsByBreakpoint(
            errors,
            currentState.selectedBreakpoint,
        );
        const sortedErrors = ErrorDataManager.sortErrorsByPriority(filteredErrors);

        this.renderErrorsList(container, sortedErrors);
    }

    /**
     * Render errors list in container
     * @param {jQuery} container - Container element
     * @param {Array} errors - Array of error objects
     */
    renderErrorsList(container, errors) {
        // Group errors by status
        const errorGroups = {
            open: errors.filter((error) => !error.status || error.status === 'open'),
            resolved: errors.filter((error) => error.status === 'resolved'),
            closed: errors.filter((error) => error.status === 'closed'),
        };

        // Render summary header
        if (errorGroups.open.length >= 0) {
            const openErrorsCount = errorGroups.open?.length || 0;
            const resolvedErrorsCount = errorGroups.resolved?.length || 0;
            const currentState = this.stateManager.getCurrentState();

            container.append(`
                <div class="error-count">
                    <span>Tổng số lỗi: ${errors.length}</span>
                    <span class="breakpoint-label">
                        ${
                            currentState.selectedBreakpoint === ApplicationConstants.BREAKPOINTS.ALL
                                ? 'Tất cả breakpoint'
                                : `Breakpoint ${currentState.selectedBreakpoint}`
                        }
                    </span>
                </div>
                <div class="error-group">
                    <div class="error-group-header">
                        <span>Errors: ${openErrorsCount} - Resolved: ${resolvedErrorsCount}/${
                errors.length
            }</span>
                    </div>
                </div>
            `);
        }

        // Render individual error items
        errors.forEach((error, index) => this.renderSingleErrorItem(container, error, index));
    }

    /**
     * Render single error item
     * @param {jQuery} container - Container element
     * @param {Object} error - Error object
     * @param {number} index - Error index
     */
    renderSingleErrorItem(container, error, index) {
        const errorItem = $('<div>').addClass('error-item');
        if (error.status === 'resolved') {
            errorItem.addClass('resolved');
        }

        const formattedDate = new Date(error.timestamp).toLocaleString('vi-VN');
        const latestComment = error.comments[error.comments.length - 1];
        const statusBadge = this.createStatusBadge(error.status);
        const isFixed = error.status === 'resolved';
        const fixedButtonClass = isFixed ? 'bg-success' : '';

        errorItem.html(`
            <div class="error-header">
                <span class="error-number">#${index + 1}</span>
                ${statusBadge}
                <span class="error-time">${formattedDate}</span>
                <button class="btn-toogle-check-fixed ${fixedButtonClass}" data-fixed="${isFixed}">
                    <i class="fa-solid ${isFixed ? 'fa-x' : 'fa-check'}"></i>
                </button>
                <button class="delete-error-btn" title="Xóa lỗi này">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
            <div class="error-comment">${latestComment.text}</div>
            <div class="error-breakpoint">
                <span class="breakpoint-type">${
                    error.breakpoint ? error.breakpoint.type : 'all'
                }</span>
                <span class="breakpoint-width">${
                    error.breakpoint ? error.breakpoint.width + 'px' : ''
                }</span>
            </div>
            <div class="error-url">${error.url}</div>
        `);

        this.setupErrorItemEventHandlers(errorItem, error);
        container.append(errorItem);
    }

    /**
     * Create status badge element
     * @param {string} status - Error status
     * @returns {string} HTML string for status badge
     */
    createStatusBadge(status) {
        const badge = $('<span>').addClass('status-badge');
        switch (status) {
            case 'resolved':
                return badge.addClass('resolved').text('Resolved').prop('outerHTML');
            case 'closed':
                return badge.addClass('closed').text('Closed').prop('outerHTML');
            default:
                return badge.addClass('open').text('Open').prop('outerHTML');
        }
    }

    /**
     * Setup event handlers for error item
     * @param {jQuery} errorItem - Error item element
     * @param {Object} error - Error object
     */
    setupErrorItemEventHandlers(errorItem, error) {
        // Delete error handler
        errorItem.find('.delete-error-btn').click(async (event) => {
            event.stopPropagation();

            const result = await Swal.fire({
                title: 'Xóa lỗi',
                text: 'Bạn có chắc muốn xóa lỗi này không?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Xóa',
                cancelButtonText: 'Hủy',
            });

            if (result.isConfirmed) {
                try {
                    const operationResult = await ErrorDataManager.deleteErrorById(error.id);
                    if (operationResult?.success) {
                        this.refreshErrorDisplay();
                    } else {
                        console.error('Error deleting error:', operationResult?.message);
                    }
                } catch (error) {
                    console.error('Error deleting error:', error);
                }
            }
        });

        // Toggle fixed status handler
        errorItem.find('.btn-toogle-check-fixed').click(async (event) => {
            event.stopPropagation();

            const result = await Swal.fire({
                title: 'Thay đổi trạng thái',
                text: 'Bạn có chắc muốn thay đổi trạng thái của lỗi này không?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Check',
            });

            if (result.isConfirmed) {
                try {
                    const operationResult =
                        await TabCommunicationManager.sendMessageToContentScript({
                            action: 'checkFixed',
                            errorId: error.id,
                        });

                    if (operationResult?.success) {
                        this.refreshErrorDisplay();
                    } else {
                        console.log('Cập nhật lỗi thất bại:', operationResult?.message);
                    }
                } catch (error) {
                    console.error('Error checking fixed:', error);
                }
            }
        });

        // Error item click handler (highlight error)
        errorItem.click(async () => {
            try {
                const result = await TabCommunicationManager.sendMessageToContentScript({
                    action: 'highlightError',
                    error: error,
                });

                if (result?.success) {
                    this.refreshErrorDisplay();
                } else {
                    console.error('Error highlighting error:', result?.message);
                }
            } catch (error) {
                console.log('Cannot highlight error - content script not available');
            }
        });
    }
}

/**
 * Authentication and User Management
 * Handles user authentication and profile display
 */
class UserAuthenticationManager {
    /**
     * Setup user interface for authenticated user
     * @param {Object} userInfo - User information
     */
    static setupAuthenticatedUserInterface(userInfo) {
        const headerElement = $('.header');
        headerElement.append(`
            <div class="user-info">
                <span class="user-id">ID: ${userInfo.id}</span>
                <span class="user-name">Tên: ${userInfo.name}</span>
                <button id="logoutBtn" class="logout-btn">Đăng xuất</button>
            </div>
        `);

        this.setupLogoutHandler();
        this.setupNotificationButton(userInfo);
    }

    /**
     * Setup logout button handler
     */
    static setupLogoutHandler() {
        $('#logoutBtn').click(async () => {
            const result = await Swal.fire({
                title: 'Đăng xuất',
                text: 'Bạn có chắc muốn đăng xuất không?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Đăng xuất',
                cancelButtonText: 'Hủy',
            });

            if (result.isConfirmed) {
                try {
                    await this.performLogout();
                } catch (error) {
                    console.error('Error during logout:', error);
                }
            }
        });
    }

    /**
     * Perform logout operations
     */
    static async performLogout() {
        await BrowserAPIManager.removeStorageData(['feedback']);
        const logoutSuccess = await AuthManager.logout();

        try {
            await TabCommunicationManager.sendMessageToContentScript({
                action: 'deactivate',
                reason: 'logout',
            });

            await TabCommunicationManager.sendMessageToContentScript({
                action: 'hideAllErrors',
            });

            // Refresh current tab
            const tabs = await TabCommunicationManager.getCurrentActiveTab();
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
            }
            window.close();
        } catch (error) {
            console.log('Cannot send logout messages to content script');
        }

        if (logoutSuccess) {
            window.location.href = 'login.html';
        }
    }

    /**
     * Setup notification button based on user role
     * @param {Object} userInfo - User information
     */
    static setupNotificationButton(userInfo) {
        const notificationButton = $('#sendNotification');

        if (userInfo.email === ApplicationConstants.ADMIN_EMAIL) {
            notificationButton.text('Gửi thông báo lỗi');
            notificationButton.click(() => {
                NotificationManager.showNotificationConfirmation(
                    userInfo,
                    ApplicationConstants.NOTIFICATION_TYPES.BUG_FOUND,
                );
            });
        } else {
            notificationButton.text('Gửi thông báo đã sửa tất cả lỗi');
            notificationButton.click(() => {
                NotificationManager.showNotificationConfirmation(
                    userInfo,
                    ApplicationConstants.NOTIFICATION_TYPES.BUG_FIXED,
                );
            });
        }
    }
}

/**
 * Application Initialization and Main Controller
 * Coordinates all modules and handles application startup
 */
class PopupApplicationController {
    constructor() {
        this.stateManager = new ApplicationStateManager();
        this.uiManager = new UserInterfaceManager(this.stateManager);
    }

    /**
     * Initialize the popup application
     */
    async initializeApplication() {
        try {
            // Check browser compatibility
            if (!BrowserAPIManager.api || !BrowserAPIManager.api.tabs) {
                $('#errorsList').html(
                    '<div class="no-errors">❌ Extension chỉ hỗ trợ Chrome/Edge</div>',
                );
                return;
            }

            // Check authentication
            const isAuthenticated = await AuthManager.isAuthenticated();
            if (!isAuthenticated) {
                window.location.href = 'login.html';
                return;
            }

            // Setup authenticated user interface
            const userInfo = await AuthManager.getUserInfo();
            if (userInfo) {
                UserAuthenticationManager.setupAuthenticatedUserInterface(userInfo);
            }

            // Load initial state
            await this.loadInitialApplicationState();

            // Refresh error display
            await this.uiManager.refreshErrorDisplay();

            // Setup message listeners
            this.setupMessageListeners();
        } catch (error) {
            console.error('Error during application initialization:', error);
            window.location.href = 'login.html';
        }
    }

    /**
     * Load initial application state from content script
     */
    async loadInitialApplicationState() {
        try {
            const response = await TabCommunicationManager.sendMessageToContentScript({
                action: 'getState',
            });

            if (response) {
                this.stateManager.setActiveState(response.isActive);
                this.uiManager.updateModeUI();
            }
        } catch (error) {
            console.log('Content script not available, using default state');
            this.stateManager.setActiveState(false);
            this.uiManager.updateModeUI();
        }
    }

    /**
     * Setup message listeners for inter-script communication
     */
    setupMessageListeners() {
        BrowserAPIManager.api.runtime.onMessage.addListener((request) => {
            if (request.action === 'errorAdded') {
                this.uiManager.refreshErrorDisplay();
            }
        });
    }
}

/**
 * Application Entry Point
 * Initialize the popup when DOM is ready
 */
$(document).ready(async function () {
    const popupController = new PopupApplicationController();
    await popupController.initializeApplication();
});
