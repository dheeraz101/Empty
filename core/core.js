import { EventBus } from './eventBus.js';
import { createApi, CORE_VERSION } from './api.js';

const REGISTRY_KEY = 'board-plugins-registry';
const HEALTH_KEY = 'board-plugins-health';
const DEFAULT_MANAGER_URL = 'https://raw.githubusercontent.com/dheeraz101/Empty_Plugins/refs/heads/main/plugin-manager.js';
const LOAD_TIMEOUT_MS = 8000;
const MAX_CRASHES_BEFORE_BLOCK = 3;

const DEFAULT_PLUGIN_MANAGER = Object.freeze({
  id: 'plugin-manager',
  name: 'Plugin Manager',
  url: DEFAULT_MANAGER_URL,
  enabled: true,
  source: 'system',
  status: 'active',
  permissions: [
    'system', 'storage', 'ui', 'bus', 'hooks', 'layout', 'network',
    'globalCSS', 'theme', 'modifyOthers', 'moveOthers', 'rawBoard', 'clipboard'
  ]
});

async function bootstrap() {
  const boardEl = document.getElementById('board');
  if (!boardEl) throw new Error('Blank Board boot failed: #board element not found.');

  const bus = new EventBus();
  const storage = createCoreStorage(bus);
  const api = createApi({ boardEl, bus, storage });

  console.log(`%c🚀 Blank Board core ready (micro-kernel v${CORE_VERSION})`, 'color:#00d4ff;font-weight:bold');

  let registry = sanitizeRegistry(loadJson(REGISTRY_KEY, []));
  let health = normalizeHealth(loadJson(HEALTH_KEY, {}));
  const pluginModules = new Map();
  const pluginCleanups = new Map();
  const rootUrl = new URL('../', import.meta.url).href;

  ensurePluginManager();
  saveRegistry();

  api.registry = Object.freeze({
    getAll: () => structuredCloneSafe(registry),
    get: (id) => structuredCloneSafe(findEntry(id) || null),
    save: (newRegistry) => {
      registry = sanitizeRegistry(newRegistry);
      ensurePluginManager();
      saveRegistry();
      bus.emit('registry:changed', { registry: structuredCloneSafe(registry) });
    }
  });

  api.installPlugin = async (id, url, name = id, options = {}) => {
    const cleanId = normalizePluginId(id);
    if (!cleanId) return fail('Invalid plugin id.');
    if (registry.some((p) => p.id === cleanId)) return fail(`Plugin "${cleanId}" already exists.`);

    const validation = validatePluginUrl(url, { allowData: !!options.allowData });
    if (!validation.ok) return fail(validation.reason);

    const entry = sanitizePluginEntry({
      id: cleanId,
      name: name || cleanId,
      url,
      enabled: true,
      source: options.source || 'manual',
      status: 'installing',
      permissions: Array.isArray(options.permissions) ? options.permissions : ['storage', 'ui', 'bus', 'hooks', 'layout'],
      version: options.version || null,
      icon: options.icon,
      trust: options.trust,
      category: options.category,
      compat: options.compat,
      changelog: options.changelog
    });

    registry.push(entry);
    saveRegistry();

    const ok = await loadSinglePlugin(entry);
    entry.status = ok ? 'active' : 'failed';
    if (!ok && !entry.error) entry.error = 'Plugin failed during install.';
    saveRegistry();
    return ok;
  };

  api.togglePlugin = async (id) => {
    const entry = findEntry(id);
    if (!entry) return false;
    if (entry.id === 'plugin-manager') return fail('Plugin Manager cannot be disabled.');

    if (entry.enabled) {
      entry.enabled = false;
      entry.status = 'disabled';
      saveRegistry();
      unloadSinglePlugin(entry.id);
      return true;
    }

    entry.enabled = true;
    entry.status = 'loading';
    saveRegistry();
    const ok = await loadSinglePlugin(entry);
    if (!ok) {
      entry.enabled = false;
      entry.status = isBlocked(entry.id) ? 'blocked' : 'failed';
      saveRegistry();
    }
    return ok;
  };

  api.deletePlugin = (id, options = {}) => {
    const cleanId = normalizePluginId(id);
    if (cleanId === 'plugin-manager') return fail('Plugin Manager cannot be deleted.');

    const idx = registry.findIndex((p) => p.id === cleanId);
    if (idx === -1) return false;

    const deleted = registry[idx];
    unloadSinglePlugin(cleanId, { keepStatus: false, reason: 'delete' });

    registry.splice(idx, 1);
    delete health[cleanId];

    let purged = 0;
    if (options.purgeData === true) {
      purged = api.purgePluginData?.(cleanId) || 0;
    }

    saveHealth();
    saveRegistry();

    bus.emit('plugin:deleted', {
      id: cleanId,
      plugin: structuredCloneSafe(deleted),
      purgeData: options.purgeData === true,
      purged
    });

    return true;
  };

  api.reloadPlugin = async (id) => {
    const entry = findEntry(id);
    if (!entry) return false;

    unloadSinglePlugin(entry.id, { keepStatus: true, reason: 'reload' });
    const ok = await loadSinglePlugin(entry);
    return ok;
  };

  api.restart = async () => {
    console.log('%c♻️ Restarting Blank Board...', 'color:#00d4ff');
    for (const id of [...pluginModules.keys()]) unloadSinglePlugin(id, { keepStatus: true, reason: 'restart' });
    for (const entry of registry) if (entry.enabled) await loadSinglePlugin(entry);
    bus.emit('board:allPluginsLoaded', getLoadStats());
    return true;
  };

  api.registerUI = (slot, el, uiId) => {
    if (!el || !(el instanceof Element)) return false;

    const owner = api.getPluginId() || 'system';
    el.dataset.owner = owner;
    el.dataset.pluginOwner = owner;
    if (uiId) el.dataset.uiId = uiId;

    const toolbar = document.getElementById('bb-toolbar') || api.getOrCreateToolbar();
    if (slot === 'toolbar' || slot === 'header-actions') toolbar.appendChild(el);
    else return false;

    api._rememberOwnedNode?.(owner, el);
    api._trackCleanup(owner, () => el.remove());
    return true;
  };

  bus.on('core:error', (payload) => {
    if (payload?.owner && payload.owner !== 'core') {
      recordCrash(payload.owner, payload.error || payload);
      const entry = findEntry(payload.owner);
      if (entry) {
        entry.status = isBlocked(entry.id) ? 'blocked' : 'failed';
        entry.error = payload?.error?.message || payload?.error || 'Plugin error.';
        if (entry.status === 'blocked') entry.enabled = false;
        saveRegistry();
      }
    }
  }, 'core');

  for (const entry of registry) {
    if (entry.enabled) await loadSinglePlugin(entry);
  }

  bus.emit('board:allPluginsLoaded', getLoadStats());

  window.blankBoard = Object.freeze({
    version: CORE_VERSION,
    restart: api.restart,
    getRegistry: () => api.registry.getAll(),
    getHealth: () => structuredCloneSafe(health),
    cleanupPlugin: (id) => api.removeContainer(id)
  });

  function ensurePluginManager() {
    const existing = registry.find((p) => p.id === 'plugin-manager');
    if (!existing) {
      registry.unshift({ ...DEFAULT_PLUGIN_MANAGER });
      return;
    }

    Object.assign(existing, {
      name: existing.name || DEFAULT_PLUGIN_MANAGER.name,
      url: existing.url || DEFAULT_PLUGIN_MANAGER.url,
      enabled: true,
      source: 'system',
      status: existing.status || 'active',
      permissions: [...DEFAULT_PLUGIN_MANAGER.permissions]
    });
  }

  async function loadSinglePlugin(entry) {
    const id = normalizePluginId(entry.id);
    if (!id) return false;

    if (isBlocked(id)) {
      entry.enabled = false;
      entry.status = 'blocked';
      entry.error = `Auto-blocked after ${MAX_CRASHES_BEFORE_BLOCK} crashes.`;
      saveRegistry();
      api.removeContainer(id);
      api.notify(`Plugin "${id}" blocked after repeated crashes.`, 'error', 6500);
      return false;
    }

    try {
      entry.status = 'loading';
      entry.error = null;
      saveRegistry();

      const fullUrl = resolvePluginUrl(entry.url);
      const validation = validatePluginUrl(fullUrl, { allowData: entry.source === 'snapshot' });
      if (!validation.ok) throw new Error(validation.reason);

      console.log(`🔌 Loading plugin: ${id} → ${fullUrl}`);

      const mod = await importPlugin(fullUrl, entry);
      validatePluginModule(mod, entry);

      const meta = sanitizeMeta(mod.meta, entry);
      entry.name = entry.name || meta.name || id;
      entry.version = meta.version || entry.version || '0.0.0';
      entry.compat = meta.compat || entry.compat || null;
      entry.permissions = normalizePermissions(entry, meta);

      const permissions = permissionsToObject(entry, meta);
      api.setPluginPermissions(id, permissions);
      api._setPluginState(id, { status: 'loading', meta, source: entry.source || 'manual' });
      api._setCurrentPlugin(id);
      api._beginPluginDomTracking?.(id);

      const sandbox = api._createSandbox(id, { meta, entry });
      const setupResult = await withTimeout(
        Promise.resolve(mod.setup(sandbox)),
        LOAD_TIMEOUT_MS,
        `Plugin "${id}" setup timed out.`
      );

      api._endPluginDomTracking?.(id);
      api._setCurrentPlugin(null);

      if (typeof setupResult === 'function') {
        api._trackCleanup(id, setupResult);
        pluginCleanups.set(id, setupResult);
      } else if (!mod.teardown) {
        console.warn(`[Core] ${id}: setup() did not return a cleanup function. Legacy plugins work, but cleanup is weaker.`);
      }

      pluginModules.set(id, mod);
      entry.status = 'active';
      entry.enabled = true;
      entry.error = null;

      health[id] = {
        ...(health[id] || {}),
        status: 'active',
        lastLoaded: Date.now(),
        crashes: health[id]?.crashes || 0,
        lastError: null
      };

      saveHealth();
      saveRegistry();

      bus.emit('plugin:loaded', { id, meta, container: api.getContainer(id) });
      console.log(`✅ Loaded → ${meta.name || id} v${meta.version || '0.0.0'}`);
      return true;
    } catch (err) {
      api._endPluginDomTracking?.(id);
      api._setCurrentPlugin(null);

      console.error(`❌ Failed to load plugin ${id}:`, err);
      api._recordPluginError(id, err);
      recordCrash(id, err);

      entry.status = isBlocked(id) ? 'blocked' : 'failed';
      entry.enabled = entry.status === 'blocked' ? false : entry.enabled;
      entry.error = err?.message || String(err);

      saveRegistry();
      api.notify(`Plugin "${id}" failed: ${entry.error}`, 'error', 7000);

      unloadSinglePlugin(id, { keepStatus: true, reason: 'failed-load' });
      return false;
    }
  }

  function unloadSinglePlugin(id, { keepStatus = false, reason = 'unload' } = {}) {
    const cleanId = normalizePluginId(id);
    const mod = pluginModules.get(cleanId);

    if (mod?.teardown) {
      try {
        mod.teardown();
      } catch (err) {
        console.warn(`[Core] teardown failed for ${cleanId}:`, err);
        bus.emit('plugin:teardown-error', { id: cleanId, error: serializeError(err) });
      }
    }

    const cleanup = pluginCleanups.get(cleanId);
    if (cleanup && cleanup !== mod?.teardown) {
      try {
        cleanup();
      } catch (err) {
        console.warn(`[Core] cleanup failed for ${cleanId}:`, err);
        bus.emit('plugin:cleanup-error', { id: cleanId, error: serializeError(err) });
      }
    }

    pluginCleanups.delete(cleanId);
    pluginModules.delete(cleanId);

    try {
      api.removeContainer(cleanId);
    } catch (err) {
      console.error(`Plugin DOM cleanup failed for ${cleanId}:`, err);
    }

    if (!keepStatus) {
      const entry = findEntry(cleanId);
      if (entry) {
        entry.status = entry.enabled ? 'disabled' : 'disabled';
        entry.error = null;
      }
      if (health[cleanId]) health[cleanId].status = 'disabled';
      saveHealth();
      saveRegistry();
    }

    bus.emit('plugin:unloaded', { id: cleanId, reason });
  }

  function recordCrash(id, err) {
    const cleanId = normalizePluginId(id);
    const item = health[cleanId] || { crashes: 0 };

    item.crashes = (item.crashes || 0) + 1;
    item.lastError = serializeError(err);
    item.lastCrash = Date.now();
    item.status = item.crashes >= MAX_CRASHES_BEFORE_BLOCK ? 'blocked' : 'failed';

    health[cleanId] = item;
    saveHealth();
  }

  function isBlocked(id) {
    return (health[normalizePluginId(id)]?.crashes || 0) >= MAX_CRASHES_BEFORE_BLOCK;
  }

  function findEntry(id) {
    return registry.find((p) => p.id === normalizePluginId(id));
  }

  function saveRegistry() {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  }

  function saveHealth() {
    localStorage.setItem(HEALTH_KEY, JSON.stringify(health));
  }

  function getLoadStats() {
    return {
      total: registry.length,
      enabled: registry.filter((p) => p.enabled).length,
      active: registry.filter((p) => p.status === 'active').length,
      failed: registry.filter((p) => p.status === 'failed').length,
      blocked: registry.filter((p) => p.status === 'blocked').length
    };
  }

  function resolvePluginUrl(url) {
    if (!url) throw new Error('Plugin URL missing.');
    if (url.startsWith('./')) return new URL(url.slice(2), rootUrl).href;
    if (url.startsWith('/')) return new URL(url.slice(1), rootUrl).href;
    return url;
  }

  function fail(message) {
    api.notify(message, 'error', 4500);
    console.warn('[Blank Board]', message);
    return false;
  }
}

function createCoreStorage(bus) {
  return Object.freeze({
    get: (key, fallback = null) => loadJson(key, fallback),
    set: (key, value) => {
      localStorage.setItem(key, JSON.stringify(value));
      bus.emit('storage:change', { key, value, pluginId: 'core' });
      return true;
    },
    remove: (key) => {
      localStorage.removeItem(key);
      return true;
    },
    list: () => Object.keys(localStorage),
    clear: () => {
      throw new Error('Core storage clear is disabled. Clear namespaced plugin data instead.');
    },
    getForPlugin(pluginId, key, fallback = null) {
      return loadJson(`plugin:${normalizePluginId(pluginId)}:${String(key)}`, fallback);
    },
    setForPlugin(pluginId, key, value) {
      localStorage.setItem(`plugin:${normalizePluginId(pluginId)}:${String(key)}`, JSON.stringify(value));
      return true;
    }
  });
}

async function importPlugin(url, entry) {
  const sameOrigin = url.startsWith(location.origin) || url.startsWith('./') || url.startsWith('/');

  if (url.startsWith('data:text/javascript')) return import(url);

  if (!sameOrigin) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} while fetching plugin.`);

    const code = await res.text();

    if ((entry?.integrity || entry?.sha256) && crypto?.subtle) {
      const hash = await sha256(code);
      const expected = String(entry.integrity || entry.sha256).replace(/^sha256-/i, '');
      if (hash !== expected) throw new Error('Plugin integrity check failed.');
    }

    const blob = new Blob([`${code}\n//# sourceURL=${url}`], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      return await import(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  return await import(url);
}

function validatePluginModule(mod, entry) {
  if (!mod || typeof mod !== 'object') throw new Error('Plugin module did not load.');
  if (!mod.meta || typeof mod.meta !== 'object') throw new Error('Invalid plugin: missing export const meta.');
  if (typeof mod.setup !== 'function') throw new Error('Invalid plugin: missing export function setup(api).');

  const id = normalizePluginId(mod.meta.id || entry.id);
  if (!id) throw new Error('Invalid plugin: meta.id is required.');
  if (entry.id && id !== normalizePluginId(entry.id)) {
    throw new Error(`Plugin ID mismatch. Registry has "${entry.id}", module has "${mod.meta.id}".`);
  }
}

function sanitizeMeta(meta, entry) {
  return Object.freeze({
    id: normalizePluginId(meta.id || entry.id),
    name: String(meta.name || entry.name || meta.id || entry.id),
    version: String(meta.version || entry.version || '0.0.0'),
    compat: meta.compat || entry.compat || null,
    permissions: Array.isArray(meta.permissions) ? meta.permissions : undefined,
    optionalPermissions: Array.isArray(meta.optionalPermissions) ? meta.optionalPermissions : undefined,
    type: meta.type || entry.type || 'plugin',
    changelog: meta.changelog || entry.changelog || null,
    whatsNew: meta.whatsNew || meta.whatsnew || entry.whatsNew || null
  });
}

function permissionsToObject(entry, meta) {
  const list = normalizePermissions(entry, meta);
  const system = entry.source === 'system' || list.includes('system');
  const obj = { system };

  for (const p of list) obj[p] = true;
  if (system) obj.system = true;
  return obj;
}

function normalizePermissions(entry, meta = {}) {
  const source = entry.source || 'manual';
  if (source === 'system') {
    return ['system', 'storage', 'ui', 'bus', 'hooks', 'layout', 'network', 'globalCSS', 'theme', 'modifyOthers', 'moveOthers', 'rawBoard', 'clipboard'];
  }

  const raw = Array.isArray(meta.permissions)
    ? meta.permissions
    : Array.isArray(entry.permissions)
      ? entry.permissions
      : ['storage', 'ui', 'bus', 'hooks', 'layout'];

  const aliases = {
    'global-css': 'globalCSS',
    'globalCss': 'globalCSS',
    'modify-others': 'modifyOthers',
    'move-others': 'moveOthers',
    'raw-board': 'rawBoard'
  };

  const allowed = new Set(['storage', 'ui', 'bus', 'hooks', 'layout', 'clipboard', 'network', 'globalCSS', 'theme', 'modifyOthers', 'moveOthers', 'rawBoard', 'system']);

  return [...new Set(raw.map((p) => aliases[String(p)] || String(p)).filter((p) => allowed.has(p)))];
}

function sanitizeRegistry(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const out = [];

  for (const item of value) {
    const entry = sanitizePluginEntry(item);
    if (!entry.id || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }

  return out;
}

function sanitizePluginEntry(item = {}) {
  const id = normalizePluginId(item.id);
  return {
    id,
    name: String(item.name || id || 'Unnamed Plugin'),
    url: String(item.url || ''),
    enabled: item.enabled !== false,
    source: item.source || (id === 'plugin-manager' ? 'system' : 'manual'),
    status: item.status || (item.enabled === false ? 'disabled' : 'active'),
    error: item.error || null,
    version: item.version || null,
    remoteVersion: item.remoteVersion || null,
    compat: item.compat || null,
    permissions: Array.isArray(item.permissions) ? normalizePermissions(item, {}) : undefined,
    integrity: item.integrity || item.sha256 || undefined,
    originalUrl: item.originalUrl || undefined,
    icon: item.icon || undefined,
    category: item.category || undefined,
    trust: item.trust || undefined,
    changelog: item.changelog || undefined,
    whatsNew: item.whatsNew || item.whatsnew || undefined
  };
}

function validatePluginUrl(url, { allowData = false } = {}) {
  if (typeof url !== 'string' || !url.trim()) return { ok: false, reason: 'Plugin URL is required.' };
  if (allowData && url.startsWith('data:text/javascript')) return { ok: true };
  if (url.startsWith('./') || url.startsWith('/')) {
    return url.endsWith('.js') ? { ok: true } : { ok: false, reason: 'Local plugin URL must end with .js.' };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'Invalid plugin URL.' };
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) return { ok: false, reason: 'Plugin URL must be http(s).' };
  if (location.protocol === 'https:' && parsed.protocol !== 'https:') return { ok: false, reason: 'HTTPS boards cannot load HTTP plugins.' };
  if (!parsed.pathname.endsWith('.js')) return { ok: false, reason: 'Plugin URL must end with .js.' };
  return { ok: true };
}

function normalizePluginId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeHealth(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function structuredCloneSafe(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=+$/g, '');
}

function serializeError(err) {
  return {
    name: err?.name || 'Error',
    message: err?.message || String(err),
    stack: err?.stack || null
  };
}

bootstrap().catch((err) => {
  console.error('Blank Board failed to boot:', err);
  const board = document.getElementById('board') || document.body;
  board.innerHTML = `<div style="padding:24px;font:14px system-ui;color:#dc2626"><h2>Blank Board failed to start</h2><pre style="white-space:pre-wrap">${escapeHtml(err?.message || String(err))}</pre></div>`;
});

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}
