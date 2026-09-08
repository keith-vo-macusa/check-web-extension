// @ts-check
/**
 * Điểm duy nhất chứa URL backend.
 *
 * Build copy source chứ không bundle, nên `import.meta.env` không dùng được ở
 * runtime. Thay vào đó:
 *   - Dev: sửa DUY NHẤT hằng số dưới đây thành localhost.
 *   - Build: vite thay chuỗi này bằng VITE_API_BASE_URL trong .env.
 *   - CI: `npm run check:env` chặn commit nếu file này không giữ URL production.
 *
 * Nhờ vậy chỉ có một dòng cần đổi khi dev, và không thể lỡ tay đẩy localhost lên.
 */
export const API_BASE_URL = 'https://wpm.macusaone.com/';
