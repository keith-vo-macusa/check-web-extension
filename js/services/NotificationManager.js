import TabManager from './TabManager.js';
import { messages } from '../constants/index.js';
import AlertManager from './AlertManager.js';
import AuthManager from '../auth.js';
import { ConfigurationManager } from '../config/ConfigurationManager.js';
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

        try {
            // Vô hiệu hóa button khi đang gửi request
            btnNotification.prop('disabled', true);
            AlertManager.loading(messages['loading']);

            // Get access token for authentication
            const accessToken = await AuthManager.getAccessToken();
            const headers = {
                'Content-Type': 'application/json',
            };

            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }

            // Gửi request bằng fetch API (sử dụng URL đầy đủ từ ConfigurationManager)
            const response = await fetch(ConfigurationManager.getApiUrl('SEND_NOTIFICATION'), {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok) {
                // Hiển thị thông báo thành công nếu request thành công
                AlertManager.success('Thông báo', result.message);
            } else {
                // Hiển thị thông báo lỗi nếu request thất bại
                AlertManager.error('Thông báo', result.message || 'Có lỗi xảy ra');
            }
        } catch (error) {
            // Hiển thị thông báo lỗi nếu có exception
            console.error(error);
            AlertManager.error('Thông báo', 'Có lỗi xảy ra khi gửi thông báo');
        } finally {
            // Kích hoạt lại button sau khi hoàn thành
            btnNotification.prop('disabled', false);
        }
    }
}
