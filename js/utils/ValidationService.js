/**
 * ValidationService - Input validation utility
 * Provides validation functions for various data types
 * @module ValidationService
 */

import { ErrorLogger } from './ErrorLogger.js';

export class ValidationService {
    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     */
    static isValidEmail(email) {
        if (!email || typeof email !== 'string') {
            return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    }

    /**
     * Validate URL format
     * @param {string} url - URL to validate
     * @returns {boolean} True if valid
     */
    static isValidUrl(url) {
        if (!url || typeof url !== 'string') {
            return false;
        }

        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validate domain format
     * @param {string} domain - Domain to validate
     * @returns {boolean} True if valid
     */
    static isValidDomain(domain) {
        if (!domain || typeof domain !== 'string') {
            return false;
        }

        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z]{2,})+$/;
        return domainRegex.test(domain.trim());
    }

    /**
     * Validate string is not empty
     * @param {string} str - String to validate
     * @param {number} minLength - Minimum length (default: 1)
     * @param {number} maxLength - Maximum length (default: Infinity)
     * @returns {boolean} True if valid
     */
    static isNonEmptyString(str, minLength = 1, maxLength = Infinity) {
        if (!str || typeof str !== 'string') {
            return false;
        }

        const trimmed = str.trim();
        return trimmed.length >= minLength && trimmed.length <= maxLength;
    }

    /**
     * Validate number is within range
     * @param {number} num - Number to validate
     * @param {number} min - Minimum value (default: -Infinity)
     * @param {number} max - Maximum value (default: Infinity)
     * @returns {boolean} True if valid
     */
    static isNumberInRange(num, min = -Infinity, max = Infinity) {
        if (typeof num !== 'number' || isNaN(num)) {
            return false;
        }

        return num >= min && num <= max;
    }

    /**
     * Validate object has required properties
     * @param {Object} obj - Object to validate
     * @param {string[]} requiredProps - Required property names
     * @returns {boolean} True if valid
     */
    static hasRequiredProperties(obj, requiredProps) {
        if (!obj || typeof obj !== 'object') {
            return false;
        }

        return requiredProps.every((prop) => obj.hasOwnProperty(prop));
    }

    /**
     * Validate UUID format
     * @param {string} uuid - UUID to validate
     * @returns {boolean} True if valid
     */
    static isValidUUID(uuid) {
        if (!uuid || typeof uuid !== 'string') {
            return false;
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    /**
     * Validate comment text
     * @param {string} text - Comment text
     * @param {number} maxLength - Maximum length (default: 500)
     * @returns {Object} { valid: boolean, error: string|null }
     */
    static validateComment(text, maxLength = 500) {
        if (!text || typeof text !== 'string') {
            return { valid: false, error: 'Comment cannot be empty' };
        }

        const trimmed = text.trim();

        if (trimmed.length === 0) {
            return { valid: false, error: 'Comment cannot be empty' };
        }

        if (trimmed.length > maxLength) {
            return { valid: false, error: `Comment cannot exceed ${maxLength} characters` };
        }

        return { valid: true, error: null };
    }

    /**
     * Validate error data structure
     * @param {Object} error - Error object to validate
     * @returns {Object} { valid: boolean, error: string|null }
     */
    static validateErrorData(error) {
        if (!error || typeof error !== 'object') {
            return { valid: false, error: 'Error data must be an object' };
        }

        const requiredFields = ['id', 'type', 'timestamp', 'status', 'comments'];
        const missingFields = requiredFields.filter((field) => !error.hasOwnProperty(field));

        if (missingFields.length > 0) {
            return {
                valid: false,
                error: `Missing required fields: ${missingFields.join(', ')}`,
            };
        }

        if (!this.isValidUUID(error.id)) {
            return { valid: false, error: 'Invalid error ID format' };
        }

        if (!['border', 'rect'].includes(error.type)) {
            return { valid: false, error: 'Invalid error type' };
        }

        if (!['open', 'resolved', 'closed'].includes(error.status)) {
            return { valid: false, error: 'Invalid error status' };
        }

        if (!Array.isArray(error.comments)) {
            return { valid: false, error: 'Comments must be an array' };
        }

        return { valid: true, error: null };
    }

    /**
     * Sanitize HTML string to prevent XSS
     * @param {string} str - String to sanitize
     * @returns {string} Sanitized string
     */
    static sanitizeHtml(str) {
        if (!str || typeof str !== 'string') {
            return '';
        }

        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Validate and sanitize user input
     * @param {string} input - User input
     * @param {Object} options - Validation options
     * @returns {Object} { valid: boolean, sanitized: string, error: string|null }
     */
    static validateAndSanitize(input, options = {}) {
        const { required = true, minLength = 0, maxLength = Infinity, allowHtml = false } = options;

        if (required && !this.isNonEmptyString(input, minLength, maxLength)) {
            return {
                valid: false,
                sanitized: '',
                error: `Input must be between ${minLength} and ${maxLength} characters`,
            };
        }

        const sanitized = allowHtml ? input.trim() : this.sanitizeHtml(input);

        return {
            valid: true,
            sanitized,
            error: null,
        };
    }
}
