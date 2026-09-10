<script setup>
/**
 * The moving colour behind a product mock.
 *
 * The page this landing is modelled on frames every mock with a watercolour
 * video. Those clips run to tens of megabytes, and the runner serves this app
 * under a CSP that allows nothing from another origin — so the effect is drawn
 * instead: four soft blobs drifting on the compositor, a grain tile, and a tint
 * that decides how loud the colour is allowed to be under whatever sits on it.
 *
 * Only `transform` animates, and only while the well is near the viewport, so a
 * page with five of these costs about what one would.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps({
  /** 0–3: which arrangement of hues. Neighbouring wells should not match. */
  variant: { type: Number, default: 0 },
  /** How much black sits over the colour, 0–1. Text straight on it wants more. */
  tint: { type: Number, default: 0.28 },
});

const root = ref(null);
const near = ref(false);
let observer = null;

onMounted(() => {
  observer = new IntersectionObserver(([e]) => { near.value = e.isIntersecting; }, { rootMargin: '160px 0px' });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="root" class="well" :class="[`v${variant % 4}`, { near }]" aria-hidden="true">
    <i class="blob b1" />
    <i class="blob b2" />
    <i class="blob b3" />
    <i class="blob b4" />
    <i class="grain" />
    <i class="tint" :style="{ opacity: tint }" />
  </div>
</template>

<style scoped>
.well {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  border-radius: inherit;
  background: #09090c;
}
.well > i { position: absolute; display: block; pointer-events: none; }

.blob {
  width: 78%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--c), transparent 74%);
  mix-blend-mode: screen;
  will-change: transform;
  animation: drift-a 24s ease-in-out infinite alternate;
  animation-play-state: paused;
}
.near .blob { animation-play-state: running; }

.b1 { --c: var(--c1); left: -18%; top: -26%; }
.b2 { --c: var(--c2); right: -22%; bottom: -30%; animation-name: drift-b; animation-duration: 29s; animation-delay: -7s; }
.b3 { --c: var(--c3); right: -10%; top: -34%; width: 64%; animation-name: drift-c; animation-duration: 33s; animation-delay: -13s; }
.b4 { --c: var(--c4); left: -12%; bottom: -36%; width: 66%; animation-name: drift-d; animation-duration: 37s; animation-delay: -19s; }

/* ghostclick's own glows and its magenta, saturated enough to survive a tint. */
.v0 { --c1: #e6007c; --c2: #ff9e6d; --c3: #9f8cff; --c4: #ffd3a8; }
.v1 { --c1: #8f7bff; --c2: #e6007c; --c3: #ffb38a; --c4: #6fc3ff; }
.v2 { --c1: #ff8a5c; --c2: #b18cff; --c3: #e6007c; --c4: #ffe0b8; }
.v3 { --c1: #6fc3ff; --c2: #ff9e6d; --c3: #e6007c; --c4: #a78bfa; }

/* A data: image, which the CSP's img-src allows; a fetched texture it would not. */
.grain {
  inset: 0;
  opacity: .14;
  mix-blend-mode: overlay;
  background-size: 180px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.6'/%3E%3C/svg%3E");
}
.tint { inset: 0; background: #000; }

@keyframes drift-a {
  0%   { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
  50%  { transform: translate3d(24%, 14%, 0) scale(1.18) rotate(28deg); }
  100% { transform: translate3d(8%, 30%, 0) scale(.94) rotate(52deg); }
}
@keyframes drift-b {
  0%   { transform: translate3d(0, 0, 0) scale(1.05); }
  50%  { transform: translate3d(-26%, -12%, 0) scale(.9); }
  100% { transform: translate3d(-10%, -30%, 0) scale(1.2); }
}
@keyframes drift-c {
  0%   { transform: translate3d(0, 0, 0) scale(.9); }
  50%  { transform: translate3d(-18%, 26%, 0) scale(1.15); }
  100% { transform: translate3d(-34%, 8%, 0) scale(1); }
}
@keyframes drift-d {
  0%   { transform: translate3d(0, 0, 0) scale(1); }
  50%  { transform: translate3d(28%, -20%, 0) scale(1.2); }
  100% { transform: translate3d(12%, -6%, 0) scale(.92); }
}

@media (prefers-reduced-motion: reduce) {
  .blob { animation: none; }
}
</style>
