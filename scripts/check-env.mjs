/**
 * Stops a dev backend URL from being committed by accident.
 *
 * Runs in CI as `npm run check:env` and fails when src/shared/config/env.js is not
 * pointing at production. Guards against a trap this repo has already fallen into:
 * BASE_URL left on localhost and merged into a shared branch.
 */
import { readFileSync } from 'fs';

const ENV_FILE = 'src/shared/config/env.js';
const PRODUCTION_URL = 'https://wpm.macusaone.com/';

const source = readFileSync(ENV_FILE, 'utf8');
const match = source.match(/export const API_BASE_URL = '([^']*)';/);

if (!match) {
    console.error(`✗ ${ENV_FILE}: không tìm thấy khai báo API_BASE_URL.`);
    process.exit(1);
}

if (match[1] !== PRODUCTION_URL) {
    console.error(`✗ ${ENV_FILE}: API_BASE_URL đang là "${match[1]}".`);
    console.error(`  Phải trả về "${PRODUCTION_URL}" trước khi commit.`);
    process.exit(1);
}

console.log(`✓ ${ENV_FILE}: API_BASE_URL trỏ production.`);
