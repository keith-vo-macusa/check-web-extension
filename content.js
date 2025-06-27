class WebsiteTestingAssistant {
    constructor() {
        this.isActive = false;
        this.errors = [];
        this.selectedElement = null;
        this.highlightOverlay = null;
        this.commentModal = null;
        this.currentUrl = window.location.href;
        this.errorBorders = [];
        this.userInfo = null;
        this.apiEndpoint = 'https://checkwise.macusaone.com/api_domain_data.php';
        this.init();
        this.rangeBreakpoint = 20;
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
        await this.fetchDataFromAPI();
        this.bindEvents();
        this.displayExistingErrors();
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
                case 'removeError':
                    this.removeError(request.errorId);
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
    }

    handleResize() {
        const isVisible = localStorage.getItem('errorsVisible');
        if (isVisible) {
            this.updateAllErrorBorders();
        }
    }

    handleScroll() {
        const isVisible = localStorage.getItem('errorsVisible');
        if (isVisible) {
            this.updateAllErrorBorders();
        }
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

    }
    
    deactivate() {
        this.isActive = false;
        
        document.removeEventListener('click', this.boundHandleClick, true);
        document.removeEventListener('mouseover', this.boundHandleMouseOver, true);
        document.removeEventListener('mouseout', this.boundHandleMouseOut, true);
        
        document.body.classList.remove('testing-selection-mode');
        
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
                    <span class="thread-icon">💬</span>
                    <span>Lỗi #${this.errors.indexOf(error) + 1}</span>
                    <div class="thread-status status-${error.status}">${window.getStatusText(error.status)}</div>
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
        return comments.map(comment => `
            <div class="comment-item" data-comment-id="${comment.id}">
                <div class="comment-avatar">
                    <div class="avatar-circle">${comment.author?.name?.charAt(0).toUpperCase()}</div>
                </div>
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${comment.author?.name}</span>
                        <span class="comment-time">${window.formatTime(comment.timestamp)}</span>
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
            id: this.generateUUID(),
            text: text,
            author: await this.getUserInfo(),
            timestamp: Date.now(),
            edited: false,
            editedAt: null
        };
        
        // Add comment locally first
        error.comments.push(comment);
        
        // Get current feedback data
        let feedbackData = await this.getFeedbackData();
        
        // Find and update the error
        const pathIndex = feedbackData.path.findIndex(p => p.full_url === this.currentUrl);
        if (pathIndex !== -1) {
            const errorIndex = feedbackData.path[pathIndex].data.findIndex(e => e.id === error.id);
            if (errorIndex !== -1) {
                feedbackData.path[pathIndex].data[errorIndex] = error;
                
                // Update API with full feedback data
                const updatedInAPI = await this.updateToAPI(feedbackData);
                
                if (updatedInAPI) {
                    this.saveErrors();
                    this.updateErrorBorder(error);
                } else {
                    // Rollback if API update fails
                    error.comments.pop();
                    alert('Failed to save comment to server. Please try again.');
                }
            }
        }
    }

    async editComment(error, commentId, panel) {
        const comment = error.comments.find(c => c.id === commentId);
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
                    const errorIndex = this.errors.findIndex(e => e.id === error.id);
                    if (errorIndex !== -1) {
                        this.errors[errorIndex] = error;
                    }
                    
                    // Save to localStorage first
                    await this.saveErrors();
                    console.log("Saved to localStorage");
                    
                    // Get updated feedback data and sync with API
                    let feedbackData = await this.getFeedbackData();
                    await this.updateToAPI(feedbackData);
                    console.log("Synced with API");
                    
                    // Update UI last
                    await this.refreshCommentThread(panel, error);
                    console.log("Comment edited successfully");
                } catch (err) {
                    console.error("Error in editComment save:", err);
                    // Rollback changes if something fails
                    Object.assign(comment, originalComment);
                    if (errorIndex !== -1) {
                        this.errors[errorIndex] = error;
                    }
                    await this.refreshCommentThread(panel, error);
                }
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

    async deleteComment(error, commentId) {
        try {
            // Store original comments for rollback if needed
            const originalComments = [...error.comments];
            
            // Remove comment locally
            error.comments = error.comments.filter(c => c.id !== commentId);
            
            // Find and update in this.errors array
            const errorIndex = this.errors.findIndex(e => e.id === error.id);
            if (errorIndex !== -1) {
                this.errors[errorIndex] = error;
            }
            
            // Save to localStorage first
            await this.saveErrors();
            console.log("Saved to localStorage");
            
            // Get updated feedback data and sync with API
            let feedbackData = await this.getFeedbackData();
            await this.updateToAPI(feedbackData);
            console.log("Synced with API");
            
            // Update UI last
            this.updateAllErrorBorders();
            console.log("Comment deleted successfully");
        } catch (err) {
            console.error("Error in deleteComment:", err);
            // Rollback changes if something fails
            if (errorIndex !== -1) {
                error.comments = originalComments;
                this.errors[errorIndex] = error;
                this.updateAllErrorBorders();
            }
        }
    }

    async toggleResolveError(error, border) {
        try {
            console.log("Before toggle - status:", error.status);
            error.status = error.status == 'open' ? 'resolved' : 'open';
            console.log("After toggle - status:", error.status);
            
            // Find and update in this.errors array
            const errorIndex = this.errors.findIndex(e => e.id === error.id);
            if (errorIndex !== -1) {
                this.errors[errorIndex] = error;
            }
            
            // Save to localStorage first
            await this.saveErrors();
            console.log("Saved to localStorage");
            
            // Get updated feedback data and sync with API
            let feedbackData = await this.getFeedbackData();
            await this.updateToAPI(feedbackData);
            console.log("Synced with API");
            
            // Update UI last
            this.updateAllErrorBorders();
            console.log("Final error state:", error);
        } catch (err) {
            console.error("Error in toggleResolveError:", err);
            // Rollback changes if something fails
            if (errorIndex !== -1) {
                error.status = error.status == 'open' ? 'resolved' : 'open';
                this.errors[errorIndex] = error;
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
            resolveBtn.textContent = error.status === 'resolved' ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết';
            resolveBtn.className = `btn-resolve ${error.status === 'resolved' ? 'resolved' : ''}`;
        }
    }

    async deleteError(errorId) {
        // Get current feedback data
        let feedbackData = await this.getFeedbackData();
        
        // Find and remove the error
        const pathIndex = feedbackData.path.findIndex(p => p.full_url === this.currentUrl);
        if (pathIndex !== -1) {
            const errorIndex = feedbackData.path[pathIndex].data.findIndex(e => e.id === errorId);
            if (errorIndex !== -1) {
                feedbackData.path[pathIndex].data.splice(errorIndex, 1);
                
                // Remove empty path entries
                if (feedbackData.path[pathIndex].data.length === 0) {
                    feedbackData.path.splice(pathIndex, 1);
                }

                // Update API with modified feedback data
                const updatedInAPI = await this.updateToAPI(feedbackData);
                
                if (updatedInAPI) {
                    // Update local state
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
                } else {
                    alert('Failed to delete error from server. Please try again.');
                }
            }
        }
    }

    
    
    async saveError(comment) {
        if (!this.selectedElement) return;
        
        const identifiers = {
            xpath: window.getElementXPath(this.selectedElement),
        };

        const width = window.innerWidth;
        const currentBreakpoint = window.getCurrentBreakpoint(width);

        const error = {
            id: this.generateUUID(),
            elementIdentifiers: identifiers,
            timestamp: Date.now(),
            breakpoint: {
                type: currentBreakpoint,
                width: width,
            },
            position: {
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
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
        
        if (window.findElementByIdentifiers(error.elementIdentifiers) === this.selectedElement) {
            // Get current feedback data
            let feedbackData = await this.getFeedbackData();
            
            // Add new error to the appropriate path
            let pathIndex = feedbackData.path.findIndex(p => p.full_url === this.currentUrl);
            if (pathIndex === -1) {
                feedbackData.path.push({
                    full_url: this.currentUrl,
                    data: [error]
                });
            } else {
                feedbackData.path[pathIndex].data.push(error);
            }

            // Update API with full feedback data
            const savedToAPI = await this.updateToAPI(feedbackData);
            
            if (savedToAPI) {
                this.errors.push(error);
                this.saveErrors();
                this.createErrorBorder(error);
                
                const browserAPI = window.chrome || window.browser;
                browserAPI.runtime.sendMessage({ action: 'errorAdded' }).catch(() => {
                    console.error('Failed to send message to extension');
                });
            } else {
                alert('Failed to save error to server. Please try again.');
            }
        } else {
            console.error('Failed to save error: Cannot reliably identify the selected element');
        }
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

        // Determine if border should be visible based on current breakpoint
        const width = window.innerWidth;
        const shouldShow = !error.breakpoint || Math.abs(error.breakpoint.width - width) <= this.rangeBreakpoint;
        border.style.display = shouldShow ? 'block' : 'none';
    }

    positionErrorBorder(border, error, element) {
        if (!element) {
            element = this.findErrorElement(error);
            if (!element) {
                border.style.display = 'none';
                return;
            }
        }

        const shouldShow = this.shouldShowErrorBorder(error);
        border.style.display = shouldShow ? 'block' : 'none';
        if (shouldShow) {
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
    }

    shouldShowErrorBorder(error) {
        const width = window.innerWidth;
        return !error.breakpoint || Math.abs(error.breakpoint.width - width) <= this.rangeBreakpoint;
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
            return window.findElementByIdentifiers(error.elementIdentifiers);
        }

        return null;
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
    
    async saveErrors() {
        const browserAPI = window.chrome || window.browser;
        
        return new Promise((resolve, reject) => {
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
                browserAPI.storage.local.set({ feedback: newStructure }, () => {
                    if (browserAPI.runtime.lastError) {
                        console.error('Error saving to storage:', browserAPI.runtime.lastError);
                        reject(browserAPI.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
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
        // Instead of showing all errors, only show errors for current breakpoint
        this.updateErrorBordersVisibility();
    }

    updateErrorBordersVisibility() {
        this.errorBorders.forEach(border => {
            console.log(border);
            const width = window.innerWidth;
            const errorId = border.dataset.errorId;
            const error = this.errors.find(e => e.id === errorId);
            const shouldShow = this.shouldShowErrorBorder(error);
            border.style.display = shouldShow ? 'block' : 'none';
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
    
    async clearAllErrors() {
        // Remove all borders
        this.errorBorders.forEach(border => border.remove());
        this.errorBorders = [];
        
        // Clear data
        this.errors = [];
        this.saveErrors();
        const feedbackData = {
            domain: new URL(this.currentUrl).hostname,
            path: []
        }
        await this.updateToAPI(feedbackData);
        this.updateAllErrorBorders();
    }

    async removeError(errorId) {
        // Remove error from local array
        this.errors = this.errors.filter(error => error.id !== errorId);
        
        // Remove corresponding border elements
        this.errorBorders = this.errorBorders.filter(border => {
            if (border.dataset.errorId === errorId) {
                border.remove();
                return false;
            }
            return true;
        });
        
        // Persist changes to storage
        this.saveErrors();
        const feedbackData = await this.getFeedbackData();
        await this.updateToAPI(feedbackData);
    }
    
    async fetchDataFromAPI() {
        try {
            const response = await $.ajax({
                url: this.apiEndpoint,
                method: 'GET',
                dataType: 'json',
                data: {
                    domain: new URL(this.currentUrl).hostname,
                    action: 'get'
                }
            });

            // Update local storage with API data
            if (response) {
                const data = response.data;
                const browserAPI = window.chrome || window.browser;
                await browserAPI.storage.local.set({
                    feedback: {
                        domain: new URL(this.currentUrl).hostname,
                        path: data?.path || []
                    }
                });
                
                // Update local errors for current URL
                const pathItem = data?.path.find(p => p.full_url === this.currentUrl);
                this.errors = pathItem ? pathItem.data : [];
            }
        } catch (error) {
            console.error('Error fetching data from API:', error);
        }
    }

    async updateToAPI(feedbackData) {
        try {
            const response = await $.ajax({
                url: this.apiEndpoint + '?action=set',
                method: 'POST',
                contentType: 'application/json',
                data:  JSON.stringify(feedbackData)
            });

            if(response) {
                return response.success;
            }
            return false;
        } catch (error) {
            console.error('Error updating API:', error);
            return false;
        }
    }

    // Helper method to get full feedback data from storage
    async getFeedbackData() {
        const browserAPI = window.chrome || window.browser;
        return new Promise((resolve) => {
            browserAPI.storage.local.get(['feedback'], (result) => {
                resolve(result.feedback || {
                    domain: new URL(this.currentUrl).hostname,
                    path: []
                });
            });
        });
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