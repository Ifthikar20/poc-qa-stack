/**
 * The frontend, as its own project.
 *
 * `web/` is a self-contained Vite app. Nothing under it reads a file outside
 * it, and nothing it produces is written outside it — those two properties are
 * what make "lift this directory into its own repository" a `git mv` rather
 * than a refactor, and `npm run check:boundary` fails the moment either stops
 * being true.
 *
 * The two things it needs from the backend are both configuration:
 *
 *   GC_API         where `npm run dev` proxies /api and /ws (build-time, dev only)
 *   VITE_API_URL   where the BUILT app sends them (runtime; see src/config.js)
 *
 * Same-origin — the app served by the backend it talks to — is the default and
 * needs neither. See docs/BOUNDARY.md.
 */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const API = process.env.GC_API || 'http://localhost:3000';

export default defineConfig({
  // Explicit, so `vite build --config web/vite.config.js` works from the repo root.
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue(), tailwind()],
  // Served under /app by whatever is hosting it — the backend today, a static
  // host later. The path is the contract; who serves it is not.
  base: '/app/',
  build: {
    // Inside web/, not in the backend's static root. The backend is POINTED at
    // this directory (GC_WEB_DIR) instead of the build reaching into it.
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The case language, as the frontend's own copy of it. The console used
      // to reimplement "how a step reads" in a local helper, which is how three
      // renderings of the same step end up disagreeing; it then imported the
      // backend's file directly, which is how a frontend repo fails to build on
      // its own. src/lang/ is a checked copy — see scripts/check-shared.js.
      '@lang': fileURLToPath(new URL('./src/lang/vocabulary.js', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      // The screencast and every live event come over this one socket.
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true },
    },
  },
});
