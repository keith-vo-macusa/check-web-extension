// Background service worker for Website Testing Assistant

/**
 * Version Management Module
 * Handles version checking and update notifications
 */
class VersionManager {
    constructor() {
        this.currentVersion = chrome.runtime.getManifest().version;
        this.versionCheckUrl =
            'https://raw.githubusercontent.com/keith-vo-macusa/check-web-extension/main/manifest.json';
        this.checkIntervalMinutes = 1;

        this.initializeDefaultStorage();
        this.setupPeriodicChecks();
    }

    /**
     * Initialize default storage values for version management
     */
    initializeDefaultStorage() {
        chrome.storage.local.set({
            updateAvailable: false,
            latestVersion: this.currentVersion,
            updateUrl: 'https://github.com/keith-vo-macusa/check-web-extension/releases/latest',
        });
    }

    /**
     * Check for extension updates from remote repository
     */
    async checkForUpdates() {
        try {
            const response = await fetch(`${this.versionCheckUrl}?t=${Date.now()}`);
            if (!response.ok) throw new Error('Failed to fetch version');

            const data = await response.json();
            const latestVersion = data.version;

            const updateData = {
                updateAvailable: this.isNewerVersion(latestVersion, this.currentVersion),
                latestVersion: latestVersion,
                updateUrl:
                    data.updateUrl ||
                    'https://github.com/keith-vo-macusa/check-web-extension/releases/latest',
            };

            chrome.storage.local.set(updateData);
            console.log(`Update check completed. Latest version: ${latestVersion}`);
        } catch (error) {
            console.error('Error checking for updates:', error);
        }
    }

    /**
     * Compare version strings (format: x.y.z)
     * @param {string} latestVersion - Latest version string
     * @param {string} currentVersion - Current version string
     * @returns {boolean} True if latest version is newer
     */
    isNewerVersion(latestVersion, currentVersion) {
        const latestParts = latestVersion.split('.').map(Number);
        const currentParts = currentVersion.split('.').map(Number);

        for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
            const latestPart = latestParts[i] || 0;
            const currentPart = currentParts[i] || 0;

            if (latestPart > currentPart) return true;
            if (latestPart < currentPart) return false;
        }
        return false;
    }

    /**
     * Setup periodic version checks using alarms
     */
    setupPeriodicChecks() {
        chrome.alarms.create('versionCheck', { periodInMinutes: this.checkIntervalMinutes });
    }

    /**
     * Handle version check response for popup requests
     * @param {function} sendResponse - Response callback
     */
    async handleVersionCheckRequest(sendResponse) {
        await this.checkForUpdates();
        chrome.storage.local.get(['updateAvailable', 'latestVersion', 'updateUrl'], (data) => {
            sendResponse({
                updateAvailable: data.updateAvailable || false,
                currentVersion: this.currentVersion,
                latestVersion: data.latestVersion || this.currentVersion,
                updateUrl: data.updateUrl,
            });
        });
    }
}

/**
 * Window Management Module
 * Handles error window creation, resizing, and management
 */
class WindowManager {
    constructor() {
        this.setupWindowCleanup();
    }

    /**
     * Open or resize error window for displaying errors
     * @param {Object} params - Window parameters
     * @param {string} params.url - URL to display
     * @param {number} params.width - Window width
     * @param {number} params.height - Window height
     * @param {string} params.errorId - Error ID to highlight
     */
    async openOrResizeErrorWindow({ url, width, height, errorId }) {
        const { errorWindowId } = await chrome.storage.local.get(['errorWindowId']);

        if (errorWindowId) {
            await this.handleExistingWindow(errorWindowId, { url, width, height, errorId });
        } else {
            await this.createNewErrorWindow({ url, width, height, errorId });
        }
    }

    /**
     * Handle existing error window
     */
    async handleExistingWindow(windowId, { url, width, height, errorId }) {
        try {
            const window = await chrome.windows.get(windowId, { populate: true });

            // Update window size and focus
            await chrome.windows.update(windowId, {
                width,
                height,
                focused: true,
                drawAttention: true,
            });

            // Navigate to URL if different
            if (window.tabs[0].url !== url) {
                await chrome.tabs.update(window.tabs[0].id, {
                    url,
                    focused: true,
                    drawAttention: true,
                });
            }

            this.injectHighlightScript(window.tabs[0].id, errorId);
        } catch (error) {
            // Window doesn't exist, create new one
            await this.createNewErrorWindow({ url, width, height, errorId });
        }
    }

    /**
     * Create a new error window
     */
    async createNewErrorWindow({ url, width, height, errorId }) {
        const newWindow = await chrome.windows.create({
            url,
            type: 'normal',
            width,
            height,
        });

        const windowId = newWindow?.id;
        const tabId = newWindow?.tabs?.[0]?.id;

        if (!windowId) return;

        chrome.storage.local.set({ errorWindowId: windowId });

        if (tabId) {
            this.injectHighlightScript(tabId, errorId);
        } else {
            this.setupTabLoadListener(windowId, errorId);
        }
    }

    /**
     * Setup listener for tab loading completion
     */
    setupTabLoadListener(windowId, errorId) {
        const tabUpdateListener = (updatedTabId, changeInfo, tab) => {
            if (tab.windowId === windowId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(tabUpdateListener);
                this.injectHighlightScript(updatedTabId, errorId);
            }
        };
        chrome.tabs.onUpdated.addListener(tabUpdateListener);
    }

    /**
     * Inject script to highlight specific error element
     * @param {number} tabId - Tab ID
     * @param {string} errorId - Error ID to highlight
     */
    injectHighlightScript(tabId, errorId) {
        chrome.scripting.executeScript({
            target: { tabId },
            func: this.highlightErrorElement,
            args: [errorId],
        });
    }

    /**
     * Function to be injected for highlighting error elements
     * @param {string} errorId - Error ID to highlight
     */
    highlightErrorElement(errorId) {
        const executeHighlight = () => {
            const errorElement = document.querySelector(`div[data-error-id="${errorId}"]`);
            if (!errorElement) return;

            // Scroll to element
            errorElement.scrollIntoView({ behavior: 'auto', block: 'center' });

            const scrollDelay = 500;
            setTimeout(() => {
                const handleAnimationEnd = () => {
                    errorElement.removeEventListener('animationend', handleAnimationEnd);
                    errorElement.removeEventListener('transitionend', handleAnimationEnd);

                    // Add highlight class after animation
                    errorElement.classList.add('testing-error-highlight');

                    // Auto-remove highlight after delay
                    setTimeout(() => {
                        errorElement.classList.remove('testing-error-highlight');
                    }, 1000);
                };

                errorElement.addEventListener('animationend', handleAnimationEnd);
                errorElement.addEventListener('transitionend', handleAnimationEnd);

                // Fallback if no animation
                setTimeout(handleAnimationEnd, 500);
            }, scrollDelay);
        };

        if (document.readyState === 'complete') {
            executeHighlight();
        } else {
            window.addEventListener('load', executeHighlight, { once: true });
        }
    }

    /**
     * Setup cleanup when windows are closed
     */
    setupWindowCleanup() {
        chrome.windows.onRemoved.addListener((closedWindowId) => {
            chrome.storage.local.get(['errorWindowId'], (result) => {
                if (result.errorWindowId === closedWindowId) {
                    chrome.storage.local.remove('errorWindowId');
                }
            });
        });
    }
}

/**
 * Tab Management Module
 * Handles tab updates and content script injection
 */
class TabManager {
    constructor() {
        this.setupTabUpdateListener();
    }

    /**
     * Setup listener for tab updates to inject content scripts
     */
    setupTabUpdateListener() {
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                this.injectContentScripts(tabId);
            }
        });
    }

    /**
     * Inject content scripts into tab
     * @param {number} tabId - Tab ID
     */
    async injectContentScripts(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['lib/jquery.min.js', 'content.js'],
            });
        } catch (error) {
            // Ignore errors for special pages that can't have scripts injected
        }
    }

    /**
     * Broadcast message to all tabs
     * @param {Object} message - Message to broadcast
     */
    async broadcastToAllTabs(message) {
        const tabs = await chrome.tabs.query({});
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, message).catch(() => {
                // Ignore errors for tabs without content script
            });
        });
    }
}

/**
 * Error Storage Management Module
 * Handles error data storage and retrieval
 */
class ErrorStorageManager {
    constructor() {
        this.errors = [];
    }

    /**
     * Set errors data
     * @param {Array} errors - Array of error objects
     */
    setErrors(errors) {
        this.errors = errors;
    }

    /**
     * Get current errors
     * @returns {Array} Current errors array
     */
    getErrors() {
        return this.errors;
    }
}

/**
 * Notification Management Module
 * Handles notification interactions
 */
class NotificationManager {
    /**
     * Setup notification click handlers
     */
    static setupNotificationHandlers() {
        chrome.notifications.onClicked.addListener((notificationId) => {
            if (notificationId === 'update-available') {
                chrome.storage.local.get(['updateUrl'], (data) => {
                    if (data.updateUrl) {
                        chrome.tabs.create({ url: data.updateUrl });
                    }
                });
            }
        });
    }
}

/**
 * Message Router Module
 * Routes and handles different types of messages
 */
class MessageRouter {
    constructor(versionManager, windowManager, tabManager, errorStorageManager) {
        this.versionManager = versionManager;
        this.windowManager = windowManager;
        this.tabManager = tabManager;
        this.errorStorageManager = errorStorageManager;
        this.setupMessageListener();
    }

    /**
     * Setup main message listener
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            return this.routeMessage(request, sender, sendResponse);
        });
    }

    /**
     * Route messages to appropriate handlers
     * @param {Object} request - Message request
     * @param {Object} sender - Message sender
     * @param {function} sendResponse - Response callback
     * @returns {boolean} Whether response is async
     */
    routeMessage(request, sender, sendResponse) {
        switch (request.action) {
            case 'checkForUpdates':
                this.handleVersionCheckRequest(sendResponse);
                return true;

            case 'errorAdded':
                this.handleErrorAddedNotification(request);
                break;

            case 'openOrResizeErrorWindow':
                this.handleWindowRequest(request);
                break;

            case 'setErrors':
                this.handleSetErrors(request);
                break;

            case 'getErrors':
                this.handleGetErrors(sendResponse);
                break;

            default:
                console.warn('Unknown message action:', request.action);
        }

        return true; // Keep message channel open
    }

    /**
     * Handle version check requests
     */
    async handleVersionCheckRequest(sendResponse) {
        await this.versionManager.handleVersionCheckRequest(sendResponse);
    }

    /**
     * Handle error added notifications
     */
    async handleErrorAddedNotification(request) {
        await this.tabManager.broadcastToAllTabs(request);
    }

    /**
     * Handle window open/resize requests
     */
    async handleWindowRequest(request) {
        const { url, width, height, errorId } = request;
        await this.windowManager.openOrResizeErrorWindow({ url, width, height, errorId });
    }

    /**
     * Handle set errors requests
     */
    handleSetErrors(request) {
        this.errorStorageManager.setErrors(request.errors);
    }

    /**
     * Handle get errors requests
     */
    handleGetErrors(sendResponse) {
        sendResponse(this.errorStorageManager.getErrors());
    }
}

/**
 * Background Script Controller
 * Main controller that initializes and coordinates all modules
 */
class BackgroundController {
    constructor() {
        this.initializeModules();
        this.setupEventListeners();
        this.performInitialTasks();
    }

    /**
     * Initialize all modules
     */
    initializeModules() {
        this.versionManager = new VersionManager();
        this.windowManager = new WindowManager();
        this.tabManager = new TabManager();
        this.errorStorageManager = new ErrorStorageManager();

        this.messageRouter = new MessageRouter(
            this.versionManager,
            this.windowManager,
            this.tabManager,
            this.errorStorageManager,
        );
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Setup notification handlers
        NotificationManager.setupNotificationHandlers();

        // Setup alarm listener for periodic version checks
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'versionCheck') {
                this.versionManager.checkForUpdates();
            }
        });

        // Setup extension lifecycle listeners
        chrome.runtime.onInstalled.addListener((details) => {
            console.log(
                `Website Testing Assistant ${this.versionManager.currentVersion} installed/updated`,
            );
            this.versionManager.checkForUpdates();
        });
    }

    /**
     * Perform initial tasks when background script starts
     */
    performInitialTasks() {
        // Initial version check
        this.versionManager.checkForUpdates();
    }
}

// Initialize the background controller
const backgroundController = new BackgroundController();
