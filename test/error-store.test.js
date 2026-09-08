import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorStore } from '../src/content/ErrorStore.js';

let store;
const errorA = () => ({ id: 'a', status: 'open', comments: [] });
const errorB = () => ({ id: 'b', status: 'open', comments: [] });

beforeEach(() => {
    store = new ErrorStore();
});

describe('setAll / getAll', () => {
    test('giữ nguyên thứ tự', () => {
        store.setAll([errorA(), errorB()]);
        assert.deepEqual(
            store.getAll().map((e) => e.id),
            ['a', 'b'],
        );
    });

    test('bỏ phần tử không có id', () => {
        store.setAll([errorA(), null, {}, { id: undefined }]);
        assert.equal(store.size, 1);
    });

    test('không phải mảng thì thành rỗng chứ không ném', () => {
        store.setAll(errorA());
        assert.equal(store.size, 0);
        store.setAll(undefined);
        assert.equal(store.size, 0);
    });

    test('getAll trả snapshot, sửa nó không ảnh hưởng store', () => {
        store.setAll([errorA()]);
        store.getAll().pop();
        assert.equal(store.size, 1);
    });
});

describe('resolve', () => {
    // Đây là chốt chặn cho con bug "panel vẽ từ bản này, handler ghi vào bản kia".
    test('object cũ cùng id trả về object đang sống trong store', () => {
        const live = errorA();
        store.setAll([live]);

        const stale = { id: 'a', status: 'resolved', comments: [{ id: 1 }] };
        assert.equal(store.resolve(stale), live);
        assert.notEqual(store.resolve(stale), stale);
    });

    test('id lạ thì trả lại chính nó để caller vẫn chạy được', () => {
        const orphan = { id: 'zzz' };
        assert.equal(store.resolve(orphan), orphan);
    });

    test('id số và id chuỗi coi như một', () => {
        const live = { id: 7 };
        store.setAll([live]);
        assert.equal(store.resolve({ id: '7' }), live);
        assert.equal(store.get('7'), live);
        assert.equal(store.get(7), live);
    });

    test('null/undefined không làm vỡ', () => {
        assert.equal(store.resolve(null), null);
        assert.equal(store.resolve(undefined), null);
    });
});

describe('upsert / remove', () => {
    test('upsert thêm mới rồi thay thế theo id', () => {
        store.upsert(errorA());
        assert.equal(store.size, 1);

        const replacement = { id: 'a', status: 'resolved' };
        store.upsert(replacement);
        assert.equal(store.size, 1);
        assert.equal(store.get('a'), replacement);
    });

    test('upsert bỏ qua object không có id', () => {
        assert.equal(store.upsert({ status: 'open' }), null);
        assert.equal(store.size, 0);
    });

    test('remove trả về việc có xoá được hay không', () => {
        store.setAll([errorA()]);
        assert.equal(store.remove('a'), true);
        assert.equal(store.remove('a'), false);
        assert.equal(store.size, 0);
    });
});

describe('subscribe', () => {
    test('mọi mutation đều báo cho listener', () => {
        const seen = [];
        store.subscribe((errors) => seen.push(errors.length));

        store.setAll([errorA()]);
        store.upsert(errorB());
        store.remove('a');
        store.touch();
        store.clear();

        assert.deepEqual(seen, [1, 2, 1, 1, 0]);
    });

    test('clear khi đang rỗng không báo thừa', () => {
        let count = 0;
        store.subscribe(() => count++);
        store.clear();
        assert.equal(count, 0);
    });

    test('hàm trả về sẽ huỷ đăng ký', () => {
        let count = 0;
        const unsubscribe = store.subscribe(() => count++);
        store.upsert(errorA());
        unsubscribe();
        store.upsert(errorB());
        assert.equal(count, 1);
    });

    test('listener ném lỗi không chặn các listener khác', () => {
        let reached = false;
        store.subscribe(() => {
            throw new Error('bùm');
        });
        store.subscribe(() => (reached = true));

        assert.doesNotThrow(() => store.upsert(errorA()));
        assert.ok(reached);
    });

    test('listener tự huỷ đăng ký ngay trong callback không làm hỏng vòng lặp', () => {
        let secondCalls = 0;
        const unsubscribe = store.subscribe(() => unsubscribe());
        store.subscribe(() => secondCalls++);

        assert.doesNotThrow(() => store.upsert(errorA()));
        assert.equal(secondCalls, 1);
    });
});
