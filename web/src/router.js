import { createRouter, createWebHistory } from 'vue-router';

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
  { path: '/:rest(.*)', redirect: '/suites' },
];

export default createRouter({
  history: createWebHistory('/app/'),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
