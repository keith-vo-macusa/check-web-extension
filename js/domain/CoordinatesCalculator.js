/**
 * CoordinatesCalculator - Handles coordinate calculations for error markers
 * Converts between px and responsive units, handles viewport compensation
 * @module CoordinatesCalculator
 */

import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';

export class CoordinatesCalculator {
    /**
     * Constructor
     * @param {number} adminBarHeight - Height of admin bar (if present)
     */
    constructor(adminBarHeight = 0) {
        this.adminBarHeight = adminBarHeight;
    }

    /**
     * Convert pixel coordinates to responsive units
     * @param {Object} pxCoords - Pixel coordinates {left, top, width, height}
     * @returns {Object} Responsive coordinates with % and viewport units
     */
    convertPxToResponsive(pxCoords) {
        const docWidth = document.documentElement.scrollWidth;
        const docHeight = document.documentElement.scrollHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        return {
            left: (pxCoords.left / docWidth) * 100, // % of document width
            top: (pxCoords.top / docHeight) * 100, // % of document height
            width: (pxCoords.width / viewportWidth) * 100, // vw
            height: (pxCoords.height / viewportHeight) * 100, // vh
            units: {
                left: '%',
                top: '%',
                width: 'vw',
                height: 'vh',
            },
        };
    }

    /**
     * Convert responsive coordinates to pixels
     * @param {Object} responsiveCoords - Responsive coordinates
     * @returns {Object} Pixel coordinates
     */
    convertResponsiveToPx(responsiveCoords) {
        const docWidth = document.documentElement.scrollWidth;
        const docHeight = document.documentElement.scrollHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        return {
            left: (responsiveCoords.left / 100) * docWidth,
            top: (responsiveCoords.top / 100) * docHeight,
            width: (responsiveCoords.width / 100) * viewportWidth,
            height: (responsiveCoords.height / 100) * viewportHeight,
        };
    }

    /**
     * Get element position relative to document
     * @param {HTMLElement} element - Target element
     * @returns {Object} Position {top, left, width, height}
     */
    getElementPosition(element) {
        const rect = element.getBoundingClientRect();
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

        return {
            top: rect.top + scrollY - this.adminBarHeight,
            left: rect.left + scrollX,
            width: rect.width,
            height: rect.height,
        };
    }

    /**
     * Clamp coordinates within viewport bounds
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {Object} Clamped {x, y}
     */
    clampToViewport(x, y) {
        const doc = document.documentElement;
        const scrollLeft = window.pageXOffset || doc.scrollLeft;
        const scrollTop = window.pageYOffset || doc.scrollTop;

        const maxX = scrollLeft + doc.clientWidth - 2;
        const maxY = scrollTop + doc.clientHeight - 2;
        const minX = scrollLeft;
        const minY = scrollTop;

        return {
            x: Math.max(minX, Math.min(x, maxX)),
            y: Math.max(minY, Math.min(y, maxY)),
        };
    }

    /**
     * Calculate drag rectangle coordinates
     * @param {number} startX - Start X coordinate
     * @param {number} startY - Start Y coordinate
     * @param {number} currentX - Current X coordinate
     * @param {number} currentY - Current Y coordinate
     * @returns {Object} Rectangle {left, top, width, height}
     */
    calculateDragRect(startX, startY, currentX, currentY) {
        return {
            left: Math.min(startX, currentX),
            top: Math.min(startY, currentY),
            width: Math.abs(currentX - startX),
            height: Math.abs(currentY - startY),
        };
    }

    /**
     * Create combined coordinate object with px and responsive values
     * @param {Object} dragRect - Drag rectangle from DOM
     * @returns {Object} Combined coordinates
     */
    createCombinedCoordinates(dragRect) {
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

        const pxRect = {
            left: dragRect.left + scrollX,
            top: dragRect.top + scrollY,
            width: dragRect.width,
            height: dragRect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            scrollX: scrollX,
            scrollY: scrollY,
        };

        const responsiveRect = this.convertPxToResponsive(pxRect);

        return {
            ...pxRect,
            responsive: responsiveRect,
        };
    }

    /**
     * Check if popup window based on viewport characteristics
     * @returns {boolean} True if likely a popup window
     */
    isPopupWindow() {
        try {
            const hasOpener = window.opener !== null;
            const isSmallWindow =
                window.outerWidth < screen.availWidth * 0.8 ||
                window.outerHeight < screen.availHeight * 0.8;
            const hasLimitedToolbar = !window.menubar?.visible || !window.toolbar?.visible;

            return hasOpener || isSmallWindow || hasLimitedToolbar;
        } catch (error) {
            ErrorLogger.warn('Failed to detect popup window', { error });
            return false;
        }
    }

    /**
     * Check if coordinates were saved in popup window
     * @param {Object} coords - Coordinate object
     * @returns {boolean} True if likely saved in popup
     */
    wasCoordinateSavedInPopup(coords) {
        if (!coords.viewportWidth || !coords.viewportHeight) {
            return false;
        }

        const isSmallViewport = coords.viewportWidth < 1200 || coords.viewportHeight < 600;
        const isTypicalPopupSize = coords.viewportWidth <= 500 && coords.viewportHeight <= 700;

        return isSmallViewport || isTypicalPopupSize;
    }

    /**
     * Check if error should be shown based on breakpoint
     * @param {Object} error - Error object with breakpoint info
     * @returns {boolean} True if should show
     */
    shouldShowErrorAtCurrentBreakpoint(error) {
        if (!error.breakpoint) {
            return false;
        }

        const currentWidth = window.innerWidth;
        const savedWidth = error.breakpoint.width;
        const breakpointType = error.breakpoint.type;

        const isMatchingWidth =
            Math.abs(savedWidth - currentWidth) <= ConfigurationManager.UI.RANGE_BREAKPOINT_PX;
        const isDesktopMatch =
            breakpointType === ConfigurationManager.BREAKPOINTS.DESKTOP &&
            currentWidth >= ConfigurationManager.UI.DESKTOP_BREAKPOINT_PX;

        return isMatchingWidth || isDesktopMatch;
    }

    /**
     * Calculate z-index based on DOM depth
     * @param {HTMLElement} element - Target element
     * @returns {number} Calculated z-index
     */
    calculateZIndex(element) {
        let depth = 0;
        let parent = element.parentElement;

        while (parent) {
            depth++;
            parent = parent.parentElement;
        }

        const baseZIndex = 251001;
        return baseZIndex + depth;
    }
}
