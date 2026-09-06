<script setup>
/**
 * The two things that are deliberately not editable by a script: which origins
 * may be driven, and which vault keys exist. Values never appear — the server
 * only ever hands over names.
 */
import { onMounted, ref } from 'vue';
import { api } from '@/api';
import { useLive } from '@/stores/live';
import TopBar from '@/components/TopBar.vue';
import Field from '@/components/Field.vue';

const live = useLive();
const draft = ref('');
const error = ref(null);
const state = ref(null);

onMounted(async () => { state.value = await api.state(); });

async function add() {
  error.value = null;
  try { const r = await api.allowOrigin(draft.value); live.origins = r.origins; draft.value = ''; }
  catch (e) { error.value = e.message; }
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
          <button class="text-ink-3 hover:text-critical" @click="remove(o)" :title="`Remove ${o}`">✕</button>
        </li>
      </ul>
      <div class="mt-4 flex items-end gap-2">
        <Field label="Allow another" class="flex-1">
          <input v-model="draft" placeholder="staging.acme.com" spellcheck="false" @keyup.enter="add">
        </Field>
        <button class="mb-0.5 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40"
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
      <p class="mt-3 text-[12.5px] text-ink-3">
        Set with <code>GC_SECRET_NAME=value</code> or in <code>.ghostclick/secrets.json</code>.
      </p>
    </section>

    <section v-if="state" class="card p-5">
      <h2 class="text-[15px] font-medium">Runner</h2>
      <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
        <dt class="text-ink-3">Browser</dt>
        <dd>{{ state.headed ? 'Headed — a real window' : 'Headless — streamed to the console' }}</dd>
        <dt class="text-ink-3">Current page</dt>
        <dd class="truncate font-mono text-[12px]">{{ state.url }}</dd>
      </dl>
    </section>
  </div>
</template>
