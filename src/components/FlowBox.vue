<script setup>
/**
 * A flow script. Monospace, editable when the parent wants it, and never
 * rendered as a diagram here — the diagram is mermaid's job and it lives in the
 * console, where there is room for it.
 *
 * Read-only, it is FlowRead: the steps in order, coloured by what they do, with
 * the raw text one switch away, and a Read switch shows the same while editing.
 *
 * Editable, it is coloured as you type — and still a plain textarea, so the
 * caret, selection, undo and paste are the browser's own. The colour is a copy
 * of the text drawn in a <pre> underneath, with the textarea's own glyphs made
 * transparent. Nothing about typing is re-implemented, so nothing about typing
 * can lag or drop a key. It was a bare textarea until now for fear of exactly
 * that, and a black-and-white script beside a coloured recording read as two
 * different languages.
 */
import { computed, ref } from 'vue';
import FlowRead from '@/components/FlowRead.vue';
import FlowLegend from '@/components/FlowLegend.vue';
import { readFlow } from '@/readflow';
import { paintHtml } from '@/flowcolors';

const props = defineProps({ modelValue: String, rows: { type: Number, default: 10 }, readonly: Boolean });
defineEmits(['update:modelValue']);

const reading = ref(false);
const read = computed(() => readFlow(props.modelValue));
const painted = computed(() => paintHtml(read.value.lines));

/**
 * Every metric that places a glyph, shared by the text and its colour: font,
 * size, line height, padding, tab width — and no wrapping, since a long line
 * would break at a slightly different place in each box and put every line
 * after it out of step.
 */
const METRICS = 'px-3.5 py-3 font-mono text-[12.5px] leading-relaxed whitespace-pre [overflow-wrap:normal] [tab-size:4]';

/**
 * The colour is moved with the text, not scrolled. A scrolled <pre> stops at
 * the end of its own content while the textarea goes on by the width of its
 * scrollbars, so at the bottom of a long recording the colour sat most of a
 * line above the words it belonged to. A transform has no end to stop at.
 */
const under = ref(null);
function follow(e) {
  if (under.value) under.value.style.transform = `translate(${-e.target.scrollLeft}px, ${-e.target.scrollTop}px)`;
}
</script>

<template>
  <FlowRead v-if="readonly" :flow="modelValue" :rows="rows" />
  <div v-else>
    <div class="mb-1.5 flex justify-end">
      <div class="flex overflow-hidden rounded-full border border-hairline text-[12px]" role="group" aria-label="Show the script as">
        <button v-for="[on, label] in [[false, 'Edit'], [true, 'Read']]" :key="label" type="button" class="px-2.5 py-0.5"
                :class="reading === on ? 'bg-brand-50 font-medium text-brand-2' : 'text-ink-3 hover:bg-ink/[0.04]'"
                :aria-pressed="reading === on" @click="reading = on">{{ label }}</button>
      </div>
    </div>
    <FlowRead v-if="reading" :flow="modelValue" :rows="rows" />
    <div v-else class="overflow-hidden rounded-xl border border-hairline bg-ground focus-within:border-ink/25">
      <div class="relative">
        <div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden">
          <pre ref="under" :class="METRICS" class="m-0 overflow-visible text-ink-2" v-html="painted" />
        </div>
        <textarea
          :value="modelValue"
          :rows="rows"
          wrap="off"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          :class="METRICS"
          class="relative block w-full resize-y bg-transparent text-transparent caret-ink outline-none selection:bg-brand/20 selection:text-transparent"
          @input="$emit('update:modelValue', $event.target.value)"
          @scroll="follow" />
      </div>
      <FlowLegend :read="read" class="border-t border-hairline bg-panel" />
    </div>
  </div>
</template>
