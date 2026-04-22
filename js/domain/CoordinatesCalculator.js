import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';

export class CoordinatesCalculator {
    /**
     * @param {number} adminBarHeight Height offset to subtract from top coordinates.
     */
    constructor(adminBarHeight = 0) {
        this.adminBarHeight = adminBarHeight;
    }

    /**
     * Convert absolute pixel coordinates to responsive percentages/viewport units.
     */
    convertPxToResponsive(coordinates) {
        const documentWidth = document.documentElement.scrollWidth;
        const documentHeight = document.documentElement.scrollHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        return {
            left: (coordinates.left / documentWidth) * 100,
            top: (coordinates.top / documentHeight) * 100,
            width: (coordinates.width / viewportWidth) * 100,
            height: (coordinates.height / viewportHeight) * 100,
            units: { left: '%', top: '%', width: 'vw', height: 'vh' },
        };
    }

    /**
     * Convert responsive coordinates back to pixel values.
     */
    convertResponsiveToPx(coordinates) {
        const documentWidth = document.documentElement.scrollWidth;
        const documentHeight = document.documentElement.scrollHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        return {
            left: (coordinates.left / 100) * documentWidth,
            top: (coordinates.top / 100) * documentHeight,
            width: (coordinates.width / 100) * viewportWidth,
            height: (coordinates.height / 100) * viewportHeight,
        };
    }

    /**
     * Get document-relative element bounds, adjusted by admin bar offset.
     */
    getElementPosition(element) {
        const rect = element.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        return {
            top: rect.top + scrollTop - this.adminBarHeight,
            left: rect.left + scrollLeft,
            width: rect.width,
            height: rect.height,
        };
    }

    /**
     * Clamp coordinates to visible viewport bounds.
     */
    clampToViewport(x, y) {
        const documentElement = document.documentElement;
        const viewportLeft = window.pageXOffset || documentElement.scrollLeft;
        const viewportTop = window.pageYOffset || documentElement.scrollTop;
        const viewportRight = viewportLeft + documentElement.clientWidth - 2;
        const viewportBottom = viewportTop + documentElement.clientHeight - 2;

        return {
            x: Math.max(viewportLeft, Math.min(x, viewportRight)),
            y: Math.max(viewportTop, Math.min(y, viewportBottom)),
        };
    }

    /**
     * Build rectangle from drag start and end coordinates.
     */
    calculateDragRect(startX, startY, endX, endY) {
        return {
            left: Math.min(startX, endX),
            top: Math.min(startY, endY),
            width: Math.abs(endX - startX),
            height: Math.abs(endY - startY),
        };
    }

    /**
     * Build merged coordinate payload containing absolute and responsive fields.
     */
    createCombinedCoordinates(rect) {
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        const absoluteCoordinates = {
                left: rect.left + scrollX,
                top: rect.top + scrollY,
                width: rect.width,
                height: rect.height,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                scrollX,
                scrollY,
            };
        const responsiveCoordinates = this.convertPxToResponsive(absoluteCoordinates);
        return { ...absoluteCoordinates, responsive: responsiveCoordinates };
    }

    /**
     * Detect if current document is likely a popup window.
     */
    isPopupWindow() {
        try {
            const hasOpener = window.opener !== null;
            const hasSmallWindowSize =
                    window.outerWidth < 0.8 * screen.availWidth ||
                    window.outerHeight < 0.8 * screen.availHeight;
            const hasHiddenBrowserChrome = !window.menubar?.visible || !window.toolbar?.visible;
            return hasOpener || hasSmallWindowSize || hasHiddenBrowserChrome;
        } catch (error) {
            return (ErrorLogger.warn('Failed to detect popup window', { error }), false);
        }
    }

    /**
     * Check if stored coordinates were likely captured inside popup-sized viewport.
     */
    wasCoordinateSavedInPopup(coordinates) {
        if (!coordinates.viewportWidth || !coordinates.viewportHeight) return false;
        const isSmallViewport =
            coordinates.viewportWidth < 1200 || coordinates.viewportHeight < 600;
        const isTypicalPopupViewport =
            coordinates.viewportWidth <= 500 && coordinates.viewportHeight <= 700;
        return isSmallViewport || isTypicalPopupViewport;
    }

    /**
     * Check whether error should appear for current viewport breakpoint.
     */
    shouldShowErrorAtCurrentBreakpoint(errorData) {
        if (!errorData.breakpoint) return false;
        const currentViewportWidth = window.innerWidth;
        const savedBreakpointWidth = errorData.breakpoint.width;
        const savedBreakpointType = errorData.breakpoint.type;
        const isWithinBreakpointRange =
            Math.abs(savedBreakpointWidth - currentViewportWidth) <=
            ConfigurationManager.UI.RANGE_BREAKPOINT_PX;
        const isDesktopFallbackMatch =
            savedBreakpointType === ConfigurationManager.BREAKPOINTS.DESKTOP &&
            currentViewportWidth >= ConfigurationManager.UI.DESKTOP_BREAKPOINT_PX;

        return isWithinBreakpointRange || isDesktopFallbackMatch;
    }

    /**
     * Calculate z-index based on DOM depth.
     */
    calculateZIndex(element) {
        let depth = 0;
        let parentElement = element.parentElement;

        while (parentElement) {
            depth++;
            parentElement = parentElement.parentElement;
        }

        return 251001 + depth;
    }

    /**
     * Calculate z-index by area so smaller items render above larger ones.
     */
    calculateZIndexByArea(errorData, element = null) {
        const maxArea = 2073600;
        let area = maxArea;

        if (errorData.type === 'rect' && errorData.coordinates) {
            area = (errorData.coordinates.width || 0) * (errorData.coordinates.height || 0);
        } else if (errorData.type === 'border' && element) {
            const rect = element.getBoundingClientRect();
            area = rect.width * rect.height;
        }

        const normalizedArea = Math.min(Math.max(area, 1), maxArea);
        return 251001 + Math.floor(1000 * (1 - normalizedArea / maxArea));
    }
}
