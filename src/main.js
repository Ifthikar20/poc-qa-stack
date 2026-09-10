import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './app.css';

// Pinia before the router: the navigation guard calls useSession(), which
// needs an active pinia. Installing the router first makes the first guard run
// against no store and throw before anything renders.
const app = createApp(App).use(createPinia()).use(router);

/**
 * Mount only once the first navigation has resolved.
 *
 * Without this, Vue paints immediately and the router has not matched anything
 * yet, so `route.name` is undefined for the first few hundred milliseconds —
 * the two round trips the guard spends in session.boot(), plus the lazy chunk
 * for whichever view wins. App.vue decides whether to draw the application
 * shell from that name, and "not one of the bare pages" was true of undefined,
 * so arriving at /app/login painted the whole signed-in dashboard — sidebar,
 * workspace, empty suite list — and then replaced it with the sign-in form.
 * A stranger's first frame was somebody's console.
 *
 * The cost is honest: a blank page for exactly as long as the flash used to
 * last. Blank is the truth at that moment. The dashboard was not.
 *
 * `.then()` rather than a top-level await, which needs a build target that
 * supports it and would be a strange thing to make the whole bundle depend on.
 *
 * Two ways this could strand a blank page, and both mount anyway rather than
 * leave one:
 *
 *   The navigation THROWS. isReady() rejects, and an app that never mounted is
 *   a white page with no way back — strictly worse than the flash this fixes.
 *
 *   The navigation never finishes. The guard awaits session.boot(), which is
 *   two fetches at the control plane, and fetch has no timeout of its own: a
 *   host that accepts the connection and then says nothing hangs them for as
 *   long as the socket is open. Rejection never comes, so a catch is no help;
 *   only a clock is. Before this file waited for anything that case showed a
 *   dashboard forever, which was wrong but at least visible. Blank forever
 *   would be a worse trade, so there is a deadline.
 *
 * Mounting early is safe precisely because App.vue refuses to draw the shell
 * for a route that has not matched. The two changes hold each other up: this
 * one removes the flash, that one makes the flash unrepresentable.
 */
const DEADLINE_MS = 4000;
const deadline = new Promise((resolve) => setTimeout(() => {
  console.warn(`the first navigation has not resolved in ${DEADLINE_MS}ms; mounting anyway`);
  resolve();
}, DEADLINE_MS));

Promise.race([
  router.isReady().catch((err) => { console.error('the first navigation failed; mounting anyway', err); }),
  deadline,
]).then(() => app.mount('#app'));
