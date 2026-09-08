import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeChrome } from './fakes/chrome.js';

let renderErrorItemBody;
let renderBugListTags;
let renderStatusBadge;
let renderErrorsSkeleton;
let renderErrorsSummary;
let BugListService;

before(async () => {
    globalThis.chrome = createFakeChrome().api;
    ({
        renderErrorItemBody,
        renderBugListTags,
        renderStatusBadge,
        renderErrorsSkeleton,
        renderErrorsSummary,
    } = await import('../js/ui/popup/errorItemTemplate.js'));
    ({ BugListService } = await import('../js/domain/BugListService.js'));
});

beforeEach(() => {
    BugListService.cachedOptions = null;
});

const error = (overrides = {}) => ({
    id: 'e1',
    status: 'open',
    timestamp: Date.now(),
    comments: [{ text: 'nội dung' }],
    breakpoint: { type: 'mobile', width: 375 },
    url: 'https://site.com/a',
    ...overrides,
});

const render = (value) => String(value);

describe('renderStatusBadge', () => {
    test('ba trạng thái đã biết', () => {
        assert.ok(render(renderStatusBadge('resolved')).includes('>Resolved<'));
        assert.ok(render(renderStatusBadge('closed')).includes('>Closed<'));
        assert.ok(render(renderStatusBadge('open')).includes('>Open<'));
    });

    test('trạng thái lạ hoặc thiếu rơi về open', () => {
        assert.ok(render(renderStatusBadge('bogus')).includes('>Open<'));
        assert.ok(render(renderStatusBadge(undefined)).includes('status-badge open'));
    });
});

describe('renderErrorItemBody', () => {
    test('escape nội dung comment cuối', () => {
        const output = render(renderErrorItemBody(error({ comments: [{ text: '<b>x</b>' }] }), 0));
        assert.ok(output.includes('&lt;b&gt;x&lt;/b&gt;'));
        assert.ok(!output.includes('<b>x</b>'));
    });

    test('escape URL, kể cả trong thuộc tính title', () => {
        const output = render(renderErrorItemBody(error({ url: 'https://x/"onload="a' }), 0));
        assert.ok(!output.includes('onload="a"'));
        assert.ok(output.includes('&quot;'));
    });

    test('không có comment thì hiện chỗ trống', () => {
        const output = render(renderErrorItemBody(error({ comments: [] }), 0));
        assert.ok(output.includes('Không có nội dung'));
        assert.ok(output.includes('0 comment'));
    });

    test('comments không phải mảng cũng không vỡ', () => {
        assert.doesNotThrow(() => renderErrorItemBody(error({ comments: null }), 0));
    });

    test('số thứ tự bắt đầu từ 1', () => {
        assert.ok(render(renderErrorItemBody(error(), 0)).includes('#1'));
        assert.ok(render(renderErrorItemBody(error(), 4)).includes('#5'));
    });

    test('nút đổi trạng thái phản ánh đúng resolved', () => {
        const open = render(renderErrorItemBody(error(), 0));
        assert.ok(open.includes('data-fixed="false"') && open.includes('fa-check'));

        const resolved = render(renderErrorItemBody(error({ status: 'resolved' }), 0));
        assert.ok(resolved.includes('data-fixed="true"') && resolved.includes('fa-x'));
        assert.ok(resolved.includes('bg-success'));
    });

    test('thiếu breakpoint, url và timestamp đều bỏ qua gọn', () => {
        const output = render(
            renderErrorItemBody({ id: 'x', comments: [], breakpoint: null, url: '' }, 0),
        );
        assert.ok(output.includes('>all<'));
        assert.ok(!output.includes('error-url'));
        assert.ok(!output.includes('error-time'));
    });
});

describe('renderBugListTags', () => {
    test('không có tag thì không render gì', () => {
        assert.equal(render(renderBugListTags(error({ bug_list_ids: [] }))), '');
        assert.equal(render(renderBugListTags(error())), '');
    });

    test('options chưa tải: hiện #id nhưng KHÔNG tô đỏ', () => {
        const output = render(renderBugListTags(error({ bug_list_ids: [4] })));
        assert.ok(output.includes('#4'));
        assert.ok(!output.includes('is-unknown'));
    });

    test('options đã tải: tên thật, id lạ mới tô đỏ', () => {
        BugListService.cachedOptions = [{ id: 4, name: 'Broken link', description: '' }];
        const output = render(renderBugListTags(error({ bug_list_ids: [4, 99] })));
        assert.ok(output.includes('Broken link'));
        assert.ok(output.includes('is-unknown'));
    });

    test('escape tên loại lỗi', () => {
        BugListService.cachedOptions = [{ id: 1, name: '<script>x</script>', description: '' }];
        const output = render(renderBugListTags(error({ bug_list_ids: [1] })));
        assert.ok(!output.includes('<script>'));
    });
});

describe('renderErrorsSkeleton', () => {
    test('đúng số dòng yêu cầu', () => {
        assert.equal(render(renderErrorsSkeleton(4)).split('error-skeleton').length - 1, 4);
    });
});

describe('renderErrorsSummary', () => {
    test('đếm open và resolved', () => {
        const errors = [
            error(),
            error({ status: 'resolved' }),
            error({ status: 'resolved' }),
            error({ status: undefined }),
        ];
        const output = render(renderErrorsSummary(errors, 'Tất cả breakpoint'));
        assert.ok(output.includes('Tổng số lỗi: 4'));
        assert.ok(output.includes('Errors: 2 - Resolved: 2/4'));
    });

    test('escape nhãn breakpoint', () => {
        assert.ok(!render(renderErrorsSummary([], '<b>x')).includes('<b>x'));
    });
});
