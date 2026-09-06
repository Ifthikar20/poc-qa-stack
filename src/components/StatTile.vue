<script setup>
defineProps({ label: String, value: [String, Number], note: String });
</script>

<template>
  <div class="card px-5 py-4">
    <p class="eyebrow">{{ label }}</p>
    <p class="mt-1.5 display text-3xl tabular-nums">{{ value }}</p>
    <p v-if="note" class="mt-1 text-[13px] text-ink-3">{{ note }}</p>
  </div>
</template>
