import { ErrorLogger } from '../utils/ErrorLogger.js';

export class WindowsService {
    /**
     * Get a browser window by id.
     */
    static async getWindow(windowId, options = {}) {
        if (!chrome?.windows?.get)
            return (
                ErrorLogger.error('Chrome windows API not available', {
                    context: 'WindowsService.getWindow',
                }),
                null
            );

        try {
            return await chrome.windows.get(windowId, options);
        } catch (error) {
            return (
                ErrorLogger.error('Failed to get window', { windowId, options, error }),
                null
            );
        }
    }

    /**
     * Create a new browser window.
     */
    static async createWindow(createData) {
        if (!chrome?.windows?.create)
            return (
                ErrorLogger.error('Chrome windows API not available', {
                    context: 'WindowsService.createWindow',
                }),
                null
            );

        try {
            const createdWindow = await chrome.windows.create(createData);
            return (
                ErrorLogger.debug('Window created successfully', { windowId: createdWindow.id }),
                createdWindow
            );
        } catch (error) {
            return (
                ErrorLogger.error('Failed to create window', { createData, error }),
                null
            );
        }
    }

    /**
     * Update an existing browser window.
     */
    static async updateWindow(windowId, updateInfo) {
        if (!chrome?.windows?.update)
            return (
                ErrorLogger.error('Chrome windows API not available', {
                    context: 'WindowsService.updateWindow',
                }),
                null
            );

        try {
            const updatedWindow = await chrome.windows.update(windowId, updateInfo);
            return (
                ErrorLogger.debug('Window updated successfully', { windowId, updateInfo }),
                updatedWindow
            );
        } catch (error) {
            return (
                ErrorLogger.error('Failed to update window', {
                    windowId,
                    updateInfo,
                    error,
                }),
                null
            );
        }
    }

    /**
     * Close a browser window by id.
     */
    static async closeWindow(windowId) {
        if (!chrome?.windows?.remove)
            return (
                ErrorLogger.error('Chrome windows API not available', {
                    context: 'WindowsService.closeWindow',
                }),
                false
            );

        try {
            await chrome.windows.remove(windowId);
            ErrorLogger.debug('Window closed successfully', { windowId });
            return true;
        } catch (error) {
            return (ErrorLogger.error('Failed to close window', { windowId, error }), false);
        }
    }

    /**
     * Get all browser windows.
     */
    static async getAllWindows(options = {}) {
        if (!chrome?.windows?.getAll)
            return (
                ErrorLogger.error('Chrome windows API not available', {
                    context: 'WindowsService.getAllWindows',
                }),
                []
            );

        try {
            return (await chrome.windows.getAll(options)) || [];
        } catch (error) {
            return (ErrorLogger.error('Failed to get all windows', { options, error }), []);
        }
    }

    /**
     * Get the current browser window.
     */
    static async getCurrentWindow(options = {}) {
        if (!chrome?.windows?.getCurrent)
            return (
                ErrorLogger.error('Chrome windows API not available', {
                    context: 'WindowsService.getCurrentWindow',
                }),
                null
            );

        try {
            return await chrome.windows.getCurrent(options);
        } catch (error) {
            return (
                ErrorLogger.error('Failed to get current window', { options, error }),
                null
            );
        }
    }
}
