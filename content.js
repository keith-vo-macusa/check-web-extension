/**
 * WebsiteTestingAssistant - Main content script class (Refactored)
 * Coordinates all functionality for error selection, marking, and management
 * @module WebsiteTestingAssistant
 */

import { ConfigurationManager } from './js/config/ConfigurationManager.js';
import { ErrorLogger } from './js/utils/ErrorLogger.js';
import { StorageService } from './js/core/StorageService.js';
import { MessagingService } from './js/core/MessagingService.js';
import { CoordinatesCalculator } from './js/domain/CoordinatesCalculator.js';
import { SelectionHandler } from './js/domain/SelectionHandler.js';
import { ErrorRenderer } from './js/domain/ErrorRenderer.js';
import { CommentThreadManager } from './js/domain/CommentThreadManager.js';
import { ErrorDataManager } from './js/domain/ErrorDataManager.js';

/**
 * Main WebsiteTestingAssistant class
 */
export default class WebsiteTestingAssistant {
    /**
     * Constructor
     */
    constructor() {
        // Basic state
        this.currentUrl = window.location.href;
        this.domainName = window.location.hostname;
        this.userInfo = null;
        this.hasAdminBar = false;
        this.adminBarHeight = 0;

        // Initialize domain modules
        this.coordsCalculator = new CoordinatesCalculator(this.adminBarHeight);

        this.selectionHandler = new SelectionHandler(
            this.handleElementSelected.bind(this),
            this.handleRectSelected.bind(this),
            this.coordsCalculator,
        );

        this.errorRenderer = new ErrorRenderer(
            this.coordsCalculator,
            this.handleErrorClick.bind(this),
        );

        this.commentThreadManager = new CommentThreadManager(
            this.getUserInfo.bind(this),
            this.handleCommentAdded.bind(this),
            this.handleCommentEdited.bind(this),
            this.handleCommentDeleted.bind(this),
            this.handleErrorStatusToggled.bind(this),
            this.handleErrorDeleted.bind(this),
        );

        this.errorDataManager = new ErrorDataManager(this.currentUrl, this.domainName);

        // UI state
        this.drawOpenErrors = false;
        this.drawResolvedErrors = false;
        this.allErrorsVisible = false;

        // Initialize
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            // Check user authentication
            this.userInfo = await this.getUserInfo();
            if (!this.userInfo) {
                ErrorLogger.info('User not authenticated, skipping initialization');
                return;
            }

            // Check for admin bar
            await this.checkAdminBar();

            // Fetch errors from API
            await this.errorDataManager.fetchErrors();

            // Setup event listeners
            this.setupEventListeners();

            // Initialize UI settings
            await this.initializeUISettings();

            // Display existing errors
            this.displayExistingErrors();

            ErrorLogger.info('WebsiteTestingAssistant initialized successfully');
        } catch (error) {
            ErrorLogger.error('Failed to initialize', { error });
        }
    }

    /**
     * Check for WordPress admin bar
     * @private
     */
    async checkAdminBar() {
        const adminBar = document.getElementById('wpadminbar');
        if (adminBar) {
            this.hasAdminBar = true;
            this.adminBarHeight = adminBar.offsetHeight;
            this.coordsCalculator.adminBarHeight = this.adminBarHeight;
            ErrorLogger.debug('Admin bar detected', { height: this.adminBarHeight });
        }
    }

    /**
     * Setup event listeners
     * @private
     */
    setupEventListeners() {
        // Listen for messages from popup/background
        MessagingService.addListener(this.handleMessage.bind(this));

        // Listen for window resize
        window.addEventListener('resize', () => this.handleResize());

        // Listen for scroll
        window.addEventListener('scroll', () => this.handleScroll());

        // ResizeObserver for dynamic content
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.errorRenderer.updateAllErrorBorders(
                    this.errorDataManager.getCurrentTabErrors(),
                );
            });
            this.resizeObserver.observe(document.body);
        }

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => this.handleKeyboardShortcut(e));
    }

    /**
     * Handle incoming messages
     * @private
     * @param {Object} message - Message object
     * @param {Object} sender - Sender info
     * @param {Function} sendResponse - Response callback
     * @returns {boolean} True if async response
     */
    handleMessage(message, sender, sendResponse) {
        const { action } = message;

        switch (action) {
            case ConfigurationManager.ACTIONS.ACTIVATE:
                this.activate();
                sendResponse({ success: true });
                break;

            case ConfigurationManager.ACTIONS.DEACTIVATE:
                this.deactivate(message.reason);
                sendResponse({ success: true });
                break;

            case ConfigurationManager.ACTIONS.GET_STATE:
                sendResponse({
                    isActive: this.selectionHandler.getState().isActive,
                });
                break;

            case ConfigurationManager.ACTIONS.SHOW_ALL_ERRORS:
                this.showAllErrors();
                sendResponse({ success: true });
                break;

            case ConfigurationManager.ACTIONS.HIDE_ALL_ERRORS:
                this.hideAllErrors();
                sendResponse({ success: true });
                break;

            case ConfigurationManager.ACTIONS.CLEAR_ALL_ERRORS:
                this.clearAllErrors()
                    .then(() => {
                        sendResponse({ success: true });
                    })
                    .catch((error) => {
                        sendResponse({ success: false, message: error.message });
                    });
                return true; // Async response

            case ConfigurationManager.ACTIONS.REMOVE_ERROR:
                this.removeError(message.errorId)
                    .then(() => {
                        sendResponse({ success: true });
                    })
                    .catch((error) => {
                        sendResponse({ success: false, message: error.message });
                    });
                return true;

            case ConfigurationManager.ACTIONS.CHECK_FIXED:
                this.toggleErrorStatus(message.errorId)
                    .then(() => {
                        sendResponse({ success: true });
                    })
                    .catch((error) => {
                        sendResponse({ success: false, message: error.message });
                    });
                return true;

            case ConfigurationManager.ACTIONS.DRAW_OPEN_ERRORS:
                this.drawOpenErrors = message.drawOpenErrors;
                this.errorRenderer.toggleOpenErrorsVisibility(this.drawOpenErrors);
                this.errorRenderer.updateAllErrorBorders(
                    this.errorDataManager.getCurrentTabErrors(),
                );
                sendResponse({ success: true });
                break;

            case ConfigurationManager.ACTIONS.DRAW_RESOLVED_ERRORS:
                this.drawResolvedErrors = message.drawResolvedErrors;
                this.errorRenderer.toggleResolvedErrorsVisibility(this.drawResolvedErrors);
                this.errorRenderer.updateAllErrorBorders(
                    this.errorDataManager.getCurrentTabErrors(),
                );
                sendResponse({ success: true });
                break;

            case ConfigurationManager.ACTIONS.SET_ERRORS_IN_CONTENT:
                this.refreshErrors();
                sendResponse({ success: true });
                break;

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }

        return false;
    }

    /**
     * Handle keyboard shortcuts
     * @private
     * @param {KeyboardEvent} e - Keyboard event
     */
    async handleKeyboardShortcut(e) {
        const activeElement = document.activeElement;
        const isTyping =
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable;

        if (isTyping) {
            return;
        }

        // Shift + W: Toggle selection mode
        if (e.shiftKey && e.key.toLowerCase() === 'w') {
            if (this.selectionHandler.getState().isActive) {
                this.deactivate();
            } else {
                this.activate();
            }
            e.preventDefault();
        }

        // Shift + E: Toggle errors visibility
        if (e.shiftKey && e.key.toLowerCase() === 'e') {
            if (this.allErrorsVisible) {
                this.hideAllErrors();
            } else {
                this.showAllErrors();
            }
            await StorageService.set({
                [ConfigurationManager.STORAGE_KEYS.ERRORS_VISIBLE]: this.allErrorsVisible,
            });
            e.preventDefault();
        }
    }

    /**
     * Activate selection mode
     */
    activate() {
        this.selectionHandler.activate();
        ErrorLogger.info('Selection mode activated');
    }

    /**
     * Deactivate selection mode
     * @param {string} reason - Optional reason for deactivation
     */
    deactivate(reason = null) {
        this.selectionHandler.deactivate();

        if (reason === 'logout') {
            this.logout();
        }

        ErrorLogger.info('Selection mode deactivated', { reason });
    }

    /**
     * Handle element selected
     * @private
     * @param {HTMLElement} element - Selected element
     */
    handleElementSelected(element) {
        this.commentThreadManager.showCommentInputModal(
            false,
            async (comment) => {
                await this.reportError({
                    comment,
                    type: ConfigurationManager.ERROR_TYPES.BORDER,
                    element,
                });
            },
            () => {
                // Cancel callback - do nothing
            },
        );
    }

    /**
     * Handle rectangle selected
     * @private
     * @param {Object} coordinates - Rectangle coordinates
     */
    handleRectSelected(coordinates) {
        this.selectedRect = coordinates;

        this.commentThreadManager.showCommentInputModal(
            true,
            async (comment) => {
                await this.reportError({
                    comment,
                    type: ConfigurationManager.ERROR_TYPES.RECT,
                    coordinates,
                });
                this.selectedRect = null;
            },
            () => {
                this.selectedRect = null;
            },
        );
    }

    /**
     * Handle error clicked
     * @private
     * @param {Object} error - Error object
     * @param {HTMLElement} border - Border element
     */
    handleErrorClick(error, border) {
        this.commentThreadManager.showCommentThread(error, border);
    }

    /**
     * Handle comment added
     * @private
     */
    async handleCommentAdded(error, commentText) {
        await this.errorDataManager.addComment(error, commentText);
    }

    /**
     * Handle comment edited
     * @private
     */
    async handleCommentEdited(error, commentId, newText) {
        await this.errorDataManager.editComment(error, commentId, newText);
    }

    /**
     * Handle comment deleted
     * @private
     */
    async handleCommentDeleted(error, commentId) {
        await this.errorDataManager.deleteComment(error, commentId);
    }

    /**
     * Handle error status toggled
     * @private
     */
    async handleErrorStatusToggled(error) {
        await this.errorDataManager.toggleErrorStatus(error);
        this.errorRenderer.updateAllErrorBorders(this.errorDataManager.getCurrentTabErrors());
    }

    /**
     * Handle error deleted
     * @private
     */
    async handleErrorDeleted(error) {
        await this.errorDataManager.deleteError(error.id);
        this.errorRenderer.removeErrorBorder(error.id);
    }

    /**
     * Report a new error
     * @private
     */
    async reportError({ comment, type, element = null, coordinates = null }) {
        const width = window.innerWidth;
        const height = window.innerHeight;

        const error = {
            id: this.errorDataManager.generateUUID(),
            type,
            timestamp: Date.now(),
            breakpoint: {
                type: ConfigurationManager.getBreakpointType(width),
                width,
                height,
            },
            url: this.currentUrl,
            status: ConfigurationManager.ERROR_STATUS.OPEN,
            elementIdentifiers: null,
            coordinates: null,
            comments: [
                {
                    id: this.errorDataManager.generateUUID(),
                    text: comment,
                    author: await this.getUserInfo(),
                    timestamp: Date.now(),
                    edited: false,
                    editedAt: null,
                },
            ],
        };

        // Set type-specific data
        if (type === ConfigurationManager.ERROR_TYPES.BORDER) {
            error.elementIdentifiers = {
                xpath: window.getElementXPath(element),
            };
        } else if (type === ConfigurationManager.ERROR_TYPES.RECT) {
            error.coordinates = coordinates;
        }

        // Add to data manager
        const success = await this.errorDataManager.addError(error);

        if (success) {
            // Render error overlay
            this.errorRenderer.createErrorOverlay(error);
            ErrorLogger.info('Error reported successfully', { errorId: error.id, type });
        }
    }

    /**
     * Display existing errors
     * @private
     */
    displayExistingErrors() {
        const errors = this.errorDataManager.getCurrentTabErrors();
        errors.forEach((error) => {
            this.errorRenderer.createErrorOverlay(error);
        });
        this.updateErrorVisibility();
        ErrorLogger.info('Existing errors displayed', { count: errors.length });
    }

    /**
     * Show all errors
     */
    showAllErrors() {
        this.allErrorsVisible = true;
        this.updateErrorVisibility();
        this.errorRenderer.updateAllErrorBorders(this.errorDataManager.getCurrentTabErrors());
    }

    /**
     * Hide all errors
     */
    hideAllErrors() {
        this.allErrorsVisible = false;
        this.updateErrorVisibility();
    }

    /**
     * Update error visibility based on settings
     * @private
     */
    updateErrorVisibility() {
        this.errorRenderer.toggleErrorsVisibility(this.allErrorsVisible);
        this.errorRenderer.toggleOpenErrorsVisibility(this.drawOpenErrors);
        this.errorRenderer.toggleResolvedErrorsVisibility(this.drawResolvedErrors);
    }

    /**
     * Initialize UI settings from storage
     * @private
     */
    async initializeUISettings() {
        const settings = await StorageService.get([
            ConfigurationManager.STORAGE_KEYS.DRAW_OPEN_ERRORS,
            ConfigurationManager.STORAGE_KEYS.DRAW_RESOLVED_ERRORS,
            ConfigurationManager.STORAGE_KEYS.ERRORS_VISIBLE,
        ]);

        this.drawOpenErrors = settings[ConfigurationManager.STORAGE_KEYS.DRAW_OPEN_ERRORS] || false;
        this.drawResolvedErrors =
            settings[ConfigurationManager.STORAGE_KEYS.DRAW_RESOLVED_ERRORS] || false;
        this.allErrorsVisible = settings[ConfigurationManager.STORAGE_KEYS.ERRORS_VISIBLE] || false;

        this.updateErrorVisibility();
    }

    /**
     * Clear all errors
     */
    async clearAllErrors() {
        await this.errorDataManager.clearAllErrors();
        this.errorRenderer.removeAllErrorBorders();
        this.commentThreadManager.closeCommentThread();
        ErrorLogger.info('All errors cleared');
    }

    /**
     * Remove single error
     * @param {string} errorId - Error ID to remove
     */
    async removeError(errorId) {
        await this.errorDataManager.deleteError(errorId);
        this.errorRenderer.removeErrorBorder(errorId);
        this.commentThreadManager.closeCommentThread();
    }

    /**
     * Toggle error status
     * @param {string} errorId - Error ID
     */
    async toggleErrorStatus(errorId) {
        const errors = this.errorDataManager.getCurrentTabErrors();
        const error = errors.find((e) => e.id === errorId);

        if (error) {
            await this.errorDataManager.toggleErrorStatus(error);
            this.errorRenderer.updateAllErrorBorders(errors);
        }
    }

    /**
     * Refresh errors from server
     */
    async refreshErrors() {
        this.errorRenderer.removeAllErrorBorders();
        await this.errorDataManager.fetchErrors();
        this.displayExistingErrors();
    }

    /**
     * Handle window resize
     * @private
     */
    handleResize() {
        this.errorRenderer.updateAllErrorBorders(this.errorDataManager.getCurrentTabErrors());
    }

    /**
     * Handle window scroll
     * @private
     */
    handleScroll() {
        this.errorRenderer.updateAllErrorBorders(this.errorDataManager.getCurrentTabErrors());
    }

    /**
     * Get current user info
     * @returns {Promise<Object|null>} User info or null
     */
    async getUserInfo() {
        try {
            const result = await StorageService.get(ConfigurationManager.STORAGE_KEYS.USER_INFO);
            return result[ConfigurationManager.STORAGE_KEYS.USER_INFO] || null;
        } catch (error) {
            ErrorLogger.error('Failed to get user info', { error });
            return null;
        }
    }

    /**
     * Logout and cleanup
     */
    logout() {
        this.errorRenderer.removeAllErrorBorders();
        this.commentThreadManager.closeCommentThread();
        this.commentThreadManager.closeCommentInputModal();
        this.hideAllErrors();
        ErrorLogger.info('User logged out, cleanup complete');
    }
}
