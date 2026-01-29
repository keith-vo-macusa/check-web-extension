import { defineConfig } from 'vite';
import { resolve, dirname, join } from 'path';
import { copyFileSync, existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { minify } from 'terser';
import CleanCSS from 'clean-css';

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

// Minify JavaScript file
async function minifyJS(filePath) {
    try {
        const code = readFileSync(filePath, 'utf8');
        const result = await minify(code, {
            compress: {
                drop_console: false, // Keep console logs for debugging
                drop_debugger: true,
                dead_code: true,
                unused: true,
            },
            mangle: {
                toplevel: false, // Don't mangle top-level names (for ES modules)
            },
            format: {
                comments: false,
            },
        });
        if (result.code) {
            writeFileSync(filePath, result.code);
            console.log(`✓ Minified: ${filePath}`);
        }
    } catch (error) {
        console.warn(`⚠ Could not minify ${filePath}:`, error.message);
    }
}

// Minify CSS file
function minifyCSS(filePath) {
    try {
        const css = readFileSync(filePath, 'utf8');
        const result = new CleanCSS({
            level: 2, // Advanced optimizations
        }).minify(css);
        if (result.styles) {
            writeFileSync(filePath, result.styles);
            console.log(`✓ Minified: ${filePath}`);
        }
    } catch (error) {
        console.warn(`⚠ Could not minify ${filePath}:`, error.message);
    }
}

// Recursively minify all JS files in directory
async function minifyJSInDir(dir) {
    if (!existsSync(dir)) return;

    const files = readdirSync(dir);
    for (const file of files) {
        const filePath = join(dir, file);
        const stat = statSync(filePath);

        if (stat.isDirectory()) {
            await minifyJSInDir(filePath);
        } else if (file.endsWith('.js') && !file.includes('.min.')) {
            await minifyJS(filePath);
        }
    }
}

// Recursively minify all CSS files in directory
function minifyCSSInDir(dir) {
    if (!existsSync(dir)) return;

    const files = readdirSync(dir);
    for (const file of files) {
        const filePath = join(dir, file);
        const stat = statSync(filePath);

        if (stat.isDirectory()) {
            minifyCSSInDir(filePath);
        } else if (file.endsWith('.css') && !file.includes('.min.')) {
            minifyCSS(filePath);
        }
    }
}

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_debugger: true,
            },
        },
        rollupOptions: {
            input: {
                // Placeholder để Vite không báo lỗi
                dummy: resolve(__dirname, 'manifest.json'),
            },
        },
    },
    plugins: [
        {
            name: 'copy-and-minify-files',
            async closeBundle() {
                console.log('\n📦 Copying and minifying files...\n');

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

                // Minify JS files in dist
                console.log('\n🔧 Minifying JavaScript files...');
                await minifyJSInDir('dist/js');
                for (const file of jsFiles) {
                    const distFile = join('dist', file);
                    if (existsSync(distFile)) {
                        await minifyJS(distFile);
                    }
                }

                // Minify CSS files in dist
                console.log('\n🎨 Minifying CSS files...');
                minifyCSSInDir('dist/css');

                console.log('\n✅ Build complete!\n');
            },
        },
    ],
});
