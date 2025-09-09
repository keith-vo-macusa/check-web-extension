let errors = [];
let unAuthorizedDomains = [];
import { API_ACTION } from '../constants/common.js';

export async function handleBadgeAndErrors(message, sender, sendResponse) {
    const { action, domainName } = message;

    if (!domainName) return;

    switch (action) {
        case 'setErrors':
            await setErrors(domainName, message.errors);
            await updateBadgeIfActive(domainName);
            break;
        case 'getErrors':
            const result = await getErrors(domainName) || { path: [] };
            sendResponse(result);
            break;
        case 'setUnauthorized':
            setUnAuthorizedDomain(domainName);
            break;
        case 'checkAuthorized':
            sendResponse(isAuthorized(domainName));
            break;
        case 'removeUnauthorized':
            await removeUnAuthorizedDomains(domainName);
            sendResponse(true);
            break;
        case 'domIsReady':
            const errorsForDomain = await getErrors(domainName);
            chrome.tabs.sendMessage(sender.tab.id, { action: 'setErrorsInContent' });
            break;
        default:
            // Optionally handle unknown actions
            break;
    }
}

function countOpenErrors(domainData) {
    if (!domainData?.path) return 0;
    return domainData.path.reduce((total, path) => {
        return total + (path.data?.filter((e) => e.status === 'open')?.length || 0);
    }, 0);
}

async function updateBadgeIfActive(domainToUpdate) {

    chrome.action.setBadgeText({ text: '' });

    // user chưa đăng nhập
    const {userInfo} = await isLoggedIn();

    if(!userInfo.email){
        return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.url) return;

        try {
            const activeDomain = new URL(activeTab.url).hostname;
            if (activeDomain !== domainToUpdate) return;

            const count = countOpenErrors(errors[domainToUpdate]);
            chrome.action.setBadgeText({
                tabId: activeTab.id,
                text: count > 0 ? count.toString() : '',
            });
        } catch (e) {
            console.error('❌ Không thể lấy domain từ URL:', e);
        }
    });
}

async function isLoggedIn(){
    const userInfo = await chrome.storage.local.get('userInfo');
    if(!userInfo){
        return null;
    }
    return userInfo;
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        const tab = await chrome.tabs.get(tabId);
        const domain = new URL(tab.url).hostname;
        updateBadgeIfActive(domain);
    } catch (e) {
        console.error('❌ Không thể lấy domain từ tab:', e);
        chrome.action.setBadgeText({ text: '', tabId });
    }
});

// xử lý call api khi tab mới được mở hoặc reload
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        const domain = new URL(tab.url).hostname;
        setUnAuthorizedDomain(domain);

        // user chưa đăng nhập
        const {userInfo} = await isLoggedIn();

        if(!userInfo.email){
            return;
        }

        await fetchDataFromAPI(domain, tabId);

    }
});

const fetchDataFromAPI = async (domain, tabId) => {
    const endpoint = `${API_ACTION.GET_DOMAIN_DATA}?domain=${domain}`;

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Kiểm tra mã HTTP (status)
        if (!response.ok) {
            if (response.status >= 400 && response.status < 500) {
                console.error(`Client Error (${response.status})`);
            } else if (response.status >= 500) {
                console.error(`Server Error (${response.status})`);
            }

            const errorData = await response.json().catch(() => null);
            console.error('ℹResponse body:', errorData);

            return;
        }

        // Nếu response OK (status 2xx)
        const result = await response.json();

        await setErrors(domain, result.data);

        updateBadgeIfActive(domain);

        removeUnAuthorizedDomains(domain);


        chrome.tabs.sendMessage(tabId, {
            action: 'setErrorsInContent',
        });

        console.log('setErrorsInContent', tabId);
    } catch (err) {
        // lỗi mạng hoặc CORS
        console.error('Fetch failed:', err);
    }
};

const removeUnAuthorizedDomains = async (domain) => {
    unAuthorizedDomains = unAuthorizedDomains.filter((d) => d !== domain);
};

const setErrors = async (domain, tempErrors) => {
    console.log(JSON.stringify(tempErrors));
    errors[domain] = tempErrors;
};

const getErrors = (domain) => {
    return errors[domain] || { path: [] };
};

const setUnAuthorizedDomain = (domain) => {
    unAuthorizedDomains = [...unAuthorizedDomains, domain];
};

const isAuthorized = (domain) => {
    return !unAuthorizedDomains.includes(domain);
};
