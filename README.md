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

The build is **not committed** — `dist/` is gitignored. It is generated output,
and committing it meant a one-line change to a component arrived in review as
itself plus every regenerated bundle, with two people building the same source
producing a diff. `npm start` at the repository root builds it when it is
missing or when a source file is newer, so the bundler is a setup step rather
than something you have to remember.

## Talking to the backend

| variable | when you need it |
|---|---|
| `GC_API` | `npm run dev` against a backend that is not on :3000 |
| `VITE_API_URL` | the **built** app is hosted somewhere the backend is not |
| `VITE_AUTH_URL` | there is a control plane to sign in to (`../auth/`) |

None is needed in the normal case, where the backend serves this app, "the API"
is the page's own origin, and there is no login at all.

`VITE_AUTH_URL` is the switch for the whole session layer. Unset, `stores/session.js`
does nothing, `token()` returns null, no header is attached and `/login` is
unreachable. Set, the router will not render anything until it knows who you
are, and the runner it talks to must be started with the public half of the
control plane's signing key (`GC_AUTH_PUBLIC_KEYS`). `src/config.js` is the one
place that
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
  config.js      where the backend and the control plane are
  api.js         the HTTP surface, one function per endpoint
  app.css        Tailwind v4 + the design tokens (brand, ink, surfaces)
  stores/
    live.js      the one WebSocket: frames, cursor, steps, console, navs
    suites.js    suites and cases, cached
    session.js   who you are, and the short-lived token the runner takes
  views/         one per route
  components/    the small shared pieces
  lang/          a CHECKED COPY of the backend's vocabulary.js — do not edit
                 here; edit the original and run `npm run sync:lang`
```

`lang/` is the only file in this project that exists twice. The case language is
parsed by the backend, rendered here, and written by the browser extension, and
the alternative to copying it is three implementations that agree until they
don't. `npm run check:shared` fails if a copy drifts.
