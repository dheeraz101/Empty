// core/api.js

export function createApi({ boardEl, bus, storage }) {
  const hooks = {};
  const pluginContainers = new Map();
  const pluginStyles = new Map();
  let currentPluginId = null;

  // ── Toolbar ──
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

  // ── Context Menu ──
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
        // Clear previous dynamic items
        menu.querySelectorAll('.bb-cm-item').forEach(el => el.remove());
        menu.style.display = 'flex';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        bus.emit('contextmenu:open', { x: e.clientX, y: e.clientY, menu });
      });
    }
    return menu;
  }

  // ── Sidebar ──
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

  return {
    version: "2.0.0",
    boardEl,
    bus,
    storage,

    // ── Container: each plugin gets its own div ──
    get container() {
      if (!currentPluginId) return boardEl;

      if (!pluginContainers.has(currentPluginId)) {
        const div = document.createElement('div');
        div.className = 'bb-plugin-container';
        div.dataset.pluginId = currentPluginId;
        div.style.position = 'absolute';
        div.style.left = '20px';
        div.style.top = '20px';
        boardEl.appendChild(div);
        pluginContainers.set(currentPluginId, div);
      }

      return pluginContainers.get(currentPluginId);
    },

    // Internal: set which plugin is currently being set up
    _setCurrentPlugin(id) {
      currentPluginId = id;
    },

    // Get a plugin's container by id
    getContainer(pluginId) {
      return pluginContainers.get(pluginId) || null;
    },

    // Remove a plugin's container
    removeContainer(pluginId) {
      const container = pluginContainers.get(pluginId);
      if (container) {
        container.remove();
        pluginContainers.delete(pluginId);
      }
      // Also remove associated styles
      const style = pluginStyles.get(pluginId);
      if (style) {
        style.remove();
        pluginStyles.delete(pluginId);
      }
    },

    // ── Inject scoped CSS for a plugin ──
    injectCSS(pluginId, css) {
      // Remove existing styles for this plugin
      const existing = pluginStyles.get(pluginId);
      if (existing) existing.remove();

      const style = document.createElement('style');
      style.id = `bb-style-${pluginId}`;
      style.textContent = css;
      document.head.appendChild(style);
      pluginStyles.set(pluginId, style);
      return style;
    },

    // Remove injected CSS
    removeCSS(pluginId) {
      const style = pluginStyles.get(pluginId);
      if (style) {
        style.remove();
        pluginStyles.delete(pluginId);
      }
    },

    // ── Hook system (plugin-extending-plugin) ──
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

    // ── Notifications ──
    notify(message, type = 'info', duration = 3000) {
      const colors = {
        info: '#3498db',
        success: '#2ecc71',
        warning: '#f39c12',
        error: '#e74c3c'
      };

      // Inject animation once
      if (!document.getElementById('bb-toast-anim')) {
        const s = document.createElement('style');
        s.id = 'bb-toast-anim';
        s.textContent = `
          @keyframes bb-toast-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes bb-toast-out {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(10px); }
          }
        `;
        document.head.appendChild(s);
      }

      const toast = document.createElement('div');
      toast.textContent = message;
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: #fff;
        font-size: 14px;
        font-family: system-ui, sans-serif;
        z-index: 99999;
        background: ${colors[type] || colors.info};
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: bb-toast-in 0.3s ease;
        pointer-events: none;
        max-width: 350px;
      `;
      document.body.appendChild(toast);

      if (duration > 0) {
        setTimeout(() => {
          toast.style.animation = 'bb-toast-out 0.3s ease';
          setTimeout(() => toast.remove(), 300);
        }, duration);
      }

      return toast;
    },

    // ── Modal / Dialog ──
    showModal({ title, content, onClose }) {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100001;
      `;

      const modal = document.createElement('div');
      modal.style.cssText = `
        background: #fff;
        border-radius: 12px;
        padding: 24px;
        min-width: 300px;
        max-width: 90vw;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        font-family: system-ui, sans-serif;
      `;

      if (title) {
        const h = document.createElement('h3');
        h.textContent = title;
        h.style.cssText = 'margin: 0 0 12px 0; font-size: 18px;';
        modal.appendChild(h);
      }

      if (typeof content === 'string') {
        const body = document.createElement('div');
        body.innerHTML = content;
        modal.appendChild(body);
      } else if (content instanceof HTMLElement) {
        modal.appendChild(content);
      }

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const close = () => {
        overlay.remove();
        if (onClose) onClose();
      };

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      return { close, overlay, modal };
    },

    // ── Toolbar buttons ──
    registerToolbarButton({ id, label, onClick }) {
      const toolbar = getOrCreateToolbar();
      const btn = document.createElement('button');
      btn.id = `bb-btn-${id}`;
      btn.textContent = label;
      btn.style.cssText = `
        padding: 6px 14px;
        border: none;
        border-radius: 6px;
        background: #333;
        color: #fff;
        cursor: pointer;
        font-size: 13px;
        font-family: system-ui, sans-serif;
        transition: background 0.2s;
      `;
      btn.addEventListener('mouseenter', () => btn.style.background = '#555');
      btn.addEventListener('mouseleave', () => btn.style.background = '#333');
      btn.addEventListener('click', onClick);
      toolbar.appendChild(btn);
      return btn;
    },

    removeToolbarButton(id) {
      document.getElementById(`bb-btn-${id}`)?.remove();
    },

    // ── Sidebar items ──
    registerSidebarItem({ id, label, icon, onClick }) {
      const sidebar = getOrCreateSidebar();
      const item = document.createElement('div');
      item.id = `bb-sidebar-${id}`;
      item.title = label;
      item.style.cssText = `
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        cursor: pointer;
        font-size: 18px;
        transition: transform 0.2s;
      `;
      item.textContent = icon || '📌';
      item.addEventListener('mouseenter', () => item.style.transform = 'scale(1.1)');
      item.addEventListener('mouseleave', () => item.style.transform = 'scale(1)');
      item.addEventListener('click', onClick);
      sidebar.appendChild(item);
      return item;
    },

    removeSidebarItem(id) {
      document.getElementById(`bb-sidebar-${id}`)?.remove();
    },

    // ── Context menu items ──
    registerContextMenuItem(label, callback, { icon, pluginId } = {}) {
      const menu = getOrCreateContextMenu();

      const item = document.createElement('div');
      item.textContent = (icon ? icon + ' ' : '') + label;
      if (pluginId) item.className = 'bb-cm-item';
      item.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        transition: background 0.15s;
      `;
      item.addEventListener('mouseenter', () => item.style.background = '#f0f0f0');
      item.addEventListener('mouseleave', () => item.style.background = 'transparent');
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = 'none';
        callback();
      });
      menu.appendChild(item);
      return item;
    },

    // ── Keyboard shortcuts ──
    registerShortcut(keys, callback, { description } = {}) {
      // keys = 'ctrl+k', 'shift+a', 'alt+n', etc.
      const parts = keys.toLowerCase().split('+');
      const key = parts.pop();

      const handler = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const ctrl = parts.includes('ctrl') || parts.includes('meta');
        const shift = parts.includes('shift');
        const alt = parts.includes('alt');

        if (
          e.key.toLowerCase() === key &&
          (ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey)) &&
          (shift ? e.shiftKey : !e.shiftKey) &&
          (alt ? e.altKey : !e.altKey)
        ) {
          e.preventDefault();
          callback(e);
        }
      };

      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    },

    // ── Make element draggable ──
    makeDraggable(el, handle) {
      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      const dragHandle = handle || el;

      dragHandle.style.cursor = 'move';
      dragHandle.addEventListener('mousedown', dragMouseDown);

      function dragMouseDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.addEventListener('mouseup', closeDragElement);
        document.addEventListener('mousemove', elementDrag);
      }

      function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + 'px';
        el.style.left = (el.offsetLeft - pos1) + 'px';
      }

      function closeDragElement() {
        document.removeEventListener('mouseup', closeDragElement);
        document.removeEventListener('mousemove', elementDrag);
      }
    },

    // ── Make element resizable ──
    makeResizable(el, { minWidth = 100, minHeight = 100 } = {}) {
      const handle = document.createElement('div');
      handle.style.cssText = `
        position: absolute;
        right: 0;
        bottom: 0;
        width: 14px;
        height: 14px;
        cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.15) 50%);
        border-radius: 0 0 4px 0;
      `;
      el.style.position = 'absolute';
      el.appendChild(handle);

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = el.offsetWidth;
        const startH = el.offsetHeight;

        function onMove(e) {
          const w = Math.max(minWidth, startW + e.clientX - startX);
          const h = Math.max(minHeight, startH + e.clientY - startY);
          el.style.width = w + 'px';
          el.style.height = h + 'px';
        }

        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    },

    // ── Create DOM helpers ──
    createElement(tag, { className, styles, text, html, attrs, children, events } = {}) {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (styles) Object.assign(el.style, styles);
      if (text) el.textContent = text;
      if (html) el.innerHTML = html;
      if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      if (events) Object.entries(events).forEach(([k, v]) => el.addEventListener(k, v));
      if (children) children.forEach(c => {
        if (typeof c === 'string') el.appendChild(document.createTextNode(c));
        else if (c instanceof HTMLElement) el.appendChild(c);
      });
      return el;
    },

    // ── Debounce utility ──
    debounce(fn, delay = 250) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    },

    // ── Throttle utility ──
    throttle(fn, limit = 100) {
      let inThrottle = false;
      return (...args) => {
        if (!inThrottle) {
          fn(...args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    }
  };
}