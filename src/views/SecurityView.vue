<script setup>
/**
 * The account's own settings, inside the app shell: what you sign in as,
 * the password, the Google identities that open the account, and — once
 * the mfa step lands — authenticators and sessions. A placeholder for that
 * last part, on purpose: the page exists so the changes that are built have
 * somewhere to be reached from, and so the later ones have a home that is
 * already in the sidebar.
 *
 * Connected accounts (docs/AUTH.md §6): the list is allauth's, a connect is
 * the GoogleButton's form POST (it leaves the page and comes back here,
 * with ?error= when it did not work), and a disconnect wants a recent proof
 * of the password — the control plane answers `reauthenticate` when the
 * sign-in is older than 300 s, and the page asks for the password first.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import TopBar from '@/components/TopBar.vue';
import PasswordField from '@/components/PasswordField.vue';
import Btn from '@/components/Btn.vue';
import GoogleButton from '@/components/GoogleButton.vue';
import ProviderError from '@/components/ProviderError.vue';

const session = useSession();
const route = useRoute();
const router = useRouter();

const accounts = ref([]);
const busy = ref('');            // the uid being disconnected
const needsPassword = ref('');   // the uid a reauthentication is for
const password = ref('');

const providerError = computed(() => String(route.query.error ?? ''));
const dismissError = () => router.replace({ name: 'security' });

async function load() {
  if (session.config.google) accounts.value = await session.providers();
}

async function disconnect(account) {
  busy.value = account.uid;
  session.error = '';
  try {
    if (needsPassword.value === account.uid) {
      if (await session.reauthenticate(password.value) !== 'ok') return;
      needsPassword.value = '';
      password.value = '';
    }
    const outcome = await session.disconnectProvider(account.provider.id, account.uid);
    if (outcome === 'reauthenticate') { needsPassword.value = account.uid; return; }
    if (outcome === 'ok') await load();
  } finally { busy.value = ''; }
}

onMounted(load);
</script>

<template>
  <TopBar :crumbs="[{ label: 'Security' }]" />

  <div class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="display mb-1 text-3xl">Security</h1>
    <p class="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink-2">
      How you prove who you are. Every change here is mailed to the account, and a password change
      signs every session out.
    </p>

    <ProviderError v-if="providerError" :error="providerError" process="connect" class="!mt-0 mb-4" @dismiss="dismissError" />

    <section class="card mb-4 flex items-center justify-between gap-4 p-5">
      <div>
        <h2 class="text-[15px] font-medium">Email address</h2>
        <p class="mt-1 text-[13px] text-ink-2">You sign in as <span class="font-mono text-[12.5px]">{{ session.user?.email }}</span>.</p>
      </div>
      <RouterLink :to="{ name: 'security-email' }"
                  class="rounded-full border border-hairline px-4 py-2 text-[13px] font-medium hover:border-ink/25">Change</RouterLink>
    </section>

    <section class="card mb-4 flex items-center justify-between gap-4 p-5">
      <div>
        <h2 class="text-[15px] font-medium">Password</h2>
        <p class="mt-1 text-[13px] text-ink-2">At least fifteen characters, never one a breach has seen.</p>
      </div>
      <RouterLink :to="{ name: 'security-password' }"
                  class="rounded-full border border-hairline px-4 py-2 text-[13px] font-medium hover:border-ink/25">Change</RouterLink>
    </section>

    <section v-if="session.config.google" class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Connected accounts</h2>
      <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-2">
        A Google account connected here signs you in as this account. Connecting one is the only
        way a Google sign-in ever attaches to an existing account; a matching address alone is not.
      </p>

      <ul v-if="accounts.length" class="mt-4 divide-y divide-hairline">
        <li v-for="a in accounts" :key="a.uid" class="py-3">
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-[13.5px] font-medium">{{ a.provider.name }}</p>
              <p class="truncate font-mono text-[12px] text-ink-3" :title="a.uid">{{ a.display }}</p>
            </div>
            <Btn variant="danger" size="sm" :busy="busy === a.uid" busy-label="Disconnecting…"
                 :disabled="needsPassword === a.uid && !password" @click="disconnect(a)">
              {{ needsPassword === a.uid ? 'Confirm and disconnect' : 'Disconnect' }}
            </Btn>
          </div>
          <PasswordField v-if="needsPassword === a.uid" v-model="password" class="mt-3"
                         label="Your password, to confirm it is you" autocomplete="current-password" />
        </li>
      </ul>
      <p v-else class="mt-3 text-[13px] text-ink-3">No Google account is connected.</p>

      <p v-if="session.error" class="mt-3 rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>

      <div class="mt-4 max-w-xs">
        <GoogleButton process="connect" label="Connect a Google account" />
      </div>
    </section>

    <section class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Two-factor authentication</h2>
      <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Authenticator apps, recovery codes and passkeys are the next step of the build. Until then the
        account signs in with its password alone, and the control plane says when the policy demands more.
      </p>
      <p class="mt-2 text-[12.5px] text-ink-3">
        Required for this account: <strong>{{ session.mfa.required ? 'yes' : 'no' }}</strong> ·
        enrolled: <strong>{{ session.mfa.enrolled ? 'yes' : 'no' }}</strong>
        <template v-if="session.mfa.required && !session.mfa.enrolled">
          — an account that signs in only with Google must enrol one once enrolment exists.
        </template>
      </p>
    </section>

    <section class="card p-5">
      <h2 class="text-[15px] font-medium">Sessions</h2>
      <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-2">
        A session ends after twelve idle hours or seven days, whichever comes first. A list of the
        others, and a way to end one, comes with two-factor authentication.
      </p>
    </section>
  </div>
</template>
