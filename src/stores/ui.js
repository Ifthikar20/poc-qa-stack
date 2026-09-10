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
const DOCK_TAB = 'gc.dock.tab';
const DOCK_OPEN = 'gc.dock.open';
const DOCK_HEIGHT = 'gc.dock.height';

export const useUi = defineStore('ui', {
  state: () => ({
    navCollapsed: (() => {
      try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
    })(),
    /**
     * The dock along the bottom of the console: which tab is showing, whether
     * it is open or folded down to its tabs, and how tall it was dragged.
     *
     * Folded until this viewer opens it or a run starts. Open from the first
     * visit, it sat over the Open and Record buttons on a laptop-height window
     * before there was anything in it to read — and folded is not hidden: the
     * tabs stay on screen, with the run's result and the error count on them.
     */
    dockTab: (() => {
      try { return localStorage.getItem(DOCK_TAB) === 'console' ? 'console' : 'run'; } catch { return 'run'; }
    })(),
    dockOpen: (() => {
      try { return localStorage.getItem(DOCK_OPEN) === '1'; } catch { return false; }
    })(),
    dockHeight: (() => {
      try { return Number(localStorage.getItem(DOCK_HEIGHT)) || 240; } catch { return 240; }
    })(),
  }),

  actions: {
    toggleNav() {
      this.navCollapsed = !this.navCollapsed;
      try { localStorage.setItem(KEY, this.navCollapsed ? '1' : '0'); } catch { /* private window */ }
    },

    /** Pick a tab. Picking the one already showing folds the dock down to its tabs. */
    showDock(tab) {
      if (this.dockOpen && this.dockTab === tab) this.dockOpen = false;
      else { this.dockTab = tab; this.dockOpen = true; }
      this.keepDock();
    },

    toggleDock() {
      this.dockOpen = !this.dockOpen;
      this.keepDock();
    },

    /** Bring a tab forward, open. For a run starting, which should never fold anything. */
    reveal(tab) {
      this.dockTab = tab;
      this.dockOpen = true;
      this.keepDock();
    },

    /**
     * Size the dock without keeping it: a drag calls this on every move and
     * keeps once at the end. Never shorter than a few lines, never taller than
     * most of the window — the page it sits over still has to be usable.
     */
    sizeDock(px) {
      this.dockHeight = Math.round(Math.min(Math.max(px, 96), Math.max(96, window.innerHeight * 0.6)));
    },

    keepDock() {
      try {
        localStorage.setItem(DOCK_TAB, this.dockTab);
        localStorage.setItem(DOCK_OPEN, this.dockOpen ? '1' : '0');
        localStorage.setItem(DOCK_HEIGHT, String(this.dockHeight));
      } catch { /* private window */ }
    },
  },
});
