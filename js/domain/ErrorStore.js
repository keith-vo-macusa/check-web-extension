/**
 * Nguồn sự thật duy nhất cho danh sách lỗi của tab hiện tại.
 *
 * Trước đây dữ liệu tồn tại song song ở nhiều nơi (ErrorDataManager giữ một
 * mảng, ErrorRenderer giữ một Map, panel comment giữ một object). Không nơi nào
 * biết nơi khác vừa đổi, nên panel vẽ từ bản này còn handler ghi vào bản kia —
 * đúng con bug "sửa/xoá comment không ăn".
 *
 * `resolve()` là chốt chặn cho cả họ bug đó: đưa vào một object có thể đã cũ,
 * nhận về đúng object đang sống trong store.
 */
export class ErrorStore {
    constructor() {
        /** @type {Map<string, object>} Map giữ nguyên thứ tự chèn. */
        this.errorsById = new Map();
        this.listeners = new Set();
    }

    /** Thay toàn bộ nội dung, dùng khi fetch về danh sách mới. */
    setAll(errors) {
        this.errorsById.clear();
        (Array.isArray(errors) ? errors : []).forEach((error) => {
            if (error?.id !== undefined && error?.id !== null) {
                this.errorsById.set(String(error.id), error);
            }
        });
        this.notify();
    }

    getAll() {
        return [...this.errorsById.values()];
    }

    get size() {
        return this.errorsById.size;
    }

    get(errorId) {
        return this.errorsById.get(String(errorId)) ?? null;
    }

    has(errorId) {
        return this.errorsById.has(String(errorId));
    }

    /**
     * Đổi một object có thể đã cũ lấy object đang sống trong store.
     * Không tìm thấy thì trả lại chính nó, để caller vẫn chạy được.
     */
    resolve(errorLike) {
        if (!errorLike?.id) return errorLike ?? null;
        return this.get(errorLike.id) ?? errorLike;
    }

    /** Thêm mới hoặc thay thế theo id. */
    upsert(error) {
        if (error?.id === undefined || error?.id === null) return null;
        this.errorsById.set(String(error.id), error);
        this.notify();
        return error;
    }

    remove(errorId) {
        const didRemove = this.errorsById.delete(String(errorId));
        if (didRemove) this.notify();
        return didRemove;
    }

    clear() {
        if (this.errorsById.size === 0) return;
        this.errorsById.clear();
        this.notify();
    }

    /**
     * Báo cho store biết một lỗi vừa bị sửa tại chỗ, để các view vẽ lại.
     * Cần vì code hiện tại vẫn mutate object trực tiếp ở nhiều nơi.
     */
    touch() {
        this.notify();
    }

    /** @returns {Function} gọi để huỷ đăng ký. */
    subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        const snapshot = this.getAll();
        // Copy trước khi duyệt: listener có thể tự huỷ đăng ký ngay trong callback.
        [...this.listeners].forEach((listener) => {
            try {
                listener(snapshot);
            } catch (error) {
                console.error('ErrorStore listener failed', error);
            }
        });
    }
}
