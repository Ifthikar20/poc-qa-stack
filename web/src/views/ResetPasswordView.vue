<script setup>
/**
 * The reset link lands here with the key in the path (docs/AUTH.md §7).
 * A new password, once; the control plane ends every session the account
 * had and does not start one here — the person signs in with the new
 * password, and whatever second factor the account holds still applies.
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import AuthShell from '@/components/AuthShell.vue';
import PasswordField from '@/components/PasswordField.vue';
import Btn from '@/components/Btn.vue';

const session = useSession();
const route = useRoute();
const router = useRouter();

const password = ref('');
const busy = ref(false);
const done = ref(false);

onMounted(() => { session.error = ''; });

async function submit() {
  busy.value = true;
  try {
    const outcome = await session.resetPassword(String(route.params.key ?? ''), password.value);
    if (outcome === 'ok') done.value = true;
  } finally { busy.value = false; }
}
</script>

<template>
  <AuthShell title="Choose a new password"
             blurb="This link works once and for an hour. Every session the account has is ended when the password changes.">
    <div v-if="done" class="card mt-6 p-6 text-[13.5px] leading-relaxed text-ink-2">
      <p class="font-medium text-ink">Done.</p>
      <p class="mt-1">The password is changed and every session was signed out. Sign in with the new one.</p>
      <Btn class="mt-4 w-full justify-center" @click="router.replace({ name: 'login' })">Sign in</Btn>
    </div>
    <form v-else class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
      <PasswordField v-model="password" label="New password" autocomplete="new-password"
                     hint="At least 15 characters. A few words with spaces is a good one." />
      <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>
      <Btn type="submit" :busy="busy" busy-label="Changing…" :disabled="!password" class="w-full justify-center">Change the password</Btn>
    </form>
    <template #foot>
      Link expired? <RouterLink :to="{ name: 'forgot-password' }" class="text-brand-2 underline">Ask for another</RouterLink>.
    </template>
  </AuthShell>
</template>
