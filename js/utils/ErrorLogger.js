/**
 * ErrorLogger - Centralized logging utility
 * Provides structured logging with levels and context
 * @module ErrorLogger
 */

export class ErrorLogger {
    static LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4,
    };

    static currentLevel = this.LOG_LEVELS.INFO;

    /**
     * Set the minimum log level
     * @param {number} level - Log level from LOG_LEVELS
     */
    static setLevel(level) {
        this.currentLevel = level;
    }

    /**
     * Log debug message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    static debug(message, context = {}) {
        if (this.currentLevel <= this.LOG_LEVELS.DEBUG) {
            console.debug('[DEBUG]', message, context);
        }
    }

    /**
     * Log info message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    static info(message, context = {}) {
        if (this.currentLevel <= this.LOG_LEVELS.INFO) {
            console.info('[INFO]', message, context);
        }
    }

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {Object} context - Additional context
     */
    static warn(message, context = {}) {
        if (this.currentLevel <= this.LOG_LEVELS.WARN) {
            console.warn('[WARN]', message, context);
        }
    }

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {Object} context - Additional context (no secrets!)
     */
    static error(message, context = {}) {
        if (this.currentLevel <= this.LOG_LEVELS.ERROR) {
            // Remove sensitive data
            const sanitizedContext = this._sanitizeContext(context);
            console.error('[ERROR]', message, sanitizedContext);

            // Optional: Send to error tracking service
            this._sendToErrorTracking(message, sanitizedContext);
        }
    }

    /**
     * Sanitize context to remove sensitive data
     * @private
     * @param {Object} context - Context object
     * @returns {Object} Sanitized context
     */
    static _sanitizeContext(context) {
        const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization'];
        const sanitized = { ...context };

        for (const key of Object.keys(sanitized)) {
            if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
                sanitized[key] = '[REDACTED]';
            }
        }

        return sanitized;
    }

    /**
     * Send error to tracking service (placeholder)
     * @private
     * @param {string} message - Error message
     * @param {Object} context - Error context
     */
    static _sendToErrorTracking(message, context) {
        // TODO: Implement error tracking service integration
        // For now, just store in chrome.storage for debugging
        try {
            if (chrome?.storage?.local) {
                chrome.storage.local.get(['errorLogs'], (result) => {
                    const logs = result.errorLogs || [];
                    logs.push({
                        timestamp: Date.now(),
                        message,
                        context,
                        url: window?.location?.href || 'unknown',
                    });

                    // Keep only last 100 errors
                    const trimmedLogs = logs.slice(-100);
                    chrome.storage.local.set({ errorLogs: trimmedLogs });
                });
            }
        } catch (error) {
            console.error('Failed to store error log', error);
        }
    }

    /**
     * Get stored error logs
     * @returns {Promise<Array>} Array of error logs
     */
    static async getErrorLogs() {
        try {
            if (!chrome?.storage?.local) {
                return [];
            }

            const result = await chrome.storage.local.get(['errorLogs']);
            return result.errorLogs || [];
        } catch (error) {
            console.error('Failed to get error logs', error);
            return [];
        }
    }

    /**
     * Clear error logs
     * @returns {Promise<boolean>} True if successful
     */
    static async clearErrorLogs() {
        try {
            if (!chrome?.storage?.local) {
                return false;
            }

            await chrome.storage.local.remove(['errorLogs']);
            return true;
        } catch (error) {
            console.error('Failed to clear error logs', error);
            return false;
        }
    }
}
