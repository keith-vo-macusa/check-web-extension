// @ts-check
import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../ErrorLogger.js';
import AuthManager from '../auth.js';

/**
 * Thrown for any non-2xx response. Carries the status and parsed body so callers
 * can branch on 401/403/422 instead of guessing from a boolean.
 */
export class ApiError extends Error {
    constructor(status, body, url) {
        super(`API ${status} — ${url}`);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
        this.url = url;
    }
}

/**
 * The single place that talks to the backend.
 *
 * Before this existed the auth-header block was copy-pasted in four files, half
 * the calls had no timeout, and failures were swallowed into `return false`.
 */
export class ApiClient {
    /**
     * Absolute URLs pass through; anything else is resolved against BASE_URL.
     */
    static buildUrl(path, params = null) {
        const base = /^https?:\/\//i.test(path)
            ? path
            : ConfigurationManager.API.BASE_URL + String(path).replace(/^\/+/, '');

        if (!params) return base;

        const query = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                query.append(key, String(value));
            }
        });

        const queryString = query.toString();
        if (!queryString) return base;
        return base + (base.includes('?') ? '&' : '?') + queryString;
    }

    static async buildHeaders(extraHeaders = null) {
        const headers = { 'Content-Type': 'application/json', ...extraHeaders };
        const accessToken = await AuthManager.getAccessToken();
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        return headers;
    }

    /**
     * @throws {ApiError} on a non-2xx response.
     * @throws {Error} on network failure or timeout.
     */
    static async request(method, path, { body = null, params = null, headers = null } = {}) {
        const url = this.buildUrl(path, params);

        const response = await fetch(url, {
            method,
            headers: await this.buildHeaders(headers),
            body: body === null || body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
        });

        // 204 and an empty body are valid; do not let JSON.parse fail a successful call.
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            ErrorLogger.warn('API request failed', { method, url, status: response.status });
            throw new ApiError(response.status, payload, url);
        }
        return payload;
    }

    static get(path, options) {
        return this.request('GET', path, options);
    }

    static post(path, body, options) {
        return this.request('POST', path, { ...options, body });
    }

    static put(path, body, options) {
        return this.request('PUT', path, { ...options, body });
    }

    static delete(path, body, options) {
        return this.request('DELETE', path, { ...options, body });
    }
}
