import { createRouter, createWebHistory } from 'vue-router';
import { useSession } from '@/stores/session';

/**
 * Routes mirror the sidebar, and every one of them is linkable — a suite page
 * you can paste into a ticket is most of what makes this feel like a product
 * rather than a demo.
 */
const routes = [
  { path: '/', redirect: '/suites' },
  { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
  { path: '/suites', name: 'suites', component: () => import('@/views/SuitesView.vue') },
  { path: '/suites/new', name: 'suite-new', component: () => import('@/views/OnboardView.vue') },
  {
    path: '/suites/:id',
    component: () => import('@/views/SuiteView.vue'),
    props: true,
    children: [
      { path: '', name: 'suite', component: () => import('@/views/SuiteOverview.vue') },
      { path: 'pages', name: 'suite-pages', component: () => import('@/views/SuitePages.vue') },
      { path: 'cases', name: 'suite-cases', component: () => import('@/views/SuiteCases.vue') },
      { path: 'runs', name: 'suite-runs', component: () => import('@/views/SuiteRuns.vue') },
    ],
  },
  { path: '/defects', name: 'defects', component: () => import('@/views/DefectsView.vue') },
  { path: '/console', name: 'console', component: () => import('@/views/ConsoleView.vue') },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { open: true } },
  // Where a 403 mfa_required sends you: the account has to enrol an
  // authenticator before the control plane lets it do anything else.
  { path: '/security/mfa', name: 'security-mfa', component: () => import('@/views/SecurityMfaView.vue') },
  { path: '/:rest(.*)', redirect: '/suites' },
];

const router = createRouter({
  history: createWebHistory('/app/'),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

/**
 * Nothing renders until we know who you are.
 *
 * `boot()` resolves once and is cheap afterwards, but the await matters on a
 * cold load: without it the first navigation decides against `user === null`
 * before /auth/me has answered, so a signed-in person sees the login form
 * flash and then get replaced. Waiting once is better than that.
 *
 * With no control plane configured, `required` is false and this is a no-op —
 * the guard never redirects and /login is unreachable.
 */
router.beforeEach(async (to) => {
  const session = useSession();
  if (!session.ready) await session.boot();
  if (!session.required) return to.name === 'login' ? '/suites' : true;
  if (session.signedIn) return to.name === 'login' ? '/suites' : true;
  if (to.meta.open) return true;
  // Remember where they were going; the form sends them back after.
  return { name: 'login', query: to.fullPath === '/suites' ? {} : { next: to.fullPath } };
});

export default router;
