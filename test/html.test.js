import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, escapeHtml } from '../src/shared/ui/html.js';

// Whitespace between tags carries no meaning, and prettier reformats the HTML
// inside tagged templates. Normalise it so these assert structure and escaping
// rather than pinning down indentation.
const render = (value) => String(value).replace(/>\s+</g, '><').trim();

describe('escapeHtml', () => {
    test('escape đủ 5 ký tự nguy hiểm', () => {
        assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
    });

    test('escape & trước, không nhân đôi entity', () => {
        assert.equal(escapeHtml('a & <b>'), 'a &amp; &lt;b&gt;');
    });

    test('null và undefined thành chuỗi rỗng', () => {
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
    });

    test('số và boolean được ép chuỗi', () => {
        assert.equal(escapeHtml(0), '0');
        assert.equal(escapeHtml(false), 'false');
    });
});

describe('html', () => {
    test('escape giá trị chèn vào theo mặc định', () => {
        const comment = '<img src=x onerror=alert(1)>';
        assert.equal(
            render(html`
                <div>${comment}</div>
            `),
            '<div>&lt;img src=x onerror=alert(1)&gt;</div>',
        );
    });

    test('escape cả trong thuộc tính, không thoát được khỏi dấu nháy', () => {
        const name = '" onmouseover="alert(1)';
        const output = render(html`
            <span title="${name}"></span>
        `);
        assert.equal(output, '<span title="&quot; onmouseover=&quot;alert(1)"></span>');
        assert.ok(!output.includes('onmouseover="alert'));
    });

    test('raw() chèn nguyên văn cho markup đã dựng sẵn', () => {
        const linkified = '<a href="https://x">https://x</a>';
        assert.equal(
            render(html`
                <p>${raw(linkified)}</p>
            `),
            `<p>${linkified}</p>`,
        );
    });

    test('null, undefined và false biến mất — tiện cho phần tuỳ chọn', () => {
        assert.equal(
            render(html`
                <i>${null}${undefined}${false}</i>
            `),
            '<i></i>',
        );
    });

    test('0 vẫn hiện, không bị nuốt như false', () => {
        assert.equal(
            render(html`
                <i>${0}</i>
            `),
            '<i>0</i>',
        );
    });

    test('mảng được nối lại nên .map() dùng thẳng được', () => {
        const items = ['a', '<b>'];
        assert.equal(
            render(html`
                <ul>
                    ${items.map(
                        (item) => html`
                            <li>${item}</li>
                        `,
                    )}
                </ul>
            `),
            '<ul><li>a</li><li>&lt;b&gt;</li></ul>',
        );
    });

    test('template lồng nhau không bị escape hai lần', () => {
        const inner = html`
            <b>${'a & b'}</b>
        `;
        assert.equal(
            render(html`
                <p>${inner}</p>
            `),
            '<p><b>a &amp; b</b></p>',
        );
    });

    test('template không có giá trị chèn', () => {
        assert.equal(
            render(html`
                <hr />
            `),
            '<hr />',
        );
    });
});
