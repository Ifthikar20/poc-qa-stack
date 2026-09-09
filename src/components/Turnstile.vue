<script setup>
/**
 * Cloudflare Turnstile, rendered only when the control plane asks for it.
 *
 * The site key comes from GET /auth/config; unset, this component is never
 * mounted and Cloudflare's script is never loaded. The runner's CSP admits
 * challenges.cloudflare.com only when the same key is in its environment,
 * so a widget that renders is one the policy expected.
 *
 * The token it produces is one-use: after a refused submit the widget is
 * reset so the next attempt carries a fresh one.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({ siteKey: { type: String, required: true } });
const emit = defineEmits(['token']);

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const host = ref(null);
let widgetId = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT}"]`);
    if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

onMounted(async () => {
  try {
    await loadScript();
    widgetId = window.turnstile.render(host.value, {
      sitekey: props.siteKey,
      callback: (token) => emit('token', token),
      'expired-callback': () => emit('token', ''),
      'error-callback': () => emit('token', ''),
    });
  } catch { emit('token', ''); }
});

onBeforeUnmount(() => {
  try { if (widgetId !== null) window.turnstile?.remove(widgetId); } catch { /* already gone */ }
});

defineExpose({
  reset() {
    emit('token', '');
    try { if (widgetId !== null) window.turnstile?.reset(widgetId); } catch { /* not rendered */ }
  },
});
</script>

<template>
  <div ref="host" class="min-h-[65px]" />
</template>
