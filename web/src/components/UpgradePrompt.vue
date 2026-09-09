<script setup>
/**
 * The plan said no (docs/AUTH.md §10).
 *
 * A 402 from the runner is not a fault, it is a limit someone chose, so it
 * is drawn as a prompt with the limit in words and a way to the page where
 * plans live — never as the red box a broken request gets. The runner
 * names the limit and the plan; the sentence is made here from those two
 * words and nothing else, because the UI is never the thing that decides
 * what a plan allows.
 */
import { computed } from 'vue';
import { useSession } from '@/stores/session';

const props = defineProps({
  limit: { type: String, default: '' },
  plan: { type: String, default: null },
});
defineEmits(['dismiss']);

const session = useSession();

const WORDS = {
  'suites.max': (n) => `allows ${n === null ? 'unlimited' : n} suite${n === 1 ? '' : 's'}, and they are all in use`,
  'runs.per_day': (n) => `allows ${n === null ? 'unlimited' : n} run${n === 1 ? '' : 's'} a day, and today's are used up`,
  'origins.max': (n) => `allows ${n === null ? 'unlimited' : n} allowed origin${n === 1 ? '' : 's'}, and they are all taken`,
  'vault.enabled': () => 'does not include the vault, so a $KEY in a step cannot be resolved',
  'history.retention_days': (n) => `keeps ${n === null ? 'all' : `${n} days of`} history`,
  'members.max': (n) => `has ${n === null ? 'unlimited' : n} seat${n === 1 ? '' : 's'}, and they are all taken`,
};

const sentence = computed(() => {
  const n = session.entitlements?.[props.limit];
  const words = WORDS[props.limit];
  return words ? words(n === undefined ? null : n) : `does not allow this (${props.limit})`;
});
const plan = computed(() => props.plan ?? session.org?.plan ?? 'current');
</script>

<template>
  <div class="card wash-warm p-5">
    <p class="eyebrow">Plan limit</p>
    <p class="mt-1.5 text-[14px] font-medium">
      The {{ plan }} plan {{ sentence }}.
    </p>
    <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
      Limits are enforced by the runner from the plan in your token, so nothing here can be
      talked around. An owner of the organisation can move it to a bigger plan.
    </p>
    <div class="mt-3 flex gap-2">
      <RouterLink to="/organisation" class="rounded-full bg-brand hover:bg-brand-2 px-4 py-2 text-[13px] font-medium text-white">
        See the plan and usage
      </RouterLink>
      <button class="rounded-full border border-hairline px-4 py-2 text-[13px]" @click="$emit('dismiss')">Dismiss</button>
    </div>
  </div>
</template>
