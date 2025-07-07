// Constants
const BREAKPOINTS = {
    ALL: 'all',
    DESKTOP: 'desktop',
    TABLET: 'tablet',
    MOBILE: 'mobile'
};

const typeNotification = {
    BUG_FOUND: 'bug_found',
    BUG_FIXED: 'bug_fixed'
}

const text = {
    [typeNotification.BUG_FOUND]: 'Bạn có chắc muốn gửi thông báo lỗi không?',
    [typeNotification.BUG_FIXED]: 'Bạn có chắc muốn gửi thông báo đã sửa tất cả lỗi không?',
}

// Browser API compatibility
const browserAPI = chrome;

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
        browserAPI.storage.local.set({
            errorsVisible: value
        });
    }

    setSelectedBreakpoint(value) {
        this.selectedBreakpoint = value;
    }

    setResolvedErrorsVisible(value) {
        this.resolvedErrorsVisible = value;
        document.body.setAttribute('data-show-resolved', value);
        browserAPI.storage.local.set({
            resolvedErrorsVisible: value
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

        const result = await TabManager.sendMessageToBackground({
            action: 'getErrors',
        });

        let errors = [];

        if (result?.path) {
            result.path?.forEach(path => {
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
            errorId
        });

    }

    static async clearAllErrors() {
        const tabs = await TabManager.getCurrentTab();
        if (!tabs || !tabs[0]) return;

        // const url = tabs[0].url;
        // await browserAPI.storage.local.set({[url]: []});
        return await TabManager.sendMessage({
            action: 'clearAllErrors'
        });
    }

    static sortErrors(errors) {
        const statusPriority = {
            'open': 1,
            'resolved': 2,
            'closed': 3
        };

        return errors.sort((a, b) => {
            // Sort by status priority first
            const statusDiff = statusPriority[a.status || 'open'] - statusPriority[b.status || 'open'];
            if (statusDiff !== 0) return statusDiff;

            // If same status, sort by timestamp (newest first)
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
    }
}

// Tab Management
class TabManager {
    static async getCurrentTab() {
        return await browserAPI.tabs.query({
            active: true,
            currentWindow: true
        });
    }

    static async sendMessage(message) {
        try {
            const tabs = await this.getCurrentTab();
            if (tabs && tabs[0]) {
                return await browserAPI.tabs.sendMessage(tabs[0].id, message);
            }
        } catch (error) {
            // Content script not available - this is normal for special pages
            console.log('Cannot send message to content script:', error.message);
            return null;
        }
    }

    static async sendMessageToBackground(message) {
        return await browserAPI.runtime.sendMessage(message);
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


        const {errorsVisible} = await browserAPI.storage.local.get('errorsVisible');

        if (errorsVisible) {
            $('#toggleErrors').prop('checked', true);
        }

        $('#drawOpenErrors').prop('disabled', !errorsVisible);
        $('#drawResolvedErrors').prop('disabled', !errorsVisible);

        const {
            drawOpenErrors
        } = await browserAPI.storage.local.get('drawOpenErrors');
        $('#drawOpenErrors').prop('checked', drawOpenErrors);


        const {
            drawResolvedErrors
        } = await browserAPI.storage.local.get('drawResolvedErrors');
        $('#drawResolvedErrors').prop('checked', drawResolvedErrors);
    }

    checkForUpdates() {
        // check local storage xem có thể có update không updateAvailable = true
        browserAPI.storage.local.get(['latestVersion'], (data) => {
            if (data.latestVersion) {
                const currentVersion = browserAPI.runtime.getManifest().version;
                if (data.latestVersion != currentVersion) {
                    this.showUpdateNotification();
                }
            }
        });
    }

    showUpdateNotification() {
        Swal.fire({
            title: 'Cập nhật',
            text: 'Có phiên bản mới có sẵn. Nhấp để cập nhật.',
            icon: 'info',
            confirmButtonText: 'Cập nhật',
            cancelButtonText: 'Hủy',
            showCancelButton: true,
        }).then((result) => {
            if (result.isConfirmed) {
                browserAPI.tabs.create({
                    url: 'https://github.com/keith-vo-macusa/check-web-extension/releases'
                });
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
                action: this.state.isActive ? 'activate' : 'deactivate'
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
                action: isVisible ? 'showAllErrors' : 'hideAllErrors'
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
        Swal.fire({
            title: 'Xóa tất cả lỗi',
            text: 'Bạn có chắc muốn xóa tất cả lỗi không?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Xóa',
            cancelButtonText: 'Hủy'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const result = await ErrorManager.clearAllErrors();
                    if(result?.success){
                        this.refreshErrorsList();
                    }
                    else{
                        console.error('Error clearing all errors:', result?.message);
                    }
                } catch (error) {
                    console.log('Cannot clear errors - content script not available');
                }
            }
        });
    }

    async handleDrawOpenErrors(event) {
        const isDraw = $(event.target).prop('checked');
        await browserAPI.storage.local.set({
            drawOpenErrors: isDraw
        });
        this.state.setDrawOpenErrors(isDraw);

        try {
            await TabManager.sendMessage({
                action: 'drawOpenErrors',
                drawOpenErrors: isDraw,
            });
        } catch (error) {
            console.log('Cannot draw open errors - content script not available');
        }
    }

    async handleDrawResolvedErrors(event) {
        const isDraw = $(event.target).prop('checked');
        await browserAPI.storage.local.set({
            drawResolvedErrors: isDraw
        });
        this.state.setDrawResolvedErrors(isDraw);

        try {
            await TabManager.sendMessage({
                action: 'drawResolvedErrors',
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
            btn.html('<i class="fas fa-stop"></i> Dừng chọn lỗi').removeClass('btn-primary').addClass('active');
            status.html('<i class="fas fa-play-circle"></i> Chế độ: Đang hoạt động - Click vào vùng lỗi').removeClass('inactive').addClass('active');
        } else {
            btn.html('<i class="fas fa-crosshairs"></i> Bắt đầu chọn lỗi').removeClass('active').addClass('btn-primary');
            status.html('<i class="fas fa-pause-circle"></i> Chế độ: Không hoạt động').removeClass('active').addClass('inactive');
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
        return errors.filter(error => {
            if (this.state.selectedBreakpoint === BREAKPOINTS.ALL) return true;
            if (!error.breakpoint) return false;
            return error.breakpoint.type === this.state.selectedBreakpoint;
        });
    }

    renderErrorsList(container, errors) {
        // Group errors by status
        const errorGroups = {
            open: errors.filter(e => !e.status || e.status === 'open'),
            resolved: errors.filter(e => e.status === 'resolved'),
            closed: errors.filter(e => e.status === 'closed')
        };

        // Render each group with a header
        if (errorGroups.open.length >= 0) {
            const errorsOpen = errorGroups.open?.length || 0;
            const errorsResolved = errorGroups.resolved?.length || 0;
            container.append(`
                <div class="error-count">
                    <span>Tổng số lỗi: ${errors.length}</span>
                    <span class="breakpoint-label">
                        ${this.state.selectedBreakpoint === BREAKPOINTS.ALL ? 'Tất cả breakpoint' : `Breakpoint ${this.state.selectedBreakpoint}`}
                    </span>
                </div>
                <div class="error-group">
                    <div class="error-group-header">
                        <span>Errors: ${errorsOpen} - Resolved: ${errorsResolved}/${errors.length}</span>
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
            <div class="error-comment">${latestComment.text}</div>
            <div class="error-breakpoint">
                <span class="breakpoint-type">${error.breakpoint ? error.breakpoint.type : 'all'}</span>
                <span class="breakpoint-width">${error.breakpoint ? error.breakpoint.width + 'px' : ''}</span>
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
            Swal.fire({
                title: 'Xóa lỗi',
                text: 'Bạn có chắc muốn xóa lỗi này không?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Xóa',
                cancelButtonText: 'Hủy'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try{
                        const result = await ErrorManager.deleteError(error.id);
                        if(result?.success){
                            this.refreshErrorsList();
                        }
                        else{
                            console.error('Error deleting error:', result?.message);
                        }
                    }
                    catch(error){
                        console.error('Error deleting error:', error);
                    }
                }
            });
        });

        errorItem.find('.btn-toogle-check-fixed').click(async (e) => {
            e.stopPropagation();
            Swal.fire({
                title: 'Thay đổi trạng thái',
                text: 'Bạn có chắc muốn thay đổi trạng thái của lỗi này không?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Check',
            }).then(async (result) => {
                if (result.isConfirmed) {
                   try{
                        const result = await TabManager.sendMessage({ action: "checkFixed", errorId: error.id });
                        if (result?.success) {
                            this.refreshErrorsList();
                        } else {
                            console.log("Cập nhật lỗi thất bại:", result?.message);
                        }
                   }
                   catch(error){
                        console.error('Error checking fixed:', error);
                   }
                }
            });
        });

        errorItem.click(async () => {
            try {
                const result = await TabManager.sendMessage({
                    action: 'highlightError',
                    error: error
                });
                if(result?.success){
                    this.refreshErrorsList();
                }
                else{
                    console.error('Error highlighting error:', result?.message);
                }
            } catch (error) {
                console.log('Cannot highlight error - content script not available');
            }
        });
    }
}

// Initialize Application
$(document).ready(async function() {
    if (!browserAPI || !browserAPI.tabs) {
        $('#errorsList').html('<div class="no-errors">❌ Extension chỉ hỗ trợ Chrome/Edge</div>');
        return;
    }
    

    const showConfirmSendNotification = async (userInfo, type) => {
        
        Swal.fire({
            title: 'Gửi thông báo',
            text: text[type] || 'Bạn có chắc muốn gửi thông báo không?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Gửi', 
            cancelButtonText: 'Hủy'
        }).then(async (result) => {
            if (result.isConfirmed) {
                await handleSendNotification(userInfo, type);
            }
        });
    }

    const handleSendNotification = async(userInfo,type) => {
        
        const tab = await TabManager.getCurrentTab();
        const domainUrl = new URL(tab[0].url).hostname;
        const btnNotification = $('#sendNotification');
        await $.ajax({
            type: "POST",
            url: "https://checkwise.macusaone.com/api_domain_data.php?action=send_telegram",
            data: JSON.stringify({
                email: userInfo.email,
                type: type,
                domain_url: domainUrl
            }),
            dataType: "json",
            beforeSend: function() {
                btnNotification.prop('disabled', true);
            },
            complete: function() {
                btnNotification.prop('disabled', false);
            },
            success: function (response) {
                if(response.success) {
                    Swal.fire({
                        title: 'Thông báo',
                        text: response.message,
                        icon: 'success',
                    });
                }
            },
            error: function (response) {
                Swal.fire({
                    title: 'Thông báo',
                    text: response.responseJSON.message,
                    icon: 'error',
                });
            }
        });
    }

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
                Swal.fire({
                    title: 'Đăng xuất',
                    text: 'Bạn có chắc muốn đăng xuất không?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Đăng xuất',
                    cancelButtonText: 'Hủy'
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            await browserAPI.storage.local.remove(['feedback']);
                            const success = await AuthManager.logout();

                            try {
                                await TabManager.sendMessage({
                                    action: 'deactivate',
                                    reason: 'logout'
                                });

                                await TabManager.sendMessage({
                                    action: 'hideAllErrors'
                                });

                                // refresh current tab
                                chrome.tabs.query({
                                    active: true,
                                    currentWindow: true
                                }, function(tabs) {
                                    chrome.tabs.reload(tabs[0].id);
                                });
                                window.close();
                            } catch (error) {
                                console.log('Cannot send logout messages to content script');
                            }

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
            if (userInfo.email == 'hana.web@macusaone.com') {
                $('#sendNotification').text('Gửi thông báo lỗi');
                $('#sendNotification').click(() => {
                    showConfirmSendNotification(userInfo,typeNotification.BUG_FOUND);
                });
            } else {
                $('#sendNotification').text('Gửi thông báo đã sửa tất cả lỗi');
                $('#sendNotification').click(() => {
                    showConfirmSendNotification(userInfo,typeNotification.BUG_FIXED);
                });
            }
        }

        const state = new PopupState();
        const ui = new UIManager(state);

        // Load initial state - handle case where content script is not available
        try {
            const response = await TabManager.sendMessage({
                action: 'getState'
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

        // Listen for messages from content script
        browserAPI.runtime.onMessage.addListener((request) => {
            if (request.action === 'errorAdded') {
                ui.refreshErrorsList();
            }
        });
    } catch (error) {
        console.error('Error during initialization:', error);
        window.location.href = 'login.html';
    }
});