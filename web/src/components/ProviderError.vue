<script setup>
/**
 * What a Google sign-in that did not work looks like (docs/AUTH.md §6.2).
 *
 * The control plane answers every refusal with the same word in the
 * callback — `?error=refused` — and keeps the real reason for its audit
 * log, because the reason is a fact about somebody's account: the address
 * exists, or is not verified, or already has another Google identity, or
 * was not invited [credentials-3]. So this shows one sentence, whatever
 * happened, and the way back. A cancel is the person's own doing and is
 * said plainly; it says nothing about any account.
 *
 * `process` is the one the browser itself asked for, so it is safe to
 * word the sentence for it: a refused connect is not a refused sign-in.
 */
defineProps({
  error: { type: String, default: '' },
  process: { type: String, default: 'login' },
});
defineEmits(['dismiss']);

// The sentence the spec chose; auth/accounts/tests/test_google.py pins it.
const REFUSED = 'We could not sign you in with Google. Sign in the way you usually do, then connect Google from Settings.';
const REFUSED_CONNECT = 'We could not connect that Google account to this one.';
const CANCELLED = 'The Google sign-in was cancelled before it finished.';
</script>

<template>
  <div class="card mt-6 p-6" role="alert">
    <p class="text-[15px] font-medium">
      {{ error === 'cancelled' ? 'Nothing changed' : (process === 'connect' ? 'Google was not connected' : 'Google did not sign you in') }}
    </p>
    <p class="mt-2 text-[13.5px] leading-relaxed text-ink-2">
      {{ error === 'cancelled' ? CANCELLED : (process === 'connect' ? REFUSED_CONNECT : REFUSED) }}
    </p>
    <button type="button" class="mt-4 text-[13px] text-brand underline hover:text-brand-2" @click="$emit('dismiss')">
      {{ process === 'connect' ? 'Back to security' : 'Sign in another way' }}
    </button>
  </div>
</template>
