export const meta = {
  id: 'plugin-manager',
  name: 'Plugin Manager',
  version: '0.5.1',
  compat: '>=1.0.0'
};

export function setup(api) {
  const SELF_ID = meta.id;
  const COMMUNITY_JSON_URL = 'https://raw.githubusercontent.com/dheeraz101/Empty_Plugins/refs/heads/main/plugins.json';
  // ↑ Change this to your real GitHub raw URL

  const manager = document.createElement('div');
  manager.className = 'plugin-box';
  manager.style.cssText = `
    left: 280px; 
    top: 100px; 
    width: 760px; 
    max-height: 90vh; 
    background: #0f0f0f; 
    color: #e8e8e8; 
    border: 1px solid #333; 
    border-radius: 16px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.75);
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;
    z-index: 10000;
    display: none;
  `;

  manager.innerHTML = `
    <!-- Header -->
    <div style="padding:18px 24px; background:#1a1a1a; border-bottom:1px solid #2a2a2a; display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:20px;">⚙️</span>
        <div>
          <div style="font-size:17px; font-weight:700; display:flex; align-items:center; gap:10px;">
            Plugin Manager
            <a href="https://empty-ad9a3406.mintlify.app/" target="_blank" 
              style="text-decoration:none;">
              <img src="https://img.shields.io/badge/docs-open-blue?style=flat&logo=book" 
                  style="height:18px; border-radius:6px;">
            </a>
          </div>
          <div style="font-size:12px; color:#777;">Manage your plugins</div>
        </div>
      </div>
      <button id="close-btn" style="background:none; border:none; color:#888; font-size:28px; cursor:pointer; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:8px;">
        ×
      </button>
    </div>

    <!-- Tabs -->
    <div style="display:flex; background:#1a1a1a; border-bottom:1px solid #2a2a2a;">
      <button id="tab-installed" class="tab active">Installed Plugins</button>
      <button id="tab-community" class="tab">Community Store</button>
    </div>

    <!-- Installed Panel -->
    <div id="panel-installed" class="panel-content">
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <thead>
          <tr style="background:#1a1a1a; border-bottom:1px solid #333;">
            <th style="padding:14px 20px; text-align:left; font-weight:500; color:#aaa;">Plugin</th>
            <th style="padding:14px 20px; text-align:center; font-weight:500; color:#aaa; width:130px;">Status</th>
            <th style="padding:14px 20px; text-align:right; font-weight:500; color:#aaa; width:220px;">Actions</th>
          </tr>
        </thead>
        <tbody id="installed-list"></tbody>
      </table>
    </div>

    <!-- Community Panel -->
    <div id="panel-community" class="panel-content" style="display:none;">
      <div id="community-loading" style="padding:60px 20px; text-align:center; color:#777;">Fetching community plugins...</div>
      <div id="community-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px; padding:0 20px;"></div>
    </div>

    <!-- Docs Pill -->
    <div style="padding:16px 24px; border-top:1px solid #2a2a2a; background:#151515; display:flex; justify-content:center;">
      <a href="https://empty-ad9a3406.mintlify.app/" target="_blank"
        style="
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:10px 18px;
          border-radius:999px;
          background:#1f1f1f;
          border:1px solid #333;
          color:#ccc;
          font-size:13.5px;
          text-decoration:none;
          transition:all 0.2s;
        "
        onmouseover="this.style.background='#262626'; this.style.borderColor='#555'; this.style.color='#fff';"
        onmouseout="this.style.background='#1f1f1f'; this.style.borderColor='#333'; this.style.color='#ccc';"
      >
        📘 Documentation
      </a>
    </div>

    <!-- Manual Install -->
    <div style="padding:20px 24px; background:#1a1a1a; border-top:1px solid #2a2a2a;">
      <div style="font-size:13px; color:#aaa; margin-bottom:10px;">Install manually by URL</div>
      <div style="display:grid; grid-template-columns:1fr 2fr; gap:12px;">
        <input id="install-id" placeholder="unique-id" style="padding:12px; background:#222; border:1px solid #444; border-radius:10px; color:#fff;">
        <input id="install-url" type="url" placeholder="https://raw.githubusercontent.com/.../plugin.js" style="padding:12px; background:#222; border:1px solid #444; border-radius:10px; color:#fff;">
      </div>
      <button id="manual-install-btn" style="margin-top:14px; width:100%; padding:14px; background:#7c6fff; color:white; border:none; border-radius:10px; font-weight:600; cursor:pointer;">
        Install from URL
      </button>
    </div>
  `;

  api.boardEl.appendChild(manager);
  api.makeDraggable(manager);

  // Elements
  const closeBtn = manager.querySelector('#close-btn');
  const tabInstalled = manager.querySelector('#tab-installed');
  const tabCommunity = manager.querySelector('#tab-community');
  const panelInstalled = manager.querySelector('#panel-installed');
  const panelCommunity = manager.querySelector('#panel-community');

  // Close button
  closeBtn.addEventListener('click', () => manager.style.display = 'none');

  // Tab styling & switching
  function showTab(tab) {
    tabInstalled.classList.toggle('active', tab === 'installed');
    tabCommunity.classList.toggle('active', tab === 'community');
    panelInstalled.style.display = tab === 'installed' ? 'block' : 'none';
    panelCommunity.style.display = tab === 'community' ? 'block' : 'none';

    if (tab === 'community') loadCommunityPlugins();
  }

  tabInstalled.addEventListener('click', () => showTab('installed'));
  tabCommunity.addEventListener('click', () => showTab('community'));

  // Tab styles
  const tabStyle = document.createElement('style');
  tabStyle.textContent = `
    .tab {
      flex: 1;
      padding: 16px 0;
      font-size: 14.5px;
      font-weight: 600;
      border: none;
      background: none;
      color: #888;
      cursor: pointer;
      transition: all 0.2s;
    }
    .tab.active {
      color: #fff;
      border-bottom: 3px solid #7c6fff;
      background: #151515;
    }
    .tab:hover:not(.active) { color: #ccc; }
    .panel-content { padding: 24px; overflow: auto; max-height: calc(90vh - 140px); }
  `;
  document.head.appendChild(tabStyle);

  // Render Installed
  function renderInstalled() {
    const plugins = api.registry.getAll();
    const tbody = manager.querySelector('#installed-list');
    
    tbody.innerHTML = plugins.map(p => {
      const isSelf = p.id === SELF_ID;
      return `
        <tr style="border-bottom:1px solid #222;">
          <td style="padding:16px 20px;">
            <div style="font-weight:600;">${p.name || p.id}</div>
            <div style="font-size:12.5px; color:#666;">${p.id}</div>
          </td>
          <td style="padding:16px 20px; text-align:center;">
            <span style="padding:6px 18px; border-radius:9999px; font-size:13px; background:${p.enabled ? '#1a3a1a' : '#3a1a1a'}; color:${p.enabled ? '#4caf50' : '#ff6666'};">
              ${p.enabled ? '● Enabled' : '⏸ Paused'}
            </span>
          </td>
          <td style="padding:16px 20px; text-align:right;">
            ${isSelf ? 
              `<span style="color:#555; font-size:13px;">Protected</span>` : `
              <button data-action="toggle" data-id="${p.id}" style="margin-right:8px; padding:8px 16px; border:1px solid #444; border-radius:8px; background:#222; color:#ddd; cursor:pointer;">
                ${p.enabled ? 'Pause' : 'Resume'}
              </button>
              <button data-action="delete" data-id="${p.id}" style="padding:8px 16px; background:#3a1a1a; color:#ff6666; border:1px solid #ff4444; border-radius:8px; cursor:pointer;">
                Delete
              </button>`}
          </td>
        </tr>`;
    }).join('');
  }

  // Load Community Plugins
  async function loadCommunityPlugins() {
    const loading = manager.querySelector('#community-loading');
    const container = manager.querySelector('#community-list');
    container.innerHTML = '';

    try {
      const res = await fetch(COMMUNITY_JSON_URL + '?t=' + Date.now());
      if (!res.ok) throw new Error();
      const plugins = await res.json();

      let html = '';
      plugins.forEach(p => {
        const alreadyInstalled = api.registry.getAll().some(i => i.id === p.id);
        html += `
          <div style="background:#1a1a1a; border:1px solid #333; border-radius:12px; padding:18px;">
            <div style="font-size:22px; margin-bottom:8px;">${p.icon || '📦'}</div>
            <div style="font-weight:600; font-size:15px;">${p.name}</div>
            <div style="font-size:12.5px; color:#777; margin:4px 0 10px;">by ${p.author || 'community'}</div>
            <div style="font-size:13px; color:#aaa; line-height:1.5;">${p.description || 'No description'}</div>
            
            ${alreadyInstalled ? 
              `<div style="margin-top:16px; color:#4caf50; font-size:14px;">✓ Already installed</div>` :
              `<button data-id="${p.id}" data-url="${p.url}" data-name="${p.name}" 
                style="margin-top:16px; width:100%; padding:12px; background:#7c6fff; color:white; border:none; border-radius:10px; font-weight:600; cursor:pointer;">
                Install
              </button>`
            }
          </div>`;
      });

      container.innerHTML = html;
      loading.style.display = 'none';

      // Install from community
      container.querySelectorAll('button[data-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const success = await api.installPlugin(btn.dataset.id, btn.dataset.url, btn.dataset.name);
          if (success) {
            btn.textContent = '✓ Installed';
            btn.style.background = '#4caf50';
            btn.disabled = true;
            
            // Auto switch to Installed tab and refresh
            setTimeout(() => {
              showTab('installed');
              renderInstalled();
            }, 800);
          }
        });
      });

    } catch (e) {
      container.innerHTML = `<div style="color:#ff6666; text-align:center; padding:80px 20px;">Could not load community list.<br>Check your GitHub URL.</div>`;
    }
  }

  // Installed actions
  manager.querySelector('#installed-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'toggle') {
      await api.togglePlugin(id);
      renderInstalled();
    } else if (action === 'delete') {
      if (confirm(`Delete "${id}" permanently?`)) {
        api.deletePlugin(id);
        renderInstalled();
      }
    }
  });

  // Manual URL install
  manager.querySelector('#manual-install-btn').addEventListener('click', async () => {
    const id = manager.querySelector('#install-id').value.trim().toLowerCase().replace(/\s+/g, '-');
    const url = manager.querySelector('#install-url').value.trim();
    if (!id || !url) return alert('ID and URL are required');

    const success = await api.installPlugin(id, url, id);
    if (success) {
      renderInstalled();
      showTab('installed');
      manager.querySelector('#install-id').value = '';
      manager.querySelector('#install-url').value = '';
    }
  });

  // Right-click to open
  api.boardEl.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.plugin-box')) return;
    e.preventDefault();
    manager.style.left = `${Math.min(e.clientX + 20, window.innerWidth - 780)}px`;
    manager.style.top = `${e.clientY + 10}px`;
    manager.style.display = 'block';
    renderInstalled();
    showTab('installed');
  });

  // Self protection
  api.bus.on('plugin:unload', (id) => {
    if (id === SELF_ID) manager.remove();
  });

  console.log('✅ Improved Plugin Manager loaded');
}

export function teardown() {
  console.log('🗑️ Plugin Manager unloaded');
}