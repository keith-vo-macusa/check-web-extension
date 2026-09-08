import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeChrome } from './fakes/chrome.js';
import { API_BASE_URL as BASE_URL } from '../src/shared/config/env.js';

let ApiClient;
let ApiError;
let lastRequest = null;

before(async () => {
    globalThis.chrome = createFakeChrome().api;
    ({ ApiClient, ApiError } = await import('../src/shared/http/ApiClient.js'));
});

beforeEach(() => {
    lastRequest = null;
    globalThis.fetch = async (url, init) => {
        lastRequest = { url, init };
        return { ok: true, status: 200, json: async () => ({ data: 'ok' }) };
    };
});

describe('buildUrl', () => {
    const cases = [
        ['api/v1/x', null, BASE_URL + 'api/v1/x', 'đường dẫn tương đối'],
        ['/api/v1/x', null, BASE_URL + 'api/v1/x', 'bỏ dấu / thừa ở đầu'],
        ['https://other/x', null, 'https://other/x', 'URL tuyệt đối giữ nguyên'],
        [
            'api/x',
            { domain: 'https://a.com' },
            BASE_URL + 'api/x?domain=https%3A%2F%2Fa.com',
            'encode param',
        ],
        ['api/x', { a: '', b: null, c: 1 }, BASE_URL + 'api/x?c=1', 'bỏ param rỗng/null'],
        ['api/x?p=1', { q: 2 }, BASE_URL + 'api/x?p=1&q=2', 'nối vào query sẵn có'],
        ['api/x', {}, BASE_URL + 'api/x', 'object params rỗng'],
    ];

    for (const [path, params, expected, label] of cases) {
        test(label, () => assert.equal(ApiClient.buildUrl(path, params), expected));
    }
});

describe('request', () => {
    test('GET không gửi body', async () => {
        await ApiClient.get('api/x');
        assert.equal(lastRequest.init.method, 'GET');
        assert.equal(lastRequest.init.body, undefined);
    });

    test('DELETE vẫn gửi được body', async () => {
        await ApiClient.delete('api/bugs/9', { domain: 'd' });
        assert.equal(lastRequest.init.method, 'DELETE');
        assert.equal(lastRequest.init.body, '{"domain":"d"}');
    });

    test('luôn đặt Content-Type JSON và có timeout', async () => {
        await ApiClient.post('api/x', { a: 1 });
        assert.equal(lastRequest.init.headers['Content-Type'], 'application/json');
        assert.ok(lastRequest.init.signal, 'phải có AbortSignal');
    });

    test('non-2xx ném ApiError giữ status và body', async () => {
        globalThis.fetch = async () => ({
            ok: false,
            status: 422,
            json: async () => ({ message: 'sai' }),
        });

        await assert.rejects(
            () => ApiClient.post('api/x', {}),
            (error) => {
                assert.ok(error instanceof ApiError);
                assert.equal(error.status, 422);
                assert.equal(error.body.message, 'sai');
                return true;
            },
        );
    });

    test('204 body rỗng không làm vỡ request thành công', async () => {
        globalThis.fetch = async () => ({
            ok: true,
            status: 204,
            json: async () => {
                throw new Error('no body');
            },
        });
        assert.equal(await ApiClient.delete('api/x'), null);
    });
});
