import { ConfigurationManager } from '../shared/config/ConfigurationManager.js';

/**
 * Popup display state: selection mode, filters, error visibility toggles.
 * Written straight to chrome.storage so the content script and the next popup
 * session read the same values.
 */
export class PopupState {
    constructor() {
        this.isActive = false;
        this.errorsVisible = true;
        this.resolvedErrorsVisible = false;
        this.selectedBreakpoint = ConfigurationManager.BREAKPOINTS.ALL;
        this.isRectMode = false;
        this.drawOpenErrors = false;
        this.drawResolvedErrors = false;
        document.body.setAttribute('data-show-resolved', this.resolvedErrorsVisible);
    }

    setActive(isActive) {
        this.isActive = isActive;
    }

    setErrorsVisible(isVisible) {
        this.errorsVisible = isVisible;
        chrome.storage.local.set({ errorsVisible: isVisible });
    }

    setSelectedBreakpoint(breakpoint) {
        this.selectedBreakpoint = breakpoint;
    }

    setResolvedErrorsVisible(isVisible) {
        this.resolvedErrorsVisible = isVisible;
        document.body.setAttribute('data-show-resolved', isVisible);
        chrome.storage.local.set({ resolvedErrorsVisible: isVisible });
    }

    setRectMode(isRectMode) {
        this.isRectMode = isRectMode;
    }

    setDrawOpenErrors(isEnabled) {
        this.drawOpenErrors = isEnabled;
    }

    setDrawResolvedErrors(isEnabled) {
        this.drawResolvedErrors = isEnabled;
    }
}
