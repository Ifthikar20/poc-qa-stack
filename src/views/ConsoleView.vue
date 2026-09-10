<script setup>
/**
 * The live console.
 *
 * The canvas is a video of another browser. Clicking it does NOT move your
 * mouse — the coordinates go to the server, which dispatches them over CDP, and
 * the arrow you see is drawn on top by the same VirtualCursor the executor uses.
 * That shared cursor is the whole trick: a demonstration and a replay reach the
 * page through one code path, so the recorder cannot tell them apart and what
 * you taught is what runs.
 *
 * Arriving with ?suite=&url= means "record into this suite" — the recording
 * goes back as a case without anyone copying text between two windows.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { showAction, labelAction } from '@lang';
import { useSuites } from '@/stores/suites';
import { useUi } from '@/stores/ui';
import { clock, countLevels, filterLogs, foldLogs, LEVELS, mergeLogs, whereFrom } from '@/logview';
import TopBar from '@/components/TopBar.vue';
import Field from '@/components/Field.vue';
import FlowBox from '@/components/FlowBox.vue';
import Btn from '@/components/Btn.vue';
import AddressBar from '@/components/AddressBar.vue';
import UpgradePrompt from '@/components/UpgradePrompt.vue';

const VIEW = { w: 1180, h: 760 };          // must match the server's viewport

/**
 * The navigation that produced the address we are showing — or none.
 *
 * Matched on the URL rather than just taking the newest chain, because they can
 * legitimately disagree: a hash change or a pushState navigates without
 * producing a document, so no chain is recorded for it and the newest one is
 * still the load that got you to the page. Comparing without the hash keeps
 * that chain attached where it belongs, and stops a stale one being shown
 * beside an address it did not produce — which would claim a redirect that
 * never happened.
 */
const withoutHash = (u) => { try { const x = new URL(u); x.hash = ''; return x.href; } catch { return u; } };
const currentNav = computed(() => {
  if (!live.url || live.url === 'about:blank') return null;
  const here = withoutHash(live.url);
  return live.navs.find((n) => n.url && withoutHash(n.url) === here) ?? null;
});

const route = useRoute();
const live = useLive();
const suites = useSuites();
const ui = useUi();

// -------------------------------------------------------------------- dock
/**
 * The dock along the bottom: the run as it happens, and what the driven page
 * printed. Tabs, because those are the two things you read when a step fails;
 * docked, because the run used to be a card in the rail — below the fold, out
 * of sight of the canvas it was describing.
 *
 * A run starting brings its tab forward and opens the dock, even one you
 * folded: watching the steps land is why you pressed Run.
 */
const DOCK_TABS = ['run', 'console'];
const dockPanel = ref(null);
const runList = ref(null);
const logList = ref(null);

/** The Run tab's badge: still going, or how the last run ended. */
const runState = computed(() => {
  const run = live.run;
  if (!run) return null;
  if (live.running) return { tone: 'live', text: 'running' };
  if (run.steps.some((s) => s.state === 'fail')) return { tone: 'fail', text: 'failed' };
  return { tone: 'pass', text: `${run.steps.filter((s) => s.state === 'pass').length}/${run.total}` };
});

/**
 * Follow the running step down the list — a recorded flow is taller than the
 * dock — unless you have scrolled away from it to read something, when being
 * dragged back on every step is worse than scrolling down yourself.
 *
 * With nothing running, the step that failed is the one followed. Its error
 * arrives after it stopped running and makes the row taller, so following
 * only the running step left that error just under the fold — the one line
 * the run produced that you actually came to read.
 */
let following = true;
const activeRow = () => {
  const box = runList.value;
  return box?.querySelector('[data-state="run"]') ?? [...(box?.querySelectorAll('[data-state="fail"]') ?? [])].at(-1);
};
const inView = (row, box) => row.offsetTop >= box.scrollTop - 1
  && row.offsetTop + row.offsetHeight <= box.scrollTop + box.clientHeight + 1;
function onRunScroll() {
  const row = activeRow();
  if (row) following = inView(row, runList.value);
}
watch(() => live.run, (run, before) => {
  if (!run || run === before) return;
  following = true;
  if (runList.value) runList.value.scrollTop = 0;
  ui.reveal('run');
});
watch(() => live.run?.steps.map((s) => s.state).join(), () => {
  const box = runList.value;
  const row = activeRow();
  if (!box || !row || !following || inView(row, box)) return;
  // Bottom of the row into view — but never its top out of it, for an error
  // longer than the dock is tall.
  box.scrollTop = Math.min(row.offsetTop, row.offsetTop + row.offsetHeight - box.clientHeight);
}, { flush: 'post' });

/**
 * The Browser console tab: everything the driven page printed and everything
 * the runner said while driving it, as one live stream — filtered the way
 * DevTools filters, by level, by where a line came from, and by its text.
 *
 * Live means pinned to the newest line while you are at the bottom, and left
 * where you put it once you scroll up to read, with a count of what arrived
 * meanwhile — not a list moving under the line you were reading.
 */
const LEVEL_NAMES = { error: 'Errors', warn: 'Warnings', info: 'Info', debug: 'Debug' };
const LEVEL_ON = {
  error: 'bg-critical/10 font-medium text-critical', warn: 'bg-warn/10 font-medium text-warn',
  info: 'bg-ink/[0.07] font-medium text-ink', debug: 'bg-ink/[0.07] font-medium text-ink-2',
};
const LEVEL_TEXT = { error: 'text-critical', warn: 'text-warn', info: 'text-ink-3', debug: 'text-ink-3' };
const ROW_TINT = { error: 'bg-critical/[0.04]', warn: 'bg-warn/[0.06]' };
const ROW_TEXT = { error: 'text-critical', warn: 'text-warn', info: 'text-ink', debug: 'text-ink-3' };
const SOURCES = [['all', 'All'], ['page', 'Page'], ['runner', 'Runner']];
const SHOWN = 500;                  // rows drawn at once; anything older is a filter away

const logLevels = ref([]);          // none picked: every level
const logSource = ref('all');
const logQuery = ref('');

const logRows = computed(() => filterLogs(mergeLogs(live.console, live.log), { since: live.consoleSince }));
const levelCounts = computed(() => countLevels(filterLogs(logRows.value, { source: logSource.value, query: logQuery.value })));
const logMatches = computed(() => foldLogs(filterLogs(logRows.value, {
  levels: logLevels.value, source: logSource.value, query: logQuery.value,
})));
const logShown = computed(() => logMatches.value.slice(-SHOWN));
/** Errors are the reason to look, so their count rides on the tab — open or folded. */
const logErrors = computed(() => logRows.value.filter((r) => r.level === 'error').length);

function toggleLevel(level) {
  logLevels.value = logLevels.value.includes(level)
    ? logLevels.value.filter((l) => l !== level)
    : [...logLevels.value, level];
}

let pinned = true;
const unseen = ref(0);
function onLogScroll() {
  const box = logList.value;
  if (!box) return;
  pinned = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
  if (pinned) unseen.value = 0;
}
function toLatest() {
  if (logList.value) logList.value.scrollTop = logList.value.scrollHeight;
  pinned = true;
  unseen.value = 0;
}
/** Hides what is there now, here only: the rail's log and the store keep every line. */
function clearLogs() {
  live.consoleSince = Date.now();
  toLatest();
}
/** A new last line, or one more of it: followed if you were following, counted if you were not. */
const tail = computed(() => {
  const last = logMatches.value.at(-1);
  return { key: last ? `${last.id}:${last.n}` : '', total: logMatches.value.reduce((n, r) => n + r.n, 0) };
});
watch(tail, (now, before) => {
  if (!now.key || now.key === before?.key) return;
  if (pinned) toLatest();
  else unseen.value += Math.max(1, now.total - (before?.total ?? 0));
}, { flush: 'post' });
// A different filter, or the tab coming into view, starts at the newest line.
watch([logLevels, logSource, logQuery, () => ui.dockOpen && ui.dockTab === 'console'], toLatest, { flush: 'post' });

/**
 * Drag the dock's top edge to size it, or focus it and use the arrow keys. The
 * height is kept when the drag ends rather than on every move: one gesture is
 * one write, not sixty a second.
 */
function resizeDock(e) {
  const handle = e.currentTarget;
  const from = { y: e.clientY, h: dockPanel.value?.offsetHeight ?? ui.dockHeight };
  handle.setPointerCapture(e.pointerId);
  const move = (m) => ui.sizeDock(from.h + from.y - m.clientY);
  const done = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('lostpointercapture', done);
    ui.keepDock();
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('lostpointercapture', done);
}
function nudgeDock(by) {
  ui.sizeDock((dockPanel.value?.offsetHeight ?? ui.dockHeight) + by);
  ui.keepDock();
}

/** Arrow keys move between the tabs, as they do in any tablist. */
function dockKey(by) {
  const next = DOCK_TABS[(DOCK_TABS.indexOf(ui.dockTab) + by + DOCK_TABS.length) % DOCK_TABS.length];
  ui.reveal(next);
  document.getElementById(`dock-tab-${next}`)?.focus();
}

const canvas = ref(null);
const wrap = ref(null);
const script = ref('');
const urlBox = ref('');
const caseName = ref('Recorded flow');
const saved = ref(null);
const error = ref(null);
const saveError = ref(null);   // shown in the Recording card, beside the button
const opening = ref(null);
const saving = ref(false);
const allowing = ref(false);
const cases = ref([]);
const picked = ref('');
const loaded = ref(null);      // which saved case is in the box, if any

const suiteId = computed(() => route.query.suite ?? null);

/** Same page, ignoring a trailing slash — which is not a different page. */
const sameUrl = (a, b) => {
  if (!a || !b) return false;
  const norm = (u) => { try { return new URL(u).href.replace(/\/$/, ''); } catch { return String(u).replace(/\/$/, ''); } };
  return norm(a) === norm(b);
};
const suite = computed(() => suites.list.find((s) => s.id === suiteId.value) ?? null);

// ------------------------------------------------------------------ frames
let ctx;
function paint(blob) {
  if (!ctx) return;
  // One object URL at a time. Creating one per frame without revoking it leaks
  // a few hundred megabytes over a long session.
  const next = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, VIEW.w, VIEW.h);
    URL.revokeObjectURL(next);
    live.painted = true;          // the black rectangle is gone
  };
  img.onerror = () => URL.revokeObjectURL(next);
  img.src = next;
}

onMounted(async () => {
  ctx = canvas.value.getContext('2d', { alpha: false });
  live.connect();
  live.attachCanvas(paint);       // replays the frame the store already holds
  if (!suites.list.length) await suites.loadList();
  await loadCases();
  // Arriving with a URL means "show me this". Reloading a page the runner is
  // already on would throw away whatever is on it — a recording in progress,
  // a form half filled — for no gain, so only navigate when it is somewhere
  // else. The box still shows where you are either way.
  if (route.query.url) {
    urlBox.value = route.query.url;
    if (!sameUrl(live.url, route.query.url)) open();
  } else if (live.url && live.url !== 'about:blank') {
    // Not `about:blank`: it is truthy, so the box used to pre-fill with it and
    // pressing Open answered "Only http and https can be driven, not about:".
    urlBox.value = live.url;
  }
});
onBeforeUnmount(() => live.detachCanvas());

/**
 * What the canvas is waiting for, in the user's terms.
 *
 * A black rectangle is indistinguishable from a crash. These are the three
 * real states, and each one tells you whether to wait, reload, or check the
 * server.
 */
const waiting = computed(() => {
  if (!live.connected) return { title: 'Connecting to the runner', body: 'The server drives the browser you are about to see. Reconnecting…' };
  // Another organisation has the browser (docs/AUTH.md §10): the runner
  // sends this socket no frames of their page, so the honest picture is
  // none — and a sentence saying whose it is and when it will be free.
  if (live.busy) return { title: `${live.driving.org} is driving the runner`, body: 'One browser, one organisation at a time. Nothing of theirs reaches this screen. You can open a page once their run has finished and they have been quiet for a minute.' };
  if (opening.value) return { title: `Opening ${opening.value}`, body: 'Loading the page in the runner\u2019s browser.' };
  /**
   * Nothing open is checked BEFORE `painted`, because `about:blank` paints — a
   * blank white frame is still a frame, so the runner reports itself painted
   * and this state would never be reached. A white rectangle with no
   * explanation is only marginally better than the black one it replaced.
   */
  if (!live.url || live.url === 'about:blank') {
    return { title: 'Nothing open yet', body: 'Paste a URL above and press Open, or run a suite — the runner shows whatever it is driving.' };
  }
  if (live.painted) return null;
  return { title: 'Loading the page', body: 'The runner’s browser is drawing it — the picture appears here the moment there is one.' };
});

/**
 * Whether the canvas is waiting on something that is actually happening — the
 * socket, a page opening, a first picture — which is when a loading bar
 * belongs. "Nothing open" and "someone else is driving" are states, not loads,
 * and a spinner over them promised a wait with no end.
 */
const loading = computed(() => !!waiting.value && !live.busy
  && (!live.connected || !!opening.value || (!!live.url && live.url !== 'about:blank')));

/**
 * Keep asking for a picture until one arrives. Frames are damage-driven, so a
 * page that finished loading before anyone watched, and then sits still, sends
 * nothing on its own; the runner answers each request with the frame it holds,
 * or takes one. This replaced a button that made the person do the asking.
 *
 * Not while a page is opening: the frame held then is the PREVIOUS page, and
 * painting it would end the loading state on the wrong picture. An open that
 * has drawn nothing in five seconds stops counting as opening, and the asking
 * starts.
 */
let asking = null;
let openTimer = null;
watch(() => live.connected && !live.busy && !opening.value && !!live.url && live.url !== 'about:blank' && !live.painted, (want) => {
  clearInterval(asking);
  asking = null;
  if (!want) return;
  live.send({ t: 'frame.request' });
  asking = setInterval(() => live.send({ t: 'frame.request' }), 1000);
}, { immediate: true });
watch(opening, (now) => {
  clearTimeout(openTimer);
  if (now) openTimer = setTimeout(() => { if (opening.value === now) opening.value = null; }, 5000);
});
onBeforeUnmount(() => { clearInterval(asking); clearTimeout(openTimer); });

// ------------------------------------------------------------- interaction
/** Canvas pixels, not CSS pixels — the element is scaled to fit. */
function at(e) {
  const r = canvas.value.getBoundingClientRect();
  return {
    x: Math.round((e.clientX - r.left) * (VIEW.w / r.width)),
    y: Math.round((e.clientY - r.top) * (VIEW.h / r.height)),
  };
}
const move = (e) => { const p = at(e); live.send({ t: 'human.move', ...p }); };

/**
 * The wheel, forwarded — one message per frame, not one per tick.
 *
 * preventDefault first, or the console page scrolls instead of the page you are
 * driving, which looks exactly like the feed being frozen.
 *
 * Then coalesce. A trackpad emits wheel events at well over 100/s, and the
 * first version sent two socket messages for each one — so a single flick put
 * several hundred messages on the wire, every one of them a separate CDP
 * dispatch and a separate repaint. It scrolled, but in lurches. Accumulating
 * into one message per animation frame is both smoother to watch and roughly
 * an order of magnitude less traffic, and it matches how the browser itself
 * batches scrolling.
 */
let pending = { x: 0, y: 0 };
let frame = null;

function flush() {
  frame = null;
  const { x, y } = pending;
  pending = { x: 0, y: 0 };
  if (!x && !y) return;
  live.send({ t: 'human.wheel', deltaY: y, deltaX: x });
}

function wheel(e) {
  e.preventDefault();
  // The pointer position matters — a wheel scrolls whatever is under it, which
  // is how an inner pane scrolls instead of the page.
  const p = at(e);
  if (p.x !== live.cursor.x || p.y !== live.cursor.y) live.send({ t: 'human.move', ...p });
  pending.y += e.deltaY;
  pending.x += e.deltaX;
  frame ??= requestAnimationFrame(flush);
}
onBeforeUnmount(() => { if (frame) cancelAnimationFrame(frame); });

const click = (e) => { const p = at(e); live.send({ t: 'human.move', ...p }); live.send({ t: 'human.click' }); };
function key(e) {
  if (e.key.length === 1) { e.preventDefault(); live.send({ t: 'human.key', text: e.key }); }
  else if (['Enter', 'Tab', 'Backspace', 'Escape'].includes(e.key)) {
    e.preventDefault(); live.send({ t: 'human.key', key: e.key });
  }
}

const cursorStyle = computed(() => ({
  transform: `translate(${live.cursor.x / VIEW.w * 100}cqw, ${live.cursor.y / VIEW.h * 100}cqh)`,
}));

// -------------------------------------------------------------- operations
async function open() {
  error.value = null;
  if (!urlBox.value.trim()) return;
  live.needsOrigin = null;
  opening.value = urlBox.value.trim();
  live.painted = false;                 // show the loading state for the new page
  live.send({ t: 'open', url: opening.value });
}
watch(() => live.painted, (p) => { if (p) opening.value = null; });

// The console stays mounted when you move between suites, so a new ?url= has
// to be acted on — otherwise the second suite's Console button appears to do
// nothing at all.
watch(() => route.query.url, (u) => {
  if (!u || sameUrl(live.url, u)) return;
  urlBox.value = u;
  open();
});
async function allow() {
  allowing.value = true;
  try {
    const { origin, url, redirected } = live.needsOrigin;
    await api.allowOrigin(origin);
    live.needsOrigin = null;
    // A redirect prompt is about a page we are ALREADY on — reopening it would
    // throw away whatever you were doing there, recording included.
    if (url && !redirected) { urlBox.value = url; open(); }
  } catch (e) {
    // The plan's refusal is a prompt, not a red box.
    if (e.entitlement) live.upgrade = { ...e.entitlement, of: 'origin.add' };
    else error.value = e.message;
  } finally { allowing.value = false; }
}
const run = () => live.send({ t: 'command', text: script.value, pace: live.paceMs });
const record = () => live.send({ t: 'record.start' });
const stop = () => live.send({ t: 'record.stop' });
const useRecording = () => { script.value = live.recordedFlow; autofilled = live.recordedFlow; loaded.value = null; };

/**
 * What is on the page, summarised rather than tipped out.
 *
 * A marketing page has thirty-odd links and three things you would actually
 * drive, and listing all of them flat buries the three. So: grouped by role,
 * the things you type into and press first, links last — and any group past a
 * handful keeps a handful and offers the rest.
 */
const ROLE_ORDER = ['textbox', 'searchbox', 'combobox', 'checkbox', 'radio',
                    'button', 'tab', 'menuitem', 'link'];
const PER_GROUP = 6;
const openRoles = ref(new Set());
const toggleRole = (r) => { openRoles.value.has(r) ? openRoles.value.delete(r) : openRoles.value.add(r); };
const shown = (g) => (openRoles.value.has(g.role) ? g.items : g.items.slice(0, PER_GROUP));

const groups = computed(() => {
  const by = new Map();
  for (const t of live.targets) {
    if (!by.has(t.role)) by.set(t.role, []);
    by.get(t.role).push(t);
  }
  const rank = (r) => (ROLE_ORDER.indexOf(r) < 0 ? ROLE_ORDER.length : ROLE_ORDER.indexOf(r));
  return [...by.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([role, items]) => ({ role, items }));
});

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : /(?:[sx]|ch|sh)$/.test(w) ? 'es' : 's'}`;

/**
 * Consecutive identical lines, folded into one with a count.
 *
 * A step that retries five times said the same sentence five times, which is
 * five times harder to read than the one line it deserved — and pushed the
 * thing that actually went wrong off the top.
 */
const fold = (rows, same) => {
  const out = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && same(last, r)) { last.n += 1; continue; }
    out.push({ ...r, n: 1 });
  }
  return out;
};
const logLines = computed(() => fold(live.log, (a, b) => a.msg === b.msg && a.level === b.level));

/** Reopening the same page four times is one fact, not four. */
const navLines = computed(() => fold(live.navs, (a, b) =>
  a.url === b.url && a.status === b.status && a.redirects === b.redirects));

async function loadCases() {
  try { cases.value = (await api.cases()).cases; } catch { cases.value = []; }
}

/** Cases grouped by their suite, for the picker's optgroups. */
const grouped = computed(() => {
  const by = new Map();
  for (const c of cases.value) {
    if (!by.has(c.suite)) by.set(c.suite, []);
    by.get(c.suite).push(c);
  }
  return [...by.entries()];
});

/** Loading a case puts its flow in the box, where you can read it before running. */
function pick(id) {
  picked.value = id;
  const c = cases.value.find((x) => x.id === id);
  if (!c) { loaded.value = null; return; }
  script.value = c.flow;
  autofilled = c.flow;          // still ours until you type in it
  loaded.value = c;
}

/**
 * The hand-off that makes teach mode worth having: recording -> stored case.
 *
 * A failure here reports NEXT TO THE BUTTON. It used to set the page-level
 * error, which renders below the log at the bottom of a long scrolling page —
 * so a refused save looked exactly like a button that did nothing, and the
 * commonest refusal is a real one worth reading: the case is validated on the
 * way in with the same parser the executor uses, and a recording made on an
 * origin nobody allowed cannot be stored.
 */
async function saveAsCase() {
  saveError.value = null; saved.value = null; saving.value = true;
  try {
    const { case: c } = await api.addCase(suiteId.value, {
      name: caseName.value, flow: live.recordedFlow, source: 'recorded',
    });
    saved.value = c.name;
    await suites.loadList();
    await loadCases();          // it should be selectable straight away
    picked.value = c.id;
    loaded.value = { ...c, suite: suite.value?.name ?? suiteId.value };
  } catch (e) {
    // The gate is a decision, not a dead end: offer the one action that
    // unblocks it rather than a sentence about why you cannot save.
    if (e.needsOrigin) live.needsOrigin = { origin: e.needsOrigin, redirected: true };
    saveError.value = e.message;
  } finally { saving.value = false; }
}

/**
 * One line per step, from the vocabulary rather than from a fourth opinion
 * about how a step reads.
 *
 * An action writes itself back exactly as the script spells it. The three node
 * shapes — the entry, and the url and text assertions — have no written form,
 * so they draw themselves instead, with a wider budget than a diagram cell.
 */
const cap = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));
function describe(s) {
  try { return showAction(s) ?? labelAction(s, (t, n) => cap(t, Math.max(n, 40))); }
  catch { return `${s.op} ${s.target ?? s.value ?? s.url ?? ''}`.trim(); }
}

/**
 * Keep the script box in step with the recording — until you edit it.
 *
 * This used to fill the box only while it was empty, which sounds right and is
 * exactly wrong: pressing Record immediately produces a one-step flow (the
 * goto), the box takes that, and every step you demonstrate afterwards is
 * ignored because the box is no longer empty. You would finish a four-step
 * recording and find one line in front of you.
 */
let autofilled = '';
watch(() => live.recordedFlow, (f) => {
  if (!f) return;
  if (script.value === '' || script.value === autofilled) {
    script.value = f;
    autofilled = f;
    loaded.value = null;
  }
});
</script>

<template>
  <TopBar :crumbs="[
    ...(suite ? [{ label: 'Test suites', to: '/suites' }, { label: suite.name, to: `/suites/${suite.id}` }] : []),
    { label: 'Console' }]">
    <template #actions>
      <span class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px] text-ink-2">
        {{ live.connected ? 'Runner connected' : 'Runner offline' }}
      </span>
    </template>
  </TopBar>

  <!-- minmax(0,1fr) below xl too: a bare `grid` sizes its one column to the
       widest unbreakable thing inside it, and a URL in the log is one. -->
  <div class="grid grid-cols-[minmax(0,1fr)] gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_380px]">
    <!-- stage -------------------------------------------------------- -->
    <div>
      <!-- The chrome the canvas does not have. A video of a browser shows you
           the page and nothing about where it is; this is the address bar. -->
      <AddressBar :url="live.url" :nav="currentNav" />

      <div ref="wrap" class="stage relative rounded-t-none" style="container-type: size; aspect-ratio: 1180 / 760">
        <canvas ref="canvas" :width="VIEW.w" :height="VIEW.h" tabindex="0"
                class="block h-full w-full cursor-none"
                aria-label="The page being driven — click, type and scroll here to demonstrate"
                @mousemove="move" @click="click" @keydown="key" @wheel.prevent="wheel" />
        <!-- The arrow is drawn here, not in the page. It is the same (x,y) the
             server dispatched, so what you see is where the click landed. -->
        <svg class="pointer-events-none absolute left-0 top-0 size-6 drop-shadow" :style="cursorStyle" viewBox="0 0 24 24">
          <!-- Accent fill, white outline: the page underneath can be any colour,
               and an arrow that disappears over a dark hero is worse than none. -->
          <path d="M5 2l14 9-6 1.2L10.2 20z" fill="var(--color-brand)" stroke="#fff"
                stroke-width="1.6" stroke-linejoin="round" />
        </svg>

        <!-- Never a bare black rectangle: it is indistinguishable from a crash.
             The bar and the spinner only while something is actually loading,
             and no button: the console keeps asking for the picture itself. -->
        <div v-if="waiting"
             class="absolute inset-0 grid place-content-center gap-3 justify-items-center bg-night px-8 text-center">
          <div v-if="loading" class="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-white/10"
               role="progressbar" aria-label="Loading the page">
            <div class="h-full w-1/3 animate-[stage-load_1.2s_ease-in-out_infinite] bg-brand motion-reduce:w-full motion-reduce:animate-none" />
          </div>
          <svg v-if="loading" class="size-7 animate-spin text-white/70 motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity=".22" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
          </svg>
          <p class="text-[14px] font-medium text-white" aria-live="polite">{{ waiting.title }}</p>
          <p class="max-w-sm text-[12.5px] leading-relaxed text-white/55">{{ waiting.body }}</p>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input v-model="urlBox" spellcheck="false" aria-label="URL to open"
               placeholder="staging.acme.com/dashboard"
               class="min-w-0 flex-1 rounded-full border border-hairline bg-panel px-4 py-2 text-[13.5px] outline-none focus:border-ink/25"
               @keyup.enter="open">
        <Btn :busy="!!opening" busy-label="Opening…" @click="open">Open</Btn>
        <Btn variant="ghost" @click="live.send({ t: 'inspect' })">Re-scan</Btn>
        <!-- An operator's switch (docs/HARDENING.md) disables it here as well as
             refusing it on the runner, and says why on hover. -->
        <button v-if="!live.recording" class="rounded-full border border-critical/40 px-4 py-2 text-[13px] text-critical disabled:border-hairline disabled:text-ink-3"
                :disabled="live.running || live.switches['runner.recording'] === false"
                :title="live.switches['runner.recording'] === false ? 'Recording is turned off on this deployment' : undefined"
                @click="record">● Record</button>
        <button v-else class="rounded-full bg-critical px-4 py-2 text-[13px] font-medium text-white" @click="stop">■ Stop</button>
      </div>

      <p class="mt-2 text-[12.5px] text-ink-3">
        Point at the page above and use your wheel or trackpad to scroll it — or the buttons.
        Clicking and typing there go to the page you are driving, never to this one.
      </p>

      <UpgradePrompt v-if="live.upgrade" class="mt-3" :limit="live.upgrade.limit" :plan="live.upgrade.plan" @dismiss="live.upgrade = null" />

      <div v-if="live.needsOrigin" class="mt-3 card wash-warm p-4">
        <p class="text-[13.5px] font-medium">{{ live.needsOrigin.origin }} is not allowed yet.</p>
        <p v-if="live.needsOrigin.redirected" class="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
          The page you opened redirected here. A different host or scheme is a different
          origin — allowing <code>example.com</code> does not allow <code>www.example.com</code> —
          so anything you record on this page will refuse to replay until you allow it too.
        </p>
        <p v-else class="mt-1 text-[13px] text-ink-2">The gate only opens for a person. Nothing generated can reach this button.</p>
        <div class="mt-3 flex gap-2">
          <Btn :busy="allowing" busy-label="Allowing…" @click="allow">
            {{ live.needsOrigin.url && !live.needsOrigin.redirected ? 'Allow it and open' : 'Allow it' }}
          </Btn>
          <button class="rounded-full border border-hairline px-4 py-2 text-[13px]" @click="live.needsOrigin = null">Cancel</button>
        </div>
      </div>

      <!-- script ---------------------------------------------------- -->
      <section class="card mt-4 p-5">
        <div class="flex flex-wrap items-baseline gap-3">
          <h2 class="text-[15px] font-medium">Script</h2>
          <span class="text-[13px] text-ink-3">Flow language, or one instruction per line.</span>

          <!-- A saved case is the usual thing you want to run here, so it is one
               control away rather than a trip through the sidebar. -->
          <!-- Read the value off the event, not off v-model: both handlers fire on
               the same change and v-model does not reliably win the race, so
               `picked` can still hold the previous selection when this runs. -->
          <select v-if="cases.length" :value="picked" @change="pick($event.target.value)"
                  class="ml-auto max-w-64 rounded-full border border-hairline bg-panel px-3.5 py-1.5 text-[13px] outline-none focus:border-ink/25">
            <option value="">Load a saved case…</option>
            <optgroup v-for="[suiteName, rows] in grouped" :key="suiteName" :label="suiteName">
              <option v-for="c in rows" :key="c.id" :value="c.id">
                {{ c.name }} · {{ c.steps }} step{{ c.steps === 1 ? '' : 's' }}
              </option>
            </optgroup>
          </select>

          <!-- How much of the run is performed for you.
               A replay glides the pointer, pauses before each click and types a
               character at a time, so that a feed running at roughly ten frames
               a second shows something a person can follow. That is about two
               thirds of a second per click step, and it is worth nothing at all
               when you are not watching. -->
          <div :class="['flex overflow-hidden rounded-full border border-hairline', !cases.length && 'ml-auto']"
               role="group" aria-label="Run speed">
            <button v-for="p in [['watch', 'Watch'], ['fast', 'Fast']]" :key="p[0]"
                    class="px-3 py-1.5 text-[12.5px]"
                    :class="live.pace === p[0] ? 'bg-brand-50 font-medium text-brand-2' : 'text-ink-3 hover:bg-ink/[0.04]'"
                    :aria-pressed="live.pace === p[0]"
                    :title="p[0] === 'watch'
                      ? 'Glide the pointer and pause, so a run can be followed'
                      : 'No performance — as fast as the page allows'"
                    @click="live.setPace(p[0])">{{ p[1] }}</button>
          </div>

          <Btn :busy="live.running" busy-label="Running…"
               :disabled="!script.trim() || live.switches['runner.runs'] === false"
               :title="live.switches['runner.runs'] === false ? 'Running is turned off on this deployment' : undefined"
               @click="run">Run script</Btn>
        </div>
        <p v-if="loaded" class="mt-2 flex items-center gap-2 text-[12.5px] text-ink-3">
          Loaded <b class="font-medium text-ink">{{ loaded.name }}</b>
          <template v-if="loaded.suite">from {{ loaded.suite }}</template>
          <button class="underline hover:text-ink" @click="script = ''; loaded = null; picked = ''">clear</button>
        </p>
        <FlowBox v-model="script" :rows="10" class="mt-3" />
      </section>
    </div>

    <!-- rail --------------------------------------------------------- -->
    <div class="grid content-start grid-cols-[minmax(0,1fr)] gap-4">
      <!-- First in the rail. It is where anything that went wrong says so, and
           it should not be below a list of everything that did not. -->
      <section class="card p-5">
        <h2 class="text-[15px] font-medium">Log</h2>
        <ul class="mt-3 max-h-64 space-y-1 overflow-y-auto font-mono text-[11.5px]">
          <li v-for="l in logLines" :key="l.id" class="flex gap-2"
              :class="{ error: 'text-critical', warn: 'text-warn' }[l.level] ?? 'text-ink-2'">
            <span class="min-w-0 grow">{{ l.msg }}</span>
            <span v-if="l.n > 1" class="shrink-0 rounded bg-ink/[0.07] px-1.5 text-[10.5px] text-ink-2"
                  :title="`said ${l.n} times in a row`">×{{ l.n }}</span>
          </li>
          <li v-if="!logLines.length" class="text-ink-3">Nothing yet.</li>
        </ul>
      </section>

      <section v-if="live.recording || live.recordedCount" class="card p-5">
        <div class="flex items-center gap-2">
          <h2 class="text-[15px] font-medium">Recording</h2>
          <span v-if="live.recording" class="size-1.5 animate-pulse rounded-full bg-critical" />
          <span class="ml-auto text-[12.5px] text-ink-3">{{ live.recordedCount }} steps</span>
        </div>
        <p class="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
          Drive the page on the canvas. A typed password is dropped here and written as a vault
          reference — it never reaches this script, the log, or the diagram.
        </p>
        <FlowBox :model-value="live.recordedFlow" :rows="8" readonly class="mt-3" />
        <div class="mt-3 flex gap-2">
          <button class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px]" @click="useRecording">
            Use as script
          </button>
        </div>

        <div v-if="suiteId && live.recordedFlow" class="mt-4 border-t border-hairline pt-4">
          <Field label="Save into this suite" :hint="`Goes to ${suite?.name ?? suiteId} as a case.`">
            <input v-model="caseName" placeholder="Sign in works" @keyup.enter="saveAsCase">
          </Field>
          <Btn class="mt-3" :busy="saving" busy-label="Saving…" @click="saveAsCase">Save as a case</Btn>
          <p v-if="saved" class="mt-2 text-[12.5px] text-good">Saved “{{ saved }}”.</p>
          <p v-if="saveError"
             class="mt-2 rounded-lg border border-critical/25 bg-critical/5 px-3 py-2 text-[12.5px] text-critical">
            {{ saveError }}
          </p>
        </div>
        <p v-else-if="!suiteId && live.recordedFlow" class="mt-3 text-[12.5px] text-ink-3">
          Open the console from a suite to save this straight into it.
        </p>
      </section>

      <section class="card p-5">
        <div class="flex items-baseline gap-2">
          <h2 class="text-[15px] font-medium">On this page</h2>
          <span class="ml-auto text-[12.5px] text-ink-3">{{ live.targets.length }}</span>
        </div>
        <p class="mt-1 truncate font-mono text-[11.5px] text-ink-3">
          {{ live.url && live.url !== 'about:blank' ? live.url : 'nothing open' }}
        </p>

        <div v-for="g in groups" :key="g.role" class="mt-3">
          <p class="eyebrow mb-1.5">{{ plural(g.items.length, g.role) }}</p>
          <div class="flex flex-wrap gap-1.5">
            <!-- The role is the group's heading, so the chip is just the name —
                 which is what you are scanning for. -->
            <button v-for="t in shown(g)" :key="t.target"
                    class="max-w-[13rem] truncate rounded-full border border-hairline px-2.5 py-1 text-[12px]
                           hover:border-ink/30"
                    :title="`Insert ${t.target}`"
                    @click="script += `${script && !script.endsWith('\n') ? '\n' : ''}click ${t.target}\n`">
              {{ t.name }}
            </button>
            <button v-if="g.items.length > PER_GROUP" @click="toggleRole(g.role)"
                    class="rounded-full px-2.5 py-1 text-[12px] text-brand-2 hover:bg-brand-50">
              {{ openRoles.has(g.role) ? 'Show fewer' : `+${g.items.length - PER_GROUP} more` }}
            </button>
          </div>
        </div>
        <p v-if="!live.targets.length" class="mt-3 text-[12.5px] text-ink-3">
          Nothing interactive found here yet.
        </p>
      </section>

      <!-- Where each navigation actually went. The final URL says nothing about
           a 301 through a dead path, a detour via a tracker, or a friendly 404
           — and none of those is visible anywhere else. -->
      <section v-if="navLines.length" class="card p-5">
        <div class="flex items-baseline gap-2">
          <h2 class="text-[15px] font-medium">Where it went</h2>
          <span class="ml-auto text-[12.5px] text-ink-3">{{ live.navs.length }}</span>
        </div>
        <ul class="mt-3 max-h-72 space-y-2.5 overflow-y-auto">
          <li v-for="n in navLines" :key="n.id" class="border-b border-hairline pb-2.5 last:border-0 last:pb-0">
            <p class="flex items-center gap-2 text-[12.5px]">
              <span class="rounded px-1.5 py-0.5 font-mono text-[11px] font-medium"
                    :class="n.status >= 400 ? 'bg-critical/10 text-critical'
                          : n.redirects ? 'bg-warn/10 text-warn' : 'bg-ink/5 text-ink-2'">{{ n.status }}</span>
              <span v-if="n.redirects" class="text-ink-2">
                {{ n.redirects }} redirect{{ n.redirects === 1 ? '' : 's' }}
              </span>
              <span v-if="n.leftOrigin" class="text-critical">left the origin</span>
              <span v-if="n.n > 1" class="ml-auto shrink-0 rounded bg-ink/[0.07] px-1.5 text-[11px] text-ink-2"
                    :title="`opened ${n.n} times in a row`">×{{ n.n }}</span>
            </p>
            <p class="mt-1 truncate font-mono text-[11px] text-ink-3" :title="n.url">{{ n.url }}</p>
            <ol v-if="n.redirects" class="mt-1.5 space-y-0.5">
              <li v-for="(h, i) in n.hops" :key="i" class="flex gap-2 font-mono text-[10.5px] text-ink-3">
                <span class="w-7 shrink-0 text-right">{{ h.status }}</span>
                <span class="truncate" :title="h.url">{{ h.url }}</span>
              </li>
            </ol>
          </li>
        </ul>
      </section>

    </div>
  </div>

  <p v-if="error" class="mx-6 mb-6 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">
    {{ error }}
  </p>

  <!-- dock ---------------------------------------------------------- -->
  <!-- Last in the page and sticky to the bottom of <main> rather than fixed:
       always in reach while you scroll, but scrolled to the end it sets down
       under the last card instead of covering it. -->
  <section class="sticky bottom-0 z-10 border-t border-hairline bg-panel shadow-[0_-8px_24px_-16px_rgb(16_16_20/0.25)]"
           aria-label="Run and browser console">
    <div v-if="ui.dockOpen" role="separator" aria-orientation="horizontal" tabindex="0"
         aria-label="Resize the panel" :aria-valuenow="ui.dockHeight" aria-valuemin="96" title="Drag to resize"
         class="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize touch-none hover:bg-brand/25 focus-visible:bg-brand/35 focus-visible:outline-none"
         @pointerdown.prevent="resizeDock" @keydown.up.prevent="nudgeDock(24)" @keydown.down.prevent="nudgeDock(-24)" />

    <div class="flex items-center gap-2 px-6">
      <div role="tablist" aria-label="Panel" class="flex shrink-0 items-center gap-1"
           @keydown.left.prevent="dockKey(-1)" @keydown.right.prevent="dockKey(1)">
        <button id="dock-tab-run" type="button" role="tab" aria-controls="dock-panel"
                :aria-selected="ui.dockTab === 'run'" :tabindex="ui.dockTab === 'run' ? 0 : -1"
                class="flex items-center gap-2 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[13px]"
                :class="ui.dockOpen && ui.dockTab === 'run' ? 'border-brand font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'"
                @click="ui.showDock('run')">
          Run
          <span v-if="runState" class="flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums"
                :class="{ live: 'bg-brand-50 text-brand-2', pass: 'bg-good/10 text-good', fail: 'bg-critical/10 text-critical' }[runState.tone]">
            <span v-if="runState.tone === 'live'" class="size-1.5 animate-pulse rounded-full bg-brand" />
            {{ runState.text }}
          </span>
        </button>
        <button id="dock-tab-console" type="button" role="tab" aria-controls="dock-panel"
                :aria-selected="ui.dockTab === 'console'" :tabindex="ui.dockTab === 'console' ? 0 : -1"
                class="flex items-center gap-2 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[13px]"
                :class="ui.dockOpen && ui.dockTab === 'console' ? 'border-brand font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink'"
                @click="ui.showDock('console')">
          Browser console
          <span v-if="logErrors" class="rounded-full bg-critical/10 px-1.5 py-px text-[11px] font-medium tabular-nums text-critical"
                :title="`${logErrors} error${logErrors === 1 ? '' : 's'}`">{{ logErrors }}</span>
          <span v-else-if="logRows.length" class="text-[11.5px] tabular-nums text-ink-3">{{ logRows.length }}</span>
        </button>
      </div>

      <p v-if="ui.dockOpen && ui.dockTab === 'run' && live.run" class="ml-2 min-w-0 truncate text-[12.5px] text-ink-3"
         :title="live.run.caseName ? `${live.run.suite} — ${live.run.caseName}` : live.run.suite">
        {{ live.run.caseName ?? live.run.suite }}
      </p>
      <p v-else-if="ui.dockOpen && ui.dockTab === 'console'" class="ml-2 hidden min-w-0 truncate text-[12.5px] text-ink-3 md:block">
        Everything the page printed and the runner said, as it happens.
      </p>

      <div class="ml-auto flex shrink-0 items-center gap-1">
        <button v-if="ui.dockOpen && ui.dockTab === 'console' && logRows.length" type="button"
                class="rounded-md px-2 py-1 text-[12.5px] text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
                @click="clearLogs">Clear</button>
        <button type="button" :aria-expanded="ui.dockOpen" aria-controls="dock-panel"
                :aria-label="ui.dockOpen ? 'Hide the panel' : 'Show the panel'"
                :title="ui.dockOpen ? 'Hide the panel' : 'Show the panel'"
                class="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
                @click="ui.toggleDock()">
          <svg viewBox="0 0 16 16" class="size-4 transition-transform" :class="!ui.dockOpen && 'rotate-180'"
               fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4.5 6.5 8 10l3.5-3.5" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="ui.dockOpen" id="dock-panel" ref="dockPanel" role="tabpanel"
         :aria-labelledby="`dock-tab-${ui.dockTab}`"
         class="relative flex max-h-[60vh] flex-col border-t border-hairline"
         :style="{ height: `${ui.dockHeight}px` }">
      <div v-if="ui.dockTab === 'run'" ref="runList"
           class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-3" @scroll.passive="onRunScroll">
        <ol v-if="live.run" class="space-y-1 font-mono text-[12px]">
          <li v-for="s in live.run.steps" :key="s.i" :data-state="s.state" class="flex gap-2 rounded px-1"
              :class="s.state === 'run' && 'bg-brand-50'">
            <span class="w-5 shrink-0 text-right text-ink-3">{{ s.i }}</span>
            <span class="w-4 shrink-0" :class="{ 'text-good': s.state === 'pass', 'text-critical': s.state === 'fail' }">
              {{ { pass: '✓', fail: '✕', run: '·', idle: ' ' }[s.state] }}
            </span>
            <span class="min-w-0 flex-1" :class="s.state === 'fail' ? 'text-critical' : 'text-ink-2'">
              {{ s.step ? describe(s.step) : '' }}
              <span v-if="s.error" class="block whitespace-pre-wrap text-ink-2">{{ s.error }}</span>
            </span>
            <span v-if="s.ms !== null" class="shrink-0 tabular-nums text-ink-3">{{ s.ms }}ms</span>
          </li>
        </ol>
        <p v-else class="text-[12.5px] text-ink-3">
          No run yet. Press <b class="font-medium text-ink-2">Run script</b> and each step lands here as it happens.
        </p>
      </div>

      <template v-else>
        <!-- DevTools' filter bar, cut down to what a failing step needs: which
             levels, whose lines, and a word to find. -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-6 py-1.5">
          <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Levels">
            <button type="button" class="rounded-md px-2 py-0.5 text-[12px]" :aria-pressed="!logLevels.length"
                    :class="!logLevels.length ? 'bg-ink/[0.07] font-medium text-ink' : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink'"
                    @click="logLevels = []">All levels</button>
            <button v-for="level in LEVELS" :key="level" type="button" :aria-pressed="logLevels.includes(level)"
                    class="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px]"
                    :class="logLevels.includes(level) ? LEVEL_ON[level] : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink'"
                    @click="toggleLevel(level)">
              {{ LEVEL_NAMES[level] }}
              <span class="tabular-nums" :class="levelCounts[level] ? LEVEL_TEXT[level] : 'text-ink-3/60'">{{ levelCounts[level] }}</span>
            </button>
          </div>
          <div class="flex overflow-hidden rounded-md border border-hairline text-[12px]" role="group" aria-label="From">
            <button v-for="[id, label] in SOURCES" :key="id" type="button" class="px-2 py-0.5" :aria-pressed="logSource === id"
                    :class="logSource === id ? 'bg-brand-50 font-medium text-brand-2' : 'text-ink-3 hover:bg-ink/[0.04]'"
                    @click="logSource = id">{{ label }}</button>
          </div>
          <input v-model="logQuery" type="search" placeholder="Filter text" aria-label="Filter the log by text" spellcheck="false"
                 class="ml-auto w-48 min-w-0 rounded-md border border-hairline bg-ground px-2 py-0.5 text-[12px] outline-none focus:border-ink/25">
        </div>

        <div ref="logList" class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" @scroll.passive="onLogScroll">
          <p v-if="logMatches.length > SHOWN" class="px-6 py-1.5 text-[11.5px] text-ink-3">
            The latest {{ SHOWN }} of {{ logMatches.length }} lines — a filter reaches further back.
          </p>
          <ol class="font-mono text-[11.5px]">
            <li v-for="l in logShown" :key="l.id" :data-level="l.level"
                class="flex items-baseline gap-2.5 border-b border-hairline/70 px-6 py-[3px]" :class="ROW_TINT[l.level]">
              <span class="shrink-0 tabular-nums text-ink-3">{{ clock(l.at) }}</span>
              <span class="w-10 shrink-0 text-[10.5px] font-semibold uppercase" :class="LEVEL_TEXT[l.level]">{{ l.said === 'log' ? 'log' : l.level }}</span>
              <span v-if="l.source !== 'page'" class="shrink-0 rounded px-1 text-[10.5px]"
                    :class="l.source === 'runner' ? 'bg-ink/[0.06] text-ink-2' : 'bg-critical/10 text-critical'">{{ l.source === 'runner' ? 'runner' : 'uncaught' }}</span>
              <span class="min-w-0 grow whitespace-pre-wrap break-words" :class="ROW_TEXT[l.level]">{{ l.text }}</span>
              <span v-if="l.n > 1" class="shrink-0 rounded bg-ink/[0.07] px-1.5 text-[10.5px] text-ink-2"
                    :title="`printed ${l.n} times in a row`">×{{ l.n }}</span>
              <span v-if="l.url" class="max-w-[16rem] shrink-0 truncate text-ink-3" :title="l.url">{{ whereFrom(l.url, l.line) }}</span>
            </li>
          </ol>
          <p v-if="!logShown.length" class="px-6 py-3 text-[12.5px] text-ink-3">
            {{ logRows.length ? 'Nothing matches this filter.'
              : 'Nothing yet. Every line the page prints — errors, warnings, info, debug, uncaught exceptions — and everything the runner says while driving it lands here as it happens.' }}
          </p>
        </div>

        <button v-if="unseen" type="button"
                class="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-[12px] font-medium text-white shadow-md"
                @click="toLatest">↓ {{ unseen }} new line{{ unseen === 1 ? '' : 's' }}</button>
      </template>
    </div>
  </section>
</template>
