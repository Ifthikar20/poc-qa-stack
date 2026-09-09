<script setup>
/**
 * The page that renders when nobody is signed in.
 *
 * Only reachable when VITE_AUTH_URL names a control plane. Without one there is
 * nothing to sign in to and the router never sends you here.
 *
 * A refused sign-in says one thing whether the address exists or not; the
 * control plane decides the words. Turnstile appears only when the control
 * plane asks — an address that has tripped the failed-login limit must solve
 * it for an hour (docs/AUTH.md §3) — so the widget is not on the page until
 * a refusal says `turnstile_required`.
 */
import { onMounted, ref } from 'vue';
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

const email = ref('');
const password = ref('');
const busy = ref(false);
const needsTurnstile = ref(false);
const turnstileToken = ref('');
const widget = ref(null);

onMounted(() => { session.error = ''; });

/** `?next=` is honoured only as a path inside this app — never another site. */
function nextPath() {
  const n = String(route.query.next ?? '');
  return n.startsWith('/') && !n.startsWith('//') ? n : '/suites';
}

async function submit() {
  busy.value = true;
  try {
    const outcome = await session.login(email.value, password.value, turnstileToken.value || undefined);
    if (outcome === 'ok') return void router.replace(nextPath());
    if (outcome === 'verify_email') return void router.replace({ name: 'verify', query: route.query.next ? { next: route.query.next } : {} });
    if (outcome === 'mfa_authenticate') return void router.replace({ name: 'security-mfa' });
    // A refusal naming Turnstile means this address must solve it now.
    if (session.config.turnstile && /^turnstile_/.test(session.errorCode)) needsTurnstile.value = true;
    widget.value?.reset();
  } finally { busy.value = false; }
}
</script>

<template>
  <AuthShell title="Sign in" blurb="Runs drive a real browser against your own applications, so they happen as someone.">
    <form class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
      <Field label="Email">
        <input v-model="email" type="email" autocomplete="username" required
               autofocus spellcheck="false" placeholder="you@company.com">
      </Field>
      <PasswordField v-model="password" autocomplete="current-password" />
      <p class="-mt-2 text-right text-[12.5px]">
        <RouterLink :to="{ name: 'forgot-password' }" class="text-ink-3 underline hover:text-ink">Forgot your password?</RouterLink>
      </p>

      <Turnstile v-if="needsTurnstile && session.config.turnstile" ref="widget"
                 :site-key="session.config.turnstile" @token="turnstileToken = $event" />

      <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">
        {{ session.error }}
      </p>

      <Btn type="submit" :busy="busy" busy-label="Signing in…"
           :disabled="!email || !password || (needsTurnstile && !turnstileToken)" class="w-full justify-center">
        Sign in
      </Btn>
    </form>

    <template #foot>
      <template v-if="session.config.signup === 'invite'">
        Accounts are by invitation. Have one?
        <RouterLink :to="{ name: 'signup' }" class="text-brand-2 underline">Sign up with the invited address</RouterLink>.
      </template>
      <template v-else>
        No account yet?
        <RouterLink :to="{ name: 'signup' }" class="text-brand-2 underline">Sign up</RouterLink>.
      </template>
    </template>
  </AuthShell>
</template>
