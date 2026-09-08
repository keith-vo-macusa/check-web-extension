/**
 * Single source of truth for the current tab's errors.
 *
 * The data used to live in parallel copies that did not know about each other:
 * ErrorDataManager held an array, ErrorRenderer a Map, the comment panel an
 * object captured when it opened. The panel rendered from one copy while the
 * handler wrote into another, which is what produced the "editing or deleting a
 * comment does nothing" bug.
 *
 * resolve() is the guard against that whole family of bugs: hand it a possibly
 * stale object, get back the one actually in the store.
 */
export class ErrorStore {
    constructor() {
        /** @type {Map<string, object>} A Map preserves insertion order. */
        this.errorsById = new Map();
        this.listeners = new Set();
    }

    /** Replace everything, for when a fresh list arrives from the server. */
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
     * Swap a possibly stale object for the one living in the store.
     * Returns the input untouched when unknown, so callers keep working.
     */
    resolve(errorLike) {
        if (!errorLike?.id) return errorLike ?? null;
        return this.get(errorLike.id) ?? errorLike;
    }

    /** Insert or replace by id. */
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
     * Tell the store an error was mutated in place so views re-render.
     * Needed because several call sites still mutate error objects directly.
     */
    touch() {
        this.notify();
    }

    /** @returns {Function} call it to unsubscribe. */
    subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        const snapshot = this.getAll();
        // Copy before iterating: a listener may unsubscribe itself inside the callback.
        [...this.listeners].forEach((listener) => {
            try {
                listener(snapshot);
            } catch (error) {
                console.error('ErrorStore listener failed', error);
            }
        });
    }
}
