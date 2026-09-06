<script setup>
defineProps({ label: String, hint: String, error: String });
</script>

<template>
  <label class="block">
    <span class="mb-1.5 block text-[13px] font-medium">{{ label }}</span>
    <slot />
    <span v-if="error" class="mt-1.5 block text-[12.5px] text-critical">{{ error }}</span>
    <span v-else-if="hint" class="mt-1.5 block text-[12.5px] text-ink-3">{{ hint }}</span>
  </label>
</template>

<style scoped>
:slotted(input), :slotted(textarea), :slotted(select) {
  width: 100%;
  border: 1px solid var(--color-hairline);
  border-radius: 10px;
  background: var(--color-panel);
  padding: 8px 11px;
  font: inherit;
  font-size: 13.5px;
  color: var(--color-ink);
}
:slotted(textarea) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.55; }
:slotted(input:disabled), :slotted(textarea:disabled), :slotted(select:disabled) {
  opacity: 0.55; cursor: not-allowed;
}
:slotted(input:focus), :slotted(textarea:focus), :slotted(select:focus) {
  outline: none; border-color: color-mix(in oklab, var(--color-ink) 30%, transparent);
}
</style>
