<script setup>
/**
 * Where the driven browser actually is.
 *
 * The canvas is a video, so it has no chrome: no address bar, no lock, no
 * status. You can watch a page navigate somewhere else and have no way to learn
 * where. That is worse than it sounds, because the interesting navigations are
 * the ones you did not ask for — a login that bounces you to an identity
 * provider on another domain, a marketing link that detours through a tracker,
 * a 301 to a path that no longer exists behind a friendly 404 page.
 *
 * So this is the chrome. It answers, in the order a person asks:
 *
 *   which application am I on   the origin, emphasised
 *   where in it                 the path, quieter
 *   how did I get here          the redirect chain, if there was one
 *   should I be worried         whether it left the origin, and any 4xx/5xx
 *
 * The origin is the loud half on purpose. `/dashboard` on your staging app and
 * `/dashboard` on an identity provider look identical when the path is what
 * catches the eye, and telling them apart is the entire point of showing this.
 */
import { computed, ref } from 'vue';

const props = defineProps({
  /** The address right now, or null when nothing is open. */
  url: { type: String, default: null },
  /** The navigation that produced it, if we have one: hops, status, leftOrigin. */
  nav: { type: Object, default: null },
});

const open = ref(false);
const copied = ref(false);

const blank = (u) => !u || u === 'about:blank';

/** Split for display. Never throws: this renders whatever the page reports. */
const parts = computed(() => {
  if (blank(props.url)) return null;
  try {
    const u = new URL(props.url);
    return {
      secure: u.protocol === 'https:',
      origin: u.host,
      // The path is what is left. An empty one shows as "/" rather than as
      // nothing, so the bar never looks truncated.
      rest: `${u.pathname === '/' && !u.search && !u.hash ? '/' : u.pathname}${u.search}${u.hash}`,
    };
  } catch {
    return { secure: false, origin: props.url, rest: '' };
  }
});

const hops = computed(() => props.nav?.hops ?? []);
const redirects = computed(() => props.nav?.redirects ?? 0);
const status = computed(() => props.nav?.status ?? null);
const leftOrigin = computed(() => !!props.nav?.leftOrigin);

/** Where it started, for the "left" chip — the useful half of a long chain. */
const cameFrom = computed(() => {
  const first = hops.value[0]?.url;
  if (!first) return null;
  try { return new URL(first).host; } catch { return first; }
});

const short = (u) => {
  try { const p = new URL(u); return `${p.host}${p.pathname}${p.search}`; } catch { return u; }
};

async function copy() {
  try {
    await navigator.clipboard.writeText(props.url);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1200);
  } catch { /* no clipboard permission; the text is selectable anyway */ }
}
</script>

<template>
  <div class="rounded-t-xl border border-b-0 border-hairline bg-ground px-3 py-2">
    <div class="flex items-center gap-2">
      <!-- Scheme, as a shape rather than a word. A padlock is the one piece of
           browser iconography everyone already reads correctly. -->
      <svg v-if="parts" class="size-3.5 shrink-0" :class="parts.secure ? 'text-good' : 'text-ink-3'"
           viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"
           :aria-label="parts.secure ? 'https' : 'http'" role="img">
        <rect v-if="parts.secure" x="3.5" y="7" width="9" height="6" rx="1.5" />
        <path v-if="parts.secure" d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
        <template v-else>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M2.5 8h11M8 2.5c1.6 1.7 1.6 9.3 0 11M8 2.5c-1.6 1.7-1.6 9.3 0 11" />
        </template>
      </svg>

      <p v-if="!parts" class="min-w-0 grow truncate font-mono text-[12.5px] text-ink-3">
        Nothing open — the runner is not pointed at a page yet
      </p>
      <p v-else class="min-w-0 grow truncate font-mono text-[12.5px]" :title="url">
        <span class="font-medium text-ink">{{ parts.origin }}</span><span class="text-ink-3">{{ parts.rest }}</span>
      </p>

      <!-- The chip that matters. A redirect onto another host is how a run ends
           up somewhere nobody allowed, so it is named rather than counted. -->
      <button v-if="leftOrigin" class="chip shrink-0 border-warn/40 bg-warn/10 text-warn"
              :title="`Started on ${cameFrom} and ended up somewhere else`"
              @click="open = !open">
        left {{ cameFrom }}
      </button>
      <button v-else-if="redirects" class="chip shrink-0" @click="open = !open">
        {{ redirects }} redirect{{ redirects === 1 ? '' : 's' }}
      </button>

      <span v-if="status && status >= 400" class="chip shrink-0 border-critical/40 bg-critical/10 text-critical">
        {{ status }}
      </span>

      <button v-if="parts" class="shrink-0 rounded-lg px-2 py-1 text-[11.5px] text-ink-3 hover:bg-ink/[0.05] hover:text-ink"
              :title="'Copy ' + url" @click="copy">
        {{ copied ? 'copied' : 'copy' }}
      </button>
    </div>

    <!-- The chain, hop by hop, with the status each one answered. "It works"
         and "it works after three 301s" are different facts. -->
    <ol v-if="open && hops.length > 1" class="mt-2 space-y-1 border-t border-hairline pt-2">
      <li v-for="(h, i) in hops" :key="i" class="flex items-baseline gap-2 font-mono text-[11.5px]">
        <span class="w-8 shrink-0 text-right"
              :class="h.status >= 400 ? 'text-critical' : h.status >= 300 ? 'text-ink-3' : 'text-good'">
          {{ h.status ?? '—' }}
        </span>
        <span class="min-w-0 truncate" :class="i === hops.length - 1 ? 'text-ink' : 'text-ink-3'"
              :title="h.url">{{ short(h.url) }}</span>
      </li>
    </ol>
  </div>
</template>
