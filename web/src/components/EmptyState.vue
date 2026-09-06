<script setup>
/**
 * Nothing here yet, said in a way that does not read as a failure.
 *
 * The tray is line art at 10% weight — enough to mark the space as deliberately
 * empty rather than broken, not enough to compete with the sentence telling you
 * what to do next. The slot is for that next step, which is the only reason
 * this component exists rather than a paragraph.
 */
defineProps({ title: String, body: String });
</script>

<template>
  <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline
              bg-panel px-6 py-12 text-center">
    <svg viewBox="0 0 64 44" class="mb-4 h-11 w-16 text-ink-3/45" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 27.5 12 6.5h40l8 21" />
      <path d="M4 27.5h15l3 6h20l3-6h15v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    </svg>
    <p class="text-[15px] font-medium">{{ title }}</p>
    <p v-if="body" class="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-2">{{ body }}</p>
    <div class="mt-4"><slot /></div>
  </div>
</template>
