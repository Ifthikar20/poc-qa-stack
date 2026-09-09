/**
 * Who you are, and the token that proves it to the runner.
 *
 * Two different credentials, which is the part worth being clear about:
 *
 *   a session cookie   between this app and Django. HttpOnly, so no code here
 *                      ever sees it; the browser attaches it because every
 *                      request below sets credentials: 'include'.
 *   an executor token  between this app and the runner. Short-lived, held in
 *                      memory, sent as a Bearer header — and never in a URL.
 *                      The socket, which cannot carry headers, is opened with
 *                      a thirty-second ticket bought with the token instead
 *                      (stores/live.js).
 *
 * The runner is never given the session cookie. It is a different service on a
 * different origin, and a cookie that opens the control plane should not also
 * be sitting anywhere near a WebSocket.
 *
 * When VITE_AUTH_URL is unset there is no control plane, `token()` returns null
 * and nothing here does anything. That is the laptop case and it stays working.
 */
import { defineStore } from 'pinia';
import { authUrl, hasAuth } from '@/config';
import { useLive } from '@/stores/live';

/**
 * Route from inside the store. The router imports this store for its guard,
 * so importing the router at the top here would be a cycle at module load;
 * asking for it when it is needed is not.
 */
const go = async (to) => (await import('@/router')).default.replace(to);

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

/**
 * What /auth/me answers, and the shape login and an org switch answer too:
 *
 *   { user: {id, email, name}, org: {slug, name, role}, orgs: [...],
 *     entitlements: {...}, mfa: {required, enrolled}, flags: {} }
 *
 * Everything here is for DISPLAY. Which organisation a call acts for, what
 * the role allows and what the plan permits are decided by the control plane
 * and the runner from a signed token; a value in this store changes what is
 * drawn, never what is allowed. There is no isStaff and there will not be one.
 */
const ANONYMOUS = { user: null, org: null, orgs: [], entitlements: {}, mfa: { required: false, enrolled: false }, flags: {} };

export const useSession = defineStore('session', {
  state: () => ({
    ...ANONYMOUS,
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
    /** Take a /auth/me-shaped answer into the store. */
    become(me) {
      this.user = me?.user ?? null;
      this.org = me?.org ?? null;
      this.orgs = me?.orgs ?? [];
      this.entitlements = me?.entitlements ?? {};
      this.mfa = me?.mfa ?? ANONYMOUS.mfa;
      this.flags = me?.flags ?? {};
    },

    /** Called once at startup. Never throws — an unreachable control plane is anonymous, not a crash. */
    async boot() {
      if (!hasAuth()) { this.ready = true; return; }
      try {
        this.csrf = (await call('/auth/csrf')).csrfToken ?? '';
        this.become(await call('/auth/me'));
      } catch { this.become(null); }
      finally { this.ready = true; }
    },

    async login(email, password) {
      this.error = '';
      // Whoever was attached before is detached BEFORE the new session
      // exists, so a socket bound to the previous person's token is never
      // still open under the next one's [session-3].
      useLive().disconnect();
      this.forgetToken();
      try {
        const out = await call('/auth/login', { method: 'POST', body: { email, password }, csrf: this.csrf });
        this.become(out);
        // Django rotates the CSRF token on login, so the one we sent is already
        // dead. Taking the new one from the response is what stops the very
        // next request being a 403.
        if (out.csrfToken) this.csrf = out.csrfToken;
        this.forgetToken();
        return true;
      } catch (err) { this.error = err.message; return false; }
    },

    async logout() {
      // The socket first: the runner drops it at once on {t:'bye'}, and the
      // frames stop before the session does rather than after.
      useLive().disconnect();
      try {
        const out = await call('/auth/logout', { method: 'POST', csrf: this.csrf });
        if (out.csrfToken) this.csrf = out.csrfToken;
      } catch { /* going anonymous locally is the important half */ }
      this.become(null);
      this.forgetToken();
    },

    /**
     * The control plane said the session is over, or is not allowed to do
     * this yet. Both are decided here, once, because every caller of
     * executorToken() would otherwise have to know what a 401 from the
     * control plane means as opposed to one from the runner (docs/AUTH.md §9.8).
     *
     *   401            terminal: the session is gone (expired, signed out
     *                  elsewhere, deactivated). Clear the user, drop the
     *                  socket, go to the login page. Nothing retries.
     *   403 mfa_required  the account must enrol an authenticator before it
     *                  may do anything else; the page for that is the only
     *                  place to send anyone.
     */
    async terminal(err) {
      if (err.status === 401) {
        this.become(null);
        this.forgetToken();
        useLive().disconnect();
        await go({ name: 'login' });
        return true;
      }
      if (err.status === 403 && err.message === 'mfa_required') {
        this.mfa = { ...this.mfa, required: true };
        useLive().disconnect();
        await go({ name: 'security-mfa' });
        return true;
      }
      return false;
    },

    /**
     * Act for another organisation. The control plane checks the membership
     * and remembers the choice in the session; the token minted next carries
     * it, which is why the current one is forgotten here — a token for the
     * old organisation would keep driving the old organisation's state.
     */
    async switchOrg(slug) {
      const out = await call('/auth/org', { method: 'POST', body: { org: slug }, csrf: this.csrf });
      this.become(out);
      this.forgetToken();
      return this.org;
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
          await this.terminal(err);
          throw err;
        } finally { this.pending = null; }
      })();
      return this.pending;
    },
  },
});
