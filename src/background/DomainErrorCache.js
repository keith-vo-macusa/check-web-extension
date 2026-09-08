import { ErrorLogger } from '../shared/ErrorLogger.js';

/**
 * Per-domain cache of error data for the service worker.
 *
 * This used to be a plain in-memory `Map`. MV3 terminates the service worker
 * after roughly 30 seconds idle and the Map died with it, so the cache emptied
 * silently: the badge dropped to zero and an open page calling GET_ERRORS got
 * an empty list back.
 *
 * It now write-throughs to `chrome.storage.session`, which survives worker
 * restarts and clears when the browser closes — the right lifetime for a cache.
 * The Map stays as a hot layer so badge updates do not wait on storage.
 */
export class DomainErrorCache {
    static KEY_PREFIX = 'errorsCache:';

    /**
     * @param {object|null} [storageArea] Omit to pick one automatically; pass
     *   null for memory-only, which is what tests use.
     */
    constructor(storageArea) {
        this.memory = new Map();

        if (storageArea !== undefined) {
            this.area = storageArea;
            return;
        }
        // storage.session needs Chrome 102+; fall back to local without it.
        const storage = typeof chrome !== 'undefined' ? chrome.storage : null;
        this.area = storage?.session ?? storage?.local ?? null;
    }

    static storageKey(domainName) {
        return DomainErrorCache.KEY_PREFIX + domainName;
    }

    static emptyPayload() {
        return { path: [] };
    }

    /**
     * Count the open errors in a domain payload.
     */
    static countOpenErrors(payload, openStatus = 'open') {
        if (!payload?.path) return 0;
        return payload.path.reduce(
            (total, pathItem) =>
                total + (pathItem.data ?? []).filter((error) => error.status === openStatus).length,
            0,
        );
    }

    async get(domainName) {
        if (!domainName) return DomainErrorCache.emptyPayload();
        if (this.memory.has(domainName)) return this.memory.get(domainName);

        if (!this.area) return DomainErrorCache.emptyPayload();
        try {
            const key = DomainErrorCache.storageKey(domainName);
            const stored = await this.area.get([key]);
            const payload = stored?.[key];
            if (!payload) return DomainErrorCache.emptyPayload();

            this.memory.set(domainName, payload);
            return payload;
        } catch (error) {
            ErrorLogger.warn('Không đọc được cache lỗi', { domain: domainName, error });
            return DomainErrorCache.emptyPayload();
        }
    }

    async set(domainName, payload) {
        if (!domainName) return;
        const normalized = payload?.path ? payload : DomainErrorCache.emptyPayload();
        this.memory.set(domainName, normalized);

        if (!this.area) return;
        try {
            await this.area.set({ [DomainErrorCache.storageKey(domainName)]: normalized });
        } catch (error) {
            ErrorLogger.warn('Không ghi được cache lỗi', { domain: domainName, error });
        }
    }

    async removeDomain(domainName) {
        this.memory.delete(domainName);
        if (!this.area) return;
        try {
            await this.area.remove(DomainErrorCache.storageKey(domainName));
        } catch (error) {
            ErrorLogger.warn('Không xoá được cache lỗi', { domain: domainName, error });
        }
    }

    /**
     * Drop the whole cache, touching only keys owned by this class.
     */
    async clear() {
        const domains = [...this.memory.keys()];
        this.memory.clear();
        if (!this.area) return;

        try {
            // Read every key so domains left only in storage are cleaned up too.
            const all = await this.area.get(null);
            const keys = Object.keys(all ?? {}).filter((key) =>
                key.startsWith(DomainErrorCache.KEY_PREFIX),
            );
            const missing = domains
                .map(DomainErrorCache.storageKey)
                .filter((key) => !keys.includes(key));
            await this.area.remove([...keys, ...missing]);
        } catch (error) {
            ErrorLogger.warn('Không dọn được cache lỗi', { error });
        }
    }
}
