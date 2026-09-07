/**
 * The HTTP surface, in one place.
 *
 * Every call funnels through `req`, which turns a non-2xx into a thrown Error
 * carrying the server's own message — so a view can `catch (e) { this.error =
 * e.message }` and show the same words the server chose, rather than "Request
 * failed". The origin gate is the one status worth naming: a 409 with
 * `needsOrigin` is not really an error, it is the app asking a person to
 * decide, so the error object carries that through for the view to offer a
 * button instead of a red box.
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
    throw err;
  }
  return data;
}

export const api = {
  state:   () => req('/api/state'),
  version: () => req('/api/version'),
  runs:    (suite) => req(`/api/runs${suite ? `?suite=${encodeURIComponent(suite)}` : ''}`),
  defects: () => req('/api/defects'),
  hero:    () => req('/api/hero'),

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

  runSuite:   (id, caseId) => req(`/api/suites/${id}/run${caseId ? `?case=${caseId}` : ''}`, { method: 'POST' }),
};
