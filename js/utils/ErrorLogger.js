export class ErrorLogger {
    static LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };
    static currentLevel = this.LOG_LEVELS.INFO;

    static setLevel(level) {
        this.currentLevel = level;
    }

    static debug(message, context = {}) {
        if (this.currentLevel <= this.LOG_LEVELS.DEBUG) console.debug('[DEBUG]', message, context);
    }

    static info(message, context = {}) {
        if (this.currentLevel <= this.LOG_LEVELS.INFO) console.info('[INFO]', message, context);
    }

    static warn(message, context = {}) {
        if (this.currentLevel <= this.LOG_LEVELS.WARN) console.warn('[WARN]', message, context);
    }

    static error(message, context = {}) {
        if (this.currentLevel <= this.LOG_LEVELS.ERROR) {
            const sanitizedContext = this._sanitizeContext(context);
            console.error('[ERROR]', message, sanitizedContext);
            this._sendToErrorTracking(message, sanitizedContext);
        }
    }

    static _sanitizeContext(context) {
        const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization'];
        const sanitizedContext = { ...context };
        for (const key of Object.keys(sanitizedContext)) {
            if (sensitiveKeys.some((sensitiveKey) => key.toLowerCase().includes(sensitiveKey))) {
                sanitizedContext[key] = '[REDACTED]';
            }
        }
        return sanitizedContext;
    }

    static _sendToErrorTracking(message, context) {
        try {
            chrome?.storage?.local &&
                chrome.storage.local.get(['errorLogs'], (storage) => {
                    const errorLogs = storage.errorLogs || [];
                    errorLogs.push({
                        timestamp: Date.now(),
                        message,
                        context,
                        url: window?.location?.href || 'unknown',
                    });
                    const limitedLogs = errorLogs.slice(-100);
                    chrome.storage.local.set({ errorLogs: limitedLogs });
                });
        } catch (error) {
            console.error('Failed to store error log', error);
        }
    }

    static async getErrorLogs() {
        try {
            if (!chrome?.storage?.local) return [];
            return (await chrome.storage.local.get(['errorLogs'])).errorLogs || [];
        } catch (error) {
            console.error('Failed to get error logs', error);
            return [];
        }
    }

    static async clearErrorLogs() {
        try {
            if (!chrome?.storage?.local) return false;
            await chrome.storage.local.remove(['errorLogs']);
            return true;
        } catch (error) {
            console.error('Failed to clear error logs', error);
            return false;
        }
    }
}
