import { ConfigurationManager } from './js/config/ConfigurationManager.js';
import { ErrorLogger } from './js/utils/ErrorLogger.js';
import { StorageService } from './js/core/StorageService.js';
import { MessagingService } from './js/core/MessagingService.js';
import { CoordinatesCalculator } from './js/domain/CoordinatesCalculator.js';
import { SelectionHandler } from './js/domain/SelectionHandler.js';
import { ErrorRenderer } from './js/domain/ErrorRenderer.js';
import { CommentThreadManager } from './js/domain/CommentThreadManager.js';
import { ErrorDataManager } from './js/domain/ErrorDataManager.js';

export default class WebsiteTestingAssistant {
    /**
     * Initialize extension runtime for current webpage.
     */
    constructor() {
        this.currentUrl = window.location.href;
        this.domainName = window.location.hostname;
        this.userInfo = null;
        this.hasAdminBar = false;
        this.adminBarHeight = 0;

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

        this.drawOpenErrors = false;
        this.drawResolvedErrors = false;
        this.allErrorsVisible = false;
        this.init();
    }

    async init() {
        try {
            this.userInfo = await this.getUserInfo();
            if (!this.userInfo) {
                ErrorLogger.info('User not authenticated, skipping initialization');
                return;
            }

            await this.checkAdminBar();
            await this.errorDataManager.fetchErrors();
            this.setupEventListeners();
            await this.initializeUISettings();
            this.displayExistingErrors();
            ErrorLogger.info('WebsiteTestingAssistant initialized successfully');
        } catch (error) {
            ErrorLogger.error('Failed to initialize', { error });
        }
    }

    async checkAdminBar() {
        const adminBarElement = document.getElementById('wpadminbar');
        if (adminBarElement) {
            this.hasAdminBar = true;
            this.adminBarHeight = adminBarElement.offsetHeight;
            this.coordsCalculator.adminBarHeight = this.adminBarHeight;
            ErrorLogger.debug('Admin bar detected', { height: this.adminBarHeight });
        }
    }

    setupEventListeners() {
        MessagingService.addListener(this.handleMessage.bind(this));
        window.addEventListener('resize', () => this.handleResize());
        window.addEventListener('scroll', () => this.handleScroll());
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.errorRenderer.updateAllErrorBorders(
                    this.errorDataManager.getCurrentTabErrors(),
                );
            });
            this.resizeObserver.observe(document.body);
        }
        window.addEventListener('keydown', (event) => this.handleKeyboardShortcut(event));
    }

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
                sendResponse({ isActive: this.selectionHandler.getState().isActive });
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
                return true;
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

    async handleKeyboardShortcut(event) {
        const activeElement = document.activeElement;
        if (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        ) {
            return;
        }

        if (event.shiftKey && event.key.toLowerCase() === 'w') {
            this.selectionHandler.getState().isActive ? this.deactivate() : this.activate();
            event.preventDefault();
        }

        if (event.shiftKey && event.key.toLowerCase() === 'e') {
            this.allErrorsVisible ? this.hideAllErrors() : this.showAllErrors();
            await StorageService.set({
                [ConfigurationManager.STORAGE_KEYS.ERRORS_VISIBLE]: this.allErrorsVisible,
            });
            event.preventDefault();
        }
    }

    activate() {
        this.selectionHandler.activate();
        ErrorLogger.info('Selection mode activated');
    }

    deactivate(reason = null) {
        this.selectionHandler.deactivate();
        if (reason === 'logout') this.logout();
        ErrorLogger.info('Selection mode deactivated', { reason });
    }

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
            () => {},
        );
    }

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

    handleErrorClick(errorData, borderElement) {
        this.commentThreadManager.showCommentThread(errorData, borderElement);
    }

    async handleCommentAdded(errorData, comment) {
        await this.errorDataManager.addComment(errorData, comment);
    }

    async handleCommentEdited(errorData, commentId, commentText) {
        await this.errorDataManager.editComment(errorData, commentId, commentText);
    }

    async handleCommentDeleted(errorData, commentId) {
        await this.errorDataManager.deleteComment(errorData, commentId);
    }

    async handleErrorStatusToggled(errorData) {
        await this.errorDataManager.toggleErrorStatus(errorData);
        this.errorRenderer.updateAllErrorBorders(this.errorDataManager.getCurrentTabErrors());
    }

    async handleErrorDeleted(errorData) {
        await this.errorDataManager.deleteError(errorData.id);
        this.errorRenderer.removeErrorBorder(errorData.id);
    }

    async reportError({ comment, type, element = null, coordinates = null }) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const errorData = {
                id: this.errorDataManager.generateUUID(),
                type,
                timestamp: Date.now(),
                breakpoint: {
                    type: ConfigurationManager.getBreakpointType(viewportWidth),
                    width: viewportWidth,
                    height: viewportHeight,
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

        if (type === ConfigurationManager.ERROR_TYPES.BORDER) {
            errorData.elementIdentifiers = { xpath: window.getElementXPath(element) };
        } else if (type === ConfigurationManager.ERROR_TYPES.RECT) {
            errorData.coordinates = coordinates;
        }

        if (await this.errorDataManager.addError(errorData)) {
            this.errorRenderer.createErrorOverlay(errorData);
            ErrorLogger.info('Error reported successfully', { errorId: errorData.id, type });
        }
    }

    displayExistingErrors() {
        const currentTabErrors = this.errorDataManager.getCurrentTabErrors();
        currentTabErrors.forEach((errorData) => {
            this.errorRenderer.createErrorOverlay(errorData);
        });
        this.updateErrorVisibility();
        ErrorLogger.info('Existing errors displayed', { count: currentTabErrors.length });
    }

    showAllErrors() {
        this.allErrorsVisible = true;
        this.updateErrorVisibility();
        this.errorRenderer.updateAllErrorBorders(this.errorDataManager.getCurrentTabErrors());
    }

    hideAllErrors() {
        this.allErrorsVisible = false;
        this.updateErrorVisibility();
    }

    updateErrorVisibility() {
        this.errorRenderer.toggleErrorsVisibility(this.allErrorsVisible);
        this.errorRenderer.toggleOpenErrorsVisibility(this.drawOpenErrors);
        this.errorRenderer.toggleResolvedErrorsVisibility(this.drawResolvedErrors);
    }

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

    async clearAllErrors() {
        await this.errorDataManager.clearAllErrors();
        this.errorRenderer.removeAllErrorBorders();
        this.commentThreadManager.closeCommentThread();
        ErrorLogger.info('All errors cleared');
    }

    async removeError(errorId) {
        await this.errorDataManager.deleteError(errorId);
        this.errorRenderer.removeErrorBorder(errorId);
        this.commentThreadManager.closeCommentThread();
    }

    async toggleErrorStatus(errorId) {
        const currentTabErrors = this.errorDataManager.getCurrentTabErrors();
        const targetError = currentTabErrors.find((error) => error.id === errorId);
        if (targetError) {
            await this.errorDataManager.toggleErrorStatus(targetError);
            this.errorRenderer.updateAllErrorBorders(currentTabErrors);
        }
    }

    async refreshErrors() {
        this.errorRenderer.removeAllErrorBorders();
        await this.errorDataManager.fetchErrors();
        this.displayExistingErrors();
    }

    handleResize() {
        this.errorRenderer.updateAllErrorBorders(this.errorDataManager.getCurrentTabErrors());
    }

    handleScroll() {
        this.errorRenderer.updateAllErrorBorders(this.errorDataManager.getCurrentTabErrors());
    }

    async getUserInfo() {
        try {
            const storage = await StorageService.get(ConfigurationManager.STORAGE_KEYS.USER_INFO);
            return storage[ConfigurationManager.STORAGE_KEYS.USER_INFO] || null;
        } catch (error) {
            ErrorLogger.error('Failed to get user info', { error });
            return null;
        }
    }

    logout() {
        this.errorRenderer.removeAllErrorBorders();
        this.commentThreadManager.closeCommentThread();
        this.commentThreadManager.closeCommentInputModal();
        this.hideAllErrors();
        ErrorLogger.info('User logged out, cleanup complete');
    }
}
