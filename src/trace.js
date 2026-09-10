/**
 * The ids every call to the runner and the control plane carries.
 *
 * X-Request-Id is new for every request. It is the id the server logs the
 * request under and the id on the error a person sees, so "request 3f2c…
 * failed" is something that can be looked up rather than described.
 *
 * The traceparent's trace id stays the same for the life of the page, so
 * everything one page load did reads as one trace across both services. Its
 * sampled flag is the "Trace my requests" setting: with the servers on
 * GC_REQUEST_LOG=sampled, the default, turning it on is how a person asks for
 * their own calls to be logged — no restart, and nobody else's calls with them.
 */
const KEY = 'gc.trace';

const hex = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
const TRACE = hex(16);

export function tracing() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setTracing(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private window */ }
}

/** This page's trace id, for a person to quote alongside a request id. */
export const traceId = () => TRACE;

/**
 * The headers for one request, and the request id they carry.
 *
 * randomUUID only exists in a secure context, and an http:// demo deployment
 * is not one; getRandomValues works everywhere, so it is the fallback.
 */
export function traceHeaders() {
  const rid = crypto.randomUUID?.() ?? `${hex(4)}-${hex(2)}-${hex(2)}-${hex(2)}-${hex(6)}`;
  return { rid, headers: { 'x-request-id': rid, traceparent: `00-${TRACE}-${hex(8)}-${tracing() ? '01' : '00'}` } };
}
