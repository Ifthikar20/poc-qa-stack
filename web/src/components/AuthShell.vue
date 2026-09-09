<script setup>
/**
 * The frame every account page shares: sign in, sign up, the code, the
 * reset, the changes. Deliberately outside the app shell — no sidebar, no
 * suites, no console — because every one of those needs the runner, and a
 * runner that refuses. Chrome around a page that cannot load anything is
 * how a login screen ends up looking like a broken dashboard.
 */
defineProps({ title: { type: String, required: true }, blurb: { type: String, default: '' }, wide: Boolean });
</script>

<template>
  <div class="grid min-h-dvh place-items-center px-6 py-12">
    <div class="w-full" :class="wide ? 'max-w-md' : 'max-w-sm'">
      <p class="eyebrow">ghostclick</p>
      <h1 class="display mt-2 text-3xl">{{ title }}</h1>
      <p v-if="blurb" class="mt-2 text-[13.5px] leading-relaxed text-ink-3">{{ blurb }}</p>
      <slot />
      <p v-if="$slots.foot" class="mt-4 text-[12.5px] leading-relaxed text-ink-3"><slot name="foot" /></p>
    </div>
  </div>
</template>
