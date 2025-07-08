export default class AlertManager {
    static success(title = 'Thành công', text = '', timer = 1000) {
        return window.Swal.fire({
            icon: 'success',
            title,
            text,
            timer,
            showConfirmButton: false,
            timerProgressBar: true,
            showClass: {
                popup: '', 
            },
            hideClass: {
                popup: '', 
            },
        });
    }

    static error(title = 'Lỗi', text = '') {
        return window.Swal.fire({
            icon: 'error',
            title,
            text,
            confirmButtonText: 'OK',
            showClass: {
                popup: '', 
            },
            hideClass: {
                popup: '', 
            },
        });
    }

    static confirm(
        title = 'Xác nhận',
        text = '',
        confirmText = 'Đồng ý',
        cancelText = 'Hủy',
        icon = 'question',
    ) {
        return window.Swal.fire({
            icon: 'question',
            title,
            text,
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: cancelText,
            reverseButtons: true,
            showClass: {
                popup: '', 
            },
            hideClass: {
                popup: '', 
            },
        });
    }

    static info(title = 'Thông báo', text = '') {
        return window.Swal.fire({
            icon: 'info',
            title,
            text,
            confirmButtonText: 'OK',
            showClass: {
                popup: '', 
            },
            hideClass: {
                popup: '', 
            },
        });
    }

    static loading(title = 'Đang xử lý...') {
        window.Swal.fire({
            title,
            allowOutsideClick: false,
            showClass: {
                popup: '', 
            },
            hideClass: {
                popup: '', 
            },
            didOpen: () => {
                window.Swal.showLoading();
            },
        });
    }

    static close() {
        window.Swal.close();
    }
}
