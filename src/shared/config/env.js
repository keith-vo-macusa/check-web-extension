// @ts-check
/**
 * The one place that holds the backend URL.
 *
 * The build copies source instead of bundling it, so `import.meta.env` is not
 * available at runtime. Instead:
 *   - Dev: change the single constant below to localhost.
 *   - Build: vite substitutes VITE_API_BASE_URL from .env into dist.
 *   - CI: `npm run check:env` fails if this file is not pointing at production.
 *
 * One line to change while developing, and no way to ship localhost by accident.
 */
export const API_BASE_URL = 'https://wpm.macusaone.com/';
