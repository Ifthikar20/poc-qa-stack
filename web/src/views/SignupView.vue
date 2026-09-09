<script setup>
/**
 * Sign up (docs/AUTH.md §4). One email, one password, and — in open mode,
 * when the control plane has a Turnstile key — the widget.
 *
 * Whatever the address, the answer is "check your mail": an address that
 * already has an account, or one nobody invited, is told by mail and not
 * by this page, because this page can be read by anyone with a list of
 * addresses. The only refusal said out loud is a domain rule, which is
 * public policy.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import AuthShell from '@/components/AuthShell.vue';
import Field from '@/components/Field.vue';
import PasswordField from '@/components/PasswordField.vue';
import Btn from '@/components/Btn.vue';
import Turnstile from '@/components/Turnstile.vue';

const session = useSession();
const router = useRouter();
const route = useRoute();

const email = ref(String(route.query.email ?? ''));
const password = ref('');
const busy = ref(false);
const turnstileToken = ref('');
const widget = ref(null);

const askTurnstile = computed(() => session.config.signup === 'open' && Boolean(session.config.turnstile));
const blurb = computed(() => ({
  invite: 'Sign-up is by invitation: use the address the invitation was sent to.',
  domain: `Sign up with your ${session.config.domains.map((d) => `@${d}`).join(' or ')} address.`,
  open: 'A real browser, driven by you, against your own applications.',
}[session.config.signup] ?? ''));

onMounted(() => { session.error = ''; });

async function submit() {
  busy.value = true;
  try {
    const outcome = await session.signup(email.value, password.value, turnstileToken.value || undefined);
    if (outcome === 'verify_email') return void router.replace({ name: 'verify', query: route.query.next ? { next: route.query.next } : {} });
    if (outcome === 'ok') return void router.replace('/suites');
    widget.value?.reset();
  } finally { busy.value = false; }
}
</script>

<template>
  <AuthShell title="Create an account" :blurb="blurb">
    <form class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
      <Field label="Email">
        <input v-model="email" type="email" autocomplete="username" required autofocus spellcheck="false"
               placeholder="you@company.com">
      </Field>
      <PasswordField v-model="password" autocomplete="new-password"
                     hint="At least 15 characters. A few words with spaces is a good one." />

      <Turnstile v-if="askTurnstile" ref="widget" :site-key="session.config.turnstile" @token="turnstileToken = $event" />

      <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">
        {{ session.error }}
      </p>

      <Btn type="submit" :busy="busy" busy-label="Creating…"
           :disabled="!email || !password || (askTurnstile && !turnstileToken)" class="w-full justify-center">
        Continue
      </Btn>
    </form>

    <template #foot>
      A six-digit code goes to that address; nothing exists until it is entered.
      Already have an account? <RouterLink :to="{ name: 'login' }" class="text-brand-2 underline">Sign in</RouterLink>.
    </template>
  </AuthShell>
</template>
