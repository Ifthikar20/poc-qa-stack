/**
 * The HTTP surface, in one place.
 *
 * Every call funnels through `req`, which turns a non-2xx into a thrown Error
 * carrying the server's own message — so a view can `catch (e) { this.error =
 * e.message }` and show the same words the server chose, rather than "Request
 * failed". Five statuses are worth naming on the error object, because each
 * is the app asking a person for something rather than reporting a fault: a
 * 409 with `needsOrigin` wants a decision, a 409 `runner_busy` wants patience
 * (another organisation has the browser), a 403 `step_up_required` wants a
 * fresh sign-in, a 403 `forbidden` wants an owner or admin, and a 402
 * `entitlement` wants a bigger plan. The view offers the right button — or
 * the right sentence — instead of a red box.
 *
 * Every path goes through `apiUrl`, which is the identity function while the
 * backend serves this app and a real origin once it does not. Writing the
 * paths bare would work today and fail silently the day the frontend is
 * deployed on its own — as 404s from a static host, which look like a broken
 * API rather than a missing one.
 */
import { apiUrl } from '@/config';
import { useSession } from '@/stores/session';

async function req(path, { method = 'GET', body } = {}) {
  // null whenever there is no control plane, and then no header is sent and
  // the runner — also unauthenticated — does not ask for one.
  const token = await useSession().executorToken().catch(() => null);

  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* 204, or a proxy in the way */ }
  if (!res.ok) {
    // A 401 from the RUNNER means the token is spent, not that the person is
    // signed out — their Django session may be perfectly good. Dropping the
    // cached token makes the next call mint a fresh one instead of retrying a
    // dead one until someone reloads the page.
    if (res.status === 401) useSession().forgetToken();
    const err = new Error(data.error || `${method} ${path} failed (${res.status})`);
    err.status = res.status;
    if (data.needsOrigin) err.needsOrigin = data.needsOrigin;
    // The plan said no (docs/AUTH.md §10): which limit, and which plan it is.
    if (res.status === 402 && data.error === 'entitlement') {
      err.entitlement = { limit: data.limit, plan: data.plan };
      err.message = `Your ${data.plan ?? 'current'} plan does not allow this (${data.limit ?? 'limit reached'})`;
    }
    // One browser, one driving organisation (docs/AUTH.md §10): someone
    // else has it, and the honest answer is to say so and wait.
    if (res.status === 409 && data.error === 'runner_busy') {
      err.busy = { org: data.org ?? null };
      err.message = 'Another organisation is driving the runner right now — try again when it is free';
    }
    // Origins and the vault are an owner's or admin's to change.
    if (res.status === 403 && data.error === 'forbidden') {
      err.forbidden = true;
      err.message = 'Only an owner or admin of this organisation can do that';
    }
    // Allowing an origin wants a recent proof of the strongest factor the
    // account has (docs/AUTH.md §9): the view opens the reauthentication
    // sheet, forgets the token so the next one carries a fresh `su`, and
    // retries. The words are for the rare caller with no sheet.
    if (res.status === 403 && data.error === 'step_up_required') {
      err.stepUp = true;
      err.message = 'Allowing an origin needs a recent sign-in — confirm it is you, then retry';
    }
    throw err;
  }
  return data;
}

/**
 * A binary body, with the same token the JSON calls use.
 *
 * An `<img src>` cannot carry an Authorization header, so a gated image has to
 * be fetched and turned into a blob URL — the same thing ConsoleView does with
 * screencast frames. Returns null rather than throwing: a missing icon is the
 * normal case, not an error worth a red box.
 */
async function bytes(path) {
  const token = await useSession().executorToken().catch(() => null);
  try {
    const res = await fetch(apiUrl(path), {
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    if (res.status === 401) useSession().forgetToken();
    if (!res.ok) return null;
    return await res.blob();
  } catch { return null; }
}

export const api = {
  state:   () => req('/api/state'),
  // A 30-second, single-use ticket the socket is opened with, so the token
  // itself never goes into a URL (docs/AUTH.md §9).
  socketTicket: () => req('/api/socket-ticket', { method: 'POST' }),
  version: () => req('/api/version'),
  runs:    (suite) => req(`/api/runs${suite ? `?suite=${encodeURIComponent(suite)}` : ''}`),
  defects: () => req('/api/defects'),
  hero:    () => req('/api/hero'),
  siteIcon: (origin) => bytes(`/api/sites/icon?origin=${encodeURIComponent(origin)}`),

  origins:      () => req('/api/origins'),
  allowOrigin:  (origin) => req('/api/origins', { method: 'POST', body: { origin } }),
  removeOrigin: (origin) => req('/api/origins', { method: 'DELETE', body: { origin } }),

  suites:      () => req('/api/suites'),
  cases:       () => req('/api/cases'),
  quickstart:  (url) => req('/api/suites/quickstart', { method: 'POST', body: { url } }),
  suite:       (id) => req(`/api/suites/${id}`),
  createSuite: (body) => req('/api/suites', { method: 'POST', body }),
  updateSuite: (id, body) => req(`/api/suites/${id}`, { method: 'PATCH', body }),
  deleteSuite: (id) => req(`/api/suites/${id}`, { method: 'DELETE' }),

  addPage:    (id, body) => req(`/api/suites/${id}/pages`, { method: 'POST', body }),
  updatePage: (id, pid, body) => req(`/api/suites/${id}/pages/${pid}`, { method: 'PATCH', body }),
  removePage: (id, pid) => req(`/api/suites/${id}/pages/${pid}`, { method: 'DELETE' }),
  scanPage:   (id, pid) => req(`/api/suites/${id}/pages/${pid}/scan`, { method: 'POST' }),
  pageCheck:  (id, pid) => req(`/api/suites/${id}/pages/${pid}/check`),

  addCase:    (id, body) => req(`/api/suites/${id}/cases`, { method: 'POST', body }),
  updateCase: (id, cid, body) => req(`/api/suites/${id}/cases/${cid}`, { method: 'PATCH', body }),
  removeCase: (id, cid) => req(`/api/suites/${id}/cases/${cid}`, { method: 'DELETE' }),

  runSuite:   (id, caseId, pace) => {
    const q = new URLSearchParams();
    if (caseId) q.set('case', caseId);
    // Only when it is actually chosen — an absent pace means "the server's
    // default", which is not the same as any number this app could guess.
    if (pace !== undefined) q.set('pace', String(pace));
    return req(`/api/suites/${id}/run${q.size ? `?${q}` : ''}`, { method: 'POST' });
  },
};
