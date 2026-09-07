<script setup>
/**
 * The one page that renders when nobody is signed in.
 *
 * It is deliberately outside the app shell — no sidebar, no suites, no console
 * — because every one of those needs the runner, and the runner will refuse.
 * Showing the chrome around a page that cannot load anything is how a login
 * screen ends up looking like a broken dashboard.
 *
 * Only reachable when VITE_AUTH_URL names a control plane. Without one there is
 * nothing to sign in to and the router never sends you here.
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';

const session = useSession();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const busy = ref(false);

onMounted(() => { session.error = ''; });

async function submit() {
  busy.value = true;
  try {
    if (await session.login(email.value, password.value)) {
      // Back to where they were headed before the guard intervened, so a
      // pasted link to a suite still lands on that suite.
      router.replace(route.query.next || '/suites');
    }
  } finally { busy.value = false; }
}
</script>

<template>
  <div class="grid min-h-dvh place-items-center px-6 py-12">
    <div class="w-full max-w-sm">
      <p class="eyebrow">ghostclick</p>
      <h1 class="display mt-2 text-3xl">Sign in</h1>
      <p class="mt-2 text-[13.5px] leading-relaxed text-ink-3">
        Runs drive a real browser against your own applications, so they happen as someone.
      </p>

      <form class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
        <Field label="Email">
          <input v-model="email" type="email" autocomplete="username" required
                 autofocus spellcheck="false" placeholder="you@company.com">
        </Field>
        <Field label="Password">
          <input v-model="password" type="password" autocomplete="current-password" required>
        </Field>

        <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">
          {{ session.error }}
        </p>

        <Btn type="submit" :busy="busy" busy-label="Signing in…"
             :disabled="!email || !password" class="w-full justify-center">
          Sign in
        </Btn>
      </form>

      <p class="mt-4 text-[12.5px] leading-relaxed text-ink-3">
        Accounts are managed in the control plane's admin. There is no self-service sign-up —
        this drives browsers against internal systems, so who has an account is a decision
        someone makes.
      </p>
    </div>
  </div>
</template>
