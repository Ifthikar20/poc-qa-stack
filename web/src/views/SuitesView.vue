<script setup>
import { onMounted } from 'vue';
import { useSuites } from '@/stores/suites';
import TopBar from '@/components/TopBar.vue';
import EmptyState from '@/components/EmptyState.vue';

const store = useSuites();
onMounted(() => store.loadList());
</script>

<template>
  <TopBar :crumbs="[{ label: 'Test suites' }]">
    <template #actions>
      <RouterLink to="/suites/new" class="rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-white">
        Onboard a project
      </RouterLink>
    </template>
  </TopBar>

  <div class="mx-auto max-w-5xl px-6 py-8">
    <header class="card wash mb-6 p-7">
      <p class="eyebrow">Test suites</p>
      <h1 class="mt-1.5 display text-4xl">One suite per thing you own.</h1>
      <p class="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
        A suite holds a project's pages, what has to be true on each, and the cases recorded
        against them. Onboarding one takes about a minute.
      </p>
    </header>

    <EmptyState v-if="!store.list.length" title="No suites yet"
                body="Onboard a project and ghostclick will scan its pages, so the expectations you set come from what is actually there.">
      <RouterLink to="/suites/new" class="rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-white">
        Onboard a project
      </RouterLink>
    </EmptyState>

    <div v-else class="grid gap-4 sm:grid-cols-2">
      <RouterLink v-for="s in store.list" :key="s.id" :to="`/suites/${s.id}`"
                  class="card p-5 transition hover:border-ink/25">
        <p class="text-[15px] font-medium">{{ s.name }}</p>
        <p class="mt-0.5 truncate font-mono text-[12px] text-ink-3">{{ s.origin }}</p>
        <p v-if="s.description" class="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{{ s.description }}</p>
        <p class="mt-4 flex gap-4 text-[12.5px] text-ink-2">
          <span><b class="font-medium text-ink">{{ s.pages }}</b> page{{ s.pages === 1 ? '' : 's' }}</span>
          <span><b class="font-medium text-ink">{{ s.cases }}</b> case{{ s.cases === 1 ? '' : 's' }}</span>
        </p>
      </RouterLink>
    </div>
  </div>
</template>
