import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { ValidationService } from '../utils/ValidationService.js';

export class CommentThreadManager {
    /**
     * @param {Function} getUserInfo
     * @param {Function} onCommentAdded
     * @param {Function} onCommentEdited
     * @param {Function} onCommentDeleted
     * @param {Function} onErrorResolved
     * @param {Function} onErrorDeleted
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
        this.currentThread = null;
    }

    /**
     * Return loading spinner markup for async buttons.
     */
    getSpinnerSvg() {
        return '\n            <svg class="btn-loading-spinner" viewBox="0 0 24 24" aria-hidden="true" focusable="false">\n                <circle cx="12" cy="12" r="9"></circle>\n            </svg>\n        ';
    }

    /**
     * Toggle loading state for action buttons.
     */
    setButtonLoading(button, isLoading, options) {
        if (!button) return;

        if (isLoading) {
            if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
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
     * Show modal for creating a new comment.
     */
    showCommentInputModal(isRect, onSave, onCancel) {
        this.closeCommentInputModal();

        const backdrop = document.createElement('div');
        backdrop.className = ConfigurationManager.CSS_CLASSES.MODAL_BACKDROP;

        const modal = document.createElement('div');
        modal.className = ConfigurationManager.CSS_CLASSES.COMMENT_MODAL;
        modal.innerHTML = `\n            <div class="testing-modal-header">\n                <h3>Thêm bình luận</h3>\n                <button class="testing-modal-close" data-action="cancel" aria-label="Đóng">×</button>\n            </div>\n            <div class="testing-modal-body">\n                <div class="testing-comment-input-wrap">\n                    <textarea placeholder="Mô tả lỗi hoặc ghi chú..." maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}"></textarea>\n                    <button class="testing-modal-send btn-inside-input btn-send-icon" data-action="save" aria-label="Lưu bình luận" title="Lưu">\n                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">\n                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>\n                        </svg>\n                    </button>\n                </div>\n            </div>\n        `;

        const textarea = modal.querySelector('textarea');
        const cancelButton = modal.querySelector('[data-action="cancel"]');
        const saveButton = modal.querySelector('[data-action="save"]');
        const closeModal = () => {
            this.closeCommentInputModal();
            if (onCancel) onCancel();
        };

        cancelButton.addEventListener('click', closeModal);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) closeModal();
        });
        saveButton.addEventListener('click', async () => {
            const commentText = textarea.value.trim();
            if (!ValidationService.validateComment(commentText).valid) {
                textarea.focus();
                return;
            }

            cancelButton.disabled = true;
            this.setButtonLoading(saveButton, true);
            try {
                if (onSave) await Promise.resolve(onSave(commentText));
                this.closeCommentInputModal();
            } catch (error) {
                ErrorLogger.error('Failed to save comment', error);
                cancelButton.disabled = false;
                this.setButtonLoading(saveButton, false);
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
     * Close "add comment" modal if currently open.
     */
    closeCommentInputModal() {
        if (!this.currentInputModal) return;
        this.currentInputModal.backdrop.remove();
        this.currentInputModal.modal.remove();
        this.currentInputModal = null;
    }

    /**
     * Open full comment thread panel for an error.
     */
    async showCommentThread(errorData, errorBorder) {
        this.closeCommentThread();

        const userInfo = await this.getUserInfo();
        if (!userInfo) {
            ErrorLogger.error('Cannot show comment thread without user info');
            return;
        }

        const backdrop = document.createElement('div');
        backdrop.className = ConfigurationManager.CSS_CLASSES.MODAL_BACKDROP;
        backdrop.addEventListener('click', () => this.closeCommentThread());

        const panel = document.createElement('div');
        panel.className = 'testing-comment-thread position-center';
        this.renderThreadPanel(panel, errorData, userInfo);

        document.body.appendChild(backdrop);
        document.body.appendChild(panel);
        this.currentThread = { backdrop, panel, error: errorData, border: errorBorder, userInfo };
        ErrorLogger.debug('Comment thread shown', { errorId: errorData.id });
    }

    /**
     * Render thread panel HTML and bind its events.
     */
    renderThreadPanel(panelElement, errorData, userInfo) {
        const statusText = this.getStatusText(errorData.status);
        const statusClass = `status-${errorData.status}`;
        const avatarInitial = (userInfo?.name || 'You').charAt(0).toUpperCase();
        const isResolved = errorData.status === ConfigurationManager.ERROR_STATUS.RESOLVED;

        panelElement.innerHTML = `\n            <div class="thread-header">\n                <div class="thread-title">\n                    <div class="thread-heading">Bình luận</div>\n                    <div class="thread-status ${statusClass}">${statusText}</div>\n                </div>\n                <div class="thread-header-actions">\n                    <button class="btn-resolve ${isResolved ? 'resolved' : ''}" data-error-id="${errorData.id}">\n                        ${isResolved ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết'}\n                    </button>\n                    <button class="btn-delete" data-error-id="${errorData.id}" aria-label="Xóa">Xóa</button>\n                    <button class="thread-close" aria-label="Đóng">×</button>\n                </div>\n            </div>\n            <div class="thread-content">\n                <div class="comments-list" id="comments-${errorData.id}">\n                    ${this.renderComments(errorData.comments, userInfo)}\n                </div>\n                <div class="thread-actions">\n                    <div class="reply-form">\n                        <div class="reply-composer">\n                            <div class="comment-avatar reply-avatar">\n                                <div class="avatar-circle">${avatarInitial}</div>\n                            </div>\n                            <div class="reply-box">\n                                <div class="reply-input-wrap">\n                                    <textarea placeholder="Viết bình luận..." class="reply-input"\n                                              maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}"></textarea>\n                                    <button class="btn-reply-send btn-inside-input btn-send-icon" style="border-radius: 50% !important;" aria-label="Gửi bình luận" title="Gửi">\n                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">\n                                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>\n                                        </svg>\n                                    </button>\n                                </div>\n                            </div>\n                        </div>\n                    </div>\n                </div>\n            </div>\n        `;

        this.bindThreadEvents(panelElement, errorData);
    }

    /**
     * Render comments list as HTML string.
     */
    renderComments(comments, userInfo) {
        return comments
            .map((comment) => {
                const authorName = comment.author?.name || 'Unknown';
                const authorInitial = authorName.charAt(0).toUpperCase();
                const timeText = this.formatTime(comment.timestamp);
                const editedText = comment.edited ? '<span class="comment-edited">(đã chỉnh sửa)</span>' : '';
                const isOwnComment = comment.author?.id === userInfo?.id;
                const replyAction = `\n                    <button class="btn-reply-comment" data-comment-id="${comment.id}">Trả lời</button>\n                `;
                const ownerActions = isOwnComment
                    ? `\n                <button class="btn-edit-comment" data-comment-id="${comment.id}">Chỉnh sửa</button>\n                <button class="btn-delete-comment" data-comment-id="${comment.id}">Xóa</button>\n            `
                    : '';
                const sanitizedText = ValidationService.sanitizeHtml(comment.text);
                const linkifiedText = ValidationService.linkify(sanitizedText);

                return `\n                <div class="comment-item" data-comment-id="${comment.id}">\n                    <div class="comment-avatar">\n                        <div class="avatar-circle">${authorInitial}</div>\n                    </div>\n                    <div class="comment-content">\n                        <div class="comment-bubble">\n                            <div class="comment-header">\n                                <span class="comment-author">${ValidationService.sanitizeHtml(authorName)}</span>\n                                <span class="comment-time">${timeText}</span>\n                                ${editedText}\n                            </div>\n                            <div class="comment-text" data-original="${sanitizedText}">${linkifiedText}</div>\n                        </div>\n                        <div class="comment-actions">\n                            ${replyAction}\n                            ${ownerActions}\n                        </div>\n                    </div>\n                </div>\n            `;
            })
            .join('');
    }

    /**
     * Bind all interactions inside thread panel.
     */
    bindThreadEvents(panelElement, errorData) {
        panelElement.querySelector('.thread-close').addEventListener('click', () => {
            this.closeCommentThread();
        });

        const replyInput = panelElement.querySelector('.reply-input');
        const sendReplyButton = panelElement.querySelector('.btn-reply-send');
        const addReply = async () => {
            const commentText = replyInput.value.trim();
            if (!ValidationService.validateComment(commentText).valid || !this.onCommentAdded) return;

            replyInput.disabled = true;
            this.setButtonLoading(sendReplyButton, true);
            try {
                await this.onCommentAdded(errorData, commentText);
                await this.refreshThreadPanel(panelElement, errorData);
                replyInput.value = '';
                const commentsList = panelElement.querySelector('.comments-list');
                if (commentsList) commentsList.scrollTop = commentsList.scrollHeight;
            } catch (error) {
                ErrorLogger.error('Failed to add comment', error);
            } finally {
                replyInput.disabled = false;
                this.setButtonLoading(sendReplyButton, false);
                replyInput.focus();
            }
        };

        sendReplyButton.addEventListener('click', addReply);
        replyInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            addReply();
        });
        replyInput.focus();

        const resolveButton = panelElement.querySelector('.btn-resolve');
        resolveButton.addEventListener('click', async () => {
            if (this.onErrorResolved) {
                this.setButtonLoading(resolveButton, true, { text: 'Đang xử lý...' });
                try {
                    await this.onErrorResolved(errorData);
                } catch (error) {
                    ErrorLogger.error('Failed to resolve error', error);
                } finally {
                    this.setButtonLoading(resolveButton, false);
                }
                await this.refreshThreadPanel(panelElement, errorData);
            }
        });

        const deleteButton = panelElement.querySelector('.btn-delete');
        deleteButton.addEventListener('click', () => {
            this.confirmDeleteError(errorData, deleteButton);
        });

        panelElement.addEventListener('click', async (event) => {
            if (event.target.classList.contains('btn-reply-comment')) {
                const commentId = event.target.dataset.commentId;
                const targetComment = errorData.comments.find((comment) => comment.id === commentId);
                const replyTargetName = targetComment?.author?.name || 'Unknown';
                const replyBox = panelElement.querySelector('.reply-input');
                if (replyBox) {
                    const mentionPrefix = `@${replyTargetName} `;
                    if (!replyBox.value.startsWith(mentionPrefix)) {
                        replyBox.value = `${mentionPrefix}${replyBox.value.trimStart()}`;
                    }
                    replyBox.focus();
                    replyBox.setSelectionRange(replyBox.value.length, replyBox.value.length);
                }
            }

            if (event.target.classList.contains('btn-edit-comment')) {
                const commentId = event.target.dataset.commentId;
                await this.editComment(panelElement, errorData, commentId);
            }

            if (event.target.classList.contains('btn-delete-comment')) {
                const commentId = event.target.dataset.commentId;
                await this.confirmDeleteComment(panelElement, errorData, commentId, event.target);
            }
        });
    }

    /**
     * Switch comment into inline edit mode.
     */
    async editComment(panelElement, errorData, commentId) {
        if (!errorData.comments.find((comment) => comment.id === commentId)) return;

        const commentItem = panelElement.querySelector(`[data-comment-id="${commentId}"]`);
        const commentText = commentItem.querySelector('.comment-text');
        const commentActions = commentItem.querySelector('.comment-actions');
        const originalText = commentText.dataset.original;
        const editForm = document.createElement('div');
        editForm.className = 'edit-form';
        editForm.innerHTML = `\n            <div class="edit-input-wrap">\n                <textarea class="edit-input" maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}">${originalText}</textarea>\n                <button class="btn-edit-save btn-inside-input btn-send-icon" style="border-radius: 50% !important;" aria-label="Lưu chỉnh sửa" title="Lưu">\n                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">\n                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>\n                    </svg>\n                </button>\n            </div>\n            <div class="edit-buttons">\n                <button class="btn-edit-cancel">Hủy</button>\n            </div>\n        `;

        commentText.style.display = 'none';
        if (commentActions) commentActions.style.display = 'none';
        commentText.parentNode.appendChild(editForm);

        const editInput = editForm.querySelector('.edit-input');
        editInput.focus();
        editInput.setSelectionRange(editInput.value.length, editInput.value.length);

        editForm.querySelector('.btn-edit-cancel').addEventListener('click', () => {
            this.cancelEdit(commentText, editForm, commentActions);
        });

        const saveEditButton = editForm.querySelector('.btn-edit-save');
        const cancelEditButton = editForm.querySelector('.btn-edit-cancel');
        saveEditButton.addEventListener('click', async () => {
            const updatedText = editInput.value.trim();
            if (!ValidationService.validateComment(updatedText).valid || updatedText === originalText) {
                this.cancelEdit(commentText, editForm, commentActions);
                return;
            }

            if (!this.onCommentEdited) return;
            editInput.disabled = true;
            cancelEditButton.disabled = true;
            this.setButtonLoading(saveEditButton, true);
            try {
                await this.onCommentEdited(errorData, commentId, updatedText);
                await this.refreshThreadPanel(panelElement, errorData);
            } catch (error) {
                ErrorLogger.error('Failed to edit comment', error);
            } finally {
                editInput.disabled = false;
                cancelEditButton.disabled = false;
                this.setButtonLoading(saveEditButton, false);
            }
        });
    }

    /**
     * Exit inline edit mode and restore comment display.
     */
    cancelEdit(commentTextElement, editFormElement, commentActionsElement) {
        commentTextElement.style.display = 'block';
        if (commentActionsElement) commentActionsElement.style.display = 'block';
        editFormElement.remove();
    }

    /**
     * Confirm and delete a comment.
     */
    async confirmDeleteComment(panelElement, errorData, commentId, triggerButton) {
        if (confirm('Bạn có chắc muốn xóa comment này?') && this.onCommentDeleted) {
            this.setButtonLoading(triggerButton, true, { text: 'Đang xóa...' });
            try {
                await this.onCommentDeleted(errorData, commentId);
                await this.refreshThreadPanel(panelElement, errorData);
            } catch (error) {
                ErrorLogger.error('Failed to delete comment', error);
            } finally {
                this.setButtonLoading(triggerButton, false);
            }
        }
    }

    /**
     * Confirm and delete the entire error thread.
     */
    async confirmDeleteError(errorData, triggerButton) {
        if (confirm('Bạn có chắc muốn xóa lỗi này?')) {
            if (this.onErrorDeleted) {
                this.setButtonLoading(triggerButton, true, { text: 'Đang xóa...' });
                try {
                    await Promise.resolve(this.onErrorDeleted(errorData));
                    this.closeCommentThread();
                } catch (error) {
                    ErrorLogger.error('Failed to delete error', error);
                    this.setButtonLoading(triggerButton, false);
                }
            } else {
                this.closeCommentThread();
            }
        }
    }

    /**
     * Refresh thread panel content without closing panel.
     */
    async refreshThreadPanel(panelElement, errorData) {
        if (!this.currentThread || this.currentThread.error.id !== errorData.id) return;

        const userInfo = await this.getUserInfo();
        if (!userInfo) return;

        const commentsList = panelElement.querySelector('.comments-list');
        if (commentsList) commentsList.innerHTML = this.renderComments(errorData.comments, userInfo);

        const resolveButton = panelElement.querySelector('.btn-resolve');
        if (resolveButton) {
            const isResolved = errorData.status === ConfigurationManager.ERROR_STATUS.RESOLVED;
            resolveButton.textContent = isResolved ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết';
            resolveButton.className = `btn-resolve ${isResolved ? 'resolved' : ''}`;
        }

        const statusElement = panelElement.querySelector('.thread-status');
        if (statusElement) {
            statusElement.textContent = this.getStatusText(errorData.status);
            statusElement.className = `thread-status status-${errorData.status}`;
        }

        this.currentThread.error = errorData;
    }

    /**
     * Close thread panel and remove backdrop.
     */
    closeCommentThread() {
        if (!this.currentThread) return;
        this.currentThread.backdrop.remove();
        this.currentThread.panel.remove();
        this.currentThread = null;
    }

    /**
     * Get localized status label.
     */
    getStatusText(status) {
        return (
            {
                [ConfigurationManager.ERROR_STATUS.OPEN]: 'Mở',
                [ConfigurationManager.ERROR_STATUS.RESOLVED]: 'Đã giải quyết',
                [ConfigurationManager.ERROR_STATUS.CLOSED]: 'Đã đóng',
            }[status] || 'Mở'
        );
    }

    /**
     * Format relative time label for comments.
     */
    formatTime(timestamp) {
        const elapsedMs = Date.now() - timestamp;
        return elapsedMs < 60000
            ? 'Vừa xong'
            : elapsedMs < 3600000
              ? `${Math.floor(elapsedMs / 60000)} phút trước`
              : elapsedMs < 86400000
                ? `${Math.floor(elapsedMs / 3600000)} giờ trước`
                : `${Math.floor(elapsedMs / 86400000)} ngày trước`;
    }

    /**
     * Expose current thread state.
     */
    getCurrentThread() {
        return this.currentThread;
    }
}
