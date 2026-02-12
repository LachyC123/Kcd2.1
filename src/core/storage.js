(() => {
  'use strict';
  const LW = window.LW;

  const KEY = 'lw_frontier_save_v1';
  const OPTS_KEY = 'lw_frontier_opts_v1';

  LW.storage = {
    loadOptions() {
      try {
        const raw = localStorage.getItem(OPTS_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    saveOptions(opts) {
      try {
        localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
        return true;
      } catch {
        return false;
      }
    },
    hasSave() {
      try {
        return !!localStorage.getItem(KEY);
      } catch {
        return false;
      }
    },
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    save(data) {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try {
        localStorage.removeItem(KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
})();

