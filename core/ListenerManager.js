/**
 * 🎧 ListenerManager.js - Firebase Listener Registry
 * 
 * Centralized management for all Firebase onSnapshot listeners
 * Prevents listener leaks by tracking and cleaning up subscriptions
 * 
 * Usage:
 *   import { listenerManager } from './ListenerManager.js';
 *   const unsub = onSnapshot(...);
 *   listenerManager.register('space-1', unsub);
 *   // Later:
 *   listenerManager.unsubscribeById('space-1');
 *   // On app close:
 *   await listenerManager.unsubscribeAll();
 */

class ListenerManager {
  constructor() {
    // Map of id -> unsubscribe function
    this.listeners = new Map();
    this.debug = false; // Set to true for console logs
  }

  /**
   * Register a Firebase listener for tracking
   * @param {string} id - Unique identifier for this listener (e.g., 'space-1', 'metadata', 'config')
   * @param {Function} unsubscribeFn - The unsubscribe function returned by onSnapshot()
   * @returns {string} The listener ID (for reference)
   */
  register(id, unsubscribeFn) {
    if (typeof unsubscribeFn !== 'function') {
      console.warn(`🟡 ListenerManager.register('${id}'): unsubscribeFn is not a function`, unsubscribeFn);
      return null;
    }

    if (this.listeners.has(id)) {
      if (this.debug) console.log(`🟡 ListenerManager: Listener '${id}' already exists, unsubscribing old one`);
      this.listeners.get(id)();
    }

    this.listeners.set(id, unsubscribeFn);
    if (this.debug) console.log(`✅ ListenerManager: Registered listener '${id}' (total: ${this.listeners.size})`);
    return id;
  }

  /**
   * Unsubscribe from a single listener by ID
   * @param {string} id - Listener ID to unsubscribe
   * @returns {boolean} True if listener was found and unsubscribed
   */
  unsubscribeById(id) {
    if (!this.listeners.has(id)) {
      if (this.debug) console.warn(`🟡 ListenerManager: Listener '${id}' not found`);
      return false;
    }

    try {
      this.listeners.get(id)();
      this.listeners.delete(id);
      if (this.debug) console.log(`✅ ListenerManager: Unsubscribed '${id}' (remaining: ${this.listeners.size})`);
      return true;
    } catch (e) {
      console.error(`🔴 ListenerManager: Error unsubscribing '${id}':`, e);
      this.listeners.delete(id); // Remove even on error
      return false;
    }
  }

  /**
   * Unsubscribe from all listeners
   * Useful for cleanup when app closes or user logs out
   * @returns {Promise<number>} Number of listeners cleaned up
   */
  async unsubscribeAll() {
    if (this.debug) console.log(`🧹 ListenerManager: Cleaning up ${this.listeners.size} listeners...`);
    
    let count = 0;
    for (const [id, unsub] of this.listeners) {
      try {
        unsub();
        count++;
        if (this.debug) console.log(`  ✅ Cleaned: ${id}`);
      } catch (e) {
        console.error(`  🔴 Error cleaning ${id}:`, e);
      }
    }

    this.listeners.clear();
    if (this.debug) console.log(`✅ ListenerManager: Cleanup complete (${count} cleaned)`);
    return count;
  }

  /**
   * Get list of active listener IDs (for debugging)
   * @returns {string[]} Array of listener IDs currently tracked
   */
  getActiveListeners() {
    return Array.from(this.listeners.keys());
  }

  /**
   * Check if a listener is active
   * @param {string} id - Listener ID
   * @returns {boolean} True if listener is registered
   */
  isActive(id) {
    return this.listeners.has(id);
  }

  /**
   * Get count of active listeners
   * @returns {number} Number of active listeners
   */
  getCount() {
    return this.listeners.size;
  }

  /**
   * Enable debug logging
   */
  enableDebug() {
    this.debug = true;
    console.log('🟢 ListenerManager: Debug mode enabled');
  }

  /**
   * Disable debug logging
   */
  disableDebug() {
    this.debug = false;
  }

  /**
   * Print current state to console
   */
  printState() {
    console.table({
      'Active Listeners': this.listeners.size,
      'Listener IDs': this.getActiveListeners().join(', ')
    });
  }
}

/**
 * Export singleton instance
 * Import as: import { listenerManager } from './core/ListenerManager.js'
 */
export const listenerManager = new ListenerManager();
