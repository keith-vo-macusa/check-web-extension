// Constants
const BREAKPOINTS = {
    ALL: 'all',
    DESKTOP: 'desktop',
    TABLET: 'tablet',
    MOBILE: 'mobile',
};

const typeNotification = {
    BUG_FOUND: 'bug_found',
    BUG_FIXED: 'bug_fixed',
};

const messages = {
    [typeNotification.BUG_FOUND]: 'Bạn có chắc muốn gửi thông báo lỗi không?',
    [typeNotification.BUG_FIXED]: 'Bạn có chắc muốn gửi thông báo đã sửa tất cả lỗi không?',
    'remove_error': 'Bạn có chắc muốn xóa lỗi này không??',
    'remove_all_errors': 'Bạn có chắc muốn xóa tất cả lỗi không???',
    'change_status_error': 'Bạn có chắc muốn thay đổi trạng thái của lỗi này không?',
    'loading': 'Đang xử lý...',
};

const API_ENDPOINT = 'https://checkwise.macusaone.com/';
const API_ACTION = {
    SEND_NOTIFICATION_TELEGRAM: API_ENDPOINT + 'api_domain_data.php?action=send_telegram',
    GET_DOMAIN_DATA: API_ENDPOINT + 'api_domain_data.php?action=get_domain_data',
    SET_DOMAIN_DATA: API_ENDPOINT + 'api_domain_data.php?action=set',
};

const ACTION_MESSAGE = {
    ACTIVATE: 'activate',
    DEACTIVATE: 'deactivate',
    GET_STATE: 'getState',
    SHOW_ALL_ERRORS: 'showAllErrors',
    HIDE_ALL_ERRORS: 'hideAllErrors',
    HIGHLIGHT_ERROR: 'highlightError',
    CLEAR_ALL_ERRORS: 'clearAllErrors',
    REMOVE_ERROR: 'removeError',
    CHECK_FIXED: 'checkFixed',
    DRAW_OPEN_ERRORS: 'drawOpenErrors',
    DRAW_RESOLVED_ERRORS: 'drawResolvedErrors',
};

const ADMIN_EMAIL = 'hana.web@macusaone.com';


export { 
    BREAKPOINTS,
    typeNotification,
    messages,
    API_ACTION,
    ACTION_MESSAGE,
    ADMIN_EMAIL,
};