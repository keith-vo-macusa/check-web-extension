import { ErrorLogger } from '../../shared/ErrorLogger.js';

/**
 * Confirmation dialog for destructive actions in the comment thread.
 *
 * The thread used to call window.confirm, which renders as a bare browser dialog
 * on top of the page — visually unrelated to the extension, and inconsistent with
 * the SweetAlert prompts the popup already uses. SweetAlert2 is injected into
 * every page by the content script manifest entry, so it is available here too.
 *
 * Falls back to window.confirm if the library is missing, so a page that blocks
 * it cannot make deletion silently impossible.
 */
export async function confirmDestructive({ title, text, confirmLabel = 'Xóa' }) {
    const swal = typeof Swal !== 'undefined' ? Swal : null;
    if (!swal) {
        ErrorLogger.debug('SweetAlert unavailable, falling back to window.confirm');
        return window.confirm(`${title}\n\n${text}`);
    }

    const result = await swal.fire({
        title,
        text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: confirmLabel,
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        reverseButtons: true,
        // The thread panel sits at 2147483647; without this the dialog opens behind it.
        didOpen: (element) => {
            const container = element.closest('.swal2-container');
            if (container) container.style.zIndex = '2147483647';
        },
    });
    return result.isConfirmed === true;
}
