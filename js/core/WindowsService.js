/**
 * WindowsService - Abstraction layer for Chrome Windows API
 * Provides window management functionality with error handling
 * @module WindowsService
 */

import { ErrorLogger } from '../utils/ErrorLogger.js';

export class WindowsService {
    /**
     * Get window by ID
     * @param {number} windowId - Window ID
     * @param {Object} options - Additional options (populate, etc.)
     * @returns {Promise<chrome.windows.Window|null>} Window or null
     */
    static async getWindow(windowId, options = {}) {
        if (!chrome?.windows?.get) {
            ErrorLogger.error('Chrome windows API not available', {
                context: 'WindowsService.getWindow',
            });
            return null;
        }

        try {
            const window = await chrome.windows.get(windowId, options);
            return window;
        } catch (error) {
            ErrorLogger.error('Failed to get window', { windowId, options, error });
            return null;
        }
    }

    /**
     * Create a new window
     * @param {Object} createData - Window creation data
     * @returns {Promise<chrome.windows.Window|null>} Created window or null
     */
    static async createWindow(createData) {
        if (!chrome?.windows?.create) {
            ErrorLogger.error('Chrome windows API not available', {
                context: 'WindowsService.createWindow',
            });
            return null;
        }

        try {
            const window = await chrome.windows.create(createData);
            ErrorLogger.debug('Window created successfully', { windowId: window.id });
            return window;
        } catch (error) {
            ErrorLogger.error('Failed to create window', { createData, error });
            return null;
        }
    }

    /**
     * Update a window
     * @param {number} windowId - Window ID
     * @param {Object} updateInfo - Update properties
     * @returns {Promise<chrome.windows.Window|null>} Updated window or null
     */
    static async updateWindow(windowId, updateInfo) {
        if (!chrome?.windows?.update) {
            ErrorLogger.error('Chrome windows API not available', {
                context: 'WindowsService.updateWindow',
            });
            return null;
        }

        try {
            const window = await chrome.windows.update(windowId, updateInfo);
            ErrorLogger.debug('Window updated successfully', { windowId, updateInfo });
            return window;
        } catch (error) {
            ErrorLogger.error('Failed to update window', { windowId, updateInfo, error });
            return null;
        }
    }

    /**
     * Close a window
     * @param {number} windowId - Window ID
     * @returns {Promise<boolean>} True if successful
     */
    static async closeWindow(windowId) {
        if (!chrome?.windows?.remove) {
            ErrorLogger.error('Chrome windows API not available', {
                context: 'WindowsService.closeWindow',
            });
            return false;
        }

        try {
            await chrome.windows.remove(windowId);
            ErrorLogger.debug('Window closed successfully', { windowId });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to close window', { windowId, error });
            return false;
        }
    }

    /**
     * Get all windows
     * @param {Object} options - Query options
     * @returns {Promise<chrome.windows.Window[]>} Array of windows
     */
    static async getAllWindows(options = {}) {
        if (!chrome?.windows?.getAll) {
            ErrorLogger.error('Chrome windows API not available', {
                context: 'WindowsService.getAllWindows',
            });
            return [];
        }

        try {
            const windows = await chrome.windows.getAll(options);
            return windows || [];
        } catch (error) {
            ErrorLogger.error('Failed to get all windows', { options, error });
            return [];
        }
    }

    /**
     * Get current window
     * @param {Object} options - Additional options
     * @returns {Promise<chrome.windows.Window|null>} Current window or null
     */
    static async getCurrentWindow(options = {}) {
        if (!chrome?.windows?.getCurrent) {
            ErrorLogger.error('Chrome windows API not available', {
                context: 'WindowsService.getCurrentWindow',
            });
            return null;
        }

        try {
            const window = await chrome.windows.getCurrent(options);
            return window;
        } catch (error) {
            ErrorLogger.error('Failed to get current window', { options, error });
            return null;
        }
    }
}
