<script setup>
/**
 * One password field with a reveal toggle.
 *
 * One, not two: "type it again" catches a typo you can no longer see, and
 * the reveal lets you see it. Paste is allowed — a password manager is the
 * best thing that can happen to this field, and blocking paste only stops
 * the people who use one. No strength meter: the control plane's validators
 * decide (fifteen characters, not in a breach, not your own name), and a
 * meter that disagrees with them is theatre.
 */
import { ref } from 'vue';
import Field from '@/components/Field.vue';

defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: 'Password' },
  autocomplete: { type: String, default: 'current-password' },
  hint: { type: String, default: '' },
});
defineEmits(['update:modelValue']);
const shown = ref(false);
</script>

<template>
  <Field :label="label" :hint="hint">
    <div class="relative">
      <input :value="modelValue" :type="shown ? 'text' : 'password'" :autocomplete="autocomplete" required
             spellcheck="false" class="pr-16"
             @input="$emit('update:modelValue', $event.target.value)">
      <button type="button" class="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-[12px] text-ink-3 hover:text-ink"
              :aria-pressed="shown" @click="shown = !shown">{{ shown ? 'Hide' : 'Show' }}</button>
    </div>
  </Field>
</template>
