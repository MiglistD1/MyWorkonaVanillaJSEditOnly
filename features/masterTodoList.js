import { getSpaces, saveData, getAppSettings, setCurrentSpaceId, getFilterTags, loadData } from '../core/storage.js';
import Sortable from '../sortable.esm.js';
import { svgRefresh } from '../core/icons.js';
import { openTaskEditModal, openTaskLinkModal, isAnyEditableElementFocused, toggleTaskFocus, playTaskCompletedSound, calculateNextDate, renderSpaceInline } from './todoManager.js'; 
import { handleMiniTagClick, showCreateBlockModal } from '../components/modals.js';
import { generateTaskHTML, attachSubtaskEventListeners, attachTaskInlineEditListeners, handleTagAutocomplete, applySyntaxHighlighting, getFaviconUrl, openOrFocusTab } from '../core/ui-helpers.js';
import { createBlock } from './blockManager.js';

import { renderSidebar } from '../components/sidebar.js';
import { updateKeepTagButtonState } from './googleKeep.js';
import { createCalendarEvent, deleteCalendarEvent } from '../core/calendarSync.js';
import { setupBasketModal } from '../components/modals.js';
import { eventBus, Events } from '../core/EventBus.js';

/**
 * 🟢 FIX #3: Guard to prevent rendering deleted linked tasks
 * Checks if a linked task exists and is not soft-deleted across all spaces
 */
function isLinkedTaskValid(linkedTaskId) {
    if (!linkedTaskId) return true;  // No link = always valid
    const spaces = getSpaces();
    for (let space of spaces) {
        const linkedTask = (space.tasks || []).find(t => t.id === linkedTaskId);
        if (linkedTask && !linkedTask.isDeleted) return true;  // Found valid (non-deleted)
    }
    return false;  // Not found or is deleted
}

/** 🟢 Helper: จัดลำดับงานตามเงื่อนไขที่เลือก (เฉพาะ Main Tasks) */
function sortSpaceTasks(space) {
    if (!space || !space.tasks || !space.taskSortOrder || space.taskSortOrder === 'manual') return;

    space.tasks.sort((a, b) => {
        // 1. ให้งานติดธง (isProminent) อยู่บนสุดเสมอ
        if (a.isProminent && !b.isProminent) return -1;
        if (!a.isProminent && b.isProminent) return 1;

        // 🟢 Requirement: Within flagged tasks, sort by flagging time (ASC)
        if (a.isProminent && b.isProminent) {
            const timeA = a.prominentAt || 0;
            const timeB = b.prominentAt || 0;
            if (timeA !== timeB) return timeA - timeB;
        }

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
    visibleTaskCount: 0,
    collapsedFolders: new Set(),
    activeFolderTab: null,
    lastAppliedTemplateName: null // 🟢 เพิ่มเพื่อจำชื่อ View ล่าสุด
};
window.masterTodoListState = masterTodoListState; // 🟢 เชื่อมโยงสถานะให้ระบบ Mirror Portal เข้าถึงได้

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
        if (filter === 'past') return d < today;
        if (filter === 'today') return d.getTime() === today.getTime();
        if (filter === 'future') return d > today;
        return false;
    });
}

/**
 * Renders the controls (Buttons & Input Bar) typically placed in the header.
 */
export function renderMasterHeaderControls(totalTasks = masterTodoListState.visibleTaskCount || 0) {
    const settings = getAppSettings();
    const isSingle = settings.masterIsSingleSelectMode ?? masterTodoListState.isSingleSelectMode;
    const isLocked = !!settings.masterIsModeLocked;
    const templates = settings.viewTemplates || {};
    const templateNames = Object.keys(templates).filter(k => templates[k] && typeof templates[k] === 'object' && !Array.isArray(templates[k]));

    return `
        <div class="master-header-filters-row">
            <div class="master-header-primary">
                <button id="btn-master-toggle-progress" class="btn-icon master-header-square-btn" title="${masterTodoListState.isProgressVisible ? 'Hide Space Tags' : 'Show Space Tags'}" style="opacity: 0.72;">
                    <svg class="svg-icon-sm" style="transform: ${masterTodoListState.isProgressVisible ? 'rotate(0deg)' : 'rotate(180deg)'}; transition: transform 0.2s;"><use href="#icon-chevron-up"></use></svg>
                </button>

                <button id="btn-master-filter-flagged" class="btn-icon master-header-square-btn ${masterTodoListState.showOnlyFlagged ? 'active' : ''}" title="${masterTodoListState.showOnlyFlagged ? 'Show All Tasks' : 'Show Only Flagged Tasks'}">
                    <svg class="svg-icon-sm"><use href="#icon-flag"></use></svg>
                </button>

                <div class="master-search-wrapper">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" id="master-search-input" class="master-search-input" placeholder="Search..." value="${masterTodoListState.searchQuery || ''}">
                </div>

                <select id="master-date-filter" class="master-header-select" title="Filter by date">
                    <option value="all" ${masterTodoListState.dateFilter === 'all' ? 'selected' : ''}>All</option>
                    <option value="no-date" ${masterTodoListState.dateFilter === 'no-date' ? 'selected' : ''}>None</option>
                    <option value="past" ${masterTodoListState.dateFilter === 'past' ? 'selected' : ''}>Past</option>
                    <option value="today" ${masterTodoListState.dateFilter === 'today' ? 'selected' : ''}>Today</option>
                    <option value="future" ${masterTodoListState.dateFilter === 'future' ? 'selected' : ''}>Next</option>
                </select>
            </div>

            <div class="master-header-secondary">
                <div class="master-header-mode-group">
                    <button id="btn-master-mode-lock" class="btn-icon master-header-square-btn" title="${isLocked ? 'Unlock Settings' : 'Lock Settings'}" style="color: ${isLocked ? '#ef4444' : '#10b981'}; opacity: ${isLocked ? '1' : '0.5'};">
                        <svg class="svg-icon-sm"><use href="#icon-${isLocked ? 'lock-minimal' : 'unlock-minimal'}"></use></svg>
                    </button>
                    <button id="btn-master-toggle-select-mode" class="master-header-chip" style="cursor: ${isLocked ? 'not-allowed' : 'pointer'}; background: ${isSingle ? '#f3e8ff' : '#dcfce7'}; color: ${isSingle ? '#6b21a8' : '#166534'}; border-color: ${isSingle ? '#d8b4fe' : '#86efac'}; opacity: ${isLocked ? '0.7' : '1'};">
                        ${isSingle ? 'Single' : 'Multi'}
                    </button>
                </div>

                <div class="master-header-view-group">
                    <select id="master-view-template-select" class="master-template-select master-header-view-select" title="Apply a saved view">
                        <option value="" ${!masterTodoListState.lastAppliedTemplateName ? 'selected' : ''}>View</option>
                        ${templateNames.map(n => `<option value="${n}" ${masterTodoListState.lastAppliedTemplateName === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                    <button id="btn-manage-templates" class="btn-manage-templates master-header-square-btn" title="Manage view templates"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
                    <button id="btn-reset-order" class="btn-reset-order master-header-square-btn" title="Reset space order to default">↺</button>
                </div>

                <span id="progress-text" class="master-counter-badge">
                    <strong>${totalTasks}</strong>
                    <span class="tasks-rem-label-long">tasks remaining</span>
                    <span class="tasks-rem-label-short">T</span>
                </span>
            </div>
        </div>
    `;
}

/**
 * Main Entry: Renders the Task Groups and Progress into the body container.
 */
export function renderMasterTodoList(container) {
    if (!container) return;

    const active = document.activeElement;
    const isSubmitting = active?.dataset?.isSubmitting === 'true';

    if (active && !isSubmitting) {
        if (active.classList.contains('task-actual-text') ||
            active.classList.contains('task-input') ||
            active.classList.contains('subtask-add-input') ||
            active.classList.contains('subtask-inline-input') ||
            ((active.tagName === 'INPUT' && active.type !== 'checkbox') || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
            return;
        }
    }

    const allSpaces = getSpaces().filter(s => !s.isArchived && !s.isDeleted);
    let totalTasks = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allSpaces.forEach(space => {
        if (!masterTodoListState.activeSpaceFilters.has(space.id) && space.tasks) {
            const activeTasks = space.tasks.filter(t => {
                if (!t || t.completed || t.isDeleted) return false;

                const taskDue = t.dueDate ? new Date(t.dueDate).setHours(0, 0, 0, 0) : null;
                const isRepeating = t.repeatConfig && t.repeatConfig.isRepeating;
                const isUpcoming = !t.isProminent && isRepeating && taskDue && taskDue > today.getTime() && t.wasRegenerated !== false;
                return !isUpcoming;
            });

            let tasksToCount = masterTodoListState.showOnlyFlagged ? activeTasks.filter(t => t.isProminent) : activeTasks;
            tasksToCount = applyDateFilter(tasksToCount);
            totalTasks += tasksToCount.length;
        }
    });

    masterTodoListState.visibleTaskCount = totalTasks;
    const headerControlsContainer = document.getElementById('master-header-controls-container');
    if (headerControlsContainer) {
        headerControlsContainer.innerHTML = renderMasterHeaderControls(totalTasks);
    }

    container.innerHTML = `
        ${renderProgressSection(allSpaces, totalTasks)}
        <div id="master-groups-container">
            ${renderTaskGroups(allSpaces)}
        </div>
        ${totalTasks === 0 ? '<p style="text-align:center; color:var(--text-muted); margin-top:40px; font-size:13px;">Your Command Center is empty. Start by adding a task!</p>' : ''}
    `;

    container.querySelectorAll('.task-actual-text').forEach(el => {
        applySyntaxHighlighting(el);
    });

    initMasterEvents();
    renderAutoMirroredSpaces();

    if (masterTodoListState._restoreSearchFocus) {
        masterTodoListState._restoreSearchFocus = false;
        const searchEl = document.getElementById('master-search-input');
        if (searchEl) {
            searchEl.focus();
            const length = searchEl.value.length;
            searchEl.setSelectionRange(length, length);
        }
    }

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
     const folderNames = Object.keys(folderMap).sort((a, b) => (a === 'General') ? -1 : (b === 'General') ? 1 : a.localeCompare(b));
    const showFolderPills = folderNames.length > 1 || !folderNames.includes('General');
    

    return `
        <div class="master-space-switcher" style="${masterTodoListState.isProgressVisible ? '' : 'display: none;'}">
            <div class="master-space-switcher-inner">
                <button class="space-switcher-pill all-pill ${masterTodoListState.activeSpaceFilters.size === 0 ? 'active' : ''}" id="btn-master-filter-all">All</button>
                <div class="switcher-sep"></div>
                ${showFolderPills ? `
                    ${folderNames.map(f => {
                        const hasFilter = masterTodoListState.activeSpaceFilters.size > 0;
                        const visCount = (folderMap[f] || []).filter(s => !masterTodoListState.activeSpaceFilters.has(s.id)).length;
                        const hasActive = hasFilter && visCount > 0;
                      return `<button class="switcher-folder-pill ${hasActive ? 'has-active' : ''}" data-folder="${f}">${f}${hasFilter ? `<span class="folder-pill-count">${visCount}</span>` : ''}</button>`;
                    }).join('')}
                    
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
        // 🟢 Visibility Primary Rule: ห้ามสร้าง HTML สำหรับ space ที่ไม่ได้ถูกเลือกใน Switcher
        if (isHidden) return '';

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

        if (displayTasks.length === 0) return ''; // ซ่อนหัวข้อถ้าไม่มีงานที่ตรงตามเงื่อนไข (Flagged/Date)
        const areTaskActionsVisible = !!space.showTaskActions;
        const isProminentVisible = !isSpaceProminentHidden;

        return `
            <div class="task-group-details" data-space-id="${space.id}">
                <div class="task-group-summary minimalist-floating-header">
                    ${sixDotHandle}
                    <div class="master-space-header-content">
                        <span class="group-title">${space.name} (${displayTasks.length})</span>
                        <div class="master-space-quickfab" data-space-id="${space.id}">
                            <button class="btn-icon btn-space-quickfab" data-space-id="${space.id}" title="Quick add in this space">
                                <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                            <div class="master-space-quickfab-panel" data-space-id="${space.id}">
                                <input type="text" class="task-input space-quick-input" data-space-id="${space.id}" placeholder="Quick add task..." style="font-size: 11px; height: 28px;">
                                <button type="button" class="btn-icon btn-space-quick-link" data-space-id="${space.id}" title="Link task from another space" style="color:var(--primary-color);"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></button>
                                <button type="button" class="btn btn-primary btn-space-quick-add" data-space-id="${space.id}" style="height: 28px; padding: 0 8px; font-size: 10px;">Add</button>
                            </div>
                        </div>
                    </div>
                    <div class="master-space-toolbar">
                        <button class="btn-icon btn-mobile-space-toolbar-trigger" data-space-id="${space.id}" title="Space Tools">
                            <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                        </button>
                        <div class="master-space-toolbar-items">
                            <button class="btn btn-outline btn-master-goto-space" data-space-id="${space.id}" style="padding: 2px 8px; font-size: 10px; height: 20px; border-radius: 4px; font-weight: 600;">open space</button>
                            <button class="btn-icon btn-master-space-tool btn-space-peek ${peekState.spaceId === space.id ? 'is-peeking' : ''}" data-space-id="${space.id}" title="Peek this space"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg></button>
                            <button class="btn-icon btn-master-space-tool ${areTaskActionsVisible ? 'is-active' : ''}" data-space-id="${space.id}" data-action="actions" title="Toggle Task Actions">
                                <span class="toggle-actions-btn circle-icon ${areTaskActionsVisible ? 'expanded' : ''}" style="margin:0; pointer-events:none; border-color: currentColor;"></span>
                            </button>
                            <button class="btn-icon btn-master-space-tool ${isProminentVisible ? 'is-active' : ''}" data-space-id="${space.id}" data-action="flags" title="Toggle Next Up">
                                <svg class="svg-icon-sm"><use href="#icon-flag"></use></svg>
                            </button>
                            <button class="btn-icon btn-master-space-tool" data-space-id="${space.id}" data-action="expand" title="Expand All Subtasks">
                                <svg class="svg-icon-sm"><use href="#icon-chevron-down"></use></svg>
                            </button>
                            <button class="btn-icon btn-master-space-tool" data-space-id="${space.id}" data-action="collapse" title="Collapse All Subtasks">
                                <svg class="svg-icon-sm"><use href="#icon-chevron-up"></use></svg>
                            </button>
                            ${!isMobile ? `
                                <button class="btn-icon btn-master-space-tool btn-basket-trigger" data-space-id="${space.id}" data-action="basket" title="Task Basket">
                                    <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
                <div class="space-portal-container master-portal-wrapper" id="portal-${space.id}"></div>
            </div>
        `;
    }).join('');
}

function renderAutoMirroredSpaces() {
    const groups = document.querySelectorAll('#master-groups-container .task-group-details[data-space-id]');
    groups.forEach(group => {
        if (group.style.display === 'none') return;

        const spaceIdStr = String(group.dataset.spaceId);
        const portal = group.querySelector('.space-portal-container');
        const space = getSpaces().find(s => String(s.id) === spaceIdStr);
        if (!portal || !space) return;

        portal.style.display = 'block';
        const isThisSpaceAdding = String(masterTodoListState.addingSubtaskToSpaceId) === spaceIdStr;
        
        renderSpaceInline(spaceIdStr, portal, {
            showActions: !!space.showTaskActions,
            addingSubtaskToId: isThisSpaceAdding ? masterTodoListState.addingSubtaskToTaskId : null,
        });
    });
}

/** 🟢 Helper: Toggle Space Filter */
function toggleSpaceFilter(sid, isSingle) {
    const allSpaces = getSpaces().filter(s => !s.isArchived && !s.isDeleted);
    if (isSingle) {
        const isVisible = !masterTodoListState.activeSpaceFilters.has(sid);
        if (isVisible && (allSpaces.length - masterTodoListState.activeSpaceFilters.size) === 1) {
            masterTodoListState.activeSpaceFilters.clear();
        } else {
            masterTodoListState.activeSpaceFilters = new Set(allSpaces.map(s => s.id).filter(id => id !== sid));
            masterTodoListState.lastAppliedTemplateName = null;
            masterTodoListState.selectedQuickAddSpaceId = sid;
        }
    } else {
        if (masterTodoListState.activeSpaceFilters.has(sid)) masterTodoListState.activeSpaceFilters.delete(sid);
        else masterTodoListState.activeSpaceFilters.add(sid);
    }
}

/** 🟢 New: Folder Dropdown for Spaces */
function showFolderSpacesDropdown(anchorEl, folderName, onRefresh) {
    document.getElementById('sf-folder-dropdown')?.remove();
    
    const dropdown = document.createElement('div');
    dropdown.id = 'sf-folder-dropdown';
    dropdown.className = 'sf-folder-dropdown';
    
    const allSpaces = getSpaces().filter(s => !s.isArchived && !s.isDeleted);
    const folderSpaces = allSpaces.filter(s => (s.folder || 'General') === folderName);
    
    const settings = getAppSettings();
    const isSingle = settings.masterIsSingleSelectMode ?? masterTodoListState.isSingleSelectMode;

    dropdown.innerHTML = folderSpaces.map(s => {
        const isActive = !masterTodoListState.activeSpaceFilters.has(s.id);
        return `
            <div class="sf-dropdown-item ${isActive ? 'active' : ''}" data-id="${s.id}">
                <label class="google-task-checkbox">
                    <input type="checkbox" ${isActive ? 'checked' : ''} style="pointer-events: none;">
                    <div class="checkmark-circle">
                        <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                    </div>
                </label>
                <span style="flex:1;">${s.name}</span>
            </div>
        `;
    }).join('');

    document.body.appendChild(dropdown);
    const rect = anchorEl.getBoundingClientRect();
    const dropdownW = Math.max(220, rect.width);
    
    // 🔘 FIX: ใช้พิกัดเทียบกับ Viewport โดยตรง (ไม่ต้องบวก Scroll) เพราะใช้ position: fixed
    let left = rect.left;
    if (left + dropdownW > window.innerWidth) left = window.innerWidth - dropdownW - 10;
    
    let top = rect.bottom + 5;
    if (top + 300 > window.innerHeight) top = rect.top - 5 - (dropdown.offsetHeight || 250);

    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${Math.max(10, left)}px`;
    dropdown.style.width = `${dropdownW}px`;

    dropdown.querySelectorAll('.sf-dropdown-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            const sid = parseInt(item.dataset.id);
            toggleSpaceFilter(sid, isSingle);
            
            if (isSingle) {
                dropdown.remove();
            } else {
                // 🟢 FIX: อัปเดต UI ภายใน Dropdown เดิมแทนการวาดใหม่ทั้งหมด
                // ป้องกันปัญหา Pop-up กระโดดไปมุมซ้ายบนเนื่องจากหา anchorEl ไม่เจอหลัง onRefresh
                const isActive = !masterTodoListState.activeSpaceFilters.has(sid);
                item.classList.toggle('active', isActive);
                const cb = item.querySelector('input');
                if (cb) cb.checked = isActive;
            }
            onRefresh();
        };
    });

    const closeOnOutside = (e) => {
        if (!dropdown.contains(e.target) && !anchorEl.contains(e.target)) { dropdown.remove(); document.removeEventListener('click', closeOnOutside, true); }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
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

    // 🟢 FIX: ใช้ property 'note' ให้ตรงกับหน้า Space ปกติ เพื่อให้ข้อมูลเชื่อมต่อกัน
    const noteContent = space.note || '';
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
                            ${r.isSideView ? `<button class="btn-icon spp-res-side-btn" data-url="${r.url}" title="Open in Side View" style="padding: 2px; margin-left: auto; color: var(--primary-color); opacity: 0.7;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg></button>` : ''}
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
            // 🟢 FIX: บันทึกลง 'note' แทน 'quickNote' เพื่อให้ซิงค์กับ To-do list ของ Space นั้นๆ
            if (sp) { sp.note = editor.innerHTML; saveData(); }
        };
    }

    panel.querySelectorAll('.spp-resource-list a[data-res-url]').forEach(a => {
        a.addEventListener('click', (e) => { e.preventDefault(); openOrFocusTab(a.dataset.resUrl); });
    });

    // 🟢 NEW: จัดการการเปิด Side View จากใน Peek Panel
    panel.querySelectorAll('.spp-res-side-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = btn.dataset.url;
            if (typeof chrome !== 'undefined' && chrome.sidePanel) {
                chrome.sidePanel.setOptions({ path: url, enabled: true });
                chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
            } else {
                window.open(url, '_blank');
            }
        };
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
    const groupContainer = document.getElementById('master-groups-container');

    // 🟢 1. Prevent Duplicate Event Listeners (Fix Double Pop-up)
    // ใช้ Dataset Flag เพื่อให้มั่นใจว่า Event Delegation ผูกไว้แค่ครั้งเดียวบน Static Container
    if (groupContainer && groupContainer.dataset.eventsInitialized === "true") return;
    if (groupContainer) groupContainer.dataset.eventsInitialized = "true";

    // 🟢 Initialize Basket Modal Logic
    setupBasketModal();

    // 🟢 2. Render Debounce (Fix Double Flashing)
    const onRefresh = () => { 
        // หากมีการเรียก Render ถี่เกินไป (เช่น ภายใน 50ms) จะรวบเหลือเพียงครั้งเดียว
        if (window._renderMasterTimeout) clearTimeout(window._renderMasterTimeout);
        window._renderMasterTimeout = setTimeout(() => {
            if (window.renderDefaultDashboard) window.renderDefaultDashboard(); 
        }, 50);
    };

    const addQuickTaskForSpace = (spaceId, inputEl) => {
        const targetSpace = getSpaces().find(s => s.id === spaceId);
        if (!targetSpace || !inputEl) return;

        let text = (inputEl.value || '').trim();
        if (!text) return;

        inputEl.disabled = true;
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

        const newTask = { text, completed: false, createdAt: Date.now(), isProminent: false, tags: tags };
        targetSpace.tasks.push(newTask);
        if (targetSpace.taskSortOrder && targetSpace.taskSortOrder !== 'manual') sortSpaceTasks(targetSpace);

        inputEl.value = '';
        inputEl.disabled = false;
        inputEl.placeholder = 'Quick add task...';
        saveData();
        onRefresh();
    };

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
            const settings = getAppSettings();
            toggleSpaceFilter(parseInt(pill.dataset.spaceId), settings.masterIsSingleSelectMode ?? masterTodoListState.isSingleSelectMode);
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
        pill.onclick = (e) => {
            e.stopPropagation();
            showFolderSpacesDropdown(pill, pill.dataset.folder, onRefresh);
        }
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

        groupContainer.addEventListener('input', (e) => {
            const input = e.target.closest('.space-quick-input');
            if (!input) return;
            const sid = parseInt(input.dataset.spaceId, 10);
            const targetSpace = getSpaces().find(s => s.id === sid);
            handleTagAutocomplete(e, () => targetSpace?.tags || []);
        });

        groupContainer.addEventListener('focusin', (e) => {
            const input = e.target.closest('.space-quick-input');
            if (!input) return;
            if ((input.value || '').trim() !== '') return;
            const currentFilters = (getFilterTags() || []).filter(t => !['ALL', 'UNTAGGED', 'AI', 'HALF SCREEN'].includes(t.toUpperCase()));
            if (currentFilters.length > 0) input.value = '#1 ';
        });

        groupContainer.addEventListener('keydown', (e) => {
            const input = e.target.closest('.space-quick-input');
            if (!input) return;
            if (e.key !== 'Enter') return;

            const sid = parseInt(input.dataset.spaceId, 10);
            const text = (input.value || '').trim();
            if (!sid || !text) return;

            if (text.toLowerCase().startsWith('@block')) {
                e.preventDefault();
                const targetSpace = getSpaces().find(s => s.id === sid);
                const prefillName = text.slice(6).replace(/^[:\s]+/, '').trim();
                input.value = '';
                showCreateBlockModal({
                    prefillName,
                    onConfirm: (name, color) => {
                        if (targetSpace) {
                            createBlock(targetSpace, name, color);
                            onRefresh();
                        }
                    }
                });
                return;
            }

            if (text.startsWith('@sp')) {
                e.preventDefault();
                input.value = '';
                const anchorRect = input.getBoundingClientRect?.() || null;
                eventBus.emit(Events.OPEN_SP_PICKER, { targetSpaceId: sid, anchorRect });
                return;
            }

            e.preventDefault();
            addQuickTaskForSpace(sid, input);
        });

        // 🟢 Unified Event Delegation for all Master List actions
        groupContainer.addEventListener('click', async (e) => {
            const target = e.target;

            const quickFabBtn = target.closest('.btn-space-quickfab');
            if (quickFabBtn) {
                e.preventDefault();
                e.stopPropagation();
                const wrapper = quickFabBtn.closest('.master-space-quickfab');
                if (!wrapper) return;
                const willExpand = !wrapper.classList.contains('is-expanded');
                groupContainer.querySelectorAll('.master-space-quickfab.is-expanded').forEach(el => el.classList.remove('is-expanded'));
                if (willExpand) {
                    wrapper.classList.add('is-expanded');
                    wrapper.querySelector('.space-quick-input')?.focus();
                }
                return;
            }

            const quickLinkBtn = target.closest('.btn-space-quick-link');
            if (quickLinkBtn) {
                e.preventDefault();
                e.stopPropagation();
                const sid = parseInt(quickLinkBtn.dataset.spaceId, 10);
                if (!sid) return;
                const anchorRect = quickLinkBtn.getBoundingClientRect?.() || null;
                eventBus.emit(Events.OPEN_SP_PICKER, { targetSpaceId: sid, anchorRect });
                return;
            }

            const quickAddBtn = target.closest('.btn-space-quick-add');
            if (quickAddBtn) {
                e.preventDefault();
                e.stopPropagation();
                const sid = parseInt(quickAddBtn.dataset.spaceId, 10);
                if (!sid) return;
                const wrapper = quickAddBtn.closest('.master-space-quickfab');
                const inputEl = wrapper?.querySelector('.space-quick-input');
                addQuickTaskForSpace(sid, inputEl);
                return;
            }

            // 🔘 Mobile Toolbar Trigger
            const trigger = target.closest('.btn-mobile-space-toolbar-trigger');
            if (trigger) {
                e.preventDefault();
                e.stopPropagation();
                const items = trigger.nextElementSibling;
                const wasActive = items.classList.contains('is-active');
                
                // Close all other open toolbars
                document.querySelectorAll('.master-space-toolbar-items.is-active').forEach(el => el.classList.remove('is-active'));
                
                if (!wasActive) {
                    items.classList.add('is-active');
                }
                return;
            }

            // 🔘 0. Peek Button (Restored logic)
            const peekBtn = target.closest('.btn-space-peek');
            if (peekBtn) {
                e.preventDefault();
                e.stopPropagation();
                const sid = parseInt(peekBtn.dataset.spaceId);
                if (peekState.spaceId === sid) {
                    peekState.spaceId = null;
                    document.getElementById('space-peek-panel')?.remove(); // ปิด Peek Panel
                    document.querySelector('.master-todo-widget')?.classList.remove('has-peek-panel'); // ลบคลาสที่ทำให้ Grid Layout เปลี่ยน
                } else {
                    peekState.spaceId = sid;
                    peekState.isFloat = false;
                    renderSpacePeekPanel(sid);
                }
                // อัปเดตสถานะสีปุ่ม Peek ทั้งหมดใน Master List ให้ตรงกัน
                document.querySelectorAll('.btn-space-peek').forEach(b => {
                    b.classList.toggle('is-peeking', parseInt(b.dataset.spaceId) === peekState.spaceId); // Toggle class 'is-peeking'
                });
                return;
            }

            const toolbarBtn = target.closest('.btn-master-space-tool');
            if (toolbarBtn) {
                e.preventDefault();
                e.stopPropagation();

                const sidAttr = toolbarBtn.dataset.spaceId;
                if (!sidAttr || sidAttr === "undefined") return console.warn('[MasterList] Missing spaceId on tool button');
                
                const sid = parseInt(sidAttr, 10);
                if (isNaN(sid)) return;

                const action = toolbarBtn.dataset.action;
                const portalContainer = document.getElementById(`portal-${sid}`);
                const space = getSpaces().find(s => s.id === sid);
                if (!portalContainer || !space) return;

               // 🟢 Targeted Re-render: ใช้ระบบ Proxy Click ส่งคำสั่งไปยัง Mirror Portal โดยตรง
                // สิ่งนี้จะทำให้ Mirror Portal เรนเดอร์ใหม่เฉพาะจุด ไม่ต้องโหลดใหม่ทั้งหน้า Master (Single-flash)
                let nativeBtnId = '';
                if (action === 'actions') nativeBtnId = '#btn-toggle-task-actions';
                else if (action === 'flags') nativeBtnId = '#btn-toggle-prominent-tasks';
                else if (action === 'expand') nativeBtnId = '#btn-expand-all-subtasks';
                else if (action === 'collapse') nativeBtnId = '#btn-collapse-all-subtasks';
                else if (action === 'basket') {
                    eventBus.emit(Events.OPEN_BASKET_MODAL, { spaceId: sid });
                }

                // 🟢 Fix: Safety check to prevent querySelector('') SyntaxError
                if (nativeBtnId && portalContainer) {
                    const nativeBtn = portalContainer.querySelector(nativeBtnId);
                    if (nativeBtn) nativeBtn.click();
                }

                // 🟢 อัปเดต UI ของปุ่มบน Master Header ทันทีเพื่อให้รู้สึก Responsive
                if (action === 'actions') {
                    toolbarBtn.classList.toggle('is-active', !!space.showTaskActions);
                    toolbarBtn.querySelector('.circle-icon')?.classList.toggle('expanded', !!space.showTaskActions);
                } else if (action === 'flags') {
                    toolbarBtn.classList.toggle('is-active', !space.hideProminentTasks);
                }
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
        });
}

    }

// Global listener to close mobile toolbar popups
document.addEventListener('click', (e) => {
    if (!e.target.closest('.master-space-quickfab')) {
        document.querySelectorAll('.master-space-quickfab.is-expanded').forEach(el => el.classList.remove('is-expanded'));
    }
    if (!e.target.closest('.master-space-toolbar')) {
        document.querySelectorAll('.master-space-toolbar-items.is-active').forEach(el => el.classList.remove('is-active'));
    }
});
