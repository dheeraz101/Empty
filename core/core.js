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

  console.log('%c🚀 Blank Board core ready (micro-kernel v3)', 'color:#00d4ff;font-weight:bold');

  let registry = [];
  const REGISTRY_KEY = 'board-plugins-registry';

  async function initRegistry() {
    const saved = localStorage.getItem(REGISTRY_KEY);
    if (saved) {
      try {
        registry = JSON.parse(saved);
      } catch {
        console.warn('⚠️ Registry corrupted, resetting...');
        registry = [];
      }
    } else {
      registry = [];
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    }
  }

  await initRegistry();

  const rootUrl = window.location.origin + window.location.pathname.substring(
    0, window.location.pathname.lastIndexOf('/') + 1
  );

  const pluginModules = new Map();

  // Stable URL for the Plugin Manager — CHANGE THIS TO YOUR ACTUAL RAW GITHUB URL
  const DEFAULT_MANAGER_URL = 'https://raw.githubusercontent.com/dheeraz101/Empty_Plugins/refs/heads/main/plugin-manager.js';

  // ── Full-proof Plugin Manager recovery (critical for public release) ──
  let managerEntry = registry.find(p => p.id === 'plugin-manager');
  if (!managerEntry) {
    console.log('%c🌱 Auto-installing Plugin Manager (first time or was deleted)', 'color:#00d4ff');
    managerEntry = {
      id: 'plugin-manager',
      url: DEFAULT_MANAGER_URL,
      name: 'Plugin Manager',
      enabled: true
    };
    registry.push(managerEntry);
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } else if (!managerEntry.enabled) {
    console.log('%c🔄 Re-enabling Plugin Manager', 'color:#00d4ff');
    managerEntry.enabled = true;
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  }

  async function importPlugin(url) {
    const sameOrigin = url.startsWith(location.origin);
    if (!sameOrigin) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const code = await res.text();
      const blob = new Blob([code], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      try { return await import(blobUrl); }
      finally { URL.revokeObjectURL(blobUrl); }
    }
    return await import(url);
  }

    function isTrustedPlugin(def) {
      // trusted if coming from registry (plugin manager controlled)
      if (def.source === 'registry') return true;

      // allow manual installs but warn
      if (def.source === 'manual') return true;

      return false;
    }

  async function loadSinglePlugin(def) {
    try {
      let fullUrl = def.url;
      if (fullUrl.startsWith('./')) fullUrl = rootUrl + fullUrl.substring(2);
      else if (fullUrl.startsWith('/')) fullUrl = rootUrl + fullUrl.substring(1);

      console.log(`🔌 Loading plugin: ${fullUrl}`);

      if (!isTrustedPlugin(def)) {
        console.warn(`Blocked plugin: ${def.id}`);
        return;
      }

      if (def.source === 'manual') {
        api.notify(`⚠️ Installing external plugin: ${def.id}`, 'warning', 4000);
      }

      const plugin = await importPlugin(fullUrl);

      if (!plugin.meta || !plugin.setup || typeof plugin.setup !== 'function') {
        throw new Error(`Invalid plugin: missing meta or setup`);
      }

      console.log(`✅ Loaded → ${plugin.meta.name || def.id} v${plugin.meta.version}`);

      api._setCurrentPlugin(def.id);

      api.setPluginPermissions?.(def.id, {
        isSystem: def.id === 'plugin-manager',
        canModifyOthers: def.id === 'plugin-manager',
        canMoveOthers: true
      });

      await Promise.race([
        plugin.setup?.(api),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Plugin timeout')), 5000)
        )
      ]);

      api._setCurrentPlugin(null);

      pluginModules.set(def.id, plugin);

      bus.emit('plugin:loaded', {
        id: def.id,
        meta: plugin.meta,
        container: api.getContainer(def.id)
      });
    } catch (err) {
      console.error(`❌ Failed to load plugin ${def.id}:`, err);
      api.notify(`Plugin "${def.id}" failed to load — check console`, 'error', 6000);
    }
  }

  function unloadSinglePlugin(id) {
    const plugin = pluginModules.get(id);
    if (plugin && typeof plugin.teardown === 'function') {
      try { plugin.teardown(); } catch (e) {}
    }
    pluginModules.delete(id);
    api.removeContainer(id);
    bus.emit('plugin:unloaded', id);
  }

  const seen = new Set();
    registry = registry.filter(p => {
      if (seen.has(p.id)) {
        console.warn(`Duplicate plugin removed: ${p.id}`);
        return false;
      }
      seen.add(p.id);
      return true;
    });

  // Load enabled plugins
  for (const def of registry) {
    if (def.enabled) await loadSinglePlugin(def);
  }

  // ── Important lifecycle event for plugins ──
  bus.emit('board:allPluginsLoaded', { 
    total: registry.length, 
    enabled: registry.filter(p => p.enabled).length 
  });

  // Plugin management API
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
    if (!url.endsWith('.js')) {
      api.notify('Invalid plugin URL (must be .js)', 'error');
      return false;
    }

    if (!/^https?:\/\//.test(url)) {
      api.notify('Invalid URL format', 'error');
      return false;
    }

    if (registry.find(p => p.id === id)) {
      console.warn('Plugin ID already exists');
      return false;
    }

    const newDef = { id, url, name, enabled: true, source: 'manual' };

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

    // ── Public restart utility ──
  api.restart = async () => {
    console.log('%c♻️ Restarting Blank Board...', 'color:#00d4ff');
    // Unload all plugins
    for (const id of [...pluginModules.keys()]) {
      unloadSinglePlugin(id);
    }
    // Reload all enabled plugins
    for (const def of registry) {
      if (def.enabled) await loadSinglePlugin(def);
    }
    bus.emit('board:restarted');
    api.notify('Board restarted successfully', 'success');
  };

  window.blankBoard = { bus, api };

  bus.emit('board:ready', { boardEl });

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

  const origSet = storage.set;
  storage.set = (key, value) => {
    const oldValue = storage.get(key);
    origSet(key, value);
    bus.emit('storage:change', { key, value, oldValue });
  };

  console.log('%c🧩 Blank Board ready — everything is now a plugin!', 'color:#00d4ff;font-weight:bold');
}

bootstrap();