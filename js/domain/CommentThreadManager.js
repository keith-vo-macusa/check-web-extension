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
            <h3>💬 Thêm comment cho lỗi</h3>
            <textarea
                placeholder="Mô tả lỗi hoặc ghi chú..."
                maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}">
            </textarea>
            <div class="testing-modal-buttons">
                <button class="testing-modal-btn testing-modal-btn-secondary" data-action="cancel">Hủy</button>
                <button class="testing-modal-btn testing-modal-btn-primary" data-action="save">Lưu</button>
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

            // Disable buttons and show loading
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            saveBtn.textContent = 'Đang lưu...';

            if (onSave) {
                await Promise.resolve(onSave(comment));
            }

            this.closeCommentInputModal();
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
        backdrop.className = ConfigurationManager.CSS_CLASSES.MODAL_BACKDROP;
        backdrop.addEventListener('click', () => this.closeCommentThread());

        // Create thread panel
        const panel = document.createElement('div');
        panel.className = ConfigurationManager.CSS_CLASSES.COMMENT_MODAL;

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

        panel.innerHTML = `
            <div class="thread-header">
                <div class="thread-title">
                    <div class="thread-status ${statusClass}">${statusText}</div>
                </div>
                <button class="thread-close" aria-label="Đóng">×</button>
            </div>
            <div class="thread-content">
                <div class="comments-list" id="comments-${error.id}">
                    ${this.renderComments(error.comments, userInfo)}
                </div>
                <div class="thread-actions">
                    <div class="reply-form">
                        <textarea placeholder="Thêm comment..." class="reply-input"
                                  maxlength="${
                                      ConfigurationManager.UI.COMMENT_MAX_LENGTH
                                  }"></textarea>
                        <div class="reply-buttons">
                            <button class="btn-reply-send">Gửi</button>
                        </div>
                    </div>
                    <div class="thread-meta">
                        <button class="btn-resolve ${
                            error.status === ConfigurationManager.ERROR_STATUS.RESOLVED
                                ? 'resolved'
                                : ''
                        }" data-error-id="${error.id}">
                            ${
                                error.status === ConfigurationManager.ERROR_STATUS.RESOLVED
                                    ? '✓ Đã giải quyết'
                                    : 'Đánh dấu đã giải quyết'
                            }
                        </button>
                        <button class="btn-delete" data-error-id="${error.id}">🗑 Xóa</button>
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
                const editButtons = isOwnComment
                    ? `
                <button class="btn-edit-comment" data-comment-id="${comment.id}">Chỉnh sửa</button>
                <button class="btn-delete-comment" data-comment-id="${comment.id}">Xóa</button>
            `
                    : '';

                return `
                <div class="comment-item" data-comment-id="${comment.id}">
                    <div class="comment-avatar">
                        <div class="avatar-circle">${authorInitial}</div>
                    </div>
                    <div class="comment-content">
                        <div class="comment-header">
                            <span class="comment-author">${ValidationService.sanitizeHtml(
                                authorName,
                            )}</span>
                            <span class="comment-time">${timeText}</span>
                            ${editedText}
                        </div>
                        <div class="comment-text" data-original="${ValidationService.sanitizeHtml(
                            comment.text,
                        )}">${ValidationService.sanitizeHtml(comment.text)}</div>
                        <div class="comment-actions">
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

            if (this.onCommentAdded) {
                await this.onCommentAdded(error, text);
                this.refreshThreadPanel(panel, error);
                replyInput.value = '';

                // Scroll to bottom
                const commentsList = panel.querySelector('.comments-list');
                commentsList.scrollTop = commentsList.scrollHeight;
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
        panel.querySelector('.btn-resolve').addEventListener('click', async () => {
            if (this.onErrorResolved) {
                await this.onErrorResolved(error);
                this.refreshThreadPanel(panel, error);
            }
        });

        // Delete error button
        panel.querySelector('.btn-delete').addEventListener('click', () => {
            this.confirmDeleteError(error);
        });

        // Edit/Delete comment buttons
        panel.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-edit-comment')) {
                const commentId = e.target.dataset.commentId;
                await this.editComment(panel, error, commentId);
            }

            if (e.target.classList.contains('btn-delete-comment')) {
                const commentId = e.target.dataset.commentId;
                await this.confirmDeleteComment(panel, error, commentId);
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
        const originalText = textElement.dataset.original;

        // Create edit form
        const editForm = document.createElement('div');
        editForm.className = 'edit-form';
        editForm.innerHTML = `
            <textarea class="edit-input" maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}">${originalText}</textarea>
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
            const validation = ValidationService.validateComment(newText);

            if (!validation.valid || newText === originalText) {
                this.cancelEdit(textElement, editForm);
                return;
            }

            if (this.onCommentEdited) {
                await this.onCommentEdited(error, commentId, newText);
                this.refreshThreadPanel(panel, error);
            }
        });
    }

    /**
     * Cancel comment edit
     * @private
     */
    cancelEdit(textElement, editForm) {
        textElement.style.display = 'block';
        textElement.parentNode.querySelector('.comment-actions').style.display = 'block';
        editForm.remove();
    }

    /**
     * Confirm and delete a comment
     * @private
     */
    async confirmDeleteComment(panel, error, commentId) {
        if (!confirm('Bạn có chắc muốn xóa comment này?')) {
            return;
        }

        if (this.onCommentDeleted) {
            await this.onCommentDeleted(error, commentId);
            this.refreshThreadPanel(panel, error);
        }
    }

    /**
     * Confirm and delete an error
     * @private
     */
    confirmDeleteError(error) {
        if (!confirm('Bạn có chắc muốn xóa lỗi này?')) {
            return;
        }

        if (this.onErrorDeleted) {
            this.onErrorDeleted(error);
        }

        this.closeCommentThread();
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
