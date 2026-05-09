/**
 * Resource Link Blocks — จัดกลุ่มลิงก์ใน Resources แบบเดียวกับ Task blocks
 * Header: { isResourceBlockHeader, blockId, blockName, blockColor, url, title, ... }
 */

import { getSpaces, saveData } from '../core/storage.js';
import { getColorKey, BLOCK_COLORS } from '../features/blockManager.js';

function hexToRgb(hex) {
    if (!hex) return null;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
        : null;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function createResourceBlock(space, name, color) {
    if (!space) return null;
    const blockId = `resblock_${Date.now()}`;
    const url = `resblock://${blockId}`;
    const header = {
        isResourceBlockHeader: true,
        blockId,
        blockName: name,
        blockColor: color,
        createdAt: Date.now(),
        url,
        title: `Block: ${name}`,
        tags: [],
        isSideView: false,
        isDeleted: false,
        isArchived: false,
    };
    if (!space.resources) space.resources = [];
    space.resources.push(header);
    saveData(true);
    console.log(`[ResourceBlock] Created "${name}" (${blockId})`);
    return blockId;
}

export function deleteResourceBlock(space, blockId) {
    if (!space?.resources) return;
    space.resources = space.resources.filter(r => !(r.isResourceBlockHeader && r.blockId === blockId));
    space.resources.forEach(r => {
        if (r.blockId === blockId) {
            delete r.blockId;
            delete r.blockName;
            delete r.blockColor;
        }
    });
    saveData(true);
}

export function renameResourceBlock(space, blockId, newName) {
    if (!space?.resources) return;
    space.resources.forEach(r => {
        if (r.isResourceBlockHeader && r.blockId === blockId) {
            r.blockName = newName;
            r.title = `Block: ${newName}`;
        }
        if (r.blockId === blockId) r.blockName = newName;
    });
    saveData(true);
}

export function recolorResourceBlock(space, blockId, newColor) {
    if (!space?.resources) return;
    space.resources.forEach(r => {
        if (r.isResourceBlockHeader && r.blockId === blockId) r.blockColor = newColor;
        if (r.blockId === blockId) r.blockColor = newColor;
    });
    saveData(true);
}

export function assignResourceToBlock(spaceId, resourceIndex, blockId, blockName, blockColor) {
    const space = getSpaces().find(s => s.id === spaceId);
    if (!space?.resources || resourceIndex < 0 || resourceIndex >= space.resources.length) return;
    const r = space.resources[resourceIndex];
    if (!r || r.isResourceBlockHeader) return;
    r.blockId = blockId;
    r.blockName = blockName;
    r.blockColor = blockColor;
    saveData(true);
}

export function generateResourceBlockSectionHTML(blockHeader, assignedHTML, assignedCount, headerIndex = -1) {
    const { blockId, blockName, blockColor } = blockHeader;
    const colorKey = getColorKey(blockColor);
    const rgb = hexToRgb(blockColor);
    const inlineGlow = rgb ? `--block-rgb:${rgb.r},${rgb.g},${rgb.b};` : '';
    const idxAttr = headerIndex >= 0 ? ` data-index="${headerIndex}"` : '';

    return `
<li class="block-container resource-block-container res-block-glow-${colorKey}" data-block-id="${blockId}"${idxAttr} style="${inlineGlow} list-style:none;">
  <div class="block-header" style="border-left-color:${blockColor};">
    <div class="block-header-left">
      <span class="drag-handle block-drag-handle" title="Drag to reorder block" style="cursor:grab;display:inline-flex;align-items:center;opacity:0.4;margin-right:4px;"><svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg></span>
      <svg class="block-icon" viewBox="0 0 24 24" fill="none" stroke="${blockColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="7" width="9" height="9" rx="1"/><rect x="13" y="7" width="9" height="9" rx="1"/><rect x="7" y="2" width="9" height="9" rx="1"/>
      </svg>
      <span class="block-name" data-block-id="${blockId}">${escapeHtml(blockName)}</span>
      <span class="block-task-count" style="color:${blockColor};">${assignedCount} link${assignedCount !== 1 ? 's' : ''}</span>
    </div>
        <button type="button" class="btn-icon block-btn-toggle-actions" data-block-id="${blockId}" title="Toggle block actions" aria-label="Toggle block actions">
            <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="12" y1="12" x2="12.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/></svg>
        </button>
    <div class="block-header-actions">
      <button type="button" class="btn-icon res-block-btn-rename" data-block-id="${blockId}" title="Rename block">
        <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button type="button" class="btn-icon res-block-btn-recolor" data-block-id="${blockId}" title="Change color" style="color:${blockColor};">
        <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
      </button>
      <button type="button" class="btn-icon res-block-btn-assign" data-block-id="${blockId}" title="Add link to block" style="color:${blockColor};">
        <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button type="button" class="btn-icon res-block-btn-delete" data-block-id="${blockId}" title="Delete block" style="color:#ef4444;">
        <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </div>
  <ul class="item-list task-list block-drop-zone resource-block-drop-zone" data-block-id="${blockId}" data-block-name="${escapeHtml(blockName)}" data-block-color="${blockColor}" style="min-height:36px;">
    ${assignedHTML || `<li class="block-empty-hint">Drop links here</li>`}
  </ul>
</li>`;
}

function showResRecolorPicker(blockId, space, renderFn, anchorEl) {
    document.querySelectorAll('.block-recolor-popover').forEach(p => p.remove());
    const popover = document.createElement('div');
    popover.className = 'block-recolor-popover';
    popover.innerHTML = BLOCK_COLORS.map(
        c => `<button type="button" class="block-color-swatch" data-color="${c.hex}" data-key="${c.key}" title="${c.label}" style="background:${c.hex};"></button>`
    ).join('');
    popover.querySelectorAll('.block-color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            recolorResourceBlock(space, blockId, swatch.dataset.color);
            popover.remove();
            renderFn();
        });
    });
    document.body.appendChild(popover);
    const rect = anchorEl.getBoundingClientRect();
    popover.style.cssText = `position:fixed;z-index:10001;display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:var(--bg-card,#fff);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.15);width:180px;left:${Math.max(8, rect.right - 188)}px;top:${rect.bottom + 4}px;`;
    setTimeout(() => {
        const close = (e) => {
            if (!popover.contains(e.target)) {
                popover.remove();
                document.removeEventListener('click', close, true);
            }
        };
        document.addEventListener('click', close, true);
    }, 0);
}

function showResAssignPicker(blockId, blockName, blockColor, space, renderFn, anchorEl) {
    document.querySelectorAll('.block-assign-popover').forEach(p => p.remove());
    const unassigned = space.resources
        .map((r, i) => ({ r, i }))
        .filter(
            ({ r }) =>
                !r.isResourceBlockHeader &&
                !r.blockId &&
                !r.isDeleted &&
                !r.isArchived &&
                r.url &&
                !String(r.url).startsWith('resblock://')
        );
    if (unassigned.length === 0) {
        alert('No ungrouped links to add. Drag a link into the block instead.');
        return;
    }
    const popover = document.createElement('div');
    popover.className = 'block-recolor-popover block-assign-popover';
    popover.style.cssText =
        'position:fixed;z-index:10001;min-width:200px;max-width:320px;max-height:260px;overflow-y:auto;padding:8px;background:var(--bg-card,#fff);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.15);';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:11px;font-weight:800;color:var(--text-muted);margin-bottom:6px;';
    title.textContent = `Add to "${blockName}"`;
    popover.appendChild(title);
    unassigned.forEach(({ r, i }) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.style.cssText =
            'display:block;width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:7px 10px;border-radius:6px;font-size:13px;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        row.textContent = r.title || r.url;
        row.addEventListener('click', () => {
            assignResourceToBlock(space.id, i, blockId, blockName, blockColor);
            popover.remove();
            renderFn();
        });
        popover.appendChild(row);
    });
    document.body.appendChild(popover);
    const rect = anchorEl.getBoundingClientRect();
    popover.style.left = `${Math.max(8, rect.right - 220)}px`;
    popover.style.top = `${rect.bottom + 4}px`;
    setTimeout(() => {
        const close = (e) => {
            if (!popover.contains(e.target) && e.target !== anchorEl) {
                popover.remove();
                document.removeEventListener('click', close, true);
            }
        };
        document.addEventListener('click', close, true);
    }, 0);
}

/**
 * คลิกปุ่มบนหัว block + ลบลิงก์ออกจาก block
 */
export function attachResourceBlockActionListeners(container, space, renderFn) {
    if (!container) return;

    if (container._resBlockClickHandler) {
        container.removeEventListener('click', container._resBlockClickHandler);
    }

    const clickHandler = e => {
        const toggleBtn = e.target.closest('.block-btn-toggle-actions');
        if (toggleBtn) {
            const blockEl = toggleBtn.closest('.resource-block-container');
            if (!blockEl) return;
            const willOpen = !blockEl.classList.contains('mobile-actions-open');
            container.querySelectorAll('.resource-block-container.mobile-actions-open').forEach(el => {
                el.classList.remove('mobile-actions-open');
            });
            if (willOpen) blockEl.classList.add('mobile-actions-open');
            return;
        }

        const del = e.target.closest('.res-block-btn-delete');
        if (del) {
            const blockId = del.dataset.blockId;
            const block = space.resources.find(r => r.isResourceBlockHeader && r.blockId === blockId);
            if (!block) return;
            if (!confirm(`Delete block "${block.blockName}"? Links inside become ungrouped.`)) return;
            deleteResourceBlock(space, blockId);
            renderFn();
            return;
        }

        const ren = e.target.closest('.res-block-btn-rename');
        if (ren) {
            const blockId = ren.dataset.blockId;
            const block = space.resources.find(r => r.isResourceBlockHeader && r.blockId === blockId);
            if (!block) return;
            const nn = prompt('Rename block:', block.blockName);
            if (nn && nn.trim() && nn.trim() !== block.blockName) {
                renameResourceBlock(space, blockId, nn.trim());
                renderFn();
            }
            return;
        }

        const rec = e.target.closest('.res-block-btn-recolor');
        if (rec) {
            const blockId = rec.dataset.blockId;
            showResRecolorPicker(blockId, space, renderFn, rec);
            return;
        }

        const asg = e.target.closest('.res-block-btn-assign');
        if (asg) {
            const blockId = asg.dataset.blockId;
            const block = space.resources.find(r => r.isResourceBlockHeader && r.blockId === blockId);
            if (!block) return;
            showResAssignPicker(blockId, block.blockName, block.blockColor, space, renderFn, asg);
            return;
        }

        const rm = e.target.closest('.res-btn-remove-from-block');
        if (rm) {
            const idx = parseInt(rm.dataset.index, 10);
            const r = space.resources[idx];
            if (!r || r.isResourceBlockHeader) return;
            delete r.blockId;
            delete r.blockName;
            delete r.blockColor;
            saveData(true);
            renderFn();
        }
    };

    container.addEventListener('click', clickHandler);
    container._resBlockClickHandler = clickHandler;
}
