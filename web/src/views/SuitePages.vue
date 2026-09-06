<script setup>
/**
 * Pages and their expectations, after onboarding. Same picker the wizard uses —
 * a scan lists what the accessibility tree actually offers, and an expectation
 * is a tick over that list, never free text.
 */
import { computed, ref } from 'vue';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import Field from '@/components/Field.vue';
import EmptyState from '@/components/EmptyState.vue';
import Btn from '@/components/Btn.vue';

const store = useSuites();
const suite = computed(() => store.current);
const draft = ref({ name: '', path: '/' });
const busy = ref(false);
const scanning = ref(null);
const saving = ref(null);
const error = ref(null);

async function add() {
  busy.value = true; error.value = null;
  try { await api.addPage(suite.value.id, draft.value); draft.value = { name: '', path: '/' }; await store.refresh(); }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}
async function remove(p) {
  if (!confirm(`Remove "${p.name}"? Cases recorded against it are kept — they carry their own URL.`)) return;
  await api.removePage(suite.value.id, p.id);
  await store.refresh();
}
async function scan(p) {
  scanning.value = p.id; error.value = null;
  try { await api.scanPage(suite.value.id, p.id); await store.refresh(); }
  catch (e) { error.value = e.needsOrigin ? `${e.needsOrigin} is not allowed yet.` : e.message; }
  finally { scanning.value = null; }
}
async function save(p) {
  saving.value = p.id;
  try { await api.updatePage(suite.value.id, p.id, { expect: p.expect }); await store.refresh(); }
  catch (e) { error.value = e.message; } finally { saving.value = null; }
}
function toggle(p, kind, value) {
  const i = p.expect.findIndex((e) => e.kind === kind && e.value === value);
  if (i >= 0) p.expect.splice(i, 1); else p.expect.push({ kind, value });
}
const has = (p, kind, value) => p.expect.some((e) => e.kind === kind && e.value === value);

/** Links found by a scan, minus the pages already added. */
const suggestions = computed(() => {
  const have = new Set(suite.value?.pages.map((x) => x.path) ?? []);
  const out = new Map();
  for (const x of suite.value?.pages ?? []) {
    for (const l of x.linked ?? []) if (!have.has(l.path) && !out.has(l.path)) out.set(l.path, l);
  }
  return [...out.values()].slice(0, 12);
});

async function addSuggested(l) {
  busy.value = true; error.value = null;
  try { await api.addPage(suite.value.id, { name: l.name, path: l.path }); await store.refresh(); }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}

/**
 * Chips by NAME, not by target.
 *
 * A page often has a textbox and a button both called "Search". They are two
 * targets but one expectation — "Search is visible" — so listing both made a
 * single tick light up two chips. Collapse them, and name every role the text
 * appears as so the choice is still legible.
 */
function textOptions(p) {
  const by = new Map();
  for (const t of p.targets) {
    const e = by.get(t.name) ?? { name: t.name, roles: [] };
    if (!e.roles.includes(t.role)) e.roles.push(t.role);
    by.set(t.name, e);
  }
  return [...by.values()];
}

</script>

<template>
  <div>
    <h1 class="display mb-1 text-3xl">Pages</h1>
    <p class="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink-2">
      The discrete URLs this suite covers, each with the things that must be true when you land there.
    </p>

    <p v-if="error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ error }}</p>

    <EmptyState v-if="!suite.pages.length" title="No pages yet"
                body="Add the first URL below. Scanning it shows you what is on it." />

    <section v-for="p in suite.pages" :key="p.id" class="card mb-4 p-5">
      <div class="flex items-baseline gap-3">
        <h2 class="text-[15px] font-medium">{{ p.name }}</h2>
        <span class="font-mono text-[12px] text-ink-3">{{ p.path }}</span>
        <span class="ml-auto text-[12px] text-ink-3">
          {{ p.scannedAt ? `${p.targets.length} targets` : 'not scanned' }}
        </span>
        <!-- "the relevant page" is this one, when you are looking at this one. -->
        <RouterLink :to="{ path: '/console', query: { suite: suite.id, url: p.url } }"
                    class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px] hover:border-ink/30">
          Open in console
        </RouterLink>
        <Btn variant="ghost" size="sm" :busy="scanning === p.id" busy-label="Scanning…" @click="scan(p)">
          {{ p.scannedAt ? 'Re-scan' : 'Scan' }}
        </Btn>
        <button class="rounded-full px-2 py-1.5 text-[12.5px] text-ink-3 hover:text-critical" @click="remove(p)">✕</button>
      </div>

      <p class="mt-4 eyebrow">Expectations</p>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <button class="rounded-full border px-3 py-1.5 text-[12.5px]"
                :class="has(p, 'url', p.path) ? 'border-ink bg-ink text-white' : 'border-hairline'"
                @click="toggle(p, 'url', p.path)">URL contains {{ p.path }}</button>
        <button v-for="t in textOptions(p)" :key="t.name" class="rounded-full border px-3 py-1.5 text-[12.5px]"
                :class="has(p, 'text', t.name) ? 'border-ink bg-ink text-white' : 'border-hairline'"
                @click="toggle(p, 'text', t.name)">
          {{ t.name }} <span class="opacity-55">· {{ t.roles.join(', ') }}</span>
        </button>
      </div>
      <p v-if="!p.targets.length" class="mt-2 text-[12.5px] text-ink-3">
        Scan the page to see what it offers.
      </p>

      <Btn class="mt-4" :busy="saving === p.id" busy-label="Saving…" @click="save(p)">Save expectations</Btn>
    </section>

    <section class="card p-5">
      <h2 class="text-[15px] font-medium">Add a page</h2>

        <!-- What the app says its own pages are.
             Reading them off the nav beats typing paths by hand, which is the
             friction that ends with one page onboarded and the rest never done. -->
        <template v-if="suggestions.length">
          <p class="mt-5 eyebrow">Linked from the pages you scanned</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button v-for="l in suggestions" :key="l.path"
                    class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px] hover:border-ink/30 disabled:opacity-40"
                    :disabled="busy" @click="addSuggested(l)">
              + {{ l.name }} <span class="font-mono opacity-55">{{ l.path }}</span>
            </button>
          </div>
        </template>

      <div class="mt-3 flex items-end gap-2">
        <Field label="Name" class="flex-1">
          <input v-model="draft.name" placeholder="Settings" :disabled="busy" @keyup.enter="add">
        </Field>
        <Field label="Path" class="flex-1">
          <input v-model="draft.path" placeholder="/settings" spellcheck="false" :disabled="busy" @keyup.enter="add">
        </Field>
        <button class="mb-0.5 rounded-full border border-hairline px-4 py-2 text-[13px] disabled:opacity-40"
                :disabled="!draft.name || busy" @click="add">Add</button>
      </div>
    </section>
  </div>
</template>
