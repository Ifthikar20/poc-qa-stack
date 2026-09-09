<script setup>
/**
 * Where the link in an invitation mail lands: /app/invite?token=…
 *
 * Signed in as the invited address, the token is presented and the session
 * switches to the new organisation. Not signed in, the page offers the two
 * ways in — sign in, or sign up with that address — and comes back here
 * afterwards. A sign-up that verifies the invited address has already
 * become a member by the time it returns (docs/AUTH.md §4.2), and the
 * control plane treats the token presented again by the same person as a
 * double click rather than a refusal.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import AuthShell from '@/components/AuthShell.vue';
import Btn from '@/components/Btn.vue';

const session = useSession();
const route = useRoute();
const router = useRouter();

const token = computed(() => String(route.query.token ?? ''));
const busy = ref(false);
const here = computed(() => `/invite?token=${encodeURIComponent(token.value)}`);

async function accept() {
  busy.value = true;
  try {
    if (await session.acceptInvitation(token.value)) router.replace('/suites');
  } finally { busy.value = false; }
}

onMounted(() => { session.error = ''; if (session.user && token.value) accept(); });
</script>

<template>
  <AuthShell title="You have been invited"
             :blurb="session.user ? `Accepting as ${session.user.email}…` : 'Sign in, or sign up with the address the invitation was sent to, and you will be brought back here.'">
    <div class="card mt-6 space-y-3 p-6">
      <p v-if="!token" class="text-[13.5px] text-ink-2">This link is missing its token. Open the one from the email.</p>
      <template v-else-if="session.user">
        <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>
        <Btn :busy="busy" busy-label="Accepting…" class="w-full justify-center" @click="accept">Accept the invitation</Btn>
        <p class="text-[12.5px] text-ink-3">
          Invited under a different address? Sign out and sign in as that one.
        </p>
      </template>
      <template v-else>
        <Btn class="w-full justify-center" @click="router.push({ name: 'login', query: { next: here } })">Sign in</Btn>
        <Btn variant="ghost" class="w-full justify-center" @click="router.push({ name: 'signup', query: { next: here } })">Sign up</Btn>
      </template>
    </div>
  </AuthShell>
</template>
