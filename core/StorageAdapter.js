/**
 * 🌉 StorageAdapter.js - Bridge between storage.js and StateManager
 * 
 * Connects the old storage.js API to the new reactive StateManager
 * - Loads initial data from storage into StateManager
 * - Syncs StateManager changes back to storage (auto-save)
 * - Maintains backward compatibility with existing code
 * 
 * Usage (in dashboard.js or main initialization):
 *   await initializeStateManager();
 *   // Now stateManager is populated and syncing with storage
 */

import { stateManager } from './StateManager.js';
import * as storage from './storage.js';

/**
 * Initialize StateManager from existing storage.js data
 * Call this once at app startup
 * @returns {Promise<void>}
 */
export async function initializeStateManager() {
  console.log('🟢 Initializing StateManager from storage...');
  
  // 1. Load existing data from storage.js
  const spaces = storage.getSpaces();
  const currentSpaceId = storage.getCurrentSpaceId();
  const appSettings = storage.getAppSettings();
  const globalLaunchers = storage.getGlobalLaunchers();
  const launcherTags = storage.getLauncherTags();
  const localSettings = storage.getLocalSettings();
  
  // 2. Populate StateManager with loaded data (silent mode = no notifications yet)
  stateManager.update('spaces', spaces, { silent: true });
  stateManager.update('currentSpaceId', currentSpaceId, { silent: true });
  stateManager.update('appSettings', appSettings, { silent: true });
  stateManager.update('globalLaunchers', globalLaunchers, { silent: true });
  stateManager.update('launcherTags', launcherTags, { silent: true });
  stateManager.update('localSettings', localSettings, { silent: true });
  
  // 3. Set up auto-save: whenever StateManager changes, persist to storage
  stateManager.onAutoSave(async (state) => {
    console.log('💾 Auto-saving state to storage...');
    try {
      // Update storage.js internal state
      storage.setSpaces(state.spaces);
      storage.setCurrentSpaceId(state.currentSpaceId);
      storage.setAppSettings(state.appSettings);
      storage.setGlobalLaunchers(state.globalLaunchers);
      storage.setLauncherTags(state.launcherTags);
      
      // Persist to local/chrome storage
      await storage.saveData(false, false); // Debounced, not from remote
      
      console.log('✅ State saved to storage');
    } catch (e) {
      console.error('🔴 Failed to save state:', e);
    }
  });
  
  // 4. Listen to storage changes (for Firebase sync scenarios)
  // This allows remote changes to update StateManager
  const originalFirebaseHook = storage.setOnSaveFirebaseHook;
  storage.setOnSaveFirebaseHook((remoteData) => {
    console.log('🔄 Remote sync detected, updating StateManager...');
    
    // Update StateManager from remote data (mark as silent to prevent redundant sync)
    if (remoteData.mySpacesData) {
      stateManager.update('spaces', remoteData.mySpacesData, { silent: true });
    }
    if (remoteData.lastSpaceId !== undefined) {
      stateManager.update('currentSpaceId', remoteData.lastSpaceId, { silent: true });
    }
    if (remoteData.appSettings) {
      stateManager.update('appSettings', remoteData.appSettings, { silent: true });
    }
    if (remoteData.globalLaunchers) {
      stateManager.update('globalLaunchers', remoteData.globalLaunchers, { silent: true });
    }
    if (remoteData.launcherTags) {
      stateManager.update('launcherTags', remoteData.launcherTags, { silent: true });
    }
    
    // Call original hook if it exists
    if (originalFirebaseHook) originalFirebaseHook(remoteData);
  });
  
  console.log('✅ StateManager initialized successfully');
}

/**
 * Helper: Get current space from StateManager
 * @returns {Object|null}
 */
export function getCurrentSpace() {
  const spaces = stateManager.getState('spaces');
  const spaceId = stateManager.getState('currentSpaceId');
  return spaces.find(s => s.id === spaceId) || null;
}

/**
 * Helper: Update a task in a specific space
 * @param {number} spaceId - Space ID
 * @param {number} taskIndex - Task index in space.tasks array
 * @param {Object} changes - Changes to apply to the task
 */
export function updateTaskInSpace(spaceId, taskIndex, changes) {
  const spaces = stateManager.getState('spaces');
  const space = spaces.find(s => s.id === spaceId);
  
  if (!space || !space.tasks || !space.tasks[taskIndex]) {
    console.warn(`🟡 Task not found: space ${spaceId}, index ${taskIndex}`);
    return;
  }
  
  // Update task (merging changes)
  space.tasks[taskIndex] = { ...space.tasks[taskIndex], ...changes };
  
  // Push entire spaces array back to StateManager
  stateManager.update('spaces', spaces);
}

/**
 * Helper: Add a task to a specific space
 * @param {number} spaceId
 * @param {Object} task - Task object
 */
export function addTaskToSpace(spaceId, task) {
  const spaces = stateManager.getState('spaces');
  const space = spaces.find(s => s.id === spaceId);
  
  if (!space) {
    console.warn(`🟡 Space not found: ${spaceId}`);
    return;
  }
  
  if (!space.tasks) space.tasks = [];
  space.tasks.push(task);
  
  stateManager.update('spaces', spaces);
}

/**
 * Helper: Delete a task from a specific space
 * @param {number} spaceId
 * @param {number} taskIndex
 */
export function deleteTaskFromSpace(spaceId, taskIndex) {
  const spaces = stateManager.getState('spaces');
  const space = spaces.find(s => s.id === spaceId);
  
  if (!space || !space.tasks) return;
  
  space.tasks.splice(taskIndex, 1);
  stateManager.update('spaces', spaces);
}

/**
 * Export StateManager singleton for direct access
 */
export { stateManager };
