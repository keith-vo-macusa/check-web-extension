import { html, raw } from './html.js';

/**
 * Trạng thái loading cho nút bất đồng bộ, dùng chung giữa modal, panel comment
 * và hàng loại lỗi.
 *
 * Lưu lại innerHTML và trạng thái disabled ban đầu để khôi phục đúng nguyên
 * trạng — nút vốn có thể đang disabled sẵn vì lý do khác.
 */

const SPINNER = html`
    <svg class="btn-loading-spinner" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9"></circle>
    </svg>
`;

/** Nút chỉ có icon thì thay bằng spinner, nút có chữ thì đổi nhãn. */
const ICON_BUTTON_CLASSES = ['btn-send-icon', 'btn-inside-input', 'testing-modal-send'];

export function getSpinnerMarkup() {
    return raw(SPINNER);
}

export function setButtonLoading(button, isLoading, options) {
    if (!button) return;

    if (isLoading) {
        if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
        if (button.dataset.originalDisabled === undefined) {
            button.dataset.originalDisabled = String(!!button.disabled);
        }

        button.disabled = true;
        button.classList.add('is-loading');
        button.setAttribute('aria-busy', 'true');

        const isIconButton = ICON_BUTTON_CLASSES.some((className) =>
            button.classList.contains(className),
        );
        if (isIconButton) button.innerHTML = String(SPINNER);
        else button.textContent = options?.text || 'Đang xử lý...';
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
