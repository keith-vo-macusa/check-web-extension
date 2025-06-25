class WebsiteTestingAssistant {
    constructor() {
        this.isActive = false;
        this.errors = [];
        this.selectedElement = null;
        this.highlightOverlay = null;
        this.commentModal = null;
        this.currentUrl = window.location.href;
        this.errorBorders = [];
        this.userInfo  = null;
        
        // Add jQuery getPath method
        jQuery.fn.getPath = function () {
            if (this.length != 1) throw 'Requires one element.';
            var path, node = this;
            while (node.length) {
                var realNode = node[0], name = realNode.localName;
                if (!name) break;
                name = name.toLowerCase();

                var parent = node.parent();
                var siblings = parent.children(name);
                
                if (realNode.id) {
                    name += '#' + realNode.id;
                    path = name + (path ? '>' + path : '');
                    break;
                } else if (siblings.length > 1) {
                    var index = siblings.index(realNode) + 1;
                    if (index > 1) {
                        name += ':nth-child(' + index + ')';
                    }
                }
                path = name + (path ? '>' + path : '');
                node = parent;
            }
            return path;
        };
        
        this.init();
    }
    
    // Simple UUID generator function
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
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
        this.loadErrors();
        this.createStyles();
        this.bindEvents();
        this.displayExistingErrors();
    }
    createStyles() {
        if (!document.getElementById('testing-assistant-styles')) {
            const style = document.createElement('style');
            style.id = 'testing-assistant-styles';
            style.textContent = `
                .testing-highlight {
                    outline: 3px solid #007bff !important;
                    outline-offset: 2px !important;
                    background: rgba(0, 123, 255, 0.1) !important;
                    position: relative !important;
                    z-index: 9998 !important;
                    transition: all 0.2s ease !important;
                }
                
                .testing-highlight:after {
                    content: '' !important;
                    position: absolute !important;
                    top: -3px !important;
                    left: -3px !important;
                    right: -3px !important;
                    bottom: -3px !important;
                    border: 2px dashed rgba(0, 123, 255, 0.5) !important;
                    border-radius: 4px !important;
                    pointer-events: none !important;
                    z-index: 1 !important;
                }
                

                
                .testing-comment-modal {
                    position: fixed !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) !important;
                    background: white !important;
                    padding: 24px !important;
                    border-radius: 12px !important;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2) !important;
                    z-index: 10001 !important;
                    width: 400px !important;
                    max-width: 90vw !important;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
                }
                
                .testing-modal-backdrop {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    background: rgba(0, 0, 0, 0.5) !important;
                    z-index: 10000 !important;
                }
                
                .testing-comment-modal h3 {
                    margin: 0 0 16px 0 !important;
                    font-size: 18px !important;
                    color: #2c3e50 !important;
                    font-weight: 600 !important;
                }
                
                .testing-comment-modal textarea {
                    width: 100% !important;
                    height: 100px !important;
                    border: 2px solid #e9ecef !important;
                    border-radius: 6px !important;
                    padding: 12px !important;
                    font-size: 14px !important;
                    resize: vertical !important;
                    font-family: inherit !important;
                    box-sizing: border-box !important;
                }
                
                .testing-comment-modal textarea:focus {
                    outline: none !important;
                    border-color: #007bff !important;
                }
                
                .testing-modal-buttons {
                    display: flex !important;
                    gap: 12px !important;
                    margin-top: 16px !important;
                    justify-content: flex-end !important;
                }
                
                .testing-modal-btn {
                    padding: 10px 20px !important;
                    border: none !important;
                    border-radius: 6px !important;
                    font-size: 14px !important;
                    font-weight: 500 !important;
                    cursor: pointer !important;
                    transition: all 0.2s ease !important;
                    font-family: inherit !important;
                }
                
                .testing-modal-btn-primary {
                    background: #007bff !important;
                    color: white !important;
                }
                
                .testing-modal-btn-primary:hover {
                    background: #0056b3 !important;
                }
                
                .testing-modal-btn-secondary {
                    background: #6c757d !important;
                    color: white !important;
                }
                
                .testing-modal-btn-secondary:hover {
                    background: #545b62 !important;
                }
                
                .testing-error-highlight {
                    outline: 3px solid #ffc107 !important;
                    outline-offset: 2px !important;
                    background: rgba(255, 193, 7, 0.1) !important;
                    animation: testing-pulse 2s ease-in-out !important;
                }
                
                @keyframes testing-pulse {
                    0%, 100% { outline-color: #ffc107; }
                    50% { outline-color: #ff6b6b; }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    bindEvents() {
        // Cross-browser API wrapper
        const browserAPI = window.chrome || window.browser;
        
        // Listen for messages from popup
        browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
            switch (request.action) {
                case 'activate':
                    this.activate();
                    break;
                case 'deactivate':
                    this.deactivate();
                    break;
                case 'getState':
                    sendResponse({ isActive: this.isActive });
                    break;
                case 'showAllErrors':
                    this.showAllErrors();
                    break;
                case 'hideAllErrors':
                    this.hideAllErrors();
                    break;
                case 'highlightError':
                    this.highlightError(request.errorId);
                    break;
                case 'clearAllErrors':
                    this.clearAllErrors();
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
                this.updateAllMarkerPositions();
            });
            this.resizeObserver.observe(document.body);
        }
    }

    handleResize() {
        // Debounce resize events
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            this.updateAllMarkerPositions();
            this.repositionCommentPanel();
        }, 1);
    }

    handleScroll() {
        // Throttle scroll events for performance
        if (!this.scrollThrottle) {
            this.scrollThrottle = setTimeout(() => {
                this.repositionCommentPanel();
                this.scrollThrottle = null;
            }, 1); // ~60fps
        }
    }

    updateAllMarkerPositions() {
        // Update error borders
        this.updateAllErrorBorders();
    }
    
    activate() {
        this.isActive = true;
        
        // Store bound functions for proper removal
        this.boundHandleClick = this.handleClick.bind(this);
        this.boundHandleMouseOver = this.handleMouseOver.bind(this);
        this.boundHandleMouseOut = this.handleMouseOut.bind(this);
        
        document.addEventListener('click', this.boundHandleClick, true);
        document.addEventListener('mouseover', this.boundHandleMouseOver, true);
        document.addEventListener('mouseout', this.boundHandleMouseOut, true);
        
        // Add class to body
        document.body.classList.add('testing-selection-mode');
        
        // Add style for elementor elements only
        const style = document.createElement('style');
        style.id = 'testing-cursor-style';
        style.textContent = `
            body.testing-selection-mode .elementor-element {
                cursor: crosshair !important;
            }
        `;
        document.head.appendChild(style);
        
        console.log('Testing Assistant activated');
    }
    
    deactivate() {
        this.isActive = false;
        
        document.removeEventListener('click', this.boundHandleClick, true);
        document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
        document.removeEventListener('mouseout', this.boundHandleMouseOut, true);
        
        document.body.classList.remove('testing-selection-mode');
        
        // Remove cursor style
        const cursorStyle = document.getElementById('testing-cursor-style');
        if (cursorStyle) {
            cursorStyle.remove();
        }
        
        this.removeHighlight();
        
        console.log('Testing Assistant deactivated');
    }
    
    tempDisableSelection() {
        if (!this.isActive) return;
        
        // Store current state
        this.wasActiveBeforeModal = true;
        
        // Remove event listeners temporarily
        document.removeEventListener('click', this.boundHandleClick, true);
        document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
        document.removeEventListener('mouseout', this.boundHandleMouseOut, true);
        
        // Remove crosshair cursor
        document.body.classList.remove('testing-selection-mode');
        document.body.style.cursor = '';
        this.removeHighlight();
    }
    
    restoreSelection() {
        if (!this.wasActiveBeforeModal || !this.isActive) return;
        
        // Restore event listeners
        document.addEventListener('click', this.boundHandleClick, true);
        document.addEventListener('mouseover', this.boundHandleMouseOver, true);
        document.addEventListener('mouseout', this.boundHandleMouseOut, true);
        
        // Restore crosshair cursor
        document.body.classList.add('testing-selection-mode');
        document.body.style.cursor = 'crosshair !important';
        
        // Reset state
        this.wasActiveBeforeModal = false;
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
    
    handleClick(event) {
        if (!this.isActive) return;
        
        // Only handle elementor elements
        if (!event.target.closest('.elementor-element')) return;
        
        // Only prevent default for non-interactive elements
        if (!this.isInteractiveElement(event.target)) {
            event.preventDefault();
        }
        event.stopPropagation();
        
        this.selectedElement = this.getTargetElement(event.target);
        this.showCommentModal();
    }

    getTargetElement(element) {
        // Skip testing assistant elements
        if (element.closest('.testing-error-marker, .testing-comment-thread, .testing-comment-modal, .testing-error-border')) {
            return document.body;
        }
        
        // Return the exact clicked element
        return element;
    }

    isInteractiveElement(element) {
        return false;
    }
    
    removeHighlight() {
        const highlighted = document.querySelectorAll('.testing-highlight');
        highlighted.forEach(el => el.classList.remove('testing-highlight'));
    }
    
    showCommentModal() {
        if (!this.selectedElement) return;
        
        // Temporarily disable selection mode
        this.tempDisableSelection();
        
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
                await this.saveError(comment);
                this.closeModal();
            } else {
                textarea.focus();
            }
        });
        
        backdrop.addEventListener('click', (e) => {
            // Only close if clicking on backdrop, not modal content
            if (e.target === backdrop) {
                this.closeModal();
            }
        });
        
        // Handle Enter key
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                saveBtn.click();
            }
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
        
        // Prevent modal content from triggering selection
        modal.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);
        
        this.commentModal = { backdrop, modal };
        
        // Focus textarea
        setTimeout(() => textarea.focus(), 0);
    }
    
    closeModal() {
        if (this.commentModal) {
            this.commentModal.backdrop.remove();
            this.commentModal.modal.remove();
            this.commentModal = null;
        }
        this.removeHighlight();
        
        // Re-enable selection mode if it was active
        this.restoreSelection();
    }

    showCommentThread(error, border) {
        // Close any existing thread
        this.closeCommentThread();
        
        // Temporarily disable selection if active
        this.tempDisableSelection();
        
        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'testing-thread-backdrop';
        backdrop.addEventListener('click', () => this.closeCommentThread());
        
        // Create thread panel
        const panel = document.createElement('div');
        panel.className = 'testing-comment-thread';
        
        // Smart positioning with fixed position
        this.positionCommentPanel(panel, border);
        
        // Create panel content
        panel.innerHTML = `
            <div class="thread-header">
                <div class="thread-title">
                    <span class="thread-icon">💬</span>
                    <span>Lỗi #${this.errors.indexOf(error) + 1}</span>
                    <div class="thread-status status-${error.status}">${this.getStatusText(error.status)}</div>
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
                            <button class="btn-reply-cancel">Hủy</button>
                            <button class="btn-reply-send">Gửi</button>
                        </div>
                    </div>
                    <div class="thread-meta">
                        <button class="btn-resolve ${error.status === 'resolved' ? 'resolved' : ''}" data-error-id="${error.id}">
                            ${error.status === 'resolved' ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết'}
                        </button>
                        <button class="btn-delete" data-error-id="${error.id}">🗑 Xóa</button>
                    </div>
                </div>
            </div>
        `;
        
        // Stop propagation on panel clicks
        panel.addEventListener('click', (e) => e.stopPropagation());
        
        // Bind events
        this.bindThreadEvents(panel, error, border);
        
        document.body.appendChild(backdrop);
        document.body.appendChild(panel);
        
        this.commentThread = { backdrop, panel, error, border };
        
        // Focus reply input
        setTimeout(() => {
            const replyInput = panel.querySelector('.reply-input');
            if (replyInput) replyInput.focus();
        }, 100);

        // Reposition on scroll/resize
        this.repositionCommentPanel();
    }

    positionCommentPanel(panel, border) {
        panel.className = 'testing-comment-thread';
        panel.style.position = 'fixed';
        
        if (border) {
            const rect = border.getBoundingClientRect();
            const spaceRight = window.innerWidth - rect.right;
            const spaceLeft = rect.left;
            const spaceBelow = window.innerHeight - rect.bottom;
            
            if (spaceRight > 350) {
                panel.style.left = `${rect.right + 10}px`;
                panel.style.top = `${rect.top}px`;
            } else if (spaceLeft > 350) {
                panel.style.right = `${window.innerWidth - rect.left + 10}px`;
                panel.style.top = `${rect.top}px`;
            } else {
                // Center on screen
                panel.style.left = '50%';
                panel.style.top = '50%';
                panel.style.transform = 'translate(-50%, -50%)';
            }
            
            // Adjust if panel goes below viewport
            if (spaceBelow < 300 && panel.style.transform !== 'translate(-50%, -50%)') {
                panel.style.top = `${Math.max(10, rect.bottom - 400)}px`;
            }
        } else {
            // Fallback: center on screen
            panel.style.left = '50%';
            panel.style.top = '50%';
            panel.style.transform = 'translate(-50%, -50%)';
        }
        
        // Ensure panel stays within viewport bounds
        setTimeout(() => {
            const panelRect = panel.getBoundingClientRect();
            if (panelRect.bottom > window.innerHeight - 10) {
                panel.style.top = `${window.innerHeight - panelRect.height - 10}px`;
            }
            if (panelRect.top < 10) {
                panel.style.top = '10px';
            }
        }, 10);
    }

    repositionCommentPanel() {
        if (!this.commentThread) return;
        
        const { panel, border } = this.commentThread;
        
        // Check if border is still visible and valid
        if (border && document.body.contains(border)) {
            // Reposition panel to follow border
            this.positionCommentPanel(panel, border);
        }
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
        
        // Re-enable selection mode if it was active
        this.restoreSelection();
    }

    getStatusText(status) {
        const statusMap = {
            'open': 'Mở',
            'resolved': 'Đã giải quyết',
            'closed': 'Đã đóng'
        };
        return statusMap[status] || 'Mở';
    }

    renderComments(comments) {
        return comments.map(comment => `
            <div class="comment-item" data-comment-id="${comment.id}">
                <div class="comment-avatar">
                    <div class="avatar-circle">${comment.author?.name?.charAt(0).toUpperCase()}</div>
                </div>
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${comment.author?.name}</span>
                        <span class="comment-time">${this.formatTime(comment.timestamp)}</span>
                        ${comment.edited ? '<span class="comment-edited">(đã chỉnh sửa)</span>' : ''}
                    </div>
                    <div class="comment-text" data-original="${comment.text}">${comment.text}</div>
                    <div class="comment-actions">
                        ${comment.author?.id === this.userInfo?.id ? `
                            <button class="btn-edit-comment" data-comment-id="${comment.id}">Chỉnh sửa</button>
                            <button class="btn-delete-comment" data-comment-id="${comment.id}">Xóa</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    async bindThreadEvents(panel, error, border) {
        // Close button
        panel.querySelector('.thread-close').addEventListener('click', () => {
            this.closeCommentThread();
        });
        
        // Reply functionality
        const replyInput = panel.querySelector('.reply-input');
        const replyCancel = panel.querySelector('.btn-reply-cancel');
        const replySend = panel.querySelector('.btn-reply-send');
        
        replySend.addEventListener('click', async () => {
            const text = replyInput.value.trim();
            if (text) {
                await this.addReply(error, text);
                this.refreshCommentThread(panel, error);
                replyInput.value = '';
            }
        });
        
        replyCancel.addEventListener('click', () => {
            replyInput.value = '';
        });
        
        // Ctrl+Enter to send
        replyInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                replySend.click();
            }
        });
        
        // Resolve button
        panel.querySelector('.btn-resolve').addEventListener('click', () => {
            this.toggleResolveError(error, border);
            this.refreshCommentThread(panel, error);
        });
        
        // Delete button
        panel.querySelector('.btn-delete').addEventListener('click', () => {
            if (confirm('Bạn có chắc muốn xóa lỗi này?')) {
                this.deleteError(error.id);
                this.closeCommentThread();
            }
        });
        
        // Edit/Delete comment buttons
        panel.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-edit-comment')) {
                const commentId = e.target.dataset.commentId;
                this.editComment(error, commentId, panel);
            }
            
            if (e.target.classList.contains('btn-delete-comment')) {
                const commentId = e.target.dataset.commentId;
                if (confirm('Bạn có chắc muốn xóa comment này?')) {
                    this.deleteComment(error, commentId);
                    this.refreshCommentThread(panel, error);
                }
            }
        });
    }

    async addReply(error, text) {
        const comment = {
            id: this.generateUUID(),
            text: text,
            author: await this.getUserInfo(),
            timestamp: Date.now(),
            edited: false,
            editedAt: null
        };
        
        error.comments.push(comment);
        this.saveErrors();
        
        // Update border if needed
        this.updateErrorBorder(error);
    }

    editComment(error, commentId, panel) {
        const comment = error.comments.find(c => c.id === commentId);
        if (!comment) return;
        
        const commentElement = panel.querySelector(`[data-comment-id="${commentId}"]`);
        const textElement = commentElement.querySelector('.comment-text');
        const originalText = textElement.dataset.original;
        
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
        editForm.querySelector('.btn-edit-save').addEventListener('click', () => {
            const newText = editInput.value.trim();
            if (newText && newText !== originalText) {
                comment.text = newText;
                comment.edited = true;
                comment.editedAt = Date.now();
                this.saveErrors();
                this.refreshCommentThread(panel, error);
            } else {
                this.cancelEdit(textElement, editForm);
            }
        });
        
        // Ctrl+Enter to save
        editInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                editForm.querySelector('.btn-edit-save').click();
            }
            if (e.key === 'Escape') {
                this.cancelEdit(textElement, editForm);
            }
        });
    }

    cancelEdit(textElement, editForm) {
        textElement.style.display = 'block';
        textElement.parentNode.querySelector('.comment-actions').style.display = 'block';
        editForm.remove();
    }

    deleteComment(error, commentId) {
        error.comments = error.comments.filter(c => c.id !== commentId);
        this.saveErrors();
        this.updateErrorBorder(error);
    }

    toggleResolveError(error, border) {
        error.status = error.status === 'resolved' ? 'open' : 'resolved';
        this.saveErrors();
        this.updateErrorBorder(error);
    }

    updateErrorBorder(error) {
        const border = document.querySelector(`.testing-error-border[data-error-id="${error.id}"]`);
        if (border) {
            border.className = `testing-error-border ${error.status || 'open'}`;
        }
    }

    refreshCommentThread(panel, error) {
        const commentsList = panel.querySelector(`#comments-${error.id}`);
        if (commentsList) {
            commentsList.innerHTML = this.renderComments(error.comments);
        }
        
        // Update resolve button
        const resolveBtn = panel.querySelector('.btn-resolve');
        if (resolveBtn) {
            resolveBtn.textContent = error.status === 'resolved' ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết';
            resolveBtn.className = `btn-resolve ${error.status === 'resolved' ? 'resolved' : ''}`;
        }
    }

    deleteError(errorId) {
        // Remove from errors array
        this.errors = this.errors.filter(e => e.id !== errorId);
        this.saveErrors();
        
        // Remove border
        const border = document.querySelector(`.testing-error-border[data-error-id="${errorId}"]`);
        if (border) {
            border.remove();
            this.errorBorders = this.errorBorders.filter(b => b !== border);
        }
        
        // Notify popup
        chrome.runtime.sendMessage({ action: 'errorDeleted' });
    }

    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) return 'Vừa xong';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
        return `${Math.floor(diff / 86400000)} ngày trước`;
    }
    
    async saveError(comment) {
        if (!this.selectedElement) return;
        
        const identifiers = {
            cssSelector: this.getElementCSSSelector(this.selectedElement),
            xpath: this.getElementXPath(this.selectedElement),
            attributes: {
                id: this.selectedElement.id,
                class: this.selectedElement.className
            }
        };

        // Test if we can find the element with these identifiers
        const testFind = this.findElementByIdentifiers(identifiers);
        if (!testFind || testFind !== this.selectedElement) {
            console.error('Warning: Selected element might not be uniquely identified');
            return;
        }

        const rect = this.selectedElement.getBoundingClientRect();
        const error = {
            id: this.generateUUID(),
            elementIdentifiers: identifiers,
            timestamp: Date.now(),
            position: {
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                relativePosition: {
                    topPercent: (rect.top / window.innerHeight) * 100,
                    leftPercent: (rect.left / window.innerWidth) * 100,
                    widthPercent: (rect.width / window.innerWidth) * 100,
                    heightPercent: (rect.height / window.innerHeight) * 100
                }
            },
            url: this.currentUrl,
            status: 'open',
            assignee: null,
            comments: [{
                id: this.generateUUID(),
                text: comment,
                author: await this.getUserInfo(),
                timestamp: Date.now(),
                edited: false,
                editedAt: null
            }]
        };
        
        // Verify one more time
        if (this.findElementByIdentifiers(error.elementIdentifiers) === this.selectedElement) {
            this.errors.push(error);
            this.saveErrors();
            this.createErrorBorder(error);
            
            const browserAPI = window.chrome || window.browser;
            browserAPI.runtime.sendMessage({ action: 'errorAdded' }).catch(() => {
                // Popup might not be open, ignore error
            });
        } else {
            console.error('Failed to save error: Cannot reliably identify the selected element');
        }
    }
    
    getElementIdentifiers(element) {
        return {
            xpath: this.getElementXPath(element),
            cssSelector: this.getElementCSSSelector(element),
            attributes: this.getElementAttributes(element)
        };
    }

    getElementXPath(element) {
        if (element.id) {
            return `//*[@id="${element.id}"]`;
        }
        
        const parts = [];
        let current = element;
        
        while (current && current !== document.body) {
            let tagName = current.tagName.toLowerCase();
            let index = 1;
            
            // Count siblings with same tag name
            let sibling = current.previousElementSibling;
            while (sibling) {
                if (sibling.tagName.toLowerCase() === tagName) {
                    index++;
                }
                sibling = sibling.previousElementSibling;
            }
            
            // Check if there are siblings with same tag name after current element
            let hasNextSiblings = false;
            sibling = current.nextElementSibling;
            while (sibling) {
                if (sibling.tagName.toLowerCase() === tagName) {
                    hasNextSiblings = true;
                    break;
                }
                sibling = sibling.nextElementSibling;
            }
            
            // Add index only if there are multiple siblings with same tag
            if (index > 1 || hasNextSiblings) {
                parts.unshift(`${tagName}[${index}]`);
            } else {
                parts.unshift(tagName);
            }
            
            current = current.parentElement;
        }
        
        return '//' + parts.join('/');
    }

    getElementCSSSelector(element) {
        // Prefer ID if available
        if (element.id) {
            return `#${element.id}`;
        }
        
        let selector = element.tagName.toLowerCase();
        
        // Add classes if available (limit to 3 most specific)
        if (element.className) {
            const classes = element.className.split(' ')
                .filter(c => c.trim() && !c.startsWith('testing-'))
                .slice(0, 3);
            if (classes.length > 0) {
                selector += '.' + classes.join('.');
            }
        }
        
        // Add attributes for better specificity
        const importantAttrs = ['data-testid', 'data-id', 'name', 'type', 'role'];
        for (const attr of importantAttrs) {
            if (element.hasAttribute(attr)) {
                selector += `[${attr}="${element.getAttribute(attr)}"]`;
                break; // One attribute is usually enough
            }
        }
        
        // If still not specific enough, add nth-child
        if (!element.id && !element.className) {
            const parent = element.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(child => 
                    child.tagName === element.tagName
                );
                if (siblings.length > 1) {
                    const index = siblings.indexOf(element) + 1;
                    selector += `:nth-child(${index})`;
                }
            }
        }
        
        return selector;
    }

    getElementAttributes(element) {
        const attrs = {};
        const importantAttrs = ['id', 'class', 'data-testid', 'data-id', 'name', 'type', 'role', 'href'];
        
        importantAttrs.forEach(attr => {
            if (element.hasAttribute(attr)) {
                attrs[attr] = element.getAttribute(attr);
            }
        });
        
        return attrs;
    }

    findElementByIdentifiers(identifiers) {
        // Try CSS selector first (most reliable for our case)
        try {
            const element = document.querySelector(identifiers.cssSelector);
            if (element) return element;
        } catch (e) {
            console.log('CSS selector failed:', e);
        }
        
        // Try XPath as backup
        try {
            const xpathResult = document.evaluate(
                identifiers.xpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );
            if (xpathResult.singleNodeValue) {
                return xpathResult.singleNodeValue;
            }
        } catch (e) {
            console.log('XPath failed:', e);
        }

        // If both failed, try attributes as last resort
        if (identifiers.attributes && Object.keys(identifiers.attributes).length > 0) {
            for (const [attr, value] of Object.entries(identifiers.attributes)) {
                if (attr === 'id' && value) {
                    const element = document.getElementById(value);
                    if (element) return element;
                }
            }
        }
        
        return null;
    }

    findElementByAttributes(identifiers) {
        const elements = document.getElementsByTagName(identifiers.tagName);
        
        for (let element of elements) {
            let score = 0;
            
            // Check attributes match
            for (const [attr, value] of Object.entries(identifiers.attributes)) {
                if (element.getAttribute(attr) === value) {
                    score += attr === 'id' ? 10 : (attr === 'class' ? 5 : 3);
                }
            }
            
            // Check text content similarity
            if (identifiers.textContent && element.textContent) {
                const elementText = element.textContent.trim().substring(0, 50);
                if (elementText === identifiers.textContent) {
                    score += 5;
                } else if (elementText.includes(identifiers.textContent) || 
                          identifiers.textContent.includes(elementText)) {
                    score += 2;
                }
            }
            
            // Return element with highest score (threshold of 5)
            if (score >= 5) {
                return element;
            }
        }
        
        return null;
    }
    


    createErrorBorder(error) {
        const element = this.findErrorElement(error);
        if (!element) return;
        
        // Create border overlay
        const border = document.createElement('div');
        border.className = 'testing-error-border';
        border.dataset.errorId = error.id;
        
        // Position border to match element
        this.positionErrorBorder(border, error, element);
        
        // Add click handler to show thread
        border.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showCommentThread(error, border);
        });
        
        border.addEventListener('mouseleave', () => {
            border.classList.remove('testing-border-hover');
        });
        
        document.body.appendChild(border);
        this.errorBorders.push(border);
    }

    positionErrorBorder(border, error, element) {
        if (!element) {
            element = this.findErrorElement(error);
            if (!element) {
                border.style.display = 'none';
                return;
            }
        }
        
        const rect = element.getBoundingClientRect();
        
        // Position border to overlay the element
        border.style.position = 'absolute';
        border.style.top = `${rect.top + window.scrollY}px`;
        border.style.left = `${rect.left + window.scrollX}px`;
        border.style.width = `${rect.width}px`;
        border.style.height = `${rect.height}px`;
        border.style.display = 'block';
        
        // Add status class
        border.className = `testing-error-border ${error.status || 'open'}`;
    }

    updateAllErrorBorders() {
        this.errorBorders.forEach(border => {
            const errorId = border.dataset.errorId;
            const error = this.errors.find(e => e.id === errorId);
            if (error) {
                this.positionErrorBorder(border, error);
            }
        });
    }

    findErrorElement(error) {
        // Use new identifier system if available
        if (error.elementIdentifiers) {
            return this.findElementByIdentifiers(error.elementIdentifiers);
        }
        
        // Fallback to legacy selector
        if (error.selector) {
            try {
                return document.querySelector(error.selector);
            } catch (e) {
                console.log('Legacy selector failed:', e);
            }
        }
        
        return null;
    }

    isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && 
               rect.top < window.innerHeight && rect.bottom > 0 &&
               rect.left < window.innerWidth && rect.right > 0;
    }
    
    loadErrors() {
        const browserAPI = window.chrome || window.browser;
        
        browserAPI.storage.local.get(['feedback'], (result) => {
            if (result.feedback && result.feedback.path) {
                const pathItem = result.feedback.path.find(p => p.full_url === this.currentUrl);
                this.errors = pathItem ? pathItem.data : [];
            } else {
                // Fallback to old format if new structure doesn't exist
                browserAPI.storage.local.get([this.currentUrl], (oldResult) => {
                    this.errors = oldResult[this.currentUrl] || [];
                });
            }
        });
    }
    
    saveErrors() {
        const browserAPI = window.chrome || window.browser;
        
        // Get all stored data first
        browserAPI.storage.local.get(['feedback'], (result) => {
            let newStructure = result.feedback;
            
            // Initialize new structure if it doesn't exist
            if (!newStructure) {
                try {
                    const domain = (new URL(this.currentUrl)).hostname;
                    newStructure = {
                        domain: domain,
                        path: []
                    };
                } catch (e) {
                    newStructure = {
                        domain: "",
                        path: []
                    };
                }
            }
            
            // Update the current URL's data in the new structure
            let pathIndex = newStructure.path.findIndex(p => p.full_url === this.currentUrl);
            
            if (pathIndex >= 0) {
                newStructure.path[pathIndex].data = this.errors;
            } else {
                newStructure.path.push({
                    full_url: this.currentUrl,
                    data: this.errors
                });
            }
            
            // Save the new structure
            browserAPI.storage.local.set({ 
                feedback: newStructure,
                // [this.currentUrl]: this.errors // Keep old format for compatibility during migration
            });
        });
    }

    displayExistingErrors() {
        const browserAPI = window.chrome || window.browser;
        
        browserAPI.storage.local.get(['feedback'], (result) => {
            let errors = [];
            
            if (result.feedback && result.feedback.path) {
                const pathItem = result.feedback.path.find(p => p.full_url === this.currentUrl);
                errors = pathItem ? pathItem.data : [];
            } else {
                // Fallback to old format
                browserAPI.storage.local.get([this.currentUrl], (oldResult) => {
                    errors = oldResult[this.currentUrl] || [];
                    this.processExistingErrors(errors);
                });
                return;
            }
            
            this.processExistingErrors(errors);
        });
    }
    
    processExistingErrors(errors) {
        this.errors = errors; // Update local errors array
        errors.forEach(error => {
            this.createErrorBorder(error);
        });
    }
    
    showAllErrors() {
        this.errorBorders.forEach(border => {
            border.style.display = 'block';
        });
    }
    
    hideAllErrors() {
        this.errorBorders.forEach(border => {
            border.style.display = 'none';
        });
    }
    
    highlightError(errorId) {
        const error = this.errors.find(e => e.id === errorId);
        if (!error) return;

        console.log(error);
        
        // Remove existing highlights
        document.querySelectorAll('.testing-error-highlight').forEach(el => {
            el.classList.remove('testing-error-highlight');
        });

        //find div with data-error-id = error.id
        const errorElement = document.querySelector(`div[data-error-id="${error.id}"]`);
        if (errorElement) {
            errorElement.classList.add('testing-error-highlight');
            errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                errorElement.classList.remove('testing-error-highlight');
            }, 1000);
        }
        
        // // Try to find element using new identifier system
        // const element = this.findErrorElement(error);
        // if (element) {
        //     element.classList.add('testing-error-highlight');
        //     element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            

            
        //     // Remove highlight after 3 seconds
        //     setTimeout(() => {
        //         element.classList.remove('testing-error-highlight');
        //     }, 1);
        // } else {
        //     // Fallback scroll using relative position
        //     if (error.position && error.position.relativePosition) {
        //         const rel = error.position.relativePosition;
        //         const top = (rel.topPercent / 100) * window.innerHeight;
        //         const left = (rel.leftPercent / 100) * window.innerWidth;
                
        //         window.scrollTo({
        //             top: top - window.innerHeight / 2,
        //             left: left - window.innerWidth / 2,
        //             behavior: 'smooth'
        //         });
        //     } else if (error.position && error.position.top !== undefined) {
        //         // Legacy position fallback
        //         window.scrollTo({
        //             top: error.position.top - window.innerHeight / 2,
        //             left: error.position.left - window.innerWidth / 2,
        //             behavior: 'smooth'
        //         });
        //     }
        // }
    }
    
    clearAllErrors() {
        // Remove all borders
        this.errorBorders.forEach(border => border.remove());
        this.errorBorders = [];
        
        // Clear data
        this.errors = [];
        this.saveErrors();
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