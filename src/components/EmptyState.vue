<script setup>
defineProps({ title: String, body: String });
</script>

<template>
  <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline px-6 py-12 text-center">
    <p class="text-[15px] font-medium">{{ title }}</p>
    <p v-if="body" class="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-2">{{ body }}</p>
    <div class="mt-4"><slot /></div>
  </div>
</template>
