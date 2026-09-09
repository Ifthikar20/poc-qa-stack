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
import { useRoute, useRouter } from 'vue-router';
import { useSuites } from '@/stores/suites';
import { useLive } from '@/stores/live';
import { useSession } from '@/stores/session';
import { api } from '@/api';

const route = useRoute();
const router = useRouter();
const suites = useSuites();
const live = useLive();
const session = useSession();

async function signOut() {
  await session.logout();
  router.replace({ name: 'login' });
}

/**
 * Which organisation this session acts for. The control plane checks the
 * membership and remembers the choice; the socket and the token are dropped
 * so the next of each is the new organisation's, and the suites in this
 * sidebar are re-read from its directory.
 */
const switching = ref(false);
async function switchOrg(slug) {
  if (!slug || slug === session.org?.slug) return;
  switching.value = true;
  try {
    await session.switchOrg(slug);
    await suites.loadList();
    router.replace('/suites');
  } catch (e) { live.say(e.message, 'error'); }
  finally { switching.value = false; }
}
const initial = computed(() => (session.org?.name ?? 'Local').slice(0, 1).toUpperCase());

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
  defects: 'M8 2.6 14.2 13H1.8zM8 6.4v3.1M8 11.3v.5',
  settings:'M8 5.9a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2M8 2.3l1 1.5 1.8-.3.5 1.7 1.6.8-.6 1.7.9 1.6-1.4 1.1v1.8l-1.8.2-1 1.5L8 13l-1 .9-1-1.5-1.8-.2v-1.8L2.8 9.3l.9-1.6-.6-1.7 1.6-.8.5-1.7L7 3.8z',
  security:'M8 2.2 3.2 4v4c0 2.9 2 5 4.8 5.8 2.8-.8 4.8-2.9 4.8-5.8V4zM6 8l1.4 1.4L10.2 6.6',
  org:     'M5.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2 13c0-2 1.6-3.3 3.5-3.3S9 11 9 13M7.5 13c0-2 1.3-3.3 3-3.3S14 11 14 13',
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

    <!-- Workspace: the organisation you act for (docs/AUTH.md §10) — every
         suite, origin and run below is hers — with its plan, and whether the
         thing that does the work is actually up: a runner that has quietly
         died should not need a run to discover, and one another organisation
         is driving should say so here, not on the canvas. -->
    <div class="mx-3 mb-5 rounded-xl border border-hairline bg-ground px-3 py-2.5">
      <div class="flex items-center gap-2.5">
        <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-panel text-[12px] font-semibold
                     text-ink-2 ring-1 ring-hairline">{{ initial }}</span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="block truncate text-[13px] font-medium text-ink" :title="session.org?.slug">{{ session.org?.name ?? 'Local workspace' }}</span>
            <span v-if="session.org?.plan" class="shrink-0 rounded-full bg-brand-50 px-1.5 py-px text-[10.5px] font-medium text-brand-2">{{ session.org.plan }}</span>
          </span>
          <span class="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <span class="size-1.5 rounded-full" :class="live.busy ? 'bg-warn' : live.connected ? 'bg-good' : 'bg-critical'" />
            {{ live.busy ? `Runner busy — ${live.driving.org}` : live.connected ? 'Runner connected' : 'Runner offline' }}
          </span>
        </span>
      </div>
      <!-- A switcher only when there is something to switch to. -->
      <select v-if="session.orgs.length > 1" :value="session.org?.slug" :disabled="switching"
              aria-label="Act for another organisation"
              class="mt-2 w-full rounded-lg border border-hairline bg-panel px-2 py-1 text-[12px] text-ink-2 outline-none focus:border-ink/25"
              @change="switchOrg($event.target.value)">
        <option v-for="o in session.orgs" :key="o.slug" :value="o.slug">{{ o.name }} · {{ o.role }}</option>
      </select>
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
      <RouterLink to="/defects" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="ICONS.defects" />
        </svg>
        Defects
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
      <RouterLink v-if="session.required" to="/organisation" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
             stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="ICONS.org" />
        </svg>
        Organisation
      </RouterLink>
      <!-- The account's own settings exist only when there is an account:
           with no control plane there is no password to change. -->
      <RouterLink v-if="session.required" to="/security" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
             stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="ICONS.security" />
        </svg>
        Security
      </RouterLink>
    </nav>

    <!-- Signing in with no way to sign out is a half-built feature, and on a
         shared machine it is the half that matters. Hidden entirely when no
         control plane is configured, so the laptop case gains no dead UI. -->
    <div v-if="session.required && session.user"
         class="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-hairline bg-ground px-3 py-2.5">
      <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[11.5px] font-medium text-brand-2">
        {{ (session.user.name || session.user.email).slice(0, 1).toUpperCase() }}
      </span>
      <span class="min-w-0 grow truncate text-[12px] text-ink-2" :title="session.user.email">
        {{ session.user.name || session.user.email }}
      </span>
      <button class="shrink-0 rounded-lg px-2 py-1 text-[12px] text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
              @click="signOut">Sign out</button>
    </div>

    <div class="m-3 rounded-xl border border-hairline bg-ground p-3 text-[12px] leading-relaxed text-ink-2">
      <p class="font-medium text-ink">Suites are project data</p>
      <p class="mt-1">They live in <code class="rounded bg-ink/[0.05] px-1 py-px font-mono text-[11px]">suites/{{ session.org?.slug ?? 'local' }}/</code>
        and belong in git. Run history stays on this machine.</p>
      <!-- What is actually running. "Am I on the latest?" should be answerable
           by looking, not by remembering whether you pulled and rebuilt. -->
      <p v-if="version" class="mt-2.5 border-t border-hairline pt-2.5 font-mono text-[11px] text-ink-3">
        {{ version.commit ?? 'no git' }} · ui {{ version.built ? version.built.replace('T', ' ').slice(5, 16) : 'not built' }}
      </p>
    </div>
  </aside>
</template>
