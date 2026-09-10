# ghostclick — the UI

A Vite + Vue 3 app: onboarding, suites, the live console, the dashboard,
defects. This repository is the whole of it.

It is one of three projects that make up ghostclick, and the only one here:

| | what it is | how it is reached |
|---|---|---|
| **the UI** | this repository | builds to `dist/` |
| the runner | Node + Playwright; drives the browser, executes cases | HTTP `/api/*` and one WebSocket `/ws` |
| the control plane | Django + allauth; owns accounts, sessions, SSO | HTTP `/auth/*` and `/_allauth/*` |

Nothing is imported across those lines. The runner does not read this
repository's source — it is *pointed at* a built directory with `GC_WEB_DIR`
and serves whatever is in it under `/app`. The control plane is only ever an
HTTP address. Which means this app builds, and this repository's tests run,
with neither of the other two installed.

## Running it

```bash
npm install
npm run dev       # Vite on http://localhost:5180/app/
npm run build     # → dist/
npm test          # the case-language contract; needs no backend
```

`dist/` is generated and is **not** committed. Whoever deploys the UI runs the
build and hands the directory over; nothing downstream wants the artefact in
git, and committing it used to mean a one-line component change arrived in
review as itself plus every regenerated bundle.

The dev port is pinned to 5180 with `strictPort`, so a collision is a refusal
rather than a quiet move to 5181. That matters more than it looks: with a
control plane running, this exact origin has to be named in two other services'
environments (below), and a Vite that slid to another port presents as every
login call failing CORS with nothing on screen to say why.

## What the backend has to be doing

`npm run dev` on its own gets you a UI that renders and a console that cannot
connect to anything. Vite proxies `/api` and `/ws` — and only those — to
`GC_API`, default `http://localhost:3000`.

### Open — no sign-in, the laptop case

One thing: **the runner, listening on `http://localhost:3000`.** In the backend
repository that is `npm start`. Nothing else needs configuring on either side —
`hasAuth()` is false, there is no login screen, and the runner is ungated.

```bash
npm run dev                                  # proxies to :3000
GC_API=http://localhost:3100 npm run dev     # …or wherever it actually is
```

### Signed in — the control plane as well

Three processes, and **three settings that all name this dev origin**. Miss one
and the symptom is a CORS refusal in the browser console rather than a message
that says what is wrong.

1. **The control plane** on `http://localhost:8000`, with a signing key, and
   this origin allowed:

   ```bash
   GC_SIGNING_KEY=…  GC_WEB_ORIGIN=http://localhost:5180  python manage.py runserver 8000
   ```

   `GC_WEB_ORIGIN` is what Django turns into `CORS_ALLOWED_ORIGINS` and
   `CSRF_TRUSTED_ORIGINS`. Without it the browser blocks every `/_allauth/`
   call before it leaves.

2. **The runner** on `http://localhost:3000`, holding the *public* half of that
   key, and told the same origin:

   ```bash
   GC_AUTH_PUBLIC_KEYS='{"…":"…"}'  GC_WEB_ORIGIN=http://localhost:5180  npm start
   ```

   The origin is needed even though `/api` goes through Vite's proxy: the proxy
   forwards the browser's `Origin: http://localhost:5180` on the `/ws` upgrade,
   and a gated runner accepts a socket only from the origin the UI is served at.

3. **Here**, pointing the app at the control plane. This is a **build-time**
   variable, so Vite has to be restarted after you set it:

   ```bash
   echo VITE_AUTH_URL=http://localhost:8000 > .env.local
   npm run dev
   ```

> The backend's `npm run app -- --auth` starts both services for you, but sets
> `GC_WEB_ORIGIN` to **its own** port (`http://localhost:3000`) — because in
> that arrangement it is serving a UI it built itself into `GC_WEB_DIR`. That is
> the right answer for the built app and the wrong one for `npm run dev`. To use
> the dev server against it, override `GC_WEB_ORIGIN` to `http://localhost:5180`
> in both processes.

## Configuration

| variable | read by | when you need it |
|---|---|---|
| `GC_API` | `vite.config.js`, dev only | the runner is not on `:3000` |
| `VITE_API_URL` | the **build** | the built app is hosted where the runner is not |
| `VITE_AUTH_URL` | the **build** | there is a control plane to sign in to |

Both `VITE_*` values are baked into the bundle, so changing either is a rebuild,
not a restart. Empty is the supported default for both. No `VITE_API_URL` means
"my own origin", which is right whenever the runner is serving this app; no
`VITE_AUTH_URL` means there is nobody to sign in to — `stores/session.js` does
nothing, `token()` returns null, no header is attached, and `/login` is
unreachable. `src/config.js` is the single place that decides and every request
goes through it: `src/api.js` for HTTP, `src/stores/live.js` for the screencast
socket.

Cross-origin in production also needs the runner told `GC_WEB_ORIGIN`, or the
browser blocks the requests before they leave. `.env.example` has the details.

`/auth` and `/_allauth` are deliberately **not** proxied in dev. The app decides
whether there is anyone to sign in to by asking whether `VITE_AUTH_URL` is set,
so routing the control plane through the proxy would mean leaving it empty —
which is the same switch that turns the login screen off. Same-origin *and*
signed in is not a shape this app has in development.

## `base: '/app/'`

The build assumes it is served under `/app/`, and that is still right after the
split — more load-bearing than before, in fact, because it is now depended on
from further away. The runner mounts `GC_WEB_DIR` at `/app`, and the control
plane builds `GC_APP_URL` as `<origin>/app`, which is the address in every
verification and password-reset mail it sends. Changing it moves three things
and only one of them is in this repository.

## `src/lang/` — the one file this project does not own

`src/lang/vocabulary.js` is a **verbatim copy of the backend's**. Three programs
parse the same grammar — the runner executes cases, this app renders them, the
browser extension writes them with no server in the picture — and the
alternative to copying is three implementations that agree until they don't.

**Do not edit it here.** Change it in the backend, land it there, then:

```bash
npm run sync:lang                                # looks in ../backend
GC_BACKEND=/path/to/ghostclick npm run sync:lang # …or wherever it is
npm test                                         # then look at what changed
```

While both halves were one repository, `npm run check:shared` read the original
and the copy off the same disk and demanded they match. There is no disk with
both on it now, so that one check is replaced by two that survive the boundary,
plus the original one whenever a checkout happens to be at hand:

| | catches | when it runs |
|---|---|---|
| `npm run check:lang` | the copy has been **edited here** — its sha256 no longer matches `vocabulary.lock.json` | always, and from `prebuild`, so `npm run build` refuses a hand-edited copy |
| `npm test` | the copy holds a **verb the console has never been shown** — a row in `VERBS` with no fixture | always |
| `npm run check:lang`, with a checkout | the copy has **drifted from the original** | `../backend`, or `GC_BACKEND`; skipped, loudly, when absent |

The second is the one with teeth in the new shape. A stale copy only ever hurts
by way of the console rendering a case wrongly, and `test/lang.test.js` renders
every verb in the table through the two functions `ConsoleView.vue` actually
imports. Sync a vocabulary with a new verb in it and the suite goes red until
someone has looked at what the console does with it.

**What none of this promises** is that the backend has not moved on. Nothing
inside this repository can know that, and a check that quietly passed when the
file it compares against is absent would be worse than none, because it would
be believed. The cost is a procedure: **run `npm run check:lang` against a
backend checkout before cutting a release.** The day the language is published
as `@ghostclick/language`, the lock file becomes a version range and the
procedure becomes `npm outdated`.

## Layout

```
index.html       the only page; everything else is a route
vite.config.js   base, the dev proxy, and the @ / @lang aliases
src/
  main.js        app + router + pinia
  router.js      routes; every view is lazy except the console
  config.js      where the runner and the control plane are
  api.js         the HTTP surface, one function per endpoint
  webauthn.js    the browser half of the second factor
  app.css        Tailwind v4 + the design tokens (brand, ink, surfaces)
  stores/
    live.js      the one WebSocket: frames, cursor, steps, console, navs
    suites.js    suites and cases, cached
    session.js   who you are, and the short-lived token the runner takes
    ui.js        sidebar state and the rest that outlives a route
  views/         one per route
  components/    the small shared pieces
  composables/   reauth, and the sheet it raises
  lang/          a CHECKED COPY of the backend's vocabulary.js — see above
scripts/         check-lang, sync-lang, and the paths they share
test/            node:test; no browser, no backend
```
