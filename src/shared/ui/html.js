/**
 * Tagged template dựng HTML, mặc định escape mọi giá trị chèn vào.
 *
 * Trước đây mỗi chỗ tự nhớ gọi ValidationService.sanitizeHtml, mà quên một lần
 * là thành lỗ XSS — nội dung comment và tên loại lỗi đều do người dùng nhập.
 * Ở đây quy tắc bị đảo lại: an toàn là mặc định, muốn chèn HTML thô thì phải
 * nói rõ bằng raw().
 *
 *   html`<div title="${name}">${text}</div>`     // name, text được escape
 *   html`<div>${raw(linkifiedText)}</div>`       // cố ý giữ nguyên thẻ
 *
 * Khác với sanitizeHtml cũ (dựa vào document.createElement), hàm này thuần
 * chuỗi nên chạy được cả trong test lẫn service worker.
 */

const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/** Đánh dấu chuỗi đã là HTML tin cậy, html`` sẽ chèn nguyên văn. */
class RawHtml {
    constructor(value) {
        this.value = String(value ?? '');
    }
    toString() {
        return this.value;
    }
}

export function raw(value) {
    return new RawHtml(value);
}

export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (character) => ESCAPE_MAP[character]);
}

/**
 * Mảng được nối lại, nên list con dựng bằng .map(html`...`) dùng thẳng được.
 */
function renderValue(value) {
    if (value === null || value === undefined || value === false) return '';
    if (value instanceof RawHtml) return value.value;
    if (Array.isArray(value)) return value.map(renderValue).join('');
    return escapeHtml(value);
}

export function html(strings, ...values) {
    return raw(
        strings.reduce((output, chunk, index) => output + renderValue(values[index - 1]) + chunk),
    );
}
