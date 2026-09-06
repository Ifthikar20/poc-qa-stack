<script setup>
/**
 * The shell every suite section renders inside: load once here, then Overview,
 * Pages, Cases and Runs read the same store rather than each fetching.
 */
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import TopBar from '@/components/TopBar.vue';
import Btn from '@/components/Btn.vue';
import { useLive } from '@/stores/live';

const route = useRoute();
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

async function runAll() {
  if (running.value) return;
  running.value = true;
  store.error = null;
  try {
    const r = await api.runSuite(suite.value.id);
    if (r.passed < r.total) store.error = `${r.total - r.passed} of ${r.total} cases failed — see Runs.`;
  } catch (e) {
    store.error = e.needsOrigin ? `${e.needsOrigin} is not allowed yet — allow it on the Overview.` : e.message;
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
