/**
 * Catches identifiers that do not exist: missing imports, typos, calls to
 * something that was deleted.
 *
 * Added after popup.js used ApiClient and buildErrorsSignature for several
 * commits with no import at all. Tests could not catch it — popup.js pulls in
 * jQuery, so it cannot be imported outside a browser — and neither could a parse
 * check, because the syntax is valid. It only fails at runtime.
 *
 * Turning on checkJs for the whole codebase produces hundreds of type errors, so
 * this keeps only the "cannot find name" group and drops the rest.
 */
import { execFileSync } from 'child_process';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const UNDEFINED_NAME_CODES = ['TS2304', 'TS2552'];

const workDir = mkdtempSync(join(tmpdir(), 'check-undefined-'));
const globalsPath = join(workDir, 'globals.d.ts');
const configPath = join(workDir, 'tsconfig.json');

// Globals that arrive via <script> tags and cannot be imported.
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
    // tsc exits non-zero for any error; only the identifier group matters here.
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
