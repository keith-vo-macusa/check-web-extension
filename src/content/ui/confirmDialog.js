import { ConfigurationManager } from '../../shared/config/ConfigurationManager.js';
import { html } from '../../shared/ui/html.js';

/**
 * Confirmation dialog for destructive actions in the comment thread.
 *
 * Built here rather than with SweetAlert. SweetAlert renders into the host page,
 * so the page's own CSS cascades into it — on a themed site the title picked up
 * text-transform and a display font, and the buttons took the site's colours,
 * overriding confirmButtonColor. Every .testing-* rule in this extension is
 * declared !important for exactly that reason, and this dialog follows the same
 * convention, so it looks the same on every site.
 *
 * @returns {Promise<boolean>} true only when the user confirms.
 */
export function confirmDestructive({ title, text, confirmLabel = 'Xóa' }) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = ConfigurationManager.CSS_CLASSES.MODAL_BACKDROP;

        const dialog = document.createElement('div');
        dialog.className = 'testing-confirm';
        dialog.setAttribute('role', 'alertdialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.innerHTML = String(html`
            <div class="testing-confirm-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z"></path>
                    <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path>
                </svg>
            </div>
            <div class="testing-confirm-body">
                <div class="testing-confirm-title">${title}</div>
                <div class="testing-confirm-text">${text}</div>
            </div>
            <div class="testing-confirm-actions">
                <button type="button" class="testing-confirm-cancel">Hủy</button>
                <button type="button" class="testing-confirm-ok">${confirmLabel}</button>
            </div>
        `);

        let isSettled = false;
        const close = (didConfirm) => {
            if (isSettled) return;
            isSettled = true;
            document.removeEventListener('keydown', onKeydown, true);
            backdrop.remove();
            dialog.remove();
            resolve(didConfirm);
        };

        // Capture phase: the page may stop propagation on its own key handlers.
        const onKeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(false);
            }
        };

        backdrop.addEventListener('click', () => close(false));
        dialog
            .querySelector('.testing-confirm-cancel')
            .addEventListener('click', () => close(false));
        dialog.querySelector('.testing-confirm-ok').addEventListener('click', () => close(true));
        document.addEventListener('keydown', onKeydown, true);

        document.body.appendChild(backdrop);
        document.body.appendChild(dialog);
        // Focus cancel, not confirm: this dialog only ever guards a deletion.
        dialog.querySelector('.testing-confirm-cancel').focus();
    });
}
