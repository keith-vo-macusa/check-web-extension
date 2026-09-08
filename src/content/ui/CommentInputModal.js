import { ConfigurationManager } from '../../shared/config/ConfigurationManager.js';
import { ErrorLogger } from '../../shared/ErrorLogger.js';
import { ValidationService } from '../../shared/ValidationService.js';
import { BugListPicker } from './BugListPicker.js';
import { setButtonLoading } from './buttonLoading.js';
import { html } from '../../shared/ui/html.js';

/**
 * The "add comment" modal shown after the user picks an element or drags a region.
 *
 * Split out of CommentThreadManager: it has its own lifecycle (open, save, close)
 * and shares no state with the thread panel beyond both needing a BugListPicker.
 */
export class CommentInputModal {
    constructor() {
        this.backdrop = null;
        this.modal = null;
        this.picker = null;
    }

    get isOpen() {
        return this.modal !== null;
    }

    /**
     * @param {object} options
     * @param {boolean} options.isRect Dragged region rather than a picked element.
     * @param {Function} options.onSave Receives (commentText, bugListIds). If it
     *   throws, the modal stays open so the user can retry without losing what
     *   they typed.
     * @param {Function} options.onCancel
     */
    open({ isRect = false, onSave = null, onCancel = null } = {}) {
        this.close();

        this.backdrop = document.createElement('div');
        this.backdrop.className = ConfigurationManager.CSS_CLASSES.MODAL_BACKDROP;

        this.modal = document.createElement('div');
        this.modal.className = ConfigurationManager.CSS_CLASSES.COMMENT_MODAL;
        this.modal.innerHTML = String(html`
            <div class="testing-modal-header">
                <h3>Thêm bình luận</h3>
                <button class="testing-modal-close" data-action="cancel" aria-label="Đóng">
                    &times;
                </button>
            </div>
            <div class="testing-modal-body">
                <div class="testing-modal-bug-list"></div>
                <div class="testing-comment-input-wrap">
                    <textarea
                        placeholder="Mô tả lỗi hoặc ghi chú..."
                        maxlength="${ConfigurationManager.UI.COMMENT_MAX_LENGTH}"
                    ></textarea>
                    <button
                        class="testing-modal-send btn-inside-input btn-send-icon"
                        data-action="save"
                        aria-label="Lưu bình luận"
                        title="Lưu"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `);

        this.picker = new BugListPicker({ label: 'Loại lỗi' });
        this.picker.mount(this.modal.querySelector('.testing-modal-bug-list'));

        this.bindEvents({ onSave, onCancel });

        document.body.appendChild(this.backdrop);
        document.body.appendChild(this.modal);
        this.modal.querySelector('textarea').focus();
        ErrorLogger.debug('Comment input modal shown', { isRect });
    }

    bindEvents({ onSave, onCancel }) {
        const textarea = this.modal.querySelector('textarea');
        const cancelButton = this.modal.querySelector('[data-action="cancel"]');
        const saveButton = this.modal.querySelector('[data-action="save"]');

        const cancel = () => {
            this.close();
            if (onCancel) onCancel();
        };

        cancelButton.addEventListener('click', cancel);
        this.backdrop.addEventListener('click', (event) => {
            if (event.target === this.backdrop) cancel();
        });

        saveButton.addEventListener('click', async () => {
            const commentText = textarea.value.trim();
            if (!ValidationService.validateComment(commentText).valid) {
                textarea.focus();
                return;
            }

            const bugListIds = this.picker?.getSelectedIds() ?? [];
            cancelButton.disabled = true;
            setButtonLoading(saveButton, true);
            try {
                if (onSave) await Promise.resolve(onSave(commentText, bugListIds));
                this.close();
            } catch (error) {
                ErrorLogger.error('Failed to save comment', error);
                cancelButton.disabled = false;
                setButtonLoading(saveButton, false);
                textarea.focus();
            }
        });
    }

    close() {
        if (this.picker) {
            this.picker.destroy();
            this.picker = null;
        }
        this.backdrop?.remove();
        this.modal?.remove();
        this.backdrop = null;
        this.modal = null;
    }
}
