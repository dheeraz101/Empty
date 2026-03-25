// core/core.js  ←  REPLACE THE ENTIRE FILE WITH THIS

import { EventBus } from './eventBus.js';
import { createApi } from './api.js';

async function bootstrap() {
  const boardEl = document.getElementById('board');

  const bus = new EventBus();
  const storage = {
    get: (key) => JSON.parse(localStorage.getItem(key) || 'null'),
    set: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
    remove: (key) => localStorage.removeItem(key),
    list: () => Object.keys(localStorage)
  };

  const api = createApi({ boardEl, bus, storage });

  console.log('%c🚀 Blank Board core ready (micro-kernel)', 'color:#00d4ff;font-weight:bold');

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

  // === FIXED: Force base URL to the ROOT of the site (where index.html is) ===
  const rootUrl = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

  async function loadSinglePlugin(def) {
    try {
      // Make sure the URL is absolute from the root
      let pluginUrl = def.url;
      if (pluginUrl.startsWith('./')) {
        pluginUrl = pluginUrl.substring(2);           // remove ./
      }
      const fullUrl = rootUrl + pluginUrl;

      console.log(`Trying to load: ${fullUrl}`);     // ← helpful debug line

      const plugin = await import(fullUrl);

      if (!plugin.meta || !plugin.setup) {
        console.warn(`Invalid plugin: ${def.id}`);
        return;
      }

      console.log(`✅ Loaded plugin → ${plugin.meta.name || def.id} v${plugin.meta.version}`);
      plugin.setup(api);
    } catch (err) {
      console.error(`Failed to load plugin ${def.id}:`, err);
    }
  }

  // Initial load of enabled plugins
  for (const def of registry) {
    if (def.enabled) await loadSinglePlugin(def);
  }

  // ── Plugin management API ──
  api.registry = {
    getAll: () => JSON.parse(JSON.stringify(registry)),
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
      api.bus.emit('plugin:unload', id);
    }
    return true;
  };

  api.deletePlugin = (id) => {
    const idx = registry.findIndex(p => p.id === id);
    if (idx === -1) return false;
    api.bus.emit('plugin:unload', id);
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

  window.blankBoard = { bus, api };
}

bootstrap();