import { createRouter, createWebHistory } from 'vue-router';
import { safeNext, useSession } from '@/stores/session';

/**
 * Routes mirror the sidebar, and every one of them is linkable — a suite page
 * you can paste into a ticket is most of what makes this feel like a product
 * rather than a demo.
 *
 * `meta.open` marks the pages that render with nobody signed in: sign in, sign
 * up, the code, the reset, and the invitation landing. The control plane's
 * mails link straight to them (auth/config/settings.py HEADLESS_FRONTEND_URLS),
 * so their paths are a contract, not a choice.
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

  // The account pages (docs/AUTH.md §4, §5, §7).
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { open: true, anonymousOnly: true } },
  { path: '/signup', name: 'signup', component: () => import('@/views/SignupView.vue'), meta: { open: true, anonymousOnly: true } },
  { path: '/verify', name: 'verify', component: () => import('@/views/VerifyView.vue'), meta: { open: true } },
  { path: '/forgot-password', name: 'forgot-password', component: () => import('@/views/ForgotPasswordView.vue'), meta: { open: true, anonymousOnly: true } },
  { path: '/reset-password/:key', name: 'reset-password', component: () => import('@/views/ResetPasswordView.vue'), meta: { open: true } },
  { path: '/invite', name: 'invite', component: () => import('@/views/InviteView.vue'), meta: { open: true } },
  { path: '/security', name: 'security', component: () => import('@/views/SecurityView.vue') },
  { path: '/security/password', name: 'security-password', component: () => import('@/views/ChangePasswordView.vue') },
  { path: '/security/email', name: 'security-email', component: () => import('@/views/ChangeEmailView.vue') },
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
 * the guard never redirects and the account pages are unreachable.
 */
router.beforeEach(async (to) => {
  const session = useSession();
  if (!session.ready) await session.boot();
  if (!session.required) return to.meta.open ? '/suites' : true;
  if (session.signedIn) {
    // The password that signed in is breached: one page, until it changes.
    if (session.mustChangePassword && to.name !== 'security-password') return { name: 'security-password' };
    // A signed-in arrival at an anonymous-only page is the return from a
    // Google sign-in landing on /login (docs/AUTH.md §6): the session is
    // already there, so go where the person was headed — a path inside
    // this app, or the suites.
    return to.meta.anonymousOnly ? (safeNext(to.query.next) || '/suites') : true;
  }
  if (to.meta.open) return true;
  // A code is waiting to be entered (a reload mid-sign-up): that screen, not the form.
  if (session.flow === 'verify_email' && to.name !== 'verify') return { name: 'verify' };
  // Remember where they were going; the form sends them back after.
  return { name: 'login', query: to.fullPath === '/suites' ? {} : { next: to.fullPath } };
});

export default router;
