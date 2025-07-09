let errors = [];
let unAuthorizedDomains = [];

export function handleBadgeAndErrors(message, sender, sendResponse) {
  const { action, domainName } = message;

  if (!domainName) return;

  if (action === 'setErrors') {
    errors[domainName] = message.errors;
    updateBadgeIfActive(domainName);
  } else if (action === 'getErrors') {
    const result = errors[domainName] || { path: [] };
    sendResponse(result);
  } else if (action === 'setUnauthorized') {
    unAuthorizedDomains = [...unAuthorizedDomains, domainName];
  } else if (action === 'checkAuthorized') {
    sendResponse(!unAuthorizedDomains.includes(domainName));
  } else if (action === 'removeUnauthorized') {
    unAuthorizedDomains = unAuthorizedDomains.filter((domain) => domain !== domainName);
    sendResponse(true);
  }
}

function countOpenErrors(domainData) {
  if (!domainData?.path) return 0;
  return domainData.path.reduce((total, path) => {
    return total + (path.data?.filter((e) => e.status === 'open')?.length || 0);
  }, 0);
}

function updateBadgeIfActive(domainToUpdate) {
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