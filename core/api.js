// core/api.js

export function createApi({ boardEl, bus, storage }) {
  const hooks = {};
  const pluginContainers = new Map();
  const pluginStyles = new Map();
  const pluginState = new Map(); // 🔥 NEW: centralized state
  const pluginPermissions = new Map();

  let currentPluginId = null;

  function setPluginPermissions(pluginId, permissions = {}) {
    pluginPermissions.set(pluginId, {
      canMoveOthers: false,
      canModifyOthers: false,
      isSystem: false,
      ...permissions
    });
  }

  function hasPermission(pluginId, key) {
    const perms = pluginPermissions.get(pluginId);
    return perms?.[key] === true;
  }

  // ─────────────────────────────────────────────
  // UI SYSTEMS (UNCHANGED)
  // ─────────────────────────────────────────────

  function getOrCreateToolbar() {
    let toolbar = document.getElementById('bb-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'bb-toolbar';
      toolbar.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 6px;
        z-index: 9999;
        padding: 6px 10px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
      `;
      document.body.appendChild(toolbar);
    }
    return toolbar;
  }

  function getOrCreateContextMenu() {
    let menu = document.getElementById('bb-context-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'bb-context-menu';
      menu.style.cssText = `
        position: fixed;
        display: none;
        flex-direction: column;
        min-width: 180px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 100000;
        padding: 4px 0;
        font-size: 14px;
        font-family: system-ui, sans-serif;
      `;
      document.body.appendChild(menu);

      document.addEventListener('click', () => {
        menu.style.display = 'none';
        menu.querySelectorAll('.bb-cm-item').forEach(el => el.remove());
      });

      boardEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        menu.querySelectorAll('.bb-cm-item').forEach(el => el.remove());
        menu.style.display = 'flex';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        bus.emit('contextmenu:open', { x: e.clientX, y: e.clientY, menu });
      });
    }
    return menu;
  }

  function getOrCreateSidebar() {
    let sidebar = document.getElementById('bb-sidebar');
    if (!sidebar) {
      sidebar = document.createElement('div');
      sidebar.id = 'bb-sidebar';
      sidebar.style.cssText = `
        position: fixed;
        top: 60px;
        left: 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 9998;
      `;
      document.body.appendChild(sidebar);
    }
    return sidebar;
  }

  // ─────────────────────────────────────────────
  // 🔥 CORE CONTROL SYSTEM (NEW)
  // ─────────────────────────────────────────────

  function mountPlugin(pluginId, targetEl) {
    const el = pluginContainers.get(pluginId);
    if (!el || !targetEl) return;

    pluginState.set(pluginId, { mode: 'docked', parent: targetEl });

    targetEl.appendChild(el);

    el.dataset.docked = 'true';

    el.style.position = 'relative';
    el.style.left = '0';
    el.style.top = '0';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.transform = 'none';
    el.style.inset = '0';

    bus.emit('plugin:docked', { pluginId, el, target: targetEl });
  }

  function undockPlugin(pluginId) {
    const el = pluginContainers.get(pluginId);
    if (!el) return;

    const rect = el.getBoundingClientRect();

    boardEl.appendChild(el);

    el.dataset.docked = 'false';

    el.style.position = 'absolute';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.width = rect.width + 'px';
    el.style.height = rect.height + 'px';

    pluginState.set(pluginId, { mode: 'floating' });

    bus.emit('plugin:undocked', { pluginId, el });
  }

  function updatePlugin(targetPluginId, updater) {
    const caller = currentPluginId;

    if (caller !== targetPluginId && !hasPermission(caller, 'canModifyOthers')) {
      console.warn(`[API] ${caller} cannot modify ${targetPluginId}`);
      return;
    }

    const el = pluginContainers.get(targetPluginId);
    if (!el) return;

    try {
      updater(el);
      bus.emit('plugin:updated', { pluginId: targetPluginId, el });
    } catch (err) {
      console.error('Plugin update failed:', err);
    }
  }

  function getPlugin(pluginId) {
    return pluginContainers.get(pluginId) || null;
  }

  // ─────────────────────────────────────────────
  // API RETURN
  // ─────────────────────────────────────────────

  return {
    version: "4.0.0",
    boardEl,
    bus,

    // 🔥 NEW CORE METHODS
    mountPlugin,
    undockPlugin,
    updatePlugin,
    getPlugin,

    storage: {
      ...storage,
      getForPlugin: (pluginId, key) => {
        const fullKey = `plugin:${pluginId}:${key}`;
        return JSON.parse(localStorage.getItem(fullKey) || 'null');
      },
      setForPlugin: (pluginId, key, value) => {
        const fullKey = `plugin:${pluginId}:${key}`;
        const oldValue = JSON.parse(localStorage.getItem(fullKey) || 'null');
        localStorage.setItem(fullKey, JSON.stringify(value));
        bus.emit('storage:change', { key: fullKey, value, oldValue, pluginId });
      }
    },

    getPluginId: () => currentPluginId,

    get container() {
      if (!currentPluginId) return boardEl;

      if (!pluginContainers.has(currentPluginId)) {
        const div = document.createElement('div');
        div.className = 'bb-plugin-container bb-plugin-box';
        div.dataset.pluginId = currentPluginId;

        div.style.position = 'absolute';
        div.style.left = '20px';
        div.style.top = '20px';
        div.style.minWidth = '120px';
        div.style.minHeight = '80px';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';

        boardEl.appendChild(div);

        this.makeDraggable(div);
        this.makeResizable(div);

        pluginContainers.set(currentPluginId, div);
        pluginState.set(currentPluginId, { mode: 'floating' });
      }

      return pluginContainers.get(currentPluginId);
    },

    _setCurrentPlugin(id) {
      currentPluginId = id;
    },

    getContainer(pluginId) {
      return pluginContainers.get(pluginId) || null;
    },

    removeContainer(pluginId) {
      const el = pluginContainers.get(pluginId);
      if (el) el.remove();
      pluginContainers.delete(pluginId);
      pluginState.delete(pluginId);

      const style = pluginStyles.get(pluginId);
      if (style) style.remove();
      pluginStyles.delete(pluginId);
    },

    injectCSS(pluginId, css) {
      const existing = pluginStyles.get(pluginId);
      if (existing) existing.remove();

      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);

      pluginStyles.set(pluginId, style);
      return style;
    },

    removeCSS(pluginId) {
      const style = pluginStyles.get(pluginId);
      if (style) style.remove();
      pluginStyles.delete(pluginId);
    },

    registerHook(name, handler) {
      if (!hooks[name]) hooks[name] = [];
      hooks[name].push(handler);
    },

    useHook(name, payload) {
      if (!hooks[name]) return [];
      return hooks[name].map(fn => fn(payload));
    },

    removeHook(name, handler) {
      if (!hooks[name]) return;
      hooks[name] = hooks[name].filter(fn => fn !== handler);
    },

    notify(message, type = 'info', duration = 3000) {
      const colors = {
        info: '#3498db',
        success: '#2ecc71',
        warning: '#f39c12',
        error: '#e74c3c'
      };

      const toast = document.createElement('div');
      toast.textContent = message;
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: #fff;
        z-index: 99999;
        background: ${colors[type]};
      `;

      document.body.appendChild(toast);
      if (duration > 0) setTimeout(() => toast.remove(), duration);
      return toast;
    },

    registerToolbarButton({ id, label, onClick }) {
      const toolbar = getOrCreateToolbar();
      if (document.getElementById(`bb-btn-${id}`)) return;

      const btn = document.createElement('button');
      btn.id = `bb-btn-${id}`;
      btn.textContent = label;
      btn.onclick = onClick;

      toolbar.appendChild(btn);
    },

    removeToolbarButton(id) {
      document.getElementById(`bb-btn-${id}`)?.remove();
    },

    makeDraggable(el, handle) {
      const dragHandle = handle || el;
      let offsetX = 0, offsetY = 0;
      let dragging = false;

      dragHandle.style.cursor = 'move';

      function onMove(e) {
        if (!dragging) return;
        el.style.left = (e.clientX - offsetX) + 'px';
        el.style.top = (e.clientY - offsetY) + 'px';
      }

      function onUp() {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        bus.emit('plugin:dragend', { el });
      }

      dragHandle.addEventListener('mousedown', (e) => {
        const id = el.dataset.pluginId;

        if (el.dataset.docked === "true") {
          undockPlugin(id);
        }

        dragging = true;
        offsetX = e.clientX - el.offsetLeft;
        offsetY = e.clientY - el.offsetTop;
        el.style.zIndex = Date.now();

        bus.emit('plugin:dragstart', { el });

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    },

    makeResizable(el) {
      const handle = document.createElement('div');
      handle.style.cssText = `
        position: absolute;
        right: 0;
        bottom: 0;
        width: 14px;
        height: 14px;
        cursor: nwse-resize;
      `;
      el.appendChild(handle);

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = el.offsetWidth;
        const startH = el.offsetHeight;

        function onMove(e) {
          el.style.width = startW + (e.clientX - startX) + 'px';
          el.style.height = startH + (e.clientY - startY) + 'px';
        }

        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }
  };
}