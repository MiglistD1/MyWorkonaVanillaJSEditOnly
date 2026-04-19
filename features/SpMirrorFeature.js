/**
 * 🔗 @sp Mirror Feature - Synchronized Task Mirroring
 * 
 * Allows creating "mirror" tasks that sync across multiple spaces.
 * When user types @sp in a task, a modal picker appears to select destination space.
 * The task then appears in both source and destination with sync capabilities.
 * 
 * Features:
 * - Dual presence: Source task shows ↗ icon, Destination shows 🔗 icon
 * - Bidirectional sync: Edit/check on either side updates the other
 * - Single source of truth: Uses StateManager to prevent conflicts
 * - Circular prevention: Version tracking prevents infinite loops
 */

import { stateManager } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { getSpaces, saveData } from '../core/storage.js';

/**
 * Initialize @sp mirror feature
 * Subscribes to state changes and sets up event listeners
 */
export function initSpMirrorFeature() {
  console.log('✅ @sp Mirror Feature initialized');
  
  // Subscribe to state changes for automatic sync
  stateManager.subscribe('spaces', ({ spaces }) => {
    syncAllMirrors(spaces);
  });
  
  // Listen to task changes
  eventBus.on(Events.TASK_UPDATED, (taskData) => {
    if (taskData.task?.mirrorTaskId) {
      syncMirrorTaskChange(taskData);
    }
  });
}

/**
 * Parse @sp syntax from task text
 * Formats: @sp:SpaceName or @sp{SpaceName} or @sp SpaceName
 * 
 * @param {string} text - Task text to parse
 * @returns {object|null} { type: 'sp', destSpaceId, destSpaceName, cleanText }
 */
export function parseSpCommand(text) {
  if (!text || !text.includes('@sp')) return null;
  
  // Match multiple formats: @sp:name, @sp{name}, @sp name
  const match = text.match(/@sp\s*[:({]?([^}):\n]+)[}):]?/);
  if (!match) return null;
  
  const destStr = match[1].trim();
  if (!destStr) return null;
  
  const spaces = getSpaces();
  
  // Try to find by ID first
  let destSpace = spaces.find(s => s.id === parseInt(destStr));
  
  // Fallback to name search
  if (!destSpace) {
    destSpace = spaces.find(s => s.name.toLowerCase() === destStr.toLowerCase());
  }
  
  if (!destSpace) {
    console.warn('[@sp] Destination space not found:', destStr);
    return null;
  }
  
  // Remove @sp command from text for display
  const cleanText = text.replace(/@sp\s*[:({]?[^}):\n]+[}):]?/, '').trim();
  
  return {
    type: 'sp',
    destSpaceId: destSpace.id,
    destSpaceName: destSpace.name,
    cleanText: cleanText || text
  };
}

/**
 * Create bidirectional mirror link between tasks
 * 
 * @param {object} sourceTask - Task in source space
 * @param {number} sourceSpaceId - Source space ID
 * @param {number} destSpaceId - Destination space ID
 */
export function createMirrorLink(sourceTask, sourceSpaceId, destSpaceId) {
  const spaces = getSpaces();
  const sourceSpace = spaces.find(s => s.id === sourceSpaceId);
  const destSpace = spaces.find(s => s.id === destSpaceId);
  
  if (!sourceSpace || !destSpace) {
    console.error('[Mirror] Invalid space IDs:', { sourceSpaceId, destSpaceId });
    return;
  }
  
  // 1️⃣ Create mirror task in destination space
  const mirrorTaskId = sourceTask.createdAt + '-mirror-' + Date.now();
  const nextVersion = stateManager.getNextSyncVersion();
  
  const mirrorTask = {
    id: mirrorTaskId,
    text: sourceTask.text,
    completed: sourceTask.completed,
    tags: sourceTask.tags || [],
    dueDate: sourceTask.dueDate || null,
    createdAt: mirrorTaskId,
    googleTaskId: null,
    isProminent: false,
    subtasks: [],
    // Mirror metadata
    isMirrorTask: true,
    sourceMirrorId: sourceTask.createdAt,
    sourceSpaceId: sourceSpaceId,
    sourceSpaceName: sourceSpace.name,
    mirrorSyncVersion: nextVersion,
    displayText: `🔗 ${sourceTask.text}` // Icon for UI
  };
  
  // Initialize tasks array if needed
  if (!destSpace.tasks) destSpace.tasks = [];
  destSpace.tasks.push(mirrorTask);
  
  // 2️⃣ Update source task with mirror metadata
  sourceTask.isMirrorSource = true;
  sourceTask.mirrorTaskId = mirrorTaskId;
  sourceTask.mirrorSpaceId = destSpaceId;
  sourceTask.mirrorSpaceName = destSpace.name;
  sourceTask.mirrorSyncVersion = nextVersion;
  sourceTask.displayText = `↗ ${sourceTask.text}`; // Icon for UI
  
  // 3️⃣ Save to storage
  saveData(true);
  
  // 4️⃣ Emit event for logging/UI updates
  eventBus.emit(Events.MIRROR_TASK_SYNC, {
    sourceSpaceId: sourceSpaceId,
    destSpaceId: destSpaceId,
    sourceTaskId: sourceTask.createdAt,
    mirrorTaskId: mirrorTaskId,
    timestamp: Date.now()
  });
  
  console.log(`[Mirror] Task linked: "${sourceTask.text}" → ${destSpace.name}`);
}

/**
 * Sync all mirrored tasks when state changes
 * Keeps source and mirror tasks in sync
 * 
 * @param {array} spaces - All spaces from state
 */
function syncAllMirrors(spaces) {
  spaces.forEach(space => {
    if (!space.tasks) return;
    
    space.tasks.forEach(task => {
      // Skip non-mirror tasks
      if (!task.isMirrorSource && !task.isMirrorTask) return;
      if (!task.mirrorTaskId && !task.sourceMirrorId) return;
      
      // Check circular prevention
      if (stateManager.isSyncStale()) {
        console.log('[Mirror] Skipping sync - version stale');
        return;
      }
      
      // Find target space
      const targetSpaceId = task.mirrorSpaceId || task.sourceSpaceId;
      if (!targetSpaceId) return;
      
      const targetSpace = spaces.find(s => s.id === targetSpaceId);
      if (!targetSpace || !targetSpace.tasks) return;
      
      // Find mirror task
      const targetTaskId = task.mirrorTaskId || task.sourceMirrorId;
      const targetTask = targetSpace.tasks.find(t => 
        t.id === targetTaskId || t.createdAt === targetTaskId
      );
      
      if (!targetTask) {
        // Mirror was deleted, remove source metadata
        if (task.isMirrorSource) {
          task.isMirrorSource = false;
          task.mirrorTaskId = null;
        }
        return;
      }
      
      // Sync text changes
      if (targetTask.text !== task.text) {
        targetTask.text = task.text;
        // Update display with appropriate icon
        if (targetTask.isMirrorTask) {
          targetTask.displayText = `🔗 ${task.text}`;
        }
      }
      
      // Sync completion status
      if (targetTask.completed !== task.completed) {
        targetTask.completed = task.completed;
      }
      
      // Sync due date
      if (targetTask.dueDate !== task.dueDate) {
        targetTask.dueDate = task.dueDate;
      }
      
      // Sync tags
      if (JSON.stringify(targetTask.tags) !== JSON.stringify(task.tags)) {
        targetTask.tags = [...(task.tags || [])];
      }
      
      // Update version to prevent re-sync
      task.mirrorSyncVersion = stateManager.getNextSyncVersion();
    });
  });
}

/**
 * Handle single mirror task change
 * Called when a task is edited/checked
 * 
 * @param {object} taskData - { spaceId, task, changes, ... }
 */
function syncMirrorTaskChange(taskData) {
  const spaces = getSpaces();
  const sourceSpace = spaces.find(s => s.id === taskData.spaceId);
  
  if (!sourceSpace) return;
  
  const sourceTask = taskData.task;
  if (!sourceTask || !sourceTask.mirrorTaskId) return;
  
  // Find destination space
  const destSpace = spaces.find(s => s.id === sourceTask.mirrorSpaceId);
  if (!destSpace || !destSpace.tasks) return;
  
  // Check version to prevent circular sync
  const nextVersion = stateManager.getNextSyncVersion();
  if (sourceTask.mirrorSyncVersion === nextVersion - 1) {
    console.log('[Mirror] Skipping circular sync - version matched');
    return;
  }
  
  // Find and update mirror task
  const mirrorTask = destSpace.tasks.find(t => t.id === sourceTask.mirrorTaskId);
  if (!mirrorTask) return;
  
  // Sync all properties
  mirrorTask.text = sourceTask.text;
  mirrorTask.completed = sourceTask.completed;
  mirrorTask.dueDate = sourceTask.dueDate;
  mirrorTask.tags = sourceTask.tags;
  mirrorTask.mirrorSyncVersion = nextVersion;
  
  // Emit sync event
  eventBus.emit(Events.MIRROR_TASK_SYNC, {
    sourceSpaceId: taskData.spaceId,
    destSpaceId: sourceTask.mirrorSpaceId,
    sourceTaskId: sourceTask.createdAt,
    mirrorTaskId: sourceTask.mirrorTaskId,
    changes: taskData.changes,
    timestamp: Date.now()
  });
  
  saveData(true);
}

/**
 * Show space picker modal for selecting mirror destination
 * Modal displays all available spaces as buttons
 * 
 * @param {function} onSelect - Callback when space selected: (spaceId) => void
 * @param {function} onCancel - Optional callback when cancelled
 */
export function showSpPickerModal(onSelect, onCancel) {
  // Create backdrop
  const backdrop = document.createElement('div');
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 9999;
  `;
  
  const modal = document.createElement('div');
  modal.className = 'sp-picker-modal';
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--bg-card, #fff);
    border: 1px solid var(--border-color, #ddd);
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    z-index: 10000;
    max-height: 70vh;
    overflow-y: auto;
    min-width: 320px;
    max-width: 400px;
    font-family: var(--font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  `;
  
  const spaces = getSpaces();
  
  let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
  html += '<h3 style="margin: 0 0 15px 0; font-size: 14px; font-weight: 600; color: var(--text-main, #000);">Select destination space:</h3>';
  
  spaces.forEach(s => {
    html += `
      <button class="sp-picker-btn" data-space-id="${s.id}" 
        style="
          padding: 10px 12px; 
          background: var(--bg-body, #f5f5f5); 
          border: 1px solid var(--border-color, #ddd); 
          border-radius: 4px; 
          cursor: pointer; 
          text-align: left; 
          font-size: 13px;
          color: var(--text-main, #000);
          transition: all 0.2s;
        "
        onmouseover="this.style.background='var(--primary-color, #4a86e8)'; this.style.color='white';"
        onmouseout="this.style.background='var(--bg-body, #f5f5f5)'; this.style.color='var(--text-main, #000)';"
      >
        📍 ${s.name}
      </button>
    `;
  });
  
  html += `
    <button id="sp-picker-cancel" 
      style="
        padding: 8px 12px; 
        background: #e0e0e0; 
        border: 1px solid #999; 
        border-radius: 4px; 
        cursor: pointer; 
        margin-top: 10px; 
        font-size: 13px;
        transition: all 0.2s;
      "
      onmouseover="this.style.background='#d0d0d0';"
      onmouseout="this.style.background='#e0e0e0';"
    >
      Cancel
    </button>
  `;
  html += '</div>';
  
  modal.innerHTML = html;
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  
  // Button listeners
  modal.querySelectorAll('.sp-picker-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const spaceId = parseInt(btn.dataset.spaceId);
      cleanup();
      onSelect(spaceId);
    });
  });
  
  modal.querySelector('#sp-picker-cancel').addEventListener('click', () => {
    cleanup();
    if (onCancel) onCancel();
  });
  
  // Close on backdrop click
  backdrop.addEventListener('click', () => {
    cleanup();
    if (onCancel) onCancel();
  });
  
  // Close on escape
  const closeOnEscape = (e) => {
    if (e.key === 'Escape') {
      cleanup();
      if (onCancel) onCancel();
    }
  };
  document.addEventListener('keydown', closeOnEscape);
  
  function cleanup() {
    backdrop.remove();
    modal.remove();
    document.removeEventListener('keydown', closeOnEscape);
  }
}
