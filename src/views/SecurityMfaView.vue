<script setup>
/**
 * Where a 403 mfa_required lands (docs/AUTH.md §5.4, §9.8).
 *
 * A placeholder, on purpose. The control plane's MFA policy middleware — the
 * mfa step of the build order — refuses every request from an account that
 * must hold an authenticator and does not, except the enrolment endpoints and
 * this page's data. Until that step brings TOTP, recovery codes and passkeys,
 * this page can only say why you are here and how to get out: the runner
 * cannot be reached from this account until an authenticator exists.
 */
import { useRouter } from 'vue-router';
import { useSession } from '@/stores/session';

const session = useSession();
const router = useRouter();

async function signOut() {
  await session.logout();
  router.replace({ name: 'login' });
}
</script>

<template>
  <div class="grid min-h-dvh place-items-center px-6 py-12">
    <div class="w-full max-w-md">
      <p class="eyebrow">ghostclick</p>
      <h1 class="display mt-2 text-3xl">Two-factor authentication is required</h1>
      <p class="mt-3 text-[13.5px] leading-relaxed text-ink-3">
        This account has to hold an authenticator before it can drive a browser —
        because it is staff, manages an organisation, is on a plan that demands it,
        or signs in without a password. The control plane refuses everything else
        until one is enrolled.
      </p>
      <div class="card mt-6 p-6 text-[13.5px] leading-relaxed text-ink-3">
        <p>
          Enrolment is not in this build yet. An administrator can adjust the policy in the
          control plane's admin; otherwise, sign out and sign in with an account that does
          not require it.
        </p>
        <button type="button" class="mt-4 text-brand underline" @click="signOut">Sign out</button>
      </div>
    </div>
  </div>
</template>
