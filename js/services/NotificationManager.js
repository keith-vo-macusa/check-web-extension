import TabManager from './TabManager.js';
import { API_ACTION, messages }  from '../constants/index.js';
import AlertManager from './AlertManager.js';

export default class NotificationManager {
    /**
     * Gửi thông báo về việc đánh dấu lỗi đã được giải quyết hoặc có lỗi mới
     * @param {Object} userInfo - Thông tin người dùng
     * @param {string} type - Loại thông báo
     */
    static async sendMarkErrorsResolevedOrNewErrors(userInfo, type) {
        // Lấy domain URL của tab hiện tại
        const domainUrl = await TabManager.getCurrentTabDomain();

        // Chuẩn bị dữ liệu để gửi
        const data = {
            domain_url: domainUrl,
            type: type,
            email: userInfo.email,
        };

        // Lấy button thông báo từ DOM
        const btnNotification = $('#sendNotification');

        // Gửi request AJAX
        await $.ajax({
            type: 'POST',
            url: API_ACTION.SEND_NOTIFICATION_TELEGRAM,
            data: data,
            dataType: 'json',
            beforeSend: function () {
                // Vô hiệu hóa button khi đang gửi request
                btnNotification.prop('disabled', true);
                AlertManager.loading(messages['loading']);
            },
            complete: function () {
                // Kích hoạt lại button sau khi hoàn thành
                btnNotification.prop('disabled', false);
            },
            success: function (response) {
                // Hiển thị thông báo thành công nếu request thành công
                AlertManager.success('Thông báo', response.message);
            },
            error: function (response) {
                // Hiển thị thông báo lỗi nếu request thất bại
                AlertManager.error('Thông báo', response.responseJSON.message);
            },
        });
    }
}
