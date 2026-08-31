import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import { ValidationService } from '../utils/ValidationService.js';
import { MessagingService } from '../core/MessagingService.js';
import AuthManager from '../auth.js';

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
     * Build common headers including JWT authorization token.
     */
    async getHeaders() {
        const accessToken = await AuthManager.getAccessToken();
        const headers = { 'Content-Type': 'application/json' };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        return headers;
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
            const endpoint = `${ConfigurationManager.API.ENDPOINTS.GET_DOMAIN_DATA}?domain=${encodeURIComponent(this.domainName)}`;
            const url = ConfigurationManager.API.BASE_URL + endpoint;
            const headers = await this.getHeaders();

            const response = await fetch(url, {
                method: 'GET',
                headers,
            });

            if (!response.ok) {
                ErrorLogger.warn('Failed to fetch fresh errors from API', { status: response.status });
                return this.currentTabErrors;
            }

            const responseData = await response.json();
            const domainData = responseData.data || { path: [] };

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
            const headers = await this.getHeaders();
            const payload = {
                domain: this.domainName,
                full_url: this.currentUrl,
                bug: errorData,
            };

            const response = await fetch(ConfigurationManager.getBugUrl(), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
            });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const responseData = await response.json().catch(() => null);
            if (responseData?.data) {
                if (responseData.data.id) errorData.id = responseData.data.id;
                if (Array.isArray(responseData.data.comments) && responseData.data.comments.length > 0) {
                    errorData.comments = responseData.data.comments;
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
            const headers = await this.getHeaders();
            const payload = {
                domain: this.domainName,
                full_url: this.currentUrl,
                bug: errorData,
            };

            const response = await fetch(ConfigurationManager.getBugUrl(errorData.id), {
                method: 'PUT',
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
            });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

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
     * Delete a bug via DELETE /ext/bugs/{bugId} and sync state.
     */
    async deleteError(errorId) {
        try {
            const headers = await this.getHeaders();
            const payload = {
                domain: this.domainName,
                full_url: this.currentUrl,
            };

            const response = await fetch(ConfigurationManager.getBugUrl(errorId), {
                method: 'DELETE',
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
            });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

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

            const headers = await this.getHeaders();
            const payload = {
                domain: this.domainName,
                full_url: this.currentUrl,
                comment: newComment,
            };

            const response = await fetch(ConfigurationManager.getBugCommentUrl(errorData.id), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
            });

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const responseData = await response.json().catch(() => null);
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

            const headers = await this.getHeaders();
            const payload = {
                domain: this.domainName,
                full_url: this.currentUrl,
                comment: updatedComment,
            };

            const response = await fetch(
                ConfigurationManager.getBugCommentUrl(errorData.id, comment.id),
                {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
                },
            );

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

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

            const headers = await this.getHeaders();
            const payload = {
                domain: this.domainName,
                full_url: this.currentUrl,
            };

            const response = await fetch(
                ConfigurationManager.getBugCommentUrl(errorData.id, actualCommentId),
                {
                    method: 'DELETE',
                    headers,
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
                },
            );

            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            errorData.comments = errorData.comments.filter((item) => String(item.id) !== String(commentId));
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
