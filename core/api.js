export function createApi({ boardEl, bus, storage }) {
  const hooks = {};

  return {
    version: "1.0.0",
    boardEl,           // DOM root for plugins to append to
    bus,               // pub/sub for communication
    storage,           // localStorage abstraction

    // Hook system (plugin-extending-plugin)
    registerHook(name, handler) {
      if (!hooks[name]) hooks[name] = [];
      hooks[name].push(handler);
    },

    useHook(name, payload) {
      if (!hooks[name]) return [];
      return hooks[name].map(fn => fn(payload));
    },

    // Helper to make any element draggable (used by many plugins)
    makeDraggable(el) {
      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      el.addEventListener('mousedown', dragMouseDown);

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
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
      }

      function closeDragElement() {
        document.removeEventListener('mouseup', closeDragElement);
        document.removeEventListener('mousemove', elementDrag);
      }
    }
  };
}