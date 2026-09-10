<script setup>
import { computed, ref, watch } from 'vue';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import { useLive } from '@/stores/live';
import HeroPanel from '@/components/HeroPanel.vue';
import StatTile from '@/components/StatTile.vue';
import StatusPill from '@/components/StatusPill.vue';
import EmptyState from '@/components/EmptyState.vue';

const store = useSuites();
const live = useLive();
const suite = computed(() => store.current);
const runs = ref(null);

/**
 * Reload when the SUITE changes, not just when this component mounts.
 *
 * Vue reuses a route component when only the parameter changes, so moving from
 * one suite to another never re-ran onMounted — and the new suite's page showed
 * the previous suite's runs under the new suite's name. Four passing runs on a
 * suite that had never been run.
 *
 * Also reload when a run finishes, so the numbers settle without a refresh.
 */
const load = async (id) => { runs.value = id ? await api.runs(id).catch(() => null) : null; };
watch(() => suite.value?.id, load, { immediate: true });
watch(() => live.running, (now, before) => { if (before && !now) load(suite.value?.id); });

const rate = computed(() => {
  const p = runs.value?.totals.passRate;
  return p === null || p === undefined ? '—' : `${Math.round(p * 100)}%`;
});
const scanned = computed(() => suite.value.pages.filter((p) => p.scannedAt).length);
const expectations = computed(() => suite.value.pages.reduce((n, p) => n + p.expect.length, 0));

async function allow() {
  await store.allow(store.origin);
  await store.refresh();
}
</script>

<template>
  <div>
    <HeroPanel seed="suite-overview">
      <p class="eyebrow">Suite</p>
      <h1 class="mt-1.5 display text-4xl">{{ suite.name }}</h1>
      <p class="mt-2 font-mono text-[13px] text-ink-2">{{ suite.baseUrl }}</p>
      <p v-if="suite.description" class="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-2">
        {{ suite.description }}
      </p>
    </HeroPanel>

    <div v-if="!store.allowed" class="card mb-6 border-critical/25 p-5">
      <p class="text-[13.5px] font-medium">{{ store.origin }} is not allowed yet.</p>
      <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Nothing in this suite can run until a person approves its origin. No script can do it.
      </p>
      <button class="mt-4 rounded-full bg-brand hover:bg-brand-2 px-4 py-2 text-[13px] font-medium text-white" @click="allow">
        Allow {{ store.origin }}
      </button>
    </div>

    <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="Pages" :value="suite.pages.length" :note="`${scanned} scanned`" />
      <StatTile label="Expectations" :value="expectations" note="assertions on load" />
      <StatTile label="Cases" :value="suite.cases.length" :note="`${suite.cases.filter(c => c.source === 'recorded').length} recorded`" />
      <StatTile label="Pass rate" :value="rate" :note="runs ? `${runs.totals.week} runs this week` : ''" />
    </div>

    <div class="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <section class="card p-5">
        <h2 class="text-[15px] font-medium">Pages</h2>
        <ul v-if="suite.pages.length" class="mt-3 divide-y divide-hairline border-y border-hairline">
          <li v-for="p in suite.pages" :key="p.id" class="flex items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13.5px]">{{ p.name }}</p>
              <p class="truncate font-mono text-[11.5px] text-ink-3">{{ p.path }}</p>
            </div>
            <span class="shrink-0 text-[12px] text-ink-3">{{ p.expect.length }} expected</span>
          </li>
        </ul>
        <p v-else class="mt-3 text-[13px] text-ink-3">No pages yet.</p>
        <RouterLink :to="{ name: 'suite-pages' }" class="mt-4 inline-block text-[13px] underline">Manage pages</RouterLink>
      </section>

      <section class="card p-5">
        <h2 class="text-[15px] font-medium">Latest runs</h2>
        <ul v-if="runs?.latest.length" class="mt-3 divide-y divide-hairline border-y border-hairline">
          <li v-for="r in runs.latest.slice(0, 6)" :key="r.at" class="flex items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13.5px]">{{ r.caseName ?? r.suite }}</p>
              <p v-if="r.error" class="truncate text-[11.5px] text-ink-3">{{ r.error }}</p>
            </div>
            <StatusPill :ok="r.ok" size="sm" />
          </li>
        </ul>
        <EmptyState v-else class="mt-3" title="Nothing has run yet"
                    body="Add a case, then press Run suite." />
      </section>
    </div>
  </div>
</template>
