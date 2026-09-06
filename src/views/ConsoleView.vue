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
import { useSuites } from '@/stores/suites';
import TopBar from '@/components/TopBar.vue';
import Field from '@/components/Field.vue';
import FlowBox from '@/components/FlowBox.vue';

const VIEW = { w: 1180, h: 760 };          // must match the server's viewport

const route = useRoute();
const live = useLive();
const suites = useSuites();

const canvas = ref(null);
const wrap = ref(null);
const script = ref('');
const urlBox = ref('');
const caseName = ref('Recorded flow');
const saved = ref(null);
const error = ref(null);
const opening = ref(null);

const suiteId = computed(() => route.query.suite ?? null);
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
  if (route.query.url) { urlBox.value = route.query.url; open(); }
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
  if (live.painted) return null;
  if (!live.connected) return { title: 'Connecting to the runner', body: 'The server drives the browser you are about to see. Reconnecting…' };
  if (opening.value) return { title: `Opening ${opening.value}`, body: 'Loading the page in the runner\u2019s browser.' };
  return { title: 'Waiting for the first frame', body: 'The runner streams a frame whenever the page changes. If it is sitting still this can take a moment.' };
});

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
 * The wheel, forwarded.
 *
 * preventDefault, or the console page scrolls instead of the page you are
 * driving — which looks exactly like the feed being frozen. `passive: false` on
 * the listener is what makes preventDefault legal here.
 */
function wheel(e) {
  e.preventDefault();
  const p = at(e);
  live.send({ t: 'human.move', ...p });
  live.send({ t: 'human.wheel', deltaY: e.deltaY, deltaX: e.deltaX });
}
const scrollTo = (where) => live.send({ t: 'human.wheel', deltaY: where === 'top' ? -100000 : 100000 });
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
async function allow() {
  try {
    await api.allowOrigin(live.needsOrigin.origin);
    const u = live.needsOrigin.url;
    live.needsOrigin = null;
    urlBox.value = u; open();
  } catch (e) { error.value = e.message; }
}
const run = () => live.send({ t: 'command', text: script.value });
const record = () => live.send({ t: 'record.start' });
const stop = () => live.send({ t: 'record.stop' });
const useRecording = () => { script.value = live.recordedFlow; };

/** The hand-off that makes teach mode worth having: recording -> stored case. */
async function saveAsCase() {
  error.value = null; saved.value = null;
  try {
    const { case: c } = await api.addCase(suiteId.value, {
      name: caseName.value, flow: live.recordedFlow, source: 'recorded',
    });
    saved.value = c.name;
    await suites.loadList();
  } catch (e) { error.value = e.message; }
}

/** One line per step. A scroll or a bare assertion has no target to show. */
function describe(s) {
  if (s.op === 'scroll') return `scroll to ${s.to ?? s.target}`;
  if (s.op === 'expect') return `expect ${s.assert}${s.value ? ` ${s.value}` : ''}`;
  if (s.op === 'wait') return `wait ${s.ms}ms`;
  return `${s.op} ${s.target ?? s.url ?? ''}`.trim();
}

watch(() => live.recordedFlow, (f) => { if (f && !script.value) script.value = f; });
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

  <div class="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_380px]">
    <!-- stage -------------------------------------------------------- -->
    <div>
      <div ref="wrap" class="stage relative" style="container-type: size; aspect-ratio: 1180 / 760">
        <canvas ref="canvas" :width="VIEW.w" :height="VIEW.h" tabindex="0"
                class="block h-full w-full cursor-none"
                aria-label="The page being driven — click, type and scroll here to demonstrate"
                @mousemove="move" @click="click" @keydown="key" @wheel.prevent="wheel" />
        <!-- The arrow is drawn here, not in the page. It is the same (x,y) the
             server dispatched, so what you see is where the click landed. -->
        <svg class="pointer-events-none absolute left-0 top-0 size-6 drop-shadow" :style="cursorStyle" viewBox="0 0 24 24">
          <path d="M5 2l14 9-6 1.2L10.2 20z" fill="#fff" stroke="#0f1729" stroke-width="1.4" stroke-linejoin="round" />
        </svg>

        <!-- Never a bare black rectangle: it is indistinguishable from a crash. -->
        <div v-if="waiting"
             class="absolute inset-0 grid place-content-center gap-3 justify-items-center bg-night px-8 text-center">
          <svg class="size-7 animate-spin text-white/70" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity=".22" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
          </svg>
          <p class="text-[14px] font-medium text-white">{{ waiting.title }}</p>
          <p class="max-w-sm text-[12.5px] leading-relaxed text-white/55">{{ waiting.body }}</p>
          <button v-if="live.connected" class="mt-1 rounded-full border border-white/20 px-3.5 py-1.5 text-[12.5px] text-white/80 hover:bg-white/10"
                  @click="live.send({ t: 'frame.request' })">
            Ask for a frame
          </button>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input v-model="urlBox" spellcheck="false" placeholder="localhost:3000/demo.html"
               class="min-w-0 flex-1 rounded-full border border-hairline bg-panel px-4 py-2 text-[13.5px] outline-none focus:border-ink/25"
               @keyup.enter="open">
        <button class="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white" @click="open">Open</button>
        <button class="rounded-full border border-hairline px-4 py-2 text-[13px]" @click="live.send({ t: 'inspect' })">Re-scan</button>
        <span class="flex overflow-hidden rounded-full border border-hairline">
          <button class="px-3 py-2 text-[13px] hover:bg-ink/5" title="Scroll to the top of the page"
                  @click="scrollTo('top')">↑ Top</button>
          <button class="border-l border-hairline px-3 py-2 text-[13px] hover:bg-ink/5"
                  title="Scroll to the bottom of the page" @click="scrollTo('bottom')">↓ Bottom</button>
        </span>
        <button v-if="!live.recording" class="rounded-full border border-critical/40 px-4 py-2 text-[13px] text-critical"
                :disabled="live.running" @click="record">● Record</button>
        <button v-else class="rounded-full bg-critical px-4 py-2 text-[13px] font-medium text-white" @click="stop">■ Stop</button>
      </div>

      <div v-if="live.needsOrigin" class="mt-3 card wash-warm p-4">
        <p class="text-[13.5px] font-medium">{{ live.needsOrigin.origin }} is not allowed yet.</p>
        <p class="mt-1 text-[13px] text-ink-2">The gate only opens for a person. Nothing generated can reach this button.</p>
        <div class="mt-3 flex gap-2">
          <button class="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white" @click="allow">Allow it and open</button>
          <button class="rounded-full border border-hairline px-4 py-2 text-[13px]" @click="live.needsOrigin = null">Cancel</button>
        </div>
      </div>

      <!-- script ---------------------------------------------------- -->
      <section class="card mt-4 p-5">
        <div class="flex items-baseline gap-3">
          <h2 class="text-[15px] font-medium">Script</h2>
          <span class="text-[13px] text-ink-3">Flow language, or one instruction per line.</span>
          <button class="ml-auto rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40"
                  :disabled="live.running || !script.trim()" @click="run">Run script</button>
        </div>
        <FlowBox v-model="script" :rows="10" class="mt-3" />
      </section>
    </div>

    <!-- rail --------------------------------------------------------- -->
    <div class="grid content-start gap-4">
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
          <button class="mt-3 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white" @click="saveAsCase">
            Save as a case
          </button>
          <p v-if="saved" class="mt-2 text-[12.5px] text-good">Saved “{{ saved }}”.</p>
        </div>
        <p v-else-if="!suiteId && live.recordedFlow" class="mt-3 text-[12.5px] text-ink-3">
          Open the console from a suite to save this straight into it.
        </p>
      </section>

      <section v-if="live.run" class="card p-5">
        <div class="flex items-baseline gap-2">
          <h2 class="text-[15px] font-medium">Run</h2>
          <span class="text-[13px] text-ink-3">{{ live.run.suite }}</span>
        </div>
        <ol class="mt-3 space-y-1 font-mono text-[12px]">
          <li v-for="s in live.run.steps" :key="s.i" class="flex gap-2">
            <span class="w-5 shrink-0 text-right text-ink-3">{{ s.i }}</span>
            <span class="w-4 shrink-0" :class="{ 'text-good': s.state === 'pass', 'text-critical': s.state === 'fail' }">
              {{ { pass: '✓', fail: '✕', run: '·', idle: ' ' }[s.state] }}
            </span>
            <span class="min-w-0 flex-1" :class="s.state === 'fail' && 'text-critical'">
              {{ s.step ? describe(s.step) : '' }}
              <span v-if="s.error" class="block text-ink-2">{{ s.error }}</span>
            </span>
            <span v-if="s.ms !== null" class="shrink-0 tabular-nums text-ink-3">{{ s.ms }}ms</span>
          </li>
        </ol>
      </section>

      <section class="card p-5">
        <div class="flex items-baseline gap-2">
          <h2 class="text-[15px] font-medium">On this page</h2>
          <span class="ml-auto text-[12.5px] text-ink-3">{{ live.targets.length }}</span>
        </div>
        <p class="mt-1 truncate font-mono text-[11.5px] text-ink-3">{{ live.url }}</p>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <button v-for="t in live.targets" :key="t.target"
                  class="rounded-full border border-hairline px-2.5 py-1 text-[12px] hover:border-ink/30"
                  :title="`Insert ${t.target}`"
                  @click="script += `${script && !script.endsWith('\n') ? '\n' : ''}click ${t.target}\n`">
            {{ t.name }} <span class="text-ink-3">· {{ t.role }}</span>
          </button>
        </div>
      </section>

      <section class="card p-5">
        <h2 class="text-[15px] font-medium">Log</h2>
        <ul class="mt-3 max-h-64 space-y-1 overflow-y-auto font-mono text-[11.5px]">
          <li v-for="l in live.log" :key="l.id" :class="l.level === 'error' ? 'text-critical' : 'text-ink-2'">
            {{ l.msg }}
          </li>
          <li v-if="!live.log.length" class="text-ink-3">Nothing yet.</li>
        </ul>
      </section>
    </div>
  </div>

  <p v-if="error" class="mx-6 mb-6 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">
    {{ error }}
  </p>
</template>
