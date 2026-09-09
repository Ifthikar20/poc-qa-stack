<script setup>
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import SideNav from '@/components/SideNav.vue';
import { useLive } from '@/stores/live';
import { useSuites } from '@/stores/suites';
import { useSession } from '@/stores/session';

const live = useLive();
const suites = useSuites();
const session = useSession();
const route = useRoute();

// The login page gets no shell, and neither does the page an account is sent
// to when it must enrol an authenticator first. Every item in that sidebar
// needs the runner, and the runner will refuse — a nav full of things that
// 401 is a broken dashboard, not a sign-in screen.
const shell = computed(() => !['login', 'security-mfa'].includes(route.name));

/**
 * Nothing reaches the runner until there is someone to reach it as.
 *
 * This used to run on mount. With a control plane in front, mounting happens on
 * the login page too — so the socket would open, be refused, and retry every
 * 1200ms for as long as it takes to type a password, and the first suite fetch
 * would 401 before anyone had done anything wrong.
 */
watch(() => session.signedIn, (yes) => {
  // Signed out — by a button, or by the control plane saying the session is
  // over — means the socket goes too, so nobody stays attached to the
  // browser as a person who has left.
  if (!yes) return void live.disconnect();
  live.connect();
  suites.loadList();
}, { immediate: true });

// The sidebar shows case counts, so it has to notice when a suite gains one.
watch(() => route.fullPath, () => {
  if (session.signedIn && !route.path.startsWith('/console')) suites.loadList();
});
</script>

<template>
  <div v-if="shell" class="flex h-screen overflow-hidden">
    <SideNav />
    <main class="flex-1 overflow-y-auto">
      <RouterView />
    </main>
  </div>
  <RouterView v-else />
</template>
