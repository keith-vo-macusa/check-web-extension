import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeChrome } from './fakes/chrome.js';

let ErrorManager;

before(async () => {
    globalThis.chrome = createFakeChrome().api;
    ({ ErrorManager } = await import('../js/data/popupErrors.js'));
});

describe('flattenErrors', () => {
    test('gộp data của mọi path thành một danh sách', () => {
        const payload = {
            path: [
                { full_url: 'a', data: [{ id: 1 }, { id: 2 }] },
                { full_url: 'b', data: [{ id: 3 }] },
            ],
        };
        assert.deepEqual(
            ErrorManager.flattenErrors(payload).map((e) => e.id),
            [1, 2, 3],
        );
    });

    test('path thiếu data hoặc data không phải mảng đều bị bỏ qua', () => {
        const payload = { path: [{ full_url: 'a' }, { full_url: 'b', data: 'x' }] };
        assert.deepEqual(ErrorManager.flattenErrors(payload), []);
    });

    test('payload rỗng, null, thiếu path đều ra mảng rỗng', () => {
        assert.deepEqual(ErrorManager.flattenErrors({ path: [] }), []);
        assert.deepEqual(ErrorManager.flattenErrors(null), []);
        assert.deepEqual(ErrorManager.flattenErrors({}), []);
        assert.deepEqual(ErrorManager.flattenErrors(undefined), []);
    });
});

describe('sortErrors', () => {
    const at = (isoDate) => new Date(isoDate).getTime();

    test('open trước resolved trước closed', () => {
        const errors = [
            { id: 'c', status: 'closed', timestamp: at('2025-01-01') },
            { id: 'r', status: 'resolved', timestamp: at('2025-01-01') },
            { id: 'o', status: 'open', timestamp: at('2025-01-01') },
        ];
        assert.deepEqual(
            ErrorManager.sortErrors(errors).map((e) => e.id),
            ['o', 'r', 'c'],
        );
    });

    test('thiếu status coi như open', () => {
        const errors = [
            { id: 'r', status: 'resolved', timestamp: at('2025-01-01') },
            { id: 'x', timestamp: at('2025-01-01') },
        ];
        assert.deepEqual(
            ErrorManager.sortErrors(errors).map((e) => e.id),
            ['x', 'r'],
        );
    });

    test('cùng trạng thái thì mới nhất lên trước', () => {
        const errors = [
            { id: 'cũ', status: 'open', timestamp: at('2025-01-01') },
            { id: 'mới', status: 'open', timestamp: at('2025-06-01') },
        ];
        assert.deepEqual(
            ErrorManager.sortErrors(errors).map((e) => e.id),
            ['mới', 'cũ'],
        );
    });

    test('danh sách rỗng không vỡ', () => {
        assert.deepEqual(ErrorManager.sortErrors([]), []);
    });
});
