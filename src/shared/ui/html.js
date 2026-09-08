/**
 * Tagged template for HTML that escapes every interpolated value by default.
 *
 * Call sites used to be responsible for remembering ValidationService.sanitizeHtml,
 * and forgetting once is an XSS hole — comment text and bug list names are user
 * input. This inverts the rule: safe unless you say otherwise with raw().
 *
 *   html`<div title="${name}">${text}</div>`   // name and text are escaped
 *   html`<div>${raw(linkifiedText)}</div>`     // markup kept on purpose
 *
 * Unlike sanitizeHtml, which relies on document.createElement, this is pure
 * string work, so it also runs in tests and in the service worker.
 */

const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/** Marks a string as trusted HTML so html`` inserts it verbatim. */
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
 * Arrays are joined, so a list built with .map(html`...`) can be dropped in as is.
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
