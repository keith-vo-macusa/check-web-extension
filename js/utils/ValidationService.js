import { ErrorLogger } from './ErrorLogger.js';

export class ValidationService {
    static isValidEmail(email) {
        if (!email || typeof email !== 'string') return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    static isValidUrl(url) {
        if (!url || typeof url !== 'string') return false;
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    static isValidDomain(domain) {
        if (!domain || typeof domain !== 'string') return false;
        return /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z]{2,})+$/.test(domain.trim());
    }

    static isNonEmptyString(value, minLength = 1, maxLength = Infinity) {
        if (!value || typeof value !== 'string') return false;
        const trimmedValue = value.trim();
        return trimmedValue.length >= minLength && trimmedValue.length <= maxLength;
    }

    static isNumberInRange(value, min = -Infinity, max = Infinity) {
        return typeof value === 'number' && !isNaN(value) && value >= min && value <= max;
    }

    static hasRequiredProperties(target, requiredProperties) {
        return !(!target || typeof target !== 'object') &&
            requiredProperties.every((property) => target.hasOwnProperty(property));
    }

    static isValidUUID(uuid) {
        if (!uuid || typeof uuid !== 'string') return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
    }

    static validateComment(comment, maxLength = 500) {
        if (!comment || typeof comment !== 'string')
            return { valid: false, error: 'Comment cannot be empty' };

        const trimmedComment = comment.trim();
        if (trimmedComment.length === 0) return { valid: false, error: 'Comment cannot be empty' };
        if (trimmedComment.length > maxLength) {
            return { valid: false, error: `Comment cannot exceed ${maxLength} characters` };
        }
        return { valid: true, error: null };
    }

    static validateErrorData(errorData) {
        if (!errorData || typeof errorData !== 'object') {
            return { valid: false, error: 'Error data must be an object' };
        }

        const missingFields = ['id', 'type', 'timestamp', 'status', 'comments'].filter(
            (field) => !errorData.hasOwnProperty(field),
        );

        if (missingFields.length > 0) {
            return { valid: false, error: `Missing required fields: ${missingFields.join(', ')}` };
        }
        if (!this.isValidUUID(errorData.id)) return { valid: false, error: 'Invalid error ID format' };
        if (!['border', 'rect'].includes(errorData.type)) {
            return { valid: false, error: 'Invalid error type' };
        }
        if (!['open', 'resolved', 'closed'].includes(errorData.status)) {
            return { valid: false, error: 'Invalid error status' };
        }
        if (!Array.isArray(errorData.comments)) {
            return { valid: false, error: 'Comments must be an array' };
        }

        return { valid: true, error: null };
    }

    static sanitizeHtml(input) {
        if (!input || typeof input !== 'string') return '';
        const tempElement = document.createElement('div');
        tempElement.textContent = input;
        return tempElement.innerHTML;
    }

    static validateAndSanitize(input, options = {}) {
        const {
            required = true,
            minLength = 0,
            maxLength = Infinity,
            allowHtml = false,
        } = options;

        if (required && !this.isNonEmptyString(input, minLength, maxLength))
            return {
                valid: false,
                sanitized: '',
                error: `Input must be between ${minLength} and ${maxLength} characters`,
            };

        return {
            valid: true,
            sanitized: allowHtml ? input.trim() : this.sanitizeHtml(input),
            error: null,
        };
    }

    static linkify(input) {
        if (!input || typeof input !== 'string') return '';
        return input.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
            const cleanUrl = match.replace(/[.,!?;:]+$/, '');
            return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${match.substring(cleanUrl.length)}`;
        });
    }
}
