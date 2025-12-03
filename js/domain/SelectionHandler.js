/**
 * SelectionHandler - Handles user selection of error regions
 * Manages mouse events, drag detection, and element highlighting
 * @module SelectionHandler
 */

import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { CoordinatesCalculator } from './CoordinatesCalculator.js';

export class SelectionHandler {
    /**
     * Constructor
     * @param {Function} onElementSelected - Callback when element is selected
     * @param {Function} onRectSelected - Callback when rectangle is drawn
     * @param {CoordinatesCalculator} coordsCalculator - Coordinates calculator instance
     */
    constructor(onElementSelected, onRectSelected, coordsCalculator) {
        this.onElementSelected = onElementSelected;
        this.onRectSelected = onRectSelected;
        this.coordsCalculator = coordsCalculator;

        // State
        this.isActive = false;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.selectedElement = null;
        this.dragOverlay = null;

        // Bound event handlers (for proper removal)
        this.boundHandlers = {};
    }

    /**
     * Activate selection mode
     */
    activate() {
        if (this.isActive) {
            return;
        }

        this.isActive = true;

        // Bind event handlers
        this.boundHandlers.mouseDown = this.handleMouseDown.bind(this);
        this.boundHandlers.mouseMove = this.handleMouseMove.bind(this);
        this.boundHandlers.mouseUp = this.handleMouseUp.bind(this);
        this.boundHandlers.mouseOver = this.handleMouseOver.bind(this);
        this.boundHandlers.mouseOut = this.handleMouseOut.bind(this);
        this.boundHandlers.click = this.preventLinkClick.bind(this);

        // Add event listeners
        document.addEventListener('mousedown', this.boundHandlers.mouseDown, true);
        document.addEventListener('mouseover', this.boundHandlers.mouseOver, true);
        document.addEventListener('mouseout', this.boundHandlers.mouseOut, true);
        document.addEventListener('click', this.boundHandlers.click, true);

        // Add visual indicator
        document.body.classList.add(ConfigurationManager.CSS_CLASSES.SELECTION_MODE);

        ErrorLogger.debug('Selection mode activated');
    }

    /**
     * Deactivate selection mode
     */
    deactivate() {
        if (!this.isActive) {
            return;
        }

        this.isActive = false;

        // Remove event listeners
        document.removeEventListener('mousedown', this.boundHandlers.mouseDown, true);
        document.removeEventListener('mouseover', this.boundHandlers.mouseOver, true);
        document.removeEventListener('mouseout', this.boundHandlers.mouseOut, true);
        document.removeEventListener('click', this.boundHandlers.click, true);

        // Remove dynamic listeners if they exist
        if (this.boundHandlers.mouseMove) {
            document.removeEventListener('mousemove', this.boundHandlers.mouseMove, true);
        }
        if (this.boundHandlers.mouseUp) {
            document.removeEventListener('mouseup', this.boundHandlers.mouseUp, true);
        }

        // Remove visual indicators
        document.body.classList.remove(ConfigurationManager.CSS_CLASSES.SELECTION_MODE);
        this.removeHighlight();
        this.cleanupDrag();

        ErrorLogger.debug('Selection mode deactivated');
    }

    /**
     * Handle mouse over event
     * @private
     * @param {MouseEvent} event - Mouse event
     */
    handleMouseOver(event) {
        if (!this.isActive || this.isDragging) {
            return;
        }

        // Only handle elementor elements (or remove this filter for all elements)
        if (!event.target.closest('.elementor-element')) {
            return;
        }

        event.stopPropagation();

        const targetElement = this.getTargetElement(event.target);
        this.removeHighlight();
        targetElement.classList.add(ConfigurationManager.CSS_CLASSES.HIGHLIGHT);
        this.selectedElement = targetElement;
    }

    /**
     * Handle mouse out event
     * @private
     * @param {MouseEvent} event - Mouse event
     */
    handleMouseOut(event) {
        if (!this.isActive || this.isDragging) {
            return;
        }

        event.stopPropagation();

        const targetElement = this.getTargetElement(event.target);
        targetElement.classList.remove(ConfigurationManager.CSS_CLASSES.HIGHLIGHT);
    }

    /**
     * Handle mouse down event
     * @private
     * @param {MouseEvent} event - Mouse event
     */
    handleMouseDown(event) {
        if (!this.isActive || event.button !== 0) {
            return;
        }

        // Only handle elementor elements (or remove this filter for all elements)
        if (!event.target.closest('.elementor-element')) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.isDragging = false;

        // Store initial coordinates relative to document
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        this.startX = event.clientX + scrollLeft;
        this.startY = event.clientY + scrollTop;
        this.selectedElement = this.getTargetElement(event.target);

        // Add temporary listeners for mouse move and up
        document.addEventListener('mousemove', this.boundHandlers.mouseMove, true);
        document.addEventListener('mouseup', this.boundHandlers.mouseUp, true);
    }

    /**
     * Handle mouse move event
     * @private
     * @param {MouseEvent} event - Mouse event
     */
    handleMouseMove(event) {
        if (!this.isActive) {
            return;
        }

        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        let currentX = event.clientX + scrollLeft;
        let currentY = event.clientY + scrollTop;

        // Clamp coordinates to viewport
        const clamped = this.coordsCalculator.clampToViewport(currentX, currentY);
        currentX = clamped.x;
        currentY = clamped.y;

        // Calculate distance from start
        const deltaX = Math.abs(currentX - this.startX);
        const deltaY = Math.abs(currentY - this.startY);
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Start dragging if moved beyond threshold
        if (distance > ConfigurationManager.UI.DRAG_THRESHOLD_PX && !this.isDragging) {
            this.isDragging = true;
            this.removeHighlight();
            this.createDragOverlay();
        }

        if (this.isDragging) {
            this.updateDragOverlay(currentX, currentY);
        }
    }

    /**
     * Handle mouse up event
     * @private
     * @param {MouseEvent} event - Mouse event
     */
    handleMouseUp(event) {
        if (!this.isActive) {
            return;
        }

        // Remove temporary listeners
        document.removeEventListener('mousemove', this.boundHandlers.mouseMove, true);
        document.removeEventListener('mouseup', this.boundHandlers.mouseUp, true);

        if (this.isDragging) {
            // Rectangle selection
            this.finalizeDragSelection();
        } else {
            // Simple click - element selection
            if (this.selectedElement && this.onElementSelected) {
                this.onElementSelected(this.selectedElement);
            }
        }

        this.cleanupDrag();
    }

    /**
     * Prevent link clicks during selection
     * @private
     * @param {MouseEvent} event - Mouse event
     */
    preventLinkClick(event) {
        if (!this.isActive) {
            return;
        }

        const linkElement = event.target.closest('a');
        if (linkElement) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    /**
     * Get actual target element (skip extension elements)
     * @private
     * @param {HTMLElement} element - Event target
     * @returns {HTMLElement} Target element
     */
    getTargetElement(element) {
        // Skip testing assistant elements
        const extensionSelectors = [
            '.testing-error-marker',
            '.testing-comment-thread',
            '.testing-comment-modal',
            '.testing-error-border',
        ].join(', ');

        if (element.closest(extensionSelectors)) {
            return document.body;
        }

        return element;
    }

    /**
     * Create drag overlay element
     * @private
     */
    createDragOverlay() {
        this.dragOverlay = document.createElement('div');
        this.dragOverlay.className = ConfigurationManager.CSS_CLASSES.DRAG_OVERLAY;
        document.body.appendChild(this.dragOverlay);
    }

    /**
     * Update drag overlay position
     * @private
     * @param {number} currentX - Current X coordinate
     * @param {number} currentY - Current Y coordinate
     */
    updateDragOverlay(currentX, currentY) {
        if (!this.dragOverlay) {
            return;
        }

        const rect = this.coordsCalculator.calculateDragRect(
            this.startX,
            this.startY,
            currentX,
            currentY,
        );

        this.dragOverlay.style.left = `${rect.left}px`;
        this.dragOverlay.style.top = `${rect.top}px`;
        this.dragOverlay.style.width = `${rect.width}px`;
        this.dragOverlay.style.height = `${rect.height}px`;
    }

    /**
     * Finalize drag selection
     * @private
     */
    finalizeDragSelection() {
        if (!this.dragOverlay) {
            return;
        }

        const dragRect = this.dragOverlay.getBoundingClientRect();

        // Only proceed if rectangle is large enough
        if (
            dragRect.width < ConfigurationManager.UI.MIN_RECT_SIZE_PX ||
            dragRect.height < ConfigurationManager.UI.MIN_RECT_SIZE_PX
        ) {
            return;
        }

        // Create combined coordinates
        const coordinates = this.coordsCalculator.createCombinedCoordinates(dragRect);

        if (this.onRectSelected) {
            this.onRectSelected(coordinates);
        }
    }

    /**
     * Cleanup drag state
     * @private
     */
    cleanupDrag() {
        this.isDragging = false;
        if (this.dragOverlay) {
            this.dragOverlay.remove();
            this.dragOverlay = null;
        }
    }

    /**
     * Remove element highlight
     * @private
     */
    removeHighlight() {
        const highlighted = document.querySelectorAll(
            `.${ConfigurationManager.CSS_CLASSES.HIGHLIGHT}`,
        );
        highlighted.forEach((el) =>
            el.classList.remove(ConfigurationManager.CSS_CLASSES.HIGHLIGHT),
        );
    }

    /**
     * Get current selection state
     * @returns {Object} Selection state
     */
    getState() {
        return {
            isActive: this.isActive,
            isDragging: this.isDragging,
            selectedElement: this.selectedElement,
        };
    }
}
