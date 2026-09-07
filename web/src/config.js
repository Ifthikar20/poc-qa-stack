/**
 * Where the backend is.
 *
 * Today the app is served BY the backend, so the answer is "here" and every
 * path is relative — which is why the app has never needed this file. That
 * answer stops being true the moment the frontend is deployed on its own: a
 * static host, a CDN, a different port during a rewrite. Then "here" is the
 * static host, which has no /api at all, and every call 404s.
 *
 * So the base is configuration with an empty default. Nothing changes for the
 * same-origin case — `'' + '/api/state'` is the string it always was — and the
 * split case is a build-time variable rather than a code change:
 *
 *   VITE_API_URL=https://api.ghostclick.example  npm run build
 *
 * The socket has to be derived rather than guessed. `location.host` was fine
 * while the page and the socket lived at the same address; pointed at another
 * origin it would keep dialling the static host forever, reconnecting on a
 * 1200ms timer, with the console showing "connecting" and no reason why.
 */
const clean = (v) => String(v ?? '').trim().replace(/\/+$/, '');

/** '' when the backend serves this app — the case that needs no configuration. */
export const API_BASE = clean(import.meta.env?.VITE_API_URL);

/**
 * The control plane: Django, which owns logins and nothing else.
 *
 * Empty is a real and supported answer — it means nobody has stood one up, and
 * the app runs open against a runner that is also unauthenticated. That is the
 * shape of a laptop PoC and it should not require a second service to try. The
 * moment this is set, the login screen appears and every call carries a token.
 */
export const AUTH_BASE = clean(import.meta.env?.VITE_AUTH_URL);

/** Is there anyone to sign in to? */
export const hasAuth = () => AUTH_BASE !== '';

export const apiUrl = (path) => `${API_BASE}${path}`;
export const authUrl = (path) => `${AUTH_BASE}${path}`;

/**
 * ws:// for http://, wss:// for https:// — and wss for a relative base only
 * when the PAGE is https, since that is the one thing we know about it.
 */
export function wsUrl(path) {
  if (!API_BASE) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}${path}`;
  }
  return `${API_BASE.replace(/^http/, 'ws')}${path}`;
}
