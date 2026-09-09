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
import { useUi } from '@/stores/ui';
import SiteIcon from '@/components/SiteIcon.vue';
import { api } from '@/api';

const route = useRoute();
const router = useRouter();
const suites = useSuites();
const live = useLive();
const session = useSession();
const ui = useUi();

/**
 * Collapsed is a 64px RAIL, not zero width.
 *
 * Collapsing to nothing means the only way back is a control that has to live
 * somewhere else — a floating button over the content, or a hamburger in the
 * header — and then the shell has two nav affordances that must agree. A rail
 * keeps the toggle where the sidebar already is, and keeps the icons, which are
 * most of what you navigate by once you know the product.
 */
const rail = computed(() => ui.navCollapsed);

async function signOut() {
  await session.logout();
  router.replace({ name: 'login' });
}

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
};
</script>

<template>
  <!-- Width is the only thing that changes, because App.vue's shell is plain
       flexbox: main is flex-1 and reflows on its own. Transitioning the width
       rather than toggling it stops the content from jumping. -->
  <aside class="flex shrink-0 flex-col border-r border-hairline bg-panel transition-[width] duration-200"
         :class="rail ? 'w-16' : 'w-[248px]'">
    <!-- The mark, doubling as the toggle. A product signs its own corner, and
         the corner is also the most findable place to put the control that put
         it there — no floating button, no second affordance to keep in sync. -->
    <button type="button" @click="ui.toggleNav()"
            :title="rail ? 'Expand the sidebar' : 'Collapse the sidebar'"
            :aria-label="rail ? 'Expand the sidebar' : 'Collapse the sidebar'"
            :aria-expanded="!rail"
            class="group flex items-center gap-2.5 py-4 hover:bg-ink/[0.03]"
            :class="rail ? 'justify-center px-0' : 'px-4'">
      <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-ink">
        <span class="size-2 rounded-full bg-brand" />
      </span>
      <span v-if="!rail" class="text-[15px] font-semibold tracking-tight text-ink">ghost<span class="text-brand">click</span></span>
      <svg v-if="!rail" viewBox="0 0 16 16" class="ml-auto size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
           fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9.5 4.5 6 8l3.5 3.5" />
      </svg>
    </button>

    <!-- Workspace. Where you are, and whether the thing that does the work is
         actually up — a runner that has quietly died should not need a run to
         discover. -->
    <div class="mb-5 flex items-center gap-2.5 rounded-xl border-hairline bg-ground"
         :class="rail ? 'mx-2 justify-center border p-2' : 'mx-3 border px-3 py-2.5'">
      <!-- In the rail the runner status has nowhere to be written, so it
           becomes a badge on the avatar. Losing it entirely would hide exactly
           the thing this block exists to surface. -->
      <span class="relative grid size-7 shrink-0 place-items-center rounded-lg bg-panel text-[12px] font-semibold
                   text-ink-2 ring-1 ring-hairline"
            :title="rail ? (live.connected ? 'Runner connected' : 'Runner offline') : null">L<span
            v-if="rail" class="absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-ground"
            :class="live.connected ? 'bg-good' : 'bg-critical'" /></span>
      <span v-if="!rail" class="min-w-0">
        <span class="block truncate text-[13px] font-medium text-ink">Local workspace</span>
        <span class="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
          <span class="size-1.5 rounded-full" :class="live.connected ? 'bg-good' : 'bg-critical'" />
          {{ live.connected ? 'Runner connected' : 'Runner offline' }}
        </span>
      </span>
    </div>

    <nav class="flex-1 overflow-y-auto pb-4" :class="rail ? 'px-2' : 'px-3'">
      <div class="flex items-center pb-2" :class="rail ? 'justify-center' : 'justify-between px-2'">
        <span v-if="!rail" class="eyebrow">Test suites</span>
        <RouterLink to="/suites/new" title="Onboard a project" aria-label="Onboard a project"
                    class="grid size-5 place-items-center rounded-md text-[15px] leading-none text-ink-3
                           hover:bg-ink/[0.05] hover:text-ink">+</RouterLink>
      </div>

      <p v-if="!suites.list.length && !rail" class="px-2 py-1.5 text-[12.5px] text-ink-3">
        None yet — <RouterLink to="/suites/new" class="text-brand-2 underline underline-offset-2">onboard one</RouterLink>.
      </p>

      <template v-for="s in suites.list" :key="s.id">
        <!-- The site's own mark, not a glyph every suite shares. `title` and
             `aria-label` are on the link rather than the image because in the
             rail the visible label is gone, and the name has to survive that
             for a hover and for a screen reader alike. -->
        <RouterLink :to="`/suites/${s.id}`" class="nav-item hover:bg-ink/[0.04] hover:text-ink"
                    :class="[openId === s.id && 'nav-item-on', rail && 'nav-item-rail']"
                    :title="rail ? `${s.name} — ${s.cases} case${s.cases === 1 ? '' : 's'}` : null"
                    :aria-label="rail ? s.name : null">
          <SiteIcon :origin="s.origin" :name="s.name" :size="rail ? 'size-5' : 'size-4'" />
          <span v-if="!rail" class="truncate">{{ s.name }}</span>
          <span v-if="!rail" class="ml-auto shrink-0 text-[11px] tabular-nums text-ink-3">{{ s.cases }}</span>
        </RouterLink>

        <!-- The open suite's own sections, hung off it so the nav answers
             "where am I" without the breadcrumb having to. -->
        <!-- Bound by name rather than by active-class: `text-ink-3` and
             `text-brand-2` are both plain text utilities, so which one wins is
             decided by stylesheet order, not by the order they are written
             here — the selected section came out grey. -->
        <div v-if="openId === s.id && !rail" class="mb-1 ml-[1.9rem]">
          <RouterLink v-for="x in SECTIONS" :key="x.to" :to="{ name: x.to, params: { id: s.id } }"
            class="block rounded-lg px-2.5 py-1.5 text-[12.5px]"
            :class="route.name === x.to
              ? 'bg-brand-50 font-medium text-brand-2'
              : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink'">
            {{ x.label }}
          </RouterLink>
        </div>
      </template>

      <p v-if="!rail" class="eyebrow px-2 pb-2 pt-6">General</p>
      <div v-else class="mx-2 mt-6 mb-2 border-t border-hairline" />
      <RouterLink to="/dashboard" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on"
                  :class="rail && 'nav-item-rail'" :title="rail ? 'Run history' : null" :aria-label="rail ? 'Run history' : null">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="ICONS.history" />
        </svg>
        <span v-if="!rail">Run history</span>
      </RouterLink>
      <RouterLink to="/defects" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on"
                  :class="rail && 'nav-item-rail'" :title="rail ? 'Defects' : null" :aria-label="rail ? 'Defects' : null">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="ICONS.defects" />
        </svg>
        <span v-if="!rail">Defects</span>
      </RouterLink>
      <RouterLink to="/console" class="nav-item relative hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on"
                  :class="rail && 'nav-item-rail'" :title="rail ? 'Console' : null" :aria-label="rail ? 'Console' : null">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="ICONS.console" />
        </svg>
        <span v-if="!rail">Console</span>
        <span v-if="live.recording" :class="rail ? 'absolute right-1 top-1 size-1.5' : 'ml-auto size-1.5'" class="animate-pulse rounded-full bg-critical" title="recording" />
        <span v-else-if="live.running" :class="rail ? 'absolute right-1 top-1 size-1.5' : 'ml-auto size-1.5'" class="animate-pulse rounded-full bg-brand" title="running" />
      </RouterLink>

      <p v-if="!rail" class="eyebrow px-2 pb-2 pt-6">Admin</p>
      <div v-else class="mx-2 mt-6 mb-2 border-t border-hairline" />
      <RouterLink to="/settings" class="nav-item hover:bg-ink/[0.04] hover:text-ink" active-class="nav-item-on"
                  :class="rail && 'nav-item-rail'" :title="rail ? 'Origins &amp; vault' : null" :aria-label="rail ? 'Origins &amp; vault' : null">
        <svg viewBox="0 0 16 16" class="size-4 shrink-0" fill="none" stroke="currentColor"
             stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="ICONS.settings" />
        </svg>
        <span v-if="!rail">Origins &amp; vault</span>
      </RouterLink>
    </nav>

    <!-- Signing in with no way to sign out is a half-built feature, and on a
         shared machine it is the half that matters. Hidden entirely when no
         control plane is configured, so the laptop case gains no dead UI. -->
    <div v-if="session.required && session.user"
         class="mt-3 flex items-center gap-2 rounded-xl border border-hairline bg-ground"
         :class="rail ? 'mx-2 justify-center p-2' : 'mx-3 px-3 py-2.5'">
      <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[11.5px] font-medium text-brand-2"
            :title="rail ? session.user.email : null">
        {{ (session.user.name || session.user.email).slice(0, 1).toUpperCase() }}
      </span>
      <span v-if="!rail" class="min-w-0 grow truncate text-[12px] text-ink-2" :title="session.user.email">
        {{ session.user.name || session.user.email }}
      </span>
      <button v-if="!rail" class="shrink-0 rounded-lg px-2 py-1 text-[12px] text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
              @click="signOut">Sign out</button>
    </div>
    <!-- In the rail the words do not fit, but signing out must not become
         unreachable — it is the half of auth that matters on a shared machine. -->
    <button v-if="session.required && session.user && rail" @click="signOut"
            title="Sign out" aria-label="Sign out"
            class="mx-2 mt-2 grid place-items-center rounded-lg py-2 text-ink-3 hover:bg-ink/[0.05] hover:text-ink">
      <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 13.5H3.5v-11H6M10 11l3-3-3-3M13 8H6.5" />
      </svg>
    </button>

    <div v-if="!rail" class="m-3 rounded-xl border border-hairline bg-ground p-3 text-[12px] leading-relaxed text-ink-2">
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
