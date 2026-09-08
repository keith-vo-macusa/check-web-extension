/**
 * Định dạng hiển thị dùng chung giữa content script và popup.
 */

/** Nhãn thời gian tương đối: "Vừa xong", "5 phút trước", ... */
export function formatTime(timestamp) {
    const elapsedMs = Date.now() - timestamp;
    return elapsedMs < 60000
        ? 'Vừa xong'
        : elapsedMs < 3600000
          ? `${Math.floor(elapsedMs / 60000)} phút trước`
          : elapsedMs < 86400000
            ? `${Math.floor(elapsedMs / 3600000)} giờ trước`
            : `${Math.floor(elapsedMs / 86400000)} ngày trước`;
}

/** Nhãn tiếng Việt cho trạng thái lỗi. */
export function getStatusText(status) {
    return { open: 'Mở', resolved: 'Đã giải quyết', closed: 'Đã đóng' }[status] || 'Mở';
}
