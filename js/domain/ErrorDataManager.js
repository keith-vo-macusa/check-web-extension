import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { ValidationService } from '../utils/ValidationService.js';
import { MessagingService } from '../core/MessagingService.js';
import { BugListService } from './BugListService.js';
import { ApiClient } from '../core/http/ApiClient.js';

export class ErrorDataManager {
    /**
     * @param {string} currentUrl
     * @param {string} domainName Root URL with protocol (window.location.origin)
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
     * Fetch latest errors directly from API server and update background + local state.
     */
    async fetchFreshErrors() {
        try {
            const responseData = await ApiClient.get(
                ConfigurationManager.API.ENDPOINTS.GET_DOMAIN_DATA,
                { params: { domain: this.domainName } },
            );
            const domainData = responseData?.data || { path: [] };

            await MessagingService.sendToBackground({
                action: ConfigurationManager.ACTIONS.SET_ERRORS,
                errors: domainData,
                domainName: this.domainName,
            });

            const currentPathData = domainData.path?.find((pathItem) => pathItem.full_url === this.currentUrl);
            this.currentTabErrors = currentPathData ? currentPathData.data : [];
            ErrorLogger.info('Fresh errors loaded from server', { count: this.currentTabErrors.length });
            return this.currentTabErrors;
        } catch (error) {
            ErrorLogger.error('Failed to fetch fresh errors', { error });
            return this.currentTabErrors;
        }
    }

    /**
     * Add a new bug via POST /ext/bugs and sync local/background state.
     */
    async addError(errorData) {
        const validation = ValidationService.validateErrorData(errorData);
        if (!validation.valid) {
            ErrorLogger.error('Invalid error data', { error: validation.error });
            return false;
        }

        try {
            const responseData = await ApiClient.post(ConfigurationManager.getBugUrl(), {
                domain: this.domainName,
                full_url: this.currentUrl,
                bug: errorData,
            });

            if (responseData?.data) {
                if (responseData.data.id) errorData.id = responseData.data.id;
                if (Array.isArray(responseData.data.comments) && responseData.data.comments.length > 0) {
                    errorData.comments = responseData.data.comments;
                }
                if (Array.isArray(responseData.data.bug_list_ids)) {
                    errorData.bug_list_ids = responseData.data.bug_list_ids;
                }
            }

            this.currentTabErrors.push(errorData);
            await this.syncErrorsToBackground();
            ErrorLogger.info('Bug added successfully via API', { bugId: errorData.id });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to add bug', { error });
            return false;
        }
    }

    /**
     * Update an existing bug via PUT /ext/bugs/{bugId} and sync state.
     */
    async updateError(errorData) {
        try {
            await ApiClient.put(ConfigurationManager.getBugUrl(errorData.id), {
                domain: this.domainName,
                full_url: this.currentUrl,
                bug: errorData,
            });

            const currentTabIndex = this.currentTabErrors.findIndex(
                (currentError) => currentError.id === errorData.id,
            );
            if (currentTabIndex !== -1) {
                this.currentTabErrors[currentTabIndex] = errorData;
            }

            await this.syncErrorsToBackground();
            ErrorLogger.info('Bug updated successfully via API', { bugId: errorData.id });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to update bug', { error });
            return false;
        }
    }

    /**
     * Replace the bug list tags of a bug. Passing an empty array clears them.
     * Reverts the local value when the API call fails.
     */
    async updateBugList(errorData, bugListIds) {
        const previousIds = Array.isArray(errorData.bug_list_ids) ? [...errorData.bug_list_ids] : undefined;
        errorData.bug_list_ids = BugListService.sanitizeIds(bugListIds);

        const isUpdated = await this.updateError(errorData);
        if (!isUpdated) {
            if (previousIds === undefined) delete errorData.bug_list_ids;
            else errorData.bug_list_ids = previousIds;
            return false;
        }

        ErrorLogger.info('Bug list updated successfully', {
            bugId: errorData.id,
            bugListIds: errorData.bug_list_ids,
        });
        return true;
    }

    /**
     * Delete a bug via DELETE /ext/bugs/{bugId} and sync state.
     */
    async deleteError(errorId) {
        try {
            await ApiClient.delete(ConfigurationManager.getBugUrl(errorId), {
                domain: this.domainName,
                full_url: this.currentUrl,
            });

            this.currentTabErrors = this.currentTabErrors.filter(
                (currentError) => currentError.id !== errorId,
            );

            await this.syncErrorsToBackground();
            ErrorLogger.info('Bug deleted successfully via API', { bugId: errorId });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to delete bug', { error });
            return false;
        }
    }

    /**
     * Append a comment to a bug via POST /ext/bugs/{bugId}/comments.
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

            const responseData = await ApiClient.post(
                ConfigurationManager.getBugCommentUrl(errorData.id),
                {
                    domain: this.domainName,
                    full_url: this.currentUrl,
                    comment: newComment,
                },
            );

            if (responseData?.data) {
                newComment.id = responseData.data.id ?? newComment.id;
                if (responseData.data.author) newComment.author = responseData.data.author;
            }

            errorData.comments.push(newComment);
            await this.syncErrorsToBackground();
            ErrorLogger.info('Comment added successfully via API', {
                bugId: errorData.id,
                commentId: newComment.id,
            });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to add comment', { error });
            return false;
        }
    }

    /**
     * Edit an existing comment via PUT /ext/bugs/{bugId}/comments/{commentId}.
     */
    async editComment(errorData, commentId, commentText) {
        const validation = ValidationService.validateComment(commentText);
        if (!validation.valid) {
            ErrorLogger.error('Invalid comment', { error: validation.error });
            return false;
        }

        try {
            const comment = errorData.comments.find((item) => String(item.id) === String(commentId));
            if (!comment) {
                ErrorLogger.warn('Comment not found', { commentId, comments: errorData.comments });
                return false;
            }

            const author = comment.author || (await this.getUserInfoBasic());
            const updatedComment = {
                id: comment.id,
                text: commentText,
                author: {
                    id: author.id ?? null,
                    name: author.name ?? null,
                    email: author.email ?? null,
                    loginTime: author.loginTime ?? author.login_time ?? null,
                },
                timestamp: comment.timestamp || Date.now(),
                edited: true,
                editedAt: new Date().toISOString(),
            };

            await ApiClient.put(
                ConfigurationManager.getBugCommentUrl(errorData.id, comment.id),
                {
                    domain: this.domainName,
                    full_url: this.currentUrl,
                    comment: updatedComment,
                },
            );

            comment.text = commentText;
            comment.edited = true;
            comment.editedAt = updatedComment.editedAt;

            await this.syncErrorsToBackground();
            ErrorLogger.info('Comment edited successfully via API', {
                bugId: errorData.id,
                commentId: comment.id,
            });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to edit comment', { error });
            return false;
        }
    }

    /**
     * Delete a comment from a bug via DELETE /ext/bugs/{bugId}/comments/{commentId}.
     */
    async deleteComment(errorData, commentId) {
        try {
            const comment = errorData.comments.find((item) => String(item.id) === String(commentId));
            const actualCommentId = comment?.id ?? commentId;

            await ApiClient.delete(
                ConfigurationManager.getBugCommentUrl(errorData.id, actualCommentId),
                {
                    domain: this.domainName,
                    full_url: this.currentUrl,
                },
            );

            errorData.comments = errorData.comments.filter(
                (item) =>
                    String(item.id) !== String(commentId) &&
                    String(item.id) !== String(actualCommentId),
            );
            await this.syncErrorsToBackground();
            ErrorLogger.info('Comment deleted successfully via API', {
                bugId: errorData.id,
                commentId: actualCommentId,
            });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to delete comment', { error });
            return false;
        }
    }

    /**
     * Toggle error status between OPEN and RESOLVED via PUT /ext/bugs/{bugId}.
     */
    async toggleErrorStatus(errorData) {
        try {
            const previousStatus = errorData.status;
            errorData.status =
                errorData.status === ConfigurationManager.ERROR_STATUS.OPEN
                    ? ConfigurationManager.ERROR_STATUS.RESOLVED
                    : ConfigurationManager.ERROR_STATUS.OPEN;

            const isUpdated = await this.updateError(errorData);
            if (!isUpdated) {
                errorData.status = previousStatus;
                return false;
            }

            ErrorLogger.info('Bug status toggled successfully', {
                bugId: errorData.id,
                oldStatus: previousStatus,
                newStatus: errorData.status,
            });
            return true;
        } catch (error) {
            ErrorLogger.error('Failed to toggle bug status', { error });
            return false;
        }
    }

    /**
     * Sync local currentTabErrors to the full errors payload and notify background.
     */
    async syncErrorsToBackground() {
        try {
            const errorsPayload = await this.getErrorsData();
            const pathIndex = errorsPayload.path.findIndex(
                (pathItem) => pathItem.full_url === this.currentUrl,
            );

            if (this.currentTabErrors.length === 0) {
                if (pathIndex !== -1) {
                    errorsPayload.path.splice(pathIndex, 1);
                }
            } else {
                if (pathIndex === -1) {
                    errorsPayload.path.push({
                        full_url: this.currentUrl,
                        data: [...this.currentTabErrors],
                    });
                } else {
                    errorsPayload.path[pathIndex].data = [...this.currentTabErrors];
                }
            }

            await MessagingService.sendToBackground({
                action: ConfigurationManager.ACTIONS.SET_ERRORS,
                errors: errorsPayload,
                domainName: this.domainName,
            });
        } catch (error) {
            ErrorLogger.error('Failed to sync errors to background', { error });
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
        return await this.getUserInfoBasic();
    }

    /**
     * Only keep minimal author fields when persisting comment authorship.
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
                loginTime: userInfo.loginTime ?? null,
            };
        } catch (error) {
            ErrorLogger.error('Failed to get user basic info', { error });
            return null;
        }
    }
}
