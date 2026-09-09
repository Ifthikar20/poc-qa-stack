<script setup>
/**
 * "Continue with Google" (docs/AUTH.md §6).
 *
 * A form, not a fetch. The control plane answers the redirect endpoint with
 * a 302 to Google, and a browser follows a redirect to another site only on
 * a navigation — so pressing this leaves the page, and the CSRF token goes
 * along as a form field rather than a header. The session cookie goes too:
 * same site, top-level POST, which is exactly what SameSite=Lax permits.
 *
 * The callback is hard-coded to this origin — /app/login for a sign-in,
 * /app/security for a connect — and the control plane checks it against
 * its own idea of the app's origin, not against a list of allowed hosts
 * [oauth-4]. A `?next=` survives the round trip only as a path inside the
 * app (safeNext); anything else is dropped here and would be refused there.
 * Rendered only when /auth/config says a Google client exists.
 */
import { computed } from 'vue';
import { authUrl } from '@/config';
import { PROVIDER_REDIRECT, safeNext, useSession } from '@/stores/session';

const props = defineProps({
  process: { type: String, default: 'login' },   // login | connect
  next: { type: String, default: '' },
  label: { type: String, default: 'Continue with Google' },
});

const session = useSession();
const action = authUrl(PROVIDER_REDIRECT);
const callback = computed(() => {
  const path = props.process === 'connect' ? '/app/security' : '/app/login';
  const next = safeNext(props.next);
  return `${location.origin}${path}${next ? `?next=${encodeURIComponent(next)}` : ''}`;
});
</script>

<template>
  <form method="post" :action="action" class="contents">
    <input type="hidden" name="csrfmiddlewaretoken" :value="session.csrf">
    <input type="hidden" name="provider" value="google">
    <input type="hidden" name="process" :value="process">
    <input type="hidden" name="callback_url" :value="callback">
    <button type="submit" :disabled="!session.csrf"
            class="inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-hairline bg-panel
                   px-4 py-2 text-[13px] font-medium text-ink transition-[transform,border-color,background-color]
                   duration-75 hover:border-ink/25 hover:bg-ink/[0.03] active:scale-[0.97]
                   disabled:cursor-not-allowed disabled:text-ink-3">
      <!-- Google's four-colour mark, inline: no request to anyone for a logo. -->
      <svg viewBox="0 0 24 24" class="size-4 shrink-0" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8H1.3v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z" />
      </svg>
      {{ label }}
    </button>
  </form>
</template>
