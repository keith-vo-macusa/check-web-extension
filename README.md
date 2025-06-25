# 🐛 Website Testing Assistant - Chrome Extension

## 📋 Mô tả

Chrome Extension hỗ trợ tester kiểm tra website, cho phép chọn vùng lỗi trên giao diện, thêm bình luận trực tiếp vào vùng lỗi, và hiển thị danh sách các lỗi đã được ghi nhận.

## ✨ Tính năng chính

### 🎯 Chọn vùng bị lỗi
- Click để kích hoạt chế độ chọn lỗi
- Hover để highlight phần tử
- Click để chọn vùng lỗi cần ghi nhận
- Hiển thị trực quan vùng được chọn với viền đỏ

### 💬 Thêm comment trực tiếp
- Modal popup để nhập comment cho lỗi
- Hỗ trợ Ctrl+Enter để lưu nhanh
- Giới hạn 500 ký tự
- Hiển thị tooltip khi hover vào marker lỗi

### 📋 Quản lý danh sách lỗi
- Hiển thị tất cả lỗi đã ghi nhận trên trang
- Tìm kiếm lỗi theo comment hoặc selector
- Click vào lỗi để highlight vùng tương ứng
- Xóa tất cả lỗi với xác nhận

### 💾 Lưu trữ dữ liệu
- Dữ liệu được lưu trong Chrome Storage theo URL
- Giữ nguyên sau khi refresh trang (F5)
- Tự động xóa dữ liệu cũ hơn 1 tuần

## 🚀 Cài đặt

1. **Tải extension:**
   ```bash
   git clone <repository-url>
   cd mac-extension
   ```

2. **Cài đặt extension trong Chrome:**
   - Mở Chrome và truy cập `chrome://extensions/`
   - Bật "Developer mode" ở góc phải trên
   - Click "Load unpacked"
   - Chọn thư mục chứa extension

3. **Sử dụng extension:**
   - Click vào icon extension trên thanh công cụ
   - Click "🎯 Bắt đầu chọn lỗi" để kích hoạt
   - Click vào vùng lỗi trên website
   - Nhập comment và lưu

## 🎮 Hướng dẫn sử dụng

### Bước 1: Kích hoạt chế độ chọn lỗi
- Click vào icon extension
- Click nút "🎯 Bắt đầu chọn lỗi"
- Con trỏ sẽ chuyển thành dạng crosshair

### Bước 2: Chọn vùng lỗi
- Di chuyển chuột để highlight phần tử
- Click vào phần tử cần ghi nhận lỗi
- Modal comment sẽ xuất hiện

### Bước 3: Thêm comment
- Nhập mô tả lỗi vào textarea
- Có thể sử dụng Ctrl+Enter để lưu nhanh
- Click "Lưu" để hoàn tất

### Bước 4: Quản lý lỗi
- Xem danh sách lỗi trong popup
- Tìm kiếm bằng ô search
- Click vào lỗi để highlight trên trang
- Sử dụng các nút hiển thị/ẩn tất cả

## 🛠️ Cấu trúc dự án

```
mac-extension/
├── manifest.json          # Cấu hình extension
├── popup.html             # Giao diện popup
├── popup.js               # Logic popup
├── content.js             # Script inject vào trang web
├── content.css            # Styles cho content
├── background.js          # Service worker
├── lib/
│   └── jquery.min.js     # jQuery library
├── assets/
│   ├── icon16.png        # Icon 16x16
│   ├── icon48.png        # Icon 48x48
│   └── icon128.png       # Icon 128x128
└── README.md             # Tài liệu này
```

## 🎨 Giao diện

### Popup Interface
- **Header**: Tiêu đề và mô tả ngắn
- **Controls**: Các nút điều khiển chính
- **Status**: Hiển thị trạng thái hoạt động
- **Errors List**: Danh sách lỗi với tìm kiếm

### Content Interface
- **Error Markers**: Chấm đỏ đánh số thứ tự
- **Tooltips**: Hiển thị comment khi hover
- **Highlight**: Viền vàng khi click từ danh sách
- **Modal**: Form nhập comment

## 🔧 Công nghệ sử dụng

- **Manifest V3**: Chrome Extension API mới nhất
- **jQuery 3.7.1**: DOM manipulation và event handling
- **Chrome Storage API**: Lưu trữ dữ liệu cục bộ
- **CSS3**: Animations và responsive design
- **ES6+**: Modern JavaScript features

## 📊 Lưu trữ dữ liệu

Extension sử dụng Chrome Storage API để lưu trữ:

```javascript
// Cấu trúc dữ liệu
{
  "https://example.com": [
    {
      "id": "unique-id",
      "comment": "Mô tả lỗi",
      "selector": "div.class#id",
      "timestamp": 1684567890123,
      "position": { top, left, width, height },
      "url": "https://example.com"
    }
  ]
}
```

## 🚧 Roadmap

### Giai đoạn 1 (Hiện tại) - jQuery
- ✅ Chọn vùng lỗi cơ bản
- ✅ Thêm comment với modal
- ✅ Hiển thị danh sách lỗi
- ✅ Lưu trữ trong Chrome Storage
- ✅ Tìm kiếm và lọc lỗi

### Giai đoạn 2 (Tương lai) - React
- 🔄 Migrate sang React
- 🔄 Component-based architecture
- 🔄 State management với Redux/Context
- 🔄 TypeScript support
- 🔄 Unit testing

### Tính năng bổ sung
- 🔮 Export/Import dữ liệu
- 🔮 Chia sẻ lỗi qua URL
- 🔮 Screenshot tự động
- 🔮 Tích hợp với Jira/Trello
- 🔮 Team collaboration
- 🔮 Dark mode

## 🐛 Báo lỗi

Nếu gặp lỗi, vui lòng tạo issue với thông tin:
- Phiên bản Chrome
- URL trang web
- Mô tả lỗi chi tiết
- Screenshot (nếu có)

## 📄 License

MIT License - Xem file LICENSE để biết thêm chi tiết.

## 🤝 Đóng góp

1. Fork dự án
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Tạo Pull Request

---

**Made with ❤️ by Development Team** 