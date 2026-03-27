// core/core.js

import { EventBus } from './eventBus.js';
import { createApi } from './api.js';

async function bootstrap() {
  const boardEl = document.getElementById('board');

  const bus = new EventBus();
  const storage = {
    get: (key) => JSON.parse(localStorage.getItem(key) || 'null'),
    set: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
    remove: (key) => localStorage.removeItem(key),
    list: () => Object.keys(localStorage),
    clear: () => localStorage.clear()
  };

  const api = createApi({ boardEl, bus, storage });

  console.log('%c🚀 Blank Board core ready (micro-kernel v2)', 'color:#00d4ff;font-weight:bold');

  // ── Dynamic plugin registry ──
  let registry = [];
  const REGISTRY_KEY = 'board-plugins-registry';

  async function initRegistry() {
    const saved = localStorage.getItem(REGISTRY_KEY);
    if (saved) {
      registry = JSON.parse(saved);
    } else {
      try {
        const res = await fetch('./plugins.json');
        registry = await res.json();
      } catch (e) {
        registry = [];
      }
      registry.forEach(p => { if (typeof p.enabled === 'undefined') p.enabled = true; });
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    }
  }

  await initRegistry();

  // Base URL for relative plugin paths
  const rootUrl = window.location.origin + window.location.pathname.substring(
    0,
    window.location.pathname.lastIndexOf('/') + 1
  );

  // Store loaded plugin modules for teardown
  const pluginModules = new Map();

  // Smart import that handles MIME type issues (raw GitHub URLs serve text/plain)
    async function importPlugin(url) {
      // If cross-origin (GitHub Raw, etc.), always use fetch+blob
      const sameOrigin = url.startsWith(location.origin);
      if (!sameOrigin) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const code = await res.text();
        const blob = new Blob([code], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        try {
          return await import(blobUrl);
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      }

      // Same-origin: try normal import first (for local / Netlify plugins)
      return await import(url);
    }

  async function loadSinglePlugin(def) {
    try {
      let fullUrl = def.url;

      // Only prepend rootUrl for relative paths, not absolute URLs
      if (fullUrl.startsWith('./')) {
        fullUrl = rootUrl + fullUrl.substring(2);
      } else if (fullUrl.startsWith('/')) {
        fullUrl = rootUrl + fullUrl.substring(1);
      }
      // http:// and https:// URLs are left as-is

      console.log(`🔌 Loading plugin: ${fullUrl}`);

      const plugin = await importPlugin(fullUrl);

      if (!plugin.meta || !plugin.setup) {
        console.warn(`⚠️ Invalid plugin (missing meta or setup): ${def.id}`);
        return;
      }

      console.log(`✅ Loaded → ${plugin.meta.name || def.id} v${plugin.meta.version}`);

      api._setCurrentPlugin(def.id);
      plugin.setup(api);
      api._setCurrentPlugin(null);

      pluginModules.set(def.id, plugin);

      bus.emit('plugin:loaded', {
        id: def.id,
        meta: plugin.meta,
        container: api.getContainer(def.id)
      });

    } catch (err) {
      console.error(`❌ Failed to load plugin ${def.id}:`, err);
    }
  }

  function unloadSinglePlugin(id) {
    const plugin = pluginModules.get(id);
    if (plugin && typeof plugin.teardown === 'function') {
      try {
        plugin.teardown();
        console.log(`🧹 Teardown complete for: ${id}`);
      } catch (err) {
        console.error(`❌ Teardown failed for ${id}:`, err);
      }
    }
    pluginModules.delete(id);

    // Clean up container and CSS
    api.removeContainer(id);

    bus.emit('plugin:unloaded', id);
  }

  // Initial load of enabled plugins
  for (const def of registry) {
    if (def.enabled) await loadSinglePlugin(def);
  }

  // ── Plugin management API ──
  api.registry = {
    getAll: () => JSON.parse(JSON.stringify(registry)),

    get: (id) => {
      const entry = registry.find(p => p.id === id);
      return entry ? { ...entry } : null;
    },

    save: (newRegistry) => {
      registry = newRegistry;
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    }
  };

  api.togglePlugin = async (id) => {
    const idx = registry.findIndex(p => p.id === id);
    if (idx === -1) return false;
    const def = registry[idx];
    def.enabled = !def.enabled;
    api.registry.save(registry);

    if (def.enabled) {
      await loadSinglePlugin(def);
    } else {
      unloadSinglePlugin(id);
    }
    return true;
  };

  api.deletePlugin = (id) => {
    const idx = registry.findIndex(p => p.id === id);
    if (idx === -1) return false;
    unloadSinglePlugin(id);
    registry.splice(idx, 1);
    api.registry.save(registry);
    return true;
  };

  api.installPlugin = async (id, url, name = id) => {
    if (registry.find(p => p.id === id)) {
      console.warn('Plugin ID already exists');
      return false;
    }
    const newDef = { id, url, name, enabled: true };
    registry.push(newDef);
    api.registry.save(registry);
    await loadSinglePlugin(newDef);
    return true;
  };

  api.reloadPlugin = async (id) => {
    const idx = registry.findIndex(p => p.id === id);
    if (idx === -1) return false;
    unloadSinglePlugin(id);
    await loadSinglePlugin(registry[idx]);
    return true;
  };

  // Expose globally for debugging and plugin manager
  window.blankBoard = { bus, api };

  // ── Built-in events ──

  // board:ready
  bus.emit('board:ready', { boardEl });

  // board:resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      bus.emit('board:resize', {
        width: window.innerWidth,
        height: window.innerHeight
      });
    }, 150);
  });

  // storage:change — wrap storage.set to emit events
  const origSet = storage.set;
  storage.set = (key, value) => {
    const oldValue = storage.get(key);
    origSet(key, value);
    bus.emit('storage:change', { key, value, oldValue });
  };

  console.log('%c🧩 Blank Board ready — right-click for menu, check window.blankBoard', 'color:#00d4ff;font-weight:bold');
}

bootstrap();