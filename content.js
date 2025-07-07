/**
 * Website Testing Assistant - Content Script
 * Handles error detection, annotation, and management on web pages
 */

/**
 * Content Script Constants
 */
const ContentScriptConstants = {
    API_ENDPOINT: 'https://checkwise.macusaone.com/api_domain_data.php',
    DESKTOP_BREAKPOINT: 1140,
    RANGE_BREAKPOINT: 20,
    DOM_SELECTORS: {
        TESTING_ELEMENTS: '.testing-error-marker, .testing-comment-thread, .testing-comment-modal, .testing-error-border',
        ELEMENTOR_ELEMENTS: '.elementor-element'
    },
    CSS_CLASSES: {
        SELECTION_MODE: 'testing-selection-mode',
        HIGHLIGHT: 'testing-highlight',
        ERROR_BORDER: 'testing-error-border',
        ERROR_HIGHLIGHT: 'testing-error-highlight',
        DRAG_OVERLAY: 'testing-drag-overlay',
        MODAL_BACKDROP: 'testing-modal-backdrop',
        COMMENT_MODAL: 'testing-comment-modal'
    },
    MOUSE_DRAG_THRESHOLD: 5,
    HIGHLIGHT_DURATION: 1000
};

/**
 * UUID Generation Utility
 */
class UUIDGenerator {
    /**
     * Generate a simple UUID
     * @returns {string} Generated UUID
     */
    static generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const randomValue = (Math.random() * 16) | 0;
            const hexValue = c === 'x' ? randomValue : (randomValue & 0x3) | 0x8;
            return hexValue.toString(16);
        });
    }
}

/**
 * Browser Storage Manager
 * Handles browser storage operations for the content script
 */
class BrowserStorageManager {
    constructor() {
        this.browserAPI = window.chrome || window.browser;
    }

    /**
     * Get user information from storage
     * @returns {Promise<Object|null>} User information or null
     */
    async getUserInfo() {
        try {
            const result = await this.browserAPI.storage.local.get(['userInfo']);
            return result.userInfo || null;
        } catch (error) {
            console.error('Error getting user info:', error);
            return null;
        }
    }

    /**
     * Get storage data by keys
     * @param {string|Array} keys - Storage keys
     * @returns {Promise<Object>} Storage data
     */
    async getStorageData(keys) {
        try {
            return await this.browserAPI.storage.local.get(keys);
        } catch (error) {
            console.error('Error getting storage data:', error);
            return {};
        }
    }

    /**
     * Set storage data
     * @param {Object} data - Data to store
     * @returns {Promise<void>}
     */
    async setStorageData(data) {
        try {
            await this.browserAPI.storage.local.set(data);
        } catch (error) {
            console.error('Error setting storage data:', error);
        }
    }
}

/**
 * Mouse Interaction Manager
 * Handles mouse events for element selection and dragging
 */
class MouseInteractionManager {
    constructor(onElementSelected, onRectangleSelected) {
        this.onElementSelected = onElementSelected;
        this.onRectangleSelected = onRectangleSelected;
        
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.selectedElement = null;
        this.dragOverlay = null;
        
        this.setupBoundMethods();
    }

    /**
     * Setup bound methods for proper event listener removal
     */
    setupBoundMethods() {
        this.boundHandleMouseDown = this.handleMouseDown.bind(this);
        this.boundHandleMouseMove = this.handleMouseMove.bind(this);
        this.boundHandleMouseUp = this.handleMouseUp.bind(this);
        this.boundHandleMouseOver = this.handleMouseOver.bind(this);
        this.boundHandleMouseOut = this.handleMouseOut.bind(this);
        this.boundPreventLinkClick = this.preventLinkClick.bind(this);
    }

    /**
     * Activate mouse interaction listeners
     */
    activateMouseListeners() {
        document.addEventListener('mousedown', this.boundHandleMouseDown, true);
        document.addEventListener('mouseover', this.boundHandleMouseOver, true);
        document.addEventListener('mouseout', this.boundHandleMouseOut, true);
        document.addEventListener('click', this.boundPreventLinkClick, true);
    }

    /**
     * Deactivate mouse interaction listeners
     */
    deactivateMouseListeners() {
        document.removeEventListener('mousedown', this.boundHandleMouseDown, true);
        document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
        document.removeEventListener('mouseout', this.boundHandleMouseOut, true);
        document.removeEventListener('click', this.boundPreventLinkClick, true);
        
        this.removeTemporaryListeners();
    }

    /**
     * Remove temporary mouse listeners
     */
    removeTemporaryListeners() {
        document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
        document.removeEventListener('mouseup', this.boundHandleMouseUp, true);
    }

    /**
     * Handle mouse over events
     * @param {Event} event - Mouse event
     */
    handleMouseOver(event) {
        if (!event.target.closest(ContentScriptConstants.DOM_SELECTORS.ELEMENTOR_ELEMENTS)) return;

        event.stopPropagation();
        
        const targetElement = this.getTargetElement(event.target);
        this.removeElementHighlight();
        targetElement.classList.add(ContentScriptConstants.CSS_CLASSES.HIGHLIGHT);
        this.selectedElement = targetElement;
    }

    /**
     * Handle mouse out events
     * @param {Event} event - Mouse event
     */
    handleMouseOut(event) {
        event.stopPropagation();
        const targetElement = this.getTargetElement(event.target);
        targetElement.classList.remove(ContentScriptConstants.CSS_CLASSES.HIGHLIGHT);
    }

    /**
     * Handle mouse down events
     * @param {Event} event - Mouse event
     */
    handleMouseDown(event) {
        if (event.button !== 0) return;
        if (!event.target.closest(ContentScriptConstants.DOM_SELECTORS.ELEMENTOR_ELEMENTS)) return;

        event.preventDefault();
        event.stopPropagation();

        this.isDragging = false;
        this.startX = event.pageX;
        this.startY = event.pageY;
        this.selectedElement = this.getTargetElement(event.target);

        document.addEventListener('mousemove', this.boundHandleMouseMove, true);
        document.addEventListener('mouseup', this.boundHandleMouseUp, true);
    }

    /**
     * Handle mouse move events
     * @param {Event} event - Mouse event
     */
    handleMouseMove(event) {
        const deltaX = Math.abs(event.pageX - this.startX);
        const deltaY = Math.abs(event.pageY - this.startY);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance > ContentScriptConstants.MOUSE_DRAG_THRESHOLD && !this.isDragging) {
            this.isDragging = true;
            this.createDragOverlay();
        }

        if (this.isDragging) {
            this.updateDragOverlay(event.pageX, event.pageY);
        }
    }

    /**
     * Handle mouse up events
     * @param {Event} event - Mouse event
     */
    handleMouseUp(event) {
        this.removeTemporaryListeners();

        if (this.isDragging) {
            this.finalizeDragSelection();
        } else {
            this.onElementSelected(this.selectedElement);
        }

        this.cleanupDragOperation();
    }

    /**
     * Get target element for interaction
     * @param {Element} element - DOM element
     * @returns {Element} Target element
     */
    getTargetElement(element) {
        // Skip testing assistant elements
        if (element.closest(ContentScriptConstants.DOM_SELECTORS.TESTING_ELEMENTS)) {
            return document.body;
        }
        return element;
    }

    /**
     * Create drag overlay for rectangle selection
     */
    createDragOverlay() {
        this.dragOverlay = document.createElement('div');
        this.dragOverlay.className = ContentScriptConstants.CSS_CLASSES.DRAG_OVERLAY;
        document.body.appendChild(this.dragOverlay);
    }

    /**
     * Update drag overlay position and size
     * @param {number} currentX - Current X position
     * @param {number} currentY - Current Y position
     */
    updateDragOverlay(currentX, currentY) {
        if (!this.dragOverlay) return;

        const left = Math.min(this.startX, currentX);
        const top = Math.min(this.startY, currentY);
        const width = Math.abs(currentX - this.startX);
        const height = Math.abs(currentY - this.startY);

        this.dragOverlay.style.left = `${left}px`;
        this.dragOverlay.style.top = `${top}px`;
        this.dragOverlay.style.width = `${width}px`;
        this.dragOverlay.style.height = `${height}px`;
    }

    /**
     * Finalize drag selection
     */
    finalizeDragSelection() {
        if (!this.dragOverlay) return;

        const rectangleCoordinates = {
            left: parseFloat(this.dragOverlay.style.left),
            top: parseFloat(this.dragOverlay.style.top),
            width: parseFloat(this.dragOverlay.style.width),
            height: parseFloat(this.dragOverlay.style.height)
        };

        if (rectangleCoordinates.width >= 10 && rectangleCoordinates.height >= 10) {
            this.onRectangleSelected(rectangleCoordinates);
        }
    }

    /**
     * Cleanup drag operation
     */
    cleanupDragOperation() {
        this.isDragging = false;
        if (this.dragOverlay) {
            this.dragOverlay.remove();
            this.dragOverlay = null;
        }
    }

    /**
     * Remove element highlight
     */
    removeElementHighlight() {
        const highlightedElements = document.querySelectorAll(`.${ContentScriptConstants.CSS_CLASSES.HIGHLIGHT}`);
        highlightedElements.forEach(element => element.classList.remove(ContentScriptConstants.CSS_CLASSES.HIGHLIGHT));
    }

    /**
     * Prevent link clicks during selection mode
     * @param {Event} event - Click event
     */
    preventLinkClick(event) {
        const linkElement = event.target.closest('a');
        if (linkElement) {
            event.preventDefault();
            event.stopPropagation();
        }
    }
}

class WebsiteTestingAssistant {
    constructor() {
        this.isActive = false;
        this.errors = [];
        this.currentTabErrors = [];
        this.selectedElement = null;
        this.highlightOverlay = null;
        this.commentModal = null;
        this.currentUrl = window.location.href;
        this.errorBorders = [];
        this.userInfo = null;
        this.apiEndpoint = 'https://checkwise.macusaone.com/api_domain_data.php';
        this.rangeBreakpoint = 20;
        this.documentLength = document.documentElement.innerHTML.length;
        this.browserAPI = window.chrome || window.browser;
        this.desktopBreakpoint = 1140;

        // Mouse tracking for drag detection
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.dragOverlay = null;
        this.drawOpenErrors = false;
        this.drawResolvedErrors = false;
        this.allErrorsVisible = false; // Flag để theo dõi trạng thái show/hide tổng quát
        this.init();
    }

    async getUserInfo() {
        try {
            const result = await chrome.storage.local.get(['userInfo']);
            return result.userInfo || null;
        } catch (error) {
            console.error('Error getting user info:', error);
            return null;
        }
    }

    async init() {
        this.userInfo = await this.getUserInfo();
        if (!this.userInfo) {
            return;
        }
        this.initDraw();
        await this.fetchDataFromAPI();
        this.bindEvents();
        this.displayExistingErrors();
    }

    bindEvents() {
        // Cross-browser API wrapper

        // Listen for messages from popup
        this.browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.action) {
                case 'activate':
                    this.activate();
                    break;
                case 'deactivate':
                    this.deactivate();
                    if (request.reason === 'logout') {
                        this.logout();
                    }
                    break;
                case 'getState':
                    sendResponse({ isActive: this.isActive });
                    break;
                case 'showAllErrors':
                    this.showAllErrors();
                    // Update storage to persist state
                    this.browserAPI.storage.local.set({
                        errorsVisible: true,
                    });
                    break;
                case 'hideAllErrors':
                    this.hideAllErrors();
                    // Update storage to persist state
                    this.browserAPI.storage.local.set({
                        errorsVisible: false,
                    });
                    break;
                case 'highlightError':
                    this.highlightError(request.error);
                    break;
                case 'clearAllErrors':
                    this.clearAllErrors()
                        .then(() => {
                            sendResponse({ success: true });
                        })
                        .catch((error) => {
                            sendResponse({
                                success: false,
                                message: error.message,
                            });
                        });
                    return true;
                case 'removeError':
                    this.removeError(request.errorId)
                        .then(() => {
                            sendResponse({ success: true });
                        })
                        .catch((error) => {
                            sendResponse({
                                success: false,
                                message: error.message,
                            });
                        });
                    return true;
                case 'checkFixed':
                    this.checkFixed(request.errorId)
                        .then(() => {
                            sendResponse({ success: true });
                        })
                        .catch((error) => {
                            sendResponse({
                                success: false,
                                message: error.message,
                            });
                        });
                    return true;
                case 'drawOpenErrors':
                    this.drawOpenErrors = request.drawOpenErrors;
                    this.updateAllErrorBorders();
                    break;
                case 'drawResolvedErrors':
                    this.drawResolvedErrors = request.drawResolvedErrors;
                    this.updateAllErrorBorders();
                    break;
            }
        });

        // Listen for window resize to reposition markers
        window.addEventListener('resize', this.handleResize.bind(this));

        // Listen for scroll to update marker visibility
        window.addEventListener('scroll', this.handleScroll.bind(this));

        // Listen for DOM changes that might affect element positions
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.updateAllErrorBorders();
            });
            this.resizeObserver.observe(document.body);
        }

        // phím tắt để bật chế độ chọn lỗi
        window.addEventListener('keydown', async (e) => {

            const activeElement = document.activeElement;
            const isTyping =
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable;

            if (isTyping) return; // Bỏ qua nếu đang gõ trong input, textarea, contentEditable

            // shift + w để bật/tắt chế độ chọn lỗi
            if (e.shiftKey && e.key.toLowerCase() === 'w') {
                this.isActive ? this.deactivate() : this.activate();
                e.preventDefault();
            }

            // shift + e để hiển thị lỗi
            if (e.shiftKey && e.key.toLowerCase() === 'e') {
                if (this.allErrorsVisible) {
                    this.hideAllErrors();
                    await this.browserAPI.storage.local.set({
                        errorsVisible: false,
                    });
                } else {
                    this.showAllErrors();
                    await this.browserAPI.storage.local.set({
                        errorsVisible: true,
                    });
                }
                this.updateAllErrorBorders();
                e.preventDefault();
            }
        });
    }

    handleResize() {
        this.updateAllErrorBorders();
    }

    async handleScroll() {
        this.updateAllErrorBorders();
    }

    async errorsVisible() {
        const result = await this.browserAPI.storage.local.get('errorsVisible');
        const isVisible = result?.errorsVisible;
        if (isVisible) {
            return result;
        }
        return null;
    }

    activate() {
        this.isActive = true;

        // Store bound functions for proper removal
        this.boundHandleMouseDown = this.handleMouseDown.bind(this);
        this.boundHandleMouseMove = this.handleMouseMove.bind(this);
        this.boundHandleMouseUp = this.handleMouseUp.bind(this);
        this.boundHandleMouseOver = this.handleMouseOver.bind(this);
        this.boundHandleMouseOut = this.handleMouseOut.bind(this);
        this.boundPreventLinkClick = this.preventLinkClick.bind(this);

        document.addEventListener('mousedown', this.boundHandleMouseDown, true);
        document.addEventListener('mouseover', this.boundHandleMouseOver, true);
        document.addEventListener('mouseout', this.boundHandleMouseOut, true);
        document.addEventListener('click', this.boundPreventLinkClick, true);

        // Add class to body
        document.body.classList.add('testing-selection-mode');
    }

    deactivate() {
        this.isActive = false;

        document.removeEventListener('mousedown', this.boundHandleMouseDown, true);
        document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
        document.removeEventListener('mouseout', this.boundHandleMouseOut, true);
        document.removeEventListener('click', this.boundPreventLinkClick, true);

        // Remove dynamic listeners if they exist
        if (this.boundHandleMouseMove) {
            document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
        }
        if (this.boundHandleMouseUp) {
            document.removeEventListener('mouseup', this.boundHandleMouseUp, true);
        }

        document.body.classList.remove('testing-selection-mode');

        this.removeHighlight();
        this.cleanupDrag();
    }

    handleMouseOver(event) {
        if (!this.isActive) return;

        // Only handle elementor elements
        if (!event.target.closest('.elementor-element')) return;

        event.stopPropagation();

        // Get the actual target element (handle nested elements)
        const targetElement = this.getTargetElement(event.target);

        this.removeHighlight();
        targetElement.classList.add('testing-highlight');
        this.selectedElement = targetElement;
    }

    handleMouseOut(event) {
        if (!this.isActive) return;

        event.stopPropagation();

        const targetElement = this.getTargetElement(event.target);
        targetElement.classList.remove('testing-highlight');
    }

    handleMouseDown(event) {
        if (!this.isActive || event.button !== 0) return;

        // Only handle elementor elements
        if (!event.target.closest('.elementor-element')) return;

        event.preventDefault();
        event.stopPropagation();

        this.isDragging = false;
        this.startX = event.pageX;
        this.startY = event.pageY;
        this.selectedElement = this.getTargetElement(event.target);

        // Add temporary listeners for mouse move and up
        document.addEventListener('mousemove', this.boundHandleMouseMove, true);
        document.addEventListener('mouseup', this.boundHandleMouseUp, true);
    }

    handleMouseMove(event) {
        if (!this.isActive) return;

        const deltaX = Math.abs(event.pageX - this.startX);
        const deltaY = Math.abs(event.pageY - this.startY);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance > 5 && !this.isDragging) {
            // Start dragging - create rectangle
            this.isDragging = true;
            this.createDragOverlay();
        }

        if (this.isDragging) {
            this.updateDragOverlay(event.pageX, event.pageY);
        }
    }

    handleMouseUp(event) {
        if (!this.isActive) return;

        // Remove temporary listeners
        document.removeEventListener('mousemove', this.boundHandleMouseMove, true);
        document.removeEventListener('mouseup', this.boundHandleMouseUp, true);

        if (this.isDragging) {
            // Rectangle selection
            this.finalizeDragSelection();
        } else {
            // Simple click - element selection
            this.showCommentModal(false);
        }

        this.cleanupDrag();
    }

    getTargetElement(element) {
        // Skip testing assistant elements
        if (
            element.closest(
                '.testing-error-marker, .testing-comment-thread, .testing-comment-modal, .testing-error-border',
            )
        ) {
            return document.body;
        }

        // Return the exact clicked element
        return element;
    }

    isInteractiveElement(element) {
        return false;
    }

    createDragOverlay() {
        this.dragOverlay = document.createElement('div');
        this.dragOverlay.className = 'testing-drag-overlay';
        document.body.appendChild(this.dragOverlay);
    }

    updateDragOverlay(currentX, currentY) {
        if (!this.dragOverlay) return;

        const left = Math.min(this.startX, currentX);
        const top = Math.min(this.startY, currentY);
        const width = Math.abs(currentX - this.startX);
        const height = Math.abs(currentY - this.startY);

        this.dragOverlay.style.left = `${left}px`;
        this.dragOverlay.style.top = `${top}px`;
        this.dragOverlay.style.width = `${width}px`;
        this.dragOverlay.style.height = `${height}px`;
    }

    finalizeDragSelection() {
        if (!this.dragOverlay) return;

        const rect = {
            left: parseFloat(this.dragOverlay.style.left),
            top: parseFloat(this.dragOverlay.style.top),
            width: parseFloat(this.dragOverlay.style.width),
            height: parseFloat(this.dragOverlay.style.height),
        };

        // Only proceed if rectangle is large enough
        if (rect.width >= 10 && rect.height >= 10) {
            this.selectedRect = rect;
            this.showCommentModal(true);
        }
    }

    cleanupDrag() {
        this.isDragging = false;
        if (this.dragOverlay) {
            this.dragOverlay.remove();
            this.dragOverlay = null;
        }
    }

    removeHighlight() {
        const highlighted = document.querySelectorAll('.testing-highlight');
        highlighted.forEach((el) => el.classList.remove('testing-highlight'));
    }

    showCommentModal(isRect = false) {
        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'testing-modal-backdrop';

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'testing-comment-modal';
        modal.innerHTML = `
            <h3>💬 Thêm comment cho lỗi</h3>
            <textarea placeholder="Mô tả lỗi hoặc ghi chú..." maxlength="500"></textarea>
            <div class="testing-modal-buttons">
                <button class="testing-modal-btn testing-modal-btn-secondary" data-action="cancel">Hủy</button>
                <button class="testing-modal-btn testing-modal-btn-primary" data-action="save">Lưu</button>
            </div>
        `;

        const textarea = modal.querySelector('textarea');
        const cancelBtn = modal.querySelector('[data-action="cancel"]');
        const saveBtn = modal.querySelector('[data-action="save"]');

        cancelBtn.addEventListener('click', () => {
            this.closeModal();
        });

        saveBtn.addEventListener('click', async () => {
            const comment = textarea.value.trim();
            if (comment) {
                if (isRect) {
                    await this.reportError({ comment, type: 'rect' });
                } else {
                    await this.reportError({ comment, type: 'border' });
                }
                this.closeModal();
            } else {
                textarea.focus();
            }
        });

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                this.closeModal();
            }
        });

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        this.commentModal = { backdrop, modal };
    }

    closeModal() {
        if (this.commentModal) {
            this.commentModal.backdrop.remove();
            this.commentModal.modal.remove();
            this.commentModal = null;
        }
        // this.removeHighlight();
    }

    showCommentThread(error, border) {
        // Close any existing thread
        this.closeCommentThread();

        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'testing-modal-backdrop';
        backdrop.addEventListener('click', () => this.closeCommentThread());

        // Create thread panel
        const panel = document.createElement('div');
        panel.className = 'testing-comment-modal';
        // Create panel content
        panel.innerHTML = `
            <div class="thread-header">
                <div class="thread-title">
                    <div class="thread-status status-${error.status}">${window.getStatusText(
            error.status,
        )}</div>
                </div>
                <button class="thread-close" aria-label="Đóng">×</button>
            </div>
            <div class="thread-content">
                <div class="comments-list" id="comments-${error.id}">
                    ${this.renderComments(error.comments)}
                </div>
                <div class="thread-actions">
                    <div class="reply-form">
                        <textarea placeholder="Thêm comment..." class="reply-input" maxlength="500"></textarea>
                        <div class="reply-buttons">
                            <button class="btn-reply-send">Gửi</button>
                        </div>
                    </div>
                    <div class="thread-meta">
                        <button class="btn-resolve ${
                            error.status === 'resolved' ? 'resolved' : ''
                        }" data-error-id="${error.id}">
                            ${
                                error.status === 'resolved'
                                    ? '✓ Đã giải quyết'
                                    : 'Đánh dấu đã giải quyết'
                            }
                        </button>
                        <button class="btn-delete" data-error-id="${error.id}">🗑 Xóa</button>
                    </div>
                </div>
            </div>
        `;

        this.bindThreadEvents(panel, error, border);
        document.body.appendChild(backdrop);
        document.body.appendChild(panel);
        this.commentThread = { backdrop, panel, error, border };
    }

    closeCommentThread() {
        if (this.commentThread) {
            this.commentThread.backdrop.remove();

            // Remove panel from marker
            if (this.commentThread.panel.parentElement) {
                this.commentThread.panel.remove();
            }
            this.commentThread = null;
        }
    }

    renderComments(comments) {
        return comments
            .map(
                (comment) => `
            <div class="comment-item" data-comment-id="${comment.id}">
                <div class="comment-avatar">
                    <div class="avatar-circle">${comment.author?.name
                        ?.charAt(0)
                        .toUpperCase()}</div>
                </div>
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${comment.author?.name}</span>
                        <span class="comment-time">${window.formatTime(comment.timestamp)}</span>
                        ${
                            comment.edited
                                ? '<span class="comment-edited">(đã chỉnh sửa)</span>'
                                : ''
                        }
                    </div>
                    <div class="comment-text" data-original="${comment.text}">${comment.text}</div>
                    <div class="comment-actions">
                        ${
                            comment.author?.id === this.userInfo?.id
                                ? `
                            <button class="btn-edit-comment" data-comment-id="${comment.id}">Chỉnh sửa</button>
                            <button class="btn-delete-comment" data-comment-id="${comment.id}">Xóa</button>
                        `
                                : ''
                        }
                    </div>
                </div>
            </div>
        `,
            )
            .join('');
    }

    // Event trong comment thread
    async bindThreadEvents(panel, error, border) {
        // Close button
        panel.querySelector('.thread-close').addEventListener('click', () => {
            this.closeCommentThread();
        });

        // Reply functionality
        const replyInput = panel.querySelector('.reply-input');
        const replySend = panel.querySelector('.btn-reply-send');

        replySend.addEventListener('click', async () => {
            const text = replyInput.value.trim();
            if (text) {
                await this.addReply(error, text);
                this.refreshCommentThread(panel, error);
                replyInput.value = '';
            }
        });

        // Resolve button
        panel.querySelector('.btn-resolve').addEventListener('click', async () => {
            await this.toggleResolveError(error, border);
            await this.refreshCommentThread(panel, error);
        });

        // Delete button
        panel.querySelector('.btn-delete').addEventListener('click', () => {
            if (confirm('Bạn có chắc muốn xóa lỗi này?')) {
                this.deleteError(error.id);
                this.closeCommentThread();
            }
        });

        // Edit/Delete comment buttons
        panel.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-edit-comment')) {
                const commentId = e.target.dataset.commentId;
                await this.editComment(error, commentId, panel);
            }

            if (e.target.classList.contains('btn-delete-comment')) {
                const commentId = e.target.dataset.commentId;
                if (confirm('Bạn có chắc muốn xóa comment này?')) {
                    await this.deleteComment(error, commentId);
                    await this.refreshCommentThread(panel, error);
                }
            }
        });
    }

    async addReply(error, text) {
        const comment = {
            id: UUIDGenerator.generateUUID(),
            text: text,
            author: await this.getUserInfo(),
            timestamp: Date.now(),
            edited: false,
            editedAt: null,
        };

        // Add comment locally first
        error.comments.push(comment);

        // Get current errors data
        let errorsData = await this.getErrorsData();

        // Find and update the error
        const pathIndex = errorsData.path.findIndex((p) => p.full_url === this.currentUrl);
        if (pathIndex !== -1) {
            const errorIndex = errorsData.path[pathIndex].data.findIndex(
                (e) => e.id === error.id,
            );
            if (errorIndex !== -1) {
                errorsData.path[pathIndex].data[errorIndex] = error;

                // Update API with full errors data
                this.updateToAPI(errorsData);

                // Update UI
                this.saveErrors();
                this.updateErrorBorder(error);
            }
        }
    }

    async editComment(error, commentId, panel) {
        const comment = error.comments.find((c) => c.id === commentId);
        if (!comment) return;

        const commentElement = panel.querySelector(`[data-comment-id="${commentId}"]`);
        const textElement = commentElement.querySelector('.comment-text');
        const originalText = textElement.dataset.original;

        // Store original comment state for rollback
        const originalComment = { ...comment };

        // Create edit form
        const editForm = document.createElement('div');
        editForm.className = 'edit-form';
        editForm.innerHTML = `
            <textarea class="edit-input" maxlength="500">${originalText}</textarea>
            <div class="edit-buttons">
                <button class="btn-edit-cancel">Hủy</button>
                <button class="btn-edit-save">Lưu</button>
            </div>
        `;

        // Replace text with edit form
        textElement.style.display = 'none';
        commentElement.querySelector('.comment-actions').style.display = 'none';
        textElement.parentNode.appendChild(editForm);

        const editInput = editForm.querySelector('.edit-input');
        editInput.focus();
        editInput.setSelectionRange(editInput.value.length, editInput.value.length);

        // Cancel edit
        editForm.querySelector('.btn-edit-cancel').addEventListener('click', () => {
            this.cancelEdit(textElement, editForm);
        });

        // Save edit
        editForm.querySelector('.btn-edit-save').addEventListener('click', async () => {
            const newText = editInput.value.trim();
            if (newText && newText !== originalText) {
                try {
                    // Update comment locally
                    comment.text = newText;
                    comment.edited = true;
                    comment.editedAt = Date.now();

                    // Find and update in this.errors array
                    const errorIndex = this.currentTabErrors.findIndex((e) => e.id === error.id);
                    if (errorIndex !== -1) {
                        this.currentTabErrors[errorIndex] = error;
                    }

                    // Save to localStorage first
                    await this.saveErrors();
                    console.log('Saved to localStorage');

                    // Get updated errors data and sync with API
                    let errorsData = await this.getErrorsData();
                    this.updateToAPI(errorsData);

                    // Update UI last
                    this.refreshCommentThread(panel, error);
                    console.log('Comment edited successfully');
                } catch (err) {
                    console.error('Error in editComment save:', err);
                    // Rollback changes if something fails
                    Object.assign(comment, originalComment);
                    if (errorIndex !== -1) {
                        this.currentTabErrors[errorIndex] = error;
                    }
                    this.refreshCommentThread(panel, error);
                }
            } else {
                this.cancelEdit(textElement, editForm);
            }
        });
    }

    cancelEdit(textElement, editForm) {
        textElement.style.display = 'block';
        // textElement.parentNode.querySelector('.comment-actions').style.display = 'block';
        editForm.remove();
    }

    async deleteComment(error, commentId) {
        try {
            // Store original comments for rollback if needed
            const originalComments = [...error.comments];

            // Remove comment locally
            error.comments = error.comments.filter((c) => c.id !== commentId);

            // Find and update in this.errors array
            const errorIndex = this.currentTabErrors.findIndex((e) => e.id === error.id);
            if (errorIndex !== -1) {
                this.currentTabErrors[errorIndex] = error;
            }

            // Save to localStorage first
            await this.saveErrors();
            console.log('Saved to localStorage');

            // Get updated errors data and sync with API
            let errorsData = await this.getErrorsData();
            this.updateToAPI(errorsData);

            // Update UI last
            this.updateAllErrorBorders();
            console.log('Comment deleted successfully');
        } catch (err) {
            console.error('Error in deleteComment:', err);
            // Rollback changes if something fails
            if (errorIndex !== -1) {
                error.comments = originalComments;
                this.currentTabErrors[errorIndex] = error;
                this.updateAllErrorBorders();
            }
        }
    }

    async toggleResolveError(error, border) {
        try {
            error.status = error.status == 'open' ? 'resolved' : 'open';

            // Find and update in this.errors array
            const errorIndex = this.currentTabErrors.findIndex((e) => e.id === error.id);
            if (errorIndex !== -1) {
                this.currentTabErrors[errorIndex] = error;
            }

            // Save to localStorage first
            await this.saveErrors();
            // Get updated errors data and sync with API
            let errorsData = await this.getErrorsData();
            this.updateToAPI(errorsData);
            // Update UI last
            this.updateAllErrorBorders();
            console.log('Final error state:', error);
        } catch (err) {
            console.error('Error in toggleResolveError:', err);
            // Rollback changes if something fails
            if (errorIndex !== -1) {
                error.status = error.status == 'open' ? 'resolved' : 'open';
                this.currentTabErrors[errorIndex] = error;
                this.updateErrorBorder(error);
            }
        }
    }

    updateErrorBorder(error) {
        const border = document.querySelector(`.testing-error-border[data-error-id="${error.id}"]`);
        if (border) {
            border.className = `testing-error-border ${error.status || 'open'}`;
        }
    }

    async refreshCommentThread(panel, error) {
        const commentsList = panel.querySelector(`#comments-${error.id}`);
        if (commentsList) {
            commentsList.innerHTML = this.renderComments(error.comments);
        }

        // Update resolve button
        const resolveBtn = panel.querySelector('.btn-resolve');
        if (resolveBtn) {
            resolveBtn.textContent =
                error.status === 'resolved' ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết';
            resolveBtn.className = `btn-resolve ${error.status === 'resolved' ? 'resolved' : ''}`;
        }
        this.updateAllErrorBorders();
    }

    async deleteError(errorId) {
        // Get current errors data
        let errorsData = await this.getErrorsData();

        // Find and remove the error
        const pathIndex = errorsData.path.findIndex((p) => p.full_url === this.currentUrl);
        if (pathIndex !== -1) {
            const errorIndex = errorsData.path[pathIndex].data.findIndex((e) => e.id === errorId);
            if (errorIndex !== -1) {
                errorsData.path[pathIndex].data.splice(errorIndex, 1);

                // Remove empty path entries
                if (errorsData.path[pathIndex].data.length === 0) {
                    errorsData.path.splice(pathIndex, 1);
                }

                // Update API with modified errors data
                this.updateToAPI(errorsData);

                // Update local state
                this.currentTabErrors = this.currentTabErrors.filter((e) => e.id !== errorId);
                this.saveErrors();

                // Remove border
                const border = document.querySelector(
                    `.testing-error-border[data-error-id="${errorId}"]`,
                );
                if (border) {
                    border.remove();
                    this.errorBorders = this.errorBorders.filter((b) => b !== border);
                }

                // Notify popup
                chrome.runtime.sendMessage({ action: 'errorDeleted' });
            }
        }
    }

    createErrorOverlay(error) {
        const overlay = document.createElement('div');
        overlay.className = 'testing-error-border';
        overlay.dataset.errorId = error.id;
        overlay.style.zIndex = '251001';

        if (error.type === 'rect') {
            // Rectangle overlay
            overlay.style.position = 'absolute';
            overlay.style.border = '2px solid red';
            overlay.style.background = 'rgba(255, 0, 0, 0.1)';
            overlay.style.left = `${error.coordinates.left}px`;
            overlay.style.top = `${error.coordinates.top}px`;
            overlay.style.width = `${error.coordinates.width}px`;
            overlay.style.height = `${error.coordinates.height}px`;
        } else {
            // Element border overlay
            const element = this.findErrorElement(error);
            if (!element) return;

            // Calculate z-index based on DOM depth for element overlays
            const getElementDepth = (el) => {
                let depth = 0;
                let parent = el.parentElement;
                while (parent) {
                    depth++;
                    parent = parent.parentElement;
                }
                return depth;
            };

            const baseZIndex = 251001;
            const depth = getElementDepth(element);
            overlay.style.zIndex = baseZIndex + depth;
        }

        // Add click handler to show thread
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showCommentThread(error, overlay);
        });

        overlay.addEventListener('mouseleave', () => {
            overlay.classList.remove('testing-border-hover');
        });

        document.body.appendChild(overlay);
        this.errorBorders.push(overlay);

        this.updateAllErrorBorders();
    }

    positionErrorOverlay(overlay, error, errorsVisible = false) {
        const shouldShow = this.shouldShowErrorBorder(error);

        if (error.type === 'rect') {
            // Rectangle overlay - coordinates are fixed
            overlay.className = `testing-error-border ${error.status || 'open'}`;
            if (shouldShow) {
                overlay.style.display = 'block';
                if (errorsVisible) {
                    overlay.classList.add('show');
                }
            } else {
                overlay.style.display = 'none';
                overlay.classList.remove('show');
            }
        } else {
            // Element overlay - needs repositioning
            const element = this.findErrorElement(error);
            if (!element) {
                overlay.style.display = 'none';
                return;
            }

            if (shouldShow) {
                const rect = element.getBoundingClientRect();

                // Position overlay to match the element
                overlay.style.position = 'absolute';
                overlay.style.top = `${rect.top + window.scrollY}px`;
                overlay.style.left = `${rect.left + window.scrollX}px`;
                overlay.style.width = `${rect.width}px`;
                overlay.style.height = `${rect.height}px`;

                // Add status class
                overlay.className = `testing-error-border ${error.status || 'open'}`;
                overlay.style.display = 'block';
                if (errorsVisible) {
                    overlay.classList.add('show');
                }
            } else {
                overlay.style.display = 'none';
                overlay.classList.remove('show');
            }
        }
    }

    shouldShowErrorBorder(error) {
        const width = window.innerWidth;
        return (
            error.breakpoint &&
            (Math.abs(error.breakpoint.width - width) <= this.rangeBreakpoint ||
                (error.breakpoint.type == 'desktop' && width >= this.desktopBreakpoint))
        );
    }

    async updateAllErrorBorders() {
        const errorsVisible = await this.errorsVisible();
        const visible = errorsVisible?.errorsVisible || false;
        this.errorBorders.forEach((overlay) => {
            const errorId = overlay.dataset.errorId;
            const error = this.currentTabErrors.find((e) => e.id === errorId);
            if (error) {
                // Check if errors should be shown at all
                if (!this.allErrorsVisible) {
                    // Hide all errors when allErrorsVisible is false
                    overlay.style.display = 'none';
                    overlay.classList.remove('show');
                } else {
                    // Check if this error type should be drawn when allErrorsVisible is true
                    const shouldDraw =
                        (error.status == 'open' && this.drawOpenErrors) ||
                        (error.status == 'resolved' && this.drawResolvedErrors);

                    if (shouldDraw) {
                        this.positionErrorOverlay(overlay, error, visible);
                    } else {
                        // Hide overlay if it shouldn't be drawn
                        overlay.style.display = 'none';
                        overlay.classList.remove('show');
                    }
                }
            }
        });
    }

    findErrorElement(error) {
        // Use new identifier system if available
        if (error.elementIdentifiers) {
            return window.findElementByIdentifiers(error.elementIdentifiers);
        }

        return null;
    }

    async loadErrors() {
        const { path } = await this.getErrorsData();
        if (path) {
            const pathItem = path.find((p) => p.full_url === this.currentUrl);
            this.currentTabErrors = pathItem ? pathItem.data : [];
        }
    }

    async saveErrors() {
        return new Promise((resolve, reject) => {
            try {
                // Initialize errors array if it doesn't exist
                if (!this.errors) {
                    try {
                        const domain = new URL(this.currentUrl).hostname;
                        this.errors = {
                            domain: domain,
                            path: [],
                        };
                    } catch (e) {
                        this.errors = {
                            domain: '',
                            path: [],
                        };
                    }
                }

                // Update the current URL's data in the errors array
                let pathIndex = this.errors.path.findIndex((p) => p.full_url === this.currentUrl);

                if (pathIndex >= 0) {
                    this.errors.path[pathIndex].data = this.currentTabErrors;
                } else {
                    this.errors.path.push({
                        full_url: this.currentUrl,
                        data: this.currentTabErrors,
                    });
                }

                // Notify background script about error changes
                this.browserAPI.runtime.sendMessage({
                    action: 'setErrors',
                    errors: this.errors,
                });

                resolve();
            } catch (error) {
                console.error('Error saving errors:', error);
                reject(error);
            }
        });
    }

    async displayExistingErrors() {
        const { path } = await this.getErrorsData();
        let errors = [];

        if (path) {
            const pathItem = path.find((p) => p.full_url === this.currentUrl);
            errors = pathItem ? pathItem.data : [];
            this.processExistingErrors(errors);
        } 
    }

    processExistingErrors(errors) {
        this.currentTabErrors = errors; // Update local errors array
        errors.forEach((error) => {
            this.createErrorOverlay(error);
        });
        this.updateErrorBordersVisibility();
    }

    showAllErrors() {
        // Show errors based on drawOpenErrors and drawResolvedErrors
        this.allErrorsVisible = true;
        this.updateErrorBordersVisibility();
    }

    updateErrorBordersVisibility() {
        document.body.classList.toggle('show-error', this.allErrorsVisible);
        this.updateAllErrorBorders();
    }

    hideAllErrors() {
        // Hide all errors regardless of drawOpenErrors and drawResolvedErrors
        this.allErrorsVisible = false;
        this.updateErrorBordersVisibility();
    }

    highlightError(error) {
        if (!error) return;

        // const currentWidth = window.innerWidth;
        // const currentHeight = window.innerHeight;

        // const newWidth = error.breakpoint.width;

        this.browserAPI.runtime.sendMessage({
            action: 'openOrResizeErrorWindow',
            url: error.url,
            width: error.breakpoint.width,
            height: window.innerHeight,
            errorId: error.id,
        });
        // // Remove existing highlights
        // document.querySelectorAll('.testing-error-highlight').forEach(el => {
        //     el.classList.remove('testing-error-highlight');
        // });

        // //find div with data-error-id = error.id
        // const errorElement = document.querySelector(`div[data-error-id="${error.id}"]`);
        // if (errorElement) {
        //     errorElement.classList.add('testing-error-highlight');
        //     errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        //     setTimeout(() => {
        //         errorElement.classList.remove('testing-error-highlight');
        //     }, 1000);
        // }
    }

    async clearAllErrors() {
        const emptyerrorsData = {
            domain: new URL(this.currentUrl).hostname,
            path: [],
        };
        await this.updateToAPI(emptyerrorsData);

        // Remove all borders
        this.errorBorders.forEach((border) => border.remove());
        this.errorBorders = [];

        // Clear data
        this.currentTabErrors = [];
        // Reload errors for current URL from updated localStorage
        await this.reloadCurrentErrors();
        this.updateAllErrorBorders();
        this.removeModal();
    }

    async removeError(errorId) {
        // Xoá lỗi trong localStorage
        const errorsData = await this.getErrorsData();

        let found = false;

        for (const pathItem of errorsData.path) {
            const initialLength = pathItem.data.length;
            pathItem.data = pathItem.data.filter((error) => error.id !== errorId);

            if (pathItem.data.length !== initialLength) {
                found = true;
            }
        }

        if (!found) {
            alert(`Không tìm thấy lỗi với ID: ${errorId}`);
            return;
        }

        // Cập nhật lên API
        await this.updateToAPI(errorsData);

        // Reload errors for current URL from updated localStorage
        await this.reloadCurrentErrors();

        // Remove border if exists on current page
        const border = document.querySelector(`.testing-error-border[data-error-id="${errorId}"]`);
        if (border) {
            border.remove();
            this.errorBorders = this.errorBorders.filter((b) => b !== border);
        }

        this.updateAllErrorBorders();
        this.removeModal();
    }

    async fetchDataFromAPI() {
        try {
            const response = await $.ajax({
                url: this.apiEndpoint,
                method: 'GET',
                dataType: 'json',
                data: {
                    domain: new URL(this.currentUrl).hostname,
                    action: 'get',
                },
            });

            // Update local storage with API data
            if (response) {
                const data = response.data;
                this.errors = data;
                // Update local errors for current URL
                const pathItem = data?.path.find((p) => p.full_url === this.currentUrl);
                this.currentTabErrors = pathItem ? pathItem.data : [];

                this.browserAPI.runtime.sendMessage({
                    action: 'setErrors',
                    errors: this.errors,
                });
            }
        } catch (error) {
            console.error('Error fetching data from API:', error);
        }
    }

    async updateToAPI(errorsData) {
        try {
            const response = await $.ajax({
                url: this.apiEndpoint + '?action=set',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(errorsData),
            });

            this.browserAPI.runtime.sendMessage({
                action: 'setErrors',
                errors: errorsData,
            });

            return response.success
        } catch (error) {
            console.error('Error updating API:', error);
            return false;
        }
    }

    // Helper method to get full errors data from storage
    async getErrorsData() {
        const { path } = await this.browserAPI.runtime.sendMessage({ action: 'getErrors' });
        return {
            domain: new URL(this.currentUrl).hostname,
            path,
        };
    }

    // Helper method to reload current errors from localStorage
    async reloadCurrentErrors() {
        const errorsData = await this.getErrorsData();
        const pathItem = errorsData.path?.find((p) => p.full_url === this.currentUrl);
        this.currentTabErrors = pathItem ? pathItem.data : [];
    }


    async reportError({ comment, type }) {
        if (type === 'border' && !this.selectedElement) return;
        if (type === 'rect' && !this.selectedRect) return;

        const width = window.innerWidth;
        const breakpoint = {
            type: window.getCurrentBreakpoint(width),
            width: width,
        };

        const error = {
            id: UUIDGenerator.generateUUID(),
            type: type,
            timestamp: Date.now(),
            breakpoint: breakpoint,
            url: this.currentUrl,
            status: 'open',
            elementIdentifiers: null,
            coordinates: null,
            comments: [
                {
                    id: UUIDGenerator.generateUUID(),
                    text: comment,
                    author: await this.getUserInfo(),
                    timestamp: Date.now(),
                    edited: false,
                    editedAt: null,
                },
            ],
        };

        // Xử lý dữ liệu khác biệt
        if (type === 'border') {
            error.elementIdentifiers = {
                xpath: window.getElementXPath(this.selectedElement),
            };

            const element = window.findElementByIdentifiers(error.elementIdentifiers);
            if (!element) {
                console.error(
                    'Failed to save error: Cannot reliably identify the selected element',
                );
                return;
            }
        }

        if (type === 'rect') {
            error.coordinates = this.selectedRect;
        }

        // Get current errors data
        let errorsData = await this.getErrorsData();

        // Add new error to the appropriate path
        let pathIndex = errorsData.path.findIndex((p) => p.full_url === this.currentUrl);
        if (pathIndex === -1) {
            errorsData.path.push({
                full_url: this.currentUrl,
                data: [error],
            });
        } else {
            errorsData.path[pathIndex].data.push(error);
        }

        // Update API with full error data
        this.updateToAPI(errorsData);

        this.currentTabErrors.push(error);
        this.saveErrors();
        this.createErrorOverlay(error);

        if (type === 'rect') {
            this.selectedRect = null;
        }
    }

    logout() {
        try {
            // Remove all borders
            this.errorBorders.forEach((border) => border.remove());
            this.errorBorders = [];

            // Clear data
            this.currentTabErrors = [];
            this.saveErrors();
            this.updateAllErrorBorders();
            this.hideAllErrors();
            // Reset state
            this.isActive = false;
            this.selectedElement = null;
            this.allErrorsVisible = false;
            this.removeModal();
        } catch (error) {
            console.error('Error logging out:', error);
            alert('Error logging out');
        }
    }

    async checkFixed(errorId) {
        // Lấy dữ liệu errors
        const errorsData = await this.getErrorsData();

        // Tìm lỗi theo ID
        let found = null;
        for (const pathItem of errorsData.path) {
            const foundError = pathItem.data.find((e) => e.id == errorId);
            if (foundError) {
                found = foundError;
                break;
            }
        }

        // Nếu không tìm thấy, thông báo
        if (!found) {
            alert(`Không tìm thấy lỗi với ID: ${errorId}`);
            return;
        }

        // Toggle trạng thái
        found.status = found.status === 'resolved' ? 'open' : 'resolved';

        const errors = {
            domain: errorsData.domain,
            path: errorsData.path,
        };

        // Cập nhật lên API
        await this.updateToAPI(errors);

        // Reload errors for current URL from updated localStorage
        await this.reloadCurrentErrors();

        // Xoá modal
        this.removeModal();

        this.updateAllErrorBorders();
    }

    preventLinkClick(event) {
        if (!this.isActive) return;

        // Check if clicked element is a link or inside a link
        const linkElement = event.target.closest('a');
        if (linkElement) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    initDraw() {
        this.browserAPI.storage.local.get(
            ['drawOpenErrors', 'drawResolvedErrors', 'errorsVisible'],
            (result) => {
                this.drawOpenErrors = result.drawOpenErrors || false;
                this.drawResolvedErrors = result.drawResolvedErrors || false;
                this.allErrorsVisible = result.errorsVisible || false;
            },
        );
    }

    removeModal() {
        // Xoá modal
        const backdrop = document.querySelector('.testing-modal-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
        const thread = document.querySelector('.testing-comment-modal');
        if (thread) {
            thread.remove();
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new WebsiteTestingAssistant();
    });
} else {
    new WebsiteTestingAssistant();
}
