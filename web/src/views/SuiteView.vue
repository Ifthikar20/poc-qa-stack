<script setup>
/**
 * The shell every suite section renders inside: load once here, then Overview,
 * Pages, Cases and Runs read the same store rather than each fetching.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import TopBar from '@/components/TopBar.vue';
import Btn from '@/components/Btn.vue';
import { useLive } from '@/stores/live';

const route = useRoute();
const router = useRouter();
const store = useSuites();
const live = useLive();

watch(() => route.params.id, (id) => id && store.load(id), { immediate: true });

const suite = computed(() => store.current);
const crumbs = computed(() => [
  { label: 'Test suites', to: '/suites' },
  { label: suite.value?.name ?? route.params.id, to: `/suites/${route.params.id}` },
  ...(route.name === 'suite' ? [] : [{ label: { 'suite-pages': 'Pages', 'suite-cases': 'Cases', 'suite-runs': 'Runs' }[route.name] }]),
]);

/**
 * Run every case, with the button saying so.
 *
 * This drives a real browser and routinely takes tens of seconds. It used to
 * await the whole thing with no busy state at all — no disable, no label
 * change, nothing — so the only honest reading of the screen was that the
 * click had not registered.
 *
 * The socket is already narrating (suite.start, run.end per case), so the
 * label counts them off rather than showing a generic spinner.
 */
const running = ref(false);

/**
 * Run the suite where you can watch it.
 *
 * A run drives a real browser for tens of seconds, and pressing the button used
 * to leave you on a summary page while all of that happened somewhere you could
 * not see. So it goes to the console first — the canvas, the step list, the log
 * — and starts the run there.
 *
 * No `url` in the query: the run's own first step navigates, and pointing the
 * console at a page at the same moment would have the two fighting over the
 * browser.
 */
async function runAll() {
  if (running.value) return;
  running.value = true;
  store.error = null;
  const id = suite.value.id;

  // Navigate FIRST, so the console is mounted and listening before the first
  // step reports. Arriving halfway through a run means an empty step list.
  await router.push({ path: '/console', query: { suite: id } });
  await nextTick();

  try {
    const r = await api.runSuite(id, null, live.paceMs);
    if (r.passed < r.total) {
      live.say(`${r.total - r.passed} of ${r.total} cases failed`, 'error');
    }
  } catch (e) {
    // The gate is a decision, not an error: hand the console the button.
    // The plan's refusal is a prompt there too, and a busy runner a notice.
    if (e.needsOrigin) live.needsOrigin = { origin: e.needsOrigin };
    else if (e.entitlement) live.upgrade = { ...e.entitlement, of: 'run' };
    else live.say(e.message, 'error');
  } finally {
    running.value = false;
    await store.refresh();
  }
}

/**
 * Open the console ON this suite, not merely labelled with it.
 *
 * It used to pass the suite id and nothing else, so the breadcrumb said
 * "Kestrel / Console" while the canvas showed whatever the runner happened to
 * be driving from an hour ago. The suite's first page is what "the relevant
 * page" means here; its base URL is the fallback when it has no pages yet.
 */
const consoleLink = computed(() => ({
  path: '/console',
  query: {
    suite: suite.value.id,
    url: suite.value.pages[0]?.url ?? suite.value.baseUrl,
  },
}));

const runLabel = computed(() => {
  const s = live.suiteRun;
  return s ? `Running ${Math.min(s.done + 1, s.cases)} of ${s.cases}…` : 'Running…';
});
</script>

<template>
  <TopBar :crumbs="crumbs">
    <template #actions>
      <RouterLink v-if="suite" :to="consoleLink"
                  class="rounded-full border border-hairline px-4 py-2 text-[13.5px]">Console</RouterLink>
      <Btn v-if="suite" :busy="running || live.running" :busy-label="runLabel"
           :disabled="!store.ready" @click="runAll">Run suite</Btn>
    </template>
  </TopBar>

  <div class="mx-auto max-w-5xl px-6 py-8">
    <p v-if="store.error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">
      {{ store.error }}
    </p>
    <p v-if="store.loading && !suite" class="text-[13.5px] text-ink-3">Loading…</p>
    <RouterView v-else-if="suite" />
  </div>
</template>
