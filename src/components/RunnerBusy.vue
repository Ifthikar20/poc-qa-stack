<script setup>
/**
 * Another organisation has the browser (docs/AUTH.md §10).
 *
 * There is one Chromium, and the runner records who is driving it. While
 * that is somebody else the runner refuses every path to the page with 409
 * runner_busy and sends this socket no frames — so the honest thing to draw
 * is a notice, not a black canvas. The runner tells the room when the lock
 * lets go, and the notice goes with it.
 */
import { useLive } from '@/stores/live';
defineProps({ compact: Boolean });
const live = useLive();
</script>

<template>
  <span v-if="compact && live.busy"
        class="flex items-center gap-2 rounded-full border border-warn/30 bg-warn/10 px-3 py-1.5 text-[12.5px] font-medium text-warn"
        :title="`${live.driving.org} is driving the runner`">
    <span class="size-1.5 rounded-full bg-warn" /> Runner busy
  </span>
  <div v-else-if="live.busy" class="card wash-warm p-4">
    <p class="text-[13.5px] font-medium">The runner is busy — <span class="font-mono">{{ live.driving.org }}</span> is driving it.</p>
    <p class="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-2">
      There is one browser, and it shows one organisation's page at a time. Nothing of theirs
      reaches this screen. You can open a page as soon as their run has finished and they have
      been quiet for a minute; this notice goes away by itself.
    </p>
  </div>
</template>
