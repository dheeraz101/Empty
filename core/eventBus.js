export class EventBus {
  constructor({ maxListenersPerEvent = 80 } = {}) {
    this.listeners = new Map();
    this.ownerIndex = new Map();
    this.maxListenersPerEvent = maxListenersPerEvent;
  }

  on(event, callback, owner = 'core') {
    this.#assert(event, callback);
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const set = this.listeners.get(event);
    if (set.size >= this.maxListenersPerEvent) {
      console.warn(`[EventBus] Too many listeners for "${event}".`);
    }
    const record = { callback, owner };
    set.add(record);
    if (!this.ownerIndex.has(owner)) this.ownerIndex.set(owner, new Set());
    this.ownerIndex.get(owner).add({ event, record });
    return () => this.off(event, callback, owner);
  }

  once(event, callback, owner = 'core') {
    this.#assert(event, callback);
    const off = this.on(event, (data) => {
      off();
      callback(data);
    }, owner);
    return off;
  }

  off(event, callback, owner) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const record of [...set]) {
      if (record.callback === callback && (owner === undefined || owner === record.owner)) {
        set.delete(record);
      }
    }
    if (set.size === 0) this.listeners.delete(event);
    if (owner !== undefined) this.#rebuildOwner(owner);
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (!set) return [];
    const results = [];
    for (const { callback, owner } of [...set]) {
      try {
        results.push(callback(data));
      } catch (err) {
        console.error(`[EventBus] Listener failed for "${event}" from "${owner}":`, err);
        this.emit('core:error', { type: 'event-listener', event, owner, error: serializeError(err) });
      }
    }
    return results;
  }

  removeOwner(owner) {
    const owned = this.ownerIndex.get(owner);
    if (!owned) return;
    for (const { event, record } of owned) {
      const set = this.listeners.get(event);
      if (set) {
        set.delete(record);
        if (set.size === 0) this.listeners.delete(event);
      }
    }
    this.ownerIndex.delete(owner);
  }

  removeAll(event) {
    if (event) {
      this.listeners.delete(event);
      this.#rebuildAllOwners();
    } else {
      this.listeners.clear();
      this.ownerIndex.clear();
    }
  }

  #assert(event, callback) {
    if (typeof event !== 'string' || !event.trim()) throw new TypeError('Event name must be a non-empty string.');
    if (typeof callback !== 'function') throw new TypeError('Event callback must be a function.');
  }

  #rebuildOwner(owner) {
    this.ownerIndex.delete(owner);
    for (const [event, set] of this.listeners.entries()) {
      for (const record of set) {
        if (record.owner === owner) {
          if (!this.ownerIndex.has(owner)) this.ownerIndex.set(owner, new Set());
          this.ownerIndex.get(owner).add({ event, record });
        }
      }
    }
  }

  #rebuildAllOwners() {
    this.ownerIndex.clear();
    for (const [event, set] of this.listeners.entries()) {
      for (const record of set) {
        if (!this.ownerIndex.has(record.owner)) this.ownerIndex.set(record.owner, new Set());
        this.ownerIndex.get(record.owner).add({ event, record });
      }
    }
  }
}

export function serializeError(err) {
  return {
    name: err?.name || 'Error',
    message: err?.message || String(err),
    stack: err?.stack || null
  };
}
