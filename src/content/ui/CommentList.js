import { ValidationService } from '../../shared/ValidationService.js';
import { formatTime } from '../format.js';
import { html, raw, escapeHtml } from '../../shared/ui/html.js';

/**
 * Markup for the comment list inside the thread panel.
 *
 * Touches no DOM — data in, string out — so it is directly testable, which matters
 * because this is where user input reaches HTML.
 */

/**
 * Whether a comment belongs to the current viewer.
 *
 * Compares id and email both: ids can be numeric from the server but strings
 * locally, and older comments may carry only an email.
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
    // linkify runs on already-escaped text, so the anchors it emits are trusted.
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
 * Placeholder blocks shown while fresh data is loading. Sized like real comments
 * so the list does not jump when the two swap.
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
