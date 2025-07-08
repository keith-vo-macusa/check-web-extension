// Background service worker for Website Testing Assistant

// Extension version from manifest
const CURRENT_VERSION = chrome.runtime.getManifest().version;
const VERSION_CHECK_URL =
    'https://raw.githubusercontent.com/keith-vo-macusa/check-web-extension/main/manifest.json';
const CHECK_INTERVAL = 1; // 1 minutes

// Set default values
chrome.storage.local.set({
    updateAvailable: false,
    latestVersion: CURRENT_VERSION,
    updateUrl: 'https://github.com/keith-vo-macusa/check-web-extension/releases/latest',
});
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
            updateUrl:
                data.updateUrl ||
                'https://github.com/keith-vo-macusa/check-web-extension/releases/latest',
        };
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
                    updateUrl: data.updateUrl,
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
            tabs.forEach((tab) => {
                chrome.tabs.sendMessage(tab.id, request).catch(() => {
                    // Ignore errors for tabs without content script
                });
            });
        });
    }

    return true; // Keep message channel open
});




chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openOrResizeErrorWindow') {
        const { url, width, height, errorId } = message;

        chrome.storage.local.get(['errorWindowId'], (result) => {
            const errorWindowId = result.errorWindowId;

            if (errorWindowId) {
                chrome.windows.get(errorWindowId, { populate: true }, (win) => {
                    if (chrome.runtime.lastError || !win) {
                        console.log('Cửa sổ không tồn tại, tạo mới:', chrome.runtime.lastError?.message);
                        openNewErrorWindow();
                    } else {
                        // Resize cửa sổ
                        chrome.windows.update(errorWindowId, {
                            width,
                            height,
                            drawAttention: true,
                        }, () => {
                            if (chrome.runtime.lastError) {
                                console.error('Lỗi khi resize cửa sổ:', chrome.runtime.lastError);
                                return;
                            }
                            console.log(`Đã resize cửa sổ ${errorWindowId} thành ${width}x${height}`);
                            
                            // Chờ reflow/re-render sau resize
                            setTimeout(() => {
                                if (win.tabs[0].url !== url) {
                                    console.log(`Chuyển hướng tab ${win.tabs[0].id} sang URL mới: ${url}`);
                                    chrome.tabs.update(win.tabs[0].id, { url }, () => {
                                        if (chrome.runtime.lastError) {
                                            console.error('Lỗi khi update tab:', chrome.runtime.lastError);
                                            return;
                                        }
                                        chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
                                            if (updatedTabId === win.tabs[0].id && info.status === 'complete') {
                                                chrome.tabs.onUpdated.removeListener(listener);
                                                console.log(`Tab ${updatedTabId} đã tải xong, inject script`);
                                                injectHighlightScript(updatedTabId, errorId);
                                            }
                                        });
                                    });
                                } else {
                                    console.log(`Tab ${win.tabs[0].id} đã ở đúng URL, inject script`);
                                    injectHighlightScript(win.tabs[0].id, errorId);
                                }
                            }, 600); // Delay 600ms để chờ trang ổn định
                        });
                    }
                });
            } else {
                console.log('Không tìm thấy errorWindowId, tạo cửa sổ mới');
                openNewErrorWindow();
            }
        });

        function openNewErrorWindow() {
            chrome.windows.create({
                url,
                type: 'normal',
                width,
                height,
            }, (newWindow) => {
                if (chrome.runtime.lastError || !newWindow) {
                    console.error('Lỗi khi tạo cửa sổ mới:', chrome.runtime.lastError);
                    return;
                }
                const windowId = newWindow.id;
                const tabId = newWindow.tabs?.[0]?.id;

                console.log(`Tạo cửa sổ mới ${windowId}, tab ${tabId}`);
                chrome.storage.local.set({ errorWindowId: windowId });

                if (tabId) {
                    chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
                        if (updatedTabId === tabId && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            console.log(`Tab ${tabId} đã tải xong, inject script`);
                            injectHighlightScript(tabId, errorId);
                        }
                    });
                }
            });
        }

        function injectHighlightScript(tabId, errorId) {
            chrome.scripting.executeScript({
                target: { tabId },
                func: (errorId) => {
                    console.log(`Inject script cho errorId: ${errorId}`);

                    const run = () => {
                        const el = document.querySelector(`div[data-error-id="${errorId}"]`);
                        if (el) {
                            console.log(`Tìm thấy element với errorId: ${errorId}`);
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

                            const scrollDelay = 600;
                            setTimeout(() => {
                                const onAnimationEnd = () => {
                                    el.removeEventListener('animationend', onAnimationEnd);
                                    el.removeEventListener('transitionend', onAnimationEnd);
                                    console.log(`Thêm highlight cho errorId: ${errorId}`);
                                    el.classList.add('testing-error-highlight');
                                    setTimeout(() => {
                                        el.classList.remove('testing-error-highlight');
                                        console.log(`Xóa highlight cho errorId: ${errorId}`);
                                    }, 4000); // Tăng thời gian highlight
                                };

                                el.addEventListener('animationend', onAnimationEnd);
                                el.addEventListener('transitionend', onAnimationEnd);
                                setTimeout(onAnimationEnd, 500);
                            }, scrollDelay);
                            return true;
                        }
                        console.log(`Không tìm thấy element với errorId: ${errorId}`);
                        return false;
                    };

                    // Chạy ngay nếu DOM sẵn sàng
                    if (document.readyState === 'complete') {
                        if (run()) return;
                    } else {
                        console.log('DOM chưa sẵn sàng, chờ load');
                        window.addEventListener('load', () => {
                            console.log('DOM loaded, chạy highlight');
                            run();
                        }, { once: true });
                    }

                    // MutationObserver để theo dõi DOM
                    console.log('Khởi tạo MutationObserver cho errorId:', errorId);
                    const observer = new MutationObserver(() => {
                        if (run()) {
                            console.log('Element xuất hiện, ngắt MutationObserver');
                            observer.disconnect();
                        }
                    });
                    observer.observe(document.body || document.documentElement, {
                        childList: true,
                        subtree: true,
                    });

                    // Retry logic
                    let retryCount = 0;
                    const maxRetries = 6;
                    const retryInterval = 600;

                    const retry = () => {
                        if (retryCount >= maxRetries) {
                            console.log(`Hết ${maxRetries} lần thử cho errorId: ${errorId}`);
                            observer.disconnect();
                            return;
                        }
                        retryCount++;
                        console.log(`Thử lại lần ${retryCount} cho errorId: ${errorId}`);
                        if (!run()) {
                            setTimeout(retry, retryInterval);
                        } else {
                            observer.disconnect();
                        }
                    };
                    setTimeout(retry, retryInterval);

                    // Lắng nghe resize để thử lại
                    window.addEventListener('resize', () => {
                        console.log('Sự kiện resize, thử chạy lại highlight');
                        run();
                    }, { once: true });
                },
                args: [errorId],
            }, (results) => {
                if (chrome.runtime.lastError) {
                    console.error('Lỗi khi inject script:', chrome.runtime.lastError);
                } else {
                    console.log(`Inject script thành công cho tab ${tabId}`);
                }
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


// Mảng lưu trữ các lỗi hiện tại
let errors = [];
// Mảng lưu các domain không được phép sử dụng extension
let unAuthorizedDomains = [] ;


// Hàm tính số lỗi "open" từ dữ liệu domain
function countOpenErrors(domainData) {
    if (!domainData?.path) return 0;

    return domainData.path.reduce((total, path) => {
        return total + (path.data?.filter((e) => e.status === 'open')?.length || 0);
    }, 0);
}

// Chỉ update badge nếu domain của tab active khớp
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


// Lắng nghe message
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action, domainName } = message;

    if (!domainName) return;

    if (action === 'setErrors') {
        errors[domainName] = message.errors;
        updateBadgeIfActive(domainName);
    }

    if (action === 'getErrors') {
        const result = errors[domainName] || { path: [] };
        sendResponse(result);
    }

    if (action === 'setUnauthorized') {
        unAuthorizedDomains = [...unAuthorizedDomains, domainName];
    }

    if (action === 'checkAuthorized') {
        sendResponse(!unAuthorizedDomains.includes(domainName));
    }

    if (action === 'removeUnauthorized') {
        unAuthorizedDomains = unAuthorizedDomains.filter((domain) => domain !== domainName);
        sendResponse(true);
    }

    return true; // giữ channel open nếu cần
});

// Khi người dùng chuyển tab
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        const tab = await chrome.tabs.get(tabId);
        const domain = new URL(tab.url).hostname;
        updateBadgeIfActive(domain, tabId);
    } catch (e) {
        console.error('❌ Không thể lấy domain từ tab:', e);
        chrome.action.setBadgeText({ text: '', tabId });
    }
});


