import TabManager from './TabManager.js';
import { messages } from '../constants/index.js';
import AlertManager from './AlertManager.js';
import AuthManager from '../auth.js';
import { ConfigurationManager } from '../config/ConfigurationManager.js';

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
            AlertManager.loading(messages.loading);

            const accessToken = await AuthManager.getAccessToken();
            const headers = { 'Content-Type': 'application/json' };
            if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

            const response = await fetch(ConfigurationManager.getApiUrl('SEND_NOTIFICATION'), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });
            const responseData = await response.json();

            if (response.ok) {
                AlertManager.success('Thông báo', responseData.message);
            } else {
                AlertManager.error('Thông báo', responseData.message || 'Có lỗi xảy ra');
            }
        } catch (error) {
            console.error(error);
            AlertManager.error('Thông báo', 'Có lỗi xảy ra khi gửi thông báo');
        } finally {
            sendNotificationButton.prop('disabled', false);
        }
    }
}
