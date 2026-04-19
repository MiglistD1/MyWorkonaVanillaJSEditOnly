/**
 * 🔗 StateManager Integration for Dashboard
 * 
 * Wraps StateManager into dashboard.js initialization
 * Ensures StateManager is ready before any components render
 * 
 * Usage:
 *   import { initStateManagerIntegration } from './core/StateManagerIntegration.js';
 *   await initStateManagerIntegration();
 *   // Now stateManager is active and synced with storage
 */

import { initializeStateManager, stateManager } from './StorageAdapter.js';
import { eventBus, Events } from './EventBus.js';

/**
 * Initialize StateManager integration with dashboard
 * Call this in dashboard.js before rendering any components
 * @returns {Promise<void>}
 */
export async function initStateManagerIntegration() {
  console.log('🔗 Initializing StateManager integration...');
  
  try {
    // 1. Initialize StateManager from storage.js
    await initializeStateManager();
    console.log('✅ StateManager initialized');
    
    // 2. Listen to state changes and re-render as needed
    setupStateSubscribers();
    
    // 3. Emit initialization complete event
    eventBus.emit(Events.SYNC_COMPLETE, {
      timestamp: Date.now(),
      itemsCount: stateManager.getState('spaces').length
    });
    
    console.log('✅ StateManager integration complete');
  } catch (e) {
    console.error('🔴 StateManager initialization failed:', e);
    throw e;
  }
}

/**
 * Setup subscribers that bridge StateManager changes to UI updates
 * These listen to state changes and trigger re-renders
 * @private
 */
function setupStateSubscribers() {
  // When current space changes, update UI
  stateManager.subscribe('currentSpaceId', (newSpaceId, oldSpaceId) => {
    console.log(`🔄 Space changed: ${oldSpaceId} → ${newSpaceId}`);
    // Emit event for other components to handle
    eventBus.emit(Events.SPACE_CHANGED, { spaceId: newSpaceId });
  });
  
  // When app settings change, update theme
  stateManager.subscribe('appSettings', (newSettings, oldSettings) => {
    console.log('🔄 App settings changed');
    if (newSettings.isDarkMode !== oldSettings?.isDarkMode) {
      eventBus.emit(Events.THEME_CHANGED, { isDarkMode: newSettings.isDarkMode });
    }
  });
  
  // When tasks in spaces change, re-render
  stateManager.subscribe('spaces', (newSpaces, oldSpaces) => {
    console.log(`🔄 Spaces changed: ${newSpaces.length} spaces`);
    // Emit event for components to handle re-rendering
    eventBus.emit(Events.SYNC_COMPLETE, {
      timestamp: Date.now(),
      itemsCount: newSpaces.length
    });
  });
  
  // When launchers change
  stateManager.subscribe('globalLaunchers', (newLaunchers) => {
    console.log(`🔄 Launchers changed: ${newLaunchers.length} launchers`);
  });
}

/**
 * Get current space from StateManager (helper for components)
 * Always returns fresh data
 * @returns {Object|null}
 */
export function getCurrentSpaceFromState() {
  const spaces = stateManager.getState('spaces');
  const spaceId = stateManager.getState('currentSpaceId');
  return spaces.find(s => s.id === spaceId) || null;
}

/**
 * Update current space from StateManager (helper for components)
 * @param {number} newSpaceId
 */
export function setCurrentSpaceFromState(newSpaceId) {
  stateManager.update('currentSpaceId', newSpaceId);
}

/**
 * Get all spaces from StateManager
 * @returns {Array}
 */
export function getSpacesFromState() {
  return stateManager.getState('spaces');
}

/**
 * Get app settings from StateManager
 * @returns {Object}
 */
export function getAppSettingsFromState() {
  return stateManager.getState('appSettings');
}

/**
 * Update app settings in StateManager
 * @param {Object} changes
 */
export function updateAppSettingsFromState(changes) {
  stateManager.patch('appSettings', changes);
}

/**
 * Export StateManager for direct access if needed
 */
export { stateManager, eventBus, Events };
