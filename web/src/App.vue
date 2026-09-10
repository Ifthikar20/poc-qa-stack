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

// The account pages get no shell: sign in, the second factor, sign up, the
// code, the reset, the invitation landing, the two changes, and the page an
// account is sent to when it must enrol an authenticator first. Every item
// in that sidebar needs the runner, and the runner will refuse — a nav full
// of things that 401 is a broken dashboard, not a sign-in screen.
const BARE = ['landing', 'login', 'mfa', 'signup', 'verify', 'forgot-password', 'reset-password', 'invite',
              'security-password', 'security-email', 'security-mfa'];
// `route.name` is undefined until the router has matched something, and
// `BARE.includes(undefined)` is false — so an unresolved route used to read as
// "not a bare page" and drew the whole dashboard. main.js does not mount until
// the first navigation resolves, which is the real fix; this makes the shell
// structurally impossible to draw on a route that does not exist yet, so a
// later change to how the app mounts cannot quietly bring the flash back.
const shell = computed(() => !!route.name && !BARE.includes(route.name));

/**
 * Nothing reaches the runner until there is someone to reach it as.
 *
 * This used to run on mount. With a control plane in front, mounting happens on
 * the login page too — so the socket would open, be refused, and retry every
 * 1200ms for as long as it takes to type a password, and the first suite fetch
 * would 401 before anyone had done anything wrong.
 */
watch(() => [session.signedIn, session.mustChangePassword, session.mfa.required && !session.mfa.enrolled], ([yes, locked, unenrolled]) => {
  // Signed out — by a button, or by the control plane saying the session is
  // over — means the socket goes too, so nobody stays attached to the
  // browser as a person who has left. A session that may only change its
  // password, or must enrol an authenticator first, is not attached
  // either: the control plane would refuse the token, and every refusal
  // would route back to the same page.
  if (!yes || locked || unenrolled) return void live.disconnect();
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
