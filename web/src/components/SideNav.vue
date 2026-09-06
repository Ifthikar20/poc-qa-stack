<script setup>
/**
 * The sidebar is the product's table of contents: workspace at the top, the
 * suites you have onboarded in the middle, and the things that are not
 * suite-specific below. The open suite expands into its own sections, so
 * "where am I" is answered by the nav rather than by the breadcrumb alone.
 *
 * White, not a dark slab. A navy sidebar is a decade-old convention that puts
 * the heaviest block of colour on the part of the screen carrying the least
 * information — it draws the eye away from the run you are actually watching.
 * A hairline does the separating instead, the accent marks only what is
 * selected, and the icons are line art so a column of them reads as texture
 * rather than as twelve competing badges.
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

/**
 * 16px line icons, drawn inline rather than pulled from a font.
 *
 * A whole icon library is 40kB to render eight glyphs, and every one of them
 * would still need aria-hiding — the label beside it is the accessible name,
 * and a second copy of it read aloud is noise.
 */
const ICONS = {
  suite:   'M3 5.5h10M3 8h10M3 10.5h6',
  history: 'M8 4.2v4l2.6 1.6M2.6 8a5.4 5.4 0 1 0 1.6-3.8',
  console: 'M2.5 3.5h11v9h-11zM5 7l1.8 1.6L5 10.2M8.8 10.4h2.6',
  settings:'M8 5.9a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2M8 2.3l1 1.5 1.8-.3.5 1.7 1.6.8-.6 1.7.9 1.6-1.4 1.1v1.8l-1.8.2-1 1.5L8 13l-1 .9-1-1.5-1.8-.2v-1.8L2.8 9.3l.9-1.6-.6-1.7 1.6-.8.5-1.7L7 3.8z',
};
</script>

<template>
  <aside class="flex w-[248px] shrink-0 flex-col border-r border-hairline bg-panel">
    <!-- The mark. Two-tone wordmark, the way a product signs its own corner. -->
    <div class="flex items-center gap-2.5 px-4 py-4">
      <span class="grid size-7 place-items-center rounded-lg bg-ink">
        <span class="size-2 rounded-full bg-brand" />
      </span>
      <span class="text-[15px] font-semibold tracking-tight text-ink">ghost<span class="text-brand">click</span></span>
    </div>

    <!-- Workspace. Where you are, and whether the thing that does the work is
         actually up — a runner that has quietly died should not need a run to
         discover. -->
    <div class="mx-3 mb-5 flex items-center gap-2.5 rounded-xl border border-hairline bg-ground px-3 py-2.5">
      <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-panel text-[12px] font-semibold
                   text-ink-2 ring-1 ring-hairline">L</span>
      <span class="min-w-0">
        <span class="block truncate text-[13px] font-medium text-ink">Local workspace</span>
        <span class="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
          <span class="size-1.5 rounded-full" :class="live.connected ? 'bg-good' : 'bg-critical'" />
          {{ live.connected ? 'Runner connected' : 'Runner offline' }}
        </span>
      </span>
    </div>

    <nav class="flex-1 overflow-y-auto px-3 pb-4">
      <div class="flex items-center justify-between px-2 pb-2">
        <span class="eyebrow">Test suites</span>
        <RouterLink to="/suites/new" title="Onboard a project" aria-label="Onboard a project"
                    class="grid size-5 place-items-center rounded-md text-[15px] leading-none text-ink-3
                           hover:bg-ink/[0.05] hover:text-ink">+</RouterLink>
      </div>

      <p v-if="!suites.list.length" class="px-2 py-1.5 text-[12.5px] text-ink-3">
        None yet — <RouterLink to="/suites/new" class="text-brand-2 underline underline-offset-2">onboard one</RouterLink>.
      </p>

      <template v-for="s in suites.list" :key="s.id">
        <RouterLink :to="`/suites/${s.id}`" class="nav-item hover:bg-ink/[0.04] hover:text-ink"
                    :class="openId === s.id && 'nav-item-on'">
          <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
               stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <path :d="ICONS.suite" />
          </svg>
          <span class="truncate">{{ s.name }}</span>
          <span class="ml-auto shrink-0 text-[11px] tabular-nums text-ink-3">{{ s.cases }}</span>
        </RouterLink>

        <!-- The open suite's own sections, hung off it so the nav answers
             "where am I" without the breadcrumb having to. -->
        <!-- Bound by name rather than by active-class: `text-ink-3` and
             `text-brand-2` are both plain text utilities, so which one wins is
             decided by stylesheet order, not by the order they are written
             here — the selected section came out grey. -->
        <div v-if="openId === s.id" class="mb-1 ml-[1.9rem]">
          <RouterLink v-for="x in SECTIONS" :key="x.to" :to="{ name: x.to, params: { id: s.id } }"
            class="block rounded-lg px-2.5 py-1.5 text-[12.5px]"
            :class="route.name === x.to
              ? 'bg-brand-50 font-medium text-brand-2'
              : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink'">
            {{ x.label }}
          </RouterLink>
        </div>
      </template>

      <p class="eyebrow px-2 pb-2 pt-6">General</p>
      <RouterLink to="/dashboard" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="ICONS.history" />
        </svg>
        Run history
      </RouterLink>
      <RouterLink to="/console" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="ICONS.console" />
        </svg>
        Console
        <span v-if="live.recording" class="ml-auto size-1.5 animate-pulse rounded-full bg-critical" title="recording" />
        <span v-else-if="live.running" class="ml-auto size-1.5 animate-pulse rounded-full bg-brand" title="running" />
      </RouterLink>

      <p class="eyebrow px-2 pb-2 pt-6">Admin</p>
      <RouterLink to="/settings" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
             stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="ICONS.settings" />
        </svg>
        Origins &amp; vault
      </RouterLink>
    </nav>

    <div class="m-3 rounded-xl border border-hairline bg-ground p-3 text-[12px] leading-relaxed text-ink-2">
      <p class="font-medium text-ink">Suites are project data</p>
      <p class="mt-1">They live in <code class="rounded bg-ink/[0.05] px-1 py-px font-mono text-[11px]">suites/*.json</code>
        and belong in git. Run history stays on this machine.</p>
      <!-- What is actually running. "Am I on the latest?" should be answerable
           by looking, not by remembering whether you pulled and rebuilt. -->
      <p v-if="version" class="mt-2.5 border-t border-hairline pt-2.5 font-mono text-[11px] text-ink-3">
        {{ version.commit ?? 'no git' }} · ui {{ version.built ? version.built.replace('T', ' ').slice(5, 16) : 'not built' }}
      </p>
    </div>
  </aside>
</template>
