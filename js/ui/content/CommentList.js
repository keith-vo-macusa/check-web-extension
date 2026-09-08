import { ValidationService } from '../../utils/ValidationService.js';
import { formatTime } from '../../shared/format.js';
import { html, raw, escapeHtml } from '../shared/html.js';

/**
 * Dựng markup cho danh sách bình luận trong panel thread.
 *
 * Không đụng tới DOM — chỉ nhận dữ liệu và trả chuỗi — nên test được thẳng,
 * và đây là chỗ nội dung người dùng nhập đi vào HTML nên đáng để test.
 */

/**
 * Bình luận có phải của chính người đang xem không.
 *
 * So cả id lẫn email vì id có thể là số từ server còn local là chuỗi, và bình
 * luận cũ có thể chỉ có email.
 */
export function isOwnComment(comment, userInfo) {
    const commentAuthor = comment?.author;
    if (!commentAuthor || !userInfo) return false;

    if (commentAuthor.id != null && userInfo.id != null) {
        if (String(commentAuthor.id) === String(userInfo.id)) return true;
    }
    if (commentAuthor.email && userInfo.email) {
        return commentAuthor.email.toLowerCase() === userInfo.email.toLowerCase();
    }
    return false;
}

function renderComment(comment, userInfo) {
    const authorName = comment.author?.name || 'Unknown';
    // linkify chạy trên chuỗi đã escape nên thẻ <a> nó sinh ra là tin cậy.
    const linkedText = raw(ValidationService.linkify(escapeHtml(comment.text)));

    return html`
        <div class="comment-item" data-comment-id="${comment.id}">
            <div class="comment-avatar">
                <div class="avatar-circle">${authorName.charAt(0).toUpperCase()}</div>
            </div>
            <div class="comment-content">
                <div class="comment-bubble">
                    <div class="comment-header">
                        <span class="comment-author">${authorName}</span>
                        <span class="comment-time">${formatTime(comment.timestamp)}</span>
                        ${
                            comment.edited
                                ? html`
                                      <span class="comment-edited">(đã chỉnh sửa)</span>
                                  `
                                : ''
                        }
                    </div>
                    <div class="comment-text">${linkedText}</div>
                </div>
                <div class="comment-actions">
                    <button class="btn-reply-comment" data-comment-id="${comment.id}">
                        Trả lời
                    </button>
                    ${
                        isOwnComment(comment, userInfo)
                            ? html`
                                  <button class="btn-edit-comment" data-comment-id="${comment.id}">
                                      Chỉnh sửa
                                  </button>
                                  <button
                                      class="btn-delete-comment"
                                      data-comment-id="${comment.id}"
                                  >
                                      Xóa
                                  </button>
                              `
                            : ''
                    }
                </div>
            </div>
        </div>
    `;
}

export function renderComments(comments, userInfo) {
    return html`
        ${(comments ?? []).map((comment) => renderComment(comment, userInfo))}
    `;
}

/**
 * Khung xám thay chỗ danh sách trong lúc chờ dữ liệu mới từ server.
 * Kích thước bám theo comment thật để danh sách không nhảy khi swap.
 */
export function renderCommentsSkeleton(itemCount = 3) {
    const items = Array.from({ length: itemCount }, (unused, index) => {
        const hasExtraLine = index % 2 === 0;
        return html`
            <div class="comment-skeleton">
                <div class="skeleton-block skeleton-avatar"></div>
                <div class="skeleton-bubble">
                    <div class="skeleton-block skeleton-line skeleton-line-name"></div>
                    <div class="skeleton-block skeleton-line skeleton-line-text"></div>
                    ${
                        hasExtraLine
                            ? html`
                                  <div
                                      class="skeleton-block skeleton-line skeleton-line-short"
                                  ></div>
                              `
                            : ''
                    }
                </div>
            </div>
        `;
    });

    return html`
        <div class="comments-skeleton" role="status" aria-label="Đang tải bình luận">${items}</div>
    `;
}
