<script setup>
/**
 * Pass/fail, never by colour alone.
 *
 * The glyph does the work: green and red separate by only ΔE 4.1 under
 * deuteranopia, so a coloured dot on its own tells a red-green colourblind
 * reader nothing. Shape first, word second, colour third.
 */
defineProps({
  ok: { type: Boolean, default: null },
  label: { type: String, default: null },
  size: { type: String, default: 'md' },   // 'sm' in dense tables
});
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full font-medium"
    :class="[
      size === 'sm' ? 'px-2 py-0.5 text-[11.5px]' : 'px-2.5 py-1 text-[12.5px]',
      ok === null ? 'bg-ink/5 text-ink-2'
        : ok ? 'bg-good/10 text-good' : 'bg-critical/10 text-critical',
    ]">
    <svg v-if="ok === true" viewBox="0 0 16 16" class="size-3.5 shrink-0" fill="none"
         stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 8.5l3.2 3.2L13 5" />
    </svg>
    <svg v-else-if="ok === false" viewBox="0 0 16 16" class="size-3.5 shrink-0" fill="none"
         stroke="currentColor" stroke-width="2.1" stroke-linecap="round">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </svg>
    <span v-else class="size-1.5 rounded-full bg-current opacity-50" />
    {{ label ?? (ok === null ? 'Not run' : ok ? 'Passed' : 'Failed') }}
  </span>
</template>
