export function handleWindowMessage(message, sender, sendResponse) {
    const { url, width, height, errorId } = message;

    chrome.storage.local.get(['errorWindowId'], (result) => {
        const errorWindowId = result.errorWindowId;

        if (errorWindowId) {
            chrome.windows.get(errorWindowId, { populate: true }, (win) => {
                if (chrome.runtime.lastError || !win) {
                    console.log(
                        'Cửa sổ không tồn tại, tạo mới:',
                        chrome.runtime.lastError?.message,
                    );
                    openNewErrorWindow(url, width, height, errorId);
                } else {
                    chrome.windows.update(
                        errorWindowId,
                        { width, height, drawAttention: true },
                        () => {
                            if (chrome.runtime.lastError) {
                                console.error('Lỗi khi resize cửa sổ:', chrome.runtime.lastError);
                                return;
                            }
                            console.log(
                                `Đã resize cửa sổ ${errorWindowId} thành ${width}x${height}`,
                            );
                            setTimeout(() => {
                                if (win.tabs[0].url !== url) {
                                    console.log(
                                        `Chuyển hướng tab ${win.tabs[0].id} sang URL mới: ${url}`,
                                    );
                                    chrome.tabs.update(win.tabs[0].id, { url }, () => {
                                        if (chrome.runtime.lastError) {
                                            console.error(
                                                'Lỗi khi update tab:',
                                                chrome.runtime.lastError,
                                            );
                                            return;
                                        }
                                        chrome.tabs.onUpdated.addListener(function listener(
                                            updatedTabId,
                                            info,
                                        ) {
                                            if (
                                                updatedTabId === win.tabs[0].id &&
                                                info.status === 'complete'
                                            ) {
                                                chrome.tabs.onUpdated.removeListener(listener);
                                                console.log(
                                                    `Tab ${updatedTabId} đã tải xong, inject script`,
                                                );
                                                injectHighlightScript(updatedTabId, errorId);
                                            }
                                        });
                                    });
                                } else {
                                    console.log(
                                        `Tab ${win.tabs[0].id} đã ở đúng URL, inject script`,
                                    );
                                    injectHighlightScript(win.tabs[0].id, errorId);
                                }
                            }, 600);
                        },
                    );
                }
            });
        } else {
            console.log('Không tìm thấy errorWindowId, tạo cửa sổ mới');
            openNewErrorWindow(url, width, height, errorId);
        }
    });
}

export function handleWindowClose(closedWindowId) {
    chrome.storage.local.get(['errorWindowId'], (result) => {
        if (result.errorWindowId === closedWindowId) {
            chrome.storage.local.remove('errorWindowId');
        }
    });
}

function openNewErrorWindow(url, width, height, errorId) {
    chrome.windows.create({ url, type: 'panel', width, height }, (newWindow) => {
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
    chrome.scripting.executeScript(
        {
            target: { tabId },
            func: (errorId) => {
                console.log(`Inject script cho errorId: ${errorId}`);
                const run = () => {
                    document.body.classList.add('ext-is-popup');
                    
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
                                }, 4000);

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

                if (document.readyState === 'complete') {
                    if (run()) return;
                } else {
                    console.log('DOM chưa sẵn sàng, chờ load');
                    window.addEventListener(
                        'load',
                        () => {
                            console.log('DOM loaded, chạy highlight');
                            run();
                        },
                        { once: true },
                    );
                }

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

                window.addEventListener(
                    'resize',
                    () => {
                        console.log('Sự kiện resize, thử chạy lại highlight');
                        run();
                    },
                    { once: true },
                );
            },
            args: [errorId],
        },
        (results) => {
            if (chrome.runtime.lastError) {
                console.error('Lỗi khi inject script:', chrome.runtime.lastError);
            } else {
                console.log(`Inject script thành công cho tab ${tabId}`);
            }
        },
    );
}
