export const meta = {
  id: 'about',
  name: 'About Blank Board',
  version: '0.2.0',
  compat: '>=1.0.0'
};

export function setup(api) {
  const box = document.createElement('div');
  box.className = 'plugin-box';
  box.style.cssText = `
    left: 180px;
    top: 120px;
    width: 420px;
    background: #111;
    color: #e8e8e8;
    border: 1px solid #444;
    border-radius: 14px;
    box-shadow: 0 15px 50px rgba(0,0,0,0.6);
    overflow: hidden;
    font-family: system-ui, sans-serif;
  `;

  box.innerHTML = `
    <div style="padding:20px 24px;background:#1a1a1a;border-bottom:1px solid #333;">
      <div style="font-size:18px;font-weight:700;letter-spacing:-0.02em;">Blank Board</div>
      <div style="font-size:13px;color:#888;">Everything is a plugin • Fully extensible</div>
    </div>

    <div style="padding:24px;line-height:1.6;font-size:14px;">
      <p style="margin:0 0 18px 0;">
        A minimal, blank canvas where <strong>every feature is a plugin</strong>.<br>
        No bloat. No built-in tools. Just pure freedom.
      </p>

      <div style="background:#1a1a1a;border-radius:10px;padding:16px;margin-bottom:18px;">
        <strong style="color:#7c6fff;">Vision</strong><br>
        <span style="color:#aaa;font-size:13px;">
          Build the ultimate personal workspace together with the community.<br>
          Anyone can create and share plugins — from notes to kanban, AI tools, games, or full layouts.
        </span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px;">
        <div>
          <strong>Author</strong><br>
          <span style="color:#888;">DRD (@dhvsnv)</span>
        </div>
        <div>
          <strong>Tech</strong><br>
          <span style="color:#888;">Vanilla JS • ES Modules • Micro-kernel</span>
        </div>
      </div>

      <div style="margin-top:20px;font-size:13px;color:#888;">
        Hosted on Netlify • Community plugins via GitHub
      </div>
    </div>

    <div style="padding:16px 24px;background:#1a1a1a;border-top:1px solid #333;display:flex;gap:12px;justify-content:flex-end;">
      <button id="close-about" style="padding:8px 20px;background:#222;border:1px solid #555;color:#ccc;border-radius:8px;cursor:pointer;">
        Close
      </button>
    </div>
  `;

  api.boardEl.appendChild(box);
  api.makeDraggable(box);

  // Close button
  box.querySelector('#close-about').addEventListener('click', () => {
    box.remove();
    api.bus.emit('plugin:unload', meta.id);
  });

  console.log('✅ About plugin ready');
}

export function teardown() {
  console.log('🗑️ About plugin unloaded');
}