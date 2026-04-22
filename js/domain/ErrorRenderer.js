import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { CoordinatesCalculator } from './CoordinatesCalculator.js';

export class ErrorRenderer {
    /**
     * @param {CoordinatesCalculator} coordsCalculator
     * @param {Function} onErrorClick
     */
    constructor(coordsCalculator, onErrorClick) {
        this.coordsCalculator = coordsCalculator;
        this.onErrorClick = onErrorClick;
        this.errorBorders = [];
        this.container = null;
        this.errorsData = new Map();
        this.currentHoveredId = null;
        this.initializeContainer();
        this.setupMouseMoveHandler();
    }

    /**
     * Ensure overlay container exists in document.
     */
    initializeContainer() {
        this.container = document.getElementById(ConfigurationManager.UI.ERROR_CONTAINER_ID);
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = ConfigurationManager.UI.ERROR_CONTAINER_ID;
            document.body.appendChild(this.container);
        }
    }

    /**
     * Create visual overlay for one error entity.
     */
    createErrorOverlay(errorData) {
        const overlayElement = document.createElement('div');
        overlayElement.className = ConfigurationManager.CSS_CLASSES.ERROR_BORDER;
        overlayElement.dataset.errorId = errorData.id;

        let zIndex = 251001;
        let targetElement = null;

        if (errorData.type === ConfigurationManager.ERROR_TYPES.BORDER) {
            targetElement = this.findErrorElement(errorData);
            if (!targetElement) {
                ErrorLogger.warn('Cannot find element for error', { errorId: errorData.id });
                return null;
            }
        }

        this.errorsData.set(errorData.id, { error: errorData, element: targetElement });
        zIndex = this.coordsCalculator.calculateZIndexByArea(errorData, targetElement);
        overlayElement.style.zIndex = zIndex.toString();
        overlayElement.dataset.originalZIndex = zIndex.toString();

        overlayElement.addEventListener('click', (event) => {
            event.stopPropagation();
            if (this.onErrorClick) this.onErrorClick(errorData, overlayElement);
        });

        this.container.appendChild(overlayElement);
        this.errorBorders.push(overlayElement);
        this.positionErrorOverlay(overlayElement, errorData);

        ErrorLogger.debug('Error overlay created', {
            errorId: errorData.id,
            type: errorData.type,
            zIndex,
        });

        return overlayElement;
    }

    /**
     * Position and style one overlay according to error data.
     */
    positionErrorOverlay(overlayElement, errorData) {
        const isMatchingCurrentBreakpoint =
            this.coordsCalculator.shouldShowErrorAtCurrentBreakpoint(errorData);
        overlayElement.classList.remove(
            ConfigurationManager.ERROR_STATUS.OPEN,
            ConfigurationManager.ERROR_STATUS.RESOLVED,
            'match-breakpoint',
        );

        if (errorData.status === ConfigurationManager.ERROR_STATUS.RESOLVED) {
            overlayElement.classList.add(ConfigurationManager.ERROR_STATUS.RESOLVED);
        } else {
            overlayElement.classList.add(ConfigurationManager.ERROR_STATUS.OPEN);
        }

        if (!isMatchingCurrentBreakpoint) return;
        overlayElement.classList.add('match-breakpoint');
        if (errorData.type === ConfigurationManager.ERROR_TYPES.RECT) {
            this.positionRectOverlay(overlayElement, errorData);
        } else if (errorData.type === ConfigurationManager.ERROR_TYPES.BORDER) {
            this.positionBorderOverlay(overlayElement, errorData);
        }
    }

    /**
     * Position overlay for rectangle-type errors.
     */
    positionRectOverlay(overlayElement, errorData) {
        if (!errorData.coordinates) {
            ErrorLogger.warn('Error has no coordinates', { errorId: errorData.id });
            return;
        }

        const coordinates = errorData.coordinates;
        if (coordinates.responsive) {
            const pxCoordinates = this.coordsCalculator.convertResponsiveToPx(coordinates.responsive);
            overlayElement.style.left = `${pxCoordinates.left}px`;
            overlayElement.style.top = `${pxCoordinates.top - this.coordsCalculator.adminBarHeight}px`;
            overlayElement.style.width = `${pxCoordinates.width}px`;
            overlayElement.style.height = `${pxCoordinates.height}px`;
            return;
        }

        overlayElement.style.left = `${coordinates.left}px`;
        overlayElement.style.top = `${coordinates.top}px`;
        overlayElement.style.width = `${coordinates.width}px`;
        overlayElement.style.height = `${coordinates.height}px`;
    }

    /**
     * Position overlay for border-type errors by target element bounds.
     */
    positionBorderOverlay(overlayElement, errorData) {
        const targetElement = this.findErrorElement(errorData);
        if (!targetElement) {
            ErrorLogger.warn('Cannot find element for border overlay', {
                errorId: errorData.id,
            });
            return;
        }

        const position = this.coordsCalculator.getElementPosition(targetElement);
        overlayElement.style.top = `${position.top}px`;
        overlayElement.style.left = `${position.left}px`;
        overlayElement.style.width = `${position.width}px`;
        overlayElement.style.height = `${position.height}px`;
    }

    /**
     * Resolve target element using xpath or css selector identifiers.
     */
    findErrorElement(errorData) {
        if (!errorData.elementIdentifiers) return null;

        if (errorData.elementIdentifiers.xpath)
            try {
                const result = document.evaluate(
                    errorData.elementIdentifiers.xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null,
                );
                if (result.singleNodeValue) return result.singleNodeValue;
            } catch {
                ErrorLogger.warn('XPath evaluation failed', { xpath: errorData.elementIdentifiers.xpath });
            }

        if (errorData.elementIdentifiers.cssSelector)
            try {
                const element = document.querySelector(errorData.elementIdentifiers.cssSelector);
                if (element) return element;
            } catch {
                ErrorLogger.warn('CSS selector failed', {
                    selector: errorData.elementIdentifiers.cssSelector,
                });
            }

        return null;
    }

    /**
     * Reposition all overlays with latest errors list.
     */
    updateAllErrorBorders(errors) {
        this.errorBorders.forEach((overlayElement) => {
            const errorId = overlayElement.dataset.errorId;
            const errorData = errors.find((item) => item.id === errorId);
            if (errorData) this.positionErrorOverlay(overlayElement, errorData);
        });
        ErrorLogger.debug('All error borders updated', { count: this.errorBorders.length });
    }

    /**
     * Remove one overlay by error id.
     */
    removeErrorBorder(errorId) {
        const overlayElement = this.container.querySelector(`[data-error-id="${errorId}"]`);
        if (!overlayElement) return;
        overlayElement.remove();
        this.errorBorders = this.errorBorders.filter((item) => item !== overlayElement);
        ErrorLogger.debug('Error border removed', { errorId });
    }

    /**
     * Remove all rendered overlays.
     */
    removeAllErrorBorders() {
        this.errorBorders.forEach((overlayElement) => overlayElement.remove());
        this.errorBorders = [];
        ErrorLogger.debug('All error borders removed');
    }

    /**
     * Toggle open errors visibility class.
     */
    toggleOpenErrorsVisibility(isVisible) {
        if (!this.container) return;
        this.container.classList.toggle(ConfigurationManager.CSS_CLASSES.DRAW_OPEN_ERRORS, isVisible);
    }

    /**
     * Toggle resolved errors visibility class.
     */
    toggleResolvedErrorsVisibility(isVisible) {
        if (!this.container) return;
        this.container.classList.toggle(
            ConfigurationManager.CSS_CLASSES.DRAW_RESOLVED_ERRORS,
            isVisible,
        );
    }

    /**
     * Toggle global error-visibility class on body.
     */
    toggleErrorsVisibility(isVisible) {
        document.body.classList.toggle(ConfigurationManager.CSS_CLASSES.SHOW_ERROR, isVisible);
    }

    /**
     * Get overlay element by error id.
     */
    getErrorBorder(errorId) {
        return this.container.querySelector(`[data-error-id="${errorId}"]`);
    }

    /**
     * Get overlays container element.
     */
    getContainer() {
        return this.container;
    }

    /**
     * Setup throttled mouse move handling for hover behavior.
     */
    setupMouseMoveHandler() {
        let lastExecutionAt = 0;
        document.addEventListener('mousemove', (event) => {
            const now = Date.now();
            if (now - lastExecutionAt < 50) return;
            lastExecutionAt = now;
            this.handleMouseMove(event.pageX, event.pageY);
        });
    }

    /**
     * Keep smallest matching overlay highlighted under cursor.
     */
    handleMouseMove(pointerX, pointerY) {
        let nextHoveredId = null;
        let smallestArea = Infinity;

        this.errorsData.forEach((_, errorId) => {
            const overlayElement = this.getErrorBorder(errorId);
            if (!overlayElement) return;
            if (window.getComputedStyle(overlayElement).display === 'none') return;

            const rect = overlayElement.getBoundingClientRect();
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const left = rect.left + scrollLeft;
            const top = rect.top + scrollTop;
            const right = rect.left + scrollLeft + rect.width;
            const bottom = rect.top + scrollTop + rect.height;

            if (pointerX >= left && pointerX <= right && pointerY >= top && pointerY <= bottom) {
                const area = rect.width * rect.height;
                if (area < smallestArea) {
                    smallestArea = area;
                    nextHoveredId = errorId;
                }
            }
        });

        if (nextHoveredId === this.currentHoveredId) return;

        if (this.currentHoveredId) {
            const previousHovered = this.getErrorBorder(this.currentHoveredId);
            if (previousHovered) {
                previousHovered.style.zIndex = previousHovered.dataset.originalZIndex || '251001';
                previousHovered.classList.remove('testing-border-hover');
            }
        }

        if (nextHoveredId) {
            const nextHovered = this.getErrorBorder(nextHoveredId);
            if (nextHovered) {
                nextHovered.style.zIndex = '999999';
                nextHovered.classList.add('testing-border-hover');
            }
        }

        this.currentHoveredId = nextHoveredId;
    }
}
