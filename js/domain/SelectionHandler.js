import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { CoordinatesCalculator } from './CoordinatesCalculator.js';

export class SelectionHandler {
    /**
     * @param {Function} onElementSelected Callback for single element selection.
     * @param {Function} onRectSelected Callback for drag-rectangle selection.
     * @param {CoordinatesCalculator} coordsCalculator
     */
    constructor(onElementSelected, onRectSelected, coordsCalculator) {
        this.onElementSelected = onElementSelected;
        this.onRectSelected = onRectSelected;
        this.coordsCalculator = coordsCalculator;
        this.isActive = false;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.selectedElement = null;
        this.dragOverlay = null;
        this.boundHandlers = {};
    }

    /**
     * Enable selection mode and bind document events.
     */
    activate() {
        if (this.isActive) return;

        this.isActive = true;
        this.boundHandlers.mouseDown = this.handleMouseDown.bind(this);
        this.boundHandlers.mouseMove = this.handleMouseMove.bind(this);
        this.boundHandlers.mouseUp = this.handleMouseUp.bind(this);
        this.boundHandlers.mouseOver = this.handleMouseOver.bind(this);
        this.boundHandlers.mouseOut = this.handleMouseOut.bind(this);
        this.boundHandlers.click = this.preventLinkClick.bind(this);

        document.addEventListener('mousedown', this.boundHandlers.mouseDown, true);
        document.addEventListener('mouseover', this.boundHandlers.mouseOver, true);
        document.addEventListener('mouseout', this.boundHandlers.mouseOut, true);
        document.addEventListener('click', this.boundHandlers.click, true);
        document.body.classList.add(ConfigurationManager.CSS_CLASSES.SELECTION_MODE);
        ErrorLogger.debug('Selection mode activated');
    }

    /**
     * Disable selection mode and remove listeners.
     */
    deactivate() {
        if (!this.isActive) return;

        this.isActive = false;
        document.removeEventListener('mousedown', this.boundHandlers.mouseDown, true);
        document.removeEventListener('mouseover', this.boundHandlers.mouseOver, true);
        document.removeEventListener('mouseout', this.boundHandlers.mouseOut, true);
        document.removeEventListener('click', this.boundHandlers.click, true);

        if (this.boundHandlers.mouseMove) {
            document.removeEventListener('mousemove', this.boundHandlers.mouseMove, true);
        }
        if (this.boundHandlers.mouseUp) {
            document.removeEventListener('mouseup', this.boundHandlers.mouseUp, true);
        }

        document.body.classList.remove(ConfigurationManager.CSS_CLASSES.SELECTION_MODE);
        this.removeHighlight();
        this.cleanupDrag();
        ErrorLogger.debug('Selection mode deactivated');
    }

    /**
     * Highlight hovered selectable element.
     */
    handleMouseOver(event) {
        if (!this.isActive || this.isDragging) return;
        if (!event.target.closest('.elementor-element')) return;

        event.stopPropagation();
        const targetElement = this.getTargetElement(event.target);
        this.removeHighlight();
        targetElement.classList.add(ConfigurationManager.CSS_CLASSES.HIGHLIGHT);
        this.selectedElement = targetElement;
    }

    /**
     * Remove hover highlight when cursor leaves element.
     */
    handleMouseOut(event) {
        if (!this.isActive || this.isDragging) return;
        event.stopPropagation();
        this.getTargetElement(event.target).classList.remove(
            ConfigurationManager.CSS_CLASSES.HIGHLIGHT,
        );
    }

    /**
     * Start potential drag operation on left mouse down.
     */
    handleMouseDown(event) {
        if (!this.isActive || event.button !== 0) return;
        if (!event.target.closest('.elementor-element')) return;

        event.preventDefault();
        event.stopPropagation();
        this.isDragging = false;

        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        this.startX = event.clientX + scrollX;
        this.startY = event.clientY + scrollY;
        this.selectedElement = this.getTargetElement(event.target);

        document.addEventListener('mousemove', this.boundHandlers.mouseMove, true);
        document.addEventListener('mouseup', this.boundHandlers.mouseUp, true);
    }

    /**
     * Track drag operation and update drag rectangle.
     */
    handleMouseMove(event) {
        if (!this.isActive) return;

        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        let currentX = event.clientX + scrollX;
        let currentY = event.clientY + scrollY;

        const clampedPoint = this.coordsCalculator.clampToViewport(currentX, currentY);
        currentX = clampedPoint.x;
        currentY = clampedPoint.y;

        const deltaX = Math.abs(currentX - this.startX);
        const deltaY = Math.abs(currentY - this.startY);
        const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (dragDistance > ConfigurationManager.UI.DRAG_THRESHOLD_PX && !this.isDragging) {
            this.isDragging = true;
            this.removeHighlight();
            this.createDragOverlay();
        }

        if (this.isDragging) this.updateDragOverlay(currentX, currentY);
    }

    /**
     * Complete selection behavior on mouse up.
     */
    handleMouseUp() {
        if (!this.isActive) return;

        document.removeEventListener('mousemove', this.boundHandlers.mouseMove, true);
        document.removeEventListener('mouseup', this.boundHandlers.mouseUp, true);

        if (this.isDragging) {
            this.finalizeDragSelection();
        } else if (this.selectedElement && this.onElementSelected) {
            this.onElementSelected(this.selectedElement);
        }

        this.cleanupDrag();
    }

    /**
     * Prevent page navigation while selection mode is enabled.
     */
    preventLinkClick(event) {
        if (!this.isActive) return;
        const ignoredAreaSelector = [
            '.testing-comment-thread',
            '.testing-comment-modal',
            '.testing-modal-backdrop',
            '.testing-error-border',
            '.testing-error-marker',
        ].join(', ');

        if (event.target.closest(ignoredAreaSelector)) return;
        const link = event.target.closest('a');
        if (link) {
            if (link.closest(ignoredAreaSelector)) return;
            event.preventDefault();
            event.stopPropagation();
        }
    }

    /**
     * Resolve target element, excluding extension UI overlays.
     */
    getTargetElement(target) {
        const ignoredSelectors = [
            '.testing-error-marker',
            '.testing-comment-thread',
            '.testing-comment-modal',
            '.testing-error-border',
        ].join(', ');
        return target.closest(ignoredSelectors) ? document.body : target;
    }

    /**
     * Create drag overlay element.
     */
    createDragOverlay() {
        this.dragOverlay = document.createElement('div');
        this.dragOverlay.className = ConfigurationManager.CSS_CLASSES.DRAG_OVERLAY;
        document.body.appendChild(this.dragOverlay);
    }

    /**
     * Update drag overlay bounds.
     */
    updateDragOverlay(currentX, currentY) {
        if (!this.dragOverlay) return;
        const dragRect = this.coordsCalculator.calculateDragRect(
            this.startX,
            this.startY,
            currentX,
            currentY,
        );
        this.dragOverlay.style.left = `${dragRect.left}px`;
        this.dragOverlay.style.top = `${dragRect.top}px`;
        this.dragOverlay.style.width = `${dragRect.width}px`;
        this.dragOverlay.style.height = `${dragRect.height}px`;
    }

    /**
     * Finalize rectangle selection and emit callback if valid.
     */
    finalizeDragSelection() {
        if (!this.dragOverlay) return;
        const rect = this.dragOverlay.getBoundingClientRect();
        if (
            rect.width < ConfigurationManager.UI.MIN_RECT_SIZE_PX ||
            rect.height < ConfigurationManager.UI.MIN_RECT_SIZE_PX
        )
            return;

        const coordinates = this.coordsCalculator.createCombinedCoordinates(rect);
        if (this.onRectSelected) this.onRectSelected(coordinates);
    }

    /**
     * Reset drag state and remove drag overlay.
     */
    cleanupDrag() {
        this.isDragging = false;
        if (this.dragOverlay) {
            this.dragOverlay.remove();
            this.dragOverlay = null;
        }
    }

    /**
     * Remove all hover highlight classes from page.
     */
    removeHighlight() {
        document
            .querySelectorAll(`.${ConfigurationManager.CSS_CLASSES.HIGHLIGHT}`)
            .forEach((element) => element.classList.remove(ConfigurationManager.CSS_CLASSES.HIGHLIGHT));
    }

    /**
     * Read current selection state for diagnostics.
     */
    getState() {
        return {
            isActive: this.isActive,
            isDragging: this.isDragging,
            selectedElement: this.selectedElement,
        };
    }
}
