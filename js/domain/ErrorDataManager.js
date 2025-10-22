/**
 * ErrorDataManager - Manages error data and API synchronization
 * Handles CRUD operations on errors, API communication, and local storage
 * @module ErrorDataManager
 */

import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { ValidationService } from '../utils/ValidationService.js';
import { MessagingService } from '../core/MessagingService.js';

export class ErrorDataManager {
    /**
     * Constructor
     * @param {string} currentUrl - Current page URL
     * @param {string} domainName - Current domain name
     */
    constructor(currentUrl, domainName) {
        this.currentUrl = currentUrl;
        this.domainName = domainName;
        this.currentTabErrors = []; // Errors for current page
    }

    /**
     * Fetch errors from API via background script
     * @returns {Promise<Object>} Error data
     */
    async fetchErrors() {
        try {
            const response = await MessagingService.sendToBackground({
                action: ConfigurationManager.ACTIONS.GET_ERRORS,
                domainName: this.domainName,
            });

            if (response?.path) {
                const pathItem = response.path.find((p) => p.full_url === this.currentUrl);
                this.currentTabErrors = pathItem ? pathItem.data : [];
                ErrorLogger.info('Errors fetched successfully', {
                    count: this.currentTabErrors.length,
                });
            }

            return response || { path: [] };
        } catch (error) {
            ErrorLogger.error('Failed to fetch errors', { error });
            return { path: [] };
        }
    }

    /**
     * Update errors to API via background script
     * @param {Object} errorsData - Complete error data structure
     * @returns {Promise<boolean>} True if successful
     */
    async updateErrors(errorsData) {
        try {
            const response = await fetch(ConfigurationManager.getApiUrl('SET_DOMAIN_DATA'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(errorsData),
            });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            // Notify background script
            await MessagingService.sendToBackground({
                action: ConfigurationManager.ACTIONS.SET_ERRORS,
                errors: errorsData,
                domainName: this.domainName,
            });

            ErrorLogger.info('Errors updated successfully');
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to update errors', { error });
            return false;
        }
    }

    /**
     * Add new error
     * @param {Object} errorData - Error object to add
     * @returns {Promise<boolean>} True if successful
     */
    async addError(errorData) {
        // Validate error data
        const validation = ValidationService.validateErrorData(errorData);
        if (!validation.valid) {
            ErrorLogger.error('Invalid error data', { error: validation.error });
            return false;
        }

        try {
            // Get current errors
            const errorsData = await this.getErrorsData();

            // Find or create path entry
            let pathIndex = errorsData.path.findIndex((p) => p.full_url === this.currentUrl);

            if (pathIndex === -1) {
                errorsData.path.push({
                    full_url: this.currentUrl,
                    data: [errorData],
                });
            } else {
                errorsData.path[pathIndex].data.push(errorData);
            }

            // Update API
            const success = await this.updateErrors(errorsData);

            if (success) {
                this.currentTabErrors.push(errorData);
                ErrorLogger.info('Error added successfully', { errorId: errorData.id });
            }

            return success;
        } catch (error) {
            ErrorLogger.error('Failed to add error', { error });
            return false;
        }
    }

    /**
     * Update existing error
     * @param {Object} updatedError - Updated error object
     * @returns {Promise<boolean>} True if successful
     */
    async updateError(updatedError) {
        try {
            const errorsData = await this.getErrorsData();

            // Find and update error
            let found = false;
            for (const pathItem of errorsData.path) {
                const errorIndex = pathItem.data.findIndex((e) => e.id === updatedError.id);
                if (errorIndex !== -1) {
                    pathItem.data[errorIndex] = updatedError;
                    found = true;
                    break;
                }
            }

            if (!found) {
                ErrorLogger.warn('Error not found for update', { errorId: updatedError.id });
                return false;
            }

            // Update API
            const success = await this.updateErrors(errorsData);

            if (success) {
                // Update local cache
                const localIndex = this.currentTabErrors.findIndex((e) => e.id === updatedError.id);
                if (localIndex !== -1) {
                    this.currentTabErrors[localIndex] = updatedError;
                }
                ErrorLogger.info('Error updated successfully', { errorId: updatedError.id });
            }

            return success;
        } catch (error) {
            ErrorLogger.error('Failed to update error', { error });
            return false;
        }
    }

    /**
     * Delete error by ID
     * @param {string} errorId - Error ID to delete
     * @returns {Promise<boolean>} True if successful
     */
    async deleteError(errorId) {
        try {
            const errorsData = await this.getErrorsData();

            // Find and remove error
            let found = false;
            for (const pathItem of errorsData.path) {
                const errorIndex = pathItem.data.findIndex((e) => e.id === errorId);
                if (errorIndex !== -1) {
                    pathItem.data.splice(errorIndex, 1);
                    found = true;

                    // Remove empty path entries
                    if (pathItem.data.length === 0) {
                        const pathIndex = errorsData.path.indexOf(pathItem);
                        errorsData.path.splice(pathIndex, 1);
                    }
                    break;
                }
            }

            if (!found) {
                ErrorLogger.warn('Error not found for deletion', { errorId });
                return false;
            }

            // Update API
            const success = await this.updateErrors(errorsData);

            if (success) {
                // Update local cache
                this.currentTabErrors = this.currentTabErrors.filter((e) => e.id !== errorId);
                ErrorLogger.info('Error deleted successfully', { errorId });
            }

            return success;
        } catch (error) {
            ErrorLogger.error('Failed to delete error', { error });
            return false;
        }
    }

    /**
     * Add comment to error
     * @param {Object} error - Error object
     * @param {string} commentText - Comment text
     * @returns {Promise<boolean>} True if successful
     */
    async addComment(error, commentText) {
        const validation = ValidationService.validateComment(commentText);
        if (!validation.valid) {
            ErrorLogger.error('Invalid comment', { error: validation.error });
            return false;
        }

        try {
            const comment = {
                id: this.generateUUID(),
                text: commentText,
                author: await this.getUserInfo(),
                timestamp: Date.now(),
                edited: false,
                editedAt: null,
            };

            error.comments.push(comment);

            const success = await this.updateError(error);

            if (success) {
                ErrorLogger.info('Comment added successfully', {
                    errorId: error.id,
                    commentId: comment.id,
                });
            }

            return success;
        } catch (error) {
            ErrorLogger.error('Failed to add comment', { error });
            return false;
        }
    }

    /**
     * Edit comment
     * @param {Object} error - Error object
     * @param {string} commentId - Comment ID
     * @param {string} newText - New comment text
     * @returns {Promise<boolean>} True if successful
     */
    async editComment(error, commentId, newText) {
        const validation = ValidationService.validateComment(newText);
        if (!validation.valid) {
            ErrorLogger.error('Invalid comment', { error: validation.error });
            return false;
        }

        try {
            const comment = error.comments.find((c) => c.id === commentId);
            if (!comment) {
                ErrorLogger.warn('Comment not found', { commentId });
                return false;
            }

            comment.text = newText;
            comment.edited = true;
            comment.editedAt = Date.now();

            const success = await this.updateError(error);

            if (success) {
                ErrorLogger.info('Comment edited successfully', { errorId: error.id, commentId });
            }

            return success;
        } catch (error) {
            ErrorLogger.error('Failed to edit comment', { error });
            return false;
        }
    }

    /**
     * Delete comment
     * @param {Object} error - Error object
     * @param {string} commentId - Comment ID
     * @returns {Promise<boolean>} True if successful
     */
    async deleteComment(error, commentId) {
        try {
            const initialLength = error.comments.length;
            error.comments = error.comments.filter((c) => c.id !== commentId);

            if (error.comments.length === initialLength) {
                ErrorLogger.warn('Comment not found', { commentId });
                return false;
            }

            const success = await this.updateError(error);

            if (success) {
                ErrorLogger.info('Comment deleted successfully', { errorId: error.id, commentId });
            }

            return success;
        } catch (error) {
            ErrorLogger.error('Failed to delete comment', { error });
            return false;
        }
    }

    /**
     * Toggle error resolved status
     * @param {Object} error - Error object
     * @returns {Promise<boolean>} True if successful
     */
    async toggleErrorStatus(error) {
        try {
            const oldStatus = error.status;
            error.status =
                error.status === ConfigurationManager.ERROR_STATUS.OPEN
                    ? ConfigurationManager.ERROR_STATUS.RESOLVED
                    : ConfigurationManager.ERROR_STATUS.OPEN;

            const success = await this.updateError(error);

            if (success) {
                ErrorLogger.info('Error status toggled', {
                    errorId: error.id,
                    oldStatus,
                    newStatus: error.status,
                });
            }

            return success;
        } catch (error) {
            ErrorLogger.error('Failed to toggle error status', { error });
            return false;
        }
    }

    /**
     * Clear all errors for current domain
     * @returns {Promise<boolean>} True if successful
     */
    async clearAllErrors() {
        try {
            const emptyErrorsData = {
                domain: this.domainName,
                path: [],
            };

            const success = await this.updateErrors(emptyErrorsData);

            if (success) {
                this.currentTabErrors = [];
                ErrorLogger.info('All errors cleared');
            }

            return success;
        } catch (error) {
            ErrorLogger.error('Failed to clear all errors', { error });
            return false;
        }
    }

    /**
     * Get full errors data structure
     * @returns {Promise<Object>} Errors data
     */
    async getErrorsData() {
        try {
            const response = await MessagingService.sendToBackground({
                action: ConfigurationManager.ACTIONS.GET_ERRORS,
                domainName: this.domainName,
            });

            return {
                domain: this.domainName,
                path: response?.path || [],
            };
        } catch (error) {
            ErrorLogger.error('Failed to get errors data', { error });
            return {
                domain: this.domainName,
                path: [],
            };
        }
    }

    /**
     * Get current tab errors
     * @returns {Array} Array of errors
     */
    getCurrentTabErrors() {
        return this.currentTabErrors;
    }

    /**
     * Generate UUID v4
     * @private
     * @returns {string} UUID
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /**
     * Get current user info (placeholder - should be injected)
     * @private
     * @returns {Promise<Object|null>} User info
     */
    async getUserInfo() {
        try {
            const result = await chrome.storage.local.get([
                ConfigurationManager.STORAGE_KEYS.USER_INFO,
            ]);
            return result[ConfigurationManager.STORAGE_KEYS.USER_INFO] || null;
        } catch (error) {
            ErrorLogger.error('Failed to get user info', { error });
            return null;
        }
    }
}
