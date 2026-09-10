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
 * The second factor (docs/AUTH.md §5, §7.2) is the same API: the challenge
 * after a password, a passkey that signs in on its own, and the enrolment
 * endpoints. A sensitive change — the password, the address, an
 * authenticator, the recovery codes, a Google identity — may be answered
 * with a reauthentication flow instead; `guarded()` turns that into the word
 * the views hand to the reauthentication sheet, which proves whatever the
 * control plane asked for (the password, or the second factor for an account
 * that has one) and lets the view try again.
 *
 * When VITE_AUTH_URL is unset there is no control plane, `token()` returns null
 * and nothing here does anything. That is the laptop case and it stays working.
 */
import { defineStore } from 'pinia';
import { authUrl, hasAuth } from '@/config';
import { traceHeaders } from '@/trace';
import { useLive } from '@/stores/live';
import * as webauthn from '@/webauthn';

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
/**
 * How long a control-plane request may take before we treat it as not coming.
 *
 * `fetch` has no timeout of its own: a host that accepts the connection and
 * then says nothing keeps the promise pending for as long as the socket stays
 * open, which on a wedged or half-deployed control plane is indefinitely.
 * Every screen in this app waits on boot(), which is two of these, so without
 * a clock a wedged control plane is a permanently blank page rather than a
 * sign-in form that says something is wrong.
 *
 * Twelve seconds: long enough for a cold Django worker and a slow link, short
 * enough that nobody sits looking at nothing wondering whether to reload.
 */
const CALL_TIMEOUT_MS = 12_000;

async function call(store, path, { method = 'GET', body } = {}) {
  const res = await fetch(authUrl(path), {
    method,
    // AbortSignal.timeout rejects with a TimeoutError, which every caller
    // already handles the same way it handles a refused connection: as "the
    // control plane did not answer".
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    // Without this the session cookie is not sent cross-origin and every
    // request looks anonymous — the failure that reads as "login did nothing".
    credentials: 'include',
    headers: {
      // The same request id and trace context the runner's calls carry
      // (trace.js), so one page load reads as one trace across both services.
      ...traceHeaders().headers,
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

/**
 * The words for the control plane's machine-readable refusals, which arrive
 * as a bare `error` on its own endpoints (allauth's carry a sentence already).
 * Without these a page printed "switched_off" at somebody.
 */
const SWITCHED = {
  'control.signup': 'Sign-up',
  'control.invitations': 'Invitations',
  'control.google': 'Google sign-in',
  'control.passkeys': 'Passkey sign-in',
};
const SAID = {
  switched_off: (body) => `${SWITCHED[body.switch] ?? 'That'} is switched off on this deployment for now.`,
  rate_limited: () => 'Too many requests. Wait a moment and try again.',
};

/** The sentence(s) in an allauth error answer, or a fallback. */
export function messageOf(body, fallback = 'Something went wrong') {
  const errors = body?.errors;
  if (Array.isArray(errors) && errors.length) return errors.map((e) => e.message).join(' ');
  if (typeof body?.error === 'string') return SAID[body.error]?.(body) ?? body.error;
  return fallback;
}

/**
 * The first error code in an allauth error answer — or the bare `error` of
 * one of the control plane's own, which is the only code those carry.
 */
export function codeOf(body) {
  return body?.errors?.[0]?.code ?? (typeof body?.error === 'string' ? body.error : '');
}

/** The pending flow in an allauth 401, or null. */
function pendingFlow(body) {
  return body?.data?.flows?.find((f) => f.is_pending)?.id ?? null;
}

/** The types an mfa_authenticate / mfa_reauthenticate flow offers, e.g. ['totp', 'webauthn']. */
function flowTypes(body, id) {
  return body?.data?.flows?.find((f) => f.id === id)?.types ?? [];
}

/**
 * Which reauthentication a 401 to a signed-in session asks for, or null.
 * The control plane says `mfa_reauthenticate` (pending) for an account that
 * holds an authenticator — the password is never enough for it — and
 * allauth lists `reauthenticate` for one that does not.
 */
export function reauthFlow(body) {
  if (!body?.meta?.is_authenticated) return null;
  const ids = (body?.data?.flows ?? []).map((f) => f.id);
  if (ids.includes('mfa_reauthenticate')) return 'mfa_reauthenticate';
  if (ids.includes('reauthenticate')) return 'reauthenticate';
  return null;
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
const ANONYMOUS = { user: null, org: null, orgs: [], entitlements: {}, mfa: { required: false, enrolled: false, reasons: [] }, flags: {} };

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
    // And which doors the operator has switched off for everyone
    // (docs/HARDENING.md): sign-up, passkey sign-in, invitations. Open until
    // the control plane says otherwise, the way `google` is closed until it
    // says a client exists.
    config: { signup: 'invite', signupOff: false, domains: [], turnstile: null, google: false, passkeys: true, invitations: true },
    // allauth's pending flow after the last call, e.g. 'verify_email' — the
    // router sends the person to the screen that completes it.
    flow: null,
    // The kinds of second factor the pending challenge accepts
    // ('totp', 'recovery_codes', 'webauthn'), so the challenge page offers
    // the right buttons.
    mfaTypes: [],
    // The same, for a reauthentication the control plane asked for.
    reauthTypes: [],
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
    // For drawing the buttons only: the control plane and the runner decide
    // again, from the Membership row and the token, whether they work.
    manages: (s) => !hasAuth() || ['owner', 'admin'].includes(s.org?.role),
    owns: (s) => !hasAuth() || s.org?.role === 'owner',
  },

  actions: {
    /** Take a /auth/me-shaped answer into the store. */
    become(me) {
      this.user = me?.user ?? null;
      this.org = me?.org ?? null;
      this.orgs = me?.orgs ?? [];
      this.entitlements = me?.entitlements ?? {};
      this.mfa = me?.mfa ?? ANONYMOUS.mfa;
      // From the answer, not only from a 403 on the first mint: after a
      // reload the store used to say `false` until something happened to be
      // refused, and the router's guard reads this.
      this.mustChangePassword = Boolean(me?.mustChangePassword);
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
          if (status === 401) {
            this.flow = pendingFlow(body);
            if (this.flow === 'mfa_authenticate') this.mfaTypes = flowTypes(body, this.flow);
          }
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
        if (flow) {
          this.flow = flow;
          if (flow === 'mfa_authenticate') this.mfaTypes = flowTypes(body, flow);
          return flow;
        }
        this.become(null);
        this.flow = null;
        return 'anonymous';
      }
      if (status === 403 && this.blocked(body)) return 'blocked';
      if (status === 409) { this.error = 'That is not possible right now — reload the page and try again.'; return 'error'; }
      if (status === 429) { this.error = 'Too many attempts. Wait a minute and try again.'; return 'error'; }
      this.error = messageOf(body, fallback);
      return 'error';
    },

    /**
     * The two 403s the control plane's middleware answers with, routed the
     * same way `terminal()` routes them on the mint path.
     *
     * They are machine-readable words, not sentences: without this branch
     * `messageOf` fell through to `body.error` and the page rendered the
     * literal string "password_change_required" at somebody. Reachable in
     * normal use, because a page reload leaves the store's flags false until
     * something is refused.
     *
     * @returns true when it recognised and routed one.
     */
    blocked(body) {
      const code = codeOf(body);
      if (code === 'password_change_required') {
        this.mustChangePassword = true;
        this.error = '';
        useLive().disconnect();
        go({ name: 'security-password' });
        return true;
      }
      if (code === 'mfa_required') {
        this.mfa = { ...this.mfa, required: true };
        this.error = '';
        useLive().disconnect();
        go({ name: 'security-mfa' });
        return true;
      }
      return false;
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
      // A 401 to a still-signed-in session is the control plane asking for
      // a fresh proof first (the second factor, for an account that has
      // one); the caller shows the sheet and calls again.
      const wanted = res.status === 401 ? reauthFlow(res.body) : null;
      if (wanted) { this.error = ''; return wanted; }
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

    /**
     * Read the answer to a sensitive change: 'ok', the reauthentication flow
     * the control plane wants first ('reauthenticate' for the password,
     * 'mfa_reauthenticate' for the second factor — the caller shows the
     * sheet and calls again), 'anonymous' when the session is gone, or
     * 'error' with `this.error` set.
     */
    async guarded(res, { fallback, tooMany = 'Too many attempts. Wait a minute and try again.' } = {}) {
      const { status, body } = res;
      this.error = '';
      this.errorCode = codeOf(body);
      if (status === 200) return 'ok';
      if (status === 401) {
        const flow = reauthFlow(body);
        if (flow) { this.reauthTypes = flowTypes(body, 'mfa_reauthenticate'); return flow; }
        this.become(null);
        this.flow = null;
        return 'anonymous';
      }
      if (status === 403 && this.blocked(body)) return 'blocked';
      this.error = status === 429 ? tooMany : messageOf(body, fallback);
      return 'error';
    },

    /**
     * Prove the password again, for a change the control plane says is too
     * far from the last proof. Refused — with the second factor asked for
     * instead — for an account that holds an authenticator (docs/AUTH.md §7.2).
     */
    async reauthenticate(password) {
      const res = await call(this, `${HEADLESS}/auth/reauthenticate`, { method: 'POST', body: { password } });
      if (res.status === 200) { this.error = ''; this.forgetToken(); return 'ok'; }
      return this.guarded(res, { fallback: 'That password was not accepted' });
    },

    /**
     * Start changing the address: a code goes to the new one. Returns 'ok',
     * a reauthentication flow (prove it first, then call again), or 'error'.
     */
    async changeEmail(email) {
      const res = await call(this, `${HEADLESS}/account/email`, { method: 'POST', body: { email } });
      const outcome = await this.guarded(res, { fallback: 'Could not change the address', tooMany: 'Too many changes. Wait a minute and try again.' });
      if (outcome === 'ok') this.pendingEmail = email;
      return outcome;
    },

    // ---------------------------------------------------------------- the second factor

    /** The code from the app, or a recovery code, answering the challenge after a password. */
    async authenticateCode(code) {
      const res = await call(this, `${HEADLESS}/auth/2fa/authenticate`, { method: 'POST', body: { code } });
      return this.absorb(res, { fallback: 'That code was not accepted' });
    },

    /** A passkey answering the challenge after a password. */
    async authenticatePasskey() {
      return this.ceremony(`${HEADLESS}/auth/webauthn/authenticate`, (res) => this.absorb(res, { fallback: 'That passkey was not accepted' }));
    },

    /** A passkey signing in on its own (docs/AUTH.md §5): no password, and it is the second factor. */
    async passkeyLogin() {
      useLive().disconnect();
      this.forgetToken();
      return this.ceremony(`${HEADLESS}/auth/webauthn/login`, (res) => this.absorb(res, { fallback: 'Could not sign in with that passkey' }));
    },

    /** The code from the app (or a recovery code) as the reauthentication a sensitive change wants. */
    async reauthenticateCode(code) {
      const res = await call(this, `${HEADLESS}/auth/2fa/reauthenticate`, { method: 'POST', body: { code } });
      if (res.status === 200) { this.error = ''; this.forgetToken(); return 'ok'; }
      return this.guarded(res, { fallback: 'That code was not accepted' });
    },

    /** A passkey as the reauthentication. */
    async reauthenticatePasskey() {
      return this.ceremony(`${HEADLESS}/auth/webauthn/reauthenticate`, async (res) => {
        if (res.status === 200) { this.error = ''; this.forgetToken(); return 'ok'; }
        return this.guarded(res, { fallback: 'That passkey was not accepted' });
      });
    },

    /**
     * One WebAuthn assertion: GET the request options, have the browser sign
     * them, POST the credential, and let `read` say what it meant. A
     * ceremony the person cancelled is an error in words, not a crash.
     */
    async ceremony(path, read) {
      const opts = await call(this, path);
      if (opts.status !== 200) return this.guarded(opts, { fallback: 'Could not start the passkey' });
      let credential;
      try { credential = await webauthn.get(opts.body.data.request_options); }
      catch (err) { this.error = err?.name === 'NotAllowedError' ? 'The passkey was not used.' : (err?.message || 'The passkey did not work'); return 'error'; }
      return read(await call(this, path, { method: 'POST', body: { credential } }));
    },

    /** What the account holds: [{type, created_at, last_used_at, id?, name?, unused_code_count?}]. */
    async authenticators() {
      const { status, body } = await call(this, `${HEADLESS}/account/authenticators`);
      return status === 200 ? (body.data ?? []) : [];
    },

    /**
     * Begin enrolling an authenticator app. Returns {secret, url} for the QR
     * code when there is none yet, 'enrolled' when there already is, a
     * reauthentication flow, or 'error'.
     */
    async totpStart() {
      const { status, body } = await call(this, `${HEADLESS}/account/authenticators/totp`);
      if (status === 404) return { secret: body.meta?.secret, url: body.meta?.totp_url, svg: body.meta?.svg ?? '' };
      if (status === 200) return 'enrolled';
      return this.guarded({ status, body }, { fallback: 'Could not start the enrolment' });
    },

    /** Finish enrolling the app with the code it shows. */
    async totpActivate(code) {
      const res = await call(this, `${HEADLESS}/account/authenticators/totp`, { method: 'POST', body: { code } });
      const outcome = await this.guarded(res, { fallback: 'That code was not accepted' });
      if (outcome === 'ok') { this.forgetToken(); await this.refresh(); }
      return outcome;
    },

    async totpRemove() {
      const res = await call(this, `${HEADLESS}/account/authenticators/totp`, { method: 'DELETE' });
      const outcome = await this.guarded(res, { fallback: 'Could not remove the authenticator app' });
      if (outcome === 'ok') { this.forgetToken(); await this.refresh(); }
      return outcome;
    },

    /**
     * The recovery codes: {codes, unused, total}. `codes` is present only the
     * first time they are read after being made — the control plane shows
     * them once and never again (docs/AUTH.md §5).
     */
    async recoveryCodes({ regenerate = false } = {}) {
      const res = await call(this, `${HEADLESS}/account/authenticators/recovery-codes`, regenerate ? { method: 'POST' } : {});
      if (res.status === 404) return { codes: null, unused: 0, total: 0 };
      const outcome = await this.guarded(res, { fallback: 'Could not read the recovery codes' });
      if (outcome !== 'ok') return outcome;
      const d = res.body.data ?? {};
      return { codes: d.unused_codes ?? null, unused: d.unused_code_count ?? 0, total: d.total_code_count ?? 0 };
    },

    /** Add a passkey: the control plane's creation options, the browser's ceremony, the credential back. */
    async passkeyAdd(name) {
      const opts = await call(this, `${HEADLESS}/account/authenticators/webauthn?passwordless`);
      if (opts.status !== 200) return this.guarded(opts, { fallback: 'Could not start adding a passkey' });
      let credential;
      try { credential = await webauthn.create(opts.body.data.creation_options); }
      catch (err) { this.error = err?.name === 'NotAllowedError' ? 'No passkey was made.' : (err?.message || 'The passkey could not be made'); return 'error'; }
      const res = await call(this, `${HEADLESS}/account/authenticators/webauthn`, { method: 'POST', body: { name, credential } });
      const outcome = await this.guarded(res, { fallback: 'That passkey was not accepted' });
      if (outcome === 'ok') { this.forgetToken(); await this.refresh(); }
      return outcome;
    },

    async passkeyRemove(id) {
      const res = await call(this, `${HEADLESS}/account/authenticators/webauthn`, { method: 'DELETE', body: { authenticators: [id] } });
      const outcome = await this.guarded(res, { fallback: 'Could not remove that passkey' });
      if (outcome === 'ok') { this.forgetToken(); await this.refresh(); }
      return outcome;
    },

    // ---------------------------------------------------------------- sessions

    /** Every session the account has: [{id, ip, user_agent, created_at, last_seen_at, is_current}]. */
    async sessions() {
      const { status, body } = await call(this, `${HEADLESS}/auth/sessions`);
      return status === 200 ? (body.data ?? []) : [];
    },

    /** End the sessions named; the rest of the list comes back. */
    async endSessions(ids) {
      const res = await call(this, `${HEADLESS}/auth/sessions`, { method: 'DELETE', body: { sessions: ids } });
      const outcome = await this.guarded(res, { fallback: 'Could not sign those sessions out' });
      return outcome === 'ok' ? (res.body.data ?? []) : outcome;
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
     * Detach one identity. Returns 'ok', a reauthentication flow (prove it
     * first, then call again), or 'error'. The control plane refuses to
     * detach the last way into an account that has no password; its words
     * are shown as they are.
     */
    async disconnectProvider(provider, uid) {
      const res = await call(this, `${HEADLESS}/account/providers`, { method: 'DELETE', body: { provider, account: uid } });
      return this.guarded(res, { fallback: 'Could not disconnect that account' });
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
      // The socket first: it is bound to a token for the old organisation,
      // and would keep showing the old organisation's page after the switch.
      useLive().disconnect();
      const { status, body } = await call(this, '/auth/org', { method: 'POST', body: { org: slug } });
      if (status !== 200) throw new Error(messageOf(body, 'Could not switch organisation'));
      this.become(body);
      this.forgetToken();
      return this.org;
    },

    /** Who is in the selected organisation: [{id, email, name, role, joinedAt, you}]. */
    async members() {
      const { status, body } = await call(this, '/auth/members');
      return status === 200 ? (body.members ?? []) : [];
    },

    /** An owner sets another member's role. Returns true, or sets `error`. */
    async setRole(id, role) {
      const { status, body } = await call(this, `/auth/members/${id}`, { method: 'PATCH', body: { role } });
      if (status === 200) { this.error = ''; return true; }
      this.error = messageOf(body, 'Could not change that role');
      return false;
    },

    /**
     * Remove a member — or leave, with your own id, after which the session
     * is back on the personal organisation and the answer says so.
     */
    async removeMember(id) {
      const { status, body } = await call(this, `/auth/members/${id}`, { method: 'DELETE' });
      if (status !== 200) { this.error = messageOf(body, 'Could not remove that member'); return false; }
      this.error = '';
      if (body.left) { useLive().disconnect(); this.become(body); this.forgetToken(); }
      return true;
    },

    /** The selected organisation's invitations (owners and admins). */
    async invitations() {
      const { status, body } = await call(this, '/auth/invitations');
      return status === 200 ? (body.invitations ?? []) : [];
    },

    /** Invite an address. The token goes to their mailbox and nowhere else. Returns the row, or null with `error` set. */
    async invite(email, role) {
      const { status, body } = await call(this, '/auth/invitations', { method: 'POST', body: { email, role } });
      if (status === 201) { this.error = ''; return body.invitation; }
      this.error = status === 402
        ? `Your ${body.plan ?? 'current'} plan has no seat left (${body.limit ?? 'members.max'})`
        : messageOf(body, 'Could not send that invitation');
      return null;
    },

    async revokeInvitation(id) {
      const { status, body } = await call(this, `/auth/invitations/${id}`, { method: 'DELETE' });
      if (status === 200) { this.error = ''; return true; }
      this.error = messageOf(body, 'Could not revoke that invitation');
      return false;
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

      // Nobody to mint for, and asking anyway is not harmless. Before this
      // guard, any api.* call made while signed out raced boot() for the CSRF
      // token and reached the control plane without one, so a signed-out page
      // load wrote `Forbidden (CSRF cookie not set.): /auth/executor-token`
      // into the log on every render — a real error message describing a
      // non-problem, which is the kind that teaches people to skim the log.
      //
      // `ready` rather than `user` alone: during boot the answer is not "no",
      // it is "not yet", and returning null there would make the first call
      // after a reload anonymous for no reason.
      if (!this.ready) await this.boot();
      if (!this.user) return null;

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
