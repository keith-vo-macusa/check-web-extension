import TabManager from './services/TabManager.js';
import AuthManager from './auth.js';
import {
    BREAKPOINTS,
    typeNotification,
    messages,
    ACTION_MESSAGE,
    ADMIN_EMAIL,
} from './constants/index.js';
import AlertManager from './services/AlertManager.js';
import NotificationManager from './services/NotificationManager.js';
import { ConfigurationManager } from './config/ConfigurationManager.js';

class PopupState {
    constructor() {
        this.isActive = false;
        this.errorsVisible = true;
        this.resolvedErrorsVisible = false;
        this.selectedBreakpoint = BREAKPOINTS.ALL;
        this.isRectMode = false;
        this.drawOpenErrors = false;
        this.drawResolvedErrors = false;
        document.body.setAttribute('data-show-resolved', this.resolvedErrorsVisible);
    }

    setActive(isActive) {
        this.isActive = isActive;
    }

    setErrorsVisible(isVisible) {
        this.errorsVisible = isVisible;
        chrome.storage.local.set({ errorsVisible: isVisible });
    }

    setSelectedBreakpoint(breakpoint) {
        this.selectedBreakpoint = breakpoint;
    }

    setResolvedErrorsVisible(isVisible) {
        this.resolvedErrorsVisible = isVisible;
        document.body.setAttribute('data-show-resolved', isVisible);
        chrome.storage.local.set({ resolvedErrorsVisible: isVisible });
    }

    setRectMode(isRectMode) {
        this.isRectMode = isRectMode;
    }

    setDrawOpenErrors(isEnabled) {
        this.drawOpenErrors = isEnabled;
    }

    setDrawResolvedErrors(isEnabled) {
        this.drawResolvedErrors = isEnabled;
    }
}

class ErrorManager {
    static async loadErrors() {
        const currentTab = await TabManager.getCurrentTab();
        if (!currentTab || !currentTab[0]) return [];

        const domainName = await TabManager.getCurrentTabDomain();
        const response = await TabManager.sendMessageToBackground({
            action: 'getErrors',
            domainName,
        });

        const allErrors = [];
        response?.path?.forEach((pathItem) => {
            allErrors.push(...pathItem.data);
        });
        return allErrors;
    }

    static async deleteError(errorId) {
        const currentTab = await TabManager.getCurrentTab();
        if (!currentTab || !currentTab[0]) return;

        const domainName = await TabManager.getCurrentTabDomain();
        return await TabManager.sendMessageToBackground({
            action: 'removeError',
            errorId,
            domainName,
        });
    }

    static async clearAllErrors() {
        const currentTab = await TabManager.getCurrentTab();
        if (!currentTab || !currentTab[0]) return;

        const domainName = await TabManager.getCurrentTabDomain();
        return await TabManager.sendMessageToBackground({
            action: 'clearAllErrors',
            domainName,
        });
    }

    static sortErrors(errors) {
        const statusOrder = { open: 1, resolved: 2, closed: 3 };
        return errors.sort((first, second) => {
            const statusDiff =
                statusOrder[first.status || 'open'] - statusOrder[second.status || 'open'];
            return statusDiff !== 0
                ? statusDiff
                : new Date(second.timestamp) - new Date(first.timestamp);
        });
    }
}

class UIManager {
    constructor(state) {
        this.state = state;
        this.setupUI();
        this.setupEventListeners();
        this.setupBreakpointFilters();
        this.checkForUpdates();
    }

    escapeHtml(value) {
        return value == null
            ? ''
            : String(value)
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
    }

    async setupUI() {
        const { errorsVisible } = await chrome.storage.local.get('errorsVisible');
        if (errorsVisible) $('#toggleErrors').prop('checked', true);

        const { resolvedErrorsVisible } = await chrome.storage.local.get('resolvedErrorsVisible');
        $('#toggleResolvedErrors').prop('checked', resolvedErrorsVisible).trigger('change');

        $('#drawOpenErrors').prop('disabled', !errorsVisible);
        $('#drawResolvedErrors').prop('disabled', !errorsVisible);

        const { drawOpenErrors } = await chrome.storage.local.get('drawOpenErrors');
        $('#drawOpenErrors').prop('checked', drawOpenErrors);

        const { drawResolvedErrors } = await chrome.storage.local.get('drawResolvedErrors');
        $('#drawResolvedErrors').prop('checked', drawResolvedErrors);
    }

    checkForUpdates() {
        chrome.storage.local.get(['latestVersion'], (storage) => {
            if (storage.latestVersion) {
                const currentVersion = chrome.runtime.getManifest().version;
                if (storage.latestVersion != currentVersion) this.showUpdateNotification();
            }
        });
    }

    showUpdateNotification() {
        AlertManager.confirm(
            'Cập nhật',
            'Có phiên bản mới có sẵn. Nhấp để cập nhật.',
            'Cập nhật',
            'Hủy',
        ).then((result) => {
            if (result.isConfirmed) {
                TabManager.createTab('https://github.com/keith-vo-macusa/check-web-extension/releases');
            }
        });
    }

    setupEventListeners() {
        $('#toggleMode').click(() => this.handleToggleMode());
        $('#toggleErrors').change((event) => this.handleToggleErrors(event));
        $('#toggleResolvedErrors').change((event) => this.handleToggleResolvedErrors(event));
        $('#clearAll').click(() => this.handleClearAll());
        $('#drawOpenErrors').change((event) => this.handleDrawOpenErrors(event));
        $('#drawResolvedErrors').change((event) => this.handleDrawResolvedErrors(event));

        window.addEventListener('focus', () => this.refreshErrorsList());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.refreshErrorsList();
        });
    }

    setupBreakpointFilters() {
        $('#controls').append(
            `\n            <div class="breakpoint-filters">\n                <button class="filter-btn active" data-breakpoint="${BREAKPOINTS.ALL}">Tất cả</button>\n                <button class="filter-btn" data-breakpoint="${BREAKPOINTS.DESKTOP}">Desktop</button>\n                <button class="filter-btn" data-breakpoint="${BREAKPOINTS.TABLET}">Tablet</button>\n                <button class="filter-btn" data-breakpoint="${BREAKPOINTS.MOBILE}">Mobile</button>\n            </div>\n        `,
        );
        $('.filter-btn').click((event) => this.handleBreakpointFilter(event));
    }

    async handleToggleMode() {
        this.state.setActive(!this.state.isActive);
        this.state.setErrorsVisible(this.state.isActive);

        try {
            await TabManager.sendMessage({
                action: this.state.isActive ? ACTION_MESSAGE.ACTIVATE : ACTION_MESSAGE.DEACTIVATE,
            });
        } catch {
            console.log('Cannot toggle mode - content script not available');
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
        } catch {
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
            messages.remove_all_errors,
            'Xóa',
            'Hủy',
        ).then(async (result) => {
            if (result.isConfirmed)
                try {
                    AlertManager.loading(messages.loading);
                    const response = await ErrorManager.clearAllErrors();
                    if (response?.success) {
                        this.refreshErrorsList();
                    } else {
                        console.error('Error clearing all errors:', response?.message);
                    }
                    AlertManager.close();
                } catch {
                    console.log('Cannot clear errors - content script not available');
                    AlertManager.close();
                }
        });
    }

    async handleDrawOpenErrors(event) {
        const drawOpenErrors = $(event.target).prop('checked');
        await chrome.storage.local.set({ drawOpenErrors });
        this.state.setDrawOpenErrors(drawOpenErrors);

        try {
            await TabManager.sendMessage({
                action: ACTION_MESSAGE.DRAW_OPEN_ERRORS,
                drawOpenErrors,
            });
        } catch {
            console.log('Cannot draw open errors - content script not available');
        }
    }

    async handleDrawResolvedErrors(event) {
        const drawResolvedErrors = $(event.target).prop('checked');
        await chrome.storage.local.set({ drawResolvedErrors });
        this.state.setDrawResolvedErrors(drawResolvedErrors);

        try {
            await TabManager.sendMessage({
                action: ACTION_MESSAGE.DRAW_RESOLVED_ERRORS,
                drawResolvedErrors,
            });
        } catch {
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
        const toggleModeButton = $('#toggleMode');
        const statusElement = $('#status');

        if (this.state.isActive) {
            toggleModeButton
                .html('<i class="fas fa-stop"></i> Dừng chọn lỗi')
                .removeClass('btn-primary')
                .addClass('active');
            statusElement
                .html('<i class="fas fa-play-circle"></i> Chế độ: Đang hoạt động - Click vào vùng lỗi')
                .removeClass('inactive')
                .addClass('active');
        } else {
            toggleModeButton
                .html('<i class="fas fa-crosshairs"></i> Bắt đầu chọn lỗi')
                .removeClass('active')
                .addClass('btn-primary');
            statusElement
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
        const errorsListElement = $('#errorsList');
        errorsListElement.empty();
        const filteredErrors = this.filterErrorsByBreakpoint(errors);
        const sortedErrors = ErrorManager.sortErrors(filteredErrors);
        this.renderErrorsList(errorsListElement, sortedErrors);
    }

    filterErrorsByBreakpoint(errors) {
        return errors.filter(
            (error) =>
                this.state.selectedBreakpoint === BREAKPOINTS.ALL ||
                (!!error.breakpoint && error.breakpoint.type === this.state.selectedBreakpoint),
        );
    }

    renderErrorsList(container, errors) {
        const openErrors = errors.filter((error) => !error.status || error.status === 'open');
        const resolvedErrors = errors.filter((error) => error.status === 'resolved');

        const openCount = openErrors.length || 0;
        const resolvedCount = resolvedErrors.length || 0;
        container.append(
            `\n                <div class="error-count">\n                    <span>Tổng số lỗi: ${errors.length}</span>\n                    <span class="breakpoint-label">\n                        ${this.state.selectedBreakpoint === BREAKPOINTS.ALL ? 'Tất cả breakpoint' : `Breakpoint ${this.state.selectedBreakpoint}`}\n                    </span>\n                </div>\n                <div class="error-group">\n                    <div class="error-group-header">\n                        <span>Errors: ${openCount} - Resolved: ${resolvedCount}/${errors.length}</span>\n                    </div>\n                </div>\n            `,
        );

        errors.forEach((error, index) => this.renderErrorItem(container, error, index));
    }

    renderErrorItem(container, error, index) {
        const errorItem = $('<div>').addClass('error-item');
        if (error.status === 'resolved') errorItem.addClass('resolved');
        if (error.status === 'closed') errorItem.addClass('closed');
        if (!error.status || error.status === 'open') errorItem.addClass('open');

        const timestamp = new Date(error.timestamp).toLocaleString('vi-VN');
        const lastComment = error.comments[error.comments.length - 1];
        const statusBadge = this.createStatusBadge(error.status);
        const isResolved = error.status === 'resolved';
        const resolvedClass = isResolved ? 'bg-success' : '';
        const commentText = this.escapeHtml(lastComment?.text || '');
        const commentsCount = error.comments?.length || 0;
        const breakpointType = error.breakpoint ? error.breakpoint.type : 'all';
        const breakpointWidth = error.breakpoint ? `${error.breakpoint.width}px` : '';
        const safeUrl = this.escapeHtml(error.url || '');

        errorItem.html(
            `\n            <div class="error-row">\n                <div class="error-main">\n                    <div class="error-topline">\n                        <span class="error-number">#${index + 1}</span>\n                        ${statusBadge}\n                        <span class="error-meta-pill">${commentsCount} comment</span>\n                        <span class="error-time">${timestamp}</span>\n                    </div>\n\n                    <div class="error-comment">${commentText || '<span class="error-empty">Không có nội dung</span>'}</div>\n\n                    <div class="error-bottomline">\n                        <span class="breakpoint-type">${breakpointType}</span>\n                        ${breakpointWidth ? `<span class="breakpoint-width">${breakpointWidth}</span>` : ''}\n                        ${safeUrl ? `<span class="error-url" title="${safeUrl}">${safeUrl}</span>` : ''}\n                    </div>\n                </div>\n\n                <div class="error-actions">\n                    <button class="btn-toogle-check-fixed ${resolvedClass}" data-fixed="${isResolved}" title="${isResolved ? 'Bỏ đánh dấu đã giải quyết' : 'Đánh dấu đã giải quyết'}" aria-label="${isResolved ? 'Bỏ đánh dấu đã giải quyết' : 'Đánh dấu đã giải quyết'}">\n                        <i class="fa-solid ${isResolved ? 'fa-x' : 'fa-check'}"></i>\n                    </button>\n                    <button class="delete-error-btn" title="Xóa lỗi này" aria-label="Xóa lỗi này">\n                        <i class="fa-solid fa-trash"></i>\n                    </button>\n                </div>\n            </div>\n        `,
        );

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
        errorItem.find('.delete-error-btn').click(async (event) => {
            event.stopPropagation();
            AlertManager.confirm(
                'Xóa lỗi',
                messages.remove_error,
                'Xóa',
                'Hủy',
            ).then(async (result) => {
                if (result.isConfirmed)
                    try {
                        AlertManager.loading(messages.loading);
                        const response = await ErrorManager.deleteError(error.id);
                        AlertManager.close();
                        if (response?.success) {
                            this.refreshErrorsList();
                            return;
                        }
                        throw new Error(response?.message);
                    } catch (deleteError) {
                        AlertManager.close();
                        console.error('Error deleting error:', deleteError);
                        AlertManager.error('Error deleting error:', deleteError);
                    }
            });
        });

        errorItem.find('.btn-toogle-check-fixed').click(async (event) => {
            event.stopPropagation();
            AlertManager.confirm(
                'Thay đổi trạng thái',
                messages.change_status_error,
                'Check',
                'Hủy',
            ).then(async (result) => {
                if (result.isConfirmed)
                    try {
                        AlertManager.loading(messages.loading);
                        const domainName = await TabManager.getCurrentTabDomain();
                        const response = await TabManager.sendMessageToBackground({
                            action: ACTION_MESSAGE.CHECK_FIXED,
                            errorId: error.id,
                            domainName,
                        });
                        if (response?.success) {
                            AlertManager.close();
                            this.refreshErrorsList();
                            return;
                        }
                        throw new Error(response?.message);
                    } catch (toggleError) {
                        AlertManager.close();
                        console.error('Error checking fixed:', toggleError);
                        AlertManager.error('Error checking fixed:', toggleError);
                    }
            });
        });

        errorItem.click(async () => {
            try {
                TabManager.sendMessageToBackground({
                    action: 'openOrResizeErrorWindow',
                    url: error.url,
                    width: error.breakpoint?.width,
                    height: error.breakpoint?.height,
                    errorId: error.id,
                });
                AlertManager.close();
            } catch {
                console.log('Cannot highlight error - content script not available');
                AlertManager.close();
            }
        });
    }
}

$(document).ready(async function () {
    let uiManager = null;

    if (!chrome || !chrome.tabs)
        return void $('#errorsList').html(
            '<div class="no-errors">❌ Extension chỉ hỗ trợ Chrome/Edge</div>',
        );

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'errorAdded' && uiManager) uiManager.refreshErrorsList();
    });

    const domainName = await TabManager.getCurrentTabDomain();
    const isAuthorized = await TabManager.sendMessageToBackground({
        action: 'checkAuthorized',
        domainName,
    });

    if (!isAuthorized)
        return void AlertManager.errorWithOutClose('Lỗi', `${domainName} chưa được khởi tạo trên Checkwise`);

    const sendNotification = async (userInfo, notificationType) => {
        AlertManager.confirm(
            'Gửi thông báo',
            messages[notificationType] || 'Bạn có chắc muốn gửi thông báo không?',
            'Gửi',
            'Hủy',
        ).then(async (result) => {
            if (result.isConfirmed) {
                await NotificationManager.sendMarkErrorsResolevedOrNewErrors(userInfo, notificationType);
            }
        });
    };

    try {
        if (!(await AuthManager.isAuthenticated())) return void (window.location.href = 'login.html');

        const userInfo = await AuthManager.getUserInfo();
        if (userInfo) {
            $('.header').append(
                `\n                <div class="user-info">\n                    <span class="user-id">ID: ${userInfo.id}</span>\n                    <span class="user-name">Tên: ${userInfo.name}</span>\n                    <button id="logoutBtn" class="logout-btn" title="Đăng xuất" aria-label="Đăng xuất">\n                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">\n                            <path\n                            d="M12 2v10"\n                            stroke="currentColor"\n                            stroke-width="2"\n                            stroke-linecap="round"\n                            />\n                            <path\n                            d="M6 5a8 8 0 1 0 12 0"\n                            stroke="currentColor"\n                            stroke-width="2"\n                            stroke-linecap="round"\n                            />\n                        </svg>\n                        <span class="visually-hidden">Đăng xuất</span>\n                    </button>\n                </div>\n            `,
            );

            $('#logoutBtn').click(async () => {
                AlertManager.confirm(
                    'Đăng xuất',
                    'Bạn có chắc muốn đăng xuất không?',
                    'Đăng xuất',
                    'Hủy',
                ).then(async (result) => {
                    if (result.isConfirmed)
                        try {
                            await chrome.storage.local.remove(['feedback']);
                            const didLogout = await AuthManager.logout();
                            await TabManager.sendMessage({
                                action: ACTION_MESSAGE.DEACTIVATE,
                                reason: 'logout',
                            });
                            await TabManager.sendMessage({
                                action: ACTION_MESSAGE.HIDE_ALL_ERRORS,
                            });
                            await TabManager.reloadCurrentTab();
                            window.close();
                            if (didLogout) window.location.href = 'login.html';
                        } catch (error) {
                            console.error('Error during logout:', error);
                        }
                });
            });

            const toggleModeSection = $('#toggleModeSection');
            if (ConfigurationManager.isCheckwiseAdmin(userInfo)) {
                toggleModeSection.show();
                $('#sendNotification')
                    .attr('aria-label', 'Gửi thông báo lỗi')
                    .attr('title', 'Gửi thông báo lỗi');
                $('#sendNotificationLabel').text('Gửi thông báo lỗi');
                $('#sendNotification').click(() => {
                    sendNotification(userInfo, typeNotification.BUG_FOUND);
                });
            } else {
                toggleModeSection.hide();
                $('#sendNotification')
                    .attr('aria-label', 'Gửi thông báo đã sửa tất cả lỗi')
                    .attr('title', 'Gửi thông báo đã sửa tất cả lỗi');
                $('#sendNotificationLabel').text('Gửi thông báo đã sửa tất cả lỗi');
                $('#sendNotification').click(() => {
                    sendNotification(userInfo, typeNotification.BUG_FIXED);
                });
            }
        }

        const popupState = new PopupState();
        uiManager = new UIManager(popupState);

        try {
            const contentState = await TabManager.sendMessage({ action: ACTION_MESSAGE.GET_STATE });
            if (contentState) {
                popupState.setActive(contentState.isActive);
                uiManager.updateUI();
            }
        } catch {
            console.log('Content script not available, using default state');
            popupState.setActive(false);
            uiManager.updateUI();
        }

        uiManager.refreshErrorsList();
    } catch (error) {
        console.error('Error during initialization:', error);
        window.location.href = 'login.html';
    }
});

