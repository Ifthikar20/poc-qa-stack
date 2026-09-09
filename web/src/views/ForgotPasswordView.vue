<script setup>
/**
 * Ask for a reset link (docs/AUTH.md §7). The answer is the same whether
 * the address has an account or not — the difference is what arrives in
 * the mailbox — so the page says "if there is an account" and means it.
 * An address the account used until a week ago still works here, which is
 * how an email change is undone from the old mailbox.
 */
import { onMounted, ref } from 'vue';
import { useSession } from '@/stores/session';
import AuthShell from '@/components/AuthShell.vue';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';

const session = useSession();
const email = ref('');
const busy = ref(false);
const done = ref(false);

onMounted(() => { session.error = ''; });

async function submit() {
  busy.value = true;
  try { done.value = await session.requestReset(email.value); }
  finally { busy.value = false; }
}
</script>

<template>
  <AuthShell title="Reset your password"
             blurb="Enter the address you sign in with. If there is an account, a link that is good for one hour goes there.">
    <div v-if="done" class="card mt-6 p-6 text-[13.5px] leading-relaxed text-ink-2">
      <p class="font-medium text-ink">Check your email.</p>
      <p class="mt-1">If {{ email }} has an account, the link is on its way. It works once, and for an hour.</p>
      <p class="mt-3"><RouterLink :to="{ name: 'login' }" class="text-brand-2 underline">Back to sign in</RouterLink></p>
    </div>
    <form v-else class="card mt-6 space-y-4 p-6" @submit.prevent="submit">
      <Field label="Email">
        <input v-model="email" type="email" autocomplete="username" required autofocus spellcheck="false"
               placeholder="you@company.com">
      </Field>
      <p v-if="session.error" class="rounded-lg bg-critical/10 px-3 py-2 text-[12.5px] text-critical">{{ session.error }}</p>
      <Btn type="submit" :busy="busy" busy-label="Sending…" :disabled="!email" class="w-full justify-center">Send the link</Btn>
    </form>
    <template #foot>
      Remembered it? <RouterLink :to="{ name: 'login' }" class="text-brand-2 underline">Sign in</RouterLink>.
    </template>
  </AuthShell>
</template>
