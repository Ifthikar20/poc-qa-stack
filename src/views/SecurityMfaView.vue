<script setup>
/**
 * Enrolling a second factor (docs/AUTH.md §5), and where a 403 mfa_required
 * lands (§5.4, §9.8).
 *
 * Two ways in. Staff, the managers of an organisation, members of a plan
 * that demands it and accounts that sign in without a password are sent
 * here by the control plane, which refuses them everything else until an
 * authenticator exists — so this page has no shell: every item in the
 * sidebar would 403. Anyone else arrives from Security to add a factor
 * they chose to have.
 *
 * The app: the control plane hands over a secret and a QR code of it, and
 * a code from the app proves it was scanned. Recovery codes are made
 * beside it and shown here, once, and never again by anyone — the page
 * says so before they are dismissed. A passkey: the browser's ceremony,
 * with user verification, which the control plane demands of every one.
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '@/stores/session';
import { useGuarded } from '@/composables/reauth';
import { passkeysAvailable } from '@/webauthn';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';
import ReauthSheet from '@/components/ReauthSheet.vue';

const session = useSession();
const router = useRouter();
const guard = useGuarded();

const step = ref('choose');        // choose | app | codes | passkey
const totp = ref(null);            // {secret, url, svg}
const code = ref('');
const codes = ref([]);
const passkeyName = ref('');
const busy = ref(false);
const savedCodes = ref(false);

const REASONS = {
  manages_organisation: 'it is an owner or admin of an organisation',
  plan: 'its organisation is on a plan that requires one',
  no_password: 'it signs in without a password',
};
const why = computed(() => {
  const words = (session.mfa.reasons ?? []).map((r) => REASONS[r]).filter(Boolean);
  if (words.length) return `because ${words.join(', and ')}`;
  return 'because the control plane’s policy names it';
});
const required = computed(() => session.mfa.required && !session.mfa.enrolled);

onMounted(() => { session.error = ''; });

async function startApp() {
  busy.value = true;
  try {
    const got = await guard.run(() => session.totpStart());
    if (got && typeof got === 'object') { totp.value = got; step.value = 'app'; }
  } finally { busy.value = false; }
}

async function activate() {
  busy.value = true;
  try {
    const outcome = await guard.run(() => session.totpActivate(code.value.replace(/\s+/g, '')));
    if (outcome !== 'ok') return;
    const got = await session.recoveryCodes();
    codes.value = got?.codes ?? [];
    step.value = 'codes';
  } finally { busy.value = false; }
}

async function addPasskey() {
  busy.value = true;
  try {
    const outcome = await guard.run(() => session.passkeyAdd(passkeyName.value || 'This device'));
    if (outcome === 'ok') {
      const got = await session.recoveryCodes();
      codes.value = got?.codes ?? [];
      step.value = 'codes';
    }
  } finally { busy.value = false; }
}

/** After the sheet proved it, run again whatever was waiting. */
async function proved() {
  busy.value = true;
  try {
    const outcome = await guard.proved();
    if (step.value === 'choose' && outcome && typeof outcome === 'object') { totp.value = outcome; step.value = 'app'; }
    if (outcome === 'ok') {
      const got = await session.recoveryCodes();
      codes.value = got?.codes ?? [];
      step.value = 'codes';
    }
  } finally { busy.value = false; }
}

const done = () => router.replace(required.value ? '/suites' : { name: 'security' });

async function signOut() {
  await session.logout();
  router.replace({ name: 'login' });
}
</script>

<template>
  <div class="grid min-h-dvh place-items-center px-6 py-12">
    <div class="w-full max-w-md">
      <p class="eyebrow">ghostclick</p>
      <h1 class="display mt-2 text-3xl">{{ required ? 'Two-factor authentication is required' : 'Add a second factor' }}</h1>
      <p class="mt-3 text-[13.5px] leading-relaxed text-ink-3">
        <template v-if="required">
          This account has to hold an authenticator before it can do anything else — {{ why }}.
          Set one up now; it takes a minute.
        </template>
        <template v-else>
          An authenticator app or a passkey, asked for at every sign-in and before every sensitive change.
        </template>
      </p>

      <!-- choose -->
      <div v-if="step === 'choose'" class="card mt-6 divide-y divide-hairline">
        <button type="button" class="flex w-full items-start gap-4 p-5 text-left hover:bg-ink/[0.02]" :disabled="busy" @click="startApp">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-2">
            <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="1.5" width="8" height="13" rx="1.5" /><path d="M7 12h2" /></svg>
          </span>
          <span>
            <span class="block text-[14px] font-medium">Authenticator app</span>
            <span class="mt-0.5 block text-[12.5px] text-ink-3">Any TOTP app — it shows a six-digit code that changes every thirty seconds.</span>
          </span>
        </button>
        <button v-if="passkeysAvailable()" type="button" class="flex w-full items-start gap-4 p-5 text-left hover:bg-ink/[0.02]" :disabled="busy" @click="step = 'passkey'">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-2">
            <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="6" cy="6" r="3.5" /><path d="M8.5 8.5 14 14M11.5 11.5l1.5-1.5M12.5 12.5 14 11" /></svg>
          </span>
          <span>
            <span class="block text-[14px] font-medium">Passkey</span>
            <span class="mt-0.5 block text-[12.5px] text-ink-3">This device's fingerprint, face or PIN, or a security key. Also signs in on its own.</span>
          </span>
        </button>
        <p v-if="session.error" class="p-4 text-[12.5px] text-critical">{{ session.error }}</p>
      </div>

      <!-- app -->
      <form v-else-if="step === 'app'" class="card mt-6 space-y-4 p-6" @submit.prevent="activate">
        <p class="text-[13px] leading-relaxed text-ink-2">Scan this with your authenticator app, then enter the code it shows.</p>
        <div class="mx-auto w-44 rounded-lg bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" v-html="totp?.svg" />
        <details class="text-[12.5px] text-ink-3">
          <summary class="cursor-pointer">Can't scan it?</summary>
          <p class="mt-1">Enter this key by hand: <code class="select-all break-all font-mono text-[12px] text-ink">{{ totp?.secret }}</code></p>
        </details>
        <Field label="Code from the app">
          <input v-model="code" inputmode="numeric" autocomplete="one-time-code" required autofocus
                 placeholder="123456" class="font-mono text-lg tracking-[0.3em]">
        </Field>
        <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>
        <div class="flex gap-2">
          <Btn variant="ghost" @click="step = 'choose'">Back</Btn>
          <Btn type="submit" :busy="busy" busy-label="Checking…" :disabled="code.replace(/\s+/g, '').length !== 6" class="flex-1 justify-center">Turn it on</Btn>
        </div>
      </form>

      <!-- passkey -->
      <form v-else-if="step === 'passkey'" class="card mt-6 space-y-4 p-6" @submit.prevent="addPasskey">
        <p class="text-[13px] leading-relaxed text-ink-2">
          Your browser will ask you to confirm with this device — a fingerprint, your face, a PIN, or a security key.
        </p>
        <Field label="A name for it" hint="So you can tell it apart later — 'Work laptop', 'Phone'.">
          <input v-model="passkeyName" maxlength="100" placeholder="This device" autofocus>
        </Field>
        <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>
        <div class="flex gap-2">
          <Btn variant="ghost" @click="step = 'choose'">Back</Btn>
          <Btn type="submit" :busy="busy" busy-label="Waiting for the device…" class="flex-1 justify-center">Create the passkey</Btn>
        </div>
      </form>

      <!-- recovery codes, once -->
      <div v-else-if="step === 'codes'" class="card mt-6 space-y-4 p-6">
        <div>
          <h2 class="text-[15px] font-medium">Your recovery codes</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-ink-2">
            Each one signs you in once if you lose the authenticator. They are shown <strong>now and never again</strong>
            — keep them somewhere that is not this device.
          </p>
        </div>
        <ul v-if="codes.length" class="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-ground p-4 font-mono text-[13px] tabular-nums">
          <li v-for="c in codes" :key="c" class="select-all">{{ c }}</li>
        </ul>
        <p v-else class="text-[12.5px] text-ink-3">The codes were already shown once. Regenerate them from Security if you need a fresh set.</p>
        <label v-if="codes.length" class="flex items-start gap-2 text-[13px]">
          <input v-model="savedCodes" type="checkbox" class="mt-0.5">
          <span>I have saved these codes.</span>
        </label>
        <Btn class="w-full justify-center" :disabled="codes.length > 0 && !savedCodes" @click="done">Continue</Btn>
      </div>

      <p class="mt-4 text-[12.5px] leading-relaxed text-ink-3">
        <template v-if="required">Or <button type="button" class="text-brand-2 underline" @click="signOut">sign out</button>.</template>
        <template v-else><RouterLink :to="{ name: 'security' }" class="text-brand-2 underline">Back to security</RouterLink>.</template>
      </p>
    </div>

    <ReauthSheet v-if="guard.flow.value" :flow="guard.flow.value" @done="proved" @switch="guard.switched" @cancel="guard.cancel()" />
  </div>
</template>
