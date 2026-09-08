/**
 * Display formatting for the content script.
 */

/** Relative time label: "Vừa xong", "5 phút trước", and so on. */
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

/** Vietnamese label for an error status. */
export function getStatusText(status) {
    return { open: 'Mở', resolved: 'Đã giải quyết', closed: 'Đã đóng' }[status] || 'Mở';
}
