<script setup>
/**
 * The account's own settings, inside the app shell: what you sign in as,
 * the password, and — once the mfa step lands — authenticators and
 * sessions. A placeholder for that last part, on purpose: the page exists
 * so the two changes that are built have somewhere to be reached from, and
 * so the later ones have a home that is already in the sidebar.
 */
import { useSession } from '@/stores/session';
import TopBar from '@/components/TopBar.vue';

const session = useSession();
</script>

<template>
  <TopBar :crumbs="[{ label: 'Security' }]" />

  <div class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="display mb-1 text-3xl">Security</h1>
    <p class="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink-2">
      How you prove who you are. Every change here is mailed to the account, and a password change
      signs every session out.
    </p>

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

    <section class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Two-factor authentication</h2>
      <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Authenticator apps, recovery codes and passkeys are the next step of the build. Until then the
        account signs in with its password alone, and the control plane says when the policy demands more.
      </p>
      <p class="mt-2 text-[12.5px] text-ink-3">
        Required for this account: <strong>{{ session.mfa.required ? 'yes' : 'no' }}</strong> ·
        enrolled: <strong>{{ session.mfa.enrolled ? 'yes' : 'no' }}</strong>
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
