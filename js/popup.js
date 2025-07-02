// Constants
const BREAKPOINTS = {
    ALL: 'all',
    DESKTOP: 'desktop',
    TABLET: 'tablet',
    MOBILE: 'mobile'
};

// Browser API compatibility
const browserAPI = chrome;

// State Management
class PopupState {
    constructor() {
        this.isActive = false;
        this.errorsVisible = true;
        this.resolvedErrorsVisible = false;
        this.selectedBreakpoint = BREAKPOINTS.ALL;
        
        // Set initial state
        document.body.setAttribute('data-show-resolved', this.resolvedErrorsVisible);
    }

    setActive(value) {
        this.isActive = value;
    }

    setErrorsVisible(value) {
        this.errorsVisible = value;
        browserAPI.storage.local.set({errorsVisible: value});
    }

    setSelectedBreakpoint(value) {
        this.selectedBreakpoint = value;
    }

    setResolvedErrorsVisible(value) {
        this.resolvedErrorsVisible = value;
        document.body.setAttribute('data-show-resolved', value);
        browserAPI.storage.local.set({resolvedErrorsVisible: value});
    }
}

// Error Management
class ErrorManager {
    static async loadErrors() {
        const tabs = await TabManager.getCurrentTab();
        if (!tabs || !tabs[0]) return [];

        const result = await browserAPI.storage.local.get(['feedback']);
        let errors = [];
        
        if (result?.feedback?.path) {
            result.feedback.path.forEach(path => {
                errors.push(...path.data);
            });
        }
        
        return errors;
    }

    static async deleteError(errorId) {
        const tabs = await TabManager.getCurrentTab();
        if (!tabs || !tabs[0]) return;

        const url = tabs[0].url;
        const result = await browserAPI.storage.local.get(['feedback']);
        let feedback = result.feedback || { path: [] };
        
        const pathIndex = feedback.path.findIndex(p => p.full_url === url);
        if (pathIndex === -1) return;

        const errorIndex = feedback.path[pathIndex].data.findIndex(e => e.id === errorId);
        if (errorIndex === -1) return;

        feedback.path[pathIndex].data.splice(errorIndex, 1);

        if (feedback.path[pathIndex].data.length === 0) {
            feedback.path.splice(pathIndex, 1);
        }

        await browserAPI.storage.local.set({ feedback });
        await TabManager.sendMessage({ action: 'removeError', errorId });
    }

    static async clearAllErrors() {
        const tabs = await TabManager.getCurrentTab();
        if (!tabs || !tabs[0]) return;

        const url = tabs[0].url;
        await browserAPI.storage.local.set({[url]: []});
        await TabManager.sendMessage({ action: 'clearAllErrors' });
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
        return await browserAPI.tabs.query({active: true, currentWindow: true});
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
        if(errorsVisible) {
            $('#toggleErrors').prop('checked', true);
        }
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

    showUpdateNotification(){
        Swal.fire({
            title: 'Cập nhật',
            text: 'Có phiên bản mới có sẵn. Nhấp để cập nhật.',
            icon: 'info',
            confirmButtonText: 'Cập nhật',
            allowOutsideClick: false
        }).then((result) => {
            if (result.isConfirmed) {
                browserAPI.tabs.create({ url: 'https://github.com/keith-vo-macusa/check-web-extension/releases' });
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
                    await ErrorManager.clearAllErrors();
                    setTimeout(() => this.refreshErrorsList(), 250);
                } catch (error) {
                    console.log('Cannot clear errors - content script not available');
                }
            }
        });
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

        if (!errors || errors.length === 0) {
            container.html('<div class="no-errors">Chưa có lỗi nào được ghi nhận</div>');
            return;
        }

        const filteredErrors = this.filterErrorsByBreakpoint(errors);
        
        if (filteredErrors.length === 0) {
            container.html(`<div class="no-errors">Không có lỗi nào ${this.state.selectedBreakpoint !== BREAKPOINTS.ALL ? `trong breakpoint ${this.state.selectedBreakpoint}` : ''}</div>`);
            return;
        }

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
        if (errorGroups.open.length > 0) {
            const errorsOpen = errorGroups.open.length;
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

        errorItem.html(`
            <div class="error-header">
                <span class="error-number">#${index + 1}</span>
                ${statusBadge}
                <span class="error-time">${timeString}</span>
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
                return badge.addClass('resolved').text('Đã giải quyết').prop('outerHTML');
            case 'closed':
                return badge.addClass('closed').text('Đã đóng').prop('outerHTML');
            default:
                return badge.addClass('open').text('Đang mở').prop('outerHTML');
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
                    await ErrorManager.deleteError(error.id);
                    this.refreshErrorsList();
                }
            });
        });

        errorItem.click(async () => {
            try {
                await TabManager.sendMessage({
                    action: 'highlightError',
                    errorId: error.id
                });
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
                            
                            // refresh all page in browser
                            chrome.tabs.query({}, function(tabs) {
                                tabs.forEach(function(tab) {
                                    chrome.tabs.reload(tab.id);
                                });
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
        }

        const state = new PopupState();
        const ui = new UIManager(state);
        
        // Load initial state - handle case where content script is not available
        try {
            const response = await TabManager.sendMessage({ action: 'getState' });
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