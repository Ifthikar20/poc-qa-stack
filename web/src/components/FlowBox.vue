<script setup>
/**
 * A flow script. Monospace, editable when the parent wants it, and never
 * rendered as a diagram here — the diagram is mermaid's job and it lives in the
 * console, where there is room for it.
 */
defineProps({ modelValue: String, rows: { type: Number, default: 10 }, readonly: Boolean });
defineEmits(['update:modelValue']);
</script>

<template>
  <textarea
    :value="modelValue"
    :rows="rows"
    :readonly="readonly"
    spellcheck="false"
    @input="$emit('update:modelValue', $event.target.value)"
    class="w-full rounded-xl border border-hairline bg-ground px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink outline-none focus:border-ink/25"
    :class="readonly && 'text-ink-2'" />
</template>
