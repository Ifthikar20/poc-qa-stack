<script setup>
/**
 * The six-digit code (docs/AUTH.md §4).
 *
 * Two arrivals: a sign-up (not signed in yet — entering the code IS the
 * sign-in, and the invitation, if any, becomes a membership at that
 * moment) and an email change (signed in — the code proves the new
 * address, and the old one is told). Three wrong codes end the attempt and
 * the control plane says so; a code that never arrived can be asked for
 * again, a few times, ten seconds apart.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import AuthShell from '@/components/AuthShell.vue';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';

const session = useSession();
const router = useRouter();
const route = useRoute();

const code = ref('');
const busy = ref(false);
const sent = ref(false);
const changing = computed(() => session.user !== null);

onMounted(() => { session.error = ''; });

function nextPath() {
  const n = String(route.query.next ?? '');
  return n.startsWith('/') && !n.startsWith('//') ? n : '/suites';
}

async function submit() {
  busy.value = true;
  try {
    const outcome = await session.verify(code.value.replace(/\s+/g, ''));
    if (outcome === 'ok') return void router.replace(changing.value ? { name: 'security' } : nextPath());
    if (outcome === 'mfa_authenticate') return void router.replace({ name: 'security-mfa' });
    if (outcome === 'anonymous' || session.flow === null) {
      // Three wrong codes, or a reload after the attempt ended: start over.
      if (!changing.value) return void router.replace({ name: 'signup' });
    }
    code.value = '';
  } finally { busy.value = false; }
}

async function resend() {
  sent.value = await session.resendCode();
}
</script>

<template>
  <AuthShell :title="changing ? 'Confirm the new address' : 'Check your email'"
             :blurb="`A six-digit code was sent to ${session.pendingEmail || 'that address'}. Enter it here.`">
    <form class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
      <Field label="Code">
        <input v-model="code" inputmode="numeric" pattern="[0-9 ]*" autocomplete="one-time-code" required autofocus
               maxlength="7" placeholder="123456" class="font-mono text-lg tracking-[0.3em]">
      </Field>

      <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">
        {{ session.error }}
      </p>
      <p v-else-if="sent" class="rounded-lg bg-good/10 px-3 py-2 text-[12.5px] text-good">Another code is on its way.</p>

      <Btn type="submit" :busy="busy" busy-label="Checking…" :disabled="code.replace(/\s+/g, '').length !== 6"
           class="w-full justify-center">
        {{ changing ? 'Confirm' : 'Verify and sign in' }}
      </Btn>
      <button type="button" class="w-full text-center text-[12.5px] text-ink-3 underline hover:text-ink" @click="resend">
        Send another code
      </button>
    </form>

    <template #foot>
      <template v-if="!changing">
        Wrong address? <RouterLink :to="{ name: 'signup' }" class="text-brand-2 underline">Start again</RouterLink>.
      </template>
      <template v-else>
        Changed your mind? <RouterLink :to="{ name: 'security' }" class="text-brand-2 underline">Back to security</RouterLink>.
      </template>
    </template>
  </AuthShell>
</template>
