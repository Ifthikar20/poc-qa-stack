<script setup>
/**
 * The two things that are deliberately not editable by a script: which origins
 * may be driven, and which vault keys exist. Values never appear — the server
 * only ever hands over names.
 *
 * Allowing an origin is the step-up action (docs/AUTH.md §9): the runner
 * wants a token whose `su` is still in the future, which the control plane
 * grants only for a recent proof of the strongest factor the account has.
 * A 403 step_up_required opens the reauthentication sheet; the proof
 * forgets the token, the retry mints a fresh one, and the origin goes in.
 *
 * Both lists are the organisation's own (docs/AUTH.md §10): the origins
 * arrive with the socket's greeting, the vault's key names only from
 * /api/state under the token — never from the greeting. A 402 is the plan
 * saying the list is full, drawn as an upgrade prompt; a 403 forbidden is
 * a member asking for an owner's or admin's change.
 */
import { onMounted, ref } from 'vue';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import { useSession } from '@/stores/session';
import { useGuarded } from '@/composables/reauth';
import TopBar from '@/components/TopBar.vue';
import Field from '@/components/Field.vue';
import ReauthSheet from '@/components/ReauthSheet.vue';
import UpgradePrompt from '@/components/UpgradePrompt.vue';

const live = useLive();
const session = useSession();
const guard = useGuarded();
const draft = ref('');
const error = ref(null);
const upgrade = ref(null);
const state = ref(null);

const refresh = async () => { state.value = await api.state(); live.secrets = state.value.secrets ?? []; };
onMounted(refresh);

/** Allow the drafted origin; say which proof the runner wants when it says step-up. */
async function allow() {
  const origin = draft.value;
  try {
    const r = await api.allowOrigin(origin);
    live.origins = r.origins;
    draft.value = '';
    return 'ok';
  } catch (e) {
    if (e.stepUp) {
      session.forgetToken();
      return session.mfa.enrolled ? 'mfa_reauthenticate' : 'reauthenticate';
    }
    if (e.entitlement) { upgrade.value = e.entitlement; return 'error'; }
    error.value = e.message;
    return 'error';
  }
}

async function add() {
  error.value = null;
  upgrade.value = null;
  await guard.run(allow);
}

async function proved() {
  error.value = null;
  await guard.proved();
}
async function remove(o) {
  error.value = null;
  try { const r = await api.removeOrigin(o); live.origins = r.origins; }
  catch (e) { error.value = e.message; }
}
</script>

<template>
  <TopBar :crumbs="[{ label: 'Origins & vault' }]" />

  <div class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="display mb-1 text-3xl">Origins &amp; vault</h1>
    <p class="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink-2">
      The two decisions only a person makes. A generated plan cannot reach either of them.
    </p>

    <p v-if="error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ error }}</p>
    <UpgradePrompt v-if="upgrade" class="mb-4" :limit="upgrade.limit" :plan="upgrade.plan" @dismiss="upgrade = null" />

    <section class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Allowed origins</h2>
      <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Every <code>goto</code> is checked against this list. A wildcard still refuses the private
        network by name, so allowing everything does not hand out the metadata endpoint.
      </p>
      <ul class="mt-4 flex flex-wrap gap-1.5">
        <li v-for="o in live.origins" :key="o"
            class="flex items-center gap-2 rounded-full border border-hairline px-3 py-1.5 font-mono text-[12px]">
          {{ o }}
          <button v-if="session.manages" class="text-ink-3 hover:text-critical" @click="remove(o)" :title="`Remove ${o}`">✕</button>
        </li>
      </ul>
      <p v-if="state?.usage?.origins?.max !== null && state?.usage?.origins?.max !== undefined" class="mt-2 text-[12.5px] text-ink-3">
        {{ state.usage.origins.used }} of {{ state.usage.origins.max }} on the {{ state.plan }} plan.
      </p>
      <p v-if="!session.manages" class="mt-3 text-[12.5px] text-ink-3">Only an owner or admin of the organisation changes this list.</p>
      <div v-else class="mt-4 flex items-end gap-2">
        <Field label="Allow another" class="flex-1">
          <input v-model="draft" placeholder="staging.acme.com" spellcheck="false" @keyup.enter="add">
        </Field>
        <button class="mb-0.5 rounded-full bg-brand hover:bg-brand-2 px-4 py-2 text-[13px] font-medium text-white disabled:bg-ink/[0.05] disabled:text-ink-3"
                :disabled="!draft" @click="add">Allow</button>
      </div>
    </section>

    <section class="card mb-4 p-5">
      <h2 class="text-[15px] font-medium">Vault keys</h2>
      <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
        Names only. A value is read on the server at the moment a field is filled and never travels
        to this page, the log, a script, or a diagram.
      </p>
      <ul class="mt-4 flex flex-wrap gap-1.5">
        <li v-for="s in live.secrets" :key="s"
            class="rounded-full border border-hairline px-3 py-1.5 font-mono text-[12px]">${{ s }}</li>
        <li v-if="!live.secrets.length" class="text-[13px] text-ink-3">None set.</li>
      </ul>
      <p v-if="state && !state.usage?.vault" class="mt-3 text-[12.5px] text-warn">
        The {{ state.plan ?? 'current' }} plan does not include the vault: a <code>$KEY</code> in a step will not resolve.
      </p>
      <p class="mt-3 text-[12.5px] text-ink-3">
        Set in <code>.ghostclick/{{ state?.org ?? 'local' }}/secrets.json</code> on the runner<template v-if="!session.required">, or with <code>GC_SECRET_NAME=value</code></template>.
      </p>
    </section>

    <section v-if="state" class="card p-5">
      <h2 class="text-[15px] font-medium">Runner</h2>
      <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
        <dt class="text-ink-3">Browser</dt>
        <dd>{{ state.headed ? 'Headed — a real window' : 'Headless — streamed to the console' }}</dd>
        <dt class="text-ink-3">Current page</dt>
        <dd class="truncate font-mono text-[12px]">{{ state.url ?? (state.driving?.org && !state.driving.mine ? `another organisation’s (${state.driving.org})` : 'nothing open') }}</dd>
        <dt class="text-ink-3">Organisation</dt>
        <dd class="font-mono text-[12px]">{{ state.org }}<template v-if="state.plan"> · {{ state.plan }} plan</template></dd>
      </dl>
    </section>
  </div>

  <ReauthSheet v-if="guard.flow.value" :flow="guard.flow.value" @done="proved" @cancel="guard.cancel()" />
</template>
