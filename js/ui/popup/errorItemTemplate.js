import { BugListService } from '../../domain/BugListService.js';
import { html } from '../shared/html.js';

/**
 * Markup cho một dòng lỗi trong danh sách của popup.
 *
 * Không đụng jQuery và không đụng DOM — chỉ nhận dữ liệu, trả chuỗi — nên test
 * được. Trước đây nó nằm trong popup.js, mà popup.js kéo jQuery và chạy code
 * DOM ngay lúc import nên không thứ gì bên trong test được.
 */

const STATUS_LABELS = {
    resolved: 'Resolved',
    closed: 'Closed',
    open: 'Open',
};

export function renderStatusBadge(status) {
    const key = status in STATUS_LABELS ? status : 'open';
    return html`
        <span class="status-badge ${key}">${STATUS_LABELS[key]}</span>
    `;
}

/**
 * Chip loại lỗi. Options chưa tải được thì mọi id đều "chưa biết tên" — đừng tô
 * đỏ như tag hỏng, vì đỏ nghĩa là tag đã bị gỡ khỏi bug list.
 */
export function renderBugListTags(error) {
    const selectedIds = BugListService.sanitizeIds(error.bug_list_ids);
    if (selectedIds.length === 0) return '';

    const isOptionsLoaded = BugListService.cachedOptions !== null;
    const options = BugListService.resolveSelected(BugListService.cachedOptions ?? [], selectedIds);

    return html`
        <div class="error-bug-list">
            ${options.map(
                (option) => html`
                    <span
                        class="error-bug-tag${
                            option.isUnknown && isOptionsLoaded ? ' is-unknown' : ''
                        }"
                        title="${option.name}"
                    >
                        ${option.name}
                    </span>
                `,
            )}
        </div>
    `;
}

export function renderErrorItemBody(error, index) {
    const comments = Array.isArray(error.comments) ? error.comments : [];
    const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
    const timestamp = error.timestamp ? new Date(error.timestamp).toLocaleString('vi-VN') : '';
    const isResolved = error.status === 'resolved';
    const resolveLabel = isResolved ? 'Bỏ đánh dấu đã giải quyết' : 'Đánh dấu đã giải quyết';
    const breakpointType = error.breakpoint ? error.breakpoint.type : 'all';
    const breakpointWidth = error.breakpoint ? `${error.breakpoint.width}px` : '';

    return html`
        <div class="error-row">
            <div class="error-main">
                <div class="error-topline">
                    <span class="error-number">#${index + 1}</span>
                    ${renderStatusBadge(error.status)}
                    <span class="error-meta-pill">${comments.length} comment</span>
                    ${
                        timestamp
                            ? html`
                                  <span class="error-time">${timestamp}</span>
                              `
                            : ''
                    }
                </div>

                <div class="error-comment">
                    ${
                        lastComment?.text
                            ? lastComment.text
                            : html`
                                  <span class="error-empty">Không có nội dung</span>
                              `
                    }
                </div>

                ${renderBugListTags(error)}
                <div class="error-bottomline">
                    <span class="breakpoint-type">${breakpointType}</span>
                    ${
                        breakpointWidth
                            ? html`
                                  <span class="breakpoint-width">${breakpointWidth}</span>
                              `
                            : ''
                    }
                    ${
                        error.url
                            ? html`
                                  <span class="error-url" title="${error.url}">${error.url}</span>
                              `
                            : ''
                    }
                </div>
            </div>

            <div class="error-actions">
                <button
                    class="btn-toogle-check-fixed ${isResolved ? 'bg-success' : ''}"
                    data-fixed="${String(isResolved)}"
                    title="${resolveLabel}"
                    aria-label="${resolveLabel}"
                >
                    <i class="fa-solid ${isResolved ? 'fa-x' : 'fa-check'}"></i>
                </button>
                <button class="delete-error-btn" title="Xóa lỗi này" aria-label="Xóa lỗi này">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * Khung xám khi đang tải, kích thước bám theo dòng lỗi thật để list không nhảy.
 */
export function renderErrorsSkeleton(rowCount) {
    const rows = Array.from(
        { length: rowCount },
        () => html`
            <div class="error-item error-skeleton">
                <div class="error-row">
                    <div class="error-main">
                        <div class="skeleton-block skeleton-line skeleton-topline"></div>
                        <div class="skeleton-block skeleton-line skeleton-text"></div>
                        <div class="skeleton-block skeleton-line skeleton-bottomline"></div>
                    </div>
                    <div class="error-actions">
                        <div class="skeleton-block skeleton-action"></div>
                        <div class="skeleton-block skeleton-action"></div>
                    </div>
                </div>
            </div>
        `,
    );

    return html`
        <div class="errors-loading" role="status" aria-label="Đang tải danh sách lỗi">${rows}</div>
    `;
}

export function renderErrorsSummary(errors, breakpointLabel) {
    const openCount = errors.filter((error) => !error.status || error.status === 'open').length;
    const resolvedCount = errors.filter((error) => error.status === 'resolved').length;

    return html`
        <div class="error-count">
            <span>Tổng số lỗi: ${errors.length}</span>
            <span class="breakpoint-label">${breakpointLabel}</span>
        </div>
        <div class="error-group">
            <div class="error-group-header">
                <span>Errors: ${openCount} - Resolved: ${resolvedCount}/${errors.length}</span>
            </div>
        </div>
    `;
}
