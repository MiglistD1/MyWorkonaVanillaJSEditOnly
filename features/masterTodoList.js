import { getSpaces, saveData, getAppSettings, setCurrentSpaceId, getFilterTags, loadData } from '../core/storage.js';
import Sortable from '../sortable.esm.js';
import { svgRefresh } from '../core/icons.js';
import { openTaskEditModal, openTaskLinkModal, isAnyEditableElementFocused, toggleTaskFocus, playTaskCompletedSound, calculateNextDate, renderSpaceInline } from './todoManager.js'; 
import { handleMiniTagClick } from '../components/modals.js';
import { generateTaskHTML, attachSubtaskEventListeners, attachTaskInlineEditListeners, handleTagAutocomplete, applySyntaxHighlighting, getFaviconUrl, openOrFocusTab } from '../core/ui-helpers.js';

import { renderSidebar } from '../components/sidebar.js';
import { updateKeepTagButtonState } from './googleKeep.js';
import { createCalendarEvent, deleteCalendarEvent } from '../core/calendarSync.js';

/** 🟢 Helper: จัดลำดับงานตามเงื่อนไขที่เลือก (เฉพาะ Main Tasks) */
function sortSpaceTasks(space) {
    if (!space || !space.tasks || !space.taskSortOrder || space.taskSortOrder === 'manual') return;

    space.tasks.sort((a, b) => {
        // 1. ให้งานติดธง (isProminent) อยู่บนสุดเสมอ
        if (a.isProminent && !b.isProminent) return -1;
        if (!a.isProminent && b.isProminent) return 1;

        if (space.taskSortOrder === 'name') {
            return (a.text || "").localeCompare(b.text || "");
        } else if (space.taskSortOrder === 'date') {
            const d1 = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const d2 = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            return d1 - d2;
        }
        return 0;
    });
}

const computerIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="12" y1="17" x2="12" y2="21"></line><line x1="8" y1="21" x2="16" y2="21"></line></svg>`;

/**
 * State for the Master Todo List
 */
export const masterTodoListState = {
    activeSpaceFilters: new Set(),
    showOnlyFlagged: false,
    dateFilter: 'all',
    isProgressVisible: true,
    showMasterTaskActions: false,
    isSingleSelectMode: true,
    addingSubtaskToTaskId: null,
    addingSubtaskToSpaceId: null,
    selectedQuickAddSpaceId: null,
    searchQuery: '',
    collapsedFolders: new Set(),
    activeFolderTab: null,
    lastAppliedTemplateName: null, // 🟢 เพิ่มเพื่อจำชื่อ View ล่าสุด
    mirroredSpaces: new Set() // 🟢 NEW: Track which spaces are mirrored in the portal view
};

const peekState = { spaceId: null, isFloat: false, floatX: 80, floatY: 80, inlineWidth: 268 };
let _peekResizeHandler = null;

function applyDateFilter(tasks) {
    const filter = masterTodoListState.dateFilter;
    if (!filter || filter === 'all') return tasks;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter(t => {
        if (!t.dueDate) return filter === 'no-date';
        if (filter === 'no-date') return false;
        const d = new Date(t.dueDate);
        d.setHours(0, 0, 0, 0);
        if (filter === 'past')   return d < today;
        if (filter === 'today')  return d.getTime() === today.getTime();
        if (filter === 'future') return d > today;
        return false;
    });
}

/**
 * Renders the controls (Buttons & Input Bar) typically placed in the header.
 */
export function renderMasterHeaderControls() {
    const allSpaces = getSpaces().filter(s => !s.isArchived && !s.isDeleted);
    
    // หา ID ที่ควรจะถูกเลือกใน Dropdown (จาก State หรือค่าแรกสุดในรายการ)
    const selectedId = masterTodoListState.selectedQuickAddSpaceId || (allSpaces.length > 0 ? allSpaces[0].id : null);

    return `
        <div style="display:flex; align-items:center; gap:6px; flex-shrink: 0;">
            <button id="btn-master-toggle-task-actions" class="btn-icon" title="Toggle Task Actions Visibility" style="padding: 2px; opacity: 1;">
                <span class="toggle-actions-btn circle-icon ${masterTodoListState.showMasterTaskActions ? 'expanded' : ''}" style="margin: 0; pointer-events: none;"></span>
            </button>
            <button id="btn-master-toggle-progress" class="btn-icon" title="${masterTodoListState.isProgressVisible ? 'Hide Space Tags' : 'Show Space Tags'}" style="padding:2px; opacity: 0.6;">
                <svg class="svg-icon-sm" style="transform: ${masterTodoListState.isProgressVisible ? 'rotate(0deg)' : 'rotate(180deg)'}; transition: transform 0.2s;"><use href="#icon-chevron-up"></use></svg>
            </button>
        </div>

        <div class="master-search-wrapper">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" id="master-search-input" class="master-search-input" placeholder="Search tasks…" value="${masterTodoListState.searchQuery || ''}">
        </div>

        <div class="task-input-bar master-input-area" style="flex: 1; margin: 0; height: 34px; box-shadow: none;">
            <select id="master-space-selector" class="master-space-select" style="border-radius: 0;">
                ${allSpaces.map(s => `<option value="${s.id}" ${parseInt(s.id) === parseInt(selectedId) ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
            <input type="text" id="master-task-input" class="task-input" placeholder="Quick add task..." style="font-size: 13px;">
            <button class="btn btn-primary" id="btn-master-add-task">Add</button>
        </div>
    `;
}

/**
 * Main Entry: Renders the Task Groups and Progress into the body container.
 */
export function renderMasterTodoList(container) {
    if (!container) return;

    // 🛑 ป้องกัน UI เอ๋อในหน้า Command Center: ห้ามวาดใหม่ขณะพิมพ์
    if (document.activeElement && document.activeElement.classList.contains('task-actual-text')) {
        console.log("Master Render skipped: User is typing.");
        return;
    }
    // 🟢 
    const allSpaces = getSpaces().filter(s => !s.isArchived && !s.isDeleted);
    let totalTasks = 0;
    let completedTasks = 0;

    allSpaces.forEach(space => {
        if (!masterTodoListState.activeSpaceFilters.has(space.id) && space.tasks) {
            const activeTasks = space.tasks.filter(t => t && !t.completed && !t.isDeleted);
            let tasksToCount = masterTodoListState.showOnlyFlagged ? activeTasks.filter(t => t.isProminent) : activeTasks;
            tasksToCount = applyDateFilter(tasksToCount);
            totalTasks += tasksToCount.length;
            completedTasks += space.tasks.filter(t => t && t.completed).length;
        }
    });

    container.innerHTML = `
        ${renderProgressSection(allSpaces, totalTasks)}
        <div id="master-groups-container">
            ${renderTaskGroups(allSpaces)}
        </div>
        ${totalTasks === 0 ? '<p style="text-align:center; color:var(--text-muted); margin-top:40px; font-size:13px;">Your Command Center is empty. Start by adding a task!</p>' : ''}
    `;

    // 🟢 NEW: Apply syntax highlighting to all task texts in the master list after rendering
    container.querySelectorAll('.task-actual-text').forEach(el => {
        applySyntaxHighlighting(el);
    });

    initMasterEvents();

    // 🟢 Trigger rendering for all mirrored spaces (Mirror Portal Architecture)
    masterTodoListState.mirroredSpaces.forEach(spaceIdStr => {
        const portal = document.getElementById(`portal-${spaceIdStr}`);
        if (portal) {
            portal.style.display = 'block'; // 🟢 Ensure portal is visible
            try {
                renderSpaceInline(spaceIdStr, portal, { showActions: masterTodoListState.showMasterTaskActions });
            } catch (err) {
                console.error(`Mirror Portal initial rendering failed for ${spaceIdStr}:`, err);
            }
        }
    });

    // 🟢 Restore search input focus after re-render (for real-time filtering)
    if (masterTodoListState._restoreSearchFocus) {
        masterTodoListState._restoreSearchFocus = false;
        const searchEl = document.getElementById('master-search-input');
        if (searchEl) { searchEl.focus(); const l = searchEl.value.length; searchEl.setSelectionRange(l, l); }
    }

    // 🟢 Re-inject inline peek panel after DOM rebuild by renderDefaultDashboard
    if (peekState.spaceId !== null && !peekState.isFloat) {
        renderSpacePeekPanel(peekState.spaceId);
    }
}

function renderProgressSection(allSpaces, totalTasks) {
    // 🟢 ดึงค่าจาก appSettings (เพราะ Command Center คือพื้นที่กลาง)
    const settings = getAppSettings();
    const isSingle = settings.masterIsSingleSelectMode ?? masterTodoListState.isSingleSelectMode;
    const isLocked = !!settings.masterIsModeLocked;

    // Named templates (exclude legacy array keys like spaceOrder / activeFilters)
    const templates = settings.viewTemplates || {};
    const templateNames = Object.keys(templates).filter(k => templates[k] && typeof templates[k] === 'object' && !Array.isArray(templates[k]));

    // Folder structure for the switcher bar
    const folderMap = {};
    allSpaces.forEach(s => {
        const f = s.folder || 'General';
        if (!folderMap[f]) folderMap[f] = [];
        folderMap[f].push(s);
    });
    const folderNames = Object.keys(folderMap).sort((a, b) => {
        if (a === 'General') return -1;
        if (b === 'General') return 1;
        return a.localeCompare(b);
    });
    const showFolderPills = folderNames.length > 1 || !folderNames.includes('General');
    const activeFolderTab = masterTodoListState.activeFolderTab;
    const spacesForActiveFolder = activeFolderTab ? (folderMap[activeFolderTab] || []) : [];

    return `
        <div class="master-progress-container">
            <div class="master-progress-info">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-weight:700;">Task Completion</span>                                
                    <button id="btn-master-filter-flagged" class="${masterTodoListState.showOnlyFlagged ? 'active' : ''}" 
                        title="${masterTodoListState.showOnlyFlagged ? 'Show All Tasks' : 'Show Only Flagged Tasks'}">
                        <svg class="svg-icon-sm"><use href="#icon-flag"></use></svg>
                    </button>
                    <select id="master-date-filter" title="Filter by date" style="font-family:var(--app-font); font-size:10px; font-weight:700; padding:2px 6px; height:24px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-body); color:${masterTodoListState.dateFilter !== 'all' ? 'var(--primary-color)' : 'var(--text-muted)'}; cursor:pointer; outline:none;">
                        <option value="all"     ${masterTodoListState.dateFilter === 'all'     ? 'selected' : ''}>📋 All</option>
                        <option value="no-date" ${masterTodoListState.dateFilter === 'no-date' ? 'selected' : ''}>📌 No Date</option>
                        <option value="past"    ${masterTodoListState.dateFilter === 'past'    ? 'selected' : ''}>🔴 Past</option>
                        <option value="today"   ${masterTodoListState.dateFilter === 'today'   ? 'selected' : ''}>🟡 Today</option>
                        <option value="future"  ${masterTodoListState.dateFilter === 'future'  ? 'selected' : ''}>🟢 Upcoming</option>
                    </select>
                    <div style="display: flex; align-items: center; gap: 4px; background: var(--bg-body); padding: 2px 6px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <button id="btn-master-mode-lock" class="btn-icon" title="${isLocked ? 'Unlock Settings' : 'Lock Settings'}" style="color: ${isLocked ? '#ef4444' : '#10b981'}; opacity: ${isLocked ? '1' : '0.4'}; padding: 2px;">
                            <svg class="svg-icon-sm"><use href="#icon-${isLocked ? 'lock-minimal' : 'unlock-minimal'}"></use></svg>
                        </button>
                        <button id="btn-master-toggle-select-mode" 
                            style="padding: 2px 8px; font-size: 10px; border-radius: 4px; font-weight: 700; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; transition: all 0.2s; 
                            background: ${isSingle ? '#f3e8ff' : '#dcfce7'}; color: ${isSingle ? '#6b21a8' : '#166534'}; border: 1px solid ${isSingle ? '#6b21a8' : '#166534'}; opacity: ${isLocked ? '0.7' : '1'};">
                            ${isSingle ? 'Single' : 'Multi'}
                        </button>
                    </div>
                    <div class="master-view-templates">
                        <select id="master-view-template-select" class="master-template-select" title="Apply a saved view">
                            <option value="" ${!masterTodoListState.lastAppliedTemplateName ? 'selected' : ''}>— View —</option>
                            ${templateNames.map(n => `<option value="${n}" ${masterTodoListState.lastAppliedTemplateName === n ? 'selected' : ''}>${n}</option>`).join('')}
                        </select>
                        <button id="btn-manage-templates" class="btn-manage-templates" title="Manage view templates"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
                        <button id="btn-reset-order" class="btn-reset-order" title="Reset space order to default">↺</button>
                    </div>
                </div>
                <span id="progress-text" style="font-weight: 700; color: var(--primary-color);">${totalTasks} ${masterTodoListState.showOnlyFlagged ? 'Flagged' : ''} Tasks Remaining</span>
            </div>
            <div style="height: 1px; background: var(--border-color); margin-top: 4px; opacity: 0.5;"></div>
        </div>

        <div class="master-space-switcher" style="${masterTodoListState.isProgressVisible ? '' : 'display: none;'}">
            <div class="master-space-switcher-inner">
                <button class="space-switcher-pill all-pill ${masterTodoListState.activeSpaceFilters.size === 0 ? 'active' : ''}" id="btn-master-filter-all">All</button>
                <div class="switcher-sep"></div>
                ${showFolderPills ? `
                    ${folderNames.map(f => {
                        const hasFilter = masterTodoListState.activeSpaceFilters.size > 0;
                        const visCount = (folderMap[f] || []).filter(s => !masterTodoListState.activeSpaceFilters.has(s.id)).length;
                        const hasActive = hasFilter && visCount > 0;
                        return `<button class="switcher-folder-pill ${activeFolderTab === f ? 'active' : ''} ${hasActive ? 'has-active' : ''}" data-folder="${f}">${f}${hasFilter ? `<span class="folder-pill-count">${visCount}</span>` : ''}</button>`;
                    }).join('')}
                    ${activeFolderTab && spacesForActiveFolder.length ? `
                        <div class="switcher-sep"></div>
                        ${spacesForActiveFolder.map(s => `
                            <button class="space-switcher-pill ${masterTodoListState.activeSpaceFilters.has(s.id) ? 'inactive' : 'active'}" data-space-id="${s.id}">${s.name}</button>
                        `).join('')}
                    ` : ''}
                ` : `
                    ${allSpaces.map(s => `
                        <button class="space-switcher-pill ${masterTodoListState.activeSpaceFilters.has(s.id) ? 'inactive' : 'active'}" data-space-id="${s.id}">${s.name}</button>
                    `).join('')}
                `}
            </div>
        </div>
    `;
}

function renderTaskGroups(allSpaces) {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const settings = getAppSettings();
    const searchQ = (masterTodoListState.searchQuery || '').toLowerCase().trim();

    // Apply saved space order — flat across all folders
    const savedOrder = settings.viewTemplates?.spaceOrder || [];
    if (savedOrder.length > 0) {
        allSpaces = [...allSpaces].sort((a, b) => {
            const ai = savedOrder.indexOf(a.id), bi = savedOrder.indexOf(b.id);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
    }

    const sixDotHandle = `<span class="space-group-drag-handle" title="Drag to reorder"><svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg></span>`;

    return allSpaces.map(space => {
        const isHidden = masterTodoListState.activeSpaceFilters.has(space.id);
        const tasks = space.tasks || [];
        const isSpaceProminentHidden = space.hideProminentTasks || false;

        // 🟢 จัดเรียงตามคำสั่งของ Space ก่อนกรอง
        if (space.taskSortOrder && space.taskSortOrder !== 'manual') sortSpaceTasks(space);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let displayTasks = tasks.filter(t => {
            if (!t || t.completed || t.isDeleted) return false;
            // 🟢 ซ่อนงานทำซ้ำในอนาคตที่ไม่ได้ติดธง และไม่ใช่การกู้คืน (wasRegenerated !== false)
            if (t.repeatConfig?.isRepeating && !t.isProminent && t.dueDate && t.wasRegenerated !== false) {
                const taskDue = new Date(t.dueDate);
                taskDue.setHours(0, 0, 0, 0);
                if (taskDue > today) return false;
            }
            return true;
        });

        if (masterTodoListState.showOnlyFlagged) {
            displayTasks = displayTasks.filter(t => t && t.isProminent);
        }

        displayTasks = applyDateFilter(displayTasks);

        // 🟢 Apply search query filter
        if (searchQ) {
            displayTasks = displayTasks.filter(t => (t.text || '').toLowerCase().includes(searchQ));
        }

        if (displayTasks.length === 0) return '';
        const currentSort = space.taskSortOrder || 'manual';
        const isMirrored = masterTodoListState.mirroredSpaces.has(String(space.id));

        return `
            <div class="task-group-details" data-space-id="${space.id}" ${isHidden ? 'style="display:none;"' : ''}>
                <div class="task-group-summary minimalist-header" style="border-bottom: 1px solid var(--border-color); padding: 8px 0; display: flex; align-items: center; gap: 10px;">
                    ${sixDotHandle}
                    <div style="display:flex; align-items:center; gap:8px; flex: 1; min-width: 0;">
                        <span class="group-title" style="font-weight: 700;">${space.name} (${displayTasks.length})</span>
                        <button class="btn ${isMirrored ? 'btn-outline' : 'btn-primary'} btn-toggle-mirror" data-space-id="${space.id}" style="padding: 2px 10px; font-size: 10px; height: 22px; border-radius: 6px; font-weight: 700; margin-left: 8px;">Mirror ${isMirrored ? 'OFF' : 'ON'}</button>
                        <button class="btn btn-outline btn-master-goto-space" data-space-id="${space.id}" style="padding: 2px 8px; font-size: 10px; height: 20px; border-radius: 4px; font-weight: 600; margin-left: 4px;">open space</button>
                    </div>
                </div>
                <div class="space-portal-container" id="portal-${space.id}" style="display: ${isMirrored ? 'block' : 'none'}; padding: 4px 0 15px 15px; border-left: 2px solid var(--border-color); margin-left: 10px; margin-top: 8px;"></div>
            </div>
        `;
    }).join('');
}

// ===== Space Peek Panel =====
function openInlinePeekDOM(panel) {
    const widget = document.querySelector('.master-todo-widget');
    const container = document.getElementById('master-todo-list-container');
    if (!widget || !container) return;
    panel.style.cssText = '';
    widget.style.setProperty('--spp-inline-width', `${peekState.inlineWidth}px`);
    if (panel.parentElement !== widget) {
        widget.insertBefore(panel, container);
    }
    widget.classList.add('has-peek-panel');
}

function renderSpacePeekPanel(spaceId) {
    const space = getSpaces().find(s => s.id === spaceId);
    if (!space) return;

    const noteContent = space.quickNote || '';
    const isKeepMode = !!(space.quickNoteKeepMode);
    const keepUrl = space.quickNoteKeepUrl || '';
    const resources = (space.resources || []).filter(r => !r.isDeleted && !r.isArchived);
    const sppSettings = getAppSettings().spacePeekSettings || {};
    const isLocked = !!(sppSettings.isLocked);
    if (isLocked && !peekState.isFloat) peekState.inlineWidth = sppSettings.inlineWidth || 268;

    const floatSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
    const dockSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>`;
    const panelSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;
    const openLockSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
    const closedLockSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

    let panel = document.getElementById('space-peek-panel');
    const wasFloat = panel?.classList.contains('is-float');
    const savedH = panel?.style.height;
    const savedW = panel?.style.width;
    const savedL = panel?.style.left;
    const savedT = panel?.style.top;

    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'space-peek-panel';
        if (peekState.isFloat) document.body.appendChild(panel);
    }

    panel.className = `space-peek-panel ${peekState.isFloat ? 'is-float' : 'is-inline'}${isLocked ? ' is-locked' : ''}`;

    const keepNoteArea = isKeepMode
        ? (keepUrl
            ? `<iframe class="spp-keep-iframe" src="about:blank" data-src="${keepUrl}" style="min-height:200px;"></iframe>`
            : `<div class="spp-keep-setup">
                <p style="font-size:11px;color:var(--text-muted);text-align:center;margin:0 0 8px;">Connect a Google Keep URL:</p>
                <input type="text" class="spp-keep-input settings-input" placeholder="https://keep.google.com/\u2026" style="font-size:12px;">
                <button class="btn btn-primary spp-keep-save" style="width:100%;justify-content:center;padding:6px;margin-top:6px;">Connect</button>
               </div>`)
        : `<div class="spp-note-editor note-area" contenteditable="true" data-space-id="${spaceId}" placeholder="Quick notes for ${space.name}\u2026">${noteContent}</div>`;

    panel.innerHTML = `
        <div class="spp-header" id="spp-drag-handle">
            <div class="spp-title">${panelSvg} ${space.name}</div>
            <div class="spp-header-actions">
                <button class="btn-icon spp-float-btn" title="${peekState.isFloat ? 'Dock panel' : 'Float panel'}" style="opacity:0.6;">${peekState.isFloat ? dockSvg : floatSvg}</button>
                <button class="btn-icon spp-lock-btn" title="${isLocked ? 'Unlock size (right-click to reset)' : 'Lock current size'}" style="opacity:${isLocked ? '1' : '0.5'};color:${isLocked ? '#ef4444' : '#22c55e'}">${isLocked ? closedLockSvg : openLockSvg}</button>
                <button class="btn-icon spp-close-btn" title="Close peek" style="opacity:0.5;font-size:14px;line-height:1;">\u2715</button>
            </div>
        </div>
        <div class="spp-body">
            <div class="spp-section">
                <div class="spp-section-title">Resources (${resources.length})</div>
                <ul class="spp-resource-list">
                    ${resources.length
                        ? resources.map(r => `<li>
                            <img src="${getFaviconUrl(r.url, r.favIconUrl)}" class="favicon-img" style="width:13px;height:13px;border-radius:2px;flex-shrink:0;">
                            <a href="${r.url}" data-res-url="${r.url}" title="${r.url}">${r.title || r.url}</a>
                          </li>`).join('')
                        : '<li class="spp-empty">No resources in this space.</li>'}
                </ul>
            </div>
            <div class="spp-section spp-note-section">
                <div class="spp-section-title" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <span>Quick Note</span>
                    <div class="keep-btn-group" style="display:flex;gap:2px;background:rgba(245,158,11,0.1);padding:2px;border-radius:5px;border:1px solid rgba(245,158,11,0.2);">
                        <button class="btn-icon spp-keep-toggle" title="Toggle Google Keep Mode" style="opacity:${isKeepMode ? '1' : '0.5'};"><svg class="svg-icon-sm"><use href="#icon-keep"></use></svg></button>
                        <button class="btn-icon spp-keep-external" title="Open Keep in New Tab" style="display:${isKeepMode && keepUrl ? 'inline-flex' : 'none'};color:#d97706;"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="11" x2="21" y2="3"/></svg></button>
                    </div>
                </div>
                ${keepNoteArea}
            </div>
        </div>
        <div class="spp-resize-handle"></div>
    `;

    if (!peekState.isFloat) {
        openInlinePeekDOM(panel);
    } else {
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        if (isLocked) {
            panel.style.width = `${sppSettings.floatWidth || 280}px`;
            panel.style.height = `${sppSettings.floatHeight || 480}px`;
        } else if (wasFloat && savedW) {
            panel.style.width = savedW;
            panel.style.height = savedH;
        }
        panel.style.left = savedL || `${peekState.floatX}px`;
        panel.style.top = savedT || `${peekState.floatY}px`;
    }

    // Load Keep iframe without reload if URL unchanged
    const iframe = panel.querySelector('.spp-keep-iframe');
    if (iframe && iframe.dataset.src && iframe.dataset.loadedUrl !== iframe.dataset.src) {
        iframe.src = iframe.dataset.src;
        iframe.dataset.loadedUrl = iframe.dataset.src;
    }

    panel.querySelector('.spp-close-btn').onclick = () => {
        peekState.spaceId = null;
        panel.remove();
        document.querySelector('.master-todo-widget')?.classList.remove('has-peek-panel');
        document.querySelectorAll('.btn-space-peek.is-peeking').forEach(b => b.classList.remove('is-peeking'));
    };

    panel.querySelector('.spp-float-btn').onclick = () => {
        if (!peekState.isFloat) {
            const rect = panel.getBoundingClientRect();
            peekState.floatX = rect.left;
            peekState.floatY = rect.top;
            peekState.isFloat = true;
            document.querySelector('.master-todo-widget')?.classList.remove('has-peek-panel');
            panel.remove();
            document.body.appendChild(panel);
        } else {
            peekState.isFloat = false;
        }
        renderSpacePeekPanel(peekState.spaceId);
    };

    panel.querySelector('.spp-lock-btn')?.addEventListener('click', () => {
        const s = getAppSettings();
        if (!s.spacePeekSettings) s.spacePeekSettings = { isLocked: false, inlineWidth: 268, floatWidth: 280, floatHeight: 480 };
        if (!s.spacePeekSettings.isLocked) {
            if (!peekState.isFloat) {
                s.spacePeekSettings.inlineWidth = peekState.inlineWidth;
            } else {
                s.spacePeekSettings.floatWidth = panel.offsetWidth;
                s.spacePeekSettings.floatHeight = panel.offsetHeight;
            }
        }
        s.spacePeekSettings.isLocked = !s.spacePeekSettings.isLocked;
        saveData();
        renderSpacePeekPanel(peekState.spaceId);
    });

    panel.querySelector('.spp-lock-btn')?.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const s = getAppSettings();
        if (!s.spacePeekSettings) s.spacePeekSettings = {};
        s.spacePeekSettings.isLocked = false;
        s.spacePeekSettings.inlineWidth = 268;
        s.spacePeekSettings.floatWidth = 280;
        s.spacePeekSettings.floatHeight = 480;
        peekState.inlineWidth = 268;
        document.querySelector('.master-todo-widget')?.style.setProperty('--spp-inline-width', '268px');
        saveData();
        renderSpacePeekPanel(peekState.spaceId);
    });

    panel.querySelector('.spp-keep-toggle')?.addEventListener('click', () => {
        const sp = getSpaces().find(s => s.id === spaceId);
        if (!sp) return;
        sp.quickNoteKeepMode = !sp.quickNoteKeepMode;
        saveData();
        renderSpacePeekPanel(spaceId);
    });

    panel.querySelector('.spp-keep-external')?.addEventListener('click', () => {
        const sp = getSpaces().find(s => s.id === spaceId);
        if (sp?.quickNoteKeepUrl) window.open(sp.quickNoteKeepUrl, '_blank');
    });

    const keepSaveBtn = panel.querySelector('.spp-keep-save');
    if (keepSaveBtn) {
        keepSaveBtn.onclick = () => {
            const url = panel.querySelector('.spp-keep-input')?.value.trim();
            if (url) {
                const sp = getSpaces().find(s => s.id === spaceId);
                if (sp) { sp.quickNoteKeepUrl = url; saveData(); }
                renderSpacePeekPanel(spaceId);
            }
        };
    }

    const editor = panel.querySelector('.spp-note-editor');
    if (editor) {
        editor.oninput = () => {
            const sp = getSpaces().find(s => s.id === spaceId);
            if (sp) { sp.quickNote = editor.innerHTML; saveData(); }
        };
    }

    panel.querySelectorAll('.spp-resource-list a[data-res-url]').forEach(a => {
        a.addEventListener('click', (e) => { e.preventDefault(); openOrFocusTab(a.dataset.resUrl); });
    });

    setupPeekDrag(panel);
    setupInlineResize(panel);
}

function setupInlineResize(panel) {
    const handle = panel.querySelector('.spp-resize-handle');
    if (!handle || peekState.isFloat) return;

    let isResizing = false, startX = 0, startW = 0, rafId = null;

    const onDown = (e) => {
        if (getAppSettings().spacePeekSettings?.isLocked) return;
        isResizing = true;
        startX = e.clientX;
        startW = peekState.inlineWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        // Suppress transitions during drag
        document.querySelector('.master-todo-widget')?.classList.add('is-resizing');
        // Full-screen overlay so the mouse never slips into iframes or scroll areas
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:col-resize;';
        document.body.appendChild(ov);
        handle._resizeOverlay = ov;
        e.preventDefault();
    };
    const onMove = (e) => {
        if (!isResizing) return;
        const x = e.clientX; // capture before async
        if (rafId) cancelAnimationFrame(rafId); // always use latest position
        rafId = requestAnimationFrame(() => {
            const newW = Math.max(180, Math.min(600, startW + (x - startX)));
            peekState.inlineWidth = newW;
            document.querySelector('.master-todo-widget')?.style.setProperty('--spp-inline-width', `${newW}px`);
            rafId = null;
        });
    };
    const onUp = () => {
        if (!isResizing) return;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.querySelector('.master-todo-widget')?.classList.remove('is-resizing');
        handle._resizeOverlay?.remove();
        handle._resizeOverlay = null;
        // Persist final width only once, only if lock is active
        const s = getAppSettings();
        if (s.spacePeekSettings?.isLocked) {
            s.spacePeekSettings.inlineWidth = peekState.inlineWidth;
            saveData();
        }
    };

    if (handle._inDownHandler) handle.removeEventListener('mousedown', handle._inDownHandler);
    if (handle._inMoveHandler) document.removeEventListener('mousemove', handle._inMoveHandler);
    if (handle._inUpHandler) document.removeEventListener('mouseup', handle._inUpHandler);
    handle._inDownHandler = onDown;
    handle._inMoveHandler = onMove;
    handle._inUpHandler = onUp;
    handle.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function setupPeekDrag(panel) {
    const header = panel.querySelector('#spp-drag-handle');
    if (!header) return;
    if (panel._peekMoveHandler) document.removeEventListener('mousemove', panel._peekMoveHandler);
    if (panel._peekUpHandler) document.removeEventListener('mouseup', panel._peekUpHandler);

    let isDragging = false, ox = 0, oy = 0;
    header.onmousedown = (e) => {
        if (e.target.closest('button') || !peekState.isFloat) return;
        isDragging = true;
        panel.classList.add('is-dragging');
        const rect = panel.getBoundingClientRect();
        ox = e.clientX - rect.left;
        oy = e.clientY - rect.top;
        document.body.style.userSelect = 'none';
        panel.style.transition = 'none';
    };
    const onMove = (e) => {
        if (!isDragging) return;
        const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - panel.offsetWidth));
        const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - 40));
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
    };
    const onUp = () => {
        if (!isDragging) return;
        isDragging = false;
        panel.classList.remove('is-dragging');
        document.body.style.userSelect = '';
        panel.style.transition = '';
        const rect = panel.getBoundingClientRect();
        peekState.floatX = rect.left;
        peekState.floatY = rect.top;
    };
    panel._peekMoveHandler = onMove;
    panel._peekUpHandler = onUp;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function openTemplateManagePopup(anchorEl, onRefresh) {
    document.getElementById('master-tpl-popup')?.remove();
    anchorEl.classList.toggle('active', true);

    const settings = getAppSettings();
    const templates = settings.viewTemplates || {};
    const tplNames = Object.keys(templates).filter(k => templates[k] && typeof templates[k] === 'object' && !Array.isArray(templates[k]));

    const popup = document.createElement('div');
    popup.id = 'master-tpl-popup';
    popup.className = 'master-tpl-popup';
    popup.innerHTML = `
        <div class="tpl-popup-header">View Templates</div>
        <div class="tpl-popup-save">
            <input type="text" id="tpl-new-name" class="tpl-name-input" placeholder="New template name…">
            <button id="tpl-btn-save-new" class="tpl-btn tpl-btn-primary">Save</button>
        </div>
        ${tplNames.length ? `
            <div class="tpl-popup-list">
                ${tplNames.map(n => `
                    <div class="tpl-popup-row">
                        <span class="tpl-name" title="${n}">${n}</span>
                        <div class="tpl-row-actions">
                            <button class="tpl-btn tpl-btn-apply" data-name="${n}" title="Apply this template">Apply</button>
                            <button class="tpl-btn tpl-btn-overwrite" data-name="${n}" title="Overwrite with current layout">↺</button>
                            <button class="tpl-btn tpl-btn-delete" data-name="${n}" title="Delete">✕</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : '<div class="tpl-popup-empty">No templates saved yet.</div>'}
    `;

    document.body.appendChild(popup);
    const rect = anchorEl.getBoundingClientRect();
    const popupW = 250;
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - popupW - 10);
    popup.style.top = `${rect.bottom + window.scrollY + 6}px`;
    popup.style.left = `${left}px`;

    const getSpaceOrder = () => Array.from(document.querySelectorAll('.task-group-details[data-space-id]')).map(el => parseInt(el.dataset.spaceId));

    popup.querySelector('#tpl-btn-save-new').onclick = () => {
        const name = popup.querySelector('#tpl-new-name').value.trim();
        if (!name) return;
        const s = getAppSettings();
        if (!s.viewTemplates) s.viewTemplates = {};
        const spaceOrder = getSpaceOrder();
        s.viewTemplates[name] = { spaceOrder, activeFilters: Array.from(masterTodoListState.activeSpaceFilters) };
        s.viewTemplates.spaceOrder = spaceOrder;
        saveData();
        popup.remove();
        anchorEl.classList.remove('active');
        onRefresh();
    };

    popup.querySelectorAll('.tpl-btn-apply').forEach(btn => {
        btn.onclick = () => {
            const tpl = getAppSettings().viewTemplates?.[btn.dataset.name];
            if (!tpl) return;
            const s = getAppSettings();
            s.viewTemplates.spaceOrder = tpl.spaceOrder || [];
            masterTodoListState.activeSpaceFilters = new Set((tpl.activeFilters || []).map(id => parseInt(id)));
            masterTodoListState.lastAppliedTemplateName = btn.dataset.name; // 🟢 อัปเดตชื่อเมื่อกด Apply จาก Popup
            saveData();
            popup.remove();
            anchorEl.classList.remove('active');
            onRefresh();
        };
    });

    popup.querySelectorAll('.tpl-btn-overwrite').forEach(btn => {
        btn.onclick = () => {
            const s = getAppSettings();
            const spaceOrder = getSpaceOrder();
            s.viewTemplates[btn.dataset.name] = { spaceOrder, activeFilters: Array.from(masterTodoListState.activeSpaceFilters) };
            s.viewTemplates.spaceOrder = spaceOrder;
            saveData();
            popup.remove();
            anchorEl.classList.remove('active');
            onRefresh();
        };
    });

    popup.querySelectorAll('.tpl-btn-delete').forEach(btn => {
        btn.onclick = () => {
            const s = getAppSettings();
            delete s.viewTemplates[btn.dataset.name];
            saveData();
            popup.remove();
            anchorEl.classList.remove('active');
            onRefresh();
        };
    });

    const closeOnOutside = (e) => {
        if (!popup.contains(e.target) && e.target !== anchorEl) {
            popup.remove();
            anchorEl.classList.remove('active');
            document.removeEventListener('click', closeOnOutside, true);
        }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
}

export function initMasterEvents() {
    const addBtn = document.getElementById('btn-master-add-task');
    const taskInput = document.getElementById('master-task-input');
    const spaceSelect = document.getElementById('master-space-selector');
    const groupContainer = document.getElementById('master-groups-container');

        // 🟢 Autocomplete Logic (Moved from top of file to here)
        if (taskInput && spaceSelect) {
            taskInput.addEventListener('input', (e) => {
                const sid = parseInt(spaceSelect.value);
                const spaces = getSpaces();
                const targetSpace = spaces.find(s => s.id === sid);
                handleTagAutocomplete(e, () => targetSpace?.tags || []);
            });
            taskInput.addEventListener('focus', () => {
                if (taskInput.value.trim() === "") {
                    const currentFilters = (getFilterTags() || []).filter(t => !['ALL', 'UNTAGGED', 'AI', 'HALF SCREEN'].includes(t.toUpperCase()));
                    if (currentFilters.length > 0) {
                        taskInput.value = '#1 ';
                    }
                }
            });
        }

    // 🟢 เก็บค่าเมื่อผู้ใช้เลือกเปลี่ยนใน Dropdown เอง
    if (spaceSelect) {
        spaceSelect.onchange = () => {
            masterTodoListState.selectedQuickAddSpaceId = parseInt(spaceSelect.value);
        };
    }

    const onRefresh = () => { if (window.renderDefaultDashboard) window.renderDefaultDashboard(); };

    if (addBtn) addBtn.onclick = async () => {
        let text = taskInput.value.trim();
        const spaceId = parseInt(spaceSelect.value);
        if (!text) return;
        taskInput.disabled = true;
        const targetSpace = getSpaces().find(s => s.id === spaceId);
        if (targetSpace) {
            if (!targetSpace.tasks) targetSpace.tasks = [];

            // 🟢 Shortcut #1 replacement
            const currentFilters = (getFilterTags() || []).filter(t => !['ALL', 'UNTAGGED', 'AI', 'HALF SCREEN'].includes(t.toUpperCase()));
            if (text.includes('#1') && currentFilters.length > 0) {
                const filterTagsString = currentFilters.map(t => '#' + t).join(' ');
                text = text.replace(/#1/g, filterTagsString);
            }

            // 🟢 Extract tags from text
            let tags = [];
            const tagMatches = text.match(/#([^\s#]+)/g);
            if (tagMatches) {
                tags = tagMatches.map(t => t.substring(1));
                text = text.replace(/#([^\s#]+)/g, '').trim();
                if (!text && tags.length > 0) text = tags[0];

                if (!targetSpace.tags) targetSpace.tags = [];
                tags.forEach(t => {
                    if (!targetSpace.tags.some(st => st.toUpperCase() === t.toUpperCase())) targetSpace.tags.push(t);
                });
            }

            let newTask = { text, completed: false, createdAt: Date.now(), isProminent: false, tags: tags };
            targetSpace.tasks.push(newTask);
            if (targetSpace.taskSortOrder && targetSpace.taskSortOrder !== 'manual') sortSpaceTasks(targetSpace);
            taskInput.value = ''; taskInput.disabled = false; taskInput.placeholder = "Quick add task...";
            saveData(); onRefresh();
        }
    };

    if (taskInput) taskInput.onkeypress = (e) => { if (e.key === 'Enter') addBtn?.click(); };

    const toggleProgressBtn = document.getElementById('btn-master-toggle-progress');
    if (toggleProgressBtn) toggleProgressBtn.onclick = () => { masterTodoListState.isProgressVisible = !masterTodoListState.isProgressVisible; onRefresh(); };

    const toggleActionsBtn = document.getElementById('btn-master-toggle-task-actions');
    if (toggleActionsBtn) toggleActionsBtn.onclick = () => { masterTodoListState.showMasterTaskActions = !masterTodoListState.showMasterTaskActions; onRefresh(); };

    const filterFlagBtn = document.getElementById('btn-master-filter-flagged');
    if (filterFlagBtn) filterFlagBtn.onclick = () => { masterTodoListState.showOnlyFlagged = !masterTodoListState.showOnlyFlagged; onRefresh(); };

    const dateFilterSelect = document.getElementById('master-date-filter');
    if (dateFilterSelect) dateFilterSelect.onchange = () => { masterTodoListState.dateFilter = dateFilterSelect.value; onRefresh(); };

    const toggleSelectBtn = document.getElementById('btn-master-toggle-select-mode');
    if (toggleSelectBtn) toggleSelectBtn.onclick = () => { 
        const settings = getAppSettings();
        if (settings.masterIsModeLocked) return; // 🔒 ตรวจสอบการล็อค
        settings.masterIsSingleSelectMode = !(settings.masterIsSingleSelectMode ?? masterTodoListState.isSingleSelectMode);
        saveData();
        onRefresh(); 
    };

    const lockBtn = document.getElementById('btn-master-mode-lock');
    if (lockBtn) lockBtn.onclick = () => {
        const settings = getAppSettings();
        settings.masterIsModeLocked = !settings.masterIsModeLocked;
        saveData();
        onRefresh();
    };

    const allPill = document.getElementById('btn-master-filter-all');
    if (allPill) allPill.onclick = () => { masterTodoListState.activeSpaceFilters.clear(); masterTodoListState.activeFolderTab = null; onRefresh(); };

    document.querySelectorAll('.space-switcher-pill').forEach(pill => {
        if (pill.id === 'btn-master-filter-all') return;
        pill.onclick = (e) => {
            const sid = parseInt(pill.dataset.spaceId);
            const settings = getAppSettings();
            const isSingle = settings.masterIsSingleSelectMode ?? masterTodoListState.isSingleSelectMode;

            if (isSingle) {
                const isVisible = !masterTodoListState.activeSpaceFilters.has(sid);
                const allSpaces = getSpaces().filter(s => !s.isArchived);
                
                if (isVisible && (allSpaces.length - masterTodoListState.activeSpaceFilters.size) === 1) {
                    masterTodoListState.activeSpaceFilters.clear();
                } else {
                    masterTodoListState.activeSpaceFilters = new Set(allSpaces.map(s => s.id).filter(id => id !== sid));
                    masterTodoListState.lastAppliedTemplateName = null; // 🟢 ล้างชื่อถ้ามีการเปลี่ยน Filter เอง
                    
                    // 🟢 อัปเดตสถานะใน State เพื่อให้เมื่อ Render ใหม่ Dropdown จะเปลี่ยนตาม
                    masterTodoListState.selectedQuickAddSpaceId = sid;
                }
            } else {
                if (masterTodoListState.activeSpaceFilters.has(sid)) masterTodoListState.activeSpaceFilters.delete(sid);
                else masterTodoListState.activeSpaceFilters.add(sid);
            }
            onRefresh();
        };
    });

    // 🟢 Search Input — triggers full refresh but restores focus via _restoreSearchFocus flag
    const searchInput = document.getElementById('master-search-input');
    if (searchInput) {
        searchInput.oninput = () => {
            masterTodoListState.searchQuery = searchInput.value;
            masterTodoListState._restoreSearchFocus = true;
            onRefresh();
        };
    }

    // 🟢 Manage Templates gear button — opens custom popup
    const manageBtn = document.getElementById('btn-manage-templates');
    if (manageBtn) manageBtn.onclick = () => openTemplateManagePopup(manageBtn, onRefresh);

    // 🟢 View Template select — quick-apply a saved template
    const templateSelect = document.getElementById('master-view-template-select');
    if (templateSelect) {
        templateSelect.onchange = () => {
            const name = templateSelect.value;
            if (!name) {
                // 🟢 ล้างชื่อถ้าผู้ใช้เลือกกลับเป็นค่าเริ่มต้น
                masterTodoListState.lastAppliedTemplateName = null;
                onRefresh();
                return;
            }
            const settings = getAppSettings();
            const tpl = settings.viewTemplates?.[name];
            if (!tpl || typeof tpl !== 'object' || Array.isArray(tpl)) return;

            // 🟢 บันทึกชื่อที่เลือกลงใน State
            masterTodoListState.lastAppliedTemplateName = name;

            settings.viewTemplates.spaceOrder = tpl.spaceOrder || [];
            masterTodoListState.activeSpaceFilters = new Set((tpl.activeFilters || []).map(id => parseInt(id)));
            saveData();
            onRefresh();
        };
    }

    // 🟢 Reset Order — clear saved space order to restore default
    const resetOrderBtn = document.getElementById('btn-reset-order');
    if (resetOrderBtn) resetOrderBtn.onclick = () => {
        const settings = getAppSettings();
        if (settings.viewTemplates) settings.viewTemplates.spaceOrder = [];
        masterTodoListState.lastAppliedTemplateName = null; // 🟢 ล้างชื่อเมื่อกด Reset Order
        saveData();
        onRefresh();
    };

    // 🟢 Folder pills in switcher — toggle active folder to reveal its spaces
    document.querySelectorAll('.switcher-folder-pill').forEach(pill => {
        pill.onclick = () => {
            const folder = pill.dataset.folder;
            masterTodoListState.activeFolderTab = masterTodoListState.activeFolderTab === folder ? null : folder;
            onRefresh();
        };
    });

    // 🟢 Space sort select
    document.querySelectorAll('.btn-master-space-sort').forEach(sel => {
        sel.addEventListener('change', (e) => {
            e.stopPropagation();
            const sid = parseInt(sel.dataset.spaceId);
            const space = getSpaces().find(s => s.id === sid);
            if (space) { space.taskSortOrder = sel.value; saveData(); onRefresh(); }
        });
    });

    // 🟢 Space Peek buttons — toggle inline/float peek panel per space
    document.querySelectorAll('.btn-space-peek').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const sid = parseInt(btn.dataset.spaceId);
            if (peekState.spaceId === sid) {
                peekState.spaceId = null;
                document.getElementById('space-peek-panel')?.remove();
                document.querySelector('.master-todo-widget')?.classList.remove('has-peek-panel');
                document.querySelectorAll('.btn-space-peek.is-peeking').forEach(b => b.classList.remove('is-peeking'));
            } else {
                peekState.spaceId = sid;
                peekState.isFloat = false;
                document.querySelectorAll('.btn-space-peek.is-peeking').forEach(b => b.classList.remove('is-peeking'));
                btn.classList.add('is-peeking');
                renderSpacePeekPanel(sid);
            }
        };
    });

    // Re-highlight active peek button after re-render
    if (peekState.spaceId !== null) {
        const activeBtn = document.querySelector(`.btn-space-peek[data-space-id="${peekState.spaceId}"]`);
        if (activeBtn) activeBtn.classList.add('is-peeking');
    }

    // Reposition inline panel on resize / scroll
    if (_peekResizeHandler) {
        window.removeEventListener('resize', _peekResizeHandler);
        document.removeEventListener('scroll', _peekResizeHandler, true);
    }
    _peekResizeHandler = () => { /* inline panel auto-resizes via CSS grid; float is user-positioned */ };
    window.addEventListener('resize', _peekResizeHandler);
    document.addEventListener('scroll', _peekResizeHandler, true);

    // 🟢 Single flat Sortable on master-groups-container — cross-folder drag & drop
    if (groupContainer) {
        // 🟢 Mirror Portal Toggle Logic
        groupContainer.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('.btn-toggle-mirror');
            if (toggleBtn) {
                const spaceIdStr = String(toggleBtn.dataset.spaceId);
                const portal = document.getElementById(`portal-${spaceIdStr}`);
                if (!portal) return;

                const isCurrentlyMirrored = masterTodoListState.mirroredSpaces.has(spaceIdStr);
                
                // 🟢 Update UI state first to ensure it doesn't get stuck if rendering fails
                if (!isCurrentlyMirrored) {
                    masterTodoListState.mirroredSpaces.add(spaceIdStr);
                    portal.style.display = 'block';
                    toggleBtn.innerText = 'Mirror OFF';
                    toggleBtn.classList.replace('btn-primary', 'btn-outline');
                    
                    try {
                        renderSpaceInline(spaceIdStr, portal, { showActions: masterTodoListState.showMasterTaskActions });
                    } catch (err) {
                        console.error("Mirror Portal rendering failed:", err);
                        portal.innerHTML = `<div style="padding:10px; color:red;">Rendering Error. Check console.</div>`;
                    }
                } else {
                    masterTodoListState.mirroredSpaces.delete(spaceIdStr);
                    portal.style.display = 'none';
                    portal.innerHTML = '';
                    toggleBtn.innerText = 'Mirror ON';
                    toggleBtn.classList.replace('btn-outline', 'btn-primary');
                }
                return;
            }
        });

        Sortable.create(groupContainer, {
            animation: 150,
            handle: '.space-group-drag-handle',
            draggable: '.task-group-details',
            ghostClass: 'sortable-ghost',
            filter: 'input, select, button, .task-list',
            preventOnFilter: false,
            onEnd: () => {
                const settings = getAppSettings();
                if (!settings.viewTemplates) settings.viewTemplates = {};
                settings.viewTemplates.spaceOrder = Array.from(document.querySelectorAll('.task-group-details[data-space-id]'))
                    .map(el => parseInt(el.dataset.spaceId));
                saveData();
            }
        });
    }

    if (groupContainer) {
        // ⌨️ จัดการทางลัดเครื่องหมาย ">" สำหรับช่องกรอก Subtask ในหน้า Master View
        groupContainer.addEventListener('keydown', (e) => {
            const input = e.target;
            if (!input.classList.contains('subtask-add-input')) return;

            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                input.dataset.isSubmitting = "true";
                const pId = parseFloat(input.getAttribute('data-parent'));
                let value = input.value.trim();
                
                const sid = parseInt(input.closest('li').dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                const parentIdx = space.tasks.findIndex(t => t.createdAt === pId);
                const task = space.tasks[parentIdx];

                let shouldCreateMain = false;
                const lowerValue = value.toLowerCase();
                if (lowerValue === '>m') {
                    value = '';
                    shouldCreateMain = true;
                } else if (lowerValue.endsWith('>m')) {
                    value = value.slice(0, -2).trim();
                    shouldCreateMain = true;
                }

                if (shouldCreateMain) masterTodoListState.addingSubtaskToTaskId = null;

                if (value && task) {
                    if (!task.subtasks) task.subtasks = [];
                    task.subtasks.push({ id: Date.now(), text: value, completed: false });
                    input.value = '';
                    saveData();
                } else if (!shouldCreateMain) {
                    masterTodoListState.addingSubtaskToTaskId = null;
                }

                onRefresh();

                if (shouldCreateMain && parentIdx !== -1) {
                    const newId = Date.now();
                    const newTask = { text: "", completed: false, tags: [], dueDate: null, createdAt: newId, googleTaskId: null, isProminent: false, subtasks: [] };
                    space.tasks.splice(parentIdx + 1, 0, newTask);
                    saveData();
                    onRefresh();
                    
                    setTimeout(() => {
                        const selector = `.task-group-details[data-space-id="${sid}"] .task-actual-text`;
                        const items = document.querySelectorAll(selector);
                        const target = Array.from(items).find(el => {
                            const itemLi = el.closest('li');
                            const tObj = space.tasks[parseInt(itemLi.dataset.index)];
                            return tObj && tObj.createdAt === newId;
                        });
                        if (target) {
                            target.focus();
                            const range = document.createRange();
                            range.selectNodeContents(target);
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                    }, 150);
                } else if (masterTodoListState.addingSubtaskToTaskId !== null) {
                    setTimeout(() => {
                        const newInput = document.querySelector(`.subtask-add-input[data-parent="${pId}"]`);
                        if (newInput) newInput.focus();
                    }, 100);
                }
            }
            
            if (e.key === 'Escape') {
                masterTodoListState.addingSubtaskToTaskId = null;
                onRefresh();
            }
        });

        // 🟢 Handle Checkbox Changes (Task Completion) in Master View
        groupContainer.addEventListener('change', (e) => {
            const target = e.target;
            const isMain = target.classList.contains('master-task-checkbox');
            const isSub = target.classList.contains('subtask-check-box');
            
            if (!isMain && !isSub) return;

            const isChecked = target.checked;
            const li = target.closest('li');
            const spaceId = parseInt(li.dataset.spaceId);
            const spaces = getSpaces();
            const space = spaces.find(s => s.id === spaceId);
            if (!space) return;

            // 🟢 แสดงสถานะ Syncing บนปุ่ม
            const checkboxWrapper = target.closest('.google-task-checkbox');
            if (checkboxWrapper) checkboxWrapper.classList.add('is-syncing');

            // 1. Immediate UI Feedback (แอนิเมชั่นขีดฆ่า)
            if (isChecked) {
                li.classList.add('completed-hold');
                playTaskCompletedSound();
            }

            if (isMain) {
                const idx = parseInt(target.dataset.idx);
                const task = space.tasks[idx];
                if (!task) return;

                // 2. Logic: อิงตาม todoManager.js (งานซ้ำ/ปฏิทินแค่ Complete, งานปกติลง Trash)
                if (task.repeatConfig?.isRepeating || task.calendarEventId) {
                    task.completed = isChecked;
                    task.completedAt = isChecked ? Date.now() : null;
                    task.isProminent = false;

                    // 🔄 Repeating Task Logic: สร้างงานงวดถัดไปอัตโนมัติ (ซิงค์พฤติกรรมกับ todoManager.js)
                    if (isChecked && task.repeatConfig?.isRepeating && task.dueDate && !task.wasRegenerated) {
                        const nextDate = calculateNextDate(task.dueDate, task.repeatConfig, task);
                        if (nextDate) {
                            task.wasRegenerated = true; // มาร์คงานเดิมว่าสร้างงวดใหม่ไปแล้ว
                            const clonedTask = JSON.parse(JSON.stringify(task));
                            clonedTask.completed = false;
                            clonedTask.completedAt = null;
                            clonedTask.isDeleted = false;
                            clonedTask.createdAt = Date.now();
                            delete clonedTask.wasRegenerated; // 🟢 ล้าง Flag เพื่อให้หายไปจาก Master List ตามเงื่อนไขวันที่
                            clonedTask.calendarEventId = null;
                            clonedTask.dueDate = nextDate;
                            clonedTask.occurrenceCount = (task.occurrenceCount || 1) + 1;
                            space.tasks.push(clonedTask);
                        }
                    }
                    if (!isChecked && task.repeatConfig?.isRepeating) {
                        task.wasRegenerated = false;
                        const futureTaskIdx = space.tasks.findIndex(t => t !== task && t.text === task.text && !t.completed && t.repeatConfig?.isRepeating && t.createdAt > task.createdAt);
                        if (futureTaskIdx > -1) space.tasks.splice(futureTaskIdx, 1);
                    }
                } else {
                    if (isChecked) {
                        task.isDeleted = true;
                        task.deletedAt = Date.now();
                        task.expiryAt = task.deletedAt + ((getAppSettings().autoDeleteDays || 30) * 24 * 60 * 60 * 1000);
                        task.completed = false;
                        task.isProminent = false;
                    } else {
                        task.completed = false;
                        task.isDeleted = false;
                        
                        // 🟢 ย้ายกลับมาไว้บนสุดเพื่อให้ผู้ใช้เห็นผลทันทีใน Command Center
                        const [restoredTask] = space.tasks.splice(idx, 1);
                        space.tasks.unshift(restoredTask);
                    }
                }
                
                // 3. Quest Loot Scanner
                if (isChecked && window.processRewardScanner) {
                    window.processRewardScanner(task.text, false, { x: e.clientX, y: e.clientY }, 'task', space.id, { tags: task.tags });
                }
            } else {
                // Logic สำหรับ Subtask
                const pIdx = parseInt(target.dataset.parentIndex);
                const sIdx = parseInt(target.dataset.subIndex);
                const subtask = space.tasks[pIdx]?.subtasks?.[sIdx];
                if (subtask) {
                    subtask.completed = isChecked;
                    if (isChecked && window.processRewardScanner) {
                        window.processRewardScanner(subtask.text, false, { x: e.clientX, y: e.clientY }, 'task', space.id);
                    }
                }
            }

            saveData(true);
            // 4. Re-render dashboard after animation
            setTimeout(() => {
                if (window.renderDefaultDashboard) window.renderDefaultDashboard();
            }, isChecked ? 800 : 0);
        });

        // 🟢 Unified Event Delegation for all Master List actions
        groupContainer.addEventListener('click', async (e) => {
            const target = e.target;

            // 🔘 1. Task Actions Toggle (The circle icon)
            const toggleBtn = target.closest('.toggle-actions-btn');
            if (toggleBtn) {
                const group = toggleBtn.closest('.item-action-group');
                const menu = group?.querySelector('.collapsible-actions');
                if (menu) {
                    const isHidden = menu.style.display === 'none' || menu.style.display === '';
                    if (isHidden) {
                        // Close other menus first for a clean experience
                        document.querySelectorAll('#master-groups-container .collapsible-actions').forEach(m => m.style.display = 'none');
                        document.querySelectorAll('#master-groups-container .toggle-actions-btn').forEach(b => b.classList.remove('expanded'));
                        menu.style.display = 'flex';
                        toggleBtn.classList.add('expanded');
                    } else {
                        menu.style.display = 'none';
                        toggleBtn.classList.remove('expanded');
                    }
                }
                return;
            }

            // 🔘 2. Close Individual Actions (ปุ่ม ✕ ในเมนูที่กางออกมา)
            const closeActionsBtn = target.closest('.close-actions-btn');
            if (closeActionsBtn) {
                const group = closeActionsBtn.closest('.item-action-group');
                const menu = group?.querySelector('.collapsible-actions');
                const toggle = group?.querySelector('.toggle-actions-btn');
                if (menu) menu.style.display = 'none';
                if (toggle) toggle.classList.remove('expanded');
                return;
            }

            // TODO: Refactor Calendar Sync using chrome.identity later (Master View)
            /*
            const calBtn = target.closest('.toggle-calendar-sync-btn');
            if (calBtn) {
                const idx = parseInt(calBtn.dataset.index);
                const pIdxAttr = calBtn.dataset.parentIndex;
                const pIdx = pIdxAttr !== undefined ? parseInt(pIdxAttr) : null;
                const sid = parseInt(calBtn.closest('li').dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                const task = (pIdx !== null) ? space.tasks[pIdx].subtasks[idx] : space.tasks[idx];

                if (task.calendarEventId) {
                    const token = await getAuthToken(false);
                    if (token) {
                        await deleteCalendarEvent(task.calendarEventId, token);
                        delete task.calendarEventId;
                        saveData(); onRefresh();
                    }
                } else {
                    if (!task.dueDate) {
                        alert("โปรดตั้ง 'กำหนดส่ง' (Due Date) ก่อนซิงค์กับ Google Calendar ครับ");
                        return;
                    }
                    const token = await getAuthToken(true);
                    if (token) {
                        const event = await createCalendarEvent(task, token);
                        if (event && event.id) {
                            task.calendarEventId = event.id;
                            saveData(); onRefresh();
                        }
                    }
                }
                return;
            }
            */

            // 🔘 Toggle Subtask Specific Controls (Master View)
            const subtaskMenuBtn = target.closest('.toggle-subtask-controls-btn'); 
            if (subtaskMenuBtn) {
                const idx = parseInt(subtaskMenuBtn.dataset.index);
                const sid = parseInt(subtaskMenuBtn.dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                if (space && space.tasks[idx]) {
                    space.tasks[idx].subtaskControlsOpen = !space.tasks[idx].subtaskControlsOpen;
                    saveData();
                    onRefresh();
                }
                return;
            }

            // 🔘 Toggle Hide Pending Subtasks (Master View)

            // 🔘 Toggle Hide Completed Subtasks (Master View)
            const hideCompletedBtn = target.closest('.hide-completed-subtasks-btn');
            if (hideCompletedBtn) {
                const idx = parseInt(hideCompletedBtn.dataset.index);
                const sid = parseInt(hideCompletedBtn.dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                if (space && space.tasks[idx]) {
                    space.tasks[idx].completedSubtasksHidden = !space.tasks[idx].completedSubtasksHidden;
                    saveData();
                    onRefresh();
                }
                return;
            }

            // 🔘 2. Break into Main Task
            const breakBtn = target.closest('.convert-to-main-btn');
            if (breakBtn) {
                const pIdx = parseInt(breakBtn.dataset.parentIndex);
                const sIdx = parseInt(breakBtn.dataset.subIndex);
                const sid = parseInt(breakBtn.closest('li').dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                if (space && space.tasks[pIdx]?.subtasks) {
                    const sub = space.tasks[pIdx].subtasks.splice(sIdx, 1)[0];
                    space.tasks.push({ ...sub, subtasks: [], createdAt: Date.now() });
                    saveData(); onRefresh();
                }
                return;
            }

            // 🔘 7. Archive Task (Main)
            const arcBtn = target.closest('.archive-task-btn');
            if (arcBtn) {
                const idx = parseInt(arcBtn.dataset.index);
                const sid = parseInt(arcBtn.closest('li').dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                const task = space?.tasks[idx];
                if (task) {
                    task.completed = true;
                    task.completedAt = Date.now();
                    task.isProminent = false;
                    if (task.subtasks) task.subtasks.forEach(s => s.completed = true);
                    saveData(); onRefresh();
                }
                return;
            }

            // 🔘 8. Archive Subtask
            const arcSubBtn = target.closest('.archive-subtask-btn');
            if (arcSubBtn) {
                const pIdx = parseInt(arcSubBtn.dataset.parentIndex);
                const sIdx = parseInt(arcSubBtn.dataset.index);
                const sid = parseInt(arcSubBtn.closest('li').dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                const subtask = space?.tasks[pIdx]?.subtasks[sIdx];
                if (subtask) {
                    subtask.completed = true;
                    saveData(); onRefresh();
                }
                return;
            }

            // 🔘 4. Task Link
            const linkBtn = target.closest('.task-link-btn');
            if (linkBtn) {
                const idx = parseInt(linkBtn.dataset.index);
                const pIdxAttr = linkBtn.dataset.parentIndex;
                const pIdx = pIdxAttr !== undefined ? parseInt(pIdxAttr) : null;
                const sid = parseInt(linkBtn.closest('li').dataset.spaceId);
                
                const space = getSpaces().find(s => s.id === sid);
                const task = (pIdx !== null) ? space.tasks[pIdx].subtasks[idx] : space.tasks[idx];

                if (task.linkData?.url) {
                    e.preventDefault();
                    if (task.linkData.isSideview && typeof chrome !== 'undefined' && chrome.sidePanel) {
                        chrome.sidePanel.setOptions({ path: task.linkData.url, enabled: true });
                        chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
                    } else { window.open(task.linkData.url, '_blank'); }
                } else {
                    openTaskLinkModal(idx, pIdx !== null, pIdx, sid);
                }
                return;
            }

            // 🔘 5. Add Subtask Button
            if (target.closest('.add-subtask-btn')) {
                const idx = parseInt(target.closest('.add-subtask-btn').dataset.index);
                const sid = parseInt(target.closest('li').dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                const task = space.tasks[idx];
                if (task) masterTodoListState.addingSubtaskToTaskId = task.createdAt;
                masterTodoListState.addingSubtaskToSpaceId = sid;
                onRefresh();
                setTimeout(() => {
                    const input = document.querySelector(`.subtask-add-input[data-parent="${masterTodoListState.addingSubtaskToTaskId}"]`);
                    if (input) input.focus();
                }, 50);
                return;
            }

            // 🔘 6. Space Prominent Visibility & Other Controls
            const visibilityBtn = target.closest('.btn-master-space-toggle-prominent');
            if (visibilityBtn) {
                e.preventDefault();
                e.stopPropagation();
                const sid = parseInt(visibilityBtn.dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                if (space) { space.hideProminentTasks = !space.hideProminentTasks; saveData(); onRefresh(); }
                return;
            }

            const gotoBtn = target.closest('.btn-master-goto-space');
            if (gotoBtn) {
                e.preventDefault();
                e.stopPropagation();
                const sid = parseInt(gotoBtn.dataset.spaceId);
                const sidebarItem = document.querySelector(`#spacebar .space-item[data-id="${sid}"]`);
                if (sidebarItem) sidebarItem.click();
                return;
            }

            // 🔘 7. Task Item General Logic (Flag, Edit, Delete)
            const taskItem = target.closest('li[data-type]');
            if (!taskItem) return;
            const spaceId = parseInt(taskItem.dataset.spaceId);
            const taskIndex = parseInt(taskItem.dataset.index);
            
            // Handle Flagging (Prominent)
            if (target.closest('.btn-prominent-task')) {
                const btn = target.closest('.btn-prominent-task');
                const pIdxAttr = btn.getAttribute('data-parent-index');
                const pIdx = pIdxAttr !== null ? parseInt(pIdxAttr) : null;
                const space = getSpaces().find(s => s.id === spaceId);
                let task = (pIdx !== null) ? space.tasks[pIdx]?.subtasks?.[taskIndex] : space.tasks[taskIndex];
                
                if (task) {
                    if (task.isProminent) {
                        task.isProminent = false;
                        const settings = getAppSettings();
                        if (settings.focusedTask?.spaceId === spaceId && settings.focusedTask?.createdAt === task.createdAt) {
                            settings.focusedTask = null;
                        }
                        if (typeof task.originalIndex === 'number') {
                            const [movedTask] = space.tasks.splice(taskIndex, 1);
                            space.tasks.splice(Math.min(task.originalIndex, space.tasks.length), 0, movedTask);
                            delete task.originalIndex;
                        }
                    } else {
                        task.isProminent = true; 
                        task.originalIndex = taskIndex;
                        const [movedTask] = space.tasks.splice(taskIndex, 1);
                        let lastProminentIdx = -1;
                        for (let i = 0; i < space.tasks.length; i++) {
                            if (space.tasks[i].isProminent) lastProminentIdx = i;
                            else break;
                        }
                        space.tasks.splice(lastProminentIdx + 1, 0, movedTask);
                    }
                    saveData(); onRefresh();
                }
                return;
            }

            // Handle Edit & Delete
            const editSubBtn = target.closest('.edit-subtask-btn');
            const delSubBtn = target.closest('.delete-subtask-btn');
            const isEdit = target.closest('.edit-task-btn');
            const isDelete = target.closest('.delete-task-btn');

            if (isEdit || isDelete || editSubBtn || delSubBtn) {
                setCurrentSpaceId(spaceId); window._isModalOpenedFromCommandCenter = true;
                if (editSubBtn) openTaskEditModal(parseInt(editSubBtn.dataset.parentIndex), true, parseInt(editSubBtn.dataset.id));
                else if (isEdit) openTaskEditModal(taskIndex, true);
                else if (delSubBtn) {
                    const pIdx = parseInt(delSubBtn.dataset.parentIndex);
                    const space = getSpaces().find(s => s.id === spaceId);
                if (space && space.tasks[pIdx]?.subtasks) {
                        space.tasks[pIdx].subtasks.splice(taskIndex, 1);
                        saveData(); onRefresh();
                    }
                }
                else if (isDelete) {
                    if (confirm("Delete this task?")) {
                        const space = getSpaces().find(s => s.id === spaceId);
                        if (space) { space.tasks.splice(taskIndex, 1); saveData(); setCurrentSpaceId(0); onRefresh(); }
                    } else setCurrentSpaceId(0);
                }
            }
        });

        // 🔘 10. Global listener to close popups when clicking outside
        if (!window._isSfMasterClickInitialized) {
            document.addEventListener('click', (e) => {
                const isMenuBtn = e.target.closest('.toggle-actions-btn');
                const isMenu = e.target.closest('.collapsible-actions');
                if (!isMenuBtn && !isMenu) {
                    document.querySelectorAll('#master-groups-container .collapsible-actions').forEach(m => {
                        if (!masterTodoListState.showMasterTaskActions) {
                            m.style.display = 'none';
                            const btn = m.closest('.item-action-group')?.querySelector('.toggle-actions-btn');
                            if (btn) btn.classList.remove('expanded');
                        }
                    });
                }
            });
            window._isSfMasterClickInitialized = true;
        }

        // 🟢 เปิดใช้งาน Drag & Drop สำหรับงานในหน้า Master List (ลากข้ามกลุ่ม Space ได้)
        const initListSortable = (el) => {
            const sid = parseInt(el.closest('.task-group-details')?.dataset.spaceId || el.dataset.spaceId);
            const space = getSpaces().find(s => s.id === sid);
            const isManual = !space || (space.taskSortOrder || 'manual') === 'manual';

            Sortable.create(el, {
                group: 'nested-tasks', // ใช้กลุ่มเดียวกันเพื่อให้สามารถลากงานข้ามกลุ่ม Space หรือข้ามไปเป็น Subtask ได้
                animation: 150,
                disabled: !isManual,
                handle: '.drag-handle',
                delay: 150,
                delayOnTouchOnly: true,
                draggable: '.task-item',
                ghostClass: 'sortable-ghost',
                onEnd: (evt) => {
                    const { from, to, item, oldIndex, newIndex } = evt;
                    if (from === to && oldIndex === newIndex) return;

                    // หา Space ID จากกลุ่มที่ลากออกมาและกลุ่มที่นำไปวาง
                    const getSpaceId = (list) => parseInt(list.closest('.task-group-details')?.dataset.spaceId || list.dataset.spaceId);
                    const fromSpaceId = getSpaceId(from);
                    const toSpaceId = getSpaceId(to);

                    const fromIsSub = from.classList.contains('subtask-list');
                    const toIsSub = to.classList.contains('subtask-list');

                    const spaces = getSpaces();
                    const fromSpace = spaces.find(s => s.id === fromSpaceId);
                    const toSpace = spaces.find(s => s.id === toSpaceId);
                    if (!fromSpace || !toSpace) return;

                    // 1. ดึงข้อมูลออกจาก Array ต้นทาง (ดึงตามตำแหน่งจริงใน Array)
                    const arrayIdx = parseInt(item.getAttribute('data-index'));
                    let movedTask;
                    if (fromIsSub) {
                        const pIdx = parseInt(from.dataset.parentIndex);
                        movedTask = fromSpace.tasks[pIdx].subtasks.splice(arrayIdx, 1)[0];
                    } else {
                        movedTask = fromSpace.tasks.splice(arrayIdx, 1)[0];
                    }

                    // 2. คำนวณตำแหน่งใหม่ใน Array ปลายทาง
                    const targetArray = toIsSub ? toSpace.tasks[parseInt(to.dataset.parentIndex)].subtasks : toSpace.tasks;
                    const nextEl = item.nextElementSibling;
            
            if (nextEl && nextEl.hasAttribute('data-index')) {
                let targetIdx = parseInt(nextEl.getAttribute('data-index'));
                // ปรับตำแหน่งถ้าเป็นการเลื่อนภายในอาเรย์เดิม
                if (from === to && targetIdx > arrayIdx) targetIdx--;
                targetArray.splice(targetIdx, 0, movedTask);
                    } else {
                if (toIsSub) {
                    targetArray.push(movedTask);
                } else {
                    let lastActive = -1;
                    for (let i = targetArray.length - 1; i >= 0; i--) {
                        if (targetArray[i] && !targetArray[i].completed) { lastActive = i; break; }
                    }
                    if (lastActive === -1) targetArray.push(movedTask);
                    else targetArray.splice(lastActive + (fromSpaceId === toSpaceId ? 0 : 1), 0, movedTask);
                        }
                    }

                    saveData();
                    onRefresh();
                }
            });
        };

        // สั่งให้ทุกลิสต์ที่วาดออกมา (รวมถึงงานย่อย) สามารถลากวางได้
        document.querySelectorAll('.master-group-list').forEach(initListSortable);
        document.querySelectorAll('.subtask-list').forEach(initListSortable);
    }
}
