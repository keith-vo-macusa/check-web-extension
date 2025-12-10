# GitHub Workflows

## Release Workflow

Workflow tự động build và release extension khi version thay đổi.

### Cách sử dụng:

#### Cách 1: Tự động (Khuyến nghị)
1. Update version trong `manifest.json` (ví dụ: `"version": "1.2.4"`)
2. Commit và push:
   ```bash
   git add manifest.json
   git commit -m "chore: bump version to 1.2.4"
   git push
   ```
3. Tạo tag và push:
   ```bash
   git tag v1.2.4
   git push origin v1.2.4
   ```
4. Workflow sẽ tự động:
   - Build extension
   - Tạo GitHub Release
   - Upload ZIP file

#### Cách 2: Manual Trigger
1. Vào GitHub Actions
2. Chọn "Build and Release Extension"
3. Click "Run workflow"
4. Nhập version (optional) hoặc để trống để dùng version từ manifest.json

### Workflow sẽ:
- ✅ Build extension với bundle + minify
- ✅ Tạo ZIP file từ dist/
- ✅ Tạo GitHub Release với tag
- ✅ Upload ZIP file như release asset

### Output:
- Release tag: `v1.2.4`
- Release asset: `extension-v1.2.4.zip`
- Build artifacts: Lưu trong Actions artifacts (30 ngày)

