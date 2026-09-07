<script setup>
/**
 * The hero card: a photograph when there is one, the gradient wash when there
 * is not.
 *
 * The scrim is not decoration. Putting arbitrary photographs behind near-black
 * text is how a page becomes unreadable on the one image nobody checked — so
 * the text sits on a band of solid panel colour that fades into the picture,
 * and even the far edge keeps enough panel over it to stay a backdrop. That
 * holds whatever the photograph turns out to be, which matters when the folder
 * is filled by whoever is using the tool rather than by a designer.
 *
 * Drop images in `public/hero/`. Nothing there is the normal case and the
 * gradient is what you get.
 */
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api';

const props = defineProps({
  /** Stable input for the pick, so a page keeps its picture across reloads. */
  seed: { type: String, default: '' },
});

const images = ref([]);
onMounted(async () => { images.value = await api.hero().then((r) => r.images).catch(() => []); });

// Deterministic, not random: a hero that reshuffles on every navigation reads
// as a page that has not finished loading.
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const image = computed(() =>
  (images.value.length ? images.value[hash(props.seed) % images.value.length] : null));
</script>

<template>
  <header class="card relative isolate mb-6 overflow-hidden p-7" :class="!image && 'wash'">
    <template v-if="image">
      <!-- Decorative: the words beside it are the content, and a screen reader
           reading a filename here would be noise. -->
      <img :src="image" alt="" aria-hidden="true" class="absolute inset-0 -z-10 size-full object-cover">
      <div class="absolute inset-0 -z-10 bg-linear-to-r from-panel from-35% via-panel/90 via-70% to-panel/45" />
    </template>
    <slot />
  </header>
</template>
