<script setup>
/**
 * Change the password (docs/AUTH.md §7). The current one is the
 * reauthentication. On success the control plane ends this session and
 * every other one the account has — so the page's last act is to send you
 * to sign in again, which is the point rather than a bug.
 *
 * Also where a sign-in lands when the password it used is in a breach
 * corpus (§3): the control plane refuses everything else until it changes,
 * and the page says so.
 *
 * For an account that holds an authenticator the current password is not
 * enough (§7.2): the control plane asks for the second factor first, the
 * sheet proves it, and the change is tried again.
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import { useGuarded } from '@/composables/reauth';
import AuthShell from '@/components/AuthShell.vue';
import PasswordField from '@/components/PasswordField.vue';
import Btn from '@/components/Btn.vue';
import ReauthSheet from '@/components/ReauthSheet.vue';

const session = useSession();
const router = useRouter();
const guard = useGuarded();

const current = ref('');
const next = ref('');
const busy = ref(false);
const done = ref(false);

onMounted(() => { session.error = ''; });

async function attempt(run) {
  busy.value = true;
  try {
    const outcome = await run();
    if (outcome === 'ok') done.value = true;
  } finally { busy.value = false; }
}

const submit = () => attempt(() => guard.run(() => session.changePassword(current.value, next.value)));
const proved = () => attempt(() => guard.proved());

async function signOut() {
  await session.logout();
  router.replace({ name: 'login' });
}
</script>

<template>
  <AuthShell title="Change your password"
             :blurb="session.mustChangePassword
               ? 'The password you signed in with appears in a public breach. Nothing else is possible until it is changed.'
               : 'Every session the account has is signed out when it changes, this one included.'">
    <div v-if="done" class="card mt-6 p-6 text-[13.5px] leading-relaxed text-ink-2">
      <p class="font-medium text-ink">Changed.</p>
      <p class="mt-1">Every session was signed out. Sign in with the new password.</p>
      <Btn class="mt-4 w-full justify-center" @click="router.replace({ name: 'login' })">Sign in</Btn>
    </div>
    <form v-else class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
      <PasswordField v-model="current" label="Current password" autocomplete="current-password" />
      <PasswordField v-model="next" label="New password" autocomplete="new-password"
                     hint="At least 15 characters, not one a breach has seen." />
      <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>
      <Btn type="submit" :busy="busy" busy-label="Changing…" :disabled="!current || !next" class="w-full justify-center">
        Change the password
      </Btn>
    </form>
    <template #foot>
      <template v-if="session.mustChangePassword">
        Or <button type="button" class="text-brand-2 underline" @click="signOut">sign out</button>.
      </template>
      <template v-else>
        <RouterLink :to="{ name: 'security' }" class="text-brand-2 underline">Back to security</RouterLink>.
      </template>
    </template>
    <ReauthSheet v-if="guard.flow.value" :flow="guard.flow.value" @done="proved" @cancel="guard.cancel()" />
  </AuthShell>
</template>
