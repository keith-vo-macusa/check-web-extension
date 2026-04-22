# Website Testing Assistant - Chrome Extension

## Mô tả

Chrome Extension (Manifest V3) hỗ trợ tester kiểm tra website. Cho phép chọn vùng lỗi trực tiếp trên
giao diện, thêm comment, quản lý trạng thái lỗi và đồng bộ với server.

---

## Tính năng chính

### Chọn vùng lỗi

- **Border Mode**: Click vào element để đánh dấu lỗi theo vùng element
- **Rect Mode**: Kéo thả để vẽ vùng lỗi tự do
- Hỗ trợ **responsive breakpoints** (Desktop, Tablet, Mobile)
- **Smart Hover**: Di chuột vào vùng chồng lấp → error nhỏ nhất tự động nổi lên trên

### Comment System

- Thread comments (nhiều người có thể comment)
- Chỉnh sửa/xóa comment của mình
- Tooltip preview khi hover
- Ctrl+Enter để lưu nhanh

### Quản lý lỗi

- Danh sách lỗi theo trang
- Lọc theo trạng thái: **Open** / **Resolved**
- Lọc theo breakpoint: Desktop / Tablet / Mobile
- Toggle hiển thị/ẩn error markers
- Xóa đơn lẻ hoặc xóa tất cả

### Thông báo & Updates

- Gửi thông báo lỗi đến team
- Tự động check update phiên bản mới
- Badge hiển thị số lỗi

---

## Công nghệ sử dụng

| Công nghệ                | Mục đích                       |
| ------------------------ | ------------------------------ |
| **Manifest V3**          | Chrome Extension API mới nhất  |
| **ES6 Modules**          | Modern JavaScript architecture |
| **Vite**                 | Build tool                     |
| **jQuery 3.7.1**         | DOM manipulation (popup)       |
| **SweetAlert2**          | Beautiful modals               |
| **Chrome Storage API**   | Lưu trữ local                  |
| **Chrome Messaging API** | Giao tiếp giữa components      |

---

## Cấu trúc dự án

```
check-web-extension/
├── manifest.json              # Cấu hình extension (v1.2.3)
├── background.js              # Service Worker
├── content.js                 # Main content script class
├── content-loader.js          # Loader cho content script
│
├── screens/
│   ├── login.html             # Màn hình đăng nhập
│   ├── popup.html             # Popup chính
│   └── offscreen.html         # Offscreen document
│
├── js/
│   ├── auth.js                # Authentication manager
│   ├── login.js               # Login logic
│   ├── popup.js               # Popup logic
│   ├── utils.js               # Utilities
│   │
│   ├── config/
│   │   └── ConfigurationManager.js    # Centralized config
│   │
│   ├── constants/
│   │   └── index.js           # App constants
│   │
│   ├── core/
│   │   ├── StorageService.js      # Chrome Storage wrapper
│   │   ├── MessagingService.js    # Chrome Messaging wrapper
│   │   ├── TabsService.js         # Tabs management
│   │   └── WindowsService.js      # Windows management
│   │
│   ├── domain/
│   │   ├── ErrorDataManager.js    # Error CRUD & API sync
│   │   ├── ErrorRenderer.js       # Render error markers
│   │   ├── SelectionHandler.js    # Element selection logic
│   │   ├── CommentModal.js        # Comment input modal
│   │   ├── CommentThreadManager.js # Comment thread UI
│   │   └── CoordinatesCalculator.js # Position calculations
│   │
│   ├── services/
│   │   ├── BadgeService.js        # Extension badge
│   │   ├── NotificationManager.js # Notifications
│   │   ├── UpdateChecker.js       # Version updates
│   │   ├── AlertManager.js        # SweetAlert wrapper
│   │   └── TabManager.js          # Tab utilities
│   │
│   └── utils/
│       ├── ErrorLogger.js         # Logging utility
│       └── ValidationService.js   # Input validation
│
├── css/
│   ├── content.css            # Styles injected vào trang
│   ├── login.css              # Login screen styles
│   └── popup.css              # Popup styles
│
├── lib/
│   ├── jquery.min.js          # jQuery
│   └── sweet-alert/           # SweetAlert2
│
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Kiến trúc hệ thống

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CHROME EXTENSION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐     Messages     ┌─────────────────────────┐   │
│  │   Popup     │ ◄──────────────► │    Background Script    │   │
│  │  (popup.js) │                  │    (Service Worker)     │   │
│  └─────────────┘                  └───────────┬─────────────┘   │
│         │                                     │                   │
│         │                                     │ API Calls         │
│         │                                     ▼                   │
│         │                         ┌─────────────────────────┐   │
│         │                         │   Backend API Server     │   │
│         │                         │  (wpm.macusaone.com)     │   │
│         │                         └─────────────────────────┘   │
│         │                                     │                   │
│         │              Messages               │                   │
│         └──────────────────┬──────────────────┘                   │
│                            ▼                                       │
│                  ┌─────────────────────────────────────────┐     │
│                  │           Content Script                 │     │
│                  │  ┌─────────────────────────────────┐    │     │
│                  │  │   WebsiteTestingAssistant       │    │     │
│                  │  │                                  │    │     │
│                  │  │  ├── ErrorDataManager           │    │     │
│                  │  │  ├── ErrorRenderer              │    │     │
│                  │  │  ├── SelectionHandler           │    │     │
│                  │  │  ├── CommentModal               │    │     │
│                  │  │  └── CommentThreadManager       │    │     │
│                  │  └─────────────────────────────────┘    │     │
│                  └─────────────────────────────────────────┘     │
│                                    │                               │
│                                    ▼                               │
│                          ┌─────────────────┐                      │
│                          │   Target Website │                      │
│                          │  (DOM injection) │                      │
│                          └─────────────────┘                      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   User Action                                                     │
│       │                                                           │
│       ▼                                                           │
│   SelectionHandler ──► CommentModal ──► ErrorDataManager         │
│                                              │                    │
│                                              ▼                    │
│                                    ┌─────────────────┐           │
│                                    │ MessagingService │           │
│                                    └────────┬────────┘           │
│                                              │                    │
│                            ┌─────────────────┼─────────────────┐ │
│                            ▼                 ▼                  ▼ │
│                    Background Script    Chrome Storage    API Server
│                            │                 │                  │ │
│                            └─────────────────┼──────────────────┘ │
│                                              │                    │
│                                              ▼                    │
│                                       ErrorRenderer               │
│                                              │                    │
│                                              ▼                    │
│                                    DOM (Error Markers)            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Structures

### Error Object

```javascript
{
  "id": "uuid-v4",
  "type": "border" | "rect",
  "status": "open" | "resolved",
  "url": "https://example.com/page",
  "breakpoint": {
    "type": "desktop" | "tablet" | "mobile",
    "width": 1920,
    "height": 1080
  },
  "elementIdentifiers": {           // For border type
    "xpath": "/html/body/div[1]/..."
  },
  "coordinates": {                  // For rect type
    "left": 100,
    "top": 200,
    "width": 300,
    "height": 150,
    "responsive": {
      "left": 5.2,    // % of document width
      "top": 10.5,    // % of document height
      "width": 15.6,  // vw
      "height": 10.2  // vh
    }
  },
  "comments": [
    {
      "id": "comment-uuid",
      "text": "Lỗi font size",
      "author": {
        "id": "user-id",
        "name": "Tester Name"
      },
      "timestamp": "2024-01-29T10:00:00Z",
      "editedAt": null
    }
  ],
  "timestamp": 1706518800000
}
```

### API Data Structure (per domain)

```javascript
{
  "domain": "example.com",
  "errors": [ /* Array of Error objects */ ],
  "lastUpdated": "2024-01-29T10:00:00Z"
}
```

### User Info (Chrome Storage)

```javascript
{
  "isAuthenticated": true,
  "userInfo": {
    "id": "user-id",
    "name": "Tester Name",
    "email": "tester@example.com",
    "accessToken": "jwt-token",
    "roles": ["TESTER"],
    "permissions": ["SITE_CHECK"],
    "loginTime": "2024-01-29T08:00:00Z"
  }
}
```

---

## API Endpoints

| Method | Endpoint                                       | Description            |
| ------ | ---------------------------------------------- | ---------------------- |
| `POST` | `/api/loginForExt`                             | Đăng nhập              |
| `GET`  | `/api/v1/websites/check-wise/ext/{domain}`     | Lấy errors theo domain |
| `PUT`  | `/api/v1/websites/check-wise/ext/{domain}`     | Cập nhật errors        |
| `POST` | `/api/v1/websites/check-wise/ext/notification` | Gửi thông báo lỗi      |

**Base URL**: `https://wpm.macusaone.com/`

---

## Phím tắt

| Phím tắt       | Chức năng                      |
| -------------- | ------------------------------ |
| `Shift + W`    | Toggle chế độ chọn lỗi         |
| `Shift + E`    | Toggle hiển thị tất cả lỗi     |
| `Ctrl + Enter` | Lưu comment nhanh              |
| `Escape`       | Thoát chế độ chọn / đóng modal |

---

## Core Services

### StorageService

Wrapper cho Chrome Storage API với Promise-based interface.

```javascript
import { StorageService } from './core/StorageService.js';

// Get
const data = await StorageService.get('key');
const safe = await StorageService.getSafe('key', defaultValue);

// Set
await StorageService.set({ key: value });

// Remove
await StorageService.remove('key');
```

### MessagingService

Giao tiếp giữa popup, background, và content script.

```javascript
import { MessagingService } from './core/MessagingService.js';

// Send to background
const response = await MessagingService.sendToBackground({ action: 'getState' });

// Send to content script
await MessagingService.sendToContentScript({ action: 'activate' });

// Add listener
const cleanup = MessagingService.addListener((message, sender) => {
    // Handle message
});
```

### ConfigurationManager

Centralized configuration và constants.

```javascript
import { ConfigurationManager } from './config/ConfigurationManager.js';

// Constants
ConfigurationManager.ERROR_STATUS.OPEN; // 'open'
ConfigurationManager.ACTIONS.ACTIVATE; // 'activate'
ConfigurationManager.API.BASE_URL; // 'https://wpm.macusaone.com/'

// Helper methods
ConfigurationManager.getApiUrl('LOGIN');
ConfigurationManager.getBreakpointType(window.innerWidth);
ConfigurationManager.isCheckwiseAdmin(userInfo);
```

---

## ErrorRenderer - Smart Hover

Xử lý trường hợp nhiều errors lồng nhau:

1. **Z-index by Area**: Error nhỏ hơn có z-index cao hơn (mặc định)
2. **Smart Hover**: Khi di chuột, error nhỏ nhất chứa chuột tự động nổi lên trên

```javascript
// Throttled mousemove listener
document.addEventListener('mousemove', (e) => {
    // Find all errors containing mouse position
    // Boost z-index of smallest one
});
```

---

## Scripts

```bash
# Development (watch mode)
npm run dev

# Production build
npm run build

# Clean build
npm run build:clean
```

---

## Release Workflow (GitHub Actions)

Repository được cấu hình workflow release tự động tại `.github/workflows/build-and-release.yml`.

### Cách phát hành bản mới

1. Cập nhật version trong `manifest.json` (ví dụ: `1.2.0`)
2. Commit và push code lên `main`
3. Tạo tag đúng format `v<version>`

```bash
git tag v1.2.0
git push origin v1.2.0
```

### Workflow sẽ tự động

- chạy `npm ci`
- chạy `npm run build`
- đóng gói `dist` thành file zip
- tạo GitHub Release và upload file zip

### Lưu ý quan trọng

- Workflow chỉ chạy release khi push tag `v*`
- Tag phải khớp với version trong `manifest.json`
    - Ví dụ hợp lệ: tag `v1.2.0` và `manifest.json.version = 1.2.0`
    - Nếu không khớp, workflow sẽ fail để tránh phát hành sai version

### Pre-release checklist

- [ ] Bump version trong `manifest.json`
- [ ] Chạy build local: `npm run build`
- [ ] Smoke test nhanh extension (login, popup, chọn lỗi, gửi message background/content)
- [ ] Commit + push code lên `main`
- [ ] Tạo và push tag phát hành: `v<version>`

---

## Installation

1. **Clone repository**

    ```bash
    git clone https://github.com/keith-vo-macusa/check-web-extension.git
    cd check-web-extension
    ```

2. **Install dependencies**

    ```bash
    npm install
    ```

3. **Build**

    ```bash
    npm run build
    ```

4. **Load in Chrome**
    - Open `chrome://extensions/`
    - Enable "Developer mode"
    - Click "Load unpacked"
    - Select the project folder

---

## Debugging

### Console Logs

Extension sử dụng `ErrorLogger` với các log levels:

- `[INFO]` - Thông tin operation thành công
- `[WARN]` - Cảnh báo non-critical
- `[ERROR]` - Lỗi cần xử lý
- `[DEBUG]` - Chi tiết debug (development)

### Common Issues

| Vấn đề                          | Nguyên nhân                | Giải pháp              |
| ------------------------------- | -------------------------- | ---------------------- |
| "Extension context invalidated" | Extension bị reload        | Refresh trang web      |
| "Content script not available"  | Content script chưa inject | Refresh trang web      |
| Errors không hiển thị           | Toggle visibility tắt      | Bật toggle trong popup |
| API call failed                 | Token hết hạn              | Đăng nhập lại          |

---

## License

MIT License - Xem file LICENSE để biết thêm chi tiết.

---

**Made by MACUSA Development Team**
