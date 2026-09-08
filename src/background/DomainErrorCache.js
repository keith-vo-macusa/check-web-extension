import { ErrorLogger } from '../shared/ErrorLogger.js';

/**
 * Cache dữ liệu lỗi theo domain cho service worker.
 *
 * Trước đây đây chỉ là một `Map` trong bộ nhớ. MV3 tắt service worker sau
 * khoảng 30 giây rảnh, nên cache biến mất lặng lẽ: badge về 0 và trang đang mở
 * gọi GET_ERRORS sẽ nhận danh sách rỗng.
 *
 * Nay ghi xuyên qua `chrome.storage.session` — sống qua các lần service worker
 * bị tắt/bật, và tự xoá khi đóng trình duyệt, đúng vòng đời của một cache.
 * Lớp Map vẫn giữ làm tầng nóng để badge không phải chờ storage.
 */
export class DomainErrorCache {
    static KEY_PREFIX = 'errorsCache:';

    /**
     * @param {object|null} [storageArea] Bỏ trống để tự chọn; truyền null để
     *   chạy thuần bộ nhớ (dùng trong test).
     */
    constructor(storageArea) {
        this.memory = new Map();

        if (storageArea !== undefined) {
            this.area = storageArea;
            return;
        }
        // storage.session cần Chrome 102+; rơi về local nếu không có.
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
     * Đếm số lỗi đang mở trong một payload domain.
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
     * Xoá toàn bộ cache, chỉ đụng vào khoá của chính mình.
     */
    async clear() {
        const domains = [...this.memory.keys()];
        this.memory.clear();
        if (!this.area) return;

        try {
            // Đọc hết khoá để dọn cả những domain chỉ còn trong storage.
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
