<script setup>
/**
 * The organisation you are acting for (docs/AUTH.md §10): who is in it and
 * with which role, who has been invited, which plan it is on and how much of
 * it is used.
 *
 * Everything here is for display and for asking. The control plane decides
 * again, from the Membership row, whether a role change or a removal is
 * allowed, and the runner counts the usage from its own stores and enforces
 * the plan on every request — the numbers on this page are the same ones
 * the refusals are made from, read back from /api/state, so the page and
 * the 402 cannot disagree.
 *
 * Roles follow [authz-tenancy-5]: only an owner changes a role or invites
 * above `member`, nobody changes their own, and an organisation keeps at
 * least one owner. Leaving is the one thing a member does to themselves.
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { useSession } from '@/stores/session';
import { useSuites } from '@/stores/suites';
import TopBar from '@/components/TopBar.vue';
import Field from '@/components/Field.vue';
import Btn from '@/components/Btn.vue';
import StatTile from '@/components/StatTile.vue';

const session = useSession();
const suites = useSuites();
const router = useRouter();

const members = ref([]);
const invitations = ref([]);
const state = ref(null);
const busy = ref('');
const invite = ref({ email: '', role: 'member' });
const invited = ref(null);

const org = computed(() => session.org);
const pending = computed(() => invitations.value.filter((i) => i.state === 'pending'));
const usage = computed(() => state.value?.usage ?? null);
const ROLES = ['member', 'admin', 'owner'];

/** The roles this person may hand out: an owner any, an admin `member` only. */
const grantable = computed(() => (session.owns ? ROLES : session.manages ? ['member'] : []));

const fmt = (u) => (u.max === null || u.max === undefined ? `${u.used} of unlimited` : `${u.used} of ${u.max}`);
const when = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');

async function load() {
  session.error = '';
  state.value = await api.state().catch(() => null);
  // With no control plane there is one workspace and nobody to list.
  if (!session.required) return;
  members.value = await session.members();
  invitations.value = session.manages ? await session.invitations() : [];
}
const seats = computed(() => {
  const n = session.entitlements?.['members.max'];
  if (n === undefined) return '';
  return n === null ? 'unlimited seats' : `${n} seat${n === 1 ? '' : 's'}`;
});

async function setRole(m, role) {
  busy.value = `role:${m.id}`;
  try { if (await session.setRole(m.id, role)) await load(); }
  finally { busy.value = ''; }
}

/** Removing someone, or — with your own id — leaving. */
async function remove(m) {
  const leaving = m.you;
  if (!confirm(leaving ? `Leave ${org.value.name}?` : `Remove ${m.email} from ${org.value.name}?`)) return;
  busy.value = `remove:${m.id}`;
  try {
    if (await session.removeMember(m.id)) {
      if (leaving) { await suites.loadList(); router.replace('/suites'); return; }
      await load();
    }
  } finally { busy.value = ''; }
}

async function sendInvite() {
  busy.value = 'invite';
  invited.value = null;
  try {
    const row = await session.invite(invite.value.email.trim(), invite.value.role);
    if (row) { invited.value = row.email; invite.value.email = ''; invitations.value = await session.invitations(); }
  } finally { busy.value = ''; }
}

async function revoke(i) {
  busy.value = `revoke:${i.id}`;
  try { if (await session.revokeInvitation(i.id)) invitations.value = await session.invitations(); }
  finally { busy.value = ''; }
}

async function switchTo(slug) {
  if (!slug || slug === org.value?.slug) return;
  session.error = '';
  try { await session.switchOrg(slug); await suites.loadList(); await load(); }
  catch (e) { session.error = e.message; }
}

onMounted(load);
</script>

<template>
  <TopBar :crumbs="[{ label: 'Organisation' }]" />

  <div class="mx-auto max-w-4xl px-6 py-8">
    <div class="mb-6 flex flex-wrap items-end gap-4">
      <div class="min-w-0 flex-1">
        <p class="eyebrow">Organisation</p>
        <h1 class="display mt-1 text-3xl">{{ org?.name ?? 'Local workspace' }}</h1>
        <p class="mt-1 text-[13px] text-ink-3">
          <span class="font-mono">{{ org?.slug ?? 'local' }}</span>
          <template v-if="org"> · you are <b class="font-medium text-ink">{{ org.role }}</b> · on the <b class="font-medium text-ink">{{ org.plan }}</b> plan</template>
          <template v-if="org?.personal"> · your personal organisation</template>
        </p>
      </div>
      <!-- Every organisation this account belongs to. Switching asks the
           control plane, which checks the membership and remembers the choice;
           the next token carries it. -->
      <label v-if="session.orgs.length > 1" class="text-[12.5px] text-ink-3">
        Act for
        <select :value="org?.slug" class="ml-2 rounded-full border border-hairline bg-panel px-3 py-1.5 text-[13px] text-ink outline-none focus:border-ink/25"
                @change="switchTo($event.target.value)">
          <option v-for="o in session.orgs" :key="o.slug" :value="o.slug">{{ o.name }}{{ o.personal ? ' (personal)' : '' }}</option>
        </select>
      </label>
    </div>

    <p v-if="session.error" class="mb-4 rounded-xl border border-critical/25 bg-critical/5 px-4 py-3 text-[13px] text-critical">{{ session.error }}</p>

    <!-- Plan and usage: the runner's own numbers, the ones its 402s are made from. -->
    <section class="mb-6">
      <div class="mb-3 flex items-baseline gap-3">
        <h2 class="text-[15px] font-medium">Plan and usage</h2>
        <span class="text-[12.5px] text-ink-3">Counted by the runner, enforced by the runner.</span>
      </div>
      <div v-if="usage" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Suites" :value="usage.suites.used" :note="fmt(usage.suites)" />
        <StatTile label="Runs today" :value="usage.runs.used" :note="fmt(usage.runs)" />
        <StatTile label="Allowed origins" :value="usage.origins.used" :note="fmt(usage.origins)" />
        <StatTile label="History" :value="usage.retentionDays === null ? '∞' : `${usage.retentionDays}d`"
                  :note="usage.vault ? 'vault included' : 'no vault on this plan'" />
      </div>
      <p v-else class="text-[13px] text-ink-3">The runner is not answering, so there is nothing to count.</p>
      <p class="mt-3 text-[12.5px] text-ink-3">
        Plans are set by an operator in the control plane's admin; a change takes effect on the next
        token, within ten minutes at most.
      </p>
    </section>

    <p v-if="!session.required" class="text-[13px] text-ink-3">
      No control plane is configured, so this is one workspace with nobody to invite. Set
      <code>VITE_AUTH_URL</code> and <code>GC_AUTH_PUBLIC_KEYS</code> (or run <code>npm run app -- --auth</code>) to sign in.
    </p>

    <!-- Members -->
    <section v-if="session.required" class="card mb-4 p-5">
      <div class="flex items-center justify-between gap-4">
        <h2 class="text-[15px] font-medium">{{ members.length }} member{{ members.length === 1 ? '' : 's' }}</h2>
        <span v-if="seats" class="text-[12.5px] text-ink-3">{{ seats }}</span>
      </div>
      <ul class="mt-3 divide-y divide-hairline">
        <li v-for="m in members" :key="m.id" class="flex flex-wrap items-center gap-3 py-3">
          <span class="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[11.5px] font-medium text-brand-2">
            {{ (m.name || m.email).slice(0, 1).toUpperCase() }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13.5px] font-medium">
              {{ m.name || m.email }}
              <span v-if="m.you" class="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-2">you</span>
            </p>
            <p class="truncate text-[12.5px] text-ink-3">{{ m.email }} · joined {{ when(m.joinedAt) }}</p>
          </div>
          <!-- An owner sets everyone's role but their own; everyone else reads it. -->
          <select v-if="session.owns && !m.you" :value="m.role" :disabled="busy === `role:${m.id}`"
                  class="rounded-full border border-hairline bg-panel px-3 py-1.5 text-[12.5px] outline-none focus:border-ink/25"
                  @change="setRole(m, $event.target.value)">
            <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
          </select>
          <span v-else class="rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-2">{{ m.role }}</span>
          <Btn v-if="m.you ? !org?.personal : (session.owns || (session.manages && m.role === 'member'))"
               variant="ghost" size="sm" :busy="busy === `remove:${m.id}`" busy-label="…" @click="remove(m)">
            {{ m.you ? 'Leave' : 'Remove' }}
          </Btn>
        </li>
      </ul>
    </section>

    <!-- Invitations: owners and admins only. The token goes to the invitee's
         mailbox and never appears here. -->
    <section v-if="session.required && session.manages" class="card p-5">
      <h2 class="text-[15px] font-medium">Invitations</h2>
      <p class="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-2">
        An invitation is mailed to the address, is good for seven days, and becomes a membership
        the moment that address is verified. An admin invites members; an owner invites any role.
      </p>
      <!-- Switched off for everyone (docs/HARDENING.md): what was sent is still
           listed below and can still be revoked, but nothing new goes out. -->
      <p v-if="session.config.invitations === false" class="mt-4 rounded-lg bg-ink/[0.04] px-3 py-2 text-[12.5px] text-ink-2">
        Invitations are switched off on this deployment for now.
      </p>
      <div v-else class="mt-4 flex flex-wrap items-end gap-2">
        <Field label="Email" class="min-w-56 flex-1">
          <input v-model="invite.email" type="email" placeholder="colleague@acme.example" spellcheck="false" @keyup.enter="sendInvite">
        </Field>
        <Field label="Role">
          <select v-model="invite.role" class="rounded-lg border border-hairline bg-panel px-3 py-2 text-[13.5px] outline-none focus:border-ink/25">
            <option v-for="r in grantable" :key="r" :value="r">{{ r }}</option>
          </select>
        </Field>
        <Btn class="mb-0.5" :busy="busy === 'invite'" busy-label="Sending…" :disabled="!invite.email.trim()" @click="sendInvite">Invite</Btn>
      </div>
      <p v-if="invited" class="mt-2 text-[12.5px] text-good">Invitation sent to {{ invited }}.</p>

      <ul v-if="invitations.length" class="mt-4 divide-y divide-hairline border-t border-hairline">
        <li v-for="i in invitations" :key="i.id" class="flex items-center gap-3 py-2.5">
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13.5px]">{{ i.email }} <span class="text-ink-3">as {{ i.role }}</span></p>
            <p class="text-[12px] text-ink-3">
              {{ i.state }}<template v-if="i.state === 'pending'"> · expires {{ when(i.expiresAt) }}</template>
              <template v-if="i.invitedBy"> · by {{ i.invitedBy }}</template>
            </p>
          </div>
          <Btn v-if="i.state === 'pending'" variant="ghost" size="sm" :busy="busy === `revoke:${i.id}`" busy-label="…" @click="revoke(i)">Revoke</Btn>
        </li>
      </ul>
      <p v-else class="mt-4 text-[12.5px] text-ink-3">No invitations yet.</p>
      <p v-if="pending.length" class="mt-2 text-[12px] text-ink-3">A pending invitation holds a seat on the plan until it is accepted, revoked or expires.</p>
    </section>
  </div>
</template>
