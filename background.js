import { checkForUpdates, setupUpdateCheck } from './js/services/UpdateChecker.js';
import { handleWindowMessage, handleWindowClose } from './js/services/WindowsManager.js';
import { handleBadgeAndErrors } from './js/services/BadgeManager.js';
import { DEFAULT_STORAGE, CURRENT_VERSION } from './js/constants/common.js';

/**
 * Create the offscreen document used to keep background capabilities available.
 */
async function createOffscreen() {
    await chrome.offscreen
        .createDocument({
            url: 'screens/offscreen.html',
            reasons: ['BLOBS'],
            justification: 'keep service worker running',
        })
        .catch(() => {});
}

/**
 * Handle extension installation/update lifecycle.
 */
chrome.runtime.onInstalled.addListener(() => {
    console.log(`Website Testing Assistant ${CURRENT_VERSION} installed/updated`);
    checkForUpdates();
    setupUpdateCheck();
});

/**
 * Route runtime messages to the appropriate background handlers.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'checkForUpdates') {
        checkForUpdates().then(() => {
            chrome.storage.local.get(['updateAvailable', 'latestVersion', 'updateUrl'], (storage) => {
                sendResponse({
                    updateAvailable: storage.updateAvailable || false,
                    currentVersion: CURRENT_VERSION,
                    latestVersion: storage.latestVersion || CURRENT_VERSION,
                    updateUrl: storage.updateUrl,
                });
            });
        });
        return true;
    }

    if (message.action === 'openOrResizeErrorWindow') {
        handleWindowMessage(message, sender, sendResponse);
        return true;
    }

    if (message.action === 'errorAdded') {
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

/**
 * Open release URL when user clicks update notification.
 */
chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== 'update-available') return;

    chrome.storage.local.get(['updateUrl'], (storage) => {
        if (storage.updateUrl) chrome.tabs.create({ url: storage.updateUrl });
    });
});

chrome.storage.local.set(DEFAULT_STORAGE);
chrome.windows.onRemoved.addListener(handleWindowClose);
chrome.runtime.onStartup.addListener(createOffscreen);
self.onmessage = () => {};
createOffscreen();
