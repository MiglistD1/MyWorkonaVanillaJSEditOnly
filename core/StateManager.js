/**
 * 🎯 StateManager.js - Reactive State Container
 * 
 * Single Source of Truth (SSOT) for all app state
 * - Auto-notifies subscribers when state changes
 * - Version tracking prevents circular sync loops
 * - Debounced updates reduce redundant notifications
 * - Replaces scattered state variables with one unified store
 * 
 * Usage:
 *   stateManager.update('spaces', [...])
 *   stateManager.subscribe('spaces', (newValue, oldValue) => render(newValue))
 *   stateManager.getState('appSettings')
 */

export class StateManager {
  constructor(initialState = {}) {
    // 🎯 Unified state object (all app data lives here)
    this.state = {
      spaces: [],
      currentSpaceId: 1,
      appSettings: {},
      globalLaunchers: [],
      launcherTags: [],
      currentFilterTags: [],
      currentFilterMode: 'OR',
      currentSearchQuery: "",
      editingItemState: { type: null, index: null, parentIndex: null },
      localSettings: { firebaseAutoSync: false, autoSyncSessionExpiry: 0 },
      basketItems: [], // 🧺 Store tasks ready for batch mirroring
      basketSettings: { x: 100, y: 100, w: 320, h: 450 }, // 🧺 Floating UI settings
      mirrorSyncVersion: 0, // 🟢 For circular prevention (@sp mirror tasks)
      ...initialState
    };
    
    // 📢 Subscribers: key -> array of callbacks
    // When state[key] changes, all callbacks fire
    this.subscribers = {};
    
    // 💾 Auto-save hooks
    this.saveCallbacks = [];
    this.saveTimeout = null;
    this.updateQueue = [];
  }

  /**
   * Subscribe to changes for a specific state key
   * @param {string} key - State key to watch
   * @param {Function} callback - Called with (newValue, oldValue) when key changes
   * @returns {Function} Unsubscribe function
   * 
   * Example:
   *   const unsubscribe = stateManager.subscribe('tasks', (tasks) => renderTasks(tasks));
   *   // Later: unsubscribe(); // Stop listening
   */
  subscribe(key, callback) {
    if (!this.subscribers[key]) {
      this.subscribers[key] = [];
    }
    this.subscribers[key].push(callback);
    
    // Return unsubscribe function for cleanup
    return () => {
      this.subscribers[key] = this.subscribers[key].filter(cb => cb !== callback);
    };
  }

  /**
   * Update state and notify all subscribers (debounced)
   * @param {string} key - State key
   * @param {any} newValue - New value
   * @param {Object} options - {immediate: bool, silent: bool}
   *   - immediate: skip debounce, notify right away
   *   - silent: don't notify subscribers (for internal sync)
   * 
   * Example:
   *   stateManager.update('currentSpaceId', 5); // Debounced
   *   stateManager.update('spaces', [...], {immediate: true}); // Notify now
   */
  update(key, newValue, options = {}) {
    const oldValue = this.state[key];
    
    // Skip if no change detected
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      return;
    }
    
    this.state[key] = newValue;
    
    // Silent mode: update state without notifying (used for remote sync)
    if (options.silent) return;
    
    // Notify subscribers
    if (options.immediate) {
      this._notifySubscribers(key, newValue, oldValue);
    } else {
      this._debounceNotify(key, newValue, oldValue);
    }
    
    // Trigger auto-save
    this._scheduleAutoSave();
  }

  /**
   * Immutable-style update (merge pattern)
   * Useful for updating nested objects
   * @param {string} key - State key
   * @param {Object} changes - Changes to merge
   * 
   * Example:
   *   stateManager.patch('appSettings', { isDarkMode: true }); // Merges, doesn't replace
   */
  patch(key, changes) {
    const current = this.state[key];
    if (typeof current !== 'object' || current === null) {
      this.update(key, changes);
      return;
    }
    this.update(key, { ...current, ...changes });
  }

  /**
   * Get current state value (read-only)
   * @param {string} key - State key
   * @returns {any} Current value (deep cloned to prevent mutations)
   * 
   * Example:
   *   const spaces = stateManager.getState('spaces');
   */
  getState(key) {
    // Return deep clone to prevent external mutations
    return JSON.parse(JSON.stringify(this.state[key]));
  }

  /**
   * Get entire state object (snapshot)
   * @returns {Object} Full state (deep cloned)
   */
  getFullState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Register auto-save callback
   * Called whenever state is updated (debounced)
   * @param {Function} callback - async (state) => void
   * 
   * Example:
   *   stateManager.onAutoSave(async (state) => {
   *     await saveDataItem('mySpacesData', state.spaces);
   *   });
   */
  onAutoSave(callback) {
    this.saveCallbacks.push(callback);
  }

  /**
   * 🟢 Circular sync prevention: increment version on update
   * Used for @sp mirror tasks to detect stale updates
   * @returns {number} Next sync version
   * 
   * Example:
   *   const version = stateManager.getNextSyncVersion();
   *   stateManager.update('mirrorTasks', {child: newValue, syncVersion: version});
   */
  getNextSyncVersion() {
    return ++this.state.mirrorSyncVersion;
  }

  /**
   * Check if incoming sync is stale (from older version)
   * Prevents circular loops in mirror task sync
   * @param {number} incomingVersion
   * @returns {boolean} True if incomingVersion < current version
   */
  isSyncStale(incomingVersion) {
    return incomingVersion < this.state.mirrorSyncVersion;
  }

  // ========== Private Methods ==========

  /**
   * Notify all subscribers for a key
   * @private
   */
  _notifySubscribers(key, newValue, oldValue) {
    if (!this.subscribers[key]) return;
    
    this.subscribers[key].forEach(callback => {
      try {
        callback(newValue, oldValue);
      } catch (e) {
        console.error(`🔴 Subscriber error for key "${key}":`, e);
      }
    });
  }

  /**
   * Debounce notifications (wait 200ms before notifying)
   * @private
   */
  _debounceNotify(key, newValue, oldValue) {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this._notifySubscribers(key, newValue, oldValue);
    }, 200);
  }

  /**
   * Schedule auto-save callback execution
   * @private
   */
  _scheduleAutoSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(async () => {
      for (const callback of this.saveCallbacks) {
        try {
          await callback(this.state);
        } catch (e) {
          console.error('🔴 Auto-save error:', e);
        }
      }
    }, 200);
  }
}

/**
 * Export singleton instance
 * Import as: import { stateManager } from './core/StateManager.js'
 */
export const stateManager = new StateManager();
