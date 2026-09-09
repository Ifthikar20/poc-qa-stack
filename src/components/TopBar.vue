<script setup>
import { useLive } from '@/stores/live';
import RunnerBusy from '@/components/RunnerBusy.vue';
defineProps({ crumbs: { type: Array, default: () => [] } });
const live = useLive();
</script>

<template>
  <header class="sticky top-0 z-10 flex items-center gap-3 border-b border-hairline bg-ground/80 px-6 py-3.5 backdrop-blur">
    <nav class="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-3">
      <template v-for="(c, i) in crumbs" :key="i">
        <span v-if="i" aria-hidden="true">/</span>
        <RouterLink v-if="c.to" :to="c.to" class="truncate hover:text-ink">{{ c.label }}</RouterLink>
        <span v-else class="truncate font-medium text-ink">{{ c.label }}</span>
      </template>
    </nav>

    <div class="ml-auto flex items-center gap-2">
      <RunnerBusy compact />
      <span v-if="live.running"
            class="flex items-center gap-2 rounded-full border border-brand/20 bg-brand-50 px-3 py-1.5
                   text-[12.5px] font-medium text-brand-2">
        <span class="size-1.5 animate-pulse rounded-full bg-brand" /> Running
      </span>
      <slot name="actions" />
    </div>
  </header>
</template>
