<script setup>
/**
 * Onboarding a project.
 *
 * A suite is not a folder of scripts — it is the answer to four questions, and
 * this asks them in the order that makes each one answerable:
 *
 *   1. What are we testing, and where does it live?   (name + one origin)
 *   2. Which pages are worth visiting?                (discrete URLs)
 *   3. What has to be true on each?                   (expectations)
 *   4. What do we do there?                           (cases: recorded or written)
 *
 * Step 2 is the one that earns its place. Scanning a page opens it in the
 * driven browser and reads its accessibility tree, so step 3 offers you what is
 * genuinely there rather than a text box to guess into — and every target it
 * offers is one the executor can resolve, because it came from the same model
 * `getByRole` queries.
 *
 * The suite is created at the end of step 1, not at the end of the wizard. Half
 * an onboarding is still worth keeping, and a wizard that loses your work if you
 * close the tab is a wizard people stop using.
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import TopBar from '@/components/TopBar.vue';
import Field from '@/components/Field.vue';
import StatusPill from '@/components/StatusPill.vue';

const router = useRouter();
const store = useSuites();

const step = ref(1);
const busy = ref(false);
const error = ref(null);

const draft = ref({ name: '', baseUrl: '', description: '' });
const suite = ref(null);
const allowed = ref(false);

const newPage = ref({ name: '', path: '/' });
const scanning = ref(null);

const STEPS = [
  { n: 1, label: 'Project',      hint: 'Name it and point at one origin' },
  { n: 2, label: 'Pages',        hint: 'The discrete URLs worth visiting' },
  { n: 3, label: 'Expectations', hint: 'What has to be true on each' },
  { n: 4, label: 'Cases',        hint: 'Record or write what you do there' },
];

const origin = computed(() => {
  try { return new URL(suite.value?.baseUrl ?? draft.value.baseUrl).origin; } catch { return null; }
});

async function createSuite() {
  busy.value = true; error.value = null;
  try {
    suite.value = await store.create(draft.value);
    const r = await api.suite(suite.value.id);
    allowed.value = r.allowed;
    step.value = 2;
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

/**
 * Allowing an origin is a human act — it is why this is a button and not a
 * side effect of typing a URL. Nothing generated can reach it.
 */
async function allow() {
  busy.value = true; error.value = null;
  try { await api.allowOrigin(origin.value); allowed.value = true; }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}

async function addPage() {
  busy.value = true; error.value = null;
  try {
    const { page } = await api.addPage(suite.value.id, newPage.value);
    suite.value.pages.push(page);
    newPage.value = { name: '', path: '/' };
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

async function removePage(p) {
  await api.removePage(suite.value.id, p.id);
  suite.value.pages = suite.value.pages.filter((x) => x.id !== p.id);
}

/** Links found by a scan, minus the pages already added. */
const suggestions = computed(() => {
  const have = new Set(suite.value?.pages.map((p) => p.path) ?? []);
  const out = new Map();
  for (const p of suite.value?.pages ?? []) {
    for (const l of p.linked ?? []) if (!have.has(l.path) && !out.has(l.path)) out.set(l.path, l);
  }
  return [...out.values()].slice(0, 12);
});

async function addSuggested(l) {
  busy.value = true; error.value = null;
  try {
    const { page } = await api.addPage(suite.value.id, { name: l.name, path: l.path });
    suite.value.pages.push(page);
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

async function scan(p) {
  scanning.value = p.id; error.value = null;
  try {
    const { page } = await api.scanPage(suite.value.id, p.id);
    Object.assign(p, page);
  } catch (e) {
    error.value = e.needsOrigin ? `${e.needsOrigin} is not allowed yet — allow it above.` : e.message;
    if (e.needsOrigin) allowed.value = false;
  } finally { scanning.value = null; }
}

/** An expectation is a tick box over what the scan found, not free text. */
function toggleExpect(p, kind, value) {
  const i = p.expect.findIndex((e) => e.kind === kind && e.value === value);
  if (i >= 0) p.expect.splice(i, 1); else p.expect.push({ kind, value });
}
const has = (p, kind, value) => p.expect.some((e) => e.kind === kind && e.value === value);

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


async function saveExpectations() {
  busy.value = true; error.value = null;
  try {
    for (const p of suite.value.pages) await api.updatePage(suite.value.id, p.id, { expect: p.expect });
    step.value = 4;
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

/**
 * Turn each page's expectations into a runnable case. This is the payoff of
 * onboarding: before anyone records a single click, the suite already tests
 * that every page loads and still says what it should.
 */
async function generateChecks() {
  busy.value = true; error.value = null;
  let made = 0;
  try {
    for (const p of suite.value.pages) {
      if (!p.expect.length) continue;
      const { flow } = await api.pageCheck(suite.value.id, p.id);
      await api.addCase(suite.value.id, { name: `${p.name} loads`, pageId: p.id, flow });
      made++;
    }
    if (!made) error.value = 'No page has an expectation yet — go back and add one.';
    else finish();
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}

const finish = () => router.push(`/suites/${suite.value.id}`);
const recordFirst = () => router.push({ path: '/console', query: { suite: suite.value.id, url: suite.value.pages[0]?.url } });
</script>

<template>
  <TopBar :crumbs="[{ label: 'Test suites', to: '/suites' }, { label: 'Onboard a project' }]" />

  <div class="mx-auto max-w-4xl px-6 py-8">
    <header class="mb-8">
      <p class="eyebrow">Onboarding</p>
      <h1 class="mt-1.5 display text-4xl">Bring a project in.</h1>
      <p class="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
        A test suite is one project, one origin, and everything you want to be true inside it.
        It can cover a whole app, one feature, or a single page.
      </p>
    </header>

    <!-- the rail -->
    <ol class="mb-8 grid grid-cols-4 gap-2">
      <li v-for="s in STEPS" :key="s.n" class="rounded-xl border px-3.5 py-3"
          :class="step === s.n ? 'border-ink/25 bg-panel'
                : step > s.n ? 'border-hairline bg-panel/60' : 'border-hairline bg-transparent'">
        <p class="flex items-center gap-2 text-[12.5px] font-medium">
          <span class="grid size-4.5 place-items-center rounded-full text-[10.5px]"
                :class="step === s.n ? 'bg-brand text-white' : step > s.n ? 'bg-ink text-white' : 'bg-hairline text-ink-3'">
            {{ step > s.n ? '✓' : s.n }}
          </span>
          {{ s.label }}
        </p>
        <p class="mt-1 text-[11.5px] leading-snug text-ink-3">{{ s.hint }}</p>
      </li>
    </ol>

    <p v-if="error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">
      {{ error }}
    </p>

    <!-- 1 ------------------------------------------------------------ -->
    <section v-if="step === 1" class="card p-6">
      <h2 class="display text-xl">What are we testing?</h2>
      <p class="mt-1.5 text-[13.5px] text-ink-2">
        Every page in this suite lives under one origin. That is what stops a page you add later
        from walking the runner somewhere nobody agreed to.
      </p>
      <div class="mt-5 grid gap-4">
        <Field label="Suite name" hint="A project, a feature, or a page. “Treasury — billing”, “Checkout”, “Settings page”.">
          <input v-model="draft.name" placeholder="Treasury — billing" @keyup.enter="draft.name && draft.baseUrl && createSuite()">
        </Field>
        <Field label="Base URL" :hint="origin ? `Origin: ${origin}` : 'A bare host is fine — treasury.acme.com becomes https://treasury.acme.com'">
          <input v-model="draft.baseUrl" placeholder="localhost:3000" spellcheck="false"
                 @keyup.enter="draft.name && draft.baseUrl && createSuite()">
        </Field>
        <Field label="Notes" hint="Optional. What this suite is for.">
          <input v-model="draft.description" placeholder="The sign-in and settings flows">
        </Field>
      </div>
      <div class="mt-6 flex gap-2">
        <button class="rounded-full bg-brand hover:bg-brand-2 px-5 py-2.5 text-[13.5px] font-medium text-white disabled:bg-ink/[0.05] disabled:text-ink-3"
                :disabled="!draft.name || !draft.baseUrl || busy" @click="createSuite">
          {{ busy ? 'Creating…' : 'Create suite' }}
        </button>
        <RouterLink to="/suites" class="rounded-full border border-hairline px-5 py-2.5 text-[13.5px]">Cancel</RouterLink>
      </div>
    </section>

    <!-- 2 ------------------------------------------------------------ -->
    <section v-else-if="step === 2" class="grid gap-4">
      <div v-if="!allowed" class="card wash-warm p-5">
        <p class="text-[13.5px] font-medium">{{ origin }} is not allowed yet.</p>
        <p class="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
          The runner refuses to open an origin nobody approved, and no script can approve one.
          This button is the only way in, and it is deliberately a person pressing it.
        </p>
        <button class="mt-4 rounded-full bg-brand hover:bg-brand-2 px-4 py-2 text-[13px] font-medium text-white disabled:bg-ink/[0.05] disabled:text-ink-3"
                :disabled="busy" @click="allow">Allow {{ origin }}</button>
      </div>
      <div v-else class="flex items-center gap-2 rounded-xl border border-hairline bg-panel px-4 py-2.5 text-[13px]">
        <StatusPill :ok="true" label="Allowed" size="sm" /> <span class="text-ink-2">{{ origin }}</span>
      </div>

      <div class="card p-6">
        <h2 class="display text-xl">Which pages?</h2>
        <p class="mt-1.5 text-[13.5px] text-ink-2">
          Add the discrete URLs worth testing. Scanning one opens it in the runner and reads what it
          offers — that is what the next step picks from.
        </p>

        <ul v-if="suite.pages.length" class="mt-5 divide-y divide-hairline border-y border-hairline">
          <li v-for="p in suite.pages" :key="p.id" class="flex items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <p class="text-[13.5px] font-medium">{{ p.name }}</p>
              <p class="truncate font-mono text-[12px] text-ink-3">{{ p.path }}</p>
            </div>
            <span v-if="p.targets.length" class="shrink-0 text-[12px] text-ink-2">
              {{ p.targets.length }} targets
            </span>
            <button class="shrink-0 rounded-full border border-hairline px-3 py-1.5 text-[12.5px] disabled:bg-ink/[0.05] disabled:text-ink-3"
                    :disabled="scanning === p.id || !allowed" @click="scan(p)">
              {{ scanning === p.id ? 'Scanning…' : p.targets.length ? 'Re-scan' : 'Scan' }}
            </button>
            <button class="shrink-0 rounded-full px-2 py-1.5 text-[12.5px] text-ink-3 hover:text-critical"
                    @click="removePage(p)" title="Remove">✕</button>
          </li>
        </ul>


        <!-- What the app says its own pages are.
             Reading them off the nav beats typing paths by hand, which is the
             friction that ends with one page onboarded and the rest never done. -->
        <template v-if="suggestions.length">
          <p class="mt-5 eyebrow">Linked from the pages you scanned</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <button v-for="l in suggestions" :key="l.path"
                    class="rounded-full border border-hairline px-3 py-1.5 text-[12.5px] hover:border-ink/30 disabled:bg-ink/[0.05] disabled:text-ink-3"
                    :disabled="busy" @click="addSuggested(l)">
              + {{ l.name }} <span class="font-mono opacity-55">{{ l.path }}</span>
            </button>
          </div>
        </template>

        <div class="mt-5 flex items-end gap-2">
          <!-- Disabled while the request is in flight: the form clears when the
               response lands, so anything typed in between would be wiped. -->
          <Field label="Page name" class="flex-1">
            <input v-model="newPage.name" placeholder="Sign in" :disabled="busy" @keyup.enter="addPage">
          </Field>
          <Field label="Path" class="flex-1">
            <input v-model="newPage.path" placeholder="/login" spellcheck="false" :disabled="busy" @keyup.enter="addPage">
          </Field>
          <button class="mb-0.5 rounded-full border border-hairline px-4 py-2 text-[13px] disabled:bg-ink/[0.05] disabled:text-ink-3"
                  :disabled="!newPage.name || busy" @click="addPage">Add page</button>
        </div>
      </div>

      <div class="flex gap-2">
        <button class="rounded-full bg-brand hover:bg-brand-2 px-5 py-2.5 text-[13.5px] font-medium text-white disabled:bg-ink/[0.05] disabled:text-ink-3"
                :disabled="!suite.pages.length" @click="step = 3">Next — expectations</button>
        <button class="rounded-full border border-hairline px-5 py-2.5 text-[13.5px]" @click="finish">Finish later</button>
      </div>
    </section>

    <!-- 3 ------------------------------------------------------------ -->
    <section v-else-if="step === 3" class="grid gap-4">
      <div class="card p-6">
        <h2 class="display text-xl">What has to be true?</h2>
        <p class="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
          Pick from what the scan actually found. Every one of these becomes an assertion the suite
          checks on every run — and because they came from the accessibility tree, they will still
          resolve when the markup around them changes.
        </p>

        <div v-for="p in suite.pages" :key="p.id" class="mt-6 border-t border-hairline pt-5 first:border-0 first:pt-0">
          <div class="flex items-baseline gap-2">
            <h3 class="text-[14px] font-medium">{{ p.name }}</h3>
            <span class="font-mono text-[12px] text-ink-3">{{ p.path }}</span>
            <span class="ml-auto text-[12px] text-ink-3">{{ p.expect.length }} chosen</span>
          </div>

          <p class="mt-3 eyebrow">The URL</p>
          <button class="mt-1.5 rounded-full border px-3 py-1.5 text-[12.5px]"
                  :class="has(p, 'url', p.path) ? 'border-brand bg-brand-50 font-medium text-brand-2' : 'border-hairline'"
                  @click="toggleExpect(p, 'url', p.path)">
            URL contains {{ p.path }}
          </button>

          <template v-if="p.targets.length">
            <p class="mt-4 eyebrow">Text that must be visible</p>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <button v-for="t in textOptions(p)" :key="t.name"
                      class="rounded-full border px-3 py-1.5 text-[12.5px]"
                      :class="has(p, 'text', t.name) ? 'border-brand bg-brand-50 font-medium text-brand-2' : 'border-hairline'"
                      @click="toggleExpect(p, 'text', t.name)">
                {{ t.name }} <span class="opacity-55">· {{ t.roles.join(', ') }}</span>
              </button>
            </div>
          </template>
          <p v-else class="mt-3 text-[12.5px] text-ink-3">
            Not scanned yet — go back a step and scan it to see what is on this page.
          </p>
        </div>
      </div>

      <div class="flex gap-2">
        <button class="rounded-full bg-brand hover:bg-brand-2 px-5 py-2.5 text-[13.5px] font-medium text-white disabled:bg-ink/[0.05] disabled:text-ink-3"
                :disabled="busy" @click="saveExpectations">{{ busy ? 'Saving…' : 'Save expectations' }}</button>
        <button class="rounded-full border border-hairline px-5 py-2.5 text-[13.5px]" @click="step = 2">Back</button>
      </div>
    </section>

    <!-- 4 ------------------------------------------------------------ -->
    <section v-else class="grid gap-4">
      <div class="card wash p-6">
        <h2 class="display text-xl">{{ suite.name }} is onboarded.</h2>
        <p class="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
          {{ suite.pages.length }} page{{ suite.pages.length === 1 ? '' : 's' }} under {{ origin }}.
          You can turn the expectations into runnable cases right now, or go and demonstrate a flow
          and let the recorder write one.
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="card p-5">
          <p class="text-[14px] font-medium">Generate the page checks</p>
          <p class="mt-1.5 text-[13px] leading-relaxed text-ink-2">
            One case per page: reach it, and assert everything you ticked. This is the test that
            catches “the URL moved” before anyone files it as a mystery.
          </p>
          <button class="mt-4 rounded-full bg-brand hover:bg-brand-2 px-4 py-2 text-[13px] font-medium text-white disabled:bg-ink/[0.05] disabled:text-ink-3"
                  :disabled="busy" @click="generateChecks">{{ busy ? 'Generating…' : 'Generate cases' }}</button>
        </div>
        <div class="card p-5">
          <p class="text-[14px] font-medium">Record your first case</p>
          <p class="mt-1.5 text-[13px] leading-relaxed text-ink-2">
            Drive the first page by hand in the console. Every click and field is named from the
            accessibility tree as you go, and what you get back is a script you can read.
          </p>
          <button class="mt-4 rounded-full border border-hairline px-4 py-2 text-[13px]" @click="recordFirst">
            Open the console
          </button>
        </div>
      </div>

      <div><button class="rounded-full border border-hairline px-5 py-2.5 text-[13.5px]" @click="finish">Go to the suite</button></div>
    </section>
  </div>
</template>
