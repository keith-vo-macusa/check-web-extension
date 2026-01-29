/**
 * CommentThreadManager - Manages comment threads for errors
 * Handles comment display, editing, deletion, and error status changes
 * @module CommentThreadManager
 */

import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { ValidationService } from '../utils/ValidationService.js';

export class CommentThreadManager {
    /**
     * Constructor
     * @param {Function} getUserInfo - Function to get current user info
     * @param {Function} onCommentAdded - Callback when comment is added
     * @param {Function} onCommentEdited - Callback when comment is edited
     * @param {Function} onCommentDeleted - Callback when comment is deleted
     * @param {Function} onErrorResolved - Callback when error status toggled
     * @param {Function} onErrorDeleted - Callback when error is deleted
     */
    constructor(
        getUserInfo,
        onCommentAdded,
        onCommentEdited,
        onCommentDeleted,
        onErrorResolved,
        onErrorDeleted,
    ) {
        this.getUserInfo = getUserInfo;
        this.onCommentAdded = onCommentAdded;
        this.onCommentEdited = onCommentEdited;
        this.onCommentDeleted = onCommentDeleted;
        this.onErrorResolved = onErrorResolved;
        this.onErrorDeleted = onErrorDeleted;

        this.currentThread = null; // Currently open thread
    }

    /**
     * @private
     * @returns {string} Spinner SVG (uses currentColor)
     */
    getSpinnerSvg() {
        return `
            <svg class="btn-loading-spinner" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="9"></circle>
            </svg>
        `;
    }

    /**
     * @private
     * @param {HTMLButtonElement} button
     * @param {boolean} isLoading
     * @param {{ text?: string }=} options
     */
    setButtonLoading(button, isLoading, options) {
        if (!button) return;

        if (isLoading) {
            if (!button.dataset.originalHtml) {
                button.dataset.originalHtml = button.innerHTML;
            }
            if (button.dataset.originalDisabled === undefined) {
                button.dataset.originalDisabled = String(!!button.disabled);
            }

            button.disabled = true;
            button.classList.add('is-loading');
            button.setAttribute('aria-busy', 'true');

            const isIconButton =
                button.classList.contains('btn-send-icon') ||
                button.classList.contains('btn-inside-input') ||
                button.classList.contains('testing-modal-send');

            if (isIconButton) {
                button.innerHTML = this.getSpinnerSvg();
            } else {
                button.textContent = options?.text || 'Đang xử lý...';
            }
            return;
        }

        button.classList.remove('is-loading');
        button.removeAttribute('aria-busy');

        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
            delete button.dataset.originalHtml;
        }

        if (button.dataset.originalDisabled !== undefined) {
            button.disabled = button.dataset.originalDisabled === 'true';
            delete button.dataset.originalDisabled;
        } else {
            button.disabled = false;
        }
    }

    /**
     * Show comment input modal for new error
     * @param {boolean} isRect - Whether this is a rectangle selection
     * @param {Function} onSave - Callback with comment text
     * @param {Function} onCancel - Callback on cancel
     */
    showCommentInputModal(isRect, onSave, onCancel) {
        this.closeCommentInputModal();

        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.className = ConfigurationManager.CSS_CLASSES.MODAL_BACKDROP;

        // Create modal
        const modal = document.createElement('div');
        modal.className = ConfigurationManager.CSS_CLASSES.COMMENT_MODAL;
        modal.innerHTML = `
            <div class="testing-modal-header">
                <h3>Thêm bình luận</h3>
                <button class="testing-modal-close" data-action="cancel" aria-label="Đóng">×</button>
            </div>
            <div class="testing-modal-body">
                <div class="testing-comment-input-wrap">
                    <textarea placeholder="Mô tả lỗi hoặc ghi chú..." maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}"></textarea>
                    <button class="testing-modal-send btn-inside-input btn-send-icon" data-action="save" aria-label="Lưu bình luận" title="Lưu">
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        const textarea = modal.querySelector('textarea');
        const cancelBtn = modal.querySelector('[data-action="cancel"]');
        const saveBtn = modal.querySelector('[data-action="save"]');

        // Handle cancel
        const handleCancel = () => {
            this.closeCommentInputModal();
            if (onCancel) {
                onCancel();
            }
        };

        cancelBtn.addEventListener('click', handleCancel);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                handleCancel();
            }
        });

        // Handle save
        saveBtn.addEventListener('click', async () => {
            const comment = textarea.value.trim();
            const validation = ValidationService.validateComment(comment);

            if (!validation.valid) {
                textarea.focus();
                return;
            }

            cancelBtn.disabled = true;
            this.setButtonLoading(saveBtn, true);

            try {
                if (onSave) {
                    await Promise.resolve(onSave(comment));
                }
                this.closeCommentInputModal();
            } catch (err) {
                ErrorLogger.error('Failed to save comment', err);
                cancelBtn.disabled = false;
                this.setButtonLoading(saveBtn, false);
                textarea.focus();
            }
        });

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        textarea.focus();

        this.currentInputModal = { backdrop, modal };

        ErrorLogger.debug('Comment input modal shown', { isRect });
    }

    /**
     * Close comment input modal
     */
    closeCommentInputModal() {
        if (this.currentInputModal) {
            this.currentInputModal.backdrop.remove();
            this.currentInputModal.modal.remove();
            this.currentInputModal = null;
        }
    }

    /**
     * Show comment thread for an error
     * @param {Object} error - Error object with comments
     * @param {HTMLElement} border - Error border element
     */
    async showCommentThread(error, border) {
        this.closeCommentThread();

        const userInfo = await this.getUserInfo();
        if (!userInfo) {
            ErrorLogger.error('Cannot show comment thread without user info');
            return;
        }

        // Create backdrop
        const backdrop = document.createElement('div');
        // Reuse common modal backdrop for consistent structure/styling
        backdrop.className = ConfigurationManager.CSS_CLASSES.MODAL_BACKDROP;
        backdrop.addEventListener('click', () => this.closeCommentThread());

        // Create thread panel
        const panel = document.createElement('div');
        panel.className = 'testing-comment-thread position-center';

        // Render panel content
        this.renderThreadPanel(panel, error, userInfo);

        document.body.appendChild(backdrop);
        document.body.appendChild(panel);

        this.currentThread = { backdrop, panel, error, border, userInfo };

        ErrorLogger.debug('Comment thread shown', { errorId: error.id });
    }

    /**
     * Render thread panel content
     * @private
     * @param {HTMLElement} panel - Panel element
     * @param {Object} error - Error object
     * @param {Object} userInfo - Current user info
     */
    renderThreadPanel(panel, error, userInfo) {
        const statusText = this.getStatusText(error.status);
        const statusClass = `status-${error.status}`;
        const currentUserName = userInfo?.name || 'You';
        const currentUserInitial = currentUserName.charAt(0).toUpperCase();
        const isResolved = error.status === ConfigurationManager.ERROR_STATUS.RESOLVED;

        panel.innerHTML = `
            <div class="thread-header">
                <div class="thread-title">
                    <div class="thread-heading">Bình luận</div>
                    <div class="thread-status ${statusClass}">${statusText}</div>
                </div>
                <div class="thread-header-actions">
                    <button class="btn-resolve ${isResolved ? 'resolved' : ''}" data-error-id="${error.id}">
                        ${isResolved ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết'}
                    </button>
                    <button class="btn-delete" data-error-id="${error.id}" aria-label="Xóa">Xóa</button>
                    <button class="thread-close" aria-label="Đóng">×</button>
                </div>
            </div>
            <div class="thread-content">
                <div class="comments-list" id="comments-${error.id}">
                    ${this.renderComments(error.comments, userInfo)}
                </div>
                <div class="thread-actions">
                    <div class="reply-form">
                        <div class="reply-composer">
                            <div class="comment-avatar reply-avatar">
                                <div class="avatar-circle">${currentUserInitial}</div>
                            </div>
                            <div class="reply-box">
                                <div class="reply-input-wrap">
                                    <textarea placeholder="Viết bình luận..." class="reply-input"
                                              maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}"></textarea>
                                    <button class="btn-reply-send btn-inside-input btn-send-icon" style="border-radius: 50% !important;" aria-label="Gửi bình luận" title="Gửi">
                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindThreadEvents(panel, error);
    }

    /**
     * Render comments list
     * @private
     * @param {Array} comments - Array of comment objects
     * @param {Object} userInfo - Current user info
     * @returns {string} HTML string
     */
    renderComments(comments, userInfo) {
        return comments
            .map((comment) => {
                const authorName = comment.author?.name || 'Unknown';
                const authorInitial = authorName.charAt(0).toUpperCase();
                const timeText = this.formatTime(comment.timestamp);
                const editedText = comment.edited
                    ? '<span class="comment-edited">(đã chỉnh sửa)</span>'
                    : '';

                const isOwnComment = comment.author?.id === userInfo?.id;
                const replyButton = `
                    <button class="btn-reply-comment" data-comment-id="${comment.id}">Trả lời</button>
                `;
                const editButtons = isOwnComment
                    ? `
                <button class="btn-edit-comment" data-comment-id="${comment.id}">Chỉnh sửa</button>
                <button class="btn-delete-comment" data-comment-id="${comment.id}">Xóa</button>
            `
                    : '';

                const safeOriginal = ValidationService.sanitizeHtml(comment.text);
                const safeHtml = ValidationService.linkify(safeOriginal);

                return `
                <div class="comment-item" data-comment-id="${comment.id}">
                    <div class="comment-avatar">
                        <div class="avatar-circle">${authorInitial}</div>
                    </div>
                    <div class="comment-content">
                        <div class="comment-bubble">
                            <div class="comment-header">
                                <span class="comment-author">${ValidationService.sanitizeHtml(
                    authorName,
                )}</span>
                                <span class="comment-time">${timeText}</span>
                                ${editedText}
                            </div>
                            <div class="comment-text" data-original="${safeOriginal}">${safeHtml}</div>
                        </div>
                        <div class="comment-actions">
                            ${replyButton}
                            ${editButtons}
                        </div>
                    </div>
                </div>
            `;
            })
            .join('');
    }

    /**
     * Bind event handlers to thread panel
     * @private
     * @param {HTMLElement} panel - Panel element
     * @param {Object} error - Error object
     */
    bindThreadEvents(panel, error) {
        // Close button
        panel.querySelector('.thread-close').addEventListener('click', () => {
            this.closeCommentThread();
        });

        // Reply functionality
        const replyInput = panel.querySelector('.reply-input');
        const replySend = panel.querySelector('.btn-reply-send');

        const handleReply = async () => {
            const text = replyInput.value.trim();
            const validation = ValidationService.validateComment(text);

            if (!validation.valid) {
                return;
            }

            if (!this.onCommentAdded) {
                return;
            }

            replyInput.disabled = true;
            this.setButtonLoading(replySend, true);

            try {
                await this.onCommentAdded(error, text);
                await this.refreshThreadPanel(panel, error);
                replyInput.value = '';

                // Scroll to bottom
                const commentsList = panel.querySelector('.comments-list');
                if (commentsList) {
                    commentsList.scrollTop = commentsList.scrollHeight;
                }
            } catch (err) {
                ErrorLogger.error('Failed to add comment', err);
            } finally {
                replyInput.disabled = false;
                this.setButtonLoading(replySend, false);
                replyInput.focus();
            }
        };

        replySend.addEventListener('click', handleReply);

        replyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleReply();
            }
        });

        replyInput.focus();

        // Resolve button
        const resolveBtn = panel.querySelector('.btn-resolve');
        resolveBtn.addEventListener('click', async () => {
            if (!this.onErrorResolved) {
                return;
            }

            this.setButtonLoading(resolveBtn, true, { text: 'Đang xử lý...' });
            try {
                await this.onErrorResolved(error);
            } catch (err) {
                ErrorLogger.error('Failed to resolve error', err);
            } finally {
                // Restore before refresh so UI can update text/class
                this.setButtonLoading(resolveBtn, false);
            }

            await this.refreshThreadPanel(panel, error);
        });

        // Delete error button
        const deleteErrorBtn = panel.querySelector('.btn-delete');
        deleteErrorBtn.addEventListener('click', () => {
            this.confirmDeleteError(error, deleteErrorBtn);
        });

        // Edit/Delete comment buttons
        panel.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-reply-comment')) {
                const commentId = e.target.dataset.commentId;
                const comment = error.comments.find((c) => c.id === commentId);
                const authorName = comment?.author?.name || 'Unknown';

                const input = panel.querySelector('.reply-input');
                if (input) {
                    const prefix = `@${authorName} `;
                    if (!input.value.startsWith(prefix)) {
                        input.value = `${prefix}${input.value.trimStart()}`;
                    }
                    input.focus();
                    input.setSelectionRange(input.value.length, input.value.length);
                }
            }

            if (e.target.classList.contains('btn-edit-comment')) {
                const commentId = e.target.dataset.commentId;
                await this.editComment(panel, error, commentId);
            }

            if (e.target.classList.contains('btn-delete-comment')) {
                const commentId = e.target.dataset.commentId;
                await this.confirmDeleteComment(panel, error, commentId, e.target);
            }
        });
    }

    /**
     * Edit a comment
     * @private
     * @param {HTMLElement} panel - Panel element
     * @param {Object} error - Error object
     * @param {string} commentId - Comment ID
     */
    async editComment(panel, error, commentId) {
        const comment = error.comments.find((c) => c.id === commentId);
        if (!comment) {
            return;
        }

        const commentElement = panel.querySelector(`[data-comment-id="${commentId}"]`);
        const textElement = commentElement.querySelector('.comment-text');
        const actionsElement = commentElement.querySelector('.comment-actions');
        const originalText = textElement.dataset.original;

        // Create edit form
        const editForm = document.createElement('div');
        editForm.className = 'edit-form';
        editForm.innerHTML = `
            <div class="edit-input-wrap">
                <textarea class="edit-input" maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}">${originalText}</textarea>
                <button class="btn-edit-save btn-inside-input btn-send-icon" style="border-radius: 50% !important;" aria-label="Lưu chỉnh sửa" title="Lưu">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                    </svg>
                </button>
            </div>
            <div class="edit-buttons">
                <button class="btn-edit-cancel">Hủy</button>
            </div>
        `;

        // Replace text with edit form
        textElement.style.display = 'none';
        if (actionsElement) {
            actionsElement.style.display = 'none';
        }
        textElement.parentNode.appendChild(editForm);

        const editInput = editForm.querySelector('.edit-input');
        editInput.focus();
        editInput.setSelectionRange(editInput.value.length, editInput.value.length);

        // Cancel edit
        editForm.querySelector('.btn-edit-cancel').addEventListener('click', () => {
            this.cancelEdit(textElement, editForm, actionsElement);
        });

        // Save edit
        const saveEditBtn = editForm.querySelector('.btn-edit-save');
        const cancelEditBtn = editForm.querySelector('.btn-edit-cancel');

        saveEditBtn.addEventListener('click', async () => {
            const newText = editInput.value.trim();
            const validation = ValidationService.validateComment(newText);

            if (!validation.valid || newText === originalText) {
                this.cancelEdit(textElement, editForm, actionsElement);
                return;
            }

            if (!this.onCommentEdited) {
                return;
            }

            editInput.disabled = true;
            cancelEditBtn.disabled = true;
            this.setButtonLoading(saveEditBtn, true);

            try {
                await this.onCommentEdited(error, commentId, newText);
                await this.refreshThreadPanel(panel, error);
            } catch (err) {
                ErrorLogger.error('Failed to edit comment', err);
            } finally {
                editInput.disabled = false;
                cancelEditBtn.disabled = false;
                this.setButtonLoading(saveEditBtn, false);
            }
        });
    }

    /**
     * Cancel comment edit
     * @private
     */
    cancelEdit(textElement, editForm, actionsElement) {
        textElement.style.display = 'block';
        if (actionsElement) {
            actionsElement.style.display = 'block';
        }
        editForm.remove();
    }

    /**
     * Confirm and delete a comment
     * @private
     */
    async confirmDeleteComment(panel, error, commentId, triggerButton) {
        if (!confirm('Bạn có chắc muốn xóa comment này?')) {
            return;
        }

        if (!this.onCommentDeleted) {
            return;
        }

        this.setButtonLoading(triggerButton, true, { text: 'Đang xóa...' });
        try {
            await this.onCommentDeleted(error, commentId);
            await this.refreshThreadPanel(panel, error);
        } catch (err) {
            ErrorLogger.error('Failed to delete comment', err);
        } finally {
            this.setButtonLoading(triggerButton, false);
        }
    }

    /**
     * Confirm and delete an error
     * @private
     */
    async confirmDeleteError(error, triggerButton) {
        if (!confirm('Bạn có chắc muốn xóa lỗi này?')) {
            return;
        }

        if (!this.onErrorDeleted) {
            this.closeCommentThread();
            return;
        }

        this.setButtonLoading(triggerButton, true, { text: 'Đang xóa...' });
        try {
            await Promise.resolve(this.onErrorDeleted(error));
            this.closeCommentThread();
        } catch (err) {
            ErrorLogger.error('Failed to delete error', err);
            this.setButtonLoading(triggerButton, false);
        }
    }

    /**
     * Refresh thread panel content
     * @private
     * @param {HTMLElement} panel - Panel element
     * @param {Object} error - Updated error object
     */
    async refreshThreadPanel(panel, error) {
        if (!this.currentThread || this.currentThread.error.id !== error.id) {
            return;
        }

        const userInfo = await this.getUserInfo();
        if (!userInfo) {
            return;
        }

        // Update comments list
        const commentsList = panel.querySelector('.comments-list');
        if (commentsList) {
            commentsList.innerHTML = this.renderComments(error.comments, userInfo);
        }

        // Update resolve button
        const resolveBtn = panel.querySelector('.btn-resolve');
        if (resolveBtn) {
            const isResolved = error.status === ConfigurationManager.ERROR_STATUS.RESOLVED;
            resolveBtn.textContent = isResolved ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết';
            resolveBtn.className = `btn-resolve ${isResolved ? 'resolved' : ''}`;
        }

        // Update status badge
        const statusBadge = panel.querySelector('.thread-status');
        if (statusBadge) {
            statusBadge.textContent = this.getStatusText(error.status);
            statusBadge.className = `thread-status status-${error.status}`;
        }

        // Update current thread reference
        this.currentThread.error = error;
    }

    /**
     * Close comment thread
     */
    closeCommentThread() {
        if (this.currentThread) {
            this.currentThread.backdrop.remove();
            this.currentThread.panel.remove();
            this.currentThread = null;
        }
    }

    /**
     * Get status display text
     * @private
     * @param {string} status - Status value
     * @returns {string} Display text
     */
    getStatusText(status) {
        const statusMap = {
            [ConfigurationManager.ERROR_STATUS.OPEN]: 'Mở',
            [ConfigurationManager.ERROR_STATUS.RESOLVED]: 'Đã giải quyết',
            [ConfigurationManager.ERROR_STATUS.CLOSED]: 'Đã đóng',
        };
        return statusMap[status] || 'Mở';
    }

    /**
     * Format timestamp to relative time
     * @private
     * @param {number} timestamp - Timestamp in milliseconds
     * @returns {string} Formatted time string
     */
    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;

        if (diff < 60000) {
            return 'Vừa xong';
        }
        if (diff < 3600000) {
            return `${Math.floor(diff / 60000)} phút trước`;
        }
        if (diff < 86400000) {
            return `${Math.floor(diff / 3600000)} giờ trước`;
        }
        return `${Math.floor(diff / 86400000)} ngày trước`;
    }

    /**
     * Get current thread info
     * @returns {Object|null} Current thread or null
     */
    getCurrentThread() {
        return this.currentThread;
    }
}
