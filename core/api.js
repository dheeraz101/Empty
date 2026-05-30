// Blank Board Core API v4.0.0
// Same-page plugins are not a perfect security sandbox. This file protects the core
// from accidental breakage and enforces a clear plugin contract.

export const CORE_VERSION = '4.0.0';

const DEFAULT_PERMISSIONS = Object.freeze({
  storage: true,
  ui: true,
  bus: true,
  hooks: true,
  layout: true,
  clipboard: false,
  network: false,
  globalCSS: false,
  theme: false,
  system: false,
  modifyOthers: false,
  moveOthers: false,
  rawBoard: false
});

const SYSTEM_PERMISSIONS = Object.freeze({
  storage: true,
  ui: true,
  bus: true,
  hooks: true,
  layout: true,
  clipboard: true,
  network: true,
  globalCSS: true,
  theme: true,
  system: true,
  modifyOthers: true,
  moveOthers: true,
  rawBoard: true
});

export function createApi({ boardEl, bus, storage }) {
  const hooks = new Map();
  const pluginContainers = new Map();
  const pluginStyles = new Map();
  const pluginState = new Map();
  const pluginPermissions = new Map();
  const pluginCleanups = new Map();
  const pluginTimers = new Map();
  const pluginUi = new Map();
  const pluginErrors = new Map();

  let currentPluginId = null;

  function normalizePluginId(id) {
    return String(id || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 80);
  }

  function safeJsonParse(raw, fallback = null) {
    try { return raw == null ? fallback : JSON.parse(raw); }
    catch { return fallback; }
  }

  function emitCoreError(payload) {
    bus.emit('core:error', payload);
  }

  function setPluginPermissions(pluginId, permissions = {}) {
    const id = normalizePluginId(pluginId);
    const normalized = { ...DEFAULT_PERMISSIONS, ...permissions };
    if (permissions.system || permissions.isSystem) Object.assign(normalized, SYSTEM_PERMISSIONS);
    normalized.canModifyOthers = !!(normalized.modifyOthers || permissions.canModifyOthers);
    normalized.canMoveOthers = !!(normalized.moveOthers || permissions.canMoveOthers);
    normalized.isSystem = !!normalized.system;
    pluginPermissions.set(id, normalized);
  }

  function getPermissions(pluginId) {
    const id = normalizePluginId(pluginId);
    return pluginPermissions.get(id) || { ...DEFAULT_PERMISSIONS };
  }

  function hasPermission(pluginId, key) {
    const p = getPermissions(pluginId);
    return p[key] === true || p[`can${key[0]?.toUpperCase?.() || ''}${key.slice?.(1) || ''}`] === true;
  }

  function assertPermission(pluginId, key, action = key) {
    if (!hasPermission(pluginId, key)) {
      throw new Error(`Plugin "${pluginId}" does not have permission for ${action}.`);
    }
  }

  function trackCleanup(pluginId, fn) {
    const id = normalizePluginId(pluginId);
    if (typeof fn !== 'function') return () => {};
    if (!pluginCleanups.has(id)) pluginCleanups.set(id, new Set());
    pluginCleanups.get(id).add(fn);
    return () => pluginCleanups.get(id)?.delete(fn);
  }

  function runPluginCleanups(pluginId) {
    const id = normalizePluginId(pluginId);
    const cleanups = pluginCleanups.get(id);
    if (cleanups) {
      for (const fn of [...cleanups].reverse()) {
        try { fn(); } catch (err) { console.error(`[API] Cleanup failed for ${id}:`, err); }
      }
    }
    pluginCleanups.delete(id);

    const timers = pluginTimers.get(id);
    if (timers) {
      for (const timer of timers) {
        if (timer.type === 'timeout') clearTimeout(timer.id);
        if (timer.type === 'interval') clearInterval(timer.id);
      }
    }
    pluginTimers.delete(id);

    const uiItems = pluginUi.get(id);
    if (uiItems) uiItems.forEach(el => el?.remove?.());
    pluginUi.delete(id);

    bus.removeOwner?.(id);
  }

  function createContainer(pluginId) {
    const id = normalizePluginId(pluginId);
    if (pluginContainers.has(id)) return pluginContainers.get(id);

    const div = document.createElement('section');
    div.className = 'bb-plugin-container bb-plugin-box';
    div.dataset.pluginId = id;
    div.setAttribute('data-plugin-id', id);
    div.setAttribute('role', 'group');
    div.setAttribute('aria-label', `Plugin ${id}`);
    div.style.left = '20px';
    div.style.top = '20px';
    div.style.width = '260px';
    div.style.minWidth = '120px';
    div.style.minHeight = '80px';
    boardEl.appendChild(div);

    makeDraggable(div, id);
    makeResizable(div, id);

    pluginContainers.set(id, div);
    pluginState.set(id, { status: 'created', mode: 'floating', crashes: 0 });
    return div;
  }

  function getContainer(pluginId) {
    return pluginContainers.get(normalizePluginId(pluginId)) || null;
  }

  function removeContainer(pluginId) {
    const id = normalizePluginId(pluginId);
    runPluginCleanups(id);
    const el = pluginContainers.get(id);
    if (el) el.remove();
    pluginContainers.delete(id);
    pluginState.delete(id);
    removeCSS(id);
  }

  function makeDraggable(el, ownerId = currentPluginId) {
    if (!el || el.dataset.bbDraggable === 'true') return;
    el.dataset.bbDraggable = 'true';
    let startX = 0, startY = 0, startLeft = 0, startTop = 0, dragging = false;

    const down = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest?.('input, textarea, select, button, a, [contenteditable="true"], .bb-resize-handle')) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseFloat(el.style.left || 0);
      startTop = parseFloat(el.style.top || 0);
      el.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const move = (e) => {
      if (!dragging) return;
      el.style.left = `${Math.max(0, startLeft + e.clientX - startX)}px`;
      el.style.top = `${Math.max(0, startTop + e.clientY - startY)}px`;
    };
    const up = (e) => {
      if (!dragging) return;
      dragging = false;
      el.releasePointerCapture?.(e.pointerId);
      bus.emit('plugin:moved', { pluginId: el.dataset.pluginId || ownerId, x: el.style.left, y: el.style.top });
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    trackCleanup(ownerId || 'core', () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    });
  }

  function makeResizable(el, ownerId = currentPluginId) {
    if (!el || el.dataset.bbResizable === 'true') return;
    el.dataset.bbResizable = 'true';
    const handle = document.createElement('div');
    handle.className = 'bb-resize-handle';
    el.appendChild(handle);

    let startX = 0, startY = 0, startW = 0, startH = 0, resizing = false;
    const down = (e) => {
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = el.offsetWidth;
      startH = el.offsetHeight;
      handle.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };
    const move = (e) => {
      if (!resizing) return;
      el.style.width = `${Math.max(120, startW + e.clientX - startX)}px`;
      el.style.height = `${Math.max(80, startH + e.clientY - startY)}px`;
    };
    const up = (e) => {
      if (!resizing) return;
      resizing = false;
      handle.releasePointerCapture?.(e.pointerId);
      bus.emit('plugin:resized', { pluginId: el.dataset.pluginId || ownerId, width: el.style.width, height: el.style.height });
    };

    handle.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    trackCleanup(ownerId || 'core', () => {
      handle.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      handle.remove();
    });
  }

  function injectCSS(pluginId, css, options = {}) {
    const id = normalizePluginId(pluginId);
    if (typeof css !== 'string') throw new TypeError('CSS must be a string.');
    const { global = false } = options;
    if (global) assertPermission(id, 'globalCSS', 'global CSS');

    removeCSS(id);
    const style = document.createElement('style');
    style.id = `bb-style-${CSS.escape(id)}`;
    style.dataset.owner = id;
    style.textContent = global ? css : `
      [data-plugin-id="${CSS.escape(id)}"] { font-family: var(--bb-font, system-ui, sans-serif); box-sizing: border-box; }
      [data-plugin-id="${CSS.escape(id)}"] *, [data-plugin-id="${CSS.escape(id)}"] *::before, [data-plugin-id="${CSS.escape(id)}"] *::after { box-sizing: inherit; }
      ${css}
    `;
    document.head.appendChild(style);
    pluginStyles.set(id, style);
    trackCleanup(id, () => removeCSS(id));
    return style;
  }

  function removeCSS(pluginId) {
    const id = normalizePluginId(pluginId);
    const style = pluginStyles.get(id);
    if (style) style.remove();
    pluginStyles.delete(id);
  }

  function notify(message, type = 'info', duration = 3000) {
    const colors = { info: '#2563eb', success: '#16a34a', warning: '#d97706', error: '#dc2626' };
    const toast = document.createElement('div');
    toast.className = 'bb-toast';
    toast.textContent = String(message ?? '');
    toast.style.cssText = `position:fixed;right:20px;bottom:20px;z-index:2147483000;padding:12px 16px;border-radius:10px;color:#fff;background:${colors[type] || colors.info};box-shadow:0 10px 30px rgba(0,0,0,.18);font:14px system-ui,sans-serif;max-width:min(420px,calc(100vw - 40px));`;
    document.body.appendChild(toast);
    if (duration > 0) setTimeout(() => toast.remove(), duration);
    return toast;
  }

  function showModal({ title = 'Blank Board', content = '', onClose } = {}) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:2147483001;padding:18px;`;
    const modal = document.createElement('div');
    modal.style.cssText = `background:#fff;color:#111827;border-radius:16px;width:min(560px,100%);max-height:min(720px,90vh);overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);padding:20px;font:14px system-ui,sans-serif;`;
    const h = document.createElement('h2');
    h.textContent = title;
    h.style.cssText = 'margin:0 0 12px;font-size:20px;';
    const body = document.createElement('div');
    if (typeof content === 'string') body.innerHTML = content;
    else if (content instanceof Node) body.appendChild(content);
    const close = document.createElement('button');
    close.textContent = 'Close';
    close.style.cssText = 'margin-top:16px;padding:8px 14px;border:0;border-radius:999px;background:#111827;color:#fff;cursor:pointer;';
    close.onclick = () => { overlay.remove(); onClose?.(); };
    modal.append(h, body, close);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) close.click(); });
    document.body.appendChild(overlay);
    return overlay;
  }

  function addContextMenuItem(label, handler, owner = currentPluginId) {
    const id = normalizePluginId(owner || 'core');
    const menu = getOrCreateContextMenu();
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'bb-cm-item';
    item.textContent = label;
    item.style.cssText = 'display:block;width:100%;padding:9px 12px;border:0;background:transparent;text-align:left;cursor:pointer;font:14px system-ui,sans-serif;color:inherit;';
    item.onclick = (e) => { e.stopPropagation(); menu.style.display = 'none'; handler?.(e); };
    menu.appendChild(item);
    if (!pluginUi.has(id)) pluginUi.set(id, new Set());
    pluginUi.get(id).add(item);
    return item;
  }

  function getOrCreateContextMenu() {
    let menu = document.getElementById('bb-context-menu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'bb-context-menu';
    menu.style.cssText = 'position:fixed;display:none;flex-direction:column;min-width:180px;background:#fff;color:#111;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.2);z-index:2147482999;padding:6px;font:14px system-ui,sans-serif;';
    document.body.appendChild(menu);
    document.addEventListener('click', () => { menu.style.display = 'none'; menu.querySelectorAll('.bb-cm-item').forEach(el => el.remove()); });
    boardEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      menu.querySelectorAll('.bb-cm-item').forEach(el => el.remove());
      menu.style.display = 'flex';
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      bus.emit('contextmenu:open', { x: e.clientX, y: e.clientY, menu });
    });
    return menu;
  }

  function getOrCreateToolbar() {
    let toolbar = document.getElementById('bb-toolbar');
    if (toolbar) return toolbar;
    toolbar = document.createElement('div');
    toolbar.id = 'bb-toolbar';
    toolbar.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:9999;padding:6px 10px;background:#fff;color:#111;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.15);';
    document.body.appendChild(toolbar);
    return toolbar;
  }

  function getOrCreateSidebar() {
    let sidebar = document.getElementById('bb-sidebar');
    if (sidebar) return sidebar;
    sidebar = document.createElement('div');
    sidebar.id = 'bb-sidebar';
    sidebar.style.cssText = 'position:fixed;top:60px;left:10px;display:flex;flex-direction:column;gap:4px;z-index:9998;';
    document.body.appendChild(sidebar);
    return sidebar;
  }

  function mountPlugin(pluginId, targetEl) {
    const id = normalizePluginId(pluginId);
    const caller = currentPluginId;
    if (caller && caller !== id && !hasPermission(caller, 'moveOthers')) throw new Error(`Plugin "${caller}" cannot move "${id}".`);
    const el = pluginContainers.get(id);
    if (!el || !targetEl) return false;
    targetEl.appendChild(el);
    el.dataset.docked = 'true';
    Object.assign(el.style, { position: 'relative', left: '0', top: '0', width: '100%', height: '100%', transform: 'none' });
    pluginState.set(id, { ...(pluginState.get(id) || {}), mode: 'docked', parent: targetEl });
    bus.emit('plugin:docked', { pluginId: id, el, target: targetEl });
    return true;
  }

  function undockPlugin(pluginId) {
    const id = normalizePluginId(pluginId);
    const caller = currentPluginId;
    if (caller && caller !== id && !hasPermission(caller, 'moveOthers')) throw new Error(`Plugin "${caller}" cannot move "${id}".`);
    const el = pluginContainers.get(id);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    boardEl.appendChild(el);
    el.dataset.docked = 'false';
    Object.assign(el.style, { position: 'absolute', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    pluginState.set(id, { ...(pluginState.get(id) || {}), mode: 'floating' });
    bus.emit('plugin:undocked', { pluginId: id, el });
    return true;
  }

  function updatePlugin(targetPluginId, updater) {
    const target = normalizePluginId(targetPluginId);
    const caller = currentPluginId;
    if (caller !== target && !hasPermission(caller, 'modifyOthers')) throw new Error(`Plugin "${caller}" cannot modify "${target}".`);
    const el = pluginContainers.get(target);
    if (!el) return false;
    updater(el);
    bus.emit('plugin:updated', { pluginId: target, el });
    return true;
  }

  function createNamespacedStorage(pluginId) {
    const id = normalizePluginId(pluginId);
    const prefix = `plugin:${id}:`;
    return Object.freeze({
      get(key, fallback = null) { return safeJsonParse(localStorage.getItem(prefix + String(key)), fallback); },
      set(key, value) {
        const fullKey = prefix + String(key);
        const oldValue = safeJsonParse(localStorage.getItem(fullKey), null);
        localStorage.setItem(fullKey, JSON.stringify(value));
        bus.emit('storage:change', { pluginId: id, key: fullKey, value, oldValue });
        return true;
      },
      remove(key) { localStorage.removeItem(prefix + String(key)); return true; },
      list() { return Object.keys(localStorage).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length)); },
      clearPluginData() { Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k)); return true; }
    });
  }

  const coreApi = {
    version: CORE_VERSION,
    boardEl,
    bus,
    storage,
    setPluginPermissions,
    getPermissions,
    hasPermission,
    mountPlugin,
    undockPlugin,
    updatePlugin,
    getPlugin: getContainer,
    getContainer,
    removeContainer,
    makeDraggable,
    makeResizable,
    injectCSS,
    removeCSS,
    getOrCreateToolbar,
    getOrCreateSidebar,
    getOrCreateContextMenu,
    addContextMenuItem,
    notify,
    showModal,
    registerHook(name, handler, owner = currentPluginId || 'core') {
      if (typeof handler !== 'function') throw new TypeError('Hook handler must be a function.');
      if (!hooks.has(name)) hooks.set(name, new Set());
      const record = { handler, owner };
      hooks.get(name).add(record);
      trackCleanup(owner, () => hooks.get(name)?.delete(record));
      return () => hooks.get(name)?.delete(record);
    },
    useHook(name, payload) {
      const set = hooks.get(name);
      if (!set) return [];
      return [...set].map(({ handler, owner }) => {
        try { return handler(payload); }
        catch (err) { emitCoreError({ type: 'hook', hook: name, owner, error: serializeError(err) }); return undefined; }
      });
    },
    removeHook(name, handler) {
      const set = hooks.get(name);
      if (!set) return;
      for (const record of [...set]) if (record.handler === handler) set.delete(record);
    },
    getPluginId: () => currentPluginId,
    _setCurrentPlugin(id) { currentPluginId = id ? normalizePluginId(id) : null; },
    _setPluginState(id, patch) { pluginState.set(normalizePluginId(id), { ...(pluginState.get(normalizePluginId(id)) || {}), ...patch }); },
    _getPluginState(id) { return { ...(pluginState.get(normalizePluginId(id)) || {}) }; },
    _recordPluginError(id, err) {
      const pluginId = normalizePluginId(id);
      const list = pluginErrors.get(pluginId) || [];
      list.push({ at: Date.now(), error: serializeError(err) });
      pluginErrors.set(pluginId, list.slice(-10));
      const state = pluginState.get(pluginId) || {};
      pluginState.set(pluginId, { ...state, status: 'failed', crashes: (state.crashes || 0) + 1, lastError: serializeError(err) });
      const el = pluginContainers.get(pluginId);
      if (el) el.dataset.bbError = 'true';
    },
    _cleanupPlugin: runPluginCleanups,
    _trackCleanup: trackCleanup,
    _createSandbox: createPluginSandbox,
    _normalizePluginId: normalizePluginId,
    get container() {
      return currentPluginId ? createContainer(currentPluginId) : boardEl;
    }
  };

  function createPluginSandbox(pluginId, manifest = {}) {
    const id = normalizePluginId(pluginId);
    const permissions = getPermissions(id);
    const isSystem = !!permissions.system;
    const pluginBus = Object.freeze({
      on(event, callback) { assertPermission(id, 'bus'); return bus.on(event, callback, id); },
      once(event, callback) { assertPermission(id, 'bus'); return bus.once(event, callback, id); },
      off(event, callback) { return bus.off(event, callback, id); },
      emit(event, data) { assertPermission(id, 'bus'); return bus.emit(event, { ...(data || {}), __source: id }); }
    });

    const sandbox = {
      version: CORE_VERSION,
      pluginId: id,
      meta: Object.freeze({ ...(manifest.meta || {}) }),
      permissions: Object.freeze({ ...permissions }),
      getPluginId: () => id,
      get container() { assertPermission(id, 'ui'); return createContainer(id); },
      get boardEl() {
        // Legacy compatibility for trusted/system plugins. Normal plugins should not use this.
        if (!isSystem && !permissions.rawBoard) console.warn(`[API] ${id}: direct boardEl access is legacy. Use api.container instead.`);
        return boardEl;
      },
      bus: pluginBus,
      storage: createNamespacedStorage(id),
      notify,
      showModal,
      injectCSS(css, opts = {}) { return injectCSS(id, css, opts); },
      removeCSS() { return removeCSS(id); },
      onCleanup(fn) { return trackCleanup(id, fn); },
      setTimeout(fn, delay = 0) {
        const timerId = window.setTimeout(() => { try { fn(); } catch (err) { coreApi._recordPluginError(id, err); } }, delay);
        if (!pluginTimers.has(id)) pluginTimers.set(id, new Set());
        pluginTimers.get(id).add({ type: 'timeout', id: timerId });
        return timerId;
      },
      setInterval(fn, delay = 1000) {
        const timerId = window.setInterval(() => { try { fn(); } catch (err) { coreApi._recordPluginError(id, err); } }, delay);
        if (!pluginTimers.has(id)) pluginTimers.set(id, new Set());
        pluginTimers.get(id).add({ type: 'interval', id: timerId });
        return timerId;
      },
      clearTimeout(timerId) { clearTimeout(timerId); },
      clearInterval(timerId) { clearInterval(timerId); },
      registerHook(name, handler) { assertPermission(id, 'hooks'); return coreApi.registerHook(name, handler, id); },
      useHook(name, payload) { assertPermission(id, 'hooks'); return coreApi.useHook(name, payload); },
      addContextMenuItem(label, handler) { assertPermission(id, 'ui'); return addContextMenuItem(label, handler, id); },
      makeDraggable(el) { assertPermission(id, 'layout'); return makeDraggable(el, id); },
      makeResizable(el) { assertPermission(id, 'layout'); return makeResizable(el, id); },
      mountPlugin(targetPluginId, targetEl) { return mountPlugin(targetPluginId, targetEl); },
      undockPlugin(targetPluginId) { return undockPlugin(targetPluginId); },
      updatePlugin(targetPluginId, updater) { return updatePlugin(targetPluginId, updater); },
      getContainer(targetPluginId = id) {
        if (targetPluginId !== id && !hasPermission(id, 'modifyOthers')) return null;
        return getContainer(targetPluginId);
      },
      getPlugin(targetPluginId = id) { return this.getContainer(targetPluginId); },
      copyText(text) {
        assertPermission(id, 'clipboard', 'clipboard');
        return navigator.clipboard?.writeText(String(text));
      },
      fetch(url, options) {
        assertPermission(id, 'network', 'network');
        return fetch(url, options);
      }
    };

    if (isSystem) {
      // System plugins like Plugin Manager need these for backwards compatibility.
      sandbox.registry = coreApi.registry;
      sandbox.installPlugin = (...args) => coreApi.installPlugin?.(...args);
      sandbox.togglePlugin = (...args) => coreApi.togglePlugin?.(...args);
      sandbox.deletePlugin = (...args) => coreApi.deletePlugin?.(...args);
      sandbox.reloadPlugin = (...args) => coreApi.reloadPlugin?.(...args);
      sandbox.restart = (...args) => coreApi.restart?.(...args);
      sandbox.registerUI = (...args) => coreApi.registerUI?.(...args);
      sandbox.setPluginPermissions = (...args) => coreApi.setPluginPermissions?.(...args);
    }

    return Object.freeze(sandbox);
  }

  return coreApi;
}

function serializeError(err) {
  return { name: err?.name || 'Error', message: err?.message || String(err), stack: err?.stack || null };
}
