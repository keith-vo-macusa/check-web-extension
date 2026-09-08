import TabManager from './TabManager.js';
import AuthManager from '../shared/auth.js';
import AlertManager from './AlertManager.js';
import NotificationManager from './NotificationManager.js';
import { ConfigurationManager } from '../shared/config/ConfigurationManager.js';
import { PopupState } from './PopupState.js';
import { UIManager } from './PopupController.js';
import { html } from '../shared/ui/html.js';

/**
 * Popup entry point: check authentication, build state and controller, register
 * the global listeners. Everything else lives in the modules it imports.
 */
$(document).ready(async function () {
    let uiManager = null;

    if (!chrome || !chrome.tabs)
        return void $('#errorsList').html(
            '<div class="no-errors">❌ Extension chỉ hỗ trợ Chrome/Edge</div>',
        );

    chrome.runtime.onMessage.addListener((message) => {
        // A background event, not a user action, so update without the skeleton.
        if (message.action === 'errorAdded' && uiManager)
            uiManager.refreshErrorsList({ showSkeleton: false });
    });

    const domainName = await TabManager.getCurrentTabDomain();
    const isAuthorized = await TabManager.sendMessageToBackground({
        action: 'checkAuthorized',
        domainName,
    });

    if (!isAuthorized)
        return void AlertManager.errorWithOutClose(
            'Lỗi',
            `${domainName} chưa được khởi tạo trên Checkwise`,
        );

    const sendNotification = async (userInfo, notificationType) => {
        AlertManager.confirm(
            'Gửi thông báo',
            ConfigurationManager.MESSAGES[notificationType] ||
                'Bạn có chắc muốn gửi thông báo không?',
            'Gửi',
            'Hủy',
        ).then(async (result) => {
            if (result.isConfirmed) {
                await NotificationManager.sendMarkErrorsResolevedOrNewErrors(
                    userInfo,
                    notificationType,
                );
            }
        });
    };

    try {
        if (!(await AuthManager.isAuthenticated()))
            return void (window.location.href = 'login.html');

        const userInfo = await AuthManager.getUserInfo();
        if (userInfo) {
            $('.header').append(
                String(html`
                    <div class="user-info">
                        <span class="user-id">ID: ${userInfo.id}</span>
                        <span class="user-name">Tên: ${userInfo.name}</span>
                        <button
                            id="logoutBtn"
                            class="logout-btn"
                            title="Đăng xuất"
                            aria-label="Đăng xuất"
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                            >
                                <path
                                    d="M12 2v10"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                />
                                <path
                                    d="M6 5a8 8 0 1 0 12 0"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                />
                            </svg>
                            <span class="visually-hidden">Đăng xuất</span>
                        </button>
                    </div>
                `),
            );

            $('#logoutBtn').click(async () => {
                AlertManager.confirm(
                    'Đăng xuất',
                    'Bạn có chắc muốn đăng xuất không?',
                    'Đăng xuất',
                    'Hủy',
                ).then(async (result) => {
                    if (result.isConfirmed)
                        try {
                            await chrome.storage.local.remove(['feedback']);
                            const didLogout = await AuthManager.logout();
                            await TabManager.sendMessage({
                                action: ConfigurationManager.ACTIONS.DEACTIVATE,
                                reason: 'logout',
                            });
                            await TabManager.sendMessage({
                                action: ConfigurationManager.ACTIONS.HIDE_ALL_ERRORS,
                            });
                            await TabManager.reloadCurrentTab();
                            window.close();
                            if (didLogout) window.location.href = 'login.html';
                        } catch (error) {
                            console.error('Error during logout:', error);
                        }
                });
            });

            const toggleModeSection = $('#toggleModeSection');
            const permName = (p) => (typeof p === 'string' ? p : p?.name);
            const hasPermission = (name) =>
                (userInfo.permissions ?? []).some((p) => permName(p) === name) ||
                (userInfo.roles ?? []).some((role) =>
                    [...(role.permissions ?? []), ...(role.permissons ?? [])].some(
                        (p) => permName(p) === name,
                    ),
                );

            const hasQCErrorPermission = hasPermission(
                ConfigurationManager.PERMISSION.SITE_CHECK_QC_ERROR,
            );
            const hasMemberPermission = hasPermission(
                ConfigurationManager.PERMISSION.SITE_CHECK_FIXER,
            );

            if (hasQCErrorPermission) {
                toggleModeSection.show();
                $('#sendBugFoundNotification').show();
                $('#sendBugFoundNotification').click(() => {
                    sendNotification(userInfo, ConfigurationManager.NOTIFICATION_TYPES.BUG_FOUND);
                });
            } else {
                toggleModeSection.hide();
            }

            if (hasMemberPermission) {
                $('#sendBugFixedNotification').show();
                $('#sendBugFixedNotification').click(() => {
                    sendNotification(userInfo, ConfigurationManager.NOTIFICATION_TYPES.BUG_FIXED);
                });
            }
        }

        const popupState = new PopupState();
        uiManager = new UIManager(popupState);

        try {
            const contentState = await TabManager.sendMessage({
                action: ConfigurationManager.ACTIONS.GET_STATE,
            });
            if (contentState) {
                popupState.setActive(contentState.isActive);
                uiManager.updateUI();
            }
        } catch {
            console.log('Content script not available, using default state');
            popupState.setActive(false);
            uiManager.updateUI();
        }

        uiManager.refreshErrorsList();
    } catch (error) {
        console.error('Error during initialization:', error);
        window.location.href = 'login.html';
    }
});
