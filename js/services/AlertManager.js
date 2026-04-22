export default class AlertManager {
    /**
     * Show success toast-style alert.
     */
    static success(title = 'Thành công', text = '', timerMs = 1000) {
        return window.Swal.fire({
            icon: 'success',
            title,
            text,
            timer: timerMs,
            showConfirmButton: false,
            timerProgressBar: true,
            showClass: { popup: '' },
            hideClass: { popup: '' },
        });
    }

    /**
     * Show error alert.
     */
    static error(title = 'Lỗi', text = '') {
        return window.Swal.fire({
            icon: 'error',
            title,
            text,
            confirmButtonText: 'OK',
            showClass: { popup: '' },
            hideClass: { popup: '' },
        });
    }

    /**
     * Show confirm dialog with confirm/cancel options.
     */
    static confirm(
        title = 'Xác nhận',
        text = '',
        confirmButtonText = 'Đồng ý',
        cancelButtonText = 'Hủy',
    ) {
        return window.Swal.fire({
            icon: 'question',
            title,
            text,
            showCancelButton: true,
            confirmButtonText,
            cancelButtonText,
            reverseButtons: true,
            showClass: { popup: '' },
            hideClass: { popup: '' },
        });
    }

    /**
     * Show informational alert.
     */
    static info(title = 'Thông báo', text = '') {
        return window.Swal.fire({
            icon: 'info',
            title,
            text,
            confirmButtonText: 'OK',
            showClass: { popup: '' },
            hideClass: { popup: '' },
        });
    }

    /**
     * Show loading modal with spinner.
     */
    static loading(title = 'Đang xử lý...') {
        window.Swal.fire({
            title,
            allowOutsideClick: false,
            showClass: { popup: '' },
            hideClass: { popup: '' },
            didOpen: () => {
                window.Swal.showLoading();
            },
        });
    }

    /**
     * Show blocking error modal without close controls.
     */
    static errorWithOutClose(title = 'Lỗi', text = '') {
        return window.Swal.fire({
            icon: 'error',
            title,
            text,
            showConfirmButton: false,
            showCancelButton: false,
            allowOutsideClick: false,
            showClass: { popup: '' },
            hideClass: { popup: '' },
        });
    }

    /**
     * Close active alert.
     */
    static close() {
        window.Swal.close();
    }
}
