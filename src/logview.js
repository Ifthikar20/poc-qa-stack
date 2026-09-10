/**
 * The console's log: one live stream, and the filters over it.
 *
 * Two feeds make it. What the driven page printed — every console level, the
 * uncaught exceptions that never reach console.*, and what the browser itself
 * says about the page (a failed resource load, a blocked request), which
 * Playwright reports as console messages too. And what the runner said while
 * driving it. They were two boxes, and the answer to "why did step 4 fail" is
 * usually one line from each, a few milliseconds apart.
 *
 * Pure, so the rules are tested rather than eyeballed (test/logview.test.js).
 */

/** DevTools' buckets. A `log` files under info: nobody wants one without the other. */
export const LEVELS = ['error', 'warn', 'info', 'debug'];
export const levelOf = (level) => (LEVELS.includes(level) ? level : 'info');

const fromPage = (l) => ({
  id: `p${l.id}`, seq: l.seq ?? null, at: l.at, level: levelOf(l.level), said: l.level, text: String(l.text ?? ''),
  source: l.source === 'exception' ? 'exception' : 'page', url: l.url ?? null, line: l.line ?? null,
});
const fromRunner = (l) => ({
  id: `r${l.id}`, seq: l.seq ?? null, at: l.at, level: levelOf(l.level), said: l.level, text: String(l.msg ?? ''),
  source: 'runner', url: null, line: null,
});

/**
 * Which came first: by arrival number where both lines have one. The runner's
 * line and the page's line land in the same millisecond all the time, and a
 * clock that cannot tell them apart put an exception above the step it broke.
 */
const earlier = (x, y) => (x.seq != null && y.seq != null ? x.seq < y.seq : x.at <= y.at);

/**
 * Both feeds, in the order they arrived. The page's lines come oldest first and
 * the runner's newest first (the rail reads down from the latest), so each is
 * already in order and this is a merge, not a sort.
 */
export function mergeLogs(page = [], runner = []) {
  const a = page.map(fromPage);
  const b = [];
  for (let k = runner.length - 1; k >= 0; k--) b.push(fromRunner(runner[k]));
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && earlier(a[i], b[j]))) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

/**
 * What a filter leaves. No levels picked means every level: a row of toggles
 * that shows nothing once they are all off is a trap, not a setting.
 */
export function filterLogs(rows, { since = 0, levels = [], source = 'all', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => r.at > since
    && (!levels.length || levels.includes(r.level))
    && (source === 'all' || (source === 'runner') === (r.source === 'runner'))
    && (!q || r.text.toLowerCase().includes(q) || (r.url ?? '').toLowerCase().includes(q)));
}

/** Rows per level, for the level buttons' own counts. */
export function countLevels(rows) {
  const n = { error: 0, warn: 0, info: 0, debug: 0 };
  for (const r of rows) n[r.level] += 1;
  return n;
}

/**
 * Consecutive identical lines as one row with a count — a render loop that
 * logs every frame is one line, not four hundred. Never across sources or
 * scripts: the page and the runner saying the same words are two facts.
 */
export function foldLogs(rows) {
  const out = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && last.text === r.text && last.level === r.level && last.source === r.source && last.url === r.url) {
      last.n += 1;
      continue;
    }
    out.push({ ...r, n: 1 });
  }
  return out;
}

/** `14:03:07.412`, the way DevTools stamps a line. */
export function clock(at) {
  const d = new Date(at);
  const two = (n) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** `https://x.test/assets/app.js?v=3` at line 120 -> `app.js:120`, the way DevTools names where a line came from. */
export function whereFrom(url, line) {
  if (!url) return null;
  let name = url;
  try {
    const u = new URL(url);
    name = u.pathname.split('/').filter(Boolean).at(-1) || u.host;
  } catch { /* not a URL: shown as it came */ }
  return line ? `${name}:${line}` : name;
}
