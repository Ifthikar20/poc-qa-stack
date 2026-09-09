<script setup>
/**
 * Change the sign-in address (docs/AUTH.md §7.3). A code goes to the new
 * address; the change is real only once it is entered. The old address is
 * told, and for seven days it can still ask for a password reset, so a
 * change the owner did not make can be undone from the mailbox they still
 * have.
 *
 * The control plane wants a recent proof of the password before it starts
 * (300 seconds); when the sign-in is older than that it answers with a
 * `reauthenticate` flow and the page asks for the password first.
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import AuthShell from '@/components/AuthShell.vue';
import Field from '@/components/Field.vue';
import PasswordField from '@/components/PasswordField.vue';
import Btn from '@/components/Btn.vue';

const session = useSession();
const router = useRouter();

const email = ref('');
const password = ref('');
const needsPassword = ref(false);
const busy = ref(false);

onMounted(() => { session.error = ''; });

async function submit() {
  busy.value = true;
  try {
    if (needsPassword.value) {
      if (await session.reauthenticate(password.value) !== 'ok') return;
      needsPassword.value = false;
    }
    const outcome = await session.changeEmail(email.value);
    if (outcome === 'ok') return void router.replace({ name: 'verify' });
    if (outcome === 'reauthenticate') needsPassword.value = true;
  } finally { busy.value = false; }
}
</script>

<template>
  <AuthShell title="Change your email address"
             :blurb="`You sign in as ${session.user?.email ?? ''}. A code goes to the new address; the old one is told, and can undo this for seven days.`">
    <form class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
      <Field label="New email">
        <input v-model="email" type="email" autocomplete="email" required autofocus spellcheck="false"
               placeholder="you@company.com">
      </Field>
      <PasswordField v-if="needsPassword" v-model="password" label="Your password, to confirm it is you"
                     autocomplete="current-password" />
      <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>
      <Btn type="submit" :busy="busy" busy-label="Sending the code…"
           :disabled="!email || (needsPassword && !password)" class="w-full justify-center">
        Send a code to the new address
      </Btn>
    </form>
    <template #foot>
      <RouterLink :to="{ name: 'security' }" class="text-brand-2 underline">Back to security</RouterLink>.
    </template>
  </AuthShell>
</template>
