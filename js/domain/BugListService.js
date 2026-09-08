import { ConfigurationManager } from '../config/ConfigurationManager.js';
import { ErrorLogger } from '../utils/ErrorLogger.js';
import AuthManager from '../auth.js';

/**
 * Access to the active bug list options used to categorise a bug.
 *
 * The endpoint returns every active option when called without `search`, so the
 * full list is fetched once per page session and filtered locally — that keeps
 * typing instant. `searchOptions` is kept for callers that need server-side
 * matching (e.g. when the local cache could not be loaded).
 */
export class BugListService {
    static cachedOptions = null;
    static pendingRequest = null;

    /**
     * Build common headers including JWT authorization token.
     */
    static async getHeaders() {
        const accessToken = await AuthManager.getAccessToken();
        const headers = { 'Content-Type': 'application/json' };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        return headers;
    }

    /**
     * Accept both a bare array and a `{ data: [...] }` envelope.
     */
    static normalizeOptions(payload) {
        const rawOptions = Array.isArray(payload) ? payload : (payload?.data ?? []);
        if (!Array.isArray(rawOptions)) return [];

        return rawOptions
            .filter((option) => option && option.id != null)
            .map((option) => ({
                id: option.id,
                name: String(option.name ?? '').trim() || `#${option.id}`,
                description: String(option.description ?? '').trim(),
            }));
    }

    /**
     * Fetch options from the API. Omitting searchTerm returns the full active list.
     */
    static async requestOptions(searchTerm = '') {
        const response = await fetch(ConfigurationManager.getBugListOptionsUrl(searchTerm), {
            method: 'GET',
            headers: await this.getHeaders(),
            signal: AbortSignal.timeout(ConfigurationManager.API.TIMEOUT),
        });
        if (!response.ok) throw new Error(`API returned ${response.status}`);

        return this.normalizeOptions(await response.json());
    }

    /**
     * Load the full active list once and reuse it. Concurrent callers share one request.
     */
    static async loadOptions({ forceReload = false } = {}) {
        if (!forceReload && this.cachedOptions) return this.cachedOptions;
        if (this.pendingRequest) return await this.pendingRequest;

        const request = this.requestOptions()
            .then((options) => {
                this.cachedOptions = options;
                ErrorLogger.info('Bug list options loaded', { count: options.length });
                return options;
            })
            .catch((error) => {
                ErrorLogger.error('Failed to load bug list options', { error });
                throw error;
            });

        this.pendingRequest = request;
        try {
            return await request;
        } finally {
            if (this.pendingRequest === request) this.pendingRequest = null;
        }
    }

    /**
     * Server-side search, used when the local cache is unavailable.
     */
    static async searchOptions(searchTerm) {
        try {
            return await this.requestOptions(searchTerm);
        } catch (error) {
            ErrorLogger.error('Failed to search bug list options', { searchTerm, error });
            return [];
        }
    }

    /**
     * Lowercase and strip diacritics so "mo ta" matches "mô tả".
     */
    static normalizeSearchText(value) {
        return String(value ?? '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/đ/g, 'd')
            .trim();
    }

    /**
     * Local filter over name and description.
     */
    static filterOptions(options, searchTerm) {
        const keyword = this.normalizeSearchText(searchTerm);
        if (!keyword) return options;

        return options.filter(
            (option) =>
                this.normalizeSearchText(option.name).includes(keyword) ||
                this.normalizeSearchText(option.description).includes(keyword),
        );
    }

    /**
     * Turn stored ids into option objects. Ids missing from the active list are
     * kept as placeholders so an existing bug never silently loses a tag.
     */
    static resolveSelected(options, selectedIds) {
        return selectedIds.map(
            (id) =>
                options.find((option) => String(option.id) === String(id)) ?? {
                    id,
                    name: `#${id}`,
                    description: '',
                    isUnknown: true,
                },
        );
    }

    /**
     * Drop duplicates and non-numeric entries before sending to the API.
     */
    static sanitizeIds(ids) {
        if (!Array.isArray(ids)) return [];

        const seen = new Set();
        const sanitized = [];
        ids.forEach((id) => {
            // Number(null) và Number('') đều ra 0, nên phải loại trước khi ép kiểu.
            if (id === null || id === undefined || id === '' || typeof id === 'boolean') return;

            const numericId = Number(id);
            if (!Number.isInteger(numericId) || numericId <= 0 || seen.has(numericId)) return;
            seen.add(numericId);
            sanitized.push(numericId);
        });
        return sanitized;
    }
}
