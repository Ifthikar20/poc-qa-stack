<script setup>
/**
 * The account's own settings, inside the app shell: what you sign in as,
 * the password, the Google identities that open the account, the second
 * factor, and the sessions.
 *
 * Every change on this page is sensitive, and the control plane may ask
 * for a fresh proof before any of them — the password for an account that
 * has nothing stronger, and only the second factor for one that holds an
 * authenticator (docs/AUTH.md §7.2). One guard (composables/reauth.js) and
 * one sheet serve all of them; a change that was refused for want of a
 * proof is retried the moment the sheet says done.
 *
 * Connected accounts (docs/AUTH.md §6): the list is allauth's, a connect is
 * the GoogleButton's form POST (it leaves the page and comes back here,
 * with ?error= when it did not work).
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import { useGuarded } from '@/composables/reauth';
import { passkeysAvailable } from '@/webauthn';
import TopBar from '@/components/TopBar.vue';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';
import GoogleButton from '@/components/GoogleButton.vue';
import ProviderError from '@/components/ProviderError.vue';
import ReauthSheet from '@/components/ReauthSheet.vue';

const session = useSession();
const route = useRoute();
const router = useRouter();
const guard = useGuarded();

const accounts = ref([]);
const authenticators = ref([]);
const busy = ref('');                 // what is in flight: 'disconnect:<uid>', 'totp', 'passkey', 'passkey:<id>', 'codes'
const passkeyName = ref('');
const addingPasskey = ref(false);
const freshCodes = ref(null);         // recovery codes just regenerated, shown once

const providerError = computed(() => String(route.query.error ?? ''));
const dismissError = () => router.replace({ name: 'security' });

const totp = computed(() => authenticators.value.find((a) => a.type === 'totp'));
const passkeys = computed(() => authenticators.value.filter((a) => a.type === 'webauthn'));
const codes = computed(() => authenticators.value.find((a) => a.type === 'recovery_codes'));
const when = (t) => (t ? new Date(t * 1000).toLocaleDateString() : 'never');

async function load() {
  if (session.config.google) accounts.value = await session.providers();
  authenticators.value = await session.authenticators();
}

/** Run a sensitive change through the guard, and reload the page's lists when it went through. */
async function change(key, action) {
  busy.value = key;
  session.error = '';
  try {
    const outcome = await guard.run(action);
    if (outcome === 'ok' || (outcome && typeof outcome === 'object')) await load();
    return outcome;
  } finally { busy.value = ''; }
}

const disconnect = (a) => change(`disconnect:${a.uid}`, () => session.disconnectProvider(a.provider.id, a.uid));
const removeTotp = () => change('totp', () => session.totpRemove());
const removePasskey = (p) => change(`passkey:${p.id}`, () => session.passkeyRemove(p.id));
async function addPasskey() {
  const outcome = await change('passkey', () => session.passkeyAdd(passkeyName.value || 'This device'));
  if (outcome === 'ok') { addingPasskey.value = false; passkeyName.value = ''; }
}
async function regenerate() {
  const outcome = await change('codes', () => session.recoveryCodes({ regenerate: true }));
  if (outcome && typeof outcome === 'object') freshCodes.value = outcome.codes;
}

/** The sheet proved it: whatever was waiting runs again, and the lists follow. */
async function proved() {
  const outcome = await guard.proved();
  if (outcome && typeof outcome === 'object' && outcome.codes) freshCodes.value = outcome.codes;
  if (outcome === 'ok' && addingPasskey.value) { addingPasskey.value = false; passkeyName.value = ''; }
  await load();
}

onMounted(load);
</script>

<template>
  <TopBar :crumbs="[{ label: 'Security' }]" />

  <div class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="display mb-1 text-3xl">Security</h1>
    <p class="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink-2">
      How you prove who you are. Every change here is mailed to the account, may ask you to confirm
      it is you first, and a password change signs every session out.
    </p>

    <ProviderError v-if="providerError" :error="providerError" process="connect" class="!mt-0 mb-4" @dismiss="dismissError" />
    <p v-if="session.error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ session.error }}</p>

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

    <!-- The second factor (docs/AUTH.md §5). -->
    <section class="card mb-4 p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-[15px] font-medium">Two-factor authentication</h2>
          <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-2">
            An authenticator app or a passkey, asked for at every sign-in and before every sensitive change.
            <template v-if="session.mfa.required"> This account is required to hold one.</template>
          </p>
        </div>
        <span class="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
              :class="session.mfa.enrolled ? 'bg-good/10 text-good' : 'bg-ink/[0.05] text-ink-3'">
          {{ session.mfa.enrolled ? 'on' : 'off' }}
        </span>
      </div>

      <ul class="mt-4 divide-y divide-hairline">
        <li class="flex items-center justify-between gap-4 py-3">
          <div>
            <p class="text-[13.5px] font-medium">Authenticator app</p>
            <p class="mt-0.5 text-[12.5px] text-ink-3">
              <template v-if="totp">Enrolled {{ when(totp.created_at) }} · last used {{ when(totp.last_used_at) }}</template>
              <template v-else>Six-digit codes from any TOTP app.</template>
            </p>
          </div>
          <Btn v-if="totp" variant="danger" size="sm" :busy="busy === 'totp'" busy-label="Removing…" @click="removeTotp">Remove</Btn>
          <RouterLink v-else :to="{ name: 'security-mfa' }"
                      class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px] font-medium hover:border-ink/25">Set up</RouterLink>
        </li>

        <li v-for="p in passkeys" :key="p.id" class="flex items-center justify-between gap-4 py-3">
          <div>
            <p class="text-[13.5px] font-medium">Passkey · {{ p.name }}</p>
            <p class="mt-0.5 text-[12.5px] text-ink-3">Added {{ when(p.created_at) }} · last used {{ when(p.last_used_at) }}<template v-if="p.is_passwordless"> · signs in on its own</template></p>
          </div>
          <Btn variant="danger" size="sm" :busy="busy === `passkey:${p.id}`" busy-label="Removing…" @click="removePasskey(p)">Remove</Btn>
        </li>

        <li v-if="passkeysAvailable()" class="py-3">
          <div v-if="!addingPasskey" class="flex items-center justify-between gap-4">
            <div>
              <p class="text-[13.5px] font-medium">{{ passkeys.length ? 'Another passkey' : 'Passkey' }}</p>
              <p class="mt-0.5 text-[12.5px] text-ink-3">This device's fingerprint, face or PIN, or a security key.</p>
            </div>
            <Btn variant="ghost" size="sm" @click="addingPasskey = true">Add</Btn>
          </div>
          <form v-else class="flex items-end gap-2" @submit.prevent="addPasskey">
            <Field label="A name for it" class="flex-1">
              <input v-model="passkeyName" maxlength="100" placeholder="Work laptop" autofocus>
            </Field>
            <Btn variant="ghost" size="md" class="mb-0.5" @click="addingPasskey = false">Cancel</Btn>
            <Btn type="submit" size="md" class="mb-0.5" :busy="busy === 'passkey'" busy-label="Waiting…">Create</Btn>
          </form>
        </li>

        <li v-if="codes" class="py-3">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-[13.5px] font-medium">Recovery codes</p>
              <p class="mt-0.5 text-[12.5px] text-ink-3">{{ codes.unused_code_count }} of {{ codes.total_code_count }} unused. Each signs you in once if you lose the authenticator.</p>
            </div>
            <Btn variant="ghost" size="sm" :busy="busy === 'codes'" busy-label="Generating…" @click="regenerate">Regenerate</Btn>
          </div>
          <div v-if="freshCodes" class="mt-3 rounded-lg bg-ground p-4">
            <p class="text-[12.5px] text-ink-2">Your new codes — shown <strong>now and never again</strong>. The old ones no longer work.</p>
            <ul class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[13px] tabular-nums">
              <li v-for="c in freshCodes" :key="c" class="select-all">{{ c }}</li>
            </ul>
            <button type="button" class="mt-3 text-[12.5px] text-brand-2 underline" @click="freshCodes = null">I have saved them</button>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="session.config.google" class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Connected accounts</h2>
      <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-2">
        A Google account connected here signs you in as this account. Connecting one is the only
        way a Google sign-in ever attaches to an existing account; a matching address alone is not.
      </p>

      <ul v-if="accounts.length" class="mt-4 divide-y divide-hairline">
        <li v-for="a in accounts" :key="a.uid" class="flex items-center justify-between gap-4 py-3">
          <div class="min-w-0">
            <p class="text-[13.5px] font-medium">{{ a.provider.name }}</p>
            <p class="truncate font-mono text-[12px] text-ink-3" :title="a.uid">{{ a.display }}</p>
          </div>
          <Btn variant="danger" size="sm" :busy="busy === `disconnect:${a.uid}`" busy-label="Disconnecting…" @click="disconnect(a)">Disconnect</Btn>
        </li>
      </ul>
      <p v-else class="mt-3 text-[13px] text-ink-3">No Google account is connected.</p>

      <div class="mt-4 max-w-xs">
        <GoogleButton process="connect" label="Connect a Google account" />
      </div>
    </section>

    <section class="card flex items-center justify-between gap-4 p-5">
      <div>
        <h2 class="text-[15px] font-medium">Sessions</h2>
        <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-2">
          Every browser signed in as you, where from and when — and a way to sign the others out.
        </p>
      </div>
      <RouterLink :to="{ name: 'security-sessions' }"
                  class="rounded-full border border-hairline px-4 py-2 text-[13px] font-medium hover:border-ink/25">See them</RouterLink>
    </section>
  </div>

  <ReauthSheet v-if="guard.flow.value" :flow="guard.flow.value" @done="proved" @cancel="guard.cancel()" />
</template>
