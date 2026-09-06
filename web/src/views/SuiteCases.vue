<script setup>
/**
 * Cases: the flows this suite runs.
 *
 * A case is stored as flow text — the mermaid subset that is also the script —
 * so what you read here is exactly what runs. Editing one re-validates against
 * the same parser the executor uses, which is why an unrunnable edit is refused
 * at save rather than discovered at 2am.
 */
import { computed, ref } from 'vue';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import { useLive } from '@/stores/live';
import Field from '@/components/Field.vue';
import FlowBox from '@/components/FlowBox.vue';
import StatusPill from '@/components/StatusPill.vue';
import EmptyState from '@/components/EmptyState.vue';
import Btn from '@/components/Btn.vue';

const store = useSuites();
const live = useLive();
const suite = computed(() => store.current);

const open = ref(null);          // case id being edited
const edit = ref({ name: '', flow: '' });
const draft = ref({ name: '', pageId: '', flow: '' });
const adding = ref(false);
const error = ref(null);
const running = ref(null);
const results = ref({});         // caseId -> ok, from the last run in this session

function startEdit(c) {
  open.value = open.value === c.id ? null : c.id;
  edit.value = { name: c.name, flow: c.flow };
}

async function save(c) {
  error.value = null;
  try { await api.updateCase(suite.value.id, c.id, edit.value); open.value = null; await store.refresh(); }
  catch (e) { error.value = e.message; }
}
async function remove(c) {
  if (!confirm(`Delete "${c.name}"?`)) return;
  await api.removeCase(suite.value.id, c.id);
  await store.refresh();
}
async function add() {
  error.value = null;
  try {
    await api.addCase(suite.value.id, { ...draft.value, pageId: draft.value.pageId || null });
    draft.value = { name: '', pageId: '', flow: '' };
    adding.value = false;
    await store.refresh();
  } catch (e) { error.value = e.message; }
}
async function runOne(c) {
  running.value = c.id; error.value = null;
  try {
    const r = await api.runSuite(suite.value.id, c.id);
    results.value[c.id] = r.outcomes[0]?.ok ?? null;
  } catch (e) { error.value = e.needsOrigin ? `${e.needsOrigin} is not allowed yet.` : e.message; }
  finally { running.value = null; }
}

/** Whatever the recorder has produced, dropped straight into a new case. */
function fromRecorder() {
  adding.value = true;
  draft.value = { name: 'Recorded flow', pageId: '', flow: live.recordedFlow };
}
const pageName = (id) => suite.value.pages.find((p) => p.id === id)?.name ?? null;
</script>

<template>
  <div>
    <div class="mb-6 flex items-end gap-3">
      <div>
        <h1 class="display text-3xl">Cases</h1>
        <p class="mt-1 max-w-2xl text-[14px] leading-relaxed text-ink-2">
          Each one is a flow you can read. Record it in the console, or write it here.
        </p>
      </div>
      <div class="ml-auto flex gap-2">
        <button v-if="live.recordedFlow" class="rounded-full border border-hairline px-4 py-2 text-[13px]"
                @click="fromRecorder">
          Use the recording ({{ live.recordedCount }} steps)
        </button>
        <button class="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white"
                @click="adding = !adding">{{ adding ? 'Cancel' : 'New case' }}</button>
      </div>
    </div>

    <p v-if="error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ error }}</p>

    <section v-if="adding" class="card mb-4 p-5">
      <div class="grid gap-3 sm:grid-cols-2">
        <Field label="Case name"><input v-model="draft.name" placeholder="Sign in works"></Field>
        <Field label="Page" hint="Optional — a case carries its own entry URL.">
          <select v-model="draft.pageId">
            <option value="">Not tied to a page</option>
            <option v-for="p in suite.pages" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </Field>
      </div>
      <div class="mt-3">
        <Field label="Flow" hint="The mermaid subset. One edge is one interaction.">
          <FlowBox v-model="draft.flow" :rows="10" />
        </Field>
      </div>
      <button class="mt-4 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40"
              :disabled="!draft.name || !draft.flow" @click="add">Save case</button>
    </section>

    <EmptyState v-if="!suite.cases.length && !adding" title="No cases yet"
                body="Open the console, press Record, and drive the page by hand — the recorder names every element from the accessibility tree and hands you back a script." >
      <RouterLink :to="{ path: '/console', query: { suite: suite.id, url: suite.pages[0]?.url } }"
                  class="rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-white">Open the console</RouterLink>
    </EmptyState>

    <section v-for="c in suite.cases" :key="c.id" class="card mb-3 p-5">
      <div class="flex items-center gap-3">
        <div class="min-w-0">
          <p class="truncate text-[14.5px] font-medium">{{ c.name }}</p>
          <p class="mt-0.5 text-[12px] text-ink-3">
            {{ c.steps }} step{{ c.steps === 1 ? '' : 's' }} · {{ c.source }}
            <template v-if="pageName(c.pageId)"> · {{ pageName(c.pageId) }}</template>
          </p>
        </div>
        <StatusPill v-if="results[c.id] !== undefined" :ok="results[c.id]" size="sm" class="ml-2" />
        <div class="ml-auto flex shrink-0 gap-2">
          <Btn variant="ghost" size="sm" :busy="running === c.id" busy-label="Running…"
               :disabled="live.running" @click="runOne(c)">Run</Btn>
          <button class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px]" @click="startEdit(c)">
            {{ open === c.id ? 'Close' : 'Edit' }}
          </button>
          <button class="rounded-full px-2 py-1.5 text-[12.5px] text-ink-3 hover:text-critical" @click="remove(c)">✕</button>
        </div>
      </div>

      <div v-if="open === c.id" class="mt-4 border-t border-hairline pt-4">
        <Field label="Name"><input v-model="edit.name"></Field>
        <div class="mt-3">
          <Field label="Flow"><FlowBox v-model="edit.flow" :rows="12" /></Field>
        </div>
        <button class="mt-4 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white" @click="save(c)">
          Save
        </button>
      </div>
      <FlowBox v-else :model-value="c.flow" :rows="Math.min(16, c.flow.split('\n').length)" readonly class="mt-3" />
    </section>
  </div>
</template>
