import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    isOwnComment,
    renderComments,
    renderCommentsSkeleton,
} from '../src/content/ui/CommentList.js';

const ME = { id: 7, name: 'Kiet', email: 'Kiet@Macusa.com' };
const comment = (overrides = {}) => ({
    id: 'c1',
    text: 'hello',
    timestamp: Date.now(),
    author: { id: 7, name: 'Kiet', email: 'kiet@macusa.com' },
    ...overrides,
});

describe('isOwnComment', () => {
    test('khớp theo id, kể cả số với chuỗi', () => {
        assert.ok(isOwnComment(comment({ author: { id: '7' } }), ME));
        assert.ok(isOwnComment(comment({ author: { id: 7 } }), ME));
    });

    test('khớp theo email không phân biệt hoa thường khi thiếu id', () => {
        assert.ok(isOwnComment(comment({ author: { email: 'KIET@macusa.com' } }), ME));
    });

    test('người khác thì không', () => {
        assert.equal(isOwnComment(comment({ author: { id: 9, email: 'x@y.z' } }), ME), false);
    });

    test('thiếu author hoặc thiếu userInfo đều trả false', () => {
        assert.equal(isOwnComment(comment({ author: null }), ME), false);
        assert.equal(isOwnComment(comment(), null), false);
        assert.equal(isOwnComment({}, ME), false);
    });

    test('hai bên cùng thiếu id và email không được coi là trùng', () => {
        assert.equal(isOwnComment(comment({ author: { name: 'x' } }), { name: 'y' }), false);
    });
});

describe('renderComments', () => {
    const render = (comments, user = ME) => String(renderComments(comments, user));

    test('escape nội dung bình luận', () => {
        const output = render([comment({ text: '<img src=x onerror=alert(1)>' })]);
        assert.ok(output.includes('&lt;img src=x onerror=alert(1)&gt;'));
        assert.ok(!output.includes('<img src=x'));
    });

    test('escape tên tác giả', () => {
        const output = render([comment({ author: { id: 7, name: '<script>x</script>' } })]);
        assert.ok(!output.includes('<script>'));
        assert.ok(output.includes('&lt;script&gt;'));
    });

    test('dấu nháy trong nội dung không thoát được ra ngoài thuộc tính', () => {
        // data-original="${text}" từng là lỗ ở đây: sanitizeHtml không escape nháy.
        const output = render([comment({ text: '" onmouseover="alert(1)' })]);
        assert.ok(!output.includes('onmouseover="alert'));
    });

    test('link trong nội dung vẫn thành thẻ a', () => {
        const output = render([comment({ text: 'xem https://example.com nhé' })]);
        assert.ok(output.includes('<a href="https://example.com"'));
    });

    test('chỉ bình luận của mình mới có nút sửa/xoá', () => {
        const mine = render([comment()]);
        assert.ok(mine.includes('btn-edit-comment') && mine.includes('btn-delete-comment'));

        const theirs = render([comment({ author: { id: 99, email: 'x@y.z' } })]);
        assert.ok(!theirs.includes('btn-edit-comment'));
        assert.ok(theirs.includes('btn-reply-comment'), 'ai cũng trả lời được');
    });

    test('nhãn "đã chỉnh sửa" chỉ hiện khi edited', () => {
        assert.ok(!render([comment()]).includes('comment-edited'));
        assert.ok(render([comment({ edited: true })]).includes('comment-edited'));
    });

    test('data-comment-id để handler tìm đúng bình luận', () => {
        assert.ok(render([comment({ id: 42 })]).includes('data-comment-id="42"'));
    });

    test('danh sách rỗng, null và undefined đều ra chuỗi rỗng', () => {
        assert.equal(render([]).trim(), '');
        assert.equal(render(null).trim(), '');
        assert.equal(render(undefined).trim(), '');
    });

    test('tác giả thiếu tên hiển thị Unknown', () => {
        assert.ok(render([comment({ author: { id: 7 } })]).includes('Unknown'));
    });
});

describe('renderCommentsSkeleton', () => {
    test('mặc định 3 khối', () => {
        const output = String(renderCommentsSkeleton());
        assert.equal(output.split('comment-skeleton"').length - 1, 3);
    });

    test('số khối theo tham số', () => {
        const output = String(renderCommentsSkeleton(5));
        assert.equal(output.split('comment-skeleton"').length - 1, 5);
    });

    test('có role status cho trình đọc màn hình', () => {
        assert.ok(String(renderCommentsSkeleton()).includes('role="status"'));
    });
});
