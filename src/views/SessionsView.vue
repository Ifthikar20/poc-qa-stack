<script setup>
/**
 * Every session the account has (docs/AUTH.md §1, §13): where it was last
 * seen from, when, and a way to end the ones that are not this one. The
 * list is the control plane's usersessions table, kept current on every
 * request, so "a browser you do not recognise" is something a person can
 * notice and act on rather than wait twelve hours for.
 */
import { onMounted, ref } from 'vue';
import { useSession } from '@/stores/session';
import TopBar from '@/components/TopBar.vue';
import Btn from '@/components/Btn.vue';

const session = useSession();
const rows = ref([]);
const busy = ref(false);

const when = (t) => (t ? new Date(t * 1000).toLocaleString() : '—');
const agent = (ua) => {
  const s = String(ua || '');
  if (!s) return 'unknown browser';
  const browser = /Edg\//.test(s) ? 'Edge' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : s.slice(0, 40);
  const os = /Windows/.test(s) ? 'Windows' : /Mac OS/.test(s) ? 'macOS' : /Android/.test(s) ? 'Android' : /iPhone|iPad/.test(s) ? 'iOS' : /Linux/.test(s) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
};

async function load() { rows.value = await session.sessions(); }

async function endOthers() {
  busy.value = true;
  session.error = '';
  try {
    const ids = rows.value.filter((s) => !s.is_current).map((s) => s.id);
    const left = await session.endSessions(ids);
    if (Array.isArray(left)) rows.value = left;
  } finally { busy.value = false; }
}

async function end(row) {
  busy.value = true;
  session.error = '';
  try {
    const left = await session.endSessions([row.id]);
    if (Array.isArray(left)) rows.value = left;
  } finally { busy.value = false; }
}

onMounted(load);
</script>

<template>
  <TopBar :crumbs="[{ label: 'Security', to: { name: 'security' } }, { label: 'Sessions' }]" />

  <div class="mx-auto max-w-3xl px-6 py-8">
    <h1 class="display mb-1 text-3xl">Sessions</h1>
    <p class="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink-2">
      Every browser signed in as you. A session ends after twelve idle hours or seven days, whichever
      comes first — or now, from here. A password change ends all of them.
    </p>

    <p v-if="session.error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ session.error }}</p>

    <section class="card p-5">
      <div class="flex items-center justify-between gap-4">
        <h2 class="text-[15px] font-medium">{{ rows.length }} session{{ rows.length === 1 ? '' : 's' }}</h2>
        <Btn variant="danger" size="sm" :busy="busy" busy-label="Signing out…"
             :disabled="!rows.some((s) => !s.is_current)" @click="endOthers">Sign out every other session</Btn>
      </div>
      <ul class="mt-4 divide-y divide-hairline">
        <li v-for="s in rows" :key="s.id" class="flex items-center justify-between gap-4 py-3">
          <div class="min-w-0">
            <p class="text-[13.5px] font-medium">
              {{ agent(s.user_agent) }}
              <span v-if="s.is_current" class="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-2">this one</span>
            </p>
            <p class="mt-0.5 text-[12.5px] text-ink-3">
              <span class="font-mono">{{ s.ip }}</span> · last seen {{ when(s.last_seen_at ?? s.created_at) }} · signed in {{ when(s.created_at) }}
            </p>
          </div>
          <Btn v-if="!s.is_current" variant="ghost" size="sm" :disabled="busy" @click="end(s)">Sign out</Btn>
        </li>
      </ul>
    </section>
  </div>
</template>
