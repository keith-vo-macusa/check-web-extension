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
| **jQuery 3.7.1**         | DOM cho popup (chỉ popup)      |
| **SweetAlert2**          | Modal cho popup (chỉ popup)    |
| **Chrome Storage API**   | Lưu trữ local + session        |
| **Chrome Messaging API** | Giao tiếp giữa components      |
| **node:test**            | Test, không cần dependency     |
| **Prettier**             | Format, kiểm tra trong CI      |

> Content script **không nạp thư viện nào**. jQuery và SweetAlert2 chỉ được popup nạp qua thẻ
> `<script>` của nó — trước đây cả hai bị inject vào mọi trang người dùng ghé (192KB) dù không dùng
> tới.

---

## Cấu trúc dự án

Sắp theo **runtime**, không theo tầng kỹ thuật. Với một MV3 extension, câu hỏi hay gặp nhất khi sửa
code là "cái này chạy ở đâu, đụng vào có vỡ chỗ khác không" — cây thư mục trả lời luôn câu đó.

Thư mục runtime nào chỉ chứa module chỉ chạy trong runtime đó. Muốn vào `shared/` thì phải thật sự
được ít nhất hai runtime dùng.

```
check-web-extension/
├── manifest.json
├── screens/                    # login.html · popup.html · offscreen.html
│
├── src/
│   ├── background/             # service worker
│   │   ├── index.js                # entry: định tuyến message, vòng đời
│   │   ├── BadgeManager.js         # badge + CRUD lỗi phía nền
│   │   ├── DomainErrorCache.js     # cache theo domain, ghi xuống storage.session
│   │   ├── WindowsManager.js       # mở/resize cửa sổ xem lỗi
│   │   ├── WindowsService.js       # bọc chrome.windows
│   │   └── UpdateChecker.js        # kiểm tra phiên bản mới
│   │
│   ├── content/                # content script chạy trong trang
│   │   ├── loader.js               # entry trong manifest, bỏ qua iframe editor
│   │   ├── index.js                # lắp ráp các thành phần
│   │   ├── ErrorStore.js           # nguồn sự thật duy nhất cho lỗi của tab
│   │   ├── ErrorDataManager.js     # CRUD lỗi qua API + đồng bộ store
│   │   ├── ErrorRenderer.js        # vẽ overlay đánh dấu lỗi
│   │   ├── SelectionHandler.js     # chọn element / kéo vùng
│   │   ├── CoordinatesCalculator.js
│   │   ├── CommentThreadManager.js # panel bình luận
│   │   ├── elementFingerprint.js   # nhận diện lại element sau khi reload
│   │   ├── format.js · id.js
│   │   └── ui/                     # thành phần DOM
│   │       ├── CommentInputModal.js · CommentList.js
│   │       ├── ThreadBugListRow.js · BugListPicker.js
│   │       └── buttonLoading.js
│   │
│   ├── popup/                  # popup của extension
│   │   ├── index.js                # entry: đăng nhập, lắp ráp
│   │   ├── PopupController.js      # gắn sự kiện, vẽ danh sách
│   │   ├── PopupState.js           # trạng thái hiển thị
│   │   ├── ErrorItemTemplate.js    # markup dòng lỗi (thuần chuỗi)
│   │   ├── PopupErrors.js          # cổng dữ liệu: API + cache nền
│   │   ├── ErrorsSignature.js      # vân tay để bỏ render thừa
│   │   ├── AlertManager.js · NotificationManager.js · TabManager.js
│   │
│   ├── login/index.js
│   ├── offscreen/index.js
│   │
│   └── shared/                 # chỉ đặt ở đây khi >= 2 runtime dùng
│       ├── auth.js
│       ├── BugListService.js       # options loại lỗi (content + popup)
│       ├── ErrorLogger.js · ValidationService.js
│       ├── config/  ConfigurationManager.js · env.js
│       ├── chrome/  StorageService · TabsService · MessagingService
│       ├── http/    ApiClient.js   # nơi duy nhất gọi backend
│       └── ui/      html.js        # template tự escape
│
├── test/                       # node:test, không cần dependency
│   └── fakes/chrome.js             # chrome API giả, ghi lại thứ tự lời gọi
├── scripts/                    # check-env.mjs · check-undefined.mjs
├── css/ · lib/ · assets/
```

### Quy ước

- **Thêm file mới**: mặc định đặt vào thư mục runtime đang dùng nó. Chỉ chuyển lên `shared/` khi
  runtime thứ hai thật sự cần.
- **`shared/http/ApiClient.js`** là nơi duy nhất gọi backend — có sẵn token, timeout và `ApiError`
  mang theo status.
- **`shared/ui/html.js`** escape mặc định; muốn chèn HTML thô phải viết `raw()`.
- **`shared/config/env.js`** là dòng duy nhất chứa URL backend; `npm run check:env` chặn commit nếu
  nó không trỏ production.

---

## Kiến trúc hệ thống

### Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CHROME EXTENSION                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────┐   Messages   ┌───────────────────────────┐ │
│  │  Popup               │ ◄──────────► │  Background (SW)          │ │
│  │  src/popup/index.js  │              │  src/background/index.js  │ │
│  │  ├── PopupController │              │  ├── BadgeManager         │ │
│  │  ├── PopupState      │              │  ├── DomainErrorCache ────┼─┼─► storage.session
│  │  └── PopupErrors     │              │  ├── WindowsManager       │ │   (sống qua SW restart)
│  └──────────┬───────────┘              │  └── UpdateChecker        │ │
│             │                          └─────────────┬─────────────┘ │
│             │                                        │               │
│             │        ┌───────────────────────────────┴─────────────┐ │
│             └───────►│  shared/http/ApiClient                      │ │
│                      │  nơi duy nhất gọi backend: token, timeout,  │ │
│                      │  ApiError { status, body }                  │ │
│                      └───────────────────┬─────────────────────────┘ │
│                                          ▼                           │
│                            ┌─────────────────────────┐               │
│                            │   Backend API Server    │               │
│                            │   (wpm.macusaone.com)   │               │
│                            └─────────────────────────┘               │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Content Script — src/content/loader.js → index.js            │   │
│  │                                                                │   │
│  │   ErrorStore ◄── nguồn sự thật duy nhất cho lỗi của tab       │   │
│  │      ▲  │  subscribe()                                        │   │
│  │      │  └──────────────► ErrorRenderer  (vẽ overlay)          │   │
│  │      │                                                         │   │
│  │   ErrorDataManager  (CRUD qua ApiClient, đồng bộ store)        │   │
│  │   SelectionHandler  (chọn element / kéo vùng)                  │   │
│  │   CommentThreadManager ──► ui/ CommentList · CommentInputModal │   │
│  │                                ThreadBugListRow · BugListPicker│   │
│  └────────────────────────────┬───────────────────────────────────┘   │
│                               ▼                                       │
│                     ┌───────────────────┐                            │
│                     │   Target Website  │                            │
│                     │   (DOM injection) │                            │
│                     └───────────────────┘                            │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow

Tạo một lỗi mới:

```
User chọn element / kéo vùng
        │
        ▼
SelectionHandler ──► CommentInputModal  (nội dung + loại lỗi)
                            │
                            ▼
                     ErrorDataManager
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
   ApiClient.post(/ext/bugs)      ErrorStore.upsert()
              │                           │
              ▼                           │ notify subscribers
        Backend API                       ▼
              │                     ErrorRenderer.updateAllErrorBorders()
              ▼                           │
   MessagingService ──► Background        ▼
   (SET_ERRORS)         DomainErrorCache   DOM overlay
                              │
                              ▼
                        storage.session + badge
```

Điểm cần nhớ: **ErrorStore là nơi duy nhất giữ lỗi của tab**. Không view nào tự ôm bản sao — chúng
`subscribe()` và vẽ lại khi store báo. Trước đây mỗi nơi giữ một bản, và đó là nguồn gốc của bug
"sửa/xoá bình luận không ăn".

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
  "bug_list_ids": [1, 4, 8],        // Loại lỗi gắn kèm (tùy chọn)
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

Lỗi được nhóm theo từng URL trong domain, không phải một mảng phẳng:

```javascript
{
  "domain": "https://example.com",   // origin, có cả protocol
  "path": [
    {
      "full_url": "https://example.com/trang-a",
      "data": [ /* Array of Error objects */ ]
    }
  ]
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

| Method   | Endpoint                                                 | Mục đích                       |
| -------- | -------------------------------------------------------- | ------------------------------ |
| `POST`   | `/api/loginForExt`                                       | Đăng nhập                      |
| `GET`    | `/api/v1/websites/check-wise/ext/?domain=<origin>`       | Lấy toàn bộ lỗi của domain     |
| `POST`   | `/api/v1/websites/check-wise/ext/bugs`                   | Tạo lỗi                        |
| `PUT`    | `/api/v1/websites/check-wise/ext/bugs/{bugId}`           | Cập nhật lỗi / đổi trạng thái  |
| `DELETE` | `/api/v1/websites/check-wise/ext/bugs/{bugId}`           | Xóa lỗi                        |
| `POST`   | `/api/v1/websites/check-wise/ext/bugs/{id}/comments`     | Thêm bình luận                 |
| `PUT`    | `/api/v1/websites/check-wise/ext/bugs/{id}/comments/{c}` | Sửa bình luận                  |
| `DELETE` | `/api/v1/websites/check-wise/ext/bugs/{id}/comments/{c}` | Xóa bình luận                  |
| `GET`    | `/api/v1/websites/site-check/bug-list/options?search=`   | Danh sách loại lỗi đang active |
| `POST`   | `/api/v1/websites/check-wise/ext/notification`           | Gửi thông báo                  |

Lưu ý: endpoint loại lỗi nằm dưới `site-check`, khác `check-wise` của các endpoint còn lại.

**Base URL** khai báo tại `src/shared/config/env.js` — xem mục Scripts bên dưới.

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

### ApiClient — `src/shared/http/ApiClient.js`

Nơi **duy nhất** gọi backend. Tự gắn Bearer token, luôn có timeout, và ném `ApiError` mang theo
status thay vì nuốt lỗi thành `false`.

```javascript
import { ApiClient, ApiError } from '../shared/http/ApiClient.js';

const data = await ApiClient.get('api/v1/.../ext/', { params: { domain } });
await ApiClient.post(ConfigurationManager.getBugUrl(), { domain, full_url, bug });
await ApiClient.delete(url, { domain, full_url }); // DELETE vẫn gửi được body

try {
    await ApiClient.put(url, payload);
} catch (error) {
    if (error instanceof ApiError && error.status === 422) {
        console.log(error.body.message);
    }
}
```

### ErrorStore — `src/content/ErrorStore.js`

Nguồn sự thật duy nhất cho danh sách lỗi của tab. `resolve()` là điểm mấu chốt: đưa vào một object
có thể đã cũ, nhận về object đang sống trong store — chốt chặn cho cả họ bug "panel vẽ từ bản này,
handler ghi vào bản kia".

```javascript
store.setAll(errors);
store.upsert(error);
store.remove(errorId);

const live = store.resolve(maybeStaleError);
const unsubscribe = store.subscribe((errors) => renderer.updateAllErrorBorders(errors));
```

### StorageService — `src/shared/chrome/StorageService.js`

```javascript
const data = await StorageService.get('key');
const safe = await StorageService.getSafe('key', defaultValue);
await StorageService.set({ key: value });
await StorageService.remove('key');
```

### MessagingService — `src/shared/chrome/MessagingService.js`

```javascript
const response = await MessagingService.sendToBackground({ action: 'getState' });
await MessagingService.sendToContentScript({ action: 'activate' });
const cleanup = MessagingService.addListener((message, sender) => {});
```

### ConfigurationManager — `src/shared/config/ConfigurationManager.js`

```javascript
ConfigurationManager.ERROR_STATUS.OPEN; // 'open'
ConfigurationManager.ACTIONS.ACTIVATE; // 'activate'
ConfigurationManager.API.BASE_URL; // đọc từ src/shared/config/env.js

ConfigurationManager.getBugUrl(bugId);
ConfigurationManager.getBugCommentUrl(bugId, commentId);
ConfigurationManager.getBugListOptionsUrl(searchTerm);
ConfigurationManager.getBreakpointType(window.innerWidth);
```

### html — `src/shared/ui/html.js`

Tagged template escape mặc định. Muốn chèn HTML thô phải nói rõ bằng `raw()`.

```javascript
html`
    <div title="${name}">${text}</div>
`; // name, text được escape
html`
    <div>${raw(linkifiedText)}</div>
`; // cố ý giữ nguyên thẻ
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
npm run dev          # Build watch mode -> dist/
npm run build        # Build production -> dist/
npm test             # 131 test (node:test, không cần dependency)
npm run format       # Prettier ghi đè
npm run check        # env + paths + undef + format + test  <- chạy trước khi commit
```

`npm run check` gồm bốn lớp, mỗi lớp sinh ra sau một lần bị lọt lỗi thật:

| Lệnh           | Bắt cái gì                                                                     |
| -------------- | ------------------------------------------------------------------------------ |
| `check:env`    | `env.js` bị để localhost khi commit                                            |
| `check:paths`  | Đường dẫn dạng **chuỗi** trỏ vào file không tồn tại (`getURL`, manifest, HTML) |
| `check:undef`  | Định danh không tồn tại — thiếu import, gõ sai tên                             |
| `format:check` | Lệch format                                                                    |

### Đổi backend URL khi dev

Build copy source chứ không bundle, nên `import.meta.env` không dùng được lúc chạy. URL nằm ở **một
dòng duy nhất** trong `src/shared/config/env.js`.

- **Dev**: sửa dòng đó thành `http://127.0.0.1:8000/`, hoặc đặt `VITE_API_BASE_URL` trong `.env` rồi
  `npm run dev` và load thư mục `dist/`.
- **Commit**: `check:env` sẽ fail nếu file đó không trỏ production.

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
- [ ] `npm run check` xanh (env + paths + undef + format + test)
- [ ] Chạy build local: `npm run build`
- [ ] Smoke test: login → chọn element → bình luận → gắn loại lỗi → popup → xóa tất cả → badge
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

3. **Load in Chrome**
    - Mở `chrome://extensions/`
    - Bật "Developer mode"
    - "Load unpacked" → chọn **thư mục gốc dự án** (manifest nằm ở đó)

    Cách này trỏ vào backend **production**. Muốn chạy với localhost thì `npm run dev` rồi load thư
    mục `dist/` — xem mục Scripts.

> Sau khi đổi `manifest.json`, phải **Remove rồi Load unpacked lại**; nút Reload có thể không nhận
> đường dẫn mới.

---

## Debugging

### Console Logs

Extension sử dụng `ErrorLogger` với các log levels:

- `[INFO]` - Thông tin operation thành công
- `[WARN]` - Cảnh báo non-critical
- `[ERROR]` - Lỗi cần xử lý
- `[DEBUG]` - Chi tiết debug (development)

### Common Issues

| Vấn đề                          | Nguyên nhân                 | Giải pháp                                |
| ------------------------------- | --------------------------- | ---------------------------------------- |
| "Extension context invalidated" | Extension bị reload         | Refresh trang web                        |
| "Content script not available"  | Content script chưa inject  | Refresh trang web                        |
| Errors không hiển thị           | Toggle visibility tắt       | Bật toggle trong popup                   |
| API call failed                 | Token hết hạn               | Đăng nhập lại                            |
| Badge về 0 sau vài phút         | Service worker ngủ          | Đã vá: cache ghi xuống `storage.session` |
| Gọi API bị chặn trên site https | `env.js` đang trỏ localhost | Xem mục Scripts                          |

---

## License

MIT License - Xem file LICENSE để biết thêm chi tiết.

---

**Made by MACUSA Development Team**
