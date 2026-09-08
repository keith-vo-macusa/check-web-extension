import TabManager from './TabManager.js';
import { ConfigurationManager } from '../shared/config/ConfigurationManager.js';
import AlertManager from './AlertManager.js';
import { ApiClient, ApiError } from '../shared/http/ApiClient.js';

export default class NotificationManager {
    /**
     * Send notification for newly found or resolved errors.
     */
    static async sendMarkErrorsResolevedOrNewErrors(userInfo, notificationType) {
        const payload = {
            domain_url: await TabManager.getCurrentTabDomain(),
            type: notificationType,
            email: userInfo.email,
        };
        const sendNotificationButton = $('#sendNotification');

        try {
            sendNotificationButton.prop('disabled', true);
            AlertManager.loading(ConfigurationManager.MESSAGES.loading);

            const responseData = await ApiClient.post(
                ConfigurationManager.API.ENDPOINTS.SEND_NOTIFICATION,
                payload,
            );
            AlertManager.success('Thông báo', responseData?.message);
        } catch (error) {
            console.error(error);
            const message =
                error instanceof ApiError
                    ? error.body?.message || 'Có lỗi xảy ra'
                    : 'Có lỗi xảy ra khi gửi thông báo';
            AlertManager.error('Thông báo', message);
        } finally {
            sendNotificationButton.prop('disabled', false);
        }
    }
}
