import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { ValidationService } from '../utils/ValidationService.js';
import { MessagingService } from '../core/MessagingService.js';
import AuthManager from '../auth.js';

export class ErrorDataManager {
    /**
     * @param {string} currentUrl
     * @param {string} domainName
     */
    constructor(currentUrl, domainName) {
        this.currentUrl = currentUrl;
        this.domainName = domainName;
        this.currentTabErrors = [];
    }

    /**
     * Fetch all errors for domain and cache current tab errors.
     */
    async fetchErrors() {
        try {
            const response = await MessagingService.sendToBackground({
                action: ConfigurationManager.ACTIONS.GET_ERRORS,
                domainName: this.domainName,
            });

            if (response?.path) {
                const currentPathData = response.path.find((pathItem) => pathItem.full_url === this.currentUrl);
                this.currentTabErrors = currentPathData ? currentPathData.data : [];
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
     * Persist full error payload to API and sync local/background state.
     */
    async updateErrors(errorsPayload) {
        try {
            const accessToken = await AuthManager.getAccessToken();
            const headers = { 'Content-Type': 'application/json' };
            if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

            const response = await fetch(ConfigurationManager.getApiUrl('SET_DOMAIN_DATA'), {
                method: 'POST',
                headers,
                body: JSON.stringify(errorsPayload),
            });
            if (!response.ok) throw new Error(`API returned ${response.status}`);

            await MessagingService.sendToBackground({
                action: ConfigurationManager.ACTIONS.SET_ERRORS,
                errors: errorsPayload,
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
     * Add a new error to current URL and persist.
     */
    async addError(errorData) {
        const validation = ValidationService.validateErrorData(errorData);
        if (!validation.valid) {
            ErrorLogger.error('Invalid error data', { error: validation.error });
            return false;
        }

        try {
            const errorsPayload = await this.getErrorsData();
            const pathIndex = errorsPayload.path.findIndex((pathItem) => pathItem.full_url === this.currentUrl);

            if (pathIndex === -1) {
                errorsPayload.path.push({ full_url: this.currentUrl, data: [errorData] });
            } else {
                errorsPayload.path[pathIndex].data.push(errorData);
            }

            const isUpdated = await this.updateErrors(errorsPayload);
            if (isUpdated) {
                this.currentTabErrors.push(errorData);
                ErrorLogger.info('Error added successfully', { errorId: errorData.id });
            }
            return isUpdated;
        } catch (error) {
            ErrorLogger.error('Failed to add error', { error });
            return false;
        }
    }

    /**
     * Update existing error and persist.
     */
    async updateError(errorData) {
        try {
            const errorsPayload = await this.getErrorsData();
            let isFound = false;

            for (const pathItem of errorsPayload.path) {
                const index = pathItem.data.findIndex((currentError) => currentError.id === errorData.id);
                if (index !== -1) {
                    pathItem.data[index] = errorData;
                    isFound = true;
                    break;
                }
            }

            if (!isFound) {
                ErrorLogger.warn('Error not found for update', { errorId: errorData.id });
                return false;
            }

            const isUpdated = await this.updateErrors(errorsPayload);
            if (isUpdated) {
                const currentTabIndex = this.currentTabErrors.findIndex(
                    (currentError) => currentError.id === errorData.id,
                );
                if (currentTabIndex !== -1) this.currentTabErrors[currentTabIndex] = errorData;
                ErrorLogger.info('Error updated successfully', { errorId: errorData.id });
            }
            return isUpdated;
        } catch (error) {
            ErrorLogger.error('Failed to update error', { error });
            return false;
        }
    }

    /**
     * Delete an error by id and persist.
     */
    async deleteError(errorId) {
        try {
            const errorsPayload = await this.getErrorsData();
            let isFound = false;

            for (const pathItem of errorsPayload.path) {
                const index = pathItem.data.findIndex((currentError) => currentError.id === errorId);
                if (index !== -1) {
                    pathItem.data.splice(index, 1);
                    isFound = true;
                    if (pathItem.data.length === 0) {
                        const emptyPathIndex = errorsPayload.path.indexOf(pathItem);
                        errorsPayload.path.splice(emptyPathIndex, 1);
                    }
                    break;
                }
            }

            if (!isFound) {
                ErrorLogger.warn('Error not found for deletion', { errorId });
                return false;
            }

            const isUpdated = await this.updateErrors(errorsPayload);
            if (isUpdated) {
                this.currentTabErrors = this.currentTabErrors.filter(
                    (currentError) => currentError.id !== errorId,
                );
                ErrorLogger.info('Error deleted successfully', { errorId });
            }
            return isUpdated;
        } catch (error) {
            ErrorLogger.error('Failed to delete error', { error });
            return false;
        }
    }

    /**
     * Append a comment to an error.
     */
    async addComment(errorData, commentText) {
        const validation = ValidationService.validateComment(commentText);
        if (!validation.valid) {
            ErrorLogger.error('Invalid comment', { error: validation.error });
            return false;
        }

        try {
            const newComment = {
                id: this.generateUUID(),
                text: commentText,
                author: await this.getUserInfoBasic(),
                timestamp: Date.now(),
                edited: false,
                editedAt: null,
            };
            errorData.comments.push(newComment);

            const isUpdated = await this.updateError(errorData);
            if (isUpdated) {
                ErrorLogger.info('Comment added successfully', {
                    errorId: errorData.id,
                    commentId: newComment.id,
                });
            }
            return isUpdated;
        } catch (error) {
            ErrorLogger.error('Failed to add comment', { error });
            return false;
        }
    }

    /**
     * Edit an existing comment by id.
     */
    async editComment(errorData, commentId, commentText) {
        const validation = ValidationService.validateComment(commentText);
        if (!validation.valid) {
            ErrorLogger.error('Invalid comment', { error: validation.error });
            return false;
        }

        try {
            const comment = errorData.comments.find((item) => item.id === commentId);
            if (!comment) {
                ErrorLogger.warn('Comment not found', { commentId });
                return false;
            }

            comment.text = commentText;
            comment.edited = true;
            comment.editedAt = Date.now();

            const isUpdated = await this.updateError(errorData);
            if (isUpdated) {
                ErrorLogger.info('Comment edited successfully', {
                    errorId: errorData.id,
                    commentId,
                });
            }
            return isUpdated;
        } catch (error) {
            ErrorLogger.error('Failed to edit comment', { error });
            return false;
        }
    }

    /**
     * Delete a comment from an error.
     */
    async deleteComment(errorData, commentId) {
        try {
            const originalLength = errorData.comments.length;
            errorData.comments = errorData.comments.filter((item) => item.id !== commentId);
            if (errorData.comments.length === originalLength) {
                ErrorLogger.warn('Comment not found', { commentId });
                return false;
            }

            const isUpdated = await this.updateError(errorData);
            if (isUpdated) {
                ErrorLogger.info('Comment deleted successfully', {
                    errorId: errorData.id,
                    commentId,
                });
            }
            return isUpdated;
        } catch (error) {
            ErrorLogger.error('Failed to delete comment', { error });
            return false;
        }
    }

    /**
     * Toggle error status between OPEN and RESOLVED.
     */
    async toggleErrorStatus(errorData) {
        try {
            const previousStatus = errorData.status;
            errorData.status =
                errorData.status === ConfigurationManager.ERROR_STATUS.OPEN
                    ? ConfigurationManager.ERROR_STATUS.RESOLVED
                    : ConfigurationManager.ERROR_STATUS.OPEN;

            const isUpdated = await this.updateError(errorData);
            if (isUpdated) {
                ErrorLogger.info('Error status toggled', {
                    errorId: errorData.id,
                    oldStatus: previousStatus,
                    newStatus: errorData.status,
                });
            }
            return isUpdated;
        } catch (error) {
            ErrorLogger.error('Failed to toggle error status', { error });
            return false;
        }
    }

    /**
     * Remove all errors for current domain.
     */
    async clearAllErrors() {
        try {
            const errorsPayload = { domain: this.domainName, path: [] };
            const isUpdated = await this.updateErrors(errorsPayload);
            if (isUpdated) {
                this.currentTabErrors = [];
                ErrorLogger.info('All errors cleared');
            }
            return isUpdated;
        } catch (error) {
            ErrorLogger.error('Failed to clear all errors', { error });
            return false;
        }
    }

    /**
     * Read current domain errors from background service.
     */
    async getErrorsData() {
        try {
            const response = await MessagingService.sendToBackground({
                action: ConfigurationManager.ACTIONS.GET_ERRORS,
                domainName: this.domainName,
            });
            return { domain: this.domainName, path: response?.path || [] };
        } catch (error) {
            ErrorLogger.error('Failed to get errors data', { error });
            return { domain: this.domainName, path: [] };
        }
    }

    /**
     * Get cached errors for current tab URL.
     */
    getCurrentTabErrors() {
        return this.currentTabErrors;
    }

    /**
     * Generate UUID v4-like identifier.
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
            const randomValue = (16 * Math.random()) | 0;
            return (char === 'x' ? randomValue : (randomValue & 3) | 8).toString(16);
        });
    }

    /**
     * Get authenticated user info from storage.
     */
    async getUserInfo() {
        // Backward-compatible alias: always return minimal fields
        // to avoid accidentally persisting accessToken/roles/permissions.
        return await this.getUserInfoBasic();
    }

    /**
     * Only keep minimal author fields when persisting comment authorship.
     * Avoid storing accessToken/roles/permissions to keep payload small.
     */
    async getUserInfoBasic() {
        try {
            const storage = await chrome.storage.local.get([ConfigurationManager.STORAGE_KEYS.USER_INFO]);
            const userInfo = storage[ConfigurationManager.STORAGE_KEYS.USER_INFO] || null;
            if (!userInfo) return null;

            return {
                id: userInfo.id ?? null,
                name: userInfo.name ?? null,
                email: userInfo.email ?? null,
            };
        } catch (error) {
            return (ErrorLogger.error('Failed to get user basic info', { error }), null);
        }
    }
}
