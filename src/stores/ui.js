/**
 * How the shell is arranged, remembered per viewer.
 *
 * Nothing here is about the runner or the suites — it is what THIS person did
 * to the window, and it belongs in the browser rather than on the server. Two
 * people on one deployment should not fight over whether the sidebar is open.
 *
 * The read-in-an-IIFE / write-in-the-action shape, and both halves wrapped, is
 * the pattern `gc.pace` already uses in stores/live.js. localStorage throws
 * rather than returning null in a private window, so an unwrapped read at store
 * construction takes the whole app down before it renders.
 */
import { defineStore } from 'pinia';

const KEY = 'gc.nav.collapsed';

export const useUi = defineStore('ui', {
  state: () => ({
    navCollapsed: (() => {
      try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
    })(),
  }),

  actions: {
    toggleNav() {
      this.navCollapsed = !this.navCollapsed;
      try { localStorage.setItem(KEY, this.navCollapsed ? '1' : '0'); } catch { /* private window */ }
    },
  },
});
