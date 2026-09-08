/**
 * A fake Chrome extension API, enough to test background logic.
 *
 * Records every call in `calls` so tests can assert on the order of operations —
 * order is exactly what WindowsManager got wrong, measuring the viewport before
 * navigating.
 */
export function createFakeChrome({
    storedWindowId = null,
    tabUrl = 'https://site/old',
    innerSize = { width: 1000, height: 700 },
    outerSize = { width: 1016, height: 740 },
    contentScriptAnswers = true,
    windowExists = true,
    // Like real Chrome: a new window's inner size is outer minus the decorations.
    decoration = { width: 16, height: 40 },
} = {}) {
    const calls = [];
    const state = {
        storage: storedWindowId ? { errorWindowId: storedWindowId } : {},
        windows: new Map(),
        tabs: new Map(),
        nextWindowId: 100,
        nextTabId: 500,
        inner: { ...innerSize },
        updatedListeners: [],
        removedListeners: [],
    };

    if (storedWindowId && windowExists) {
        const tabId = state.nextTabId++;
        state.tabs.set(tabId, { id: tabId, url: tabUrl, status: 'complete' });
        state.windows.set(storedWindowId, {
            id: storedWindowId,
            ...outerSize,
            tabs: [state.tabs.get(tabId)],
        });
    }

    const fireComplete = (tabId) => {
        setTimeout(
            () => state.updatedListeners.forEach((fn) => fn(tabId, { status: 'complete' })),
            5,
        );
    };

    const api = {
        runtime: {
            getManifest: () => ({ version: '0.0.0-test' }),
            getPlatformInfo: async () => ({ os: 'win32' }),
        },
        storage: {
            local: {
                get: async (keys) => {
                    const out = {};
                    for (const key of [].concat(keys)) {
                        if (key in state.storage) out[key] = state.storage[key];
                    }
                    return out;
                },
                set: async (values) => Object.assign(state.storage, values),
                remove: async (key) => {
                    delete state.storage[key];
                },
            },
        },
        windows: {
            get: async (id) => {
                const found = state.windows.get(id);
                if (!found) throw new Error('No window with id ' + id);
                return found;
            },
            create: async (data) => {
                const id = state.nextWindowId++;
                const tabId = state.nextTabId++;
                const tab = { id: tabId, url: data.url, status: 'loading' };
                state.tabs.set(tabId, tab);
                const created = { id, width: data.width, height: data.height, tabs: [tab] };
                state.windows.set(id, created);
                state.inner = {
                    width: data.width - decoration.width,
                    height: data.height - decoration.height,
                };
                calls.push({ op: 'windows.create', type: data.type, ...data });
                setTimeout(() => {
                    tab.status = 'complete';
                    fireComplete(tabId);
                }, 5);
                return created;
            },
            update: async (id, info) => {
                const found = state.windows.get(id);
                if (!found) throw new Error('No window with id ' + id);
                if (info.width) {
                    found.width = info.width;
                    state.inner.width = info.width - decoration.width;
                }
                if (info.height) {
                    found.height = info.height;
                    state.inner.height = info.height - decoration.height;
                }
                calls.push({ op: 'windows.update', id, ...info });
                return found;
            },
        },
        tabs: {
            get: async (id) => {
                const found = state.tabs.get(id);
                if (!found) throw new Error('No tab with id ' + id);
                return found;
            },
            update: async (id, info) => {
                const found = state.tabs.get(id);
                calls.push({ op: 'tabs.update', id, url: info.url });
                found.url = info.url;
                found.status = 'loading';
                setTimeout(() => {
                    found.status = 'complete';
                    fireComplete(id);
                }, 5);
                return found;
            },
            sendMessage: async (id, message) => {
                calls.push({
                    op: 'tabs.sendMessage',
                    id,
                    action: message.action,
                    errorId: message.errorId,
                });
                if (!contentScriptAnswers) throw new Error('Receiving end does not exist');
                return { success: true, pending: false };
            },
            onUpdated: {
                addListener: (fn) => state.updatedListeners.push(fn),
                removeListener: (fn) => {
                    state.updatedListeners = state.updatedListeners.filter((f) => f !== fn);
                },
            },
            onRemoved: {
                addListener: (fn) => state.removedListeners.push(fn),
                removeListener: (fn) => {
                    state.removedListeners = state.removedListeners.filter((f) => f !== fn);
                },
            },
        },
        scripting: {
            executeScript: async ({ args }) => {
                // A call with args is the fallback highlight; without, it is a measurement.
                if (args) {
                    calls.push({ op: 'executeScript.highlight', errorId: args[0] });
                    return [{ result: true }];
                }
                calls.push({ op: 'executeScript.measure', inner: { ...state.inner } });
                return [{ result: { width: state.inner.width, height: state.inner.height } }];
            },
        },
    };

    return {
        api,
        calls,
        state,
        /** Listeners still attached; must be 0 once a flow finishes. */
        leakedListeners: () => state.updatedListeners.length + state.removedListeners.length,
        ops: () => calls.map((call) => call.op),
    };
}

export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
