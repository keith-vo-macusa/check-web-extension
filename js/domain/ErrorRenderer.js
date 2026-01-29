/**
 * ErrorRenderer - Handles rendering of error markers and borders on the page
 * Manages error overlay display, positioning, and visibility
 * @module ErrorRenderer
 */

import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { CoordinatesCalculator } from './CoordinatesCalculator.js';

export class ErrorRenderer {
    /**
     * Constructor
     * @param {CoordinatesCalculator} coordsCalculator - Coordinates calculator instance
     * @param {Function} onErrorClick - Callback when error is clicked
     */
    constructor(coordsCalculator, onErrorClick) {
        this.coordsCalculator = coordsCalculator;
        this.onErrorClick = onErrorClick;
        this.errorBorders = []; // Array of error border elements
        this.container = null;
        this.errorsData = new Map(); // Map errorId -> {error, element}
        this.currentHoveredId = null; // Currently boosted error ID

        this.initializeContainer();
        this.setupMouseMoveHandler();
    }

    /**
     * Initialize error container
     * @private
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
     * Create error overlay for an error
     * @param {Object} error - Error object
     * @returns {HTMLElement|null} Created overlay element or null
     */
    createErrorOverlay(error) {
        const overlay = document.createElement('div');
        overlay.className = ConfigurationManager.CSS_CLASSES.ERROR_BORDER;
        overlay.dataset.errorId = error.id;

        // Calculate z-index based on area (smaller = higher z-index)
        let zIndex = 251001;
        let element = null;

        if (error.type === ConfigurationManager.ERROR_TYPES.BORDER) {
            element = this.findErrorElement(error);
            if (!element) {
                ErrorLogger.warn('Cannot find element for error', { errorId: error.id });
                return null;
            }
        }

        // Store error data for mousemove detection
        this.errorsData.set(error.id, { error, element });

        // Use area-based z-index for all error types
        zIndex = this.coordsCalculator.calculateZIndexByArea(error, element);
        overlay.style.zIndex = zIndex.toString();
        overlay.dataset.originalZIndex = zIndex.toString(); // Store original z-index

        // Add click handler
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onErrorClick) {
                this.onErrorClick(error, overlay);
            }
        });

        this.container.appendChild(overlay);
        this.errorBorders.push(overlay);

        // Position the overlay
        this.positionErrorOverlay(overlay, error);

        ErrorLogger.debug('Error overlay created', { errorId: error.id, type: error.type, zIndex });

        return overlay;
    }

    /**
     * Position error overlay based on error type
     * @param {HTMLElement} overlay - Overlay element
     * @param {Object} error - Error object
     */
    positionErrorOverlay(overlay, error) {
        const shouldShow = this.coordsCalculator.shouldShowErrorAtCurrentBreakpoint(error);

        // Reset classes
        overlay.classList.remove(
            ConfigurationManager.ERROR_STATUS.OPEN,
            ConfigurationManager.ERROR_STATUS.RESOLVED,
            'match-breakpoint',
        );

        // Set status class
        if (error.status === ConfigurationManager.ERROR_STATUS.RESOLVED) {
            overlay.classList.add(ConfigurationManager.ERROR_STATUS.RESOLVED);
        } else {
            overlay.classList.add(ConfigurationManager.ERROR_STATUS.OPEN);
        }

        if (!shouldShow) {
            return;
        }

        overlay.classList.add('match-breakpoint');

        if (error.type === ConfigurationManager.ERROR_TYPES.RECT) {
            this.positionRectOverlay(overlay, error);
        } else if (error.type === ConfigurationManager.ERROR_TYPES.BORDER) {
            this.positionBorderOverlay(overlay, error);
        }
    }

    /**
     * Position rectangle overlay
     * @private
     * @param {HTMLElement} overlay - Overlay element
     * @param {Object} error - Error object
     */
    positionRectOverlay(overlay, error) {
        if (!error.coordinates) {
            ErrorLogger.warn('Error has no coordinates', { errorId: error.id });
            return;
        }

        const coords = error.coordinates;

        // Prefer responsive coordinates if available
        if (coords.responsive) {
            const pxCoords = this.coordsCalculator.convertResponsiveToPx(coords.responsive);

            overlay.style.left = `${pxCoords.left}px`;
            overlay.style.top = `${pxCoords.top - this.coordsCalculator.adminBarHeight}px`;
            overlay.style.width = `${pxCoords.width}px`;
            overlay.style.height = `${pxCoords.height}px`;
            return;
        }

        // Fallback to legacy px coordinates
        overlay.style.left = `${coords.left}px`;
        overlay.style.top = `${coords.top}px`;
        overlay.style.width = `${coords.width}px`;
        overlay.style.height = `${coords.height}px`;
    }

    /**
     * Position border overlay around element
     * @private
     * @param {HTMLElement} overlay - Overlay element
     * @param {Object} error - Error object
     */
    positionBorderOverlay(overlay, error) {
        const element = this.findErrorElement(error);

        if (!element) {
            ErrorLogger.warn('Cannot find element for border overlay', { errorId: error.id });
            return;
        }

        const position = this.coordsCalculator.getElementPosition(element);

        overlay.style.top = `${position.top}px`;
        overlay.style.left = `${position.left}px`;
        overlay.style.width = `${position.width}px`;
        overlay.style.height = `${position.height}px`;
    }

    /**
     * Find DOM element for error using identifiers
     * @private
     * @param {Object} error - Error object
     * @returns {HTMLElement|null} Found element or null
     */
    findErrorElement(error) {
        if (!error.elementIdentifiers) {
            return null;
        }

        // Try XPath first
        if (error.elementIdentifiers.xpath) {
            try {
                const xpathResult = document.evaluate(
                    error.elementIdentifiers.xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null,
                );

                if (xpathResult.singleNodeValue) {
                    return xpathResult.singleNodeValue;
                }
            } catch (error) {
                ErrorLogger.warn('XPath evaluation failed', {
                    xpath: error.elementIdentifiers.xpath,
                });
            }
        }

        // Try CSS selector if available
        if (error.elementIdentifiers.cssSelector) {
            try {
                const element = document.querySelector(error.elementIdentifiers.cssSelector);
                if (element) {
                    return element;
                }
            } catch (error) {
                ErrorLogger.warn('CSS selector failed', {
                    selector: error.elementIdentifiers.cssSelector,
                });
            }
        }

        return null;
    }

    /**
     * Update all error borders (e.g., after resize/scroll)
     */
    updateAllErrorBorders(errors) {
        this.errorBorders.forEach((overlay) => {
            const errorId = overlay.dataset.errorId;
            const error = errors.find((e) => e.id === errorId);

            if (error) {
                this.positionErrorOverlay(overlay, error);
            }
        });

        ErrorLogger.debug('All error borders updated', { count: this.errorBorders.length });
    }

    /**
     * Remove error border by error ID
     * @param {string} errorId - Error ID
     */
    removeErrorBorder(errorId) {
        const border = this.container.querySelector(`[data-error-id="${errorId}"]`);

        if (border) {
            border.remove();
            this.errorBorders = this.errorBorders.filter((b) => b !== border);
            ErrorLogger.debug('Error border removed', { errorId });
        }
    }

    /**
     * Remove all error borders
     */
    removeAllErrorBorders() {
        this.errorBorders.forEach((border) => border.remove());
        this.errorBorders = [];
        ErrorLogger.debug('All error borders removed');
    }

    /**
     * Toggle visibility of open errors
     * @param {boolean} isVisible - Whether to show open errors
     */
    toggleOpenErrorsVisibility(isVisible) {
        if (this.container) {
            this.container.classList.toggle(
                ConfigurationManager.CSS_CLASSES.DRAW_OPEN_ERRORS,
                isVisible,
            );
        }
    }

    /**
     * Toggle visibility of resolved errors
     * @param {boolean} isVisible - Whether to show resolved errors
     */
    toggleResolvedErrorsVisibility(isVisible) {
        if (this.container) {
            this.container.classList.toggle(
                ConfigurationManager.CSS_CLASSES.DRAW_RESOLVED_ERRORS,
                isVisible,
            );
        }
    }

    /**
     * Toggle overall error visibility
     * @param {boolean} isVisible - Whether to show errors
     */
    toggleErrorsVisibility(isVisible) {
        document.body.classList.toggle(ConfigurationManager.CSS_CLASSES.SHOW_ERROR, isVisible);
    }


    /**
     * Get error border element by ID
     * @param {string} errorId - Error ID
     * @returns {HTMLElement|null} Border element or null
     */
    getErrorBorder(errorId) {
        return this.container.querySelector(`[data-error-id="${errorId}"]`);
    }

    /**
     * Get container element
     * @returns {HTMLElement} Container element
     */
    getContainer() {
        return this.container;
    }

    /**
     * Setup document-level mousemove handler for smart hover detection
     * @private
     */
    setupMouseMoveHandler() {
        // Throttle mousemove for performance
        let lastCall = 0;
        const throttleMs = 50;

        document.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastCall < throttleMs) return;
            lastCall = now;

            this.handleMouseMove(e.pageX, e.pageY);
        });
    }

    /**
     * Handle mouse move - find smallest error containing mouse and boost its z-index
     * @param {number} x - Page X coordinate
     * @param {number} y - Page Y coordinate
     */
    handleMouseMove(x, y) {
        let smallestError = null;
        let smallestArea = Infinity;

        // Find all visible errors containing the mouse point
        this.errorsData.forEach((data, errorId) => {
            const overlay = this.getErrorBorder(errorId);
            if (!overlay) return;

            // Check if overlay is visible
            const computedStyle = window.getComputedStyle(overlay);
            if (computedStyle.display === 'none') return;

            // Get overlay bounds
            const rect = overlay.getBoundingClientRect();
            const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollY = window.pageYOffset || document.documentElement.scrollTop;

            const bounds = {
                left: rect.left + scrollX,
                top: rect.top + scrollY,
                right: rect.left + scrollX + rect.width,
                bottom: rect.top + scrollY + rect.height,
            };

            // Check if mouse is inside this error
            if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
                const area = rect.width * rect.height;
                if (area < smallestArea) {
                    smallestArea = area;
                    smallestError = errorId;
                }
            }
        });

        // Update z-index boost
        if (smallestError !== this.currentHoveredId) {
            // Reset previous hovered error
            if (this.currentHoveredId) {
                const prevOverlay = this.getErrorBorder(this.currentHoveredId);
                if (prevOverlay) {
                    prevOverlay.style.zIndex = prevOverlay.dataset.originalZIndex || '251001';
                    prevOverlay.classList.remove('testing-border-hover');
                }
            }

            // Boost new smallest error
            if (smallestError) {
                const overlay = this.getErrorBorder(smallestError);
                if (overlay) {
                    overlay.style.zIndex = '999999';
                    overlay.classList.add('testing-border-hover');
                }
            }

            this.currentHoveredId = smallestError;
        }
    }
}
