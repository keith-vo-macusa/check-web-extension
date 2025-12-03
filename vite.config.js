import { defineConfig } from 'vite';
import { resolve, dirname, join } from 'path';
import { copyFileSync, existsSync, mkdirSync, cpSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cross-platform copy directory function
function copyDir(src, dest) {
    if (existsSync(src)) {
        mkdirSync(dest, { recursive: true });
        cpSync(src, dest, { recursive: true });
    }
}

// Cross-platform copy file with directory creation
function copyFileWithDir(src, dest) {
    if (existsSync(src)) {
        const destDir = dirname(dest);
        mkdirSync(destDir, { recursive: true });
        copyFileSync(src, dest);
    }
}

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                // Placeholder để Vite không báo lỗi
                dummy: resolve(__dirname, 'manifest.json'),
            },
        },
    },
    plugins: [
        {
            name: 'copy-all-files',
            closeBundle() {
                // Copy manifest.json
                copyFileSync('manifest.json', 'dist/manifest.json');

                // Copy JavaScript files (không bundle)
                const jsFiles = [
                    'background.js',
                    'content.js',
                    'content-loader.js',
                ];
                jsFiles.forEach((file) => {
                    if (existsSync(file)) {
                        copyFileSync(file, join('dist', file));
                    }
                });

                // Copy HTML files
                const htmlFiles = [
                    'screens/login.html',
                    'screens/popup.html',
                    'screens/offscreen.html',
                ];
                htmlFiles.forEach((file) => {
                    const dest = join('dist', file);
                    copyFileWithDir(file, dest);
                });

                // Copy directories
                const dirsToCopy = ['assets', 'lib', 'css', 'js'];
                dirsToCopy.forEach((dir) => {
                    copyDir(dir, join('dist', dir));
                });
            },
        },
    ],
});
