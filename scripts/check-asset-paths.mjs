/**
 * Kiểm tra các đường dẫn nội bộ được viết dưới dạng CHUỖI.
 *
 * Sinh ra sau khi đổi cấu trúc: loader.js gọi
 * `chrome.runtime.getURL('content.js')`, file đó đã chuyển sang
 * src/content/index.js, và extension chết ngay từ bước nạp content script.
 *
 * Không lớp nào hiện có bắt được: đó là chuỗi nên check:undef không thấy,
 * resolve-imports chỉ đi theo câu lệnh import, test thì không nạp manifest.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const problems = [];

function check(label, path) {
    if (!existsSync(path)) problems.push(`${label} -> ${path}`);
}

// 1. chrome.runtime.getURL('...') trong source
function scanDirectory(dir) {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
            scanDirectory(full);
            continue;
        }
        if (!name.endsWith('.js')) continue;

        const source = readFileSync(full, 'utf8');
        for (const match of source.matchAll(/getURL\(\s*['"]([^'"]+)['"]\s*\)/g)) {
            check(`${full}: getURL`, match[1]);
        }
        // Chuỗi trỏ vào tài nguyên trong package, ví dụ createDocument({ url: 'screens/…' }).
        for (const match of source.matchAll(
            /['"]((?:screens|src|lib|css|assets)\/[\w./-]+\.\w+)['"]/g,
        )) {
            check(`${full}: đường dẫn tài nguyên`, match[1]);
        }
    }
}
scanDirectory('src');

// 2. Đường dẫn trong manifest
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.content_scripts?.forEach((entry) => {
    entry.js?.forEach((file) => check('manifest.content_scripts.js', file));
    entry.css?.forEach((file) => check('manifest.content_scripts.css', file));
});
if (manifest.background?.service_worker) {
    check('manifest.background.service_worker', manifest.background.service_worker);
}
if (manifest.action?.default_popup) {
    check('manifest.action.default_popup', manifest.action.default_popup);
}
Object.values(manifest.icons ?? {}).forEach((file) => check('manifest.icons', file));

// 3. src trong các file HTML của extension
for (const page of readdirSync('screens')) {
    if (!page.endsWith('.html')) continue;
    const source = readFileSync(join('screens', page), 'utf8');
    for (const match of source.matchAll(/(?:src|href)="(\.\.\/[^"]+)"/g)) {
        check(`screens/${page}`, join('screens', match[1]));
    }
}

if (problems.length > 0) {
    console.error('✗ Đường dẫn trỏ tới file không tồn tại:\n');
    problems.forEach((line) => console.error('  ' + line));
    process.exit(1);
}

console.log('✓ Mọi đường dẫn dạng chuỗi đều tồn tại.');
