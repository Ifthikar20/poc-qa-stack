<script setup>
import { computed, ref, watch } from 'vue';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import { useLive } from '@/stores/live';
import RunsChart from '@/components/RunsChart.vue';
import StatusPill from '@/components/StatusPill.vue';
import StatTile from '@/components/StatTile.vue';
import EmptyState from '@/components/EmptyState.vue';

const store = useSuites();
const live = useLive();
const data = ref(null);
const suite = computed(() => store.current);

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
const load = async (id) => { data.value = id ? await api.runs(id).catch(() => null) : null; };
watch(() => suite.value?.id, load, { immediate: true });
watch(() => live.running, (now, before) => { if (before && !now) load(suite.value?.id); });

const when = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const dur = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
</script>

<template>
  <div>
    <h1 class="display mb-1 text-3xl">Runs</h1>
    <p class="mb-6 text-[14px] text-ink-2">Every case of this suite that has finished, and what stopped it.</p>

    <EmptyState v-if="!data || !data.totals.runs" title="Nothing has run yet"
                body="Press Run suite above and the outcomes land here." />

    <template v-else>
      <div class="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile label="Runs" :value="data.totals.runs" :note="`${data.totals.week} this week`" />
        <StatTile label="Passing" :value="data.totals.passRate === null ? '—' : `${Math.round(data.totals.passRate * 100)}%`"
                  note="of runs in the last 7 days" />
        <StatTile label="Median run" :value="data.totals.medianMs === null ? '—' : dur(data.totals.medianMs)" note="across the last 7 days" />
      </div>

      <section class="card mb-4 p-5">
        <div class="flex items-baseline gap-3">
          <h2 class="text-[15px] font-medium">Runs per day</h2>
          <span class="text-[13px] text-ink-3">The last fourteen days.</span>
          <span class="ml-auto flex items-center gap-4 text-[12.5px] text-ink-2">
            <span class="flex items-center gap-1.5"><i class="size-2.5 rounded-[3px] bg-pass" /> Passed</span>
            <span class="flex items-center gap-1.5"><i class="size-2.5 rounded-[3px] bg-fail" /> Failed</span>
          </span>
        </div>
        <RunsChart :days="data.days" class="mt-3" />
      </section>

      <section class="card overflow-hidden">
        <table class="w-full text-[13.5px]">
          <thead class="border-b border-hairline text-left">
            <tr class="eyebrow">
              <th class="px-5 py-3 font-semibold">Case</th>
              <th class="px-3 py-3 font-semibold">Steps</th>
              <th class="px-3 py-3 font-semibold">Took</th>
              <th class="px-5 py-3 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-hairline">
            <tr v-for="r in data.latest" :key="r.at">
              <td class="px-5 py-3">
                <p>{{ r.caseName ?? r.suite }}</p>
                <p class="mt-0.5 text-[12px] text-ink-3">
                  {{ when(r.at) }}<template v-if="r.error"> · {{ r.error }}</template>
                </p>
              </td>
              <td class="px-3 py-3 tabular-nums text-ink-2">
                {{ r.ok ? r.total : `${r.passed} of ${r.total}, stopped at ${r.step + 1}` }}
              </td>
              <td class="px-3 py-3 tabular-nums text-ink-2">{{ dur(r.ms) }}</td>
              <td class="px-5 py-3 text-right"><StatusPill :ok="r.ok" size="sm" /></td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
