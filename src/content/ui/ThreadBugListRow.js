import { BugListService } from '../../shared/BugListService.js';
import { BugListPicker } from './BugListPicker.js';
import { html } from '../../shared/ui/html.js';

/**
 * Hàng "Loại lỗi" trong panel thread: chip chỉ đọc, bấm Sửa thì mở picker ngay
 * tại chỗ.
 *
 * Tự quản lý picker của mình, nên CommentThreadManager không còn phải giữ
 * threadBugListPicker và ba hàm vòng đời đi kèm.
 */
export class ThreadBugListRow {
    /**
     * @param {HTMLElement} panelElement Panel thread chứa hàng này.
     */
    constructor(panelElement) {
        this.panelElement = panelElement;
        this.picker = null;
    }

    get isEditing() {
        return this.picker !== null;
    }

    /** Vẽ chip chỉ đọc. Nạp options trước để id hiện ra thành tên. */
    async renderChips(errorData) {
        const chipsElement = this.panelElement.querySelector('.thread-bug-list-chips');
        if (!chipsElement) return;

        const selectedIds = BugListService.sanitizeIds(errorData.bug_list_ids);
        if (selectedIds.length === 0) {
            chipsElement.innerHTML = String(html`
                <span class="thread-bug-list-empty">Chưa gắn loại lỗi</span>
            `);
            return;
        }

        if (BugListService.cachedOptions === null) {
            await BugListService.loadOptions().catch(() => null);
            if (!this.panelElement.isConnected) return;
        }

        const options = BugListService.resolveSelected(
            BugListService.cachedOptions ?? [],
            selectedIds,
        );
        chipsElement.innerHTML = String(html`
            ${options.map(
                (option) => html`
                    <span class="thread-bug-list-chip" title="${option.name}">${option.name}</span>
                `,
            )}
        `);
    }

    async openEditor(errorData) {
        const viewElement = this.panelElement.querySelector('.thread-bug-list-view');
        const editElement = this.panelElement.querySelector('.thread-bug-list-edit');
        const pickerHost = this.panelElement.querySelector('.thread-bug-list-picker');
        if (!viewElement || !editElement || !pickerHost) return;

        this.destroyPicker();
        pickerHost.innerHTML = '';
        viewElement.classList.add('is-hidden');
        editElement.classList.remove('is-hidden');

        this.picker = new BugListPicker({
            label: 'Loại lỗi',
            selectedIds: BugListService.sanitizeIds(errorData.bug_list_ids),
        });
        await this.picker.mount(pickerHost);
    }

    closeEditor() {
        this.destroyPicker();
        this.panelElement.querySelector('.thread-bug-list-view')?.classList.remove('is-hidden');
        this.panelElement.querySelector('.thread-bug-list-edit')?.classList.add('is-hidden');
    }

    getSelectedIds() {
        return this.picker?.getSelectedIds() ?? [];
    }

    destroyPicker() {
        if (!this.picker) return;
        this.picker.destroy();
        this.picker = null;
    }
}
