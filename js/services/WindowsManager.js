// Hằng số ước tính cho window decorations trên các platform khác nhau
const WINDOW_DECORATIONS = {
    win32: { titleBar: 32, borderHorizontal: 16, borderVertical: 8 },
    darwin: { titleBar: 28, borderHorizontal: 0, borderVertical: 0 },
    linux: { titleBar: 35, borderHorizontal: 8, borderVertical: 8 },
};

// Lấy thông tin platform hiện tại
let currentPlatform = 'win32'; // default
if (chrome.runtime.getPlatformInfo) {
    chrome.runtime.getPlatformInfo((info) => {
        currentPlatform = info.os;
    });
}

/**
 * Tính toán kích thước outer cần thiết để đạt được inner size mong muốn
 * @param {number} innerWidth - Chiều rộng nội dung mong muốn
 * @param {number} innerHeight - Chiều cao nội dung mong muốn
 * @returns {object} - {width, height} cho chrome.windows API
 */
function calculateOuterDimensions(innerWidth, innerHeight) {
    const decorations = WINDOW_DECORATIONS[currentPlatform] || WINDOW_DECORATIONS.win32;
    return {
        width: Math.round(innerWidth + decorations.borderHorizontal),
        height: Math.round(innerHeight + decorations.titleBar + decorations.borderVertical),
    };
}

/**
 * Đo kích thước inner thực tế và điều chỉnh cửa sổ nếu cần
 */
function measureAndAdjustWindow(windowId, tabId, desiredInnerWidth, desiredInnerHeight, errorId) {
    chrome.scripting.executeScript(
        {
            target: { tabId },
            func: () => {
                return {
                    innerWidth: window.innerWidth,
                    innerHeight: window.innerHeight,
                };
            },
        },
        (results) => {
            if (chrome.runtime.lastError || !results?.[0]?.result) {
                console.log('Không thể đo inner dimensions, tiếp tục với kích thước hiện tại');
                injectHighlightScript(tabId, errorId);
                return;
            }

            const actualInner = results[0].result;
            const widthDiff = desiredInnerWidth - actualInner.innerWidth;
            const heightDiff = desiredInnerHeight - actualInner.innerHeight;

            console.log(`Inner thực tế: ${actualInner.innerWidth}x${actualInner.innerHeight}`);
            console.log(`Inner mong muốn: ${desiredInnerWidth}x${desiredInnerHeight}`);
            console.log(`Chênh lệch: ${widthDiff}x${heightDiff}`);

            // Chỉ điều chỉnh nếu chênh lệch > 5px
            if (Math.abs(widthDiff) > 0 || Math.abs(heightDiff) > 0) {
                chrome.windows.get(windowId, (win) => {
                    if (chrome.runtime.lastError || !win) return;

                    const newWidth = Math.round(win.width + widthDiff);
                    const newHeight = Math.round(win.height + heightDiff);

                    chrome.windows.update(
                        windowId,
                        {
                            width: Math.floor(newWidth),
                            height: Math.floor(newHeight),
                        },
                        () => {
                            if (chrome.runtime.lastError) {
                                console.error(
                                    'Lỗi khi điều chỉnh kích thước:',
                                    chrome.runtime.lastError,
                                );
                            } else {
                                console.log(
                                    `Đã điều chỉnh cửa sổ ${windowId} thành ${newWidth}x${newHeight} (outer) để đạt ${desiredInnerWidth}x${desiredInnerHeight} (inner)`,
                                );
                            }
                            injectHighlightScript(tabId, errorId);
                        },
                    );
                });
            } else {
                console.log('Kích thước đã chính xác, không cần điều chỉnh');
                injectHighlightScript(tabId, errorId);
            }
        },
    );
}

/**
 * Resize cửa sổ để đạt kích thước inner mong muốn
 */
function resizeWindowToInnerSize(
    windowId,
    win,
    url,
    desiredInnerWidth,
    desiredInnerHeight,
    errorId,
) {
    desiredInnerWidth = Math.floor(Number(desiredInnerWidth) || 800);
    desiredInnerHeight = Math.floor(Number(desiredInnerHeight) || 600);
    const tabId = win.tabs[0].id;

    // Đo kích thước inner hiện tại
    chrome.scripting.executeScript(
        {
            target: { tabId },
            func: () => {
                return {
                    innerWidth: window.innerWidth,
                    innerHeight: window.innerHeight,
                };
            },
        },
        (results) => {
            if (chrome.runtime.lastError || !results?.[0]?.result) {
                // Fallback về phương pháp ước tính nếu không đo được
                const estimatedDimensions = calculateOuterDimensions(
                    desiredInnerWidth,
                    desiredInnerHeight,
                );
                chrome.windows.update(
                    windowId,
                    {
                        width: Math.floor(estimatedDimensions.width),
                        height: Math.floor(estimatedDimensions.height),
                        drawAttention: true,
                    },
                    () => {
                        handleTabUpdate(win, url, errorId);
                    },
                );
                return;
            }

            const currentInner = results[0].result;
            const widthDiff = desiredInnerWidth - currentInner.innerWidth;
            const heightDiff = desiredInnerHeight - currentInner.innerHeight;

            const newWidth = Math.round(win.width + widthDiff);
            const newHeight = Math.round(win.height + heightDiff);

            chrome.windows.update(
                windowId,
                {
                    width: Math.floor(newWidth),
                    height: Math.floor(newHeight),
                    drawAttention: true,
                },
                () => {
                    if (chrome.runtime.lastError) {
                        console.error('Lỗi khi resize cửa sổ:', chrome.runtime.lastError);
                        return;
                    }
                    console.log(
                        `Đã resize cửa sổ ${windowId} thành ${newWidth}x${newHeight} (outer) để đạt ${desiredInnerWidth}x${desiredInnerHeight} (inner)`,
                    );
                    handleTabUpdate(win, url, errorId);
                },
            );
        },
    );
}

/**
 * Xử lý việc update tab và inject script
 */
function handleTabUpdate(win, url, errorId) {
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
}

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
                    // Sử dụng phương pháp đo và điều chỉnh cho resize
                    resizeWindowToInnerSize(errorWindowId, win, url, width, height, errorId);
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
    // Đảm bảo input parameters là integer và kiểm tra giá trị hợp lệ
    const desiredInnerWidth = Math.floor(Number(width) || 800);
    const desiredInnerHeight = Math.floor(Number(height) || 600);
    const estimatedDimensions = calculateOuterDimensions(desiredInnerWidth, desiredInnerHeight);
    const finalWidth = Math.floor(estimatedDimensions.width);
    const finalHeight = Math.floor(estimatedDimensions.height);

    console.log(`Estimated dimensions: ${estimatedDimensions.width}x${estimatedDimensions.height}`);
    console.log(`Final dimensions (integer): ${finalWidth}x${finalHeight}`);

    chrome.windows.create(
        {
            url,
            type: 'panel',
            width: finalWidth,
            height: finalHeight,
        },
        (newWindow) => {
            if (chrome.runtime.lastError || !newWindow) {
                console.error('Lỗi khi tạo cửa sổ mới:', chrome.runtime.lastError);
                return;
            }

            const windowId = newWindow.id;
            const tabId = newWindow.tabs?.[0]?.id;

            console.log(
                `Tạo cửa sổ mới ${windowId}, inner size mong muốn: ${desiredInnerWidth}x${desiredInnerHeight}`,
            );
            chrome.storage.local.set({ errorWindowId: windowId });

            if (tabId) {
                chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
                    if (updatedTabId === tabId && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        measureAndAdjustWindow(
                            windowId,
                            tabId,
                            desiredInnerWidth,
                            desiredInnerHeight,
                            errorId,
                        );
                    }
                });
            }
        },
    );
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
                        const scrollDelay = 600;
                        setTimeout(() => {
                            el.scrollIntoView({ behavior: 'instant', block: 'center' });
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
