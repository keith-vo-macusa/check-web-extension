# 🎨 Hướng dẫn tạo Icon cho Extension

## 📏 Kích thước cần thiết

- **icon16.png**: 16x16 pixels (thanh công cụ)
- **icon48.png**: 48x48 pixels (trang quản lý extension)
- **icon128.png**: 128x128 pixels (Chrome Web Store)

## 🎯 Thiết kế đề xuất

### Ý tưởng icon:
- **Biểu tượng**: Con bug (🐛) hoặc kính lúp với dấu x
- **Màu chủ đạo**: Đỏ (#ff4757) cho bug, xanh (#007bff) cho tool
- **Style**: Flat design, modern, dễ nhận diện

### Phần tử thiết kế:
1. **Background**: Gradient từ trắng đến xám nhạt
2. **Icon chính**: Bug hoặc search icon
3. **Badge**: Số nhỏ hoặc dấu chấm để chỉ có lỗi

## 🛠️ Công cụ tạo icon

### Online Tools:
- [Favicon.io](https://favicon.io/) - Tạo icon từ text/emoji
- [Canva](https://canva.com) - Thiết kế icon chuyên nghiệp
- [Icons8](https://icons8.com/icon-maker) - Icon maker

### Desktop Tools:
- Adobe Illustrator
- Figma
- GIMP (miễn phí)
- Photoshop

## 📝 Cách tạo nhanh với emoji

Sử dụng emoji 🐛 để tạo icon nhanh:

1. Vào [Favicon.io](https://favicon.io/favicon-generator/)
2. Chọn emoji 🐛 
3. Chọn màu nền trắng
4. Tải về và rename theo kích thước

## 🎨 Template CSS cho icon

```css
.extension-icon {
    width: 16px;
    height: 16px;
    background: linear-gradient(135deg, #ff4757, #ff3742);
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 10px;
}
```

## 📁 Đặt file

Sau khi tạo xong, đặt file vào thư mục `assets/`:
- `assets/icon16.png`
- `assets/icon48.png`  
- `assets/icon128.png`

## ✅ Kiểm tra

1. Icon hiển thị rõ ràng ở tất cả kích thước
2. Phù hợp với theme của Chrome
3. Dễ nhận diện và phân biệt với extension khác 