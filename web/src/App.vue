<script setup>
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import SideNav from '@/components/SideNav.vue';
import { useLive } from '@/stores/live';
import { useSuites } from '@/stores/suites';

const live = useLive();
const suites = useSuites();
const route = useRoute();

onMounted(() => {
  live.connect();
  suites.loadList();
});

// The sidebar shows case counts, so it has to notice when a suite gains one.
watch(() => route.fullPath, () => { if (!route.path.startsWith('/console')) suites.loadList(); });
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <SideNav />
    <main class="flex-1 overflow-y-auto">
      <RouterView />
    </main>
  </div>
</template>
