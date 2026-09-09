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
 * Signing up, in, out, verifying, resetting and changing things are
 * django-allauth's JSON API (docs/AUTH.md §4, §5, §7). Its answers have one
 * shape — {status, data, errors, meta} — and a 401 is not "go away" but "here
 * is what is pending": a verification code, a second factor, a
 * reauthentication. `absorb()` reads that once, for every call, and the views
 * route on the word it returns rather than each parsing a response.
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

const HEADLESS = '/_allauth/browser/v1';

/**
 * One request to the control plane. Never throws on a status: allauth's
 * 400s and 401s carry the answer, so the caller reads {status, body} and
 * decides. Throws only when there was no answer at all.
 */
async function call(store, path, { method = 'GET', body } = {}) {
  const res = await fetch(authUrl(path), {
    method,
    // Without this the session cookie is not sent cross-origin and every
    // request looks anonymous — the failure that reads as "login did nothing".
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(store.csrf ? { 'X-CSRFToken': store.csrf } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // Django rotates the CSRF token on sign-in and sign-out, and the SPA on a
  // laptop is on another origin and cannot read the cookie; the control
  // plane puts the fresh value in a header on every answer instead.
  const rotated = res.headers.get('X-CSRFToken');
  if (rotated) store.csrf = rotated;
  let data = {};
  try { data = await res.json(); } catch { /* html error page, or 204 */ }
  return { status: res.status, body: data };
}

/** The sentence(s) in an allauth error answer, or a fallback. */
export function messageOf(body, fallback = 'Something went wrong') {
  const errors = body?.errors;
  if (Array.isArray(errors) && errors.length) return errors.map((e) => e.message).join(' ');
  if (typeof body?.error === 'string') return body.error;
  return fallback;
}

/** The first error code in an allauth error answer, or ''. */
export function codeOf(body) {
  return body?.errors?.[0]?.code ?? '';
}

/** The pending flow in an allauth 401, or null. */
function pendingFlow(body) {
  return body?.data?.flows?.find((f) => f.is_pending)?.id ?? null;
}

/**
 * A `?next=` worth honouring: a path inside this app, and nothing else. Not
 * another site, not a protocol-relative `//host`, not a `/\host` a browser
 * would read the same way. Used by the login page, the verify page, the
 * router and the Google button, so the four cannot disagree about what a
 * safe destination is.
 */
export function safeNext(value) {
  const n = String(value ?? '');
  return /^\/(?![/\\])/.test(n) ? n : '';
}

/** Where the SPA asks the control plane to start a Google sign-in (docs/AUTH.md §6). */
export const PROVIDER_REDIRECT = `${HEADLESS}/auth/provider/redirect`;

/**
 * What /auth/me answers:
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
    errorCode: '',     // allauth's code for the last refusal, e.g. 'turnstile_required'
    // What the sign-up page needs before anyone types: the mode, the
    // Turnstile site key when there is one, and whether a Google client is
    // configured so "Continue with Google" has somewhere to go (GET /auth/config).
    config: { signup: 'invite', domains: [], turnstile: null, google: false },
    // allauth's pending flow after the last call, e.g. 'verify_email' — the
    // router sends the person to the screen that completes it.
    flow: null,
    pendingEmail: '',  // the address a code was sent to, for the verify page
    // The password that signed this session in is in a breach corpus; the
    // control plane allows nothing but changing it (docs/AUTH.md §3).
    mustChangePassword: false,
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
      if (this.user) this.flow = null;
    },

    /** Ask the control plane who this session is, and take the answer. */
    async refresh() {
      const { status, body } = await call(this, '/auth/me');
      if (status === 200) { this.become(body); return true; }
      this.become(null);
      return false;
    },

    /** Called once at startup. Never throws — an unreachable control plane is anonymous, not a crash. */
    async boot() {
      if (!hasAuth()) { this.ready = true; return; }
      try {
        const { body } = await call(this, '/auth/csrf');
        this.csrf = body.csrfToken ?? this.csrf;
        const cfg = await call(this, '/auth/config');
        if (cfg.status === 200) this.config = { ...this.config, ...cfg.body };
        await this.refresh();
        // A reload mid-verification: allauth still holds the pending flow,
        // and the router should land on the code screen, not the form.
        if (!this.user) {
          const { status, body } = await call(this, `${HEADLESS}/auth/session`);
          if (status === 401) this.flow = pendingFlow(body);
        }
      } catch { this.become(null); }
      finally { this.ready = true; }
    },

    /**
     * Read an allauth authentication answer into the store and say what to do
     * next: 'ok' (signed in), a pending flow id ('verify_email', …), or
     * 'error' with `this.error` set. One place, because every one of the
     * calls below ends in the same three shapes.
     */
    async absorb(res, { fallback } = {}) {
      const { status, body } = res;
      this.error = '';
      this.errorCode = codeOf(body);
      if (status === 200 && body?.meta?.is_authenticated) {
        this.forgetToken();
        await this.refresh();
        return 'ok';
      }
      if (status === 401) {
        const flow = pendingFlow(body);
        if (flow) { this.flow = flow; return flow; }
        this.become(null);
        this.flow = null;
        return 'anonymous';
      }
      if (status === 409) { this.error = 'That is not possible right now — reload the page and try again.'; return 'error'; }
      if (status === 429) { this.error = 'Too many attempts. Wait a minute and try again.'; return 'error'; }
      this.error = messageOf(body, fallback);
      return 'error';
    },

    // ---------------------------------------------------------------- sign-in / up

    async login(email, password, turnstile) {
      // Whoever was attached before is detached BEFORE the new session
      // exists, so a socket bound to the previous person's token is never
      // still open under the next one's [session-3].
      useLive().disconnect();
      this.forgetToken();
      this.pendingEmail = email;
      const res = await call(this, `${HEADLESS}/auth/login`, {
        method: 'POST', body: { email, password, ...(turnstile ? { turnstile } : {}) },
      });
      return this.absorb(res, { fallback: 'Could not sign in' });
    },

    async signup(email, password, turnstile) {
      useLive().disconnect();
      this.forgetToken();
      this.pendingEmail = email;
      const res = await call(this, `${HEADLESS}/auth/signup`, {
        method: 'POST', body: { email, password, ...(turnstile ? { turnstile } : {}) },
      });
      return this.absorb(res, { fallback: 'Could not sign up' });
    },

    /** The six-digit code from the mail — at sign-up, or when changing the address. */
    async verify(code) {
      const res = await call(this, `${HEADLESS}/auth/email/verify`, { method: 'POST', body: { key: code } });
      if (res.status === 200 && this.user) {
        // An email change, verified: the session is the same, the address is not.
        this.error = '';
        await this.refresh();
        return 'ok';
      }
      if (res.status === 409) { this.flow = null; this.error = 'No code is waiting to be entered — start again.'; return 'error'; }
      return this.absorb(res, { fallback: 'That code was not accepted' });
    },

    async resendCode() {
      const { status, body } = await call(this, `${HEADLESS}/auth/email/verify/resend`, { method: 'POST' });
      if (status === 200) { this.error = ''; return true; }
      this.error = status === 429 ? 'A code was sent a moment ago — give it ten seconds.' : messageOf(body, 'Could not send another code');
      return false;
    },

    async logout() {
      // The socket first: the runner drops it at once on {t:'bye'}, and the
      // frames stop before the session does rather than after.
      useLive().disconnect();
      try { await call(this, `${HEADLESS}/auth/session`, { method: 'DELETE' }); }
      catch { /* going anonymous locally is the important half */ }
      this.become(null);
      this.flow = null;
      this.mustChangePassword = false;
      this.forgetToken();
    },

    // ---------------------------------------------------------------- recovery

    async requestReset(email) {
      const { status, body } = await call(this, `${HEADLESS}/auth/password/request`, { method: 'POST', body: { email } });
      if (status === 200) { this.error = ''; return true; }
      this.error = status === 429 ? 'Too many requests. Wait a minute and try again.' : messageOf(body, 'Could not request a reset');
      return false;
    },

    async resetPassword(key, password) {
      const res = await call(this, `${HEADLESS}/auth/password/reset`, { method: 'POST', body: { key, password } });
      // Not signed in by it, on purpose: a 401 with no pending flow is success.
      if (res.status === 401 && !pendingFlow(res.body)) { this.error = ''; return 'ok'; }
      return this.absorb(res, { fallback: 'Could not reset the password' });
    },

    async changePassword(current, next) {
      const res = await call(this, `${HEADLESS}/account/password/change`, {
        method: 'POST', body: { current_password: current, new_password: next },
      });
      // The control plane ends this session on a change (every other one
      // too): a 401 with nothing pending is the change having worked.
      if (res.status === 401 && !pendingFlow(res.body)) {
        useLive().disconnect();
        this.become(null);
        this.mustChangePassword = false;
        this.forgetToken();
        this.error = '';
        return 'ok';
      }
      return this.absorb(res, { fallback: 'Could not change the password' });
    },

    /** Prove the password again, for a change the control plane says is too far from the last proof. */
    async reauthenticate(password) {
      const res = await call(this, `${HEADLESS}/auth/reauthenticate`, { method: 'POST', body: { password } });
      if (res.status === 200) { this.error = ''; this.forgetToken(); return 'ok'; }
      return this.absorb(res, { fallback: 'That password was not accepted' });
    },

    /**
     * Start changing the address: a code goes to the new one. Returns 'ok',
     * 'reauthenticate' (prove the password first, then call again), or 'error'.
     */
    async changeEmail(email) {
      const { status, body } = await call(this, `${HEADLESS}/account/email`, { method: 'POST', body: { email } });
      if (status === 200) { this.error = ''; this.pendingEmail = email; return 'ok'; }
      if (status === 401 && pendingFlow(body) === 'reauthenticate') { this.error = ''; return 'reauthenticate'; }
      this.error = status === 429 ? 'Too many changes. Wait a minute and try again.' : messageOf(body, 'Could not change the address');
      return 'error';
    },

    // ---------------------------------------------------------------- connected accounts

    /**
     * The Google identities that open this account, as allauth lists them:
     * [{uid, provider: {id, name}, display}]. Starting a connect is not a
     * call — it is the GoogleButton's form POST, because the answer is a
     * redirect to Google that only a navigation can follow.
     */
    async providers() {
      const { status, body } = await call(this, `${HEADLESS}/account/providers`);
      return status === 200 ? (body.data ?? []) : [];
    },

    /**
     * Detach one identity. Returns 'ok', 'reauthenticate' (prove the
     * password first, then call again), or 'error'. The control plane
     * refuses to detach the last way into an account that has no
     * password; its words are shown as they are.
     */
    async disconnectProvider(provider, uid) {
      const { status, body } = await call(this, `${HEADLESS}/account/providers`, {
        method: 'DELETE', body: { provider, account: uid },
      });
      if (status === 200) { this.error = ''; return 'ok'; }
      if (status === 401 && pendingFlow(body) === 'reauthenticate') { this.error = ''; return 'reauthenticate'; }
      this.error = messageOf(body, 'Could not disconnect that account');
      return 'error';
    },

    // ---------------------------------------------------------------- organisations

    /** Become a member through a mailed invitation; the session switches to that organisation. */
    async acceptInvitation(token) {
      const { status, body } = await call(this, '/auth/invitations/accept', { method: 'POST', body: { token } });
      if (status === 200) { this.become(body); this.forgetToken(); this.error = ''; return true; }
      this.error = status === 429 ? 'Too many attempts. Wait a minute and try again.' : messageOf(body, 'That invitation could not be used');
      return false;
    },

    /**
     * Act for another organisation. The control plane checks the membership
     * and remembers the choice in the session; the token minted next carries
     * it, which is why the current one is forgotten here — a token for the
     * old organisation would keep driving the old organisation's state.
     */
    async switchOrg(slug) {
      const { status, body } = await call(this, '/auth/org', { method: 'POST', body: { org: slug } });
      if (status !== 200) throw new Error(messageOf(body, 'Could not switch organisation'));
      this.become(body);
      this.forgetToken();
      return this.org;
    },

    // ---------------------------------------------------------------- the token

    /**
     * The control plane said the session is over, or is not allowed to do
     * this yet. All three are decided here, once, because every caller of
     * executorToken() would otherwise have to know what a 401 from the
     * control plane means as opposed to one from the runner (docs/AUTH.md §9.8).
     *
     *   401            terminal: the session is gone (expired, signed out
     *                  elsewhere, deactivated). Clear the user, drop the
     *                  socket, go to the login page. Nothing retries.
     *   403 mfa_required  the account must enrol an authenticator before it
     *                  may do anything else; the page for that is the only
     *                  place to send anyone.
     *   403 password_change_required  the password that signed in is in a
     *                  breach corpus; the change page is the only place.
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
      if (err.status === 403 && err.message === 'password_change_required') {
        this.mustChangePassword = true;
        useLive().disconnect();
        await go({ name: 'security-password' });
        return true;
      }
      return false;
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
          const { status, body } = await call(this, '/auth/executor-token', { method: 'POST' });
          if (status !== 200) {
            const err = new Error(body.error || `POST /auth/executor-token failed (${status})`);
            err.status = status;
            throw err;
          }
          this.token = body.token;
          this.expiresAt = Date.now() + (Number(body.expiresIn) || 0) * 1000;
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
