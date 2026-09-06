import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const API = process.env.GC_API || 'http://localhost:3000';

export default defineConfig({
  // Explicit, so `vite build --config web/vite.config.js` works from the repo root.
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue(), tailwind()],
  // The build lands inside the express app's static root, so a plain
  // `npm start` serves the built UI with no Vite in the picture. `npm run dev`
  // is for working on it; nobody should need a bundler to run the tool.
  base: '/app/',
  build: {
    outDir: fileURLToPath(new URL('../public/app', import.meta.url)),
    emptyOutDir: true,
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      // The screencast and every live event come over this one socket.
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true },
    },
  },
});
