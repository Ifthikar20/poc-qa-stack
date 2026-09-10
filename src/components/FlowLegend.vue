<script setup>
/**
 * What the colours mean — for the case in front of you, so only the verbs and
 * kinds of text it actually uses, and the key is never longer than the case.
 */
import { computed } from 'vue';
import { KEY, TONE } from '@/flowcolors';

const props = defineProps({ read: { type: Object, required: true } });

const COLOUR = {
  ...TONE,
  link: 'text-code-link underline decoration-code-link/40 underline-offset-2',
  value: 'text-code-value',
  vault: 'text-code-vault',
};

const used = computed(() => {
  const seen = new Set(props.read.steps.map((s) => s.tone));
  for (const l of props.read.lines) {
    for (const tk of l.tokens) {
      if (tk.c.startsWith('link')) seen.add('link');
      else if (tk.c === 'value' || tk.c === 'vault' || TONE[tk.c]) seen.add(tk.c);
    }
  }
  return KEY.filter(([k]) => seen.has(k));
});
</script>

<template>
  <p v-if="used.length" class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3.5 py-1.5 text-[11px]">
    <span class="text-ink-3">Colours</span>
    <span v-for="[k, label] in used" :key="k" class="font-mono" :class="COLOUR[k]">{{ label }}</span>
  </p>
</template>
