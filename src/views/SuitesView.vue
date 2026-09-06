<script setup>
/**
 * The front door.
 *
 * The four-step wizard is still there for setting a project up properly, but the
 * first thing on this screen is a single field, because the first question about
 * your own app is "can this thing drive it at all" and that should take one
 * paste to answer — not four steps you take on faith.
 *
 * The origin gate is inline rather than a dead end: a URL nobody has approved
 * comes back naming the origin it needs, and the same field turns into the
 * button that approves it. Still a person pressing it; just not a person reading
 * an error and going somewhere else.
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { useSuites } from '@/stores/suites';
import TopBar from '@/components/TopBar.vue';
import EmptyState from '@/components/EmptyState.vue';

const router = useRouter();
const store = useSuites();

const url = ref('');
const busy = ref(false);
const error = ref(null);
const needsOrigin = ref(null);
const result = ref(null);

onMounted(() => store.loadList());

async function quickstart() {
  if (!url.value.trim()) return;
  busy.value = true; error.value = null; needsOrigin.value = null; result.value = null;
  try {
    const r = await api.quickstart(url.value.trim());
    result.value = r;
    await store.loadList();
    router.push(`/suites/${r.suite.id}`);
  } catch (e) {
    if (e.needsOrigin) needsOrigin.value = e.needsOrigin;
    else error.value = e.message;
  } finally { busy.value = false; }
}

async function allowAndRetry() {
  busy.value = true;
  try { await api.allowOrigin(needsOrigin.value); needsOrigin.value = null; await quickstart(); }
  catch (e) { error.value = e.message; busy.value = false; }
}
</script>

<template>
  <TopBar :crumbs="[{ label: 'Test suites' }]">
    <template #actions>
      <RouterLink to="/suites/new" class="rounded-full border border-hairline px-4 py-2 text-[13.5px]">
        Set one up properly
      </RouterLink>
    </template>
  </TopBar>

  <div class="mx-auto max-w-5xl px-6 py-8">
    <header class="card wash mb-6 p-7">
      <p class="eyebrow">Test suites</p>
      <h1 class="mt-1.5 display text-4xl">Point it at your app.</h1>
      <p class="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
        Paste a URL and ghostclick will open it, read what is on it, and run a first test that says
        you got there. Then you decide what else has to be true.
      </p>

      <div class="mt-6 flex max-w-2xl flex-wrap items-center gap-2">
        <input v-model="url" spellcheck="false" placeholder="staging.acme.com/dashboard"
               :disabled="busy"
               class="min-w-0 flex-1 rounded-full border border-hairline bg-panel px-4 py-2.5 text-[14px] outline-none focus:border-ink/25 disabled:opacity-55"
               @keyup.enter="quickstart">
        <button class="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-white disabled:opacity-40"
                :disabled="busy || !url.trim()" @click="quickstart">
          {{ busy ? 'Opening…' : 'Add and test' }}
        </button>
      </div>

      <div v-if="needsOrigin" class="mt-4 max-w-2xl rounded-xl border border-hairline bg-panel px-4 py-3">
        <p class="text-[13.5px] font-medium">{{ needsOrigin }} is not allowed yet.</p>
        <p class="mt-1 text-[13px] leading-relaxed text-ink-2">
          The runner will not open an origin nobody approved, and no script can approve one. This is
          that approval.
        </p>
        <button class="mt-3 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40"
                :disabled="busy" @click="allowAndRetry">Allow it and continue</button>
      </div>

      <p v-if="error" class="mt-4 max-w-2xl rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">
        {{ error }}
      </p>
    </header>

    <EmptyState v-if="!store.list.length" title="No suites yet"
                body="Use the field above for a quick look, or set one up properly — name it, add its pages, and choose what has to be true on each.">
      <RouterLink to="/suites/new" class="rounded-full border border-hairline px-4 py-2 text-[13.5px]">
        Set one up properly
      </RouterLink>
    </EmptyState>

    <div v-else class="grid gap-4 sm:grid-cols-2">
      <RouterLink v-for="s in store.list" :key="s.id" :to="`/suites/${s.id}`"
                  class="card p-5 transition hover:border-ink/25">
        <p class="text-[15px] font-medium">{{ s.name }}</p>
        <p class="mt-0.5 truncate font-mono text-[12px] text-ink-3">{{ s.origin }}</p>
        <p v-if="s.description" class="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{{ s.description }}</p>
        <p class="mt-4 flex gap-4 text-[12.5px] text-ink-2">
          <span><b class="font-medium text-ink">{{ s.pages }}</b> page{{ s.pages === 1 ? '' : 's' }}</span>
          <span><b class="font-medium text-ink">{{ s.cases }}</b> case{{ s.cases === 1 ? '' : 's' }}</span>
        </p>
      </RouterLink>
    </div>
  </div>
</template>
