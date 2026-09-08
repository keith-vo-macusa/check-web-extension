import { ErrorLogger } from '../utils/ErrorLogger.js';
import { ValidationService } from '../utils/ValidationService.js';
import { BugListService } from './BugListService.js';

/**
 * Searchable multi-select for bug list options, rendered as a tag input:
 * chosen options sit as chips inside the control, typing filters a dropdown.
 *
 * Mount it into any container; it owns its own DOM and cleans up on destroy().
 */
export class BugListPicker {
    /**
     * @param {object} options
     * @param {Array<number|string>} options.selectedIds Ids selected up front.
     * @param {Function} options.onChange Called with the id array after every change.
     * @param {string} options.label Field label above the control.
     */
    constructor({ selectedIds = [], onChange = null, label = 'Loại lỗi' } = {}) {
        this.selectedIds = BugListService.sanitizeIds(selectedIds);
        this.onChange = onChange;
        this.label = label;

        this.allOptions = [];
        this.visibleOptions = [];
        this.isOptionsLoaded = false;
        this.highlightedIndex = -1;
        this.isDropdownOpen = false;
        this.isDestroyed = false;
        this.rootElement = null;
    }

    getSelectedIds() {
        return [...this.selectedIds];
    }

    /**
     * Build the DOM, then load options in the background.
     */
    async mount(containerElement) {
        if (!containerElement) return;

        this.rootElement = document.createElement('div');
        this.rootElement.className = 'bug-list-picker';
        this.rootElement.innerHTML = `
            <div class="bug-list-picker-head">
                <span class="bug-list-picker-label">${ValidationService.sanitizeHtml(this.label)}</span>
                <span class="bug-list-picker-count"></span>
            </div>
            <div class="bug-list-picker-control">
                <div class="bug-list-chips"></div>
                <input type="text" class="bug-list-search" autocomplete="off" spellcheck="false"
                       placeholder="Tìm và chọn loại lỗi..." aria-label="Tìm loại lỗi" />
            </div>
            <div class="bug-list-dropdown is-hidden"></div>
            <div class="bug-list-picker-status is-hidden"></div>
        `;
        containerElement.appendChild(this.rootElement);

        this.chipsElement = this.rootElement.querySelector('.bug-list-chips');
        this.searchInput = this.rootElement.querySelector('.bug-list-search');
        this.dropdownElement = this.rootElement.querySelector('.bug-list-dropdown');
        this.statusElement = this.rootElement.querySelector('.bug-list-picker-status');
        this.countElement = this.rootElement.querySelector('.bug-list-picker-count');

        this.bindEvents();
        this.renderChips();
        await this.loadOptions();
    }

    async loadOptions({ forceReload = false } = {}) {
        this.setStatus('loading', 'Đang tải danh sách loại lỗi...');
        try {
            const options = await BugListService.loadOptions({ forceReload });
            if (this.isDestroyed) return;

            this.allOptions = options;
            this.isOptionsLoaded = true;
            this.setStatus(null);
            this.renderChips();
            this.renderDropdown();
        } catch {
            if (this.isDestroyed) return;
            this.setStatus('error', 'Không tải được danh sách loại lỗi.', 'Thử lại', () =>
                this.loadOptions({ forceReload: true }),
            );
        }
    }

    bindEvents() {
        // Giữ focus ở input khi bấm vào vùng trống của control hoặc vào dropdown,
        // nếu không blur sẽ đóng dropdown trước khi click kịp chạy.
        this.rootElement
            .querySelector('.bug-list-picker-control')
            .addEventListener('mousedown', (event) => {
                if (event.target === this.searchInput) return;
                event.preventDefault();
                this.searchInput.focus();
                this.openDropdown();
            });

        this.dropdownElement.addEventListener('mousedown', (event) => event.preventDefault());

        this.dropdownElement.addEventListener('click', (event) => {
            const optionButton = event.target.closest('.bug-list-option');
            if (!optionButton) return;
            this.toggleOption(optionButton.dataset.optionId);
            this.searchInput.value = '';
            this.renderDropdown();
            this.searchInput.focus();
        });

        this.chipsElement.addEventListener('click', (event) => {
            const removeButton = event.target.closest('.bug-list-chip-remove');
            if (!removeButton) return;
            event.stopPropagation();
            this.toggleOption(removeButton.dataset.optionId);
            this.renderDropdown();
        });

        this.searchInput.addEventListener('focus', () => this.openDropdown());
        this.searchInput.addEventListener('blur', () => this.closeDropdown());
        this.searchInput.addEventListener('input', () => {
            this.highlightedIndex = 0;
            this.openDropdown();
            this.renderDropdown();
        });
        this.searchInput.addEventListener('keydown', (event) => this.handleKeydown(event));
    }

    handleKeydown(event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!this.isDropdownOpen) this.openDropdown();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const total = this.visibleOptions.length;
            if (total === 0) return;
            this.highlightedIndex = (this.highlightedIndex + step + total) % total;
            this.renderDropdown();
            return;
        }

        if (event.key === 'Enter') {
            const highlighted = this.visibleOptions[this.highlightedIndex];
            if (!this.isDropdownOpen || !highlighted) return;
            // Chỉ nuốt Enter khi thật sự đang chọn option, để Enter trong ô
            // bình luận vẫn gửi được như cũ.
            event.preventDefault();
            event.stopPropagation();
            this.toggleOption(highlighted.id);
            this.searchInput.value = '';
            this.renderDropdown();
            return;
        }

        if (event.key === 'Escape' && this.isDropdownOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.closeDropdown();
            return;
        }

        if (
            event.key === 'Backspace' &&
            this.searchInput.value === '' &&
            this.selectedIds.length > 0
        ) {
            event.preventDefault();
            this.toggleOption(this.selectedIds[this.selectedIds.length - 1]);
            this.renderDropdown();
        }
    }

    toggleOption(optionId) {
        const numericId = Number(optionId);
        if (!Number.isInteger(numericId)) return;

        this.selectedIds = this.selectedIds.includes(numericId)
            ? this.selectedIds.filter((id) => id !== numericId)
            : [...this.selectedIds, numericId];

        this.renderChips();
        if (this.onChange) {
            try {
                this.onChange(this.getSelectedIds());
            } catch (error) {
                ErrorLogger.error('Bug list picker onChange failed', { error });
            }
        }
    }

    renderChips() {
        const selectedOptions = BugListService.resolveSelected(this.allOptions, this.selectedIds);

        this.countElement.textContent = this.selectedIds.length
            ? `${this.selectedIds.length} đã chọn`
            : 'Không bắt buộc';

        this.chipsElement.innerHTML = selectedOptions
            .map((option) => {
                const safeName = ValidationService.sanitizeHtml(option.name);
                // Trước khi options về, mọi id đều "chưa biết tên" — đừng tô đỏ vội.
                const unknownClass = option.isUnknown && this.isOptionsLoaded ? ' is-unknown' : '';
                return `
                    <span class="bug-list-chip${unknownClass}" title="${safeName}">
                        <span class="bug-list-chip-name">${safeName}</span>
                        <button type="button" class="bug-list-chip-remove" data-option-id="${option.id}"
                                aria-label="Bỏ chọn ${safeName}">&times;</button>
                    </span>
                `;
            })
            .join('');
    }

    renderDropdown() {
        if (!this.isDropdownOpen) return;

        this.visibleOptions = BugListService.filterOptions(this.allOptions, this.searchInput.value);
        if (this.highlightedIndex >= this.visibleOptions.length) this.highlightedIndex = 0;

        if (this.visibleOptions.length === 0) {
            const message =
                this.allOptions.length === 0
                    ? 'Chưa có loại lỗi nào đang hoạt động'
                    : 'Không tìm thấy loại lỗi phù hợp';
            this.dropdownElement.innerHTML = `<div class="bug-list-empty">${message}</div>`;
            return;
        }

        this.dropdownElement.innerHTML = this.visibleOptions
            .map((option, index) => {
                const isSelected = this.selectedIds.includes(Number(option.id));
                const classNames = [
                    'bug-list-option',
                    isSelected ? 'is-selected' : '',
                    index === this.highlightedIndex ? 'is-highlighted' : '',
                ]
                    .filter(Boolean)
                    .join(' ');
                const safeName = ValidationService.sanitizeHtml(option.name);
                const safeDescription = ValidationService.sanitizeHtml(option.description);
                const descriptionMarkup = safeDescription
                    ? `<span class="bug-list-option-desc">${safeDescription}</span>`
                    : '';

                return `
                    <button type="button" class="${classNames}" data-option-id="${option.id}"
                            role="option" aria-selected="${isSelected}">
                        <span class="bug-list-option-check" aria-hidden="true"></span>
                        <span class="bug-list-option-body">
                            <span class="bug-list-option-name">${safeName}</span>
                            ${descriptionMarkup}
                        </span>
                    </button>
                `;
            })
            .join('');

        const highlightedElement = this.dropdownElement.querySelector('.is-highlighted');
        if (highlightedElement) highlightedElement.scrollIntoView({ block: 'nearest' });
    }

    openDropdown() {
        if (this.isDropdownOpen) return;
        this.isDropdownOpen = true;
        this.dropdownElement.classList.remove('is-hidden');
        if (this.highlightedIndex < 0) this.highlightedIndex = 0;
        this.renderDropdown();
    }

    closeDropdown() {
        if (!this.isDropdownOpen) return;
        this.isDropdownOpen = false;
        this.dropdownElement.classList.add('is-hidden');
    }

    /**
     * Show a loading/error line under the control. Pass null to clear it.
     */
    setStatus(type, message, actionLabel = null, onAction = null) {
        if (!this.statusElement) return;

        if (!type) {
            this.statusElement.className = 'bug-list-picker-status is-hidden';
            this.statusElement.innerHTML = '';
            return;
        }

        this.statusElement.className = `bug-list-picker-status is-${type}`;
        const safeMessage = ValidationService.sanitizeHtml(message);
        const actionMarkup = actionLabel
            ? `<button type="button" class="bug-list-retry">${ValidationService.sanitizeHtml(actionLabel)}</button>`
            : '';
        this.statusElement.innerHTML = `<span>${safeMessage}</span>${actionMarkup}`;

        const retryButton = this.statusElement.querySelector('.bug-list-retry');
        if (retryButton && onAction) {
            retryButton.addEventListener('mousedown', (event) => event.preventDefault());
            retryButton.addEventListener('click', onAction);
        }
    }

    destroy() {
        this.isDestroyed = true;
        if (this.rootElement) this.rootElement.remove();
        this.rootElement = null;
    }
}
