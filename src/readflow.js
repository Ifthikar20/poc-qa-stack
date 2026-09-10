/**
 * A case, read for a person rather than parsed for the runner.
 *
 * The runner's flow.js decides what runs, and this decides nothing: it never
 * refuses a line and never builds a plan, and a line it does not recognise is
 * kept where it was and marked rather than dropped. A reading aid that hides
 * the step you were looking for is worse than the wall of text it replaced —
 * and a wall is what a real recording is: names a paragraph long, an entry
 * fingerprint of forty targets, a coordinate comment for every click, and the
 * nine things you actually did somewhere in the middle.
 *
 * Steps are numbered the way the runner numbers a straight flow — the entry,
 * then each transition's actions, then the place it arrives at — which is also
 * how `%% at N` counts, so a recorded position finds the step it belongs to.
 */
import { parseAction } from './lang/vocabulary.js';

/** `id(("url"))`, `id["/path"]`, `id{{"text"}}`, `id("name")` — every space kept, so Source shows the line as written. */
const NODE = /^(\s*)([\w-]+)(\s*)(\(\(|\{\{|\[|\()(\s*)"((?:[^"\\]|\\.)*)"(\s*)(\)\)|\}\}|\]|\))(\s*)$/;
/** `a --> b`, or `a -->|one; two| b`. The label runs to the LAST bar, so a name may contain one. */
const EDGE = /^\s*([\w-]+)\s*-->\s*(?:\|(.*)\|\s*)?([\w-]+)\s*$/;
const SHAPE = { '((': 'entry', '[': 'url', '{{': 'text', '(': 'name' };
const KIND = { click: 'act', hover: 'act', fill: 'fill', wait: 'move', scroll: 'move', check: 'check', see: 'check' };
/**
 * The colour a step is drawn in: one per verb, where KIND is the coarser split
 * the counts are made of. A goto is `open`; a line nothing can read is `todo`,
 * the colour of what needs fixing.
 */
const TONE = { click: 'click', hover: 'hover', fill: 'fill', wait: 'wait', scroll: 'scroll', check: 'check', see: 'see' };
const LANDMARK = {
  navigation: 'in nav', contentinfo: 'in footer', banner: 'in header', main: 'in main',
  complementary: 'in sidebar', form: 'in form', region: 'in region', search: 'in search',
};

/** Past this many characters a name is a paragraph, and any edit to that text breaks the step. */
export const LONG_NAME = 60;

/** `main` -> "in main", `nth2` -> "match 2": what a scope means, in words. */
export function scopeLabel(scope) {
  const nth = /^nth(\d+)$/.exec(scope ?? '');
  return nth ? `match ${nth[1]}` : LANDMARK[scope] ?? scope;
}

/**
 * Where an address in a case goes, or null for text that is not one.
 *
 * A path resolves against the case's own start — `/tools` in a recording that
 * opened https://treasury.sh/ is https://treasury.sh/tools. Nothing but http(s)
 * is ever a link: a case is text somebody pasted, and a `javascript:` URL is
 * how pasted text gets to run.
 */
export function linkFor(text, base) {
  const raw = String(text ?? '').trim().replace(/^(["'])(.*)\1$/, '$2');
  if (!/^https?:\/\//i.test(raw) && !(raw.startsWith('/') && base)) return null;
  try {
    const url = new URL(raw, base || undefined);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** A label's clauses with the `;` between them kept, so nothing is lost on the way back to text. */
function splitLabel(label) {
  const parts = [];
  let cur = '';
  let quoted = false;
  for (const ch of label) {
    if (ch === "'") quoted = !quoted;
    if (ch === ';' && !quoted) { parts.push(cur, ';'); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** `main/link:Pricing` -> scope, role, name. An alias has no role and is its own name. */
function splitTarget(target) {
  if (!target) return {};
  let rest = String(target);
  let scope = null;
  const slash = rest.indexOf('/');
  const colon = rest.indexOf(':');
  if (slash > 0 && (colon < 0 || slash < colon) && /^(?:[a-z]+|nth\d+)$/.test(rest.slice(0, slash))) {
    scope = rest.slice(0, slash);
    rest = rest.slice(slash + 1);
  }
  const i = rest.indexOf(':');
  return i < 1 ? { name: rest, role: null, scope } : { role: rest.slice(0, i), name: rest.slice(i + 1), scope };
}

// ------------------------------------------------------------------ colour

/** One clause as coloured pieces, in its own words: nothing added, nothing lost. */
function paintClause(text) {
  const lead = /^\s*/.exec(text)[0];
  const body = text.slice(lead.length);
  const verb = /^[a-z]+/i.exec(body)?.[0] ?? '';
  const out = [{ t: lead, c: 'plain' }];
  if (/^goto$/i.test(verb)) {
    const rest = body.slice(verb.length);
    const gap = /^\s*/.exec(rest)[0];
    return [...out, { t: verb, c: 'open' }, { t: gap, c: 'plain' }, { t: rest.slice(gap.length), c: 'link' }];
  }
  const tone = TONE[verb.toLowerCase()];
  if (!tone) return [...out, { t: body, c: 'bad' }];

  out.push({ t: verb, c: tone });
  let valued = false;   // past `=` or `is`, a quoted string is a value, not a name
  for (const [piece] of body.slice(verb.length).matchAll(/'[^']*'?|\$\w+|:\s*(?:[a-z]+\d*\/)?[a-z]+|\s*=\s*|\s+is\s+|\s+|[^\s'$:=]+|./gi)) {
    let c;
    if (piece.startsWith("'")) c = valued ? 'value' : 'name';
    else if (piece.startsWith('$')) c = piece === '$TODO' ? 'todo' : 'vault';
    else if (piece.startsWith(':')) c = /[:/]\s*link$/i.test(piece) ? 'link-role' : 'role';
    else if (piece.includes('=') || /^\s+is\s+$/i.test(piece)) { c = 'punct'; valued = true; }
    else if (!piece.trim()) c = 'plain';
    else c = valued ? 'value' : `${tone}-word`;
    out.push({ t: piece, c });
  }
  // A link on the page is drawn as one: its name as well as its role.
  out.forEach((tk, i) => {
    if (tk.c !== 'link-role') return;
    for (let j = i - 1; j > 0; j--) if (out[j].c === 'name') { out[j].c = 'link-name'; break; }
  });
  return out;
}

/** The ends of a node or edge line: ids, arrows, and the space between them. */
function paintEnds(text) {
  return [...text.matchAll(/\s+|-->|\S+?(?=\s|-->|$)|./g)]
    .map(([p]) => ({ t: p, c: !p.trim() ? 'plain' : p === '-->' ? 'punct' : 'node' }));
}

function paintEdge(line) {
  const first = line.indexOf('|');
  const last = line.lastIndexOf('|');
  if (first < 0 || last === first) return paintEnds(line);
  const out = [...paintEnds(line.slice(0, first)), { t: '|', c: 'punct' }];
  splitLabel(line.slice(first + 1, last)).forEach((part, k) => {
    if (k % 2) out.push({ t: part, c: 'punct' });
    else out.push(...paintClause(part));
  });
  return [...out, { t: '|', c: 'punct' }, ...paintEnds(line.slice(last + 1))];
}

/** A place is an address — the entry, or a URL it arrives at — except a text node, which is something to see. */
function paintNode(m) {
  const [, lead, id, gap, open, pad, value, pad2, close, tail] = m;
  const shape = SHAPE[open];
  return [
    { t: lead, c: 'plain' }, { t: id, c: 'node' }, { t: `${gap}${open}${pad}"`, c: 'punct' },
    { t: value, c: shape === 'entry' || shape === 'url' ? 'link' : shape === 'text' ? 'see-word' : 'place' },
    { t: `"${pad2}${close}${tail}`, c: 'punct' },
  ];
}

// ------------------------------------------------------------------- steps

const WARNINGS = [
  (s) => s.vault === 'TODO' && '$TODO — point it at a vault key before this runs',
  (s) => /^nth\d+$/.test(s.scope ?? '') && 'picked by position — breaks if the page reorders',
  (s) => (s.name ?? '').length > LONG_NAME && 'a long name — breaks if any of that text changes',
];

/** One action clause, as the parts a person checks. */
function describe(clause) {
  if (/^goto\s/i.test(clause)) {
    return { kind: 'open', tone: 'open', verb: 'open', name: clause.replace(/^goto\s+/i, '').replace(/^(["'])(.*)\1$/, '$2') };
  }
  let s;
  try {
    s = parseAction(clause);
  } catch {
    return { kind: 'unreadable', tone: 'todo', verb: '?', name: clause, warn: 'not a step the runner can read — saving this case will be refused' };
  }

  const step = { kind: KIND[s.op] ?? 'act', tone: TONE[s.op] ?? 'click', verb: s.op, ...splitTarget(s.target) };
  const key = (ref) => ref.replace(/^secrets\./, '');
  if (s.op === 'fill') {
    if (s.valueRef) step.vault = key(s.valueRef);
    else step.value = s.value;
  } else if (s.op === 'wait') {
    step.detail = `${s.ms}ms`;
  } else if (s.op === 'scroll') {
    step.detail = s.to ? `to ${s.to}` : 'to';
  } else if (s.op === 'expect') {
    step.kind = 'check';
    step.verb = s.assert === 'textVisible' ? 'see' : 'check';
    step.tone = step.verb;
    if (s.assert === 'valueEquals') step.after = s.valueRef ? `is $${key(s.valueRef)}` : `is ${String(s.value ?? '').length} chars`;
    else if (s.assert === 'atTop') step.detail = 'at top';
    else if (s.assert === 'status') step.detail = `status ${s.value}`;
    else if (s.assert === 'redirects') step.detail = s.value === 0 ? 'no redirect' : `${s.value} redirect${s.value === 1 ? '' : 's'}`;
    else if (s.assert === 'via') { step.detail = 'redirect via'; step.name = s.value; }
    else if (s.assert === 'textVisible') step.name = s.value;
  }
  step.warn = WARNINGS.map((w) => w(step)).filter(Boolean).join(' · ') || null;
  return step;
}

const isAbsolute = (v) => /^https?:\/\//i.test(String(v ?? '').trim());

/**
 * The whole case, read.
 *
 *   base      the case's own start: the address a path in it is relative to
 *   groups    [{ place, href, steps }]    the page each run of steps happens on
 *   steps     [{ n, index, kind, tone, verb, name, href, role, scope, detail,
 *                after, value, vault, warn, at }]
 *   lines     [{ kind, tokens: [{ t, c }] }]   the source, coloured, whole
 *   evidence  { lines, entryTargets, positions, vias }
 *   counts    { steps, pages, checks, actions, warnings }
 */
export function readFlow(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  const nodes = new Map();
  const edges = [];
  const loose = [];                 // lines under no transition: a script written one step per line
  const at = new Map();
  const lines = [];
  const evidence = { lines: 0, entryTargets: 0, positions: 0, vias: 0 };
  let suite = '';
  let edge = null;

  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    let kind;
    let tokens;

    if (!trimmed) {
      kind = 'blank';
      tokens = [{ t: line, c: 'plain' }];   // its spaces too: nothing of the source is dropped
    } else if (trimmed.startsWith('%%')) {
      const body = trimmed.slice(2).trim();
      const pos = /^at\s+(\d+)\s+(-?\d+),(-?\d+)/.exec(body);
      if (pos) {
        at.set(Number(pos[1]), { x: Number(pos[2]), y: Number(pos[3]) });
        evidence.positions++;
      } else if (/^entry\b/.test(body)) {
        try { evidence.entryTargets = JSON.parse(body.slice(5)).length; } catch { /* still evidence, just not countable */ }
      } else if (/^via\b/.test(body)) {
        evidence.vias++;
      } else if (/^suite\b/.test(body)) {
        suite = body.slice(5).trim().replace(/^"(.*)"$/, '$1');
      }
      kind = pos || /^(entry|via)\b/.test(body) ? 'evidence' : 'comment';
      if (kind === 'evidence') evidence.lines++;
      tokens = [{ t: line, c: kind }];
    } else if (/^(testcase|flowchart)\b/.test(trimmed)) {
      kind = 'header';
      tokens = [{ t: line, c: 'keyword' }];
    } else if (NODE.test(line)) {
      const m = NODE.exec(line);
      nodes.set(m[2], { shape: SHAPE[m[4]], value: m[6] });
      edge = null;
      kind = 'node';
      tokens = paintNode(m);
    } else if (EDGE.test(line)) {
      const m = EDGE.exec(line);
      edge = { from: m[1], to: m[3], actions: [] };
      if (m[2] !== undefined) {
        edge.actions.push(...splitLabel(m[2]).filter((_, k) => k % 2 === 0).map((c) => c.trim()).filter(Boolean));
      }
      edges.push(edge);
      kind = 'edge';
      tokens = paintEdge(line);
    } else {
      // An action indented under the transition above it.
      if (edge) edge.actions.push(trimmed);
      else loose.push(trimmed);
      kind = 'action';
      tokens = paintClause(line);
    }
    lines.push({ kind, tokens: tokens.filter((tk) => tk.t) });
  }

  const steps = [];
  const groups = [];
  let group = null;
  const start = (place) => { group = { place, href: null, steps: [] }; groups.push(group); };
  const add = (step) => {
    const index = steps.length;
    const full = { name: '', role: null, scope: null, warn: null, href: null, ...step, index, n: index + 1, at: at.get(index) ?? null };
    steps.push(full);
    group.steps.push(full);
  };

  const graph = edges.length > 0 || nodes.size > 0;
  const entry = [...nodes.values()].find((n) => n.shape === 'entry');
  if (graph) {
    if (entry) {
      start(entry.value);
      add({ kind: 'open', tone: 'open', verb: 'open', name: entry.value });
    }
    for (const e of edges) {
      if (!group) start(nodes.get(e.from)?.value ?? e.from);
      e.actions.forEach((clause) => add(describe(clause)));
      if (e.to === e.from) continue;      // a self-loop is more steps in the same place
      const dest = nodes.get(e.to);
      start(dest?.value ?? e.to);
      if (dest?.shape === 'url') add({ kind: 'check', tone: 'check', verb: 'url', detail: 'contains', name: dest.value });
      if (dest?.shape === 'text') add({ kind: 'check', tone: 'see', verb: 'see', name: dest.value });
    }
  } else if (loose.length) {
    start('Script');
    for (const clause of loose) {
      const step = describe(clause);
      if (step.kind === 'open' && !group.steps.length) group.place = step.name;
      add(step);
    }
  }

  // Addresses, now that the start is known: the entry, or failing that the
  // first absolute goto. Only the page a step is on, the goto itself and a
  // "url contains" point anywhere — a name is not a place.
  const base = (isAbsolute(entry?.value) ? entry.value.trim() : null)
    ?? steps.find((s) => s.tone === 'open' && isAbsolute(s.name))?.name.trim() ?? null;
  for (const g of groups) g.href = linkFor(g.place, base);
  for (const s of steps) if (s.tone === 'open' || s.verb === 'url') s.href = linkFor(s.name, base);

  const count = (kind) => steps.filter((s) => s.kind === kind).length;
  return {
    suite,
    base,
    groups,
    steps,
    lines,
    evidence,
    counts: {
      steps: steps.length,
      pages: groups.length,
      checks: count('check'),
      actions: steps.length - count('check') - count('open'),
      // In a graph, a line under no transition belongs to nothing — the runner
      // will not read it either, so it is worth a look.
      warnings: steps.filter((s) => s.warn).length + (graph ? loose.length : 0),
    },
  };
}
