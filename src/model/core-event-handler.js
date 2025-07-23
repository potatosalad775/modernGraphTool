/**
 * @fileoverview Centralized Core Event System with Priority Support
 * Provides type-safe event handling with priority ordering and comprehensive developer tools
 */

/**
 * @typedef {import('../types/data-types.js').FREventData} FREventData
 */

/**
 * Event handler function type
 * @template T
 * @typedef {(detail: T) => void | Promise<void>} EventHandler
 */

/**
 * Event listener configuration
 * @template T
 * @typedef {Object} EventListener
 * @property {EventHandler<T>} handler - The event handler function
 * @property {number} priority - Priority level (higher = runs first)
 * @property {boolean} once - Whether to run only once
 * @property {string} [name] - Optional name for debugging
 * @property {AbortController} [abortController] - For cleanup
 */

/**
 * Available core event types with their payload types
 * @typedef {Object} CoreEventMap
 * @property {FREventData} fr-phone-added - Phone added event
 * @property {FREventData} fr-phone-removed - Phone removed event  
 * @property {FREventData} fr-target-added - Target added event
 * @property {FREventData} fr-target-removed - Target removed event
 * @property {FREventData} fr-unknown-inserted - Unknown data inserted event
 * @property {FREventData} fr-unknown-removed - Unknown data removed event
 * @property {void} fr-normalized - Data normalized event (no payload)
 * @property {FREventData} fr-channel-updated - Channel updated event
 * @property {FREventData} fr-color-updated - Color updated event
 * @property {FREventData} fr-dash-updated - Dash pattern updated event
 * @property {FREventData} fr-variant-updated - Variant updated event
 * @property {void} fr-smoothing-updated - Smoothing updated event (no payload)
 * @property {{uuid: string, visible: boolean}} fr-visibility-updated - Visibility updated event
 * @property {{isMobile: boolean}} ui-mode-change - UI mode change event
 * @property {{target: string}} menu-change - Menu change event
 * @property {void} metadata-loaded - Metadata loaded event (no payload)
 */

/**
 * Core Event System with Priority Support
 * Provides centralized, type-safe event handling with priority ordering
 */
class CoreEventSystem {
  constructor() {
    /** @type {Map<string, EventListener<any>[]>} */
    this.listeners = new Map();
    
    /** @type {Map<string, number>} */
    this.eventCounts = new Map();
    
    /** @type {boolean} */
    this.debug = false;
    
    /** @type {Map<string, any>} */
    this.lastEventData = new Map();
    
    // Bind methods to preserve context
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.emit = this.emit.bind(this);
    this.once = this.once.bind(this);
  }

  /**
   * Add event listener with priority support
   * @template T
   * @param {keyof CoreEventMap} eventType - Event type
   * @param {EventHandler<T>} handler - Event handler function
   * @param {Object} [options] - Listener options
   * @param {number} [options.priority=0] - Priority level (higher = runs first)
   * @param {boolean} [options.once=false] - Run only once
   * @param {string} [options.name] - Handler name for debugging
   * @param {AbortSignal} [options.signal] - Abort signal for cleanup
   * @returns {() => void} Cleanup function
   */
  on(eventType, handler, options = {}) {
    const {
      priority = 0,
      once = false,
      name = `anonymous_${Date.now()}`,
      signal
    } = options;

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }

    const abortController = new AbortController();
    
    /** @type {EventListener<T>} */
    const listener = {
      handler,
      priority,
      once,
      name,
      abortController
    };

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => {
        this.off(eventType, handler);
      });
    }

    // Insert in priority order (higher priority first)
    const listeners = this.listeners.get(eventType);
    const insertIndex = listeners.findIndex(l => l.priority < priority);
    
    if (insertIndex === -1) {
      listeners.push(listener);
    } else {
      listeners.splice(insertIndex, 0, listener);
    }

    if (this.debug) {
      console.log(`📡 CoreEvent: Added listener for '${eventType}' with priority ${priority} (${name})`);
    }

    // Return cleanup function
    return () => this.off(eventType, handler);
  }

  /**
   * Add one-time event listener
   * @template T
   * @param {keyof CoreEventMap} eventType - Event type
   * @param {EventHandler<T>} handler - Event handler function
   * @param {Object} [options] - Listener options
   * @param {number} [options.priority=0] - Priority level
   * @param {string} [options.name] - Handler name for debugging
   * @returns {Promise<T>} Promise that resolves with event data
   */
  once(eventType, handler, options = {}) {
    return new Promise((resolve) => {
      const wrappedHandler = (detail) => {
        const result = handler(detail);
        resolve(detail);
        return result;
      };

      this.on(eventType, wrappedHandler, { ...options, once: true });
    });
  }

  /**
   * Remove event listener
   * @param {keyof CoreEventMap} eventType - Event type
   * @param {EventHandler<any>} handler - Handler to remove
   * @returns {boolean} Whether listener was found and removed
   */
  off(eventType, handler) {
    const listeners = this.listeners.get(eventType);
    if (!listeners) return false;

    const index = listeners.findIndex(l => l.handler === handler);
    if (index === -1) return false;

    const listener = listeners[index];
    listener.abortController?.abort();
    listeners.splice(index, 1);

    if (this.debug) {
      console.log(`📡 CoreEvent: Removed listener for '${eventType}' (${listener.name})`);
    }

    // Clean up empty listener arrays
    if (listeners.length === 0) {
      this.listeners.delete(eventType);
    }

    return true;
  }

  /**
   * Emit event to all listeners in priority order
   * @template T
   * @param {keyof CoreEventMap} eventType - Event type
   * @param {T} [detail] - Event data
   * @returns {Promise<void>}
   */
  async emit(eventType, detail = undefined) {
    const listeners = this.listeners.get(eventType);
    if (!listeners || listeners.length === 0) {
      if (this.debug) {
        console.log(`📡 CoreEvent: No listeners for '${eventType}'`);
      }
      return;
    }

    // Update statistics
    const currentCount = this.eventCounts.get(eventType) || 0;
    this.eventCounts.set(eventType, currentCount + 1);
    this.lastEventData.set(eventType, detail);

    if (this.debug) {
      console.log(`📡 CoreEvent: Emitting '${eventType}' to ${listeners.length} listeners`, detail);
    }

    // Execute listeners in priority order
    const results = [];
    const toRemove = [];

    for (const listener of listeners) {
      try {
        const startTime = performance.now();
        
        const result = listener.handler(detail);
        
        // Handle async handlers
        if (result instanceof Promise) {
          await result;
        }

        if (this.debug) {
          const duration = performance.now() - startTime;
          console.log(`📡 CoreEvent: Handler '${listener.name}' completed in ${duration.toFixed(2)}ms`);
        }

        results.push({ success: true, handler: listener.name });

        // Mark one-time listeners for removal
        if (listener.once) {
          toRemove.push(listener);
        }

      } catch (error) {
        console.error(`📡 CoreEvent: Error in handler '${listener.name}' for '${eventType}':`, error);
        results.push({ success: false, handler: listener.name, error });
      }
    }

    // Remove one-time listeners
    toRemove.forEach(listener => {
      this.off(eventType, listener.handler);
    });

    // Also emit to window for backward compatibility
    this._emitToWindow(eventType, detail);
  }

  /**
   * Emit to window for backward compatibility
   * @private
   * @param {string} eventType - Event type
   * @param {any} detail - Event data
   */
  _emitToWindow(eventType, detail) {
    const customEvent = new CustomEvent(`core:${eventType}`, { detail });
    window.dispatchEvent(customEvent);
  }

  /**
   * Remove all listeners for an event type
   * @param {keyof CoreEventMap} eventType - Event type
   * @returns {number} Number of listeners removed
   */
  removeAllListeners(eventType) {
    const listeners = this.listeners.get(eventType);
    if (!listeners) return 0;

    const count = listeners.length;
    
    // Abort all controllers
    listeners.forEach(listener => {
      listener.abortController?.abort();
    });

    this.listeners.delete(eventType);

    if (this.debug) {
      console.log(`📡 CoreEvent: Removed all ${count} listeners for '${eventType}'`);
    }

    return count;
  }

  /**
   * Get listener count for event type
   * @param {keyof CoreEventMap} eventType - Event type
   * @returns {number} Number of listeners
   */
  getListenerCount(eventType) {
    return this.listeners.get(eventType)?.length || 0;
  }

  /**
   * Get all registered event types
   * @returns {string[]} Array of event types
   */
  getEventTypes() {
    return Array.from(this.listeners.keys());
  }

  /**
   * Get debug information about the event system
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    const info = {
      totalEventTypes: this.listeners.size,
      totalListeners: 0,
      eventCounts: Object.fromEntries(this.eventCounts),
      listenersByEvent: {},
      lastEventData: Object.fromEntries(this.lastEventData)
    };

    this.listeners.forEach((listeners, eventType) => {
      info.totalListeners += listeners.length;
      info.listenersByEvent[eventType] = listeners.map(l => ({
        name: l.name,
        priority: l.priority,
        once: l.once
      }));
    });

    return info;
  }

  /**
   * Enable or disable debug logging
   * @param {boolean} enabled - Whether to enable debug logging
   */
  setDebug(enabled) {
    this.debug = enabled;
    console.log(`📡 CoreEvent: Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Clear all statistics
   */
  clearStats() {
    this.eventCounts.clear();
    this.lastEventData.clear();
    if (this.debug) {
      console.log('📡 CoreEvent: Statistics cleared');
    }
  }

  /**
   * Dispose of the event system (cleanup all listeners)
   */
  dispose() {
    this.listeners.forEach((listeners, eventType) => {
      listeners.forEach(listener => {
        listener.abortController?.abort();
      });
    });

    this.listeners.clear();
    this.eventCounts.clear();
    this.lastEventData.clear();

    if (this.debug) {
      console.log('📡 CoreEvent: Event system disposed');
    }
  }
}

// Create singleton instance
const CoreEventHandler = new CoreEventSystem();

// Development tools (only in development)
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).CoreEventDebug = {
    enable: () => CoreEventHandler.setDebug(true),
    disable: () => CoreEventHandler.setDebug(false),
    info: () => CoreEventHandler.getDebugInfo(),
    stats: () => ({
      events: Object.fromEntries(CoreEventHandler.eventCounts),
      listeners: CoreEventHandler.getEventTypes().map(type => ({
        event: type,
        count: CoreEventHandler.getListenerCount(/** @type {keyof CoreEventMap} */ (type))
      }))
    }),
    clear: () => CoreEventHandler.clearStats()
  };
}

export default CoreEventHandler;
