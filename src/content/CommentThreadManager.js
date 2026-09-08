import { ConfigurationManager } from '../shared/config/ConfigurationManager.js';
import { ErrorLogger } from '../shared/ErrorLogger.js';
import { ValidationService } from '../shared/ValidationService.js';
import { getStatusText } from './format.js';
import { renderComments, renderCommentsSkeleton } from './ui/CommentList.js';
import { html } from '../shared/ui/html.js';
import { ThreadBugListRow } from './ui/ThreadBugListRow.js';
import { CommentInputModal } from './ui/CommentInputModal.js';
import { setButtonLoading } from './ui/buttonLoading.js';

export class CommentThreadManager {
    /**
     * @param {object} handlers
     * @param {Function} handlers.getUserInfo
     * @param {Function} handlers.resolveError Đổi một error object có thể đã cũ
     *   lấy bản đang sống trong ErrorStore. Nếu thiếu, panel sẽ dùng object bắt
     *   được lúc mở — chính là nguồn gốc bug "sửa/xoá comment không ăn".
     * @param {Function} handlers.onCommentAdded
     * @param {Function} handlers.onCommentEdited
     * @param {Function} handlers.onCommentDeleted
     * @param {Function} handlers.onErrorResolved
     * @param {Function} handlers.onErrorDeleted
     * @param {Function} handlers.onBugListUpdated
     */
    constructor({
        getUserInfo,
        resolveError = null,
        onCommentAdded,
        onCommentEdited,
        onCommentDeleted,
        onErrorResolved,
        onErrorDeleted,
        onBugListUpdated,
    } = {}) {
        this.getUserInfo = getUserInfo;
        this.resolveError = resolveError;
        this.onCommentAdded = onCommentAdded;
        this.onCommentEdited = onCommentEdited;
        this.onCommentDeleted = onCommentDeleted;
        this.onErrorResolved = onErrorResolved;
        this.onErrorDeleted = onErrorDeleted;
        this.onBugListUpdated = onBugListUpdated;
        this.currentThread = null;
        this.inputModal = new CommentInputModal();
        this.bugListRow = null;
    }

    /**
     * Modal thêm bình luận nay là component riêng; giữ hai hàm này làm mặt tiền
     * cho content.js khỏi phải biết cả hai đối tượng.
     */
    showCommentInputModal(isRect, onSave, onCancel) {
        this.inputModal.open({ isRect, onSave, onCancel });
    }

    closeCommentInputModal() {
        this.inputModal.close();
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

        panelElement.innerHTML = String(html`
            <div class="thread-header">
                <div class="thread-title">
                    <div class="thread-heading">Bình luận</div>
                    <div class="thread-status ${statusClass}">${statusText}</div>
                </div>
                <div class="thread-header-actions">
                    <button
                        class="btn-resolve ${isResolved ? 'resolved' : ''}"
                        data-error-id="${errorData.id}"
                    >
                        ${isResolved ? '✓ Đã giải quyết' : 'Đánh dấu đã giải quyết'}
                    </button>
                    <button class="btn-delete" data-error-id="${errorData.id}" aria-label="Xóa">
                        Xóa
                    </button>
                    <button class="thread-close" aria-label="Đóng">&times;</button>
                </div>
            </div>
            <div class="thread-bug-list">
                <div class="thread-bug-list-view">
                    <span class="thread-bug-list-title">Loại lỗi</span>
                    <div class="thread-bug-list-chips"></div>
                    <button type="button" class="btn-edit-bug-list">Sửa</button>
                </div>
                <div class="thread-bug-list-edit is-hidden">
                    <div class="thread-bug-list-picker"></div>
                    <div class="thread-bug-list-actions">
                        <button type="button" class="btn-bug-list-cancel">Hủy</button>
                        <button type="button" class="btn-bug-list-save">Lưu loại lỗi</button>
                    </div>
                </div>
            </div>
            <div class="thread-content">
                <div class="comments-list" id="comments-${errorData.id}">
                    ${renderComments(errorData.comments, userInfo)}
                </div>
                <div class="thread-actions">
                    <div class="reply-form">
                        <div class="reply-composer">
                            <div class="comment-avatar reply-avatar">
                                <div class="avatar-circle">${avatarInitial}</div>
                            </div>
                            <div class="reply-box">
                                <div class="reply-input-wrap">
                                    <textarea
                                        placeholder="Viết bình luận..."
                                        class="reply-input"
                                        maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}"
                                    ></textarea>
                                    <button
                                        class="btn-reply-send btn-inside-input btn-send-icon"
                                        style="border-radius: 50% !important;"
                                        aria-label="Gửi bình luận"
                                        title="Gửi"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                            focusable="false"
                                        >
                                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);

        this.bugListRow = new ThreadBugListRow(panelElement);
        this.bindThreadEvents(panelElement, errorData);
        this.bugListRow.renderChips(errorData);
    }

    /**
     * Bind all interactions inside thread panel.
     */
    bindThreadEvents(panelElement, errorData) {
        // Panel có thể được vẽ lại bằng dữ liệu mới từ server (refreshThreadPanel),
        // nên handler phải luôn đọc error object hiện tại thay vì object lúc bind.
        // Luôn đi qua store: object bắt được lúc bind có thể đã bị thay bằng bản
        // mới từ server, và khi đó id comment trong DOM không còn khớp object cũ.
        const getError = () => {
            const candidate = this.currentThread?.error ?? errorData;
            return this.resolveError?.(candidate) ?? candidate;
        };

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
            setButtonLoading(sendReplyButton, true);
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
                setButtonLoading(sendReplyButton, false);
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
                setButtonLoading(resolveButton, true, { text: 'Đang xử lý...' });
                try {
                    await this.onErrorResolved(currentError);
                } catch (error) {
                    ErrorLogger.error('Failed to resolve error', error);
                } finally {
                    setButtonLoading(resolveButton, false);
                }
                await this.refreshThreadPanel(panelElement, currentError);
            }
        });

        const deleteButton = panelElement.querySelector('.btn-delete');
        deleteButton.addEventListener('click', () => {
            this.confirmDeleteError(getError(), deleteButton);
        });

        panelElement.querySelector('.btn-edit-bug-list')?.addEventListener('click', () => {
            this.bugListRow.openEditor(getError());
        });

        panelElement.querySelector('.btn-bug-list-cancel')?.addEventListener('click', () => {
            this.bugListRow.closeEditor();
        });

        const saveBugListButton = panelElement.querySelector('.btn-bug-list-save');
        saveBugListButton?.addEventListener('click', async () => {
            if (!this.onBugListUpdated || !this.bugListRow?.isEditing) return;

            const currentError = getError();
            const selectedIds = this.bugListRow.getSelectedIds();
            setButtonLoading(saveBugListButton, true, { text: 'Đang lưu...' });
            try {
                await this.onBugListUpdated(currentError, selectedIds);
                this.bugListRow.closeEditor();
                await this.bugListRow.renderChips(currentError);
            } catch (error) {
                ErrorLogger.error('Failed to update bug list', error);
            } finally {
                setButtonLoading(saveBugListButton, false);
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
            setButtonLoading(saveEditButton, true);
            try {
                await this.onCommentEdited(errorData, targetComment.id, updatedText);
                await this.refreshThreadPanel(panelElement, errorData);
            } catch (error) {
                ErrorLogger.error('Failed to edit comment', error);
                editInput.disabled = false;
                cancelEditButton.disabled = false;
                setButtonLoading(saveEditButton, false);
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
            setButtonLoading(triggerButton, true, { text: 'Đang xóa...' });
            try {
                await this.onCommentDeleted(errorData, commentId);
                await this.refreshThreadPanel(panelElement, errorData);
            } catch (error) {
                ErrorLogger.error('Failed to delete comment', error);
            } finally {
                setButtonLoading(triggerButton, false);
            }
        }
    }

    /**
     * Confirm and delete the entire error thread.
     */
    async confirmDeleteError(errorData, triggerButton) {
        if (confirm('Bạn có chắc muốn xóa lỗi này?')) {
            if (this.onErrorDeleted) {
                setButtonLoading(triggerButton, true, { text: 'Đang xóa...' });
                try {
                    await Promise.resolve(this.onErrorDeleted(errorData));
                    this.closeCommentThread();
                } catch (error) {
                    ErrorLogger.error('Failed to delete error', error);
                    setButtonLoading(triggerButton, false);
                }
            } else {
                this.closeCommentThread();
            }
        }
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
            commentsList.innerHTML = renderCommentsSkeleton();
            return;
        }

        panelElement.classList.remove('is-syncing');
        if (commentsList.dataset.syncing !== 'true') return;

        // Skeleton vẫn còn nghĩa là refreshThreadPanel chưa chạy (fetch lỗi) —
        // vẽ lại từ dữ liệu cache đang có thay vì để trống.
        delete commentsList.dataset.syncing;
        if (!this.currentThread) return;
        commentsList.innerHTML = renderComments(
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
            commentsList.innerHTML = renderComments(errorData.comments, userInfo);
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
        if (!this.bugListRow?.isEditing) await this.bugListRow?.renderChips(errorData);
    }

    /**
     * Close thread panel and remove backdrop.
     */
    closeCommentThread() {
        this.bugListRow?.destroyPicker();
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
