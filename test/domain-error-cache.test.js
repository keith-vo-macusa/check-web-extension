import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DomainErrorCache } from '../js/domain/DomainErrorCache.js';

/** storage.session giả — cũng dùng để mô phỏng service worker bị tắt rồi bật lại. */
function createStorageArea() {
    const data = {};
    return {
        data,
        get: async (keys) => {
            if (keys === null) return { ...data };
            const out = {};
            for (const key of [].concat(keys)) if (key in data) out[key] = data[key];
            return out;
        },
        set: async (values) => Object.assign(data, values),
        remove: async (keys) => [].concat(keys).forEach((key) => delete data[key]),
    };
}

const DOMAIN = 'https://site.com';
const payload = () => ({
    path: [
        { full_url: 'https://site.com/a', data: [{ id: 1, status: 'open' }] },
        {
            full_url: 'https://site.com/b',
            data: [
                { id: 2, status: 'resolved' },
                { id: 3, status: 'open' },
            ],
        },
    ],
});

let area;
let cache;

beforeEach(() => {
    area = createStorageArea();
    cache = new DomainErrorCache(area);
});

describe('đọc ghi cơ bản', () => {
    test('domain chưa có trả payload rỗng chứ không undefined', async () => {
        assert.deepEqual(await cache.get(DOMAIN), { path: [] });
    });

    test('set rồi get trả lại đúng dữ liệu', async () => {
        await cache.set(DOMAIN, payload());
        assert.equal((await cache.get(DOMAIN)).path.length, 2);
    });

    test('payload rác được chuẩn hoá thành { path: [] }', async () => {
        await cache.set(DOMAIN, null);
        assert.deepEqual(await cache.get(DOMAIN), { path: [] });
        await cache.set(DOMAIN, { nonsense: true });
        assert.deepEqual(await cache.get(DOMAIN), { path: [] });
    });

    test('domain rỗng không ghi gì vào storage', async () => {
        await cache.set('', payload());
        assert.deepEqual(Object.keys(area.data), []);
    });
});

describe('sống sót qua việc service worker bị tắt', () => {
    // Đây là bug thật: Map trong bộ nhớ chết theo service worker sau ~30s rảnh,
    // khiến badge về 0 và GET_ERRORS trả rỗng.
    test('instance mới đọc lại được dữ liệu từ storage', async () => {
        await cache.set(DOMAIN, payload());

        const afterRestart = new DomainErrorCache(area);
        assert.equal(afterRestart.memory.size, 0, 'bộ nhớ phải trống sau khi khởi động lại');

        const restored = await afterRestart.get(DOMAIN);
        assert.equal(restored.path.length, 2);
        assert.equal(afterRestart.memory.size, 1, 'đọc xong phải nạp lại tầng nóng');
    });

    test('không có storage area thì vẫn chạy được bằng bộ nhớ', async () => {
        const memoryOnly = new DomainErrorCache(null);
        await memoryOnly.set(DOMAIN, payload());
        assert.equal((await memoryOnly.get(DOMAIN)).path.length, 2);
    });

    test('storage ném lỗi thì trả rỗng chứ không làm sập background', async () => {
        const broken = new DomainErrorCache({
            get: async () => {
                throw new Error('storage lỗi');
            },
            set: async () => {
                throw new Error('storage lỗi');
            },
            remove: async () => {},
        });
        await assert.doesNotReject(() => broken.set(DOMAIN, payload()));
        // set vẫn cập nhật tầng nóng, nên phải xoá đi mới thấy nhánh đọc lỗi.
        broken.memory.clear();
        assert.deepEqual(await broken.get(DOMAIN), { path: [] });
    });
});

describe('countOpenErrors', () => {
    test('chỉ đếm status open, gộp mọi path', () => {
        assert.equal(DomainErrorCache.countOpenErrors(payload()), 2);
    });

    test('payload rỗng hoặc thiếu path trả 0', () => {
        assert.equal(DomainErrorCache.countOpenErrors({ path: [] }), 0);
        assert.equal(DomainErrorCache.countOpenErrors(null), 0);
        assert.equal(DomainErrorCache.countOpenErrors({}), 0);
    });

    test('path thiếu mảng data không làm vỡ', () => {
        assert.equal(DomainErrorCache.countOpenErrors({ path: [{ full_url: 'x' }] }), 0);
    });
});

describe('dọn cache', () => {
    test('removeDomain xoá cả bộ nhớ lẫn storage', async () => {
        await cache.set(DOMAIN, payload());
        await cache.removeDomain(DOMAIN);

        assert.equal(cache.memory.size, 0);
        assert.deepEqual(await new DomainErrorCache(area).get(DOMAIN), { path: [] });
    });

    test('clear chỉ đụng khoá của chính nó', async () => {
        area.data.userInfo = { email: 'a@b.c' };
        await cache.set(DOMAIN, payload());
        await cache.set('https://other.com', payload());

        await cache.clear();

        assert.deepEqual(Object.keys(area.data), ['userInfo']);
    });
});
