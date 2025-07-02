// Background service worker for Website Testing Assistant

// Extension version from manifest
const CURRENT_VERSION = chrome.runtime.getManifest().version;
const VERSION_CHECK_URL = 'https://raw.githubusercontent.com/keith-vo-macusa/check-web-extension/main/manifest.json';
const CHECK_INTERVAL = 1; // 1 minutes

// Set default values
chrome.storage.local.set({updateAvailable: false, latestVersion: CURRENT_VERSION, updateUrl: 'https://github.com/keith-vo-macusa/check-web-extension/releases/latest'});
// Check for updates
async function checkForUpdates() {
    try {
        const response = await fetch(`${VERSION_CHECK_URL}?t=${Date.now()}`);
        if (!response.ok) throw new Error('Failed to fetch version');
        
        const data = await response.json();
        const latestVersion = data.version;
        
        const dataUpdated = {
            updateAvailable: isNewerVersion(latestVersion, CURRENT_VERSION),
            latestVersion: latestVersion,
            updateUrl: data.updateUrl || 'https://github.com/keith-vo-macusa/check-web-extension/releases/latest'
        }
        chrome.storage.local.set(dataUpdated);
        console.log(`Update available: ${latestVersion}`);
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}

// Compare version strings (format: x.y.z)
function isNewerVersion(latest, current) {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);
    
    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
        const latestPart = latestParts[i] || 0;
        const currentPart = currentParts[i] || 0;
        
        if (latestPart > currentPart) return true;
        if (latestPart < currentPart) return false;
    }
    return false;
}

// Handle notification click
chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'update-available') {
        chrome.storage.local.get(['updateUrl'], (data) => {
            if (data.updateUrl) {
                chrome.tabs.create({ url: data.updateUrl });
            }
        });
    }
});

// Check for updates on install/update
chrome.runtime.onInstalled.addListener((details) => {
    console.log(`Website Testing Assistant ${CURRENT_VERSION} installed/updated`);
    
    // Check for updates immediately after install/update
    checkForUpdates();
    
    // Set up periodic checks
    chrome.alarms.create('versionCheck', { periodInMinutes: CHECK_INTERVAL }); // 1 hours
});

// Set up alarm listener for periodic checks
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'versionCheck') {
        checkForUpdates();
    }
});

// Initial check when service worker starts
checkForUpdates();

// Handle messages between popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle version check request
    if (request.action === 'checkForUpdates') {
        checkForUpdates().then(() => {
            chrome.storage.local.get(['updateAvailable', 'latestVersion', 'updateUrl'], (data) => {
                sendResponse({
                    updateAvailable: data.updateAvailable || false,
                    currentVersion: CURRENT_VERSION,
                    latestVersion: data.latestVersion || CURRENT_VERSION,
                    updateUrl: data.updateUrl
                });
            });
            return true; // Keep message channel open for async response
        });
        return true;
    }
    
    // Forward messages if needed
    if (request.action === 'errorAdded') {
        // Notify all tabs that an error was added
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, request).catch(() => {
                    // Ignore errors for tabs without content script
                });
            });
        });
    }
    
    return true; // Keep message channel open
});

// Handle tab updates to refresh error markers
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Inject content script if needed
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['lib/jquery.min.js', 'content.js']
        }).catch(() => {
            // Ignore errors for special pages
        });
    }
});


// Lưu ID của popup để reuse
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "openOrResizeErrorWindow") {
        const { url, width, height, errorId } = message;

        chrome.storage.local.get(['errorWindowId'], (result) => {
            const errorWindowId = result.errorWindowId;

            if (errorWindowId) {
                chrome.windows.get(errorWindowId, { populate: true }, (win) => {
                    if (chrome.runtime.lastError || !win) {
                        openNewErrorWindow();
                    } else {
                        chrome.windows.update(errorWindowId, {
                            width,
                            height,
                            focused: true,
                            drawAttention: true
                        });

                        const tabId = win.tabs[0].id;
                        injectHighlightScript(tabId, errorId);
                    }
                });
            } else {
                openNewErrorWindow();
            }
        });

        function openNewErrorWindow() {
            chrome.windows.create({
                url,
                type: "popup",
                width,
                height
            }, (newWindow) => {
                const windowId = newWindow?.id;
                const tabId = newWindow?.tabs?.[0]?.id;
        
                if (!windowId) return;
                chrome.storage.local.set({ errorWindowId: windowId });
        
                if (tabId) {
                    injectHighlightScript(tabId, errorId);
                } else {
                    const listener = (updatedTabId, info, tab) => {
                        if (tab.windowId === windowId && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            injectHighlightScript(updatedTabId, errorId);
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                }
            });
        }
        

        function injectHighlightScript(tabId, errorId) {
            chrome.scripting.executeScript({
                target: { tabId },
                func: (errorId) => {
                    const run = () => {
                        const highlightDelay = 500;
                        const removeDelay = 1000;
                    
                        setTimeout(() => {
                            const el = document.querySelector(`div[data-error-id="${errorId}"]`);
                            if (!el) return;
                    
                            el.classList.add('testing-error-highlight');
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                            setTimeout(() => {
                                el.classList.remove('testing-error-highlight');
                            }, removeDelay);
                        }, highlightDelay);
                    };
                    

                    if (document.readyState === 'complete' || document.readyState === 'interactive') {
                        run();
                    } else {
                        document.addEventListener('DOMContentLoaded', run, { once: true });
                    }
                },
                args: [errorId]
            });
        }
    }
});

// Xóa errorWindowId nếu user đóng popup
chrome.windows.onRemoved.addListener((closedWindowId) => {
    chrome.storage.local.get(['errorWindowId'], (result) => {
        if (result.errorWindowId === closedWindowId) {
            chrome.storage.local.remove('errorWindowId');
        }
    });
});
