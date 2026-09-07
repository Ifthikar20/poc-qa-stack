<script setup>
/**
 * Defects: the same failure, however many runs hit it.
 *
 * Run history answers "what happened"; this answers "what is broken". A run
 * records only its first failure — a run stops there — so a defect is that
 * sentence, and the questions worth asking about it are how often it has
 * happened, which cases it takes down, and whether it is still happening.
 *
 * Grouping by the message rather than by the case is the point: one broken
 * selector usually breaks four cases, and four rows saying the same thing is a
 * list, not a diagnosis.
 *
 * Nothing here is hand-managed. `open` means no affected case has passed since
 * this last failed, so a defect closes itself when the thing is fixed — a
 * tracker nobody has to remember to update is a tracker that stays true.
 */
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api';
import TopBar from '@/components/TopBar.vue';
import HeroPanel from '@/components/HeroPanel.vue';
import StatTile from '@/components/StatTile.vue';
import EmptyState from '@/components/EmptyState.vue';

const data = ref(null);
const loading = ref(true);
const only = ref('open');            // open | all

const load = async () => {
  loading.value = true;
  try { data.value = await api.defects(); } catch { data.value = null; }
  finally { loading.value = false; }
};
onMounted(load);

const rows = computed(() => {
  const all = data.value?.defects ?? [];
  return only.value === 'open' ? all.filter((d) => d.open) : all;
});

const when = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};
</script>

<template>
  <TopBar :crumbs="[{ label: 'Defects' }]">
    <template #actions>
      <button class="rounded-full border border-hairline px-3.5 py-1.5 text-[13px] hover:border-ink/25"
              @click="load">Refresh</button>
    </template>
  </TopBar>

  <div class="mx-auto max-w-5xl px-6 py-8">
    <HeroPanel seed="defects">
      <p class="eyebrow">Defects</p>
      <h1 class="display mt-2 max-w-2xl text-4xl">What is actually broken.</h1>
      <p class="mt-3 max-w-xl text-[14.5px] leading-relaxed text-ink-2">
        One row per distinct failure, not per failing run — a broken selector that takes down four
        cases is one defect with four cases attached. A defect closes itself when an affected case
        passes again.
      </p>
    </HeroPanel>

    <div v-if="data" class="mb-6 grid gap-4 sm:grid-cols-3">
      <StatTile label="Open" :value="data.totals.open" note="not passing again yet" />
      <StatTile label="Seen" :value="data.totals.all" :note="`distinct failures in ${data.totals.days} days`" />
      <StatTile label="Cases hit" :value="new Set(data.defects.flatMap((d) => d.cases.map((c) => c.key))).size"
                note="across every suite" />
    </div>

    <div class="mb-4 flex items-center gap-2">
      <button v-for="f in ['open', 'all']" :key="f"
              class="rounded-full px-3.5 py-1.5 text-[13px]"
              :class="only === f ? 'bg-brand-50 font-medium text-brand-2' : 'border border-hairline hover:border-ink/25'"
              @click="only = f">
        {{ f === 'open' ? 'Open' : 'Everything seen' }}
      </button>
    </div>

    <p v-if="loading" class="text-[13.5px] text-ink-3">Reading run history…</p>

    <EmptyState v-else-if="!rows.length"
                :title="only === 'open' ? 'Nothing is failing' : 'Nothing has failed yet'"
                body="Defects are read out of run history — every failing run, grouped by the message it
                      stopped on. Run a suite and anything that breaks will collect here.">
      <RouterLink to="/suites" class="rounded-full bg-brand px-4 py-2 text-[13.5px] font-medium text-white hover:bg-brand-2">
        Go to your suites
      </RouterLink>
    </EmptyState>

    <section v-for="d in rows" :key="d.error" class="card mb-3 p-5">
      <div class="flex flex-wrap items-start gap-3">
        <span class="mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
              :class="d.open ? 'bg-critical/10 text-critical' : 'bg-ink/5 text-ink-2'">
          {{ d.open ? 'Open' : 'Passing again' }}
        </span>
        <p class="min-w-0 grow font-mono text-[12.5px] leading-relaxed text-ink">{{ d.error }}</p>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-3">
        <span class="font-medium text-ink-2">{{ d.hits }} time{{ d.hits === 1 ? '' : 's' }}</span>
        <span v-if="d.step !== null">stopped at step {{ d.step }}</span>
        <span>last {{ when(d.last) }}</span>
        <span v-if="d.first !== d.last">first {{ when(d.first) }}</span>
        <span>{{ d.suites.join(' · ') }}</span>
      </div>

      <div class="mt-3 flex flex-wrap gap-1.5">
        <span v-for="c in d.cases" :key="c.key"
              class="max-w-[16rem] truncate rounded-full border border-hairline px-2.5 py-1 text-[12px] text-ink-2"
              :title="c.name">{{ c.name }}</span>
      </div>
    </section>
  </div>
</template>
