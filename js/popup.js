import TabManager from './services/TabManager.js';
import {
    BREAKPOINTS,
    typeNotification,
    messages,
    ACTION_MESSAGE,
    ADMIN_EMAIL,
} from './constants/index.js';
import AlertManager from './services/AlertManager.js';
import NotificationManager from './services/NotificationManager.js';

// State Management
class PopupState {
    constructor() {
        this.isActive = false;
        this.errorsVisible = true;
        this.resolvedErrorsVisible = false;
        this.selectedBreakpoint = BREAKPOINTS.ALL;
        this.isRectMode = false;

        this.drawOpenErrors = false;
        this.drawResolvedErrors = false;

        // Set initial state
        document.body.setAttribute('data-show-resolved', this.resolvedErrorsVisible);
    }

    setActive(value) {
        this.isActive = value;
    }

    setErrorsVisible(value) {
        this.errorsVisible = value;
        chrome.storage.local.set({
            errorsVisible: value,
        });
    }

    setSelectedBreakpoint(value) {
        this.selectedBreakpoint = value;
    }

    setResolvedErrorsVisible(value) {
        this.resolvedErrorsVisible = value;
        document.body.setAttribute('data-show-resolved', value);
        chrome.storage.local.set({
            resolvedErrorsVisible: value,
        });
    }

    setRectMode(value) {
        this.isRectMode = value;
    }

    setDrawOpenErrors(value) {
        this.drawOpenErrors = value;
    }

    setDrawResolvedErrors(value) {
        this.drawResolvedErrors = value;
    }
}

// Error Management
class ErrorManager {
    static async loadErrors() {
        const tabs = await TabManager.getCurrentTab();

        if (!tabs || !tabs[0]) return [];

        const domainName = await TabManager.getCurrentTabDomain();

        const result = await TabManager.sendMessageToBackground({
            action: 'getErrors',
            domainName: domainName,
        });

        let errors = [];

        if (result?.path) {
            result.path?.forEach((path) => {
                errors.push(...path.data);
            });
        }
        return errors;
    }

    static async deleteError(errorId) {
        const tabs = await TabManager.getCurrentTab();
        if (!tabs || !tabs[0]) return;

        return await TabManager.sendMessage({
            action: 'removeError',
            errorId,
        });
    }

    static async clearAllErrors() {
        const tabs = await TabManager.getCurrentTab();
        if (!tabs || !tabs[0]) return;

        // const url = tabs[0].url;
        // await browserAPI.storage.local.set({[url]: []});
        return await TabManager.sendMessage({
            action: 'clearAllErrors',
        });
    }

    static sortErrors(errors) {
        const statusPriority = {
            open: 1,
            resolved: 2,
            closed: 3,
        };

        return errors.sort((a, b) => {
            // Sort by status priority first
            const statusDiff =
                statusPriority[a.status || 'open'] - statusPriority[b.status || 'open'];
            if (statusDiff !== 0) return statusDiff;

            // If same status, sort by timestamp (newest first)
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
    }
}

// UI Management
class UIManager {
    constructor(state) {
        this.state = state;
        this.setupUI();
        this.setupEventListeners();
        this.setupBreakpointFilters();
        this.checkForUpdates();
    }

    async setupUI() {
        const { errorsVisible } = await chrome.storage.local.get('errorsVisible');

        if (errorsVisible) {
            $('#toggleErrors').prop('checked', true);
        }

        $('#drawOpenErrors').prop('disabled', !errorsVisible);
        $('#drawResolvedErrors').prop('disabled', !errorsVisible);

        const { drawOpenErrors } = await chrome.storage.local.get('drawOpenErrors');
        $('#drawOpenErrors').prop('checked', drawOpenErrors);

        const { drawResolvedErrors } = await chrome.storage.local.get('drawResolvedErrors');
        $('#drawResolvedErrors').prop('checked', drawResolvedErrors);
    }

    checkForUpdates() {
        // check local storage xem có thể có update không updateAvailable = true
        chrome.storage.local.get(['latestVersion'], (data) => {
            if (data.latestVersion) {
                const currentVersion = chrome.runtime.getManifest().version;
                if (data.latestVersion != currentVersion) {
                    this.showUpdateNotification();
                }
            }
        });
    }

    showUpdateNotification() {
        AlertManager.confirm(
            'Cập nhật',
            'Có phiên bản mới có sẵn. Nhấp để cập nhật.',
            'Cập nhật',
            'Hủy',
            'info',
        ).then((result) => {
            if (result.isConfirmed) {
                TabManager.createTab(
                    'https://github.com/keith-vo-macusa/check-web-extension/releases',
                );
            }
        });
    }

    setupEventListeners() {
        // Toggle Mode
        $('#toggleMode').click(() => this.handleToggleMode());

        // Toggle Errors
        $('#toggleErrors').change((e) => this.handleToggleErrors(e));

        // Toggle Resolved Errors
        $('#toggleResolvedErrors').change((e) => this.handleToggleResolvedErrors(e));

        // Clear All
        $('#clearAll').click(() => this.handleClearAll());

        // Draw Open Errors
        $('#drawOpenErrors').change((e) => this.handleDrawOpenErrors(e));

        // Draw Resolved Errors
        $('#drawResolvedErrors').change((e) => this.handleDrawResolvedErrors(e));

        // Auto-refresh handlers
        window.addEventListener('focus', () => this.refreshErrorsList());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.refreshErrorsList();
        });
    }

    setupBreakpointFilters() {
        $('#controls').append(`
            <div class="breakpoint-filters">
                <button class="filter-btn active" data-breakpoint="${BREAKPOINTS.ALL}">Tất cả</button>
                <button class="filter-btn" data-breakpoint="${BREAKPOINTS.DESKTOP}">Desktop</button>
                <button class="filter-btn" data-breakpoint="${BREAKPOINTS.TABLET}">Tablet</button>
                <button class="filter-btn" data-breakpoint="${BREAKPOINTS.MOBILE}">Mobile</button>
            </div>
        `);

        $('.filter-btn').click((e) => this.handleBreakpointFilter(e));
    }

    async handleToggleMode() {
        this.state.setActive(!this.state.isActive);
        this.state.setErrorsVisible(this.state.isActive);
        try {
            await TabManager.sendMessage({
                action: this.state.isActive ? ACTION_MESSAGE.ACTIVATE : ACTION_MESSAGE.DEACTIVATE,
            });
        } catch (error) {
            console.log('Cannot toggle mode - content script not available');
            // Reset state if content script is not available
            this.state.setActive(false);
        }
        this.updateUI();
    }

    async handleToggleErrors(event) {
        const isVisible = $(event.target).prop('checked');
        this.state.setErrorsVisible(isVisible);
        $('#drawOpenErrors').prop('disabled', !isVisible);
        $('#drawResolvedErrors').prop('disabled', !isVisible);
        try {
            await TabManager.sendMessage({
                action: isVisible ? ACTION_MESSAGE.SHOW_ALL_ERRORS : ACTION_MESSAGE.HIDE_ALL_ERRORS,
            });
        } catch (error) {
            console.log('Cannot toggle errors visibility - content script not available');
        }
    }

    async handleToggleResolvedErrors(event) {
        const isVisible = $(event.target).prop('checked');
        this.state.setResolvedErrorsVisible(isVisible);
    }

    async handleClearAll() {
        AlertManager.confirm(
            'Xóa tất cả lỗi',
            messages['remove_all_errors'],
            'Xóa',
            'Hủy',
            'warning',
        ).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    AlertManager.loading(messages['loading']);
                    const result = await ErrorManager.clearAllErrors();
                    if (result?.success) {
                        this.refreshErrorsList();
                    } else {
                        console.error('Error clearing all errors:', result?.message);
                    }
                    AlertManager.close();
                } catch (error) {
                    console.log('Cannot clear errors - content script not available');
                    AlertManager.close();
                }
            }
        });
    }

    async handleDrawOpenErrors(event) {
        const isDraw = $(event.target).prop('checked');
        await chrome.storage.local.set({
            drawOpenErrors: isDraw,
        });
        this.state.setDrawOpenErrors(isDraw);

        try {
            await TabManager.sendMessage({
                action: ACTION_MESSAGE.DRAW_OPEN_ERRORS,
                drawOpenErrors: isDraw,
            });
        } catch (error) {
            console.log('Cannot draw open errors - content script not available');
        }
    }

    async handleDrawResolvedErrors(event) {
        const isDraw = $(event.target).prop('checked');
        await chrome.storage.local.set({
            drawResolvedErrors: isDraw,
        });
        this.state.setDrawResolvedErrors(isDraw);

        try {
            await TabManager.sendMessage({
                action: ACTION_MESSAGE.DRAW_RESOLVED_ERRORS,
                drawResolvedErrors: isDraw,
            });
        } catch (error) {
            console.log('Cannot draw resolved errors - content script not available');
        }
    }

    handleBreakpointFilter(event) {
        $('.filter-btn').removeClass('active');
        $(event.target).addClass('active');
        this.state.setSelectedBreakpoint($(event.target).data('breakpoint'));
        this.refreshErrorsList();
    }

    updateUI() {
        const btn = $('#toggleMode');
        const status = $('#status');

        if (this.state.isActive) {
            btn.html('<i class="fas fa-stop"></i> Dừng chọn lỗi')
                .removeClass('btn-primary')
                .addClass('active');
            status
                .html(
                    '<i class="fas fa-play-circle"></i> Chế độ: Đang hoạt động - Click vào vùng lỗi',
                )
                .removeClass('inactive')
                .addClass('active');
        } else {
            btn.html('<i class="fas fa-crosshairs"></i> Bắt đầu chọn lỗi')
                .removeClass('active')
                .addClass('btn-primary');
            status
                .html('<i class="fas fa-pause-circle"></i> Chế độ: Không hoạt động')
                .removeClass('active')
                .addClass('inactive');
        }
    }

    async refreshErrorsList() {
        const errors = await ErrorManager.loadErrors();
        this.displayErrors(errors);
    }

    displayErrors(errors) {
        const container = $('#errorsList');
        container.empty();

        const filteredErrors = this.filterErrorsByBreakpoint(errors);

        // Sort errors before rendering
        const sortedErrors = ErrorManager.sortErrors(filteredErrors);
        this.renderErrorsList(container, sortedErrors);
    }

    filterErrorsByBreakpoint(errors) {
        return errors.filter((error) => {
            if (this.state.selectedBreakpoint === BREAKPOINTS.ALL) return true;
            if (!error.breakpoint) return false;
            return error.breakpoint.type === this.state.selectedBreakpoint;
        });
    }

    renderErrorsList(container, errors) {
        // Group errors by status
        const errorGroups = {
            open: errors.filter((e) => !e.status || e.status === 'open'),
            resolved: errors.filter((e) => e.status === 'resolved'),
            closed: errors.filter((e) => e.status === 'closed'),
        };

        // Render each group with a header
        if (errorGroups.open.length >= 0) {
            const errorsOpen = errorGroups.open?.length || 0;
            const errorsResolved = errorGroups.resolved?.length || 0;
            container.append(`
                <div class="error-count">
                    <span>Tổng số lỗi: ${errors.length}</span>
                    <span class="breakpoint-label">
                        ${
                            this.state.selectedBreakpoint === BREAKPOINTS.ALL
                                ? 'Tất cả breakpoint'
                                : `Breakpoint ${this.state.selectedBreakpoint}`
                        }
                    </span>
                </div>
                <div class="error-group">
                    <div class="error-group-header">
                        <span>Errors: ${errorsOpen} - Resolved: ${errorsResolved}/${
                errors.length
            }</span>
                    </div>
                </div>
            `);
        }

        errors.forEach((error, index) => this.renderErrorItem(container, error, index));
    }

    renderErrorItem(container, error, index) {
        const errorItem = $('<div>').addClass('error-item');
        if (error.status === 'resolved') {
            errorItem.addClass('resolved');
        }
        const date = new Date(error.timestamp);
        const timeString = date.toLocaleString('vi-VN');
        const latestComment = error.comments[error.comments.length - 1];
        const statusBadge = this.createStatusBadge(error.status);
        const fixed = error.status === 'resolved';
        const bgBtnCheckFixed = fixed ? 'bg-success' : '';
        errorItem.html(`
            <div class="error-header">
                <span class="error-number">#${index + 1}</span>
                ${statusBadge}
                <span class="error-time">${timeString}</span>
                <button class="btn-toogle-check-fixed ${bgBtnCheckFixed}" data-fixed="${fixed}">
                    <i class="fa-solid ${fixed ? 'fa-x' : 'fa-check'}"></i>
                 </button>
                <button class="delete-error-btn" title="Xóa lỗi này"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="error-comment">${latestComment?.text || ''}</div>
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

    setupErrorItemEventHandlers(errorItem, error) {
        errorItem.find('.delete-error-btn').click(async (e) => {
            e.stopPropagation();
            AlertManager.confirm('Xóa lỗi', messages['remove_error'], 'Xóa', 'Hủy', 'warning').then(
                async (result) => {
                    if (result.isConfirmed) {
                        try {
                            AlertManager.loading(messages['loading']);
                            const result = await ErrorManager.deleteError(error.id);
                            AlertManager.close();
                            if (result?.success) {
                                this.refreshErrorsList();
                                return;
                            }
                            throw new Error(result?.message);
                        } catch (error) {
                            AlertManager.close();
                            console.error('Error deleting error:', error);
                            AlertManager.error('Error deleting error:', error);
                        }
                    }
                },
            );
        });

        errorItem.find('.btn-toogle-check-fixed').click(async (e) => {
            e.stopPropagation();
            AlertManager.confirm(
                'Thay đổi trạng thái',
                messages['change_status_error'],
                'Check',
                'Hủy',
                'warning',
            ).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        AlertManager.loading(messages['loading']);
                        const result = await TabManager.sendMessage({
                            action: ACTION_MESSAGE.CHECK_FIXED,
                            errorId: error.id,
                        });
                        if (result?.success) {
                            AlertManager.close();
                            this.refreshErrorsList();
                            return;
                        }
                        throw new Error(result?.message);
                    } catch (error) {
                        AlertManager.close();
                        console.error('Error checking fixed:', error);
                        AlertManager.error('Error checking fixed:', error);
                    }
                }
            });
        });

        errorItem.click(async () => {
            try {
                // const result = await TabManager.sendMessage({
                //     action: ACTION_MESSAGE.HIGHLIGHT_ERROR,
                //     error: error,
                // });
                TabManager.sendMessageToBackground({
                    action: 'openOrResizeErrorWindow',
                    url: error.url,
                    width: error.breakpoint?.width,
                    height: error.breakpoint?.height,
                    errorId: error.id,
                });
                AlertManager.close();
            } catch (error) {
                console.log('Cannot highlight error - content script not available');
                AlertManager.close();
            }
        });
    }
}

// Initialize Application
$(document).ready(async function () {
    if (!chrome || !chrome.tabs) {
        $('#errorsList').html('<div class="no-errors">❌ Extension chỉ hỗ trợ Chrome/Edge</div>');
        return;
    }

    // const domainName = await TabManager.getCurrentTabDomain();

    // TabManager.sendMessageToBackground({
    //     action: 'updateBadge',
    //     domainName: domainName,
    // });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'errorAdded') {
            ui.refreshErrorsList();
        }
    });

    const domainName = await TabManager.getCurrentTabDomain();
    const isAuthorized = await TabManager.sendMessageToBackground({
        action: 'checkAuthorized',
        domainName: domainName,
    });

    if (!isAuthorized) {
        AlertManager.errorWithOutClose('Lỗi', `${domainName} chưa được khởi tạo trên Checkwise`, false);
        return;
    }

    const showConfirmSendNotification = async (userInfo, type) => {
        AlertManager.confirm(
            'Gửi thông báo',
            messages[type] || 'Bạn có chắc muốn gửi thông báo không?',
            'Gửi',
            'Hủy',
            'warning',
        ).then(async (result) => {
            if (result.isConfirmed) {
                await NotificationManager.sendMarkErrorsResolevedOrNewErrors(userInfo, type);
            }
        });
    };

    try {
        const isAuth = await AuthManager.isAuthenticated();
        if (!isAuth) {
            window.location.href = 'login.html';
            return;
        }

        const userInfo = await AuthManager.getUserInfo();
        if (userInfo) {
            const header = $('.header');
            header.append(`
                <div class="user-info">
                    <span class="user-id">ID: ${userInfo.id}</span>
                    <span class="user-name">Tên: ${userInfo.name}</span>
                    <button id="logoutBtn" class="logout-btn">Đăng xuất</button>
                </div>
            `);

            $('#logoutBtn').click(async () => {
                AlertManager.confirm(
                    'Đăng xuất',
                    'Bạn có chắc muốn đăng xuất không?',
                    'Đăng xuất',
                    'Hủy',
                    'warning',
                ).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            await chrome.storage.local.remove(['feedback']);
                            const success = await AuthManager.logout();

                            await TabManager.sendMessage({
                                action: ACTION_MESSAGE.DEACTIVATE,
                                reason: 'logout',
                            });

                            await TabManager.sendMessage({
                                action: ACTION_MESSAGE.HIDE_ALL_ERRORS,
                            });

                            await TabManager.reloadCurrentTab();
                            window.close();

                            if (success) {
                                window.location.href = 'login.html';
                            }
                        } catch (error) {
                            console.error('Error during logout:', error);
                        }
                    }
                });
            });
            // sửa text của button và binding sự kiện theo type
            if (userInfo.email == ADMIN_EMAIL) {
                $('#sendNotification').text('Gửi thông báo lỗi');
                $('#sendNotification').click(() => {
                    showConfirmSendNotification(userInfo, typeNotification.BUG_FOUND);
                });
            } else {
                $('#sendNotification').text('Gửi thông báo đã sửa tất cả lỗi');
                $('#sendNotification').click(() => {
                    showConfirmSendNotification(userInfo, typeNotification.BUG_FIXED);
                });
            }
        }

        const state = new PopupState();
        const ui = new UIManager(state);

        // Load initial state - handle case where content script is not available
        try {
            const response = await TabManager.sendMessage({
                action: ACTION_MESSAGE.GET_STATE,
            });
            if (response) {
                state.setActive(response.isActive);
                ui.updateUI();
            }
        } catch (error) {
            console.log('Content script not available, using default state');
            // Use default state when content script is not available
            state.setActive(false);
            ui.updateUI();
        }

        ui.refreshErrorsList();
    } catch (error) {
        console.error('Error during initialization:', error);
        window.location.href = 'login.html';
    }
});
