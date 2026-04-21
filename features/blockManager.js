/**
 * 🧱 BlockManager — Visual Task Grouping (Block System)
 *
 * Data model:
 *   Block header task: { isBlockHeader: true, blockId, blockName, blockColor, createdAt, text, completed: false }
 *   Assigned task:     { ...existingFields, blockId, blockName, blockColor }
 *
 * Mirror independence: blockId is NEVER copied to avatar tasks (SpMirrorFeature.js createMirrorTask
 * only copies text/tags/dueDate/linkData). Space-local by design.
 */

import Sortable from '../sortable.esm.js';
import { getSpaces, saveData } from '../core/storage.js';
import { eventBus, Events } from '../core/EventBus.js';

// ─── Color Palette ─────────────────────────────────────────────────────────────

export const BLOCK_COLORS = [
    { key: 'red',    hex: '#ef4444', label: 'Red'    },
    { key: 'orange', hex: '#f97316', label: 'Orange' },
    { key: 'yellow', hex: '#eab308', label: 'Yellow' },
    { key: 'green',  hex: '#22c55e', label: 'Green'  },
    { key: 'teal',   hex: '#14b8a6', label: 'Teal'   },
    { key: 'blue',   hex: '#3b82f6', label: 'Blue'   },
    { key: 'purple', hex: '#a855f7', label: 'Purple' },
    { key: 'pink',   hex: '#ec4899', label: 'Pink'   },
];

export function getColorKey(hex) {
    const found = BLOCK_COLORS.find(c => c.hex === hex);
    return found ? found.key : 'blue';
}

// ─── Core CRUD ─────────────────────────────────────────────────────────────────

/**
 * Create a new block in a space by inserting a block-header task.
 * @param {Object} space - The space object (mutated in place).
 * @param {string} name  - Block display name.
 * @param {string} color - Color hex from BLOCK_COLORS.
 * @returns {string} The new blockId.
 */
export function createBlock(space, name, color) {
    if (!space) return null;
    const blockId = `block_${Date.now()}`;
    const header = {
        isBlockHeader: true,
        blockId,
        blockName: name,
        blockColor: color,
        createdAt: Date.now(),
        text: `Block: ${name}`,
        completed: false,
        isDeleted: false,
        tags: [],
        subtasks: [],
    };
    if (!space.tasks) space.tasks = [];
    space.tasks.push(header);
    saveData(true);
    eventBus.emit(Events.BLOCK_CREATED, { spaceId: space.id, blockId, blockName: name, blockColor: color });
    console.log(`[BlockManager] Created block "${name}" (${blockId}) in Space ${space.id}`);
    return blockId;
}

/**
 * Assign an existing task to a block (sets blockId metadata on the task).
 * @param {number} spaceId      - Space ID containing the task.
 * @param {number} taskCreatedAt - The task's createdAt timestamp (unique ID).
 * @param {string} blockId      - Target block ID.
 * @param {string} blockName    - Block name (denormalized for easy rendering).
 * @param {string} blockColor   - Block color hex (denormalized).
 */
export function assignTaskToBlock(spaceId, taskCreatedAt, blockId, blockName, blockColor) {
    const space = getSpaces().find(s => s.id === spaceId);
    if (!space?.tasks) return;
    const task = space.tasks.find(t => t.createdAt === taskCreatedAt && !t.isBlockHeader);
    if (!task) return;
    task.blockId = blockId;
    task.blockName = blockName;
    task.blockColor = blockColor;
    saveData(true);
    eventBus.emit(Events.BLOCK_UPDATED, { spaceId, blockId, changes: { assigned: taskCreatedAt } });
    console.log(`[BlockManager] Task ${taskCreatedAt} assigned to block "${blockName}"`);
}

/**
 * Remove a task from its block (clears blockId metadata).
 * @param {number} spaceId      - Space ID.
 * @param {number} taskCreatedAt - Task createdAt timestamp.
 */
export function removeTaskFromBlock(spaceId, taskCreatedAt) {
    const space = getSpaces().find(s => s.id === spaceId);
    if (!space?.tasks) return;
    const task = space.tasks.find(t => t.createdAt === taskCreatedAt);
    if (!task) return;
    const blockId = task.blockId;
    delete task.blockId;
    delete task.blockName;
    delete task.blockColor;
    saveData(true);
    eventBus.emit(Events.BLOCK_UPDATED, { spaceId, blockId, changes: { unassigned: taskCreatedAt } });
    console.log(`[BlockManager] Task ${taskCreatedAt} removed from block`);
}

/**
 * Rename a block and update all assigned tasks with the new name.
 * @param {Object} space    - The space object.
 * @param {string} blockId  - Block to rename.
 * @param {string} newName  - New display name.
 */
export function renameBlock(space, blockId, newName) {
    if (!space?.tasks) return;
    space.tasks.forEach(t => {
        if (t.blockId === blockId) {
            t.blockName = newName;
            if (t.isBlockHeader) t.text = `Block: ${newName}`;
        }
    });
    saveData(true);
    eventBus.emit(Events.BLOCK_UPDATED, { spaceId: space.id, blockId, changes: { blockName: newName } });
}

/**
 * Recolor a block and update all assigned tasks with the new color.
 * @param {Object} space    - The space object.
 * @param {string} blockId  - Block to recolor.
 * @param {string} newColor - New color hex.
 */
export function recolorBlock(space, blockId, newColor) {
    if (!space?.tasks) return;
    space.tasks.forEach(t => {
        if (t.blockId === blockId) t.blockColor = newColor;
    });
    saveData(true);
    eventBus.emit(Events.BLOCK_UPDATED, { spaceId: space.id, blockId, changes: { blockColor: newColor } });
}

/**
 * Delete a block: removes the block-header task and clears blockId from all assigned tasks.
 * @param {Object} space   - The space object (mutated in place).
 * @param {string} blockId - Block to delete.
 */
export function deleteBlock(space, blockId) {
    if (!space?.tasks) return;
    space.tasks = space.tasks.filter(t => !(t.isBlockHeader && t.blockId === blockId));
    space.tasks.forEach(t => {
        if (t.blockId === blockId) {
            delete t.blockId;
            delete t.blockName;
            delete t.blockColor;
        }
    });
    saveData(true);
    eventBus.emit(Events.BLOCK_DELETED, { spaceId: space.id, blockId });
    console.log(`[BlockManager] Block ${blockId} deleted from Space ${space.id}`);
}

// ─── HTML Generation ───────────────────────────────────────────────────────────

/**
 * Generate the HTML string for a single block section (header + drop zone).
 * The assigned tasks HTML is injected inline.
 * @param {Object} blockHeader   - The block-header task object.
 * @param {string} assignedHTML  - Pre-rendered HTML of assigned tasks.
 * @param {number} assignedCount - Number of assigned (visible) tasks.
 * @returns {string} Complete block section HTML.
 */
export function generateBlockSectionHTML(blockHeader, assignedHTML, assignedCount, headerIndex = -1) {
    const { blockId, blockName, blockColor } = blockHeader;
    const colorKey = getColorKey(blockColor);
    const rgb = hexToRgb(blockColor);
    const inlineGlow = rgb
        ? `--block-rgb:${rgb.r},${rgb.g},${rgb.b};`
        : '';
    const idxAttr = headerIndex >= 0 ? ` data-index="${headerIndex}"` : '';

    return `
<li class="block-container block-glow-${colorKey}" data-block-id="${blockId}"${idxAttr} style="${inlineGlow}">
  <div class="block-header" style="border-left-color:${blockColor};">
    <div class="block-header-left">
      <span class="drag-handle block-drag-handle" title="Drag to reorder block" style="cursor:grab;display:inline-flex;align-items:center;opacity:0.4;margin-right:4px;"><svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg></span>
      <svg class="block-icon" viewBox="0 0 24 24" fill="none" stroke="${blockColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="7" width="9" height="9" rx="1"/><rect x="13" y="7" width="9" height="9" rx="1"/><rect x="7" y="2" width="9" height="9" rx="1"/>
      </svg>
      <span class="block-name" data-block-id="${blockId}">${escapeHtml(blockName)}</span>
      <span class="block-task-count" style="color:${blockColor};">${assignedCount} task${assignedCount !== 1 ? 's' : ''}</span>
    </div>
    <div class="block-header-actions">
      <button class="btn-icon block-btn-rename" data-block-id="${blockId}" title="Rename block">
        <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn-icon block-btn-recolor" data-block-id="${blockId}" title="Change color" style="color:${blockColor};">
        <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
      </button>
      <button class="btn-icon block-btn-assign" data-block-id="${blockId}" title="Add task to block" style="color:${blockColor};">
        <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="btn-icon block-btn-delete" data-block-id="${blockId}" title="Delete block" style="color:#ef4444;">
        <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </div>
  <ul class="task-list block-drop-zone" data-block-id="${blockId}" data-block-name="${escapeHtml(blockName)}" data-block-color="${blockColor}" style="min-height:36px;">
    ${assignedHTML || `<li class="block-empty-hint">Drop tasks here to group them</li>`}
  </ul>
</li>`;
}

// ─── Drop Zone Initialization ──────────────────────────────────────────────────

/**
 * Wire Sortable drop zones on all .block-drop-zone elements inside a container.
 * Import Sortable from the project root (already loaded globally).
 * @param {HTMLElement} container - The parent element to search within.
 * @param {number} spaceId       - Current space ID.
 * @param {Function} renderFn    - Callback to trigger re-render after drop.
 */
export function initBlockDropZones(container, spaceId, renderFn) {
    if (!container) return;
    container.querySelectorAll('.block-drop-zone').forEach(zone => {
        if (zone._blockSortable) zone._blockSortable.destroy();
        zone._blockSortable = Sortable.create(zone, {
            group: 'nested-tasks',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onAdd: (evt) => {
                // Data mutation (blockId assignment) is handled by initNestedSortable's onEnd.
                // Remove the ghost element so Sortable doesn't leave a stale DOM node.
                evt.item.remove();
            },
            onEnd: (evt) => {
                const { from, to, item } = evt;
                // Basket drop: let basket handle it
                if (to?.id === 'basket-content-list') return;
                // No movement
                if (from === to && evt.oldIndex === evt.newIndex) return;
                // Only handle when SOURCE is a block-drop-zone (i.e. this handler)
                if (!from.classList.contains('block-drop-zone')) return;

                const getSpaceFromEl = (listEl) => {
                    const sid = listEl?.closest('[data-space-id]')?.dataset.spaceId;
                    return getSpaces().find(s => String(s.id) === String(sid));
                };

                const srcSpace = getSpaceFromEl(from) || getSpaces().find(s => s.id === spaceId);
                if (!srcSpace) return;

                const itemIdx = parseInt(item.getAttribute('data-index'));
                const movedItem = srcSpace.tasks.splice(itemIdx, 1)[0];
                if (!movedItem) return;

                // Always clear old block membership
                delete movedItem.blockId;
                delete movedItem.blockName;
                delete movedItem.blockColor;

                if (to?.classList.contains('block-drop-zone')) {
                    // Block → Block (or within same block): assign to destination block
                    movedItem.blockId    = to.dataset.blockId    || null;
                    movedItem.blockName  = to.dataset.blockName  || '';
                    movedItem.blockColor = to.dataset.blockColor || '';
                    const destSpace = getSpaceFromEl(to) || srcSpace;

                    // Position-aware insertion (use sibling's data-index)
                    let nextEl = item.nextElementSibling;
                    while (nextEl && !nextEl.hasAttribute('data-index')) nextEl = nextEl.nextElementSibling;
                    let finalIdx = nextEl ? parseInt(nextEl.getAttribute('data-index')) : destSpace.tasks.length;
                    if (srcSpace === destSpace && finalIdx > itemIdx) finalIdx--;
                    destSpace.tasks.splice(finalIdx, 0, movedItem);
                } else {
                    // Block → main list: insert at dropped position
                    const destSpace = getSpaceFromEl(to) || srcSpace;
                    let nextEl = item.nextElementSibling;
                    while (nextEl && !nextEl.hasAttribute('data-index')) nextEl = nextEl.nextElementSibling;
                    const finalIdx = nextEl ? parseInt(nextEl.getAttribute('data-index')) : destSpace.tasks.length;
                    destSpace.tasks.splice(finalIdx, 0, movedItem);
                }

                saveData(true);
                renderFn();
            }
        });
    });
}

// ─── Context Menu & Inline Actions ─────────────────────────────────────────────

/**
 * Attach click handlers for block header action buttons (rename, recolor, delete).
 * @param {HTMLElement} container - The task list container.
 * @param {Object} space          - Current space object.
 * @param {Function} renderFn    - Re-render callback.
 */
export function attachBlockActionListeners(container, space, renderFn) {
    if (!container) return;

    container.addEventListener('click', (e) => {
        // ── Delete ──
        const deleteBtn = e.target.closest('.block-btn-delete');
        if (deleteBtn) {
            const blockId = deleteBtn.dataset.blockId;
            const block = space.tasks.find(t => t.isBlockHeader && t.blockId === blockId);
            if (!block) return;
            if (!confirm(`Delete block "${block.blockName}"? Tasks inside will become ungrouped.`)) return;
            deleteBlock(space, blockId);
            renderFn();
            return;
        }

        // ── Rename ──
        const renameBtn = e.target.closest('.block-btn-rename');
        if (renameBtn) {
            const blockId = renameBtn.dataset.blockId;
            const block = space.tasks.find(t => t.isBlockHeader && t.blockId === blockId);
            if (!block) return;
            const newName = prompt('Rename block:', block.blockName);
            if (newName && newName.trim() && newName.trim() !== block.blockName) {
                renameBlock(space, blockId, newName.trim());
                renderFn();
            }
            return;
        }

        // ── Recolor ──
        const recolorBtn = e.target.closest('.block-btn-recolor');
        if (recolorBtn) {
            const blockId = recolorBtn.dataset.blockId;
            showRecolorPicker(blockId, space, renderFn, recolorBtn);
            return;
        }

        // ── Assign task (mobile picker) ──
        const assignBtn = e.target.closest('.block-btn-assign');
        if (assignBtn) {
            const blockId = assignBtn.dataset.blockId;
            const block = space.tasks.find(t => t.isBlockHeader && t.blockId === blockId);
            if (!block) return;
            showAssignTaskPicker(blockId, block.blockName, block.blockColor, space, renderFn, assignBtn);
            return;
        }

        // ── Remove task from block (right-click context fallback via data attr) ──
        const removeFromBlock = e.target.closest('.block-btn-remove-task');
        if (removeFromBlock) {
            const taskCreatedAt = parseFloat(removeFromBlock.dataset.taskId);
            removeTaskFromBlock(space.id, taskCreatedAt);
            renderFn();
            return;
        }
    });
}

/**
 * Show a small inline color picker popover near a button.
 */
function showRecolorPicker(blockId, space, renderFn, anchorEl) {
    document.querySelectorAll('.block-recolor-popover').forEach(p => p.remove());

    const popover = document.createElement('div');
    popover.className = 'block-recolor-popover';
    popover.innerHTML = BLOCK_COLORS.map(c =>
        `<button class="block-color-swatch" data-color="${c.hex}" data-key="${c.key}" title="${c.label}" style="background:${c.hex};"></button>`
    ).join('');

    document.body.appendChild(popover);

    const rect = anchorEl.getBoundingClientRect();
    popover.style.left = `${rect.left}px`;
    popover.style.top  = `${rect.bottom + 4}px`;

    popover.querySelectorAll('.block-color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            recolorBlock(space, blockId, swatch.dataset.color);
            popover.remove();
            renderFn();
        });
    });

    const close = (e) => {
        if (!popover.contains(e.target)) { popover.remove(); document.removeEventListener('click', close, true); }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
}

/**
 * Show a floating task-picker popover to assign an unassigned task to a block (for mobile).
 */
function showAssignTaskPicker(blockId, blockName, blockColor, space, renderFn, anchorEl) {
    document.querySelectorAll('.block-assign-popover').forEach(p => p.remove());

    const unassigned = (space.tasks || []).filter(t =>
        !t.isBlockHeader && !t.blockId && !t.completed && !t.isDeleted && t.text
    );

    const popover = document.createElement('div');
    popover.className = 'block-recolor-popover block-assign-popover';
    popover.style.cssText += 'padding:6px 4px;min-width:200px;max-width:280px;max-height:260px;overflow-y:auto;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;padding:2px 8px 6px;';
    title.textContent = `Add to "${blockName}"`;
    popover.appendChild(title);

    if (unassigned.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'font-size:12px;color:var(--text-muted);padding:6px 8px;text-align:center;';
        empty.textContent = 'No unassigned tasks';
        popover.appendChild(empty);
    } else {
        unassigned.forEach(task => {
            const row = document.createElement('button');
            row.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:7px 10px;border-radius:6px;font-size:13px;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            row.title = task.text;
            row.textContent = task.text;
            row.addEventListener('mouseover', () => { row.style.background = 'var(--bg-hover,rgba(0,0,0,0.06))'; });
            row.addEventListener('mouseout',  () => { row.style.background = ''; });
            row.addEventListener('click', () => {
                assignTaskToBlock(space.id, task.createdAt, blockId, blockName, blockColor);
                popover.remove();
                renderFn();
            });
            popover.appendChild(row);
        });
    }

    document.body.appendChild(popover);

    const rect = anchorEl.getBoundingClientRect();
    // Position: prefer above; fall back to below if near top
    const popH = Math.min(unassigned.length * 38 + 34, 260);
    const topAbove = rect.top - popH - 4;
    popover.style.left = `${Math.max(8, rect.right - 200)}px`;
    popover.style.top  = `${topAbove > 8 ? topAbove : rect.bottom + 4}px`;

    const close = (e) => {
        if (!popover.contains(e.target) && e.target !== anchorEl) {
            popover.remove();
            document.removeEventListener('click', close, true);
        }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
    if (!hex) return null;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
