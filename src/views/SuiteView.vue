<script setup>
/**
 * The shell every suite section renders inside: load once here, then Overview,
 * Pages, Cases and Runs read the same store rather than each fetching.
 */
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import TopBar from '@/components/TopBar.vue';

const route = useRoute();
const store = useSuites();

watch(() => route.params.id, (id) => id && store.load(id), { immediate: true });

const suite = computed(() => store.current);
const crumbs = computed(() => [
  { label: 'Test suites', to: '/suites' },
  { label: suite.value?.name ?? route.params.id, to: `/suites/${route.params.id}` },
  ...(route.name === 'suite' ? [] : [{ label: { 'suite-pages': 'Pages', 'suite-cases': 'Cases', 'suite-runs': 'Runs' }[route.name] }]),
]);

async function runAll() {
  try { await api.runSuite(suite.value.id); } catch (e) { store.error = e.message; }
  await store.refresh();
}
</script>

<template>
  <TopBar :crumbs="crumbs">
    <template #actions>
      <RouterLink v-if="suite" :to="{ path: '/console', query: { suite: suite.id } }"
                  class="rounded-full border border-hairline px-4 py-2 text-[13.5px]">Console</RouterLink>
      <button v-if="suite" class="rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-white disabled:opacity-40"
              :disabled="!store.ready" @click="runAll">Run suite</button>
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
