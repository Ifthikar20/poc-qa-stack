/**
 * Suites, cached.
 *
 * Views read `list` for the sidebar and `current` for whatever is open. The
 * store owns refreshing after a write so a component never has to remember to,
 * which is the usual source of "I added a page and nothing happened".
 */
import { defineStore } from 'pinia';
import { api } from '@/api';

export const useSuites = defineStore('suites', {
  state: () => ({
    list: [],
    current: null,      // the full suite, pages and cases included
    allowed: false,     // is the current suite's origin through the gate?
    loading: false,
    error: null,
  }),

  getters: {
    origin: (s) => { try { return new URL(s.current.baseUrl).origin; } catch { return null; } },
    pageById: (s) => (id) => s.current?.pages.find((p) => p.id === id) ?? null,
    // A suite is only worth running once something in it can run.
    ready: (s) => !!s.current && s.current.cases.length > 0 && s.allowed,
  },

  actions: {
    async loadList() {
      this.list = (await api.suites()).suites;
      return this.list;
    },

    async load(id) {
      this.loading = true; this.error = null;
      try {
        const r = await api.suite(id);
        this.current = r.suite;
        this.allowed = r.allowed;
      } catch (e) {
        this.error = e.message; this.current = null;
      } finally {
        this.loading = false;
      }
      return this.current;
    },

    /** Re-read the open suite after any write. Cheap, and always correct. */
    async refresh() {
      if (this.current) await this.load(this.current.id);
      await this.loadList();
    },

    async create(body) {
      const { suite } = await api.createSuite(body);
      await this.loadList();
      return suite;
    },

    async allow(origin) {
      await api.allowOrigin(origin);
      this.allowed = true;
    },
  },
});
