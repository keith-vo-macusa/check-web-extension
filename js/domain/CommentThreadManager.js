import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { ValidationService } from '../utils/ValidationService.js';
import { BugListPicker } from './BugListPicker.js';
import { BugListService } from './BugListService.js';
import { formatTime, getStatusText } from '../shared/format.js';

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
        onBugListUpdated,
    ) {
        this.getUserInfo = getUserInfo;
        this.onCommentAdded = onCommentAdded;
        this.onCommentEdited = onCommentEdited;
        this.onCommentDeleted = onCommentDeleted;
        this.onErrorResolved = onErrorResolved;
        this.onErrorDeleted = onErrorDeleted;
        this.onBugListUpdated = onBugListUpdated;
        this.currentThread = null;
        this.inputModalPicker = null;
        this.threadBugListPicker = null;
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
        modal.innerHTML = `
            <div class="testing-modal-header">
                <h3>Thêm bình luận</h3>
                <button class="testing-modal-close" data-action="cancel" aria-label="Đóng">×</button>
            </div>
            <div class="testing-modal-body">
                <div class="testing-modal-bug-list"></div>
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

        this.inputModalPicker = new BugListPicker({ label: 'Loại lỗi' });
        this.inputModalPicker.mount(modal.querySelector('.testing-modal-bug-list'));

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

            const bugListIds = this.inputModalPicker?.getSelectedIds() ?? [];
            cancelButton.disabled = true;
            this.setButtonLoading(saveButton, true);
            try {
                if (onSave) await Promise.resolve(onSave(commentText, bugListIds));
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
        if (this.inputModalPicker) {
            this.inputModalPicker.destroy();
            this.inputModalPicker = null;
        }
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
        const statusText = getStatusText(errorData.status);
        const statusClass = `status-${errorData.status}`;
        const avatarInitial = (userInfo?.name || 'You').charAt(0).toUpperCase();
        const isResolved = errorData.status === ConfigurationManager.ERROR_STATUS.RESOLVED;

        panelElement.innerHTML = `\n            <div class="thread-header">\n                <div class="thread-title">\n                    <div class="thread-heading">Bình luận</div>\n                    <div class="thread-status ${statusClass}">${statusText}</div>\n                </div>\n                <div class="thread-header-actions">\n                    <button class="btn-resolve ${isResolved ? 'resolved' : ''}" data-error-id="${errorData.id}">\n                        ${isResolved ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết'}\n                    </button>\n                    <button class="btn-delete" data-error-id="${errorData.id}" aria-label="Xóa">Xóa</button>\n                    <button class="thread-close" aria-label="Đóng">×</button>\n                </div>\n            </div>\n            <div class="thread-bug-list">\n                <div class="thread-bug-list-view">\n                    <span class="thread-bug-list-title">Loại lỗi</span>\n                    <div class="thread-bug-list-chips"></div>\n                    <button type="button" class="btn-edit-bug-list">Sửa</button>\n                </div>\n                <div class="thread-bug-list-edit is-hidden">\n                    <div class="thread-bug-list-picker"></div>\n                    <div class="thread-bug-list-actions">\n                        <button type="button" class="btn-bug-list-cancel">Hủy</button>\n                        <button type="button" class="btn-bug-list-save">Lưu loại lỗi</button>\n                    </div>\n                </div>\n            </div>\n            <div class="thread-content">\n                <div class="comments-list" id="comments-${errorData.id}">\n                    ${this.renderComments(errorData.comments, userInfo)}\n                </div>\n                <div class="thread-actions">\n                    <div class="reply-form">\n                        <div class="reply-composer">\n                            <div class="comment-avatar reply-avatar">\n                                <div class="avatar-circle">${avatarInitial}</div>\n                            </div>\n                            <div class="reply-box">\n                                <div class="reply-input-wrap">\n                                    <textarea placeholder="Viết bình luận..." class="reply-input"\n                                              maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}"></textarea>\n                                    <button class="btn-reply-send btn-inside-input btn-send-icon" style="border-radius: 50% !important;" aria-label="Gửi bình luận" title="Gửi">\n                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">\n                                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>\n                                        </svg>\n                                    </button>\n                                </div>\n                            </div>\n                        </div>\n                    </div>\n                </div>\n            </div>\n        `;

        this.bindThreadEvents(panelElement, errorData);
        this.renderBugListRow(panelElement, errorData);
    }

    /**
     * Fill the read-only bug list chips. Loads options first so ids render as names.
     */
    async renderBugListRow(panelElement, errorData) {
        const chipsElement = panelElement.querySelector('.thread-bug-list-chips');
        if (!chipsElement) return;

        const selectedIds = BugListService.sanitizeIds(errorData.bug_list_ids);
        if (selectedIds.length === 0) {
            chipsElement.innerHTML = '<span class="thread-bug-list-empty">Chưa gắn loại lỗi</span>';
            return;
        }

        if (BugListService.cachedOptions === null) {
            await BugListService.loadOptions().catch(() => null);
            if (!panelElement.isConnected) return;
        }

        chipsElement.innerHTML = BugListService.resolveSelected(
            BugListService.cachedOptions ?? [],
            selectedIds,
        )
            .map((option) => {
                const safeName = ValidationService.sanitizeHtml(option.name);
                return `<span class="thread-bug-list-chip" title="${safeName}">${safeName}</span>`;
            })
            .join('');
    }

    /**
     * Swap the bug list row into edit mode with a fresh picker.
     */
    async openBugListEditor(panelElement, errorData) {
        const viewElement = panelElement.querySelector('.thread-bug-list-view');
        const editElement = panelElement.querySelector('.thread-bug-list-edit');
        const pickerHost = panelElement.querySelector('.thread-bug-list-picker');
        if (!viewElement || !editElement || !pickerHost) return;

        this.destroyThreadBugListPicker();
        pickerHost.innerHTML = '';
        viewElement.classList.add('is-hidden');
        editElement.classList.remove('is-hidden');

        this.threadBugListPicker = new BugListPicker({
            label: 'Loại lỗi',
            selectedIds: BugListService.sanitizeIds(errorData.bug_list_ids),
        });
        await this.threadBugListPicker.mount(pickerHost);
    }

    closeBugListEditor(panelElement) {
        this.destroyThreadBugListPicker();
        panelElement.querySelector('.thread-bug-list-view')?.classList.remove('is-hidden');
        panelElement.querySelector('.thread-bug-list-edit')?.classList.add('is-hidden');
    }

    destroyThreadBugListPicker() {
        if (!this.threadBugListPicker) return;
        this.threadBugListPicker.destroy();
        this.threadBugListPicker = null;
    }

    /**
     * Render comments list as HTML string.
     */
    renderComments(comments, userInfo) {
        return comments
            .map((comment) => {
                const authorName = comment.author?.name || 'Unknown';
                const authorInitial = authorName.charAt(0).toUpperCase();
                const timeText = formatTime(comment.timestamp);
                const editedText = comment.edited
                    ? '<span class="comment-edited">(đã chỉnh sửa)</span>'
                    : '';
                const isOwnComment =
                    (comment.author?.id != null &&
                        userInfo?.id != null &&
                        String(comment.author.id) === String(userInfo.id)) ||
                    (comment.author?.email &&
                        userInfo?.email &&
                        comment.author.email.toLowerCase() === userInfo.email.toLowerCase());
                const replyAction = `
                    <button class="btn-reply-comment" data-comment-id="${comment.id}">Trả lời</button>
                `;
                const ownerActions = isOwnComment
                    ? `
                <button class="btn-edit-comment" data-comment-id="${comment.id}">Chỉnh sửa</button>
                <button class="btn-delete-comment" data-comment-id="${comment.id}">Xóa</button>
            `
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
        // Panel có thể được vẽ lại bằng dữ liệu mới từ server (refreshThreadPanel),
        // nên handler phải luôn đọc error object hiện tại thay vì object lúc bind.
        const getError = () => this.currentThread?.error ?? errorData;

        panelElement.querySelector('.thread-close').addEventListener('click', () => {
            this.closeCommentThread();
        });

        const replyInput = panelElement.querySelector('.reply-input');
        const sendReplyButton = panelElement.querySelector('.btn-reply-send');
        const addReply = async () => {
            const commentText = replyInput.value.trim();
            if (!ValidationService.validateComment(commentText).valid || !this.onCommentAdded)
                return;

            const currentError = getError();
            replyInput.disabled = true;
            this.setButtonLoading(sendReplyButton, true);
            try {
                await this.onCommentAdded(currentError, commentText);
                await this.refreshThreadPanel(panelElement, currentError);
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
                const currentError = getError();
                this.setButtonLoading(resolveButton, true, { text: 'Đang xử lý...' });
                try {
                    await this.onErrorResolved(currentError);
                } catch (error) {
                    ErrorLogger.error('Failed to resolve error', error);
                } finally {
                    this.setButtonLoading(resolveButton, false);
                }
                await this.refreshThreadPanel(panelElement, currentError);
            }
        });

        const deleteButton = panelElement.querySelector('.btn-delete');
        deleteButton.addEventListener('click', () => {
            this.confirmDeleteError(getError(), deleteButton);
        });

        panelElement.querySelector('.btn-edit-bug-list')?.addEventListener('click', () => {
            this.openBugListEditor(panelElement, getError());
        });

        panelElement.querySelector('.btn-bug-list-cancel')?.addEventListener('click', () => {
            this.closeBugListEditor(panelElement);
        });

        const saveBugListButton = panelElement.querySelector('.btn-bug-list-save');
        saveBugListButton?.addEventListener('click', async () => {
            if (!this.onBugListUpdated || !this.threadBugListPicker) return;

            const currentError = getError();
            const selectedIds = this.threadBugListPicker.getSelectedIds();
            this.setButtonLoading(saveBugListButton, true, { text: 'Đang lưu...' });
            try {
                await this.onBugListUpdated(currentError, selectedIds);
                this.closeBugListEditor(panelElement);
                await this.renderBugListRow(panelElement, currentError);
            } catch (error) {
                ErrorLogger.error('Failed to update bug list', error);
            } finally {
                this.setButtonLoading(saveBugListButton, false);
            }
        });

        panelElement.addEventListener('click', async (event) => {
            const currentError = getError();

            if (event.target.classList.contains('btn-reply-comment')) {
                const commentId = event.target.dataset.commentId;
                const targetComment = currentError.comments.find(
                    (comment) => String(comment.id) === String(commentId),
                );
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
                await this.editComment(panelElement, currentError, commentId);
            }

            if (event.target.classList.contains('btn-delete-comment')) {
                const commentId = event.target.dataset.commentId;
                await this.confirmDeleteComment(
                    panelElement,
                    currentError,
                    commentId,
                    event.target,
                );
            }
        });
    }

    /**
     * Switch comment into inline edit mode.
     */
    async editComment(panelElement, errorData, commentId) {
        const targetComment = errorData.comments.find(
            (comment) => String(comment.id) === String(commentId),
        );
        if (!targetComment) return;

        const commentItem = panelElement.querySelector(`[data-comment-id="${commentId}"]`);
        if (!commentItem) return;

        const commentText = commentItem.querySelector('.comment-text');
        const commentActions = commentItem.querySelector('.comment-actions');
        const originalText = targetComment.text;
        const editForm = document.createElement('div');
        editForm.className = 'edit-form';
        editForm.innerHTML = `
            <div class="edit-input-wrap">
                <textarea class="edit-input" maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}"></textarea>
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

        const editInput = editForm.querySelector('.edit-input');
        editInput.value = originalText;

        commentText.style.display = 'none';
        if (commentActions) commentActions.style.display = 'none';
        commentText.parentNode.appendChild(editForm);

        editInput.focus();
        editInput.setSelectionRange(editInput.value.length, editInput.value.length);

        const cancelEditButton = editForm.querySelector('.btn-edit-cancel');
        const saveEditButton = editForm.querySelector('.btn-edit-save');

        cancelEditButton.addEventListener('click', () => {
            this.cancelEdit(commentText, editForm, commentActions);
        });

        const performSave = async () => {
            const updatedText = editInput.value.trim();
            if (
                !ValidationService.validateComment(updatedText).valid ||
                updatedText === originalText
            ) {
                this.cancelEdit(commentText, editForm, commentActions);
                return;
            }

            if (!this.onCommentEdited) return;
            editInput.disabled = true;
            cancelEditButton.disabled = true;
            this.setButtonLoading(saveEditButton, true);
            try {
                await this.onCommentEdited(errorData, targetComment.id, updatedText);
                await this.refreshThreadPanel(panelElement, errorData);
            } catch (error) {
                ErrorLogger.error('Failed to edit comment', error);
                editInput.disabled = false;
                cancelEditButton.disabled = false;
                this.setButtonLoading(saveEditButton, false);
            }
        };

        saveEditButton.addEventListener('click', performSave);

        editInput.addEventListener('keydown', (event) => {
            if (
                (event.key === 'Enter' && !event.shiftKey) ||
                (event.key === 'Enter' && event.ctrlKey)
            ) {
                event.preventDefault();
                performSave();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                this.cancelEdit(commentText, editForm, commentActions);
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
     * Skeleton placeholder markup shown while comments are loading.
     */
    getCommentsSkeleton(itemCount = 3) {
        const items = Array.from({ length: itemCount }, (unusedValue, index) => {
            const extraLine =
                index % 2 === 0
                    ? '<div class="skeleton-block skeleton-line skeleton-line-short"></div>'
                    : '';
            return `
                <div class="comment-skeleton">
                    <div class="skeleton-block skeleton-avatar"></div>
                    <div class="skeleton-bubble">
                        <div class="skeleton-block skeleton-line skeleton-line-name"></div>
                        <div class="skeleton-block skeleton-line skeleton-line-text"></div>
                        ${extraLine}
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="comments-skeleton" role="status" aria-label="Đang tải bình luận">${items}</div>`;
    }

    /**
     * Swap the comments list for a skeleton while fresh data is being fetched.
     * Turning it off without an intervening refreshThreadPanel restores the cached comments.
     */
    setThreadSyncing(panelElement, isSyncing) {
        if (!panelElement) return;

        const commentsList = panelElement.querySelector('.comments-list');
        if (!commentsList) return;

        if (isSyncing) {
            if (commentsList.dataset.syncing === 'true') return;
            commentsList.dataset.syncing = 'true';
            panelElement.classList.add('is-syncing');
            commentsList.innerHTML = this.getCommentsSkeleton();
            return;
        }

        panelElement.classList.remove('is-syncing');
        if (commentsList.dataset.syncing !== 'true') return;

        // Skeleton vẫn còn nghĩa là refreshThreadPanel chưa chạy (fetch lỗi) —
        // vẽ lại từ dữ liệu cache đang có thay vì để trống.
        delete commentsList.dataset.syncing;
        if (!this.currentThread) return;
        commentsList.innerHTML = this.renderComments(
            this.currentThread.error.comments,
            this.currentThread.userInfo,
        );
    }

    /**
     * Refresh thread panel content without closing panel.
     */
    async refreshThreadPanel(panelElement, errorData) {
        if (!this.currentThread || this.currentThread.error.id !== errorData.id) return;

        const userInfo = await this.getUserInfo();
        if (!userInfo) return;

        const commentsList = panelElement.querySelector('.comments-list');
        if (commentsList) {
            commentsList.innerHTML = this.renderComments(errorData.comments, userInfo);
            delete commentsList.dataset.syncing;
            panelElement.classList.remove('is-syncing');
        }

        const resolveButton = panelElement.querySelector('.btn-resolve');
        if (resolveButton) {
            const isResolved = errorData.status === ConfigurationManager.ERROR_STATUS.RESOLVED;
            resolveButton.textContent = isResolved ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết';
            resolveButton.className = `btn-resolve ${isResolved ? 'resolved' : ''}`;
        }

        const statusElement = panelElement.querySelector('.thread-status');
        if (statusElement) {
            statusElement.textContent = getStatusText(errorData.status);
            statusElement.className = `thread-status status-${errorData.status}`;
        }

        this.currentThread.error = errorData;
        this.currentThread.userInfo = userInfo;

        // Chỉ vẽ lại chip khi không ở chế độ sửa, tránh nuốt lựa chọn đang dở.
        if (!this.threadBugListPicker) await this.renderBugListRow(panelElement, errorData);
    }

    /**
     * Close thread panel and remove backdrop.
     */
    closeCommentThread() {
        this.destroyThreadBugListPicker();
        if (!this.currentThread) return;
        this.currentThread.backdrop.remove();
        this.currentThread.panel.remove();
        this.currentThread = null;
    }

    /**
     * Expose current thread state.
     */
    getCurrentThread() {
        return this.currentThread;
    }
}
