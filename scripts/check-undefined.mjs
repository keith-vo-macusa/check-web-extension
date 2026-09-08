/**
 * Bắt định danh không tồn tại — thiếu import, gõ sai tên, biến đã xoá còn gọi.
 *
 * Sinh ra sau khi popup.js dùng ApiClient và buildErrorsSignature suốt nhiều
 * commit mà thiếu hẳn dòng import. Test không bắt được (popup.js kéo jQuery nên
 * không import nổi ngoài trình duyệt), parse-check cũng không, vì cú pháp vẫn
 * hợp lệ — chỉ tới lúc chạy mới ném ReferenceError.
 *
 * Bật checkJs cho toàn bộ codebase sẽ ra hàng trăm lỗi kiểu; ở đây chỉ giữ đúng
 * nhóm "không tìm thấy tên" và bỏ qua phần còn lại.
 */
import { execFileSync } from 'child_process';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const UNDEFINED_NAME_CODES = ['TS2304', 'TS2552'];

const workDir = mkdtempSync(join(tmpdir(), 'check-undefined-'));
const globalsPath = join(workDir, 'globals.d.ts');
const configPath = join(workDir, 'tsconfig.json');

// Global do content script / thẻ <script> nạp, không import được.
writeFileSync(
    globalsPath,
    [
        'declare const $: any;',
        'declare const jQuery: any;',
        'declare const Swal: any;',
        'declare const module: any;',
    ].join('\n') + '\n',
);

writeFileSync(
    configPath,
    JSON.stringify({
        compilerOptions: {
            target: 'ES2022',
            module: 'ES2022',
            moduleResolution: 'bundler',
            lib: ['ES2022', 'DOM', 'DOM.Iterable'],
            allowJs: true,
            checkJs: true,
            noEmit: true,
            strict: false,
            noImplicitAny: false,
            strictNullChecks: false,
            types: ['chrome'],
            typeRoots: [join(process.cwd(), 'node_modules', '@types')],
        },
        include: [globalsPath, join(process.cwd(), 'src', '**', '*.js')],
    }),
);

let output = '';
try {
    execFileSync('npx', ['tsc', '-p', configPath], { encoding: 'utf8', shell: true });
} catch (error) {
    // tsc thoát khác 0 với mọi loại lỗi; chỉ quan tâm nhóm định danh.
    output = String(error.stdout ?? '');
}

const findings = output
    .split('\n')
    .filter((line) => UNDEFINED_NAME_CODES.some((code) => line.includes(code)));

if (findings.length > 0) {
    console.error('✗ Có định danh không tồn tại (thường là thiếu import):\n');
    findings.forEach((line) => console.error('  ' + line.trim()));
    process.exit(1);
}

console.log('✓ Không có định danh nào chưa khai báo.');
