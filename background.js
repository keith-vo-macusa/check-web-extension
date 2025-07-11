import { checkForUpdates, setupUpdateCheck } from './js/services/UpdateChecker.js';
import { handleWindowMessage, handleWindowClose } from './js/services/WindowsManager.js';
import { handleBadgeAndErrors } from './js/services/BadgeManager.js';
import { DEFAULT_STORAGE, CURRENT_VERSION } from './js/constants/common.js';


// Initialize storage
chrome.storage.local.set(DEFAULT_STORAGE);

// Setup listeners
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`Website Testing Assistant ${CURRENT_VERSION} installed/updated`);
  checkForUpdates();
  setupUpdateCheck();
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkForUpdates') {
    checkForUpdates().then(() => {
      chrome.storage.local.get(['updateAvailable', 'latestVersion', 'updateUrl'], (data) => {
        sendResponse({
          updateAvailable: data.updateAvailable || false,
          currentVersion: CURRENT_VERSION,
          latestVersion: data.latestVersion || CURRENT_VERSION,
          updateUrl: data.updateUrl,
        });
      });
      return true;
    });
  } else if (message.action === 'openOrResizeErrorWindow') {
    handleWindowMessage(message, sender, sendResponse);
    return true;
  } else if (message.action === 'errorAdded') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      });
    });
  } else {
    handleBadgeAndErrors(message, sender, sendResponse);
  }
  return true;
});

// Notification click handler
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'update-available') {
    chrome.storage.local.get(['updateUrl'], (data) => {
      if (data.updateUrl) {
        chrome.tabs.create({ url: data.updateUrl });
      }
    });
  }
});

// Window close handler
chrome.windows.onRemoved.addListener(handleWindowClose);

async function createOffscreen() {
  await chrome.offscreen.createDocument({
    url: 'screens/offscreen.html',
    reasons: ['BLOBS'],
    justification: 'keep service worker running',
  }).catch(() => {});
}
chrome.runtime.onStartup.addListener(createOffscreen);
self.onmessage = e => {}; // keepAlive
createOffscreen();