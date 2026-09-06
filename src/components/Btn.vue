<script setup>
/**
 * A button that admits it is doing something.
 *
 * Half the actions here take seconds — a suite run drives a real browser — and
 * a button that looks identical while it works is indistinguishable from one
 * that is broken. So: press feedback on the way down, a spinner and a changed
 * label while it runs, and disabled throughout so a second click cannot queue a
 * second run.
 *
 * `busy` is a boolean the caller owns, not something inferred from the click,
 * because the caller is the only thing that knows when the work is finished.
 */
defineProps({
  busy: Boolean,
  disabled: Boolean,
  busyLabel: { type: String, default: null },
  variant: { type: String, default: 'primary' },   // primary | ghost | danger
  size: { type: String, default: 'md' },           // sm | md
});

/**
 * Primary is the accent; danger stays red and stays an outline. Two warm hues
 * would be confusable as fills, so the shapes differ as well as the colours —
 * you are never deciding between a pink block and a red block.
 */
const LOOK = {
  primary: 'bg-brand text-white hover:bg-brand-2',
  ghost:   'border border-hairline bg-panel text-ink hover:border-ink/25 hover:bg-ink/[0.03]',
  danger:  'border border-critical/40 bg-panel text-critical hover:bg-critical/5',
};
const SIZE = { sm: 'px-3 py-1.5 text-[12.5px]', md: 'px-4 py-2 text-[13px]' };
</script>

<template>
  <button
    type="button"
    :disabled="busy || disabled"
    class="inline-flex items-center justify-center gap-2 rounded-full font-medium
           transition-[transform,background-color,border-color,opacity] duration-75
           active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100
           disabled:border-hairline disabled:bg-ink/[0.05] disabled:text-ink-3"
    :class="[LOOK[variant], SIZE[size]]">
    <svg v-if="busy" class="size-3.5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
    <span><slot v-if="!busy || !busyLabel" />{{ busy && busyLabel ? busyLabel : '' }}</span>
  </button>
</template>
