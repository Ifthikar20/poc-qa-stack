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
 *
 * Google is the same door as on the sign-in page: the control plane makes
 * the account when the identity is new and admitted by the same policy
 * this form is judged by, and a refusal comes back to /login with one
 * sentence (docs/AUTH.md §6).
 *
 * An operator can switch sign-up off for everyone (docs/HARDENING.md), and
 * then there is no form to fill: the page says so rather than taking an
 * address and a password it is going to refuse.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { safeNext, useSession } from '@/stores/session';
import AuthShell from '@/components/AuthShell.vue';
import Field from '@/components/Field.vue';
import PasswordField from '@/components/PasswordField.vue';
import Btn from '@/components/Btn.vue';
import Turnstile from '@/components/Turnstile.vue';
import GoogleButton from '@/components/GoogleButton.vue';

const session = useSession();
const router = useRouter();
const route = useRoute();

const email = ref(String(route.query.email ?? ''));
const password = ref('');
const busy = ref(false);
const turnstileToken = ref('');
const widget = ref(null);

const askTurnstile = computed(() => session.config.signup === 'open' && Boolean(session.config.turnstile));
const blurb = computed(() => (session.config.signupOff
  ? 'Sign-up is switched off on this deployment for now.'
  : {
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
    <div v-if="session.config.signupOff" class="card mt-6 p-6 text-[13.5px] leading-relaxed text-ink-2">
      No new accounts are being made right now. If you already have one, sign in as usual;
      if you were invited, the invitation will still be good when sign-up is back.
    </div>

    <form v-else class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
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

      <template v-if="session.config.google">
        <p class="flex items-center gap-3 text-[11.5px] uppercase tracking-wide text-ink-3">
          <span class="h-px flex-1 bg-hairline" />or<span class="h-px flex-1 bg-hairline" />
        </p>
        <GoogleButton process="login" :next="safeNext(route.query.next)" />
      </template>
    </form>

    <template #foot>
      <template v-if="!session.config.signupOff">A six-digit code goes to that address; nothing exists until it is entered.</template>
      Already have an account? <RouterLink :to="{ name: 'login' }" class="text-brand-2 underline">Sign in</RouterLink>.
    </template>
  </AuthShell>
</template>
