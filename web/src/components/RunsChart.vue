<script setup>
/**
 * Runs per day, stacked.
 *
 * Neutral for passes, critical for failures, and every day that had a failure
 * carries a direct "N failed" label — so the number never depends on being able
 * to separate the two fills. A 2px surface gap between segments keeps the
 * boundary readable when the bar is short.
 */
import { computed, ref } from 'vue';

const props = defineProps({ days: { type: Array, default: () => [] } });
const hover = ref(null);

const W = 720, H = 220, PAD = { l: 34, r: 12, t: 26, b: 26 };
const max = computed(() => Math.max(4, ...props.days.map((d) => d.passed + d.failed)));
const ticks = computed(() => {
  const m = max.value, step = Math.max(1, Math.ceil(m / 4));
  return Array.from({ length: Math.floor(m / step) + 1 }, (_, i) => i * step);
});
const plotH = H - PAD.t - PAD.b;
const plotW = W - PAD.l - PAD.r;
const band = computed(() => plotW / Math.max(1, props.days.length));
const barW = computed(() => Math.min(26, band.value * 0.56));
const y = (v) => PAD.t + plotH - (v / max.value) * plotH;
const x = (i) => PAD.l + i * band.value + (band.value - barW.value) / 2;

const fmt = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
// Every other day, so labels never collide at 14 columns.
const labelled = (i) => i % 2 === 0;
</script>

<template>
  <div class="relative">
    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" aria-label="Runs per day, passed and failed">
      <g :stroke="'var(--color-hairline)'" stroke-width="1">
        <line v-for="t in ticks" :key="t" :x1="PAD.l" :x2="W - PAD.r" :y1="y(t)" :y2="y(t)" />
      </g>
      <g fill="var(--color-ink-3)" font-size="11" text-anchor="end">
        <text v-for="t in ticks" :key="t" :x="PAD.l - 8" :y="y(t) + 4">{{ t }}</text>
      </g>

      <g v-for="(d, i) in days" :key="d.day">
        <!-- Hit target spans the whole band, not just the bar. -->
        <rect :x="PAD.l + i * band" :y="PAD.t" :width="band" :height="plotH"
              fill="transparent" @mouseenter="hover = i" @mouseleave="hover = null" />
        <rect v-if="d.failed" :x="x(i)" :y="y(d.failed)" :width="barW"
              :height="Math.max(2, plotH - (y(d.failed) - PAD.t))"
              rx="3" fill="var(--color-fail)" />
        <rect v-if="d.passed" :x="x(i)" :y="y(d.passed + d.failed)" :width="barW"
              :height="Math.max(2, y(d.failed) - y(d.passed + d.failed) - 2)"
              rx="3" fill="var(--color-pass)" />
        <text v-if="d.failed" :x="x(i) + barW / 2" :y="y(d.passed + d.failed) - 7"
              text-anchor="middle" font-size="11" font-weight="600" fill="var(--color-critical)">
          {{ d.failed }} failed
        </text>
      </g>

      <g fill="var(--color-ink-3)" font-size="11" text-anchor="middle">
        <text v-for="(d, i) in days" :key="d.day" v-show="labelled(i)"
              :x="PAD.l + i * band + band / 2" :y="H - 8">{{ fmt(d.day) }}</text>
      </g>
    </svg>

    <div v-if="hover !== null && days[hover]"
         class="pointer-events-none absolute top-2 right-2 rounded-lg border border-hairline bg-panel px-3 py-2 text-[12.5px] shadow-sm">
      <p class="font-medium">{{ fmt(days[hover].day) }}</p>
      <p class="mt-0.5 text-ink-2">{{ days[hover].passed }} passed · {{ days[hover].failed }} failed</p>
    </div>
  </div>
</template>
