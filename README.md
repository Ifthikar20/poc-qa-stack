# ghostclick — the UI

A Vite + Vue 3 app: onboarding, suites, the live console, the dashboard, defects.

It is a **separate project** from the backend it talks to. Nothing under `web/`
reads a file outside it and nothing it builds is written outside it, so lifting
this directory into its own repository is a `git mv` — see
[../docs/BOUNDARY.md](../docs/BOUNDARY.md) for the four rules and
`npm run check:boundary` (from the repository root) for the check that keeps
them true.

## Running it

```bash
npm install                 # from the repository root today; from here once split
npm run dev                 # Vite on :5173, proxying /api and /ws to the backend
npm run build               # → dist/
```

`npm run dev` needs a backend running. It proxies to `http://localhost:3000` by
default; `GC_API` moves it.

The build is **committed** (`dist/`), because the backend serves it and a tool
you need a bundler to run is a tool people stop running. `npm start` at the
repository root rebuilds it when a source file is newer.

## Talking to the backend

| variable | when you need it |
|---|---|
| `GC_API` | `npm run dev` against a backend that is not on :3000 |
| `VITE_API_URL` | the **built** app is hosted somewhere the backend is not |

Neither is needed in the normal case, where the backend serves this app and
"the API" is the page's own origin. `src/config.js` is the one place that
decides, and every request goes through it — see `src/api.js` (HTTP) and
`src/stores/live.js` (the screencast socket).

Cross-origin also needs the backend told which origin may call it
(`GC_WEB_ORIGIN`), or the browser blocks the requests before they leave.
`.env.example` has the details.

## Layout

```
src/
  main.js        app + router + pinia
  router.js      routes; every view is lazy except the console
  config.js      where the backend is
  api.js         the HTTP surface, one function per endpoint
  app.css        Tailwind v4 + the design tokens (brand, ink, surfaces)
  stores/
    live.js      the one WebSocket: frames, cursor, steps, console, navs
    suites.js    suites and cases, cached
  views/         one per route
  components/    the small shared pieces
  lang/          a CHECKED COPY of the backend's vocabulary.js — do not edit
                 here; edit the original and run `npm run sync:lang`
```

`lang/` is the only file in this project that exists twice. The case language is
parsed by the backend, rendered here, and written by the browser extension, and
the alternative to copying it is three implementations that agree until they
don't. `npm run check:shared` fails if a copy drifts.
