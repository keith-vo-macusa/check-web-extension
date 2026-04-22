const WINDOW_DECORATIONS = {
    win32: { titleBar: 32, borderHorizontal: 16, borderVertical: 8 },
    darwin: { titleBar: 28, borderHorizontal: 0, borderVertical: 0 },
    linux: { titleBar: 35, borderHorizontal: 8, borderVertical: 8 },
};
let currentPlatform = 'win32';
function calculateOuterDimensions(innerWidth, innerHeight) {
    const decorations = WINDOW_DECORATIONS[currentPlatform] || WINDOW_DECORATIONS.win32;
    return {
        width: Math.round(innerWidth + decorations.borderHorizontal),
        height: Math.round(innerHeight + decorations.titleBar + decorations.borderVertical),
    };
}

function measureAndAdjustWindow(windowId, tabId, expectedInnerWidth, expectedInnerHeight, errorId) {
    chrome.scripting.executeScript(
        {
            target: { tabId },
            func: () => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight }),
        },
        (results) => {
            if (chrome.runtime.lastError || !results?.[0]?.result)
                return (
                    console.log('Không thể đo inner dimensions, tiếp tục với kích thước hiện tại'),
                    void injectHighlightScript(tabId, errorId)
                );

            const actualInnerSize = results[0].result;
            const widthDiff = expectedInnerWidth - actualInnerSize.innerWidth;
            const heightDiff = expectedInnerHeight - actualInnerSize.innerHeight;

            console.log(`Inner thực tế: ${actualInnerSize.innerWidth}x${actualInnerSize.innerHeight}`);
            console.log(`Inner mong muốn: ${expectedInnerWidth}x${expectedInnerHeight}`);
            console.log(`Chênh lệch: ${widthDiff}x${heightDiff}`);
            Math.abs(widthDiff) > 0 || Math.abs(heightDiff) > 0
                ? chrome.windows.get(windowId, (windowInfo) => {
                      if (chrome.runtime.lastError || !windowInfo) return;
                      const adjustedWidth = Math.round(windowInfo.width + widthDiff);
                      const adjustedHeight = Math.round(windowInfo.height + heightDiff);

                      chrome.windows.update(
                          windowId,
                          { width: Math.floor(adjustedWidth), height: Math.floor(adjustedHeight) },
                          () => {
                              if (chrome.runtime.lastError) {
                                  console.error('Lỗi khi điều chỉnh kích thước:', chrome.runtime.lastError);
                              } else {
                                  console.log(
                                      `Đã điều chỉnh cửa sổ ${windowId} thành ${adjustedWidth}x${adjustedHeight} (outer) để đạt ${expectedInnerWidth}x${expectedInnerHeight} (inner)`,
                                  );
                              }
                              injectHighlightScript(tabId, errorId);
                          },
                      );
                  })
                : (console.log('Kích thước đã chính xác, không cần điều chỉnh'),
                  injectHighlightScript(tabId, errorId));
        },
    );
}

function resizeWindowToInnerSize(windowId, windowInfo, targetUrl, width, height, errorId) {
    width = Math.floor(Number(width) || 800);
    height = Math.floor(Number(height) || 600);
    const tabId = windowInfo.tabs[0].id;
    chrome.scripting.executeScript(
        {
            target: { tabId },
            func: () => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight }),
        },
        (results) => {
            if (chrome.runtime.lastError || !results?.[0]?.result) {
                const outerDimensions = calculateOuterDimensions(width, height);
                return void chrome.windows.update(
                    windowId,
                    {
                        width: Math.floor(outerDimensions.width),
                        height: Math.floor(outerDimensions.height),
                        drawAttention: true,
                    },
                    () => {
                        handleTabUpdate(windowInfo, targetUrl, errorId);
                    },
                );
            }

            const actualInnerSize = results[0].result;
            const widthDiff = width - actualInnerSize.innerWidth;
            const heightDiff = height - actualInnerSize.innerHeight;
            const adjustedWidth = Math.round(windowInfo.width + widthDiff);
            const adjustedHeight = Math.round(windowInfo.height + heightDiff);

            chrome.windows.update(
                windowId,
                {
                    width: Math.floor(adjustedWidth),
                    height: Math.floor(adjustedHeight),
                    drawAttention: true,
                },
                () => {
                    chrome.runtime.lastError
                        ? console.error('Lỗi khi resize cửa sổ:', chrome.runtime.lastError)
                        : (console.log(
                              `Đã resize cửa sổ ${windowId} thành ${adjustedWidth}x${adjustedHeight} (outer) để đạt ${width}x${height} (inner)`,
                          ),
                          handleTabUpdate(windowInfo, targetUrl, errorId));
                },
            );
        },
    );
}

function handleTabUpdate(windowInfo, targetUrl, errorId) {
    windowInfo.tabs[0].url !== targetUrl
        ? (console.log(`Chuyển hướng tab ${windowInfo.tabs[0].id} sang URL mới: ${targetUrl}`),
          chrome.tabs.update(windowInfo.tabs[0].id, { url: targetUrl }, () => {
              chrome.runtime.lastError
                  ? console.error('Lỗi khi update tab:', chrome.runtime.lastError)
                  : chrome.tabs.onUpdated.addListener(function onUpdated(tabId, changeInfo) {
                        if (tabId === windowInfo.tabs[0].id && changeInfo.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(onUpdated);
                            console.log(`Tab ${tabId} đã tải xong, inject script`);
                            injectHighlightScript(tabId, errorId);
                        }
                    });
          }))
        : (console.log(`Tab ${windowInfo.tabs[0].id} đã ở đúng URL, inject script`),
          injectHighlightScript(windowInfo.tabs[0].id, errorId));
}

chrome.runtime.getPlatformInfo &&
    chrome.runtime.getPlatformInfo((platformInfo) => {
        currentPlatform = platformInfo.os;
    });

export function handleWindowMessage(message) {
    const { url, width, height, errorId } = message;
    chrome.storage.local.get(['errorWindowId'], (storage) => {
        const errorWindowId = storage.errorWindowId;
        errorWindowId
            ? chrome.windows.get(errorWindowId, { populate: true }, (windowInfo) => {
                  chrome.runtime.lastError || !windowInfo
                      ? (console.log(
                            'Cửa sổ không tồn tại, tạo mới:',
                            chrome.runtime.lastError?.message,
                        ),
                        openNewErrorWindow(url, width, height, errorId))
                      : resizeWindowToInnerSize(
                            errorWindowId,
                            windowInfo,
                            url,
                            width,
                            height,
                            errorId,
                        );
              })
            : (console.log('Không tìm thấy errorWindowId, tạo cửa sổ mới'),
              openNewErrorWindow(url, width, height, errorId));
    });
}

export function handleWindowClose(windowId) {
    chrome.storage.local.get(['errorWindowId'], (storage) => {
        if (storage.errorWindowId === windowId) chrome.storage.local.remove('errorWindowId');
    });
}

function openNewErrorWindow(url, width, height, errorId) {
    const targetInnerWidth = Math.floor(Number(width) || 800);
    const targetInnerHeight = Math.floor(Number(height) || 600);
    const outerDimensions = calculateOuterDimensions(targetInnerWidth, targetInnerHeight);
    const finalWidth = Math.floor(outerDimensions.width);
    const finalHeight = Math.floor(outerDimensions.height);

    console.log(`Estimated dimensions: ${outerDimensions.width}x${outerDimensions.height}`);
    console.log(`Final dimensions (integer): ${finalWidth}x${finalHeight}`);
    chrome.windows.create({ url, type: 'panel', width: finalWidth, height: finalHeight }, (windowInfo) => {
        if (chrome.runtime.lastError || !windowInfo)
            return void console.error('Lỗi khi tạo cửa sổ mới:', chrome.runtime.lastError);

        const windowId = windowInfo.id;
        const tabId = windowInfo.tabs?.[0]?.id;
        console.log(
            `Tạo cửa sổ mới ${windowId}, inner size mong muốn: ${targetInnerWidth}x${targetInnerHeight}`,
        );
        chrome.storage.local.set({ errorWindowId: windowId });
        if (tabId) {
            chrome.tabs.onUpdated.addListener(function onUpdated(updatedTabId, changeInfo) {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(onUpdated);
                    measureAndAdjustWindow(
                        windowId,
                        tabId,
                        targetInnerWidth,
                        targetInnerHeight,
                        errorId,
                    );
                }
            });
        }
    });
}

function injectHighlightScript(tabId, errorId) {
    chrome.scripting.executeScript(
        {
            target: { tabId },
            func: (errorIdArg) => {
                console.log(`Inject script cho errorId: ${errorIdArg}`);
                const highlightError = () => {
                    document.body.classList.add('ext-is-popup');
                    const errorElement = document.querySelector(`div[data-error-id="${errorIdArg}"]`);
                    if (errorElement) {
                        console.log(`Tìm thấy element với errorId: ${errorIdArg}`);
                        const delayMs = 300;
                        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => {
                            errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            const runHighlight = () => {
                                errorElement.removeEventListener('animationend', runHighlight);
                                errorElement.removeEventListener('transitionend', runHighlight);
                                console.log(`Thêm highlight cho errorId: ${errorIdArg}`);
                                errorElement.classList.add('testing-error-highlight');
                                setTimeout(() => {
                                    errorElement.classList.remove('testing-error-highlight');
                                    console.log(`Xóa highlight cho errorId: ${errorIdArg}`);
                                }, 4000);
                            };
                            errorElement.addEventListener('animationend', runHighlight);
                            errorElement.addEventListener('transitionend', runHighlight);
                            setTimeout(runHighlight, 500);
                        }, delayMs);
                        return true;
                    }
                    console.log(`Không tìm thấy element với errorId: ${errorIdArg}`);
                    return false;
                };

                if (document.readyState === 'complete') {
                    if (highlightError()) return;
                } else {
                    console.log('DOM chưa sẵn sàng, chờ load');
                    window.addEventListener(
                        'load',
                        () => {
                            console.log('DOM loaded, chạy highlight');
                            highlightError();
                        },
                        { once: true },
                    );
                }

                console.log('Khởi tạo MutationObserver cho errorId:', errorIdArg);
                const observer = new MutationObserver(() => {
                    if (highlightError()) {
                        console.log('Element xuất hiện, ngắt MutationObserver');
                        observer.disconnect();
                    }
                });
                observer.observe(document.body || document.documentElement, {
                    childList: true,
                    subtree: true,
                });

                let retryCount = 0;
                const retry = () => {
                    if (retryCount >= 6) {
                        console.log(`Hết 6 lần thử cho errorId: ${errorIdArg}`);
                        observer.disconnect();
                        return;
                    }
                    retryCount++;
                    console.log(`Thử lại lần ${retryCount} cho errorId: ${errorIdArg}`);
                    highlightError() ? observer.disconnect() : setTimeout(retry, 600);
                };
                setTimeout(retry, 600);
                window.addEventListener(
                    'resize',
                    () => {
                        console.log('Sự kiện resize, thử chạy lại highlight');
                        highlightError();
                    },
                    { once: true },
                );
            },
            args: [errorId],
        },
        () => {
            chrome.runtime.lastError
                ? console.error('Lỗi khi inject script:', chrome.runtime.lastError)
                : console.log(`Inject script thành công cho tab ${tabId}`);
        },
    );
}
