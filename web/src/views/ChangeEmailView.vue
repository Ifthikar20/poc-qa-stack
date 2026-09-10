<script setup>
/**
 * Change the sign-in address (docs/AUTH.md §7.3). A code goes to the new
 * address; the change is real only once it is entered. The old address is
 * told, and for seven days it can still ask for a password reset, so a
 * change the owner did not make can be undone from the mailbox they still
 * have.
 *
 * The control plane wants a recent proof before it starts (300 seconds):
 * the password for an account with nothing stronger, only the second
 * factor for one that holds an authenticator (§7.2). Either way the
 * answer is a reauthentication flow, the sheet proves it, and the change
 * is tried again.
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import { useGuarded } from '@/composables/reauth';
import AuthShell from '@/components/AuthShell.vue';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';
import ReauthSheet from '@/components/ReauthSheet.vue';

const session = useSession();
const router = useRouter();
const guard = useGuarded();

const email = ref('');
const busy = ref(false);

onMounted(() => { session.error = ''; });

async function attempt(run) {
  busy.value = true;
  try {
    const outcome = await run();
    if (outcome === 'ok') router.replace({ name: 'verify' });
  } finally { busy.value = false; }
}

const submit = () => attempt(() => guard.run(() => session.changeEmail(email.value)));
const proved = () => attempt(() => guard.proved());
</script>

<template>
  <AuthShell title="Change your email address"
             :blurb="`You sign in as ${session.user?.email ?? ''}. A code goes to the new address; the old one is told, and can undo this for seven days.`">
    <form class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
      <Field label="New email">
        <input v-model="email" type="email" autocomplete="email" required autofocus spellcheck="false"
               placeholder="you@company.com">
      </Field>
      <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>
      <Btn type="submit" :busy="busy" busy-label="Sending the code…" :disabled="!email" class="w-full justify-center">
        Send a code to the new address
      </Btn>
    </form>
    <template #foot>
      <RouterLink :to="{ name: 'security' }" class="text-brand-2 underline">Back to security</RouterLink>.
    </template>
    <ReauthSheet v-if="guard.flow.value" :flow="guard.flow.value" @done="proved" @switch="guard.switched" @cancel="guard.cancel()" />
  </AuthShell>
</template>
