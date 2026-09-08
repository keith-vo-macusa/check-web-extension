import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeChrome } from './fakes/chrome.js';

let BugListService;

before(async () => {
    globalThis.chrome = createFakeChrome().api;
    ({ BugListService } = await import('../js/domain/BugListService.js'));
});

const OPTIONS = [
    { id: 1, name: 'Missing alt text', description: 'Ảnh thiếu mô tả' },
    { id: 4, name: 'Broken link', description: '' },
    { id: 8, name: 'Sai màu nền', description: 'Không khớp design' },
];

describe('normalizeOptions', () => {
    test('nhận cả mảng trần lẫn envelope { data }', () => {
        assert.equal(BugListService.normalizeOptions(OPTIONS).length, 3);
        assert.equal(BugListService.normalizeOptions({ data: OPTIONS }).length, 3);
    });

    test('bỏ phần tử không có id, và đặt tên thay thế khi thiếu name', () => {
        const result = BugListService.normalizeOptions({ data: [null, { name: 'x' }, { id: 2 }] });
        assert.deepEqual(result, [{ id: 2, name: '#2', description: '' }]);
    });

    test('payload rác trả về mảng rỗng chứ không ném', () => {
        assert.deepEqual(BugListService.normalizeOptions(null), []);
        assert.deepEqual(BugListService.normalizeOptions({ data: 'nope' }), []);
    });
});

describe('filterOptions', () => {
    const ids = (term) => BugListService.filterOptions(OPTIONS, term).map((o) => o.id);

    test('khớp theo tên', () => assert.deepEqual(ids('alt'), [1]));
    test('khớp theo mô tả', () => assert.deepEqual(ids('design'), [8]));
    test('không phân biệt hoa thường', () => assert.deepEqual(ids('BROKEN'), [4]));
    test('bỏ dấu tiếng Việt', () => {
        assert.deepEqual(ids('mo ta'), [1]);
        assert.deepEqual(ids('mau'), [8]);
    });
    test('từ khoá rỗng giữ nguyên toàn bộ', () => {
        assert.equal(BugListService.filterOptions(OPTIONS, '   ').length, 3);
    });
});

describe('sanitizeIds', () => {
    // Number(null) và Number('') đều ra 0 — từng lọt qua thành id 0.
    const cases = [
        [[1, 4, 1, '8', 'abc', null, 4], [1, 4, 8], 'khử trùng lặp và giá trị rác'],
        [[null, undefined, '', 0, -3, 2.5], [], 'loại null/rỗng/0/âm/thập phân'],
        [[true, false, '7'], [7], 'loại boolean, ép chuỗi số'],
        [[], [], 'mảng rỗng'],
        ['notarray', [], 'không phải mảng'],
        [undefined, [], 'undefined'],
    ];

    for (const [input, expected, label] of cases) {
        test(label, () => assert.deepEqual(BugListService.sanitizeIds(input), expected));
    }
});

describe('resolveSelected', () => {
    test('id đã biết trả về tên thật', () => {
        const names = BugListService.resolveSelected(OPTIONS, [1, 8]).map((o) => o.name);
        assert.deepEqual(names, ['Missing alt text', 'Sai màu nền']);
    });

    test('id lạ giữ lại dưới dạng placeholder thay vì biến mất', () => {
        assert.deepEqual(BugListService.resolveSelected(OPTIONS, [99]), [
            { id: 99, name: '#99', description: '', isUnknown: true },
        ]);
    });
});
