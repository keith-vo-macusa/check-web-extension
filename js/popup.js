import TabManager from './services/TabManager.js';
import AuthManager from './auth.js';
import AlertManager from './services/AlertManager.js';
import NotificationManager from './services/NotificationManager.js';
import { ConfigurationManager } from './config/ConfigurationManager.js';
import { BugListService } from './domain/BugListService.js';

/** Bỏ qua revalidate trong khoảng này sau khi người dùng mở cửa sổ lỗi. */
const REVALIDATE_SUPPRESS_MS = 3000;

class PopupState {
    constructor() {
        this.isActive = false;
        this.errorsVisible = true;
        this.resolvedErrorsVisible = false;
        this.selectedBreakpoint = ConfigurationManager.BREAKPOINTS.ALL;
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
    /**
     * Flatten a domain payload ({ path: [{ full_url, data }] }) into a flat error list.
     */
    static flattenErrors(domainData) {
        const allErrors = [];
        domainData?.path?.forEach((pathItem) => {
            if (Array.isArray(pathItem?.data)) {
                allErrors.push(...pathItem.data);
            }
        });
        return allErrors;
    }

    /**
     * Read the domain payload straight from the API server.
     */
    static async fetchErrorsFromApi(domainName) {
        const endpoint = `${ConfigurationManager.API.ENDPOINTS.GET_DOMAIN_DATA}?domain=${encodeURIComponent(domainName)}`;
        const url = ConfigurationManager.API.BASE_URL + endpoint;
        const accessToken = await AuthManager.getAccessToken();
        const headers = { 'Content-Type': 'application/json' };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

        const apiResponse = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
        });
        if (!apiResponse.ok) throw new Error(`API returned ${apiResponse.status}`);

        const apiData = await apiResponse.json();
        return apiData?.data ?? null;
    }

    /**
     * Errors already cached in the background worker. Instant, may be stale.
     */
    static async loadCachedErrors() {
        const domainName = await TabManager.getCurrentTabDomain();
        if (!domainName) return [];

        const response = await TabManager.sendMessageToBackground({
            action: 'getErrors',
            domainName,
        });
        return this.flattenErrors(response);
    }

    /**
     * Always hit the server, refresh the background cache, and fall back to
     * that cache when the request fails.
     */
    static async loadFreshErrors() {
        const domainName = await TabManager.getCurrentTabDomain();
        if (!domainName) return [];

        try {
            const domainData = await this.fetchErrorsFromApi(domainName);
            if (!domainData) throw new Error('Empty API payload');

            await TabManager.sendMessageToBackground({
                action: ConfigurationManager.ACTIONS.SET_ERRORS,
                errors: domainData,
                domainName,
            });
            return this.flattenErrors(domainData);
        } catch (error) {
            console.error('Failed to fetch errors in popup, falling back to cache', error);
            return await this.loadCachedErrors();
        }
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

    /**
     * Cheap fingerprint of everything the list actually renders. Equal signature
     * means a re-render would produce identical DOM.
     */
    static buildErrorsSignature(errors) {
        return errors
            .map((error) =>
                [
                    error.id,
                    error.status ?? 'open',
                    error.comments?.length ?? 0,
                    error.comments?.[error.comments.length - 1]?.text ?? '',
                    (error.bug_list_ids ?? []).join('.'),
                    error.breakpoint?.type ?? '',
                    error.url ?? '',
                ].join(':'),
            )
            .join('|');
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
        this.refreshRequestId = 0;
        this.lastErrors = [];
        this.lastErrorsSignature = '';
        this.suppressRevalidateUntil = 0;
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
                TabManager.createTab(
                    'https://github.com/keith-vo-macusa/check-web-extension/releases',
                );
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

        window.addEventListener('focus', () => this.revalidateErrorsList());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.revalidateErrorsList();
        });
    }

    setupBreakpointFilters() {
        $('#controls').append(
            `\n            <div class="breakpoint-filters">\n                <button class="filter-btn active" data-breakpoint="${ConfigurationManager.BREAKPOINTS.ALL}">Tất cả</button>\n                <button class="filter-btn" data-breakpoint="${ConfigurationManager.BREAKPOINTS.DESKTOP}">Desktop</button>\n                <button class="filter-btn" data-breakpoint="${ConfigurationManager.BREAKPOINTS.TABLET}">Tablet</button>\n                <button class="filter-btn" data-breakpoint="${ConfigurationManager.BREAKPOINTS.MOBILE}">Mobile</button>\n            </div>\n        `,
        );
        $('.filter-btn').click((event) => this.handleBreakpointFilter(event));
    }

    async handleToggleMode() {
        this.state.setActive(!this.state.isActive);
        this.state.setErrorsVisible(this.state.isActive);

        try {
            await TabManager.sendMessage({
                action: this.state.isActive ? ConfigurationManager.ACTIONS.ACTIVATE : ConfigurationManager.ACTIONS.DEACTIVATE,
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
                action: isVisible ? ConfigurationManager.ACTIONS.SHOW_ALL_ERRORS : ConfigurationManager.ACTIONS.HIDE_ALL_ERRORS,
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
        AlertManager.confirm('Xóa tất cả lỗi', ConfigurationManager.MESSAGES.remove_all_errors, 'Xóa', 'Hủy').then(
            async (result) => {
                if (result.isConfirmed)
                    try {
                        AlertManager.loading(ConfigurationManager.MESSAGES.loading);
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
            },
        );
    }

    async handleDrawOpenErrors(event) {
        const drawOpenErrors = $(event.target).prop('checked');
        await chrome.storage.local.set({ drawOpenErrors });
        this.state.setDrawOpenErrors(drawOpenErrors);

        try {
            await TabManager.sendMessage({
                action: ConfigurationManager.ACTIONS.DRAW_OPEN_ERRORS,
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
                action: ConfigurationManager.ACTIONS.DRAW_RESOLVED_ERRORS,
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
        // Lọc breakpoint là thao tác client-side, không cần gọi lại server.
        this.displayErrors(this.lastErrors);
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
                .html(
                    '<i class="fas fa-play-circle"></i> Chế độ: Đang hoạt động - Click vào vùng lỗi',
                )
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

    /**
     * Paint cached errors right away, then replace them with server data.
     * Late responses from a superseded call are discarded.
     */
    /**
     * Reload from the server.
     *
     * @param {object} options
     * @param {boolean} options.showSkeleton Skeleton chỉ dành cho refresh do người
     *   dùng chủ động gây ra. Revalidate ngầm phải im lặng.
     */
    async refreshErrorsList({ showSkeleton = true } = {}) {
        const requestId = ++this.refreshRequestId;
        if (showSkeleton) this.showErrorsLoading();

        // Options tải song song để chip loại lỗi có tên ngay ở lần vẽ đầu tiên.
        const [errors] = await Promise.all([
            ErrorManager.loadFreshErrors(),
            BugListService.loadOptions().catch(() => null),
        ]);
        if (requestId !== this.refreshRequestId) return;

        // Dữ liệu y hệt thì đừng vẽ lại: vẽ lại là mất vị trí cuộn và nháy màn hình.
        const signature = ErrorManager.buildErrorsSignature(errors);
        const isUnchanged = signature === this.lastErrorsSignature;
        this.lastErrors = errors;
        this.lastErrorsSignature = signature;

        if (isUnchanged && !showSkeleton) return;
        this.displayErrors(errors);
    }

    /**
     * Kiểm tra lại dữ liệu khi popup được focus lại — không skeleton, không vẽ lại
     * nếu không có gì đổi. Bỏ qua ngay sau khi người dùng bấm mở cửa sổ lỗi.
     */
    revalidateErrorsList() {
        if (Date.now() < this.suppressRevalidateUntil) return;
        this.refreshErrorsList({ showSkeleton: false });
    }

    /**
     * Skeleton rows sized like real error items, so the list does not jump
     * when server data replaces them.
     */
    showErrorsLoading() {
        const rowCount = Math.min(Math.max(this.lastErrors.length, 3), 5);
        const rows = Array.from(
            { length: rowCount },
            () => `
            <div class="error-item error-skeleton">
                <div class="error-row">
                    <div class="error-main">
                        <div class="skeleton-block skeleton-line skeleton-topline"></div>
                        <div class="skeleton-block skeleton-line skeleton-text"></div>
                        <div class="skeleton-block skeleton-line skeleton-bottomline"></div>
                    </div>
                    <div class="error-actions">
                        <div class="skeleton-block skeleton-action"></div>
                        <div class="skeleton-block skeleton-action"></div>
                    </div>
                </div>
            </div>
        `,
        ).join('');

        $('#errorsList').html(
            `<div class="errors-loading" role="status" aria-label="Đang tải danh sách lỗi">${rows}</div>`,
        );
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
                this.state.selectedBreakpoint === ConfigurationManager.BREAKPOINTS.ALL ||
                (!!error.breakpoint && error.breakpoint.type === this.state.selectedBreakpoint),
        );
    }

    renderErrorsList(container, errors) {
        const openErrors = errors.filter((error) => !error.status || error.status === 'open');
        const resolvedErrors = errors.filter((error) => error.status === 'resolved');

        const openCount = openErrors.length || 0;
        const resolvedCount = resolvedErrors.length || 0;
        container.append(
            `\n                <div class="error-count">\n                    <span>Tổng số lỗi: ${errors.length}</span>\n                    <span class="breakpoint-label">\n                        ${this.state.selectedBreakpoint === ConfigurationManager.BREAKPOINTS.ALL ? 'Tất cả breakpoint' : `Breakpoint ${this.state.selectedBreakpoint}`}\n                    </span>\n                </div>\n                <div class="error-group">\n                    <div class="error-group-header">\n                        <span>Errors: ${openCount} - Resolved: ${resolvedCount}/${errors.length}</span>\n                    </div>\n                </div>\n            `,
        );

        errors.forEach((error, index) => this.renderErrorItem(container, error, index));
    }

    /**
     * Bug list tags of an error, resolved to names via the cached options.
     * Ids no longer active stay visible (styled as unknown) instead of vanishing.
     */
    buildBugListMarkup(error) {
        const selectedIds = BugListService.sanitizeIds(error.bug_list_ids);
        if (selectedIds.length === 0) return '';

        // Options chưa tải được thì mọi id đều "chưa biết tên" — đừng tô đỏ như tag hỏng.
        const isOptionsLoaded = BugListService.cachedOptions !== null;
        const chips = BugListService.resolveSelected(BugListService.cachedOptions ?? [], selectedIds)
            .map((option) => {
                const safeName = this.escapeHtml(option.name);
                const unknownClass = option.isUnknown && isOptionsLoaded ? ' is-unknown' : '';
                return `<span class="error-bug-tag${unknownClass}" title="${safeName}">${safeName}</span>`;
            })
            .join('');

        return `<div class="error-bug-list">${chips}</div>`;
    }

    renderErrorItem(container, error, index) {
        const errorItem = $('<div>').addClass('error-item');
        if (error.status === 'resolved') errorItem.addClass('resolved');
        if (error.status === 'closed') errorItem.addClass('closed');
        if (!error.status || error.status === 'open') errorItem.addClass('open');

        const timestamp = error.timestamp ? new Date(error.timestamp).toLocaleString('vi-VN') : '';
        const comments = Array.isArray(error.comments) ? error.comments : [];
        const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
        const statusBadge = this.createStatusBadge(error.status);
        const isResolved = error.status === 'resolved';
        const resolvedClass = isResolved ? 'bg-success' : '';
        const commentText = this.escapeHtml(lastComment?.text || '');
        const commentsCount = comments.length;
        const breakpointType = error.breakpoint ? error.breakpoint.type : 'all';
        const breakpointWidth = error.breakpoint ? `${error.breakpoint.width}px` : '';
        const safeUrl = this.escapeHtml(error.url || '');
        const bugListMarkup = this.buildBugListMarkup(error);

        errorItem.html(
            `\n            <div class="error-row">\n                <div class="error-main">\n                    <div class="error-topline">\n                        <span class="error-number">#${index + 1}</span>\n                        ${statusBadge}\n                        <span class="error-meta-pill">${commentsCount} comment</span>\n                        ${timestamp ? `<span class="error-time">${timestamp}</span>` : ''}\n                    </div>\n\n                    <div class="error-comment">${commentText || '<span class="error-empty">Không có nội dung</span>'}</div>\n\n                    ${bugListMarkup}\n                    <div class="error-bottomline">\n                        <span class="breakpoint-type">${breakpointType}</span>\n                        ${breakpointWidth ? `<span class="breakpoint-width">${breakpointWidth}</span>` : ''}\n                        ${safeUrl ? `<span class="error-url" title="${safeUrl}">${safeUrl}</span>` : ''}\n                    </div>\n                </div>\n\n                <div class="error-actions">\n                    <button class="btn-toogle-check-fixed ${resolvedClass}" data-fixed="${isResolved}" title="${isResolved ? 'Bỏ đánh dấu đã giải quyết' : 'Đánh dấu đã giải quyết'}" aria-label="${isResolved ? 'Bỏ đánh dấu đã giải quyết' : 'Đánh dấu đã giải quyết'}">\n                        <i class="fa-solid ${isResolved ? 'fa-x' : 'fa-check'}"></i>\n                    </button>\n                    <button class="delete-error-btn" title="Xóa lỗi này" aria-label="Xóa lỗi này">\n                        <i class="fa-solid fa-trash"></i>\n                    </button>\n                </div>\n            </div>\n        `,
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
            AlertManager.confirm('Xóa lỗi', ConfigurationManager.MESSAGES.remove_error, 'Xóa', 'Hủy').then(
                async (result) => {
                    if (result.isConfirmed)
                        try {
                            AlertManager.loading(ConfigurationManager.MESSAGES.loading);
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
                },
            );
        });

        errorItem.find('.btn-toogle-check-fixed').click(async (event) => {
            event.stopPropagation();
            AlertManager.confirm(
                'Thay đổi trạng thái',
                ConfigurationManager.MESSAGES.change_status_error,
                'Check',
                'Hủy',
            ).then(async (result) => {
                if (result.isConfirmed)
                    try {
                        AlertManager.loading(ConfigurationManager.MESSAGES.loading);
                        const domainName = await TabManager.getCurrentTabDomain();
                        const response = await TabManager.sendMessageToBackground({
                            action: ConfigurationManager.ACTIONS.CHECK_FIXED,
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
            if (!error.url) {
                AlertManager.error('Lỗi này không có URL để mở');
                return;
            }

            // Mở cửa sổ lỗi sẽ cướp rồi trả lại focus cho popup; đừng để cú focus
            // đó kích hoạt revalidate và làm nháy danh sách.
            this.suppressRevalidateUntil = Date.now() + REVALIDATE_SUPPRESS_MS;

            try {
                await TabManager.sendMessageToBackground({
                    action: 'openOrResizeErrorWindow',
                    url: error.url,
                    width: error.breakpoint?.width,
                    height: error.breakpoint?.height,
                    errorId: error.id,
                });
            } catch (openError) {
                console.error('Cannot open error window', openError);
            } finally {
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
        // Sự kiện nền, không phải người dùng bấm — cập nhật im lặng.
        if (message.action === 'errorAdded' && uiManager)
            uiManager.refreshErrorsList({ showSkeleton: false });
    });

    const domainName = await TabManager.getCurrentTabDomain();
    const isAuthorized = await TabManager.sendMessageToBackground({
        action: 'checkAuthorized',
        domainName,
    });

    if (!isAuthorized)
        return void AlertManager.errorWithOutClose(
            'Lỗi',
            `${domainName} chưa được khởi tạo trên Checkwise`,
        );

    const sendNotification = async (userInfo, notificationType) => {
        AlertManager.confirm(
            'Gửi thông báo',
            ConfigurationManager.MESSAGES[notificationType] || 'Bạn có chắc muốn gửi thông báo không?',
            'Gửi',
            'Hủy',
        ).then(async (result) => {
            if (result.isConfirmed) {
                await NotificationManager.sendMarkErrorsResolevedOrNewErrors(
                    userInfo,
                    notificationType,
                );
            }
        });
    };

    try {
        if (!(await AuthManager.isAuthenticated()))
            return void (window.location.href = 'login.html');

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
                                action: ConfigurationManager.ACTIONS.DEACTIVATE,
                                reason: 'logout',
                            });
                            await TabManager.sendMessage({
                                action: ConfigurationManager.ACTIONS.HIDE_ALL_ERRORS,
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
            const permName = (p) => (typeof p === 'string' ? p : p?.name);
            const hasPermission = (name) =>
                (userInfo.permissions ?? []).some((p) => permName(p) === name) ||
                (userInfo.roles ?? []).some((role) =>
                    [...(role.permissions ?? []), ...(role.permissons ?? [])].some(
                        (p) => permName(p) === name,
                    ),
                );

            const hasQCErrorPermission = hasPermission(
                ConfigurationManager.PERMISSION.SITE_CHECK_QC_ERROR,
            );
            const hasMemberPermission = hasPermission(
                ConfigurationManager.PERMISSION.SITE_CHECK_FIXER,
            );

            if (hasQCErrorPermission) {
                toggleModeSection.show();
                $('#sendBugFoundNotification').show();
                $('#sendBugFoundNotification').click(() => {
                    sendNotification(userInfo, ConfigurationManager.NOTIFICATION_TYPES.BUG_FOUND);
                });
            } else {
                toggleModeSection.hide();
            }

            if (hasMemberPermission) {
                $('#sendBugFixedNotification').show();
                $('#sendBugFixedNotification').click(() => {
                    sendNotification(userInfo, ConfigurationManager.NOTIFICATION_TYPES.BUG_FIXED);
                });
            }
        }

        const popupState = new PopupState();
        uiManager = new UIManager(popupState);

        try {
            const contentState = await TabManager.sendMessage({ action: ConfigurationManager.ACTIONS.GET_STATE });
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
