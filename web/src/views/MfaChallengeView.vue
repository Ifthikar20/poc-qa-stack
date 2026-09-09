<script setup>
/**
 * The second factor, after the password (docs/AUTH.md §5).
 *
 * The password was right and the control plane answered "mfa_authenticate
 * is pending" with the kinds it will take: a code from the authenticator
 * app or a recovery code, and a passkey when one is enrolled. Nothing here
 * is signed in yet — /auth/me is a 401 until the code lands — which is why
 * this page has no shell around it.
 *
 * Six wrong codes in five minutes end the attempt whatever address they
 * came from; the control plane says so, and the page starts over.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { safeNext, useSession } from '@/stores/session';
import { passkeysAvailable } from '@/webauthn';
import AuthShell from '@/components/AuthShell.vue';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';

const session = useSession();
const router = useRouter();
const route = useRoute();

const code = ref('');
const busy = ref(false);
const hasPasskey = computed(() => session.mfaTypes.includes('webauthn') && passkeysAvailable());
const hasCode = computed(() => session.mfaTypes.includes('totp') || session.mfaTypes.includes('recovery_codes'));

onMounted(() => { session.error = ''; });

const nextPath = () => safeNext(route.query.next) || '/suites';

async function landed(outcome) {
  if (outcome === 'ok') return void router.replace(nextPath());
  if (outcome === 'anonymous') {
    // Too many wrong codes, or the pending sign-in expired: start again.
    session.error = session.error || 'Sign in again.';
    return void router.replace({ name: 'login' });
  }
  code.value = '';
}

async function submit() {
  busy.value = true;
  try { await landed(await session.authenticateCode(code.value.replace(/\s+/g, ''))); }
  finally { busy.value = false; }
}

async function passkey() {
  busy.value = true;
  try { await landed(await session.authenticatePasskey()); }
  finally { busy.value = false; }
}

async function startOver() {
  await session.logout();
  router.replace({ name: 'login' });
}
</script>

<template>
  <AuthShell title="One more step" :blurb="`Signing in as ${session.pendingEmail || 'this account'} needs the second factor it holds.`">
    <form v-if="hasCode" class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
      <Field label="Code" hint="From your authenticator app — or one of your recovery codes.">
        <input v-model="code" inputmode="numeric" autocomplete="one-time-code" required autofocus
               placeholder="123456" class="font-mono text-lg tracking-[0.3em]">
      </Field>
      <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>
      <Btn type="submit" :busy="busy" busy-label="Checking…" :disabled="code.replace(/\s+/g, '').length < 6" class="w-full justify-center">
        Sign in
      </Btn>
      <template v-if="hasPasskey">
        <p class="flex items-center gap-3 text-[11.5px] uppercase tracking-wide text-ink-3">
          <span class="h-px flex-1 bg-hairline" />or<span class="h-px flex-1 bg-hairline" />
        </p>
        <Btn variant="ghost" :busy="busy" busy-label="Waiting for the passkey…" class="w-full justify-center" @click="passkey">Use a passkey</Btn>
      </template>
    </form>
    <div v-else class="card mt-6 space-y-4 p-6">
      <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>
      <Btn v-if="hasPasskey" :busy="busy" busy-label="Waiting for the passkey…" class="w-full justify-center" @click="passkey">Use a passkey</Btn>
      <p v-else class="text-[13px] text-ink-3">This account's second factor cannot be used on this device.</p>
    </div>
    <template #foot>
      Not you, or no access to the factor?
      <button type="button" class="text-brand-2 underline" @click="startOver">Start over</button>.
    </template>
  </AuthShell>
</template>
