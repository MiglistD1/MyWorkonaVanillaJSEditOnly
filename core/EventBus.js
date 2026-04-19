/**
 * 🔔 EventBus.js - Decoupled PubSub System
 * 
 * For non-state events: toasts, modals, side-effects
 * Complements StateManager by handling imperative events
 * 
 * StateManager = Data (reactive)
 * EventBus = Actions (imperative)
 * 
 * Usage:
 *   eventBus.emit('toast:show', {message: 'Task saved!', duration: 3000});
 *   eventBus.on('modal:opened', (data) => console.log('Modal opened:', data));
 *   eventBus.once('sync:complete', () => refreshUI());
 */

export class EventBus {
  constructor() {
    // 📋 Events map: eventName -> array of handlers
    this.events = {};
  }

  /**
   * Subscribe to event
   * @param {string} eventName - Event name (use Events.* constants)
   * @param {Function} handler - Callback (data) => void
   * @returns {Function} Unsubscribe function
   * 
   * Example:
   *   const unsubscribe = eventBus.on('modal:opened', ({type, data}) => {
   *     console.log(`Modal ${type} opened with data:`, data);
   *   });
   *   // Later:
   *   unsubscribe(); // Remove listener
   */
  on(eventName, handler) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(handler);
    
    // Return unsubscribe function
    return () => {
      this.events[eventName] = this.events[eventName].filter(h => h !== handler);
    };
  }

  /**
   * Subscribe once (auto-unsubscribe after first call)
   * @param {string} eventName - Event name
   * @param {Function} handler - Callback (data) => void
   * @returns {Function} Unsubscribe function (can call manually to remove early)
   * 
   * Example:
   *   eventBus.once('sync:complete', () => {
   *     console.log('Sync finished!');
   *     // Auto-unsubscribed after this fires
   *   });
   */
  once(eventName, handler) {
    const unsubscribe = this.on(eventName, (data) => {
      handler(data);
      unsubscribe();
    });
    return unsubscribe;
  }

  /**
   * Emit event to all subscribers (synchronous)
   * @param {string} eventName - Event name
   * @param {any} data - Event data to pass to handlers
   * 
   * Example:
   *   eventBus.emit('toast:show', {
   *     message: 'Task created!',
   *     type: 'success',
   *     duration: 3000
   *   });
   */
  emit(eventName, data) {
    if (!this.events[eventName]) return;
    
    this.events[eventName].forEach(handler => {
      try {
        handler(data);
      } catch (e) {
        console.error(`🔴 Event handler error for "${eventName}":`, e);
      }
    });
  }

  /**
   * Async emit (waits for all handlers to complete)
   * @param {string} eventName - Event name
   * @param {any} data - Event data
   * @returns {Promise<void>}
   * 
   * Example:
   *   await eventBus.emitAsync('sync:start');
   *   // All handlers have completed before continuing
   */
  async emitAsync(eventName, data) {
    if (!this.events[eventName]) return;
    
    const promises = this.events[eventName].map(handler => {
      try {
        const result = handler(data);
        return Promise.resolve(result);
      } catch (e) {
        console.error(`🔴 Async event handler error for "${eventName}":`, e);
        return Promise.reject(e);
      }
    });
    
    await Promise.all(promises);
  }

  /**
   * Remove all handlers for event(s)
   * @param {string} eventName - If omitted, clears all events
   * 
   * Example:
   *   eventBus.off('modal:opened'); // Clear specific event
   *   eventBus.off(); // Clear everything
   */
  off(eventName) {
    if (eventName) {
      delete this.events[eventName];
    } else {
      this.events = {};
    }
  }

  /**
   * Get count of listeners for event
   * @param {string} eventName
   * @returns {number} Number of active listeners
   */
  listenerCount(eventName) {
    return this.events[eventName] ? this.events[eventName].length : 0;
  }
}

/**
 * Export singleton instance
 * Import as: import { eventBus } from './core/EventBus.js'
 */
export const eventBus = new EventBus();

/**
 * Standard event names used throughout the app
 * Use these constants to avoid typos
 * 
 * Example:
 *   eventBus.emit(Events.SHOW_TOAST, {message: 'Done!'});
 */
export const Events = {
  // 🎯 Space & Navigation
  SPACE_CHANGED: 'space:changed',                   // {spaceId, space}
  SPACE_CREATED: 'space:created',                   // {space}
  SPACE_DELETED: 'space:deleted',                   // {spaceId}
  
  // ✅ Task Events
  TASK_CREATED: 'task:created',                     // {task, spaceId}
  TASK_UPDATED: 'task:updated',                     // {task, spaceId, changes}
  TASK_DELETED: 'task:deleted',                     // {taskId, spaceId}
  TASK_COMPLETED: 'task:completed',                 // {taskId, spaceId}
  
  // 🔗 Link Events
  RESOURCE_CREATED: 'resource:created',             // {resource, spaceId}
  RESOURCE_UPDATED: 'resource:updated',             // {resource, spaceId}
  RESOURCE_DELETED: 'resource:deleted',             // {resourceId, spaceId}
  
  // 📝 Note Events
  NOTE_UPDATED: 'note:updated',                     // {content, spaceId}
  
  // 🪟 Modal Events
  MODAL_OPENED: 'modal:opened',                     // {type, data}
  MODAL_CLOSED: 'modal:closed',                     // {type}
  
  // 🔔 Notification Events
  SHOW_TOAST: 'toast:show',                         // {message, type, duration}
  HIDE_TOAST: 'toast:hide',                         // {}
  SHOW_NOTIFICATION: 'notification:show',           // {title, message}
  
  // 🔄 Sync Events
  SYNC_START: 'sync:start',                         // {}
  SYNC_COMPLETE: 'sync:complete',                   // {timestamp, itemsCount}
  SYNC_ERROR: 'sync:error',                         // {error, message}
  
  // 🌐 Network Events
  ONLINE: 'network:online',                         // {}
  OFFLINE: 'network:offline',                       // {}
  
  // 🎨 UI Events
  THEME_CHANGED: 'theme:changed',                   // {isDarkMode, theme}
  WINDOW_RESIZED: 'window:resized',                 // {width, height}
  
  // @sp Mirror Events
  MIRROR_TASK_SYNC: 'mirror:task:sync',             // {parentTaskId, childTaskId, syncVersion}
  MIRROR_CIRCULAR_DETECTED: 'mirror:circular',      // {taskId, version}
};

/**
 * Helper: Ensure data is in correct format before emitting
 * @param {string} eventName - Event name
 * @param {any} data - Data to validate
 * @returns {boolean} True if data format is valid
 */
export function validateEventData(eventName, data) {
  // Add validation rules as needed
  // For now, just accept anything
  return true;
}
