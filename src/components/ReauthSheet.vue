<script setup>
/**
 * "Prove it is you." The control plane asks before a sensitive change
 * when the last proof is older than five minutes (docs/AUTH.md §7), and it
 * says which proof it will take: the password for an account that has
 * nothing stronger, and ONLY the second factor for one that holds an
 * authenticator — the password is refused outright for those, so it is not
 * even offered here [mfa-recovery-2].
 *
 * The sheet proves; the view that opened it retries (composables/reauth.js).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useSession } from '@/stores/session';
import { passkeysAvailable } from '@/webauthn';
import PasswordField from '@/components/PasswordField.vue';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';

const props = defineProps({ flow: { type: String, required: true } });   // 'reauthenticate' | 'mfa_reauthenticate'
const emit = defineEmits(['done', 'cancel', 'switch']);

// The outcomes that mean "a different proof, not a wrong answer".
const WANTS_PROOF = new Set(['reauthenticate', 'mfa_reauthenticate']);

const session = useSession();
const password = ref('');
const code = ref('');
const busy = ref(false);
const error = ref('');

const strong = computed(() => props.flow === 'mfa_reauthenticate');
const types = ref(session.reauthTypes ?? []);
const hasCode = computed(() => types.value.includes('totp') || types.value.includes('recovery_codes'));
const hasPasskey = computed(() => types.value.includes('webauthn') && passkeysAvailable());

async function learnTypes() {
  // A refusal from the control plane names the kinds it will take; a
  // step-up from the runner names nothing, so ask what the account holds.
  if (!strong.value) return;
  types.value = session.reauthTypes?.length
    ? session.reauthTypes
    : (await session.authenticators()).map((a) => a.type);
}
onMounted(async () => {
  session.error = '';
  await learnTypes();
});
// The flow can change under this sheet — see the note in composables/reauth.js
// — and when it does, what the account can prove with has to be re-read.
watch(() => props.flow, async () => { error.value = ''; await learnTypes(); });

async function finish(outcome) {
  if (outcome === 'ok') { error.value = ''; emit('done'); return; }
  if (WANTS_PROOF.has(outcome) && outcome !== props.flow) {
    // Not a rejection: the control plane wants a different proof than this
    // sheet offered. Saying "that was not accepted" about a correct password
    // is the one answer that leaves the person stuck.
    error.value = '';
    emit('switch', outcome);
    return;
  }
  error.value = session.error || 'That was not accepted';
}

async function withPassword() {
  busy.value = true;
  try { await finish(await session.reauthenticate(password.value)); } finally { busy.value = false; }
}
async function withCode() {
  busy.value = true;
  try { await finish(await session.reauthenticateCode(code.value.replace(/\s+/g, ''))); } finally { busy.value = false; }
}
async function withPasskey() {
  busy.value = true;
  try { await finish(await session.reauthenticatePasskey()); } finally { busy.value = false; }
}
</script>

<template>
  <div class="fixed inset-0 z-30 grid place-items-center bg-ink/40 px-6" @click.self="emit('cancel')">
    <div class="card w-full max-w-sm p-6" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
      <h2 id="reauth-title" class="text-[16px] font-medium">Confirm it is you</h2>
      <p class="mt-1 text-[13px] leading-relaxed text-ink-2">
        <template v-if="strong">This change needs your second factor — the password is not enough for an account that has one.</template>
        <template v-else>This change needs your password again: the last time you proved it was a while ago.</template>
      </p>

      <form v-if="!strong" class="mt-4 space-y-3" @submit.prevent="withPassword">
        <PasswordField v-model="password" label="Password" autocomplete="current-password" />
        <p v-if="error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <Btn variant="ghost" @click="emit('cancel')">Cancel</Btn>
          <Btn type="submit" :busy="busy" busy-label="Checking…" :disabled="!password">Confirm</Btn>
        </div>
      </form>

      <div v-else class="mt-4 space-y-4">
        <form v-if="hasCode" class="space-y-3" @submit.prevent="withCode">
          <Field label="Code from your authenticator app, or a recovery code">
            <input v-model="code" inputmode="numeric" autocomplete="one-time-code" required autofocus
                   placeholder="123456" class="font-mono text-lg tracking-[0.25em]">
          </Field>
          <p v-if="error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ error }}</p>
          <div class="flex justify-end gap-2">
            <Btn variant="ghost" @click="emit('cancel')">Cancel</Btn>
            <Btn type="submit" :busy="busy" busy-label="Checking…" :disabled="code.replace(/\s+/g, '').length < 6">Confirm</Btn>
          </div>
        </form>
        <div v-if="hasPasskey" class="space-y-3">
          <p v-if="hasCode" class="flex items-center gap-3 text-[11.5px] uppercase tracking-wide text-ink-3">
            <span class="h-px flex-1 bg-hairline" />or<span class="h-px flex-1 bg-hairline" />
          </p>
          <p v-if="error && !hasCode" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ error }}</p>
          <div class="flex justify-end gap-2">
            <Btn v-if="!hasCode" variant="ghost" @click="emit('cancel')">Cancel</Btn>
            <Btn :variant="hasCode ? 'ghost' : 'primary'" :busy="busy" busy-label="Waiting for the passkey…" @click="withPasskey">Use a passkey</Btn>
          </div>
        </div>
        <p v-if="!hasCode && !hasPasskey" class="text-[12.5px] text-ink-3">
          This account's second factor cannot be used on this device.
          <button type="button" class="text-brand-2 underline" @click="emit('cancel')">Close</button>
        </p>
      </div>
    </div>
  </div>
</template>
