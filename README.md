# 🧩 Blank Board

**A minimal, blank canvas where everything is a plugin.**

No built-in features. No bloat. Just a tiny micro-kernel and a powerful plugin system that lets you build your perfect personal workspace.

[![Docs](https://img.shields.io/badge/docs-Mintlify-blue)](https://empty-ad9a3406.mintlify.app/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## ✨ Core Philosophy

- The board starts completely empty
- Everything (UI, tools, layouts, even the plugin manager) is a plugin
- Plugins are simple ES modules — easy to create and share
- Community plugins are hosted in a separate public repository

---

## 🚀 Quick Start

1. **Clone or download** this repository

2. Open `index.html` in your browser, or serve it locally:

   ```bash
   npx serve
   ```

3. Right-click anywhere on the board to open the **Plugin Manager**

4. Switch to the **Community Store** tab to browse and install plugins

---

## 📦 Plugin System

### How Plugins Work

- Plugins are standalone `.js` files (ES modules)
- They receive a clean API: `boardEl`, `bus` (event system), `storage`, `hooks`, etc.
- Can be installed via URL or from the Community Store
- Support live enable/disable and deletion

### 🔧 Official Plugins Included

| Plugin | Description |
|--------|-------------|
| **About** | Project information and vision |
| **Plugin Manager** | Manage, install, pause, and delete plugins |

### 🌍 Community Plugins

All community plugins are managed in a separate repository:

➡️ **[blank-board-plugins](https://github.com/dheeraz101/Empty_Plugins)**

#### Contributing a Plugin

1. Create your plugin
2. Add an entry to `plugins.json`
3. Open a Pull Request

---

## 🛠 Creating Your Own Plugin

Create a new file following the plugin format:

```javascript
export const meta = {
  id: 'my-plugin',
  name: 'My Awesome Plugin',
  version: '0.1.0'
};

export function setup(api) {
  // Your plugin code here
}
```

**Steps:**

1. Host your plugin publicly (GitHub raw URL recommended)
2. Submit a PR to the community [`plugins.json`](https://github.com/dheeraz101/Empty_Plugins)

📖 **For full plugin API reference, lifecycle hooks, and advanced patterns, check out the [documentation](https://empty-ad9a3406.mintlify.app/).**

---

## 📚 Documentation

Full documentation is live on **Mintlify**:

| Section | What's Covered |
|---------|----------------|
| [Getting Started](https://empty-ad9a3406.mintlify.app/introduction) | Installation & first plugin |
| [Plugin API](https://empty-ad9a3406.mintlify.app/api/board) | Full API reference (`boardEl`, `bus`, `storage`, `hooks`) |
| [Plugin Lifecycle](https://empty-ad9a3406.mintlify.app/concepts/architecture) | `setup`, `teardown`, hooks, and events |
| [Examples](https://empty-ad9a3406.mintlify.app/plugins/sticky-note) | Starter templates & sample plugins |
| [Community Guide](https://empty-ad9a3406.mintlify.app/guides/first-plugin) | How to submit plugins & contribute |

---

## ⚙️ Tech Stack

- **Vanilla JavaScript** (ES Modules)
- **Micro-kernel architecture**
- Dynamic imports
- Event bus + hook system
- LocalStorage (default) — extendable to any backend
- Deployed on **Netlify**

---

## 🎯 Vision

To create the most flexible, community-driven personal workspace on the web — where users and developers collaborate to build the ultimate productivity canvas, one plugin at a time.

---

## 👤 Author

**DRD** ([@dhvsnv](https://github.com/dhvsnv))

---

## 🤝 Contributing

Contributions are welcome! Whether it's:

- 🐛 Bug fixes
- 🧩 New plugins
- 📖 Documentation improvements
- 🎨 Design enhancements

See the [Community Guide](https://empty-ad9a3406.mintlify.app/guides/first-plugin) for guidelines.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.


