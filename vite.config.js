/**
 * The UI, which is now the whole of this repository.
 *
 * This file used to argue that `web/` was a self-contained project you could
 * lift out with a `git mv`. That argument has been settled by doing it: there
 * is nothing above this directory to reach into, so the four rules of
 * docs/BOUNDARY.md that `npm run check:boundary` used to enforce are enforced
 * by the repository itself. What remains is the part the boundary replaced the
 * coupling WITH, which is still configuration and still lives here:
 *
 *   GC_API         where `npm run dev` proxies /api and /ws (dev only)
 *   VITE_API_URL   where the BUILT app sends them (build time; see src/config.js)
 *   VITE_AUTH_URL  where the built app signs in — not proxied, see below
 *
 * Same-origin — the backend serving the app it talks to — is the default and
 * needs none of them.
 */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const API = process.env.GC_API || 'http://localhost:3000';

export default defineConfig({
  // Resolved from this file rather than from the shell's working directory, so
  // `vite build --config /path/to/vite.config.js` from a deploy script builds
  // the same thing `npm run build` does.
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue(), tailwind()],
  /**
   * Served under /app by whatever is hosting it — the backend today, a static
   * host later. The path is the contract; who serves it is not.
   *
   * Still true after the split, and now depended on from further away: the
   * backend mounts the directory it is handed at `/app`, and the control plane
   * builds `GC_APP_URL` as `<origin>/app`, which is the address in every
   * verification and password-reset mail it sends. Changing this moves three
   * things, only one of which is in this repository.
   */
  base: '/app/',
  build: {
    // The backend is POINTED at this directory (GC_WEB_DIR) rather than the
    // build reaching into the backend's static root, which is what let the two
    // become separate repositories at all. Nothing here writes anywhere else.
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The case language. The console used to reimplement "how a step reads"
      // in a local helper, which is how three renderings of the same step end
      // up disagreeing; it then imported the backend's file directly, which is
      // how a frontend fails to build without the backend's tree beside it.
      // src/lang/vocabulary.js is a checked copy of the backend's — do not edit
      // it here; see scripts/check-lang.js for what stops you.
      '@lang': fileURLToPath(new URL('./src/lang/vocabulary.js', import.meta.url)),
    },
  },
  server: {
    /**
     * Pinned, and off Vite's default 5173, because this port is not a private
     * local detail. With a control plane running, the dev origin has to appear
     * in the runner's GC_WEB_ORIGIN and in Django's CORS_ALLOWED_ORIGINS and
     * CSRF_TRUSTED_ORIGINS before a single login call is allowed to leave the
     * browser — so it is a value copied into two other services' environments.
     *
     * 5173 is what every other Vite project on a machine also wants, and Vite's
     * habit when a port is taken is to move quietly to the next one. That turns
     * a port collision into every auth request failing CORS with no clue as to
     * why. strictPort makes it an immediate, legible refusal instead.
     */
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': API,
      // The screencast and every live event come over this one socket.
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true },
      /**
       * /auth and /_allauth are deliberately NOT here. The app decides whether
       * there is anyone to sign in to by asking whether VITE_AUTH_URL is set
       * (src/config.js, `hasAuth`), so routing the control plane through this
       * proxy would mean leaving that empty — which is the same switch that
       * turns the login screen off. Same-origin and signed-in is not a shape
       * this app has in development.
       *
       * So dev talks to Django cross-origin, and Django has to have been told
       * this origin. README.md has the line.
       */
    },
  },
});
