/**
 * Who you are, and the token that proves it to the runner.
 *
 * Two different credentials, which is the part worth being clear about:
 *
 *   a session cookie   between this app and Django. HttpOnly, so no code here
 *                      ever sees it; the browser attaches it because every
 *                      request below sets credentials: 'include'.
 *   an executor token  between this app and the runner. Short-lived, held in
 *                      memory, sent as a Bearer header and — for the socket,
 *                      which cannot carry headers — in a query string.
 *
 * The runner is never given the session cookie. It is a different service on a
 * different origin, and a cookie that opens the control plane should not also
 * be sitting in a WebSocket URL.
 *
 * When VITE_AUTH_URL is unset there is no control plane, `token()` returns null
 * and nothing here does anything. That is the laptop case and it stays working.
 */
import { defineStore } from 'pinia';
import { authUrl, hasAuth } from '@/config';

/**
 * Refresh a token with a minute still on it.
 *
 * Not caution — arithmetic. A run can be dispatched a second before expiry and
 * still be reading frames a minute later, and a socket that dies mid-run looks
 * like the runner crashed. The margin has to exceed the round trip, not zero.
 */
const RENEW_BEFORE_MS = 60_000;

async function call(path, { method = 'GET', body, csrf } = {}) {
  const res = await fetch(authUrl(path), {
    method,
    // Without this the session cookie is not sent cross-origin and every
    // request looks anonymous — the failure that reads as "login did nothing".
    credentials: 'include',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRFToken': csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* html error page, or 204 */ }
  if (!res.ok) {
    const err = new Error(data.error || `${method} ${path} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const useSession = defineStore('session', {
  state: () => ({
    user: null,
    ready: false,      // has the first "who am I" answered? guards the router
    csrf: '',
    error: '',
    token: '',         // the executor token
    expiresAt: 0,
    pending: null,     // an in-flight token fetch, so N callers make one request
  }),

  getters: {
    signedIn: (s) => !hasAuth() || s.user !== null,
    required: () => hasAuth(),
  },

  actions: {
    /** Called once at startup. Never throws — an unreachable control plane is anonymous, not a crash. */
    async boot() {
      if (!hasAuth()) { this.ready = true; return; }
      try {
        this.csrf = (await call('/auth/csrf')).csrfToken ?? '';
        this.user = (await call('/auth/me')).user ?? null;
      } catch { this.user = null; }
      finally { this.ready = true; }
    },

    async login(email, password) {
      this.error = '';
      try {
        const out = await call('/auth/login', { method: 'POST', body: { email, password }, csrf: this.csrf });
        this.user = out.user;
        // Django rotates the CSRF token on login, so the one we sent is already
        // dead. Taking the new one from the response is what stops the very
        // next request being a 403.
        if (out.csrfToken) this.csrf = out.csrfToken;
        this.forgetToken();
        return true;
      } catch (err) { this.error = err.message; return false; }
    },

    async logout() {
      try {
        const out = await call('/auth/logout', { method: 'POST', csrf: this.csrf });
        if (out.csrfToken) this.csrf = out.csrfToken;
      } catch { /* going anonymous locally is the important half */ }
      this.user = null;
      this.forgetToken();
    },

    forgetToken() { this.token = ''; this.expiresAt = 0; this.pending = null; },

    /**
     * A token good right now, or null when there is no control plane.
     *
     * Every caller awaits the same in-flight request rather than starting its
     * own: the console mounts, asks for a token for the socket, and the first
     * three API calls ask at the same moment. Four tokens would be issued and
     * three thrown away.
     */
    async executorToken() {
      if (!hasAuth()) return null;
      if (this.token && Date.now() < this.expiresAt - RENEW_BEFORE_MS) return this.token;
      if (this.pending) return this.pending;

      this.pending = (async () => {
        try {
          const out = await call('/auth/executor-token', { method: 'POST', csrf: this.csrf });
          this.token = out.token;
          this.expiresAt = Date.now() + (Number(out.expiresIn) || 0) * 1000;
          return this.token;
        } catch (err) {
          this.forgetToken();
          if (err.status === 401) this.user = null;   // the session went away
          throw err;
        } finally { this.pending = null; }
      })();
      return this.pending;
    },
  },
});
