<script setup>
import { onMounted, ref } from 'vue';
import { api } from '@/api';
import HeroPanel from '@/components/HeroPanel.vue';
import TopBar from '@/components/TopBar.vue';
import RunsChart from '@/components/RunsChart.vue';
import StatTile from '@/components/StatTile.vue';
import StatusPill from '@/components/StatusPill.vue';
import EmptyState from '@/components/EmptyState.vue';

const data = ref(null);
const filter = ref('');
onMounted(async () => { data.value = await api.runs(); });

const when = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
const dur = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const match = (rows) => rows.filter((r) => (r.suite ?? '').toLowerCase().includes(filter.value.toLowerCase()));
</script>

<template>
  <TopBar :crumbs="[{ label: 'Run history' }]">
    <template #actions>
      <input v-model="filter" placeholder="Filter suites"
             class="w-56 rounded-full border border-hairline bg-panel px-4 py-1.5 text-[13px] outline-none focus:border-ink/25">
    </template>
  </TopBar>

  <div class="mx-auto max-w-6xl px-6 py-8">
    <HeroPanel seed="dashboard">
      <p class="eyebrow">Run history</p>
      <h1 class="mt-1.5 display text-4xl">Every run, and what broke.</h1>
      <p class="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
        Each case that finishes is recorded here — which suite, how long it took, and the step it
        stopped on.
      </p>
    </HeroPanel>

    <EmptyState v-if="data && !data.totals.runs" title="No runs yet"
                body="Onboard a suite and run it; the outcomes land here." >
      <RouterLink to="/suites/new" class="rounded-full bg-brand hover:bg-brand-2 px-4 py-2 text-[13.5px] font-medium text-white">
        Onboard a project
      </RouterLink>
    </EmptyState>

    <template v-else-if="data">
      <div class="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Runs, 7 days" :value="data.totals.week" :note="`${data.totals.runs} recorded in total`" />
        <StatTile label="Passing" :value="data.totals.passRate === null ? '—' : `${Math.round(data.totals.passRate * 100)}%`"
                  note="of runs in the last 7 days" />
        <StatTile label="Suites" :value="data.totals.suites" note="distinct scripts" />
        <StatTile label="Median run" :value="data.totals.medianMs === null ? '—' : dur(data.totals.medianMs)"
                  note="across the last 7 days" />
      </div>

      <div class="mb-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section class="card p-5">
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

        <section class="card wash-warm p-5">
          <h2 class="text-[15px] font-medium">Passing</h2>
          <p class="mt-1 text-[13px] text-ink-2">Share of runs that finished clean.</p>
          <p class="mt-5 display text-5xl tabular-nums">
            {{ data.totals.passRate === null ? '—' : `${Math.round(data.totals.passRate * 100)}%` }}
          </p>
          <div class="mt-5 h-2.5 overflow-hidden rounded-full bg-hairline">
            <div class="h-full rounded-full bg-ink transition-[width] duration-500"
                 :style="{ width: `${(data.totals.passRate ?? 0) * 100}%` }" />
          </div>
          <ul class="mt-4 space-y-1.5 text-[13px]">
            <li class="flex items-center gap-2"><i class="size-2.5 rounded-[3px] bg-pass" />
              {{ data.days.reduce((n, d) => n + d.passed, 0) }} passed</li>
            <li class="flex items-center gap-2"><i class="size-2.5 rounded-[3px] bg-fail" />
              {{ data.days.reduce((n, d) => n + d.failed, 0) }} failed</li>
          </ul>
        </section>
      </div>

      <section class="card mb-5 overflow-hidden">
        <div class="flex items-baseline gap-3 px-5 pt-5">
          <h2 class="text-[15px] font-medium">By suite</h2>
          <span class="text-[13px] text-ink-3">Newest first.</span>
        </div>
        <table class="mt-3 w-full text-[13.5px]">
          <thead class="border-y border-hairline text-left">
            <tr class="table-head">
              <th class="px-5 py-2.5 font-semibold">Suite</th>
              <th class="px-3 py-2.5 font-semibold">Last run</th>
              <th class="px-3 py-2.5 font-semibold">Pass rate</th>
              <th class="px-5 py-2.5 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-hairline">
            <tr v-for="s in match(data.suites)" :key="s.suite">
              <td class="px-5 py-3">
                <RouterLink v-if="s.suiteId" :to="`/suites/${s.suiteId}`" class="hover:underline">{{ s.suite }}</RouterLink>
                <span v-else>{{ s.suite }}</span>
              </td>
              <td class="px-3 py-3 text-ink-2">{{ when(s.last.at) }}</td>
              <td class="px-3 py-3 tabular-nums text-ink-2">{{ Math.round(s.passed / s.runs * 100) }}% of {{ s.runs }}</td>
              <td class="px-5 py-3 text-right"><StatusPill :ok="s.last.ok" size="sm" /></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card overflow-hidden">
        <div class="flex items-baseline gap-3 px-5 pt-5">
          <h2 class="text-[15px] font-medium">Latest</h2>
        </div>
        <table class="mt-3 w-full text-[13.5px]">
          <thead class="border-y border-hairline text-left">
            <tr class="table-head">
              <th class="px-5 py-2.5 font-semibold">Suite</th>
              <th class="px-3 py-2.5 font-semibold">Steps</th>
              <th class="px-3 py-2.5 font-semibold">Took</th>
              <th class="px-5 py-2.5 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-hairline">
            <tr v-for="r in match(data.latest)" :key="r.at">
              <td class="px-5 py-3">
                <p>{{ r.suite }}</p>
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
