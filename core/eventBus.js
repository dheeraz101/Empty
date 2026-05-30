export class EventBus {
  constructor({ maxListenersPerEvent = 100 } = {}) {
    this.listeners = new Map();
    this.ownerIndex = new Map();
    this.maxListenersPerEvent = maxListenersPerEvent;
  }

  on(event, callback, owner = 'core') {
    this.#assert(event, callback);
    const cleanOwner = String(owner || 'core');
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());

    const set = this.listeners.get(event);
    if (set.size >= this.maxListenersPerEvent) {
      console.warn(`[EventBus] Too many listeners for "${event}".`);
    }

    const record = { callback, owner: cleanOwner };
    set.add(record);

    if (!this.ownerIndex.has(cleanOwner)) this.ownerIndex.set(cleanOwner, new Set());
    this.ownerIndex.get(cleanOwner).add({ event, record });

    return () => this.off(event, callback, cleanOwner);
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
    if (!set) return false;

    let removed = false;
    for (const record of [...set]) {
      if (record.callback === callback && (owner === undefined || String(owner) === record.owner)) {
        set.delete(record);
        removed = true;
      }
    }

    if (set.size === 0) this.listeners.delete(event);
    if (owner !== undefined) this.#rebuildOwner(String(owner));
    else this.#rebuildAllOwners();
    return removed;
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
        if (event !== 'core:error') {
          this.emit('core:error', {
            type: 'event-listener',
            event,
            owner,
            error: serializeError(err)
          });
        }
      }
    }
    return results;
  }

  removeOwner(owner) {
    const cleanOwner = String(owner || 'core');
    const owned = this.ownerIndex.get(cleanOwner);
    if (!owned) return 0;

    let removed = 0;
    for (const { event, record } of [...owned]) {
      const set = this.listeners.get(event);
      if (!set) continue;
      if (set.delete(record)) removed++;
      if (set.size === 0) this.listeners.delete(event);
    }

    this.ownerIndex.delete(cleanOwner);
    return removed;
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

  getListenerCount(event) {
    if (event) return this.listeners.get(event)?.size || 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  #assert(event, callback) {
    if (typeof event !== 'string' || !event.trim()) {
      throw new TypeError('Event name must be a non-empty string.');
    }
    if (typeof callback !== 'function') {
      throw new TypeError('Event callback must be a function.');
    }
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
