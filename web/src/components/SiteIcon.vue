<script setup>
/**
 * A site shown as itself.
 *
 * Every suite in the sidebar used to carry the same three-bar glyph, so six
 * projects were six identical rows you had to read rather than recognise. This
 * draws the site's own favicon, and a monogram when it has none.
 *
 * The bytes come from OUR origin, not the site's. A sidebar full of
 * `<img src="https://thatsite/favicon.ico">` would make every viewer's browser
 * announce to every site in your suite list that someone is looking at it — and
 * would show a broken image for exactly the internal hosts this tool exists to
 * test. The server fetches once and caches; see icons.js.
 *
 * Fetched rather than `src`-ed because the API is token-gated and an `<img>`
 * cannot send an Authorization header.
 */
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api';

const props = defineProps({
  origin: { type: String, default: null },
  name:   { type: String, default: '' },
  size:   { type: String, default: 'size-4' },
});

/**
 * One blob URL per origin, for the life of the page.
 *
 * The sidebar re-renders on every navigation, and createObjectURL without a
 * matching revoke leaks the blob for as long as the document lives. Caching by
 * origin means one URL per site rather than one per render, and the entry is
 * the in-flight promise so six simultaneous mounts make one request.
 */
const cache = new Map();

function load(origin) {
  if (!cache.has(origin)) {
    cache.set(origin, api.siteIcon(origin).then((b) => (b ? URL.createObjectURL(b) : null)));
  }
  return cache.get(origin);
}

const src = ref(null);
const failed = ref(false);

onMounted(async () => {
  if (!props.origin) { failed.value = true; return; }
  const url = await load(props.origin).catch(() => null);
  if (url) src.value = url;
  else failed.value = true;
});

/** The host, without the www. that would make half the monograms a W. */
const host = computed(() => {
  try { return new URL(props.origin).hostname.replace(/^www\./, ''); }
  catch { return props.name || '?'; }
});

const letter = computed(() => (host.value || '?').slice(0, 1).toUpperCase());

/**
 * A colour derived from the host, so a site keeps the same one everywhere and
 * two sites in a list are unlikely to match. Fixed pairs rather than a computed
 * hue: generated colours drift into the brand magenta or into something that
 * fails contrast against the tile behind it.
 */
const TILES = [
  ['#e8f0fe', '#1a4fa0'], ['#e7f6ef', '#146c43'], ['#fdeef6', '#c2006a'],
  ['#fff3e0', '#9a5b00'], ['#efeaff', '#4c2fbf'], ['#e6f6f8', '#0f6c78'],
  ['#fdecec', '#a52020'], ['#eef1f4', '#40485a'],
];
const tile = computed(() => {
  let h = 0;
  for (const ch of host.value) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILES[h % TILES.length];
});
</script>

<template>
  <!-- aria-hidden throughout: the row's own label names the site, and a second
       reading of it is noise. Same reasoning as the line icons in SideNav. -->
  <img v-if="src && !failed" :src="src" :class="size" class="shrink-0 rounded object-contain"
       alt="" aria-hidden="true" @error="failed = true">
  <span v-else :class="size"
        class="grid shrink-0 place-items-center rounded text-[9px] font-semibold leading-none"
        :style="{ background: tile[0], color: tile[1] }" aria-hidden="true">{{ letter }}</span>
</template>
