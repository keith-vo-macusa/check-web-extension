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
        minify: 'esbuild', // Minify code (faster than terser, built-in)
        // esbuild will handle minification automatically
        rollupOptions: {
            input: {
                // Bundle content script
                content: resolve(__dirname, 'content.js'),
                // Bundle background script
                background: resolve(__dirname, 'background.js'),
                // Bundle content loader
                'content-loader': resolve(__dirname, 'content-loader.js'),
            },
            output: {
                // Preserve original file names
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
                format: 'es', // ES modules
            },
        },
    },
    plugins: [
        {
            name: 'copy-all-files',
            closeBundle() {
                // Copy manifest.json
                copyFileSync('manifest.json', 'dist/manifest.json');

                // Note: content.js, background.js, content-loader.js are bundled by Vite, no need to copy

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

                // Copy directories (lib, css, assets)
                // Note: js/ is not copied because it is bundled into content.js and background.js
                const dirsToCopy = ['assets', 'lib', 'css'];
                dirsToCopy.forEach((dir) => {
                    copyDir(dir, join('dist', dir));
                });

                // Copy js/ for popup.js and other files not included in the bundle
                // (popup.js runs in the popup context and does not need to be bundled)
                copyDir('js', join('dist', 'js'));
            },
        },
    ],
});
