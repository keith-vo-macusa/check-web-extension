/**
 * Vân tay rẻ tiền của mọi thứ danh sách lỗi thực sự render.
 *
 * Signature giống nhau nghĩa là vẽ lại sẽ ra DOM y hệt — popup dùng nó để bỏ
 * qua lượt render thừa, tránh nháy màn hình và mất vị trí cuộn khi kiểm tra lại
 * dữ liệu lúc được focus.
 */
export function buildErrorsSignature(errors) {
    return errors
        .map((error) =>
            [
                error.id,
                error.status ?? 'open',
                error.comments?.length ?? 0,
                error.comments?.[error.comments.length - 1]?.text ?? '',
                (error.bug_list_ids ?? []).join('.'),
                error.breakpoint?.type ?? '',
                error.url ?? '',
            ].join(':'),
        )
        .join('|');
}
