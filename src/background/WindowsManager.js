import { ConfigurationManager } from '../shared/config/ConfigurationManager.js';
import { ErrorLogger } from '../shared/ErrorLogger.js';
import { WindowsService } from './WindowsService.js';

/**
 * Opens (or reuses) one dedicated window sized to an error's breakpoint, points it
 * at the error page and asks the content script to highlight that error.
 *
 * The pipeline is linear and cancellable: clicking another error supersedes the
 * request in flight instead of racing it, so only one highlight ever runs.
 *
 * Order matters — navigate first, measure second. Measuring the old page and then
 * navigating gives a wrong correction whenever the two pages differ in scrollbars.
 */

const STORAGE_KEY = ConfigurationManager.STORAGE_KEYS.ERROR_WINDOW_ID;
const DEFAULT_INNER_SIZE = { width: 800, height: 600 };
const NAVIGATION_TIMEOUT_MS = 15000;
const SIZE_TOLERANCE_PX = 1;
const SIZE_CORRECTION_PASSES = 2;
const MIN_WINDOW_SIZE_PX = 200;
const MAX_WINDOW_SIZE_PX = 10000;
const HIGHLIGHT_MAX_ATTEMPTS = 8;
const HIGHLIGHT_RETRY_DELAY_MS = 350;

let currentPlatform = 'win32';
let activeRequestId = 0;

if (chrome.runtime?.getPlatformInfo) {
    Promise.resolve(chrome.runtime.getPlatformInfo())
        .then((platformInfo) => {
            if (platformInfo?.os) currentPlatform = platformInfo.os;
        })
        .catch(() => {});
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** A newer click has arrived — abandon this run. */
const isStale = (requestId) => requestId !== activeRequestId;

/** Never command a nonsense size off a bad measurement. */
const clampWindowSize = (value) =>
    Math.min(MAX_WINDOW_SIZE_PX, Math.max(MIN_WINDOW_SIZE_PX, Math.round(value)));

/** Rough decoration sizes, only used to open a new window close to the target. */
function estimateOuterSize(innerSize) {
    const allDecorations = ConfigurationManager.WINDOW_DECORATIONS;
    const decorations = allDecorations[currentPlatform] ?? allDecorations.win32;
    return {
        width: Math.round(innerSize.width + decorations.borderHorizontal),
        height: Math.round(innerSize.height + decorations.titleBar + decorations.borderVertical),
    };
}

/**
 * Resolve once the tab finishes loading. Always detaches its listeners, so a tab
 * that never completes cannot leak a listener into the next run.
 */
function waitForTabComplete(tabId, timeoutMs = NAVIGATION_TIMEOUT_MS) {
    return new Promise((resolve) => {
        let isSettled = false;

        const finish = (didComplete) => {
            if (isSettled) return;
            isSettled = true;
            chrome.tabs.onUpdated.removeListener(onTabUpdated);
            chrome.tabs.onRemoved.removeListener(onTabRemoved);
            clearTimeout(timeoutId);
            resolve(didComplete);
        };

        const onTabUpdated = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') finish(true);
        };
        const onTabRemoved = (removedTabId) => {
            if (removedTabId === tabId) finish(false);
        };

        const timeoutId = setTimeout(() => finish(false), timeoutMs);
        chrome.tabs.onUpdated.addListener(onTabUpdated);
        chrome.tabs.onRemoved.addListener(onTabRemoved);
    });
}

async function ensureTabLoaded(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.status === 'complete') return true;
    } catch {
        return false;
    }
    return await waitForTabComplete(tabId);
}

/**
 * Point the tab at the target URL and wait for it. The waiter is attached before
 * the update call so a fast load cannot fire before anyone is listening.
 */
async function navigateTab(tabId, targetUrl) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return false;
    if (tab.url === targetUrl) return await ensureTabLoaded(tabId);

    const loadPromise = waitForTabComplete(tabId);
    try {
        await chrome.tabs.update(tabId, { url: targetUrl });
    } catch (error) {
        ErrorLogger.error('Không chuyển được tab sang URL lỗi', { tabId, targetUrl, error });
        return false;
    }
    return await loadPromise;
}

async function measureInnerSize(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => ({ width: window.innerWidth, height: window.innerHeight }),
        });
        return results?.[0]?.result ?? null;
    } catch (error) {
        ErrorLogger.warn('Không đo được kích thước nội dung', { tabId, error });
        return null;
    }
}

/**
 * Resize the window until its viewport matches the breakpoint. Two passes is
 * enough: the first absorbs the decoration guess, the second any scrollbar shift.
 */
async function applyInnerSize(windowId, tabId, targetInnerSize, requestId) {
    for (let pass = 0; pass < SIZE_CORRECTION_PASSES; pass++) {
        if (isStale(requestId)) return;

        const measuredSize = await measureInnerSize(tabId);
        // A blank or not-yet-laid-out page reports 0; that measurement is useless.
        if (!measuredSize || measuredSize.width <= 0 || measuredSize.height <= 0) return;

        const widthDiff = targetInnerSize.width - measuredSize.width;
        const heightDiff = targetInnerSize.height - measuredSize.height;
        if (Math.abs(widthDiff) <= SIZE_TOLERANCE_PX && Math.abs(heightDiff) <= SIZE_TOLERANCE_PX) {
            return;
        }

        const windowInfo = await WindowsService.getWindow(windowId);
        if (!windowInfo) return;

        await WindowsService.updateWindow(windowId, {
            width: clampWindowSize(windowInfo.width + widthDiff),
            height: clampWindowSize(windowInfo.height + heightDiff),
        });
    }
}

/**
 * Ask the content script to highlight. Retrying only covers the window where the
 * content script has not booted yet — once it answers, we stop.
 */
async function requestHighlight(tabId, errorId, requestId) {
    if (!errorId) return true;

    for (let attempt = 0; attempt < HIGHLIGHT_MAX_ATTEMPTS; attempt++) {
        if (isStale(requestId)) return false;

        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                action: ConfigurationManager.ACTIONS.HIGHLIGHT_ERROR,
                errorId,
            });
            if (response?.success) return true;
        } catch {
            // Content script is not ready to receive messages yet; retry.
        }

        await delay(HIGHLIGHT_RETRY_DELAY_MS);
    }
    return false;
}

/**
 * Last resort when no content script answers: one scroll, one highlight, no observers.
 */
async function highlightWithoutContentScript(tabId, errorId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            args: [errorId, ConfigurationManager.CSS_CLASSES.ERROR_HIGHLIGHT],
            func: (targetErrorId, highlightClass) => {
                const overlayElement = document.querySelector(`[data-error-id="${targetErrorId}"]`);
                if (!overlayElement) return false;

                overlayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                overlayElement.classList.add(highlightClass);
                setTimeout(() => overlayElement.classList.remove(highlightClass), 4000);
                return true;
            },
        });
    } catch (error) {
        ErrorLogger.warn('Fallback highlight thất bại', { tabId, errorId, error });
    }
}

async function getStoredWindowId() {
    try {
        const storage = await chrome.storage.local.get([STORAGE_KEY]);
        return storage?.[STORAGE_KEY] ?? null;
    } catch {
        return null;
    }
}

async function createErrorWindow(url, targetInnerSize) {
    const outerSize = estimateOuterSize(targetInnerSize);
    const createdWindow = await WindowsService.createWindow({
        url,
        type: 'popup',
        width: outerSize.width,
        height: outerSize.height,
    });

    const tabId = createdWindow?.tabs?.[0]?.id;
    if (!createdWindow || !tabId) return null;

    await chrome.storage.local.set({ [STORAGE_KEY]: createdWindow.id });
    await ensureTabLoaded(tabId);
    return { windowId: createdWindow.id, tabId, isNewWindow: true };
}

/** Quiet lookup: a closed window is the normal case here, not an error worth logging. */
async function findExistingWindow(windowId) {
    try {
        return await chrome.windows.get(windowId, { populate: true });
    } catch {
        return null;
    }
}

async function resolveTargetWindow(url, targetInnerSize) {
    const storedWindowId = await getStoredWindowId();
    if (storedWindowId) {
        const windowInfo = await findExistingWindow(storedWindowId);
        const tabId = windowInfo?.tabs?.[0]?.id;
        if (tabId) return { windowId: storedWindowId, tabId, isNewWindow: false };

        await chrome.storage.local.remove(STORAGE_KEY).catch(() => {});
    }
    return await createErrorWindow(url, targetInnerSize);
}

async function runErrorWindowFlow({ url, width, height, errorId }) {
    const requestId = ++activeRequestId;
    const targetInnerSize = {
        width: Math.floor(Number(width) || DEFAULT_INNER_SIZE.width),
        height: Math.floor(Number(height) || DEFAULT_INNER_SIZE.height),
    };

    const target = await resolveTargetWindow(url, targetInnerSize);
    if (!target) return;
    if (isStale(requestId)) return;

    if (!target.isNewWindow) {
        const didNavigate = await navigateTab(target.tabId, url);
        if (isStale(requestId)) return;
        if (!didNavigate) {
            ErrorLogger.warn('Tab chưa báo tải xong, vẫn tiếp tục', { tabId: target.tabId, url });
        }
    }

    await applyInnerSize(target.windowId, target.tabId, targetInnerSize, requestId);
    if (isStale(requestId)) return;

    await WindowsService.updateWindow(target.windowId, { focused: true, drawAttention: true });
    if (isStale(requestId)) return;

    const didHighlight = await requestHighlight(target.tabId, errorId, requestId);
    if (!didHighlight && errorId && !isStale(requestId)) {
        await highlightWithoutContentScript(target.tabId, errorId);
    }
}

/**
 * Entry point for the `openOrResizeErrorWindow` message.
 */
export function handleWindowMessage(message, sender, sendResponse) {
    runErrorWindowFlow(message).catch((error) => {
        ErrorLogger.error('Không mở được cửa sổ lỗi', { message, error });
    });
    if (sendResponse) sendResponse({ success: true });
}

export function handleWindowClose(windowId) {
    getStoredWindowId().then((storedWindowId) => {
        if (storedWindowId === windowId) chrome.storage.local.remove(STORAGE_KEY).catch(() => {});
    });
}
