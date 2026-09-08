import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateUUID } from '../src/content/id.js';
import { formatTime, getStatusText } from '../src/content/format.js';
import { buildErrorsSignature } from '../src/popup/errorsSignature.js';

describe('generateUUID', () => {
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    test('đúng định dạng UUID v4', () => assert.match(generateUUID(), UUID_V4));

    test('không trùng nhau qua 1000 lần sinh', () => {
        const ids = new Set(Array.from({ length: 1000 }, generateUUID));
        assert.equal(ids.size, 1000);
    });

    test('ValidationService.validateErrorData chấp nhận id sinh ra', async () => {
        globalThis.document = { createElement: () => ({ textContent: '', innerHTML: '' }) };
        const { ValidationService } = await import('../src/shared/ValidationService.js');
        assert.ok(ValidationService.isValidUUID(generateUUID()));
    });
});

describe('formatTime', () => {
    const ago = (milliseconds) => formatTime(Date.now() - milliseconds);

    test('dưới 1 phút', () => assert.equal(ago(5_000), 'Vừa xong'));
    test('phút', () => assert.equal(ago(5 * 60_000), '5 phút trước'));
    test('giờ', () => assert.equal(ago(2 * 3_600_000), '2 giờ trước'));
    test('ngày', () => assert.equal(ago(3 * 86_400_000), '3 ngày trước'));
});

describe('getStatusText', () => {
    test('các trạng thái đã biết', () => {
        assert.equal(getStatusText('open'), 'Mở');
        assert.equal(getStatusText('resolved'), 'Đã giải quyết');
        assert.equal(getStatusText('closed'), 'Đã đóng');
    });
    test('trạng thái lạ hoặc thiếu mặc định về Mở', () => {
        assert.equal(getStatusText('bogus'), 'Mở');
        assert.equal(getStatusText(undefined), 'Mở');
    });
});

describe('buildErrorsSignature', () => {
    const base = () => [
        {
            id: 'a',
            status: 'open',
            comments: [{ text: 'hi' }],
            bug_list_ids: [1, 4],
            breakpoint: { type: 'mobile' },
            url: 'https://s/1',
        },
        {
            id: 'b',
            status: 'resolved',
            comments: [{ text: 'x' }, { text: 'y' }],
            bug_list_ids: [],
            breakpoint: { type: 'desktop' },
            url: 'https://s/2',
        },
    ];
    const reference = buildErrorsSignature(base());
    const signatureAfter = (mutate) => buildErrorsSignature(mutate(base()));

    test('dữ liệu y hệt cho signature giống nhau', () => {
        assert.equal(
            signatureAfter((errors) => errors),
            reference,
        );
    });

    const changes = [
        ['đổi status', (e) => ((e[0].status = 'resolved'), e)],
        ['thêm comment', (e) => (e[0].comments.push({ text: 'new' }), e)],
        ['sửa text comment cuối', (e) => ((e[1].comments[1].text = 'z'), e)],
        ['đổi bug_list_ids', (e) => ((e[0].bug_list_ids = [1, 4, 8]), e)],
        ['xoá một lỗi', (e) => e.slice(0, 1)],
        ['đổi thứ tự', (e) => [e[1], e[0]]],
    ];

    for (const [label, mutate] of changes) {
        test(`${label} phải đổi signature`, () => {
            assert.notEqual(signatureAfter(mutate), reference);
        });
    }

    test('không vỡ khi thiếu hẳn field', () => {
        assert.doesNotThrow(() => buildErrorsSignature([{ id: 'c' }]));
    });
});
