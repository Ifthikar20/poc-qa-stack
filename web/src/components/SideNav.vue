<script setup>
/**
 * The sidebar is the product's table of contents: workspace at the top, the
 * suites you have onboarded in the middle, and the things that are not
 * suite-specific below. The open suite expands into its own sections, so
 * "where am I" is answered by the nav rather than by the breadcrumb alone.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useSuites } from '@/stores/suites';
import { useLive } from '@/stores/live';
import { api } from '@/api';

const route = useRoute();
const suites = useSuites();
const live = useLive();

const openId = computed(() => route.params.id ?? null);

const version = ref(null);
onMounted(async () => { version.value = await api.version().catch(() => null); });

const SECTIONS = [
  { to: 'suite',       label: 'Overview' },
  { to: 'suite-pages', label: 'Pages' },
  { to: 'suite-cases', label: 'Cases' },
  { to: 'suite-runs',  label: 'Runs' },
];
</script>

<template>
  <aside class="flex w-64 shrink-0 flex-col bg-night text-white/70">
    <div class="flex items-center gap-2.5 px-5 py-4">
      <span class="grid size-7 place-items-center rounded-lg bg-linear-to-br from-glow-2 to-glow-3">
        <span class="size-2 rounded-full bg-night" />
      </span>
      <span class="text-[15px] font-semibold tracking-tight text-white">ghostclick</span>
    </div>

    <div class="mx-3 mb-4 rounded-xl border border-night-line bg-night-2 px-3 py-2.5">
      <p class="text-[13px] font-medium text-white">Local workspace</p>
      <p class="mt-0.5 flex items-center gap-1.5 text-[11.5px]">
        <span class="size-1.5 rounded-full" :class="live.connected ? 'bg-good' : 'bg-critical'" />
        {{ live.connected ? 'Runner connected' : 'Runner offline' }}
      </p>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 pb-4 text-[13px]">
      <div class="flex items-center justify-between px-2 pb-1.5 pt-1">
        <span class="text-[11px] font-semibold uppercase tracking-[0.09em] text-white/40">Test suites</span>
        <RouterLink to="/suites/new" title="Onboard a project"
                    class="grid size-5 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white">+</RouterLink>
      </div>

      <p v-if="!suites.list.length" class="px-2 py-1.5 text-[12.5px] text-white/40">
        None yet — <RouterLink to="/suites/new" class="underline">onboard one</RouterLink>.
      </p>

      <template v-for="s in suites.list" :key="s.id">
        <RouterLink :to="`/suites/${s.id}`"
          class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 hover:text-white"
          :class="openId === s.id && 'bg-white/10 text-white'">
          <span class="truncate">{{ s.name }}</span>
          <span class="ml-auto shrink-0 text-[11px] text-white/35">{{ s.cases }}</span>
        </RouterLink>
        <div v-if="openId === s.id" class="mb-1 ml-3 border-l border-night-line pl-2">
          <RouterLink v-for="x in SECTIONS" :key="x.to" :to="{ name: x.to, params: { id: s.id } }"
            class="block rounded-md px-2 py-1 text-[12.5px] hover:bg-white/5 hover:text-white"
            active-class="text-white" exact-active-class="text-white">
            {{ x.label }}
          </RouterLink>
        </div>
      </template>

      <p class="px-2 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.09em] text-white/40">General</p>
      <RouterLink to="/dashboard" class="block rounded-lg px-2 py-1.5 hover:bg-white/5 hover:text-white"
                  active-class="bg-white/10 text-white">Run history</RouterLink>
      <RouterLink to="/console" class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 hover:text-white"
                  active-class="bg-white/10 text-white">
        Console
        <span v-if="live.recording" class="ml-auto size-1.5 animate-pulse rounded-full bg-critical" title="recording" />
        <span v-else-if="live.running" class="ml-auto size-1.5 animate-pulse rounded-full bg-glow-2" title="running" />
      </RouterLink>

      <p class="px-2 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.09em] text-white/40">Admin</p>
      <RouterLink to="/settings" class="block rounded-lg px-2 py-1.5 hover:bg-white/5 hover:text-white"
                  active-class="bg-white/10 text-white">Origins &amp; vault</RouterLink>
    </nav>

    <div class="m-3 rounded-xl border border-night-line bg-night-2 p-3 text-[12px] leading-relaxed text-white/55">
      <p class="font-medium text-white/85">Suites are project data</p>
      <p class="mt-1">They live in <code class="text-white/70">suites/*.json</code> and belong in git. Run history stays on this machine.</p>
      <!-- What is actually running. "Am I on the latest?" should be answerable
           by looking, not by remembering whether you pulled and rebuilt. -->
      <p v-if="version" class="mt-2.5 border-t border-night-line pt-2.5 font-mono text-[11px] text-white/40">
        {{ version.commit ?? 'no git' }} · ui {{ version.built ? version.built.replace('T', ' ').slice(5, 16) : 'not built' }}
      </p>
    </div>
  </aside>
</template>
