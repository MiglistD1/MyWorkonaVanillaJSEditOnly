import { getSpaces, saveData, getAppSettings, setCurrentSpaceId, getFilterTags, loadData } from '../core/storage.js';
import Sortable from '../sortable.esm.js';
import { svgRefresh } from '../core/icons.js';
import { openTaskEditModal, openTaskLinkModal, isAnyEditableElementFocused, toggleTaskFocus, playTaskCompletedSound } from './todoManager.js'; 
import { handleMiniTagClick } from '../components/modals.js';
import { generateTaskHTML, attachSubtaskEventListeners, attachTaskInlineEditListeners, handleTagAutocomplete, applySyntaxHighlighting } from '../core/ui-helpers.js';

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
    isProgressVisible: true,
    showMasterTaskActions: false,
    isSingleSelectMode: true,
    addingSubtaskToIndex: null,
    addingSubtaskToSpace: null,
    selectedQuickAddSpaceId: null
};

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
            const tasksToCount = masterTodoListState.showOnlyFlagged ? activeTasks.filter(t => t.isProminent) : activeTasks;
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

    const onRefresh = () => { if (window.renderDefaultDashboard) window.renderDefaultDashboard(); };

    // Attach Subtask Listeners
    container.querySelectorAll('.subtask-list').forEach(subListEl => {
        const groupDetails = subListEl.closest('.task-group-details');
        if (!groupDetails) return;
        const spaceId = parseInt(groupDetails.dataset.spaceId);
        const space = allSpaces.find(s => s.id === spaceId);
        if (space) {
            attachSubtaskEventListeners(subListEl, space, onRefresh, {}, () => { saveData(); onRefresh(); });
        }
    });

    // Attach Inline Editing
    attachTaskInlineEditListeners(container, (li) => {
        const spaceId = parseInt(li.getAttribute('data-space-id'));
        return getSpaces().find(s => s.id === spaceId);
    }, {
        saveData,
        onAddMainTaskAfter: (space, index) => {
            // 🟢 เพิ่มงานใหม่ใน Space ที่ระบุ และเลื่อนลำดับลงมา 1 ตำแหน่ง
            const newTask = { text: "", completed: false, tags: [], dueDate: null, createdAt: Date.now(), googleTaskId: null, isProminent: false, subtasks: [] };
            space.tasks.splice(index + 1, 0, newTask);
            saveData();
            onRefresh();

            // Focus งานใหม่ในหน้า Master View (ระบุกลุ่ม Space ให้ถูกต้อง)
            setTimeout(() => {
                const selector = `.task-group-details[data-space-id="${space.id}"] .task-actual-text`;
                const items = document.querySelectorAll(selector);
                const target = Array.from(items).find(el => parseInt(el.closest('li').dataset.index) === index + 1);
                if (target) {
                    target.focus();
                    const range = document.createRange();
                    range.selectNodeContents(target);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }, 100);
        },
        onAddSubtaskAfter: (space, index, li) => {
            const subList = li.closest('.subtask-list');
            if (subList) {
                masterTodoListState.addingSubtaskToIndex = parseInt(subList.dataset.parentIndex);
                masterTodoListState.addingSubtaskToSpace = space.id;
                onRefresh();
                setTimeout(() => {
                    const input = document.querySelector(`.subtask-add-input[data-parent="${masterTodoListState.addingSubtaskToIndex}"]`);
                    if (input) input.focus();
                }, 50);
            }
        },
        onDeleteEmptyTask: (space, index, type, li) => {
            let task;
            if (type === 'task') {
                task = space.tasks[index];
            } else {
                const pIdx = parseInt(li.closest('.subtask-list').dataset.parentIndex);
                task = space.tasks[pIdx]?.subtasks?.[index];
            }
            if (type === 'task') space.tasks.splice(index, 1);
            else {
                const pIdx = parseInt(li.closest('.subtask-list').dataset.parentIndex);
                space.tasks[pIdx].subtasks.splice(index, 1);
            }
            saveData(); onRefresh();
        },
        onUpdate: () => {
            onRefresh();
            if (masterTodoListState.addingSubtaskToIndex !== null && masterTodoListState.addingSubtaskToSpace !== null) {
                setTimeout(() => {
                    const input = document.querySelector(`.subtask-add-input[data-parent="${masterTodoListState.addingSubtaskToIndex}"]`);
                    if (input) input.focus();
                }, 50);
            }
        }
    });
}

function renderProgressSection(allSpaces, totalTasks) {
    // 🟢 ดึงค่าจาก appSettings (เพราะ Command Center คือพื้นที่กลาง)
    const settings = getAppSettings();
    const isSingle = settings.masterIsSingleSelectMode ?? masterTodoListState.isSingleSelectMode;
    const isLocked = !!settings.masterIsModeLocked;

    return `
        <div class="master-progress-container">
            <div class="master-progress-info">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:700;">Task Completion</span>                                
                    <button id="btn-master-filter-flagged" class="${masterTodoListState.showOnlyFlagged ? 'active' : ''}" 
                        title="${masterTodoListState.showOnlyFlagged ? 'Show All Tasks' : 'Show Only Flagged Tasks'}">
                        <svg class="svg-icon-sm"><use href="#icon-flag"></use></svg>
                    </button>
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
                </div>
                <span id="progress-text" style="font-weight: 700; color: var(--primary-color);">${totalTasks} ${masterTodoListState.showOnlyFlagged ? 'Flagged' : ''} Tasks Remaining</span>
            </div>
            <div style="height: 1px; background: var(--border-color); margin-top: 4px; opacity: 0.5;"></div>
        </div>

        <div class="space-pill-cloud" style="${masterTodoListState.isProgressVisible ? '' : 'display: none;'}">
            <div class="space-pill all-spaces-pill ${masterTodoListState.activeSpaceFilters.size === 0 ? 'active' : ''}" id="btn-master-filter-all">
                All Spaces
            </div>
            <div style="width: 1px; height: 16px; background: var(--border-color); margin: 0 8px; align-self: center; opacity: 0.8;"></div>
            ${allSpaces.map(s => `
                <div class="space-pill ${masterTodoListState.activeSpaceFilters.has(s.id) ? '' : 'active'}" data-space-id="${s.id}">
                    ${s.name}
                </div>
            `).join('')}
        </div>
    `;
}

function renderTaskGroups(allSpaces) {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    return allSpaces.map(space => {
        const isHidden = masterTodoListState.activeSpaceFilters.has(space.id);
        const tasks = space.tasks || [];
        const isSpaceProminentHidden = space.hideProminentTasks || false;
        
        // 🟢 จัดเรียงตามคำสั่งของ Space ก่อนกรอง
        if (space.taskSortOrder && space.taskSortOrder !== 'manual') sortSpaceTasks(space);

        let displayTasks = tasks.filter(t => t && !t.completed && !t.isDeleted);
        if (masterTodoListState.showOnlyFlagged) {
            displayTasks = displayTasks.filter(t => t && t.isProminent);
        }
        
        if (displayTasks.length === 0) return '';
        const currentSort = space.taskSortOrder || 'manual';

        return `
            <details class="task-group-details" data-space-id="${space.id}" ${isHidden ? 'style="display:none;"' : 'open'}>
                <summary class="task-group-summary">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="group-title">${space.name} (${displayTasks.length})</span>
                        <button class="btn-icon btn-master-space-toggle-prominent" data-space-id="${space.id}" title="Toggle Next Up Visibility" style="padding:2px; opacity: ${isSpaceProminentHidden ? '0.3' : '0.8'};">
                            <svg class="svg-icon-sm" style="color: ${isSpaceProminentHidden ? 'inherit' : 'var(--primary-color)'};"><use href="#icon-flag"></use></svg>
                        </button>
                        <button class="btn btn-outline btn-master-goto-space" data-space-id="${space.id}" style="padding: 2px 8px; font-size: 10px; height: 20px; border-radius: 4px; font-weight: 600; margin-left: 4px;">open space</button>
                        <select class="btn-master-space-sort" data-space-id="${space.id}" title="Sort Space Tasks" style="font-family: var(--app-font); font-size: 9px; font-weight: 700; padding: 1px 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-body); color: var(--text-main); cursor: pointer; outline: none; margin-left: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                            <option value="manual" ${currentSort === 'manual' ? 'selected' : ''}>⇅ Man</option>
                            <option value="date" ${currentSort === 'date' ? 'selected' : ''}>📅 Date</option>
                            <option value="name" ${currentSort === 'name' ? 'selected' : ''}>🔤 Name</option>
                        </select>
                    </div>
                    <span class="group-chevron"></span>
                </summary>
                <ul class="task-list master-group-list" data-space-id="${space.id}">
                    ${displayTasks.map(task => {
                        const originalIndex = space.tasks.indexOf(task);
                        return generateTaskHTML(task, originalIndex, {
                            showSpaceBadge: false,
                            isMasterView: true, //
                            spaceId: space.id,
                            isProminentHidden: isSpaceProminentHidden,
                            showActions: masterTodoListState.showMasterTaskActions,
                            addingSubtaskToIndex: (masterTodoListState.addingSubtaskToSpace === space.id) ? masterTodoListState.addingSubtaskToIndex : null,
                            isFiltered: false, // บังคับให้ปุ่มลากแสดงผลในหน้า Master View
                            isMobile,
                        });
                    }).join('')}
                </ul>
            </details>
        `;
    }).join('');
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
    if (allPill) allPill.onclick = () => { masterTodoListState.activeSpaceFilters.clear(); onRefresh(); };

    document.querySelectorAll('.space-pill').forEach(pill => {
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

    if (groupContainer) {
        // 🟢 จัดการการเปลี่ยนเงื่อนไขการเรียงใน Master View
        groupContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('btn-master-space-sort')) {
                const sid = parseInt(e.target.dataset.spaceId);
                const val = e.target.value;
                const space = getSpaces().find(s => s.id === sid);
                if (space) {
                    space.taskSortOrder = val;
                    if (val !== 'manual') sortSpaceTasks(space);
                    saveData(true); onRefresh();
                }
            }
        });

        // 🟢 จัดการการกดปุ่มในช่อง Add Subtask (Enter เพื่อสร้างต่อ, Escape เพื่อยกเลิก)
        groupContainer.addEventListener('keydown', (e) => {
            const input = e.target;
            if (!input.classList.contains('subtask-add-input')) return;

            if (e.key === 'Enter') {
                e.preventDefault();
                input.dataset.isSubmitting = "true"; 
                const pIdx = parseInt(input.getAttribute('data-parent'));
                const value = input.value.trim();
                const space = getSpaces().find(s => s.id === masterTodoListState.addingSubtaskToSpace);

                if (value && space && space.tasks[pIdx]) {
                    if (!space.tasks[pIdx].subtasks) space.tasks[pIdx].subtasks = [];
                    space.tasks[pIdx].subtasks.push({ id: Date.now(), text: value, completed: false });
                    saveData();
                    // คงค่า Index ไว้เพื่อให้สร้างช่องถัดไปในตอน Render
                } else {
                    masterTodoListState.addingSubtaskToIndex = null;
                    masterTodoListState.addingSubtaskToSpace = null;
                }
                onRefresh();
            } else if (e.key === 'Escape') {
                masterTodoListState.addingSubtaskToIndex = null;
                masterTodoListState.addingSubtaskToSpace = null;
                onRefresh();
            }
        });

        // 🟢 จัดการการเสียโฟกัส
        groupContainer.addEventListener('focusout', (e) => {
            if (!e.target.classList.contains('subtask-add-input')) return;
            if (e.target.dataset.isSubmitting === "true") return;

            setTimeout(() => {
                if (document.activeElement && document.activeElement.classList.contains('subtask-add-input')) return;
                masterTodoListState.addingSubtaskToIndex = null;
                masterTodoListState.addingSubtaskToSpace = null;
                onRefresh();
            }, 150);
        });
        
        groupContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('master-task-checkbox')) {
                const sid = parseInt(e.target.dataset.space);
                const idx = parseInt(e.target.dataset.idx);
                const isChecked = e.target.checked;
                const taskItem = e.target.closest('.task-item');
                const space = getSpaces().find(s => s.id === sid);

                // 🌟 แสดง Animation ขีดฆ่า และเรียก Reward Scanner
                if (isChecked && taskItem && space && space.tasks[idx]) {
                    taskItem.classList.add('completed-hold');
                    playTaskCompletedSound();
                    if (window.processRewardScanner) {
                        window.processRewardScanner(space.tasks[idx].text, false, { x: e.clientX, y: e.clientY }, 'task', space.id, { tags: space.tasks[idx].tags });
                    }
                }

                if (space && space.tasks[idx]) {
                    const task = space.tasks[idx];
                    
                    if (isChecked) {
                        task.isDeleted = true;
                        task.deletedAt = Date.now();
                        const days = getAppSettings().autoDeleteDays || 30;
                        task.expiryAt = task.deletedAt + (days * 24 * 60 * 60 * 1000);
                        task.completed = false;
                        task.isProminent = false;
                    } else {
                        task.completed = false;
                        task.completedAt = null;
                        task.isDeleted = false; // 🟢 กู้คืนจากถังขยะเมื่อเอาเครื่องหมายถูกออก (Restore)
                        task.deletedAt = null;
                        task.expiryAt = null;

                        // 🟢 ย้ายไปไว้บนสุดของ Space นั้นๆ เพื่อให้เห็นผลทันทีใน Command Center
                        const [restoredTask] = space.tasks.splice(idx, 1);
                        space.tasks.unshift(restoredTask);
                    }
                    saveData(true); 
                    onRefresh(); // 🟢 เอาการหน่วงเวลาออกเพื่อให้ทำงานทันที
                }
                    setTimeout(() => {
                        if (!isAnyEditableElementFocused()) onRefresh();
                    }, isChecked ? 800 : 0); // 800ms for completion animation, 0 for uncheck
        }
    });

        groupContainer.addEventListener('click', async (e) => {
            const target = e.target;

            // 🔘 1. More Actions (Circle icon) Toggle
            const toggleBtn = target.closest('.toggle-actions-btn');
            if (toggleBtn) {
                const container = toggleBtn.parentElement.querySelector('.collapsible-actions');
                if (container) {
                    const isHidden = container.style.display === 'none';
                    container.style.display = isHidden ? 'flex' : 'none';
                    toggleBtn.classList.toggle('expanded');
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
                masterTodoListState.addingSubtaskToIndex = idx;
                masterTodoListState.addingSubtaskToSpace = sid;
                onRefresh();
                setTimeout(() => {
                    const input = document.querySelector(`.subtask-add-input[data-parent="${idx}"]`);
                    if (input) input.focus();
                }, 10);
                return;
            }

            const visibilityBtn = target.closest('.btn-master-space-toggle-prominent');
            if (visibilityBtn) {
                const sid = parseInt(visibilityBtn.dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                if (space) { space.hideProminentTasks = !space.hideProminentTasks; saveData(); onRefresh(); }
                return;
            }
            const gotoBtn = target.closest('.btn-master-goto-space');
            if (gotoBtn) {
                const sid = parseInt(gotoBtn.dataset.spaceId);
                const sidebarItem = document.querySelector(`#spacebar .space-item[data-id="${sid}"]`);
                if (sidebarItem) sidebarItem.click();
                return;
            }
            const taskItem = target.closest('li[data-type]');
            if (!taskItem) return;
            const spaceId = parseInt(taskItem.dataset.spaceId);
            const taskIndex = parseInt(taskItem.dataset.index);
            if (target.closest('.btn-prominent-task')) {
                const btn = target.closest('.btn-prominent-task');
                const pIdxAttr = btn.getAttribute('data-parent-index');
                const pIdx = pIdxAttr !== null ? parseInt(pIdxAttr) : null;

                const space = getSpaces().find(s => s.id === spaceId);
                let task;
                if (pIdx !== null) {
                    task = space.tasks[pIdx]?.subtasks?.[taskIndex];
                    if (task) {
                        task.isProminent = !task.isProminent;
                        saveData(); onRefresh();
                    }
                    return;
                }

                task = space.tasks[taskIndex];
                if (task.isProminent) {
                    task.isProminent = false;
                    const settings = getAppSettings();
                    if (settings.focusedTask && settings.focusedTask.spaceId === spaceId && settings.focusedTask.createdAt === task.createdAt) {
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
                    
                    // 🟢 FIFO Flagging: ค้นหาตำแหน่งสุดท้ายของกลุ่มงานที่ติดธงอยู่แล้ว
                    let lastProminentIdx = -1;
                    for (let i = 0; i < space.tasks.length; i++) {
                        if (space.tasks[i].isProminent) {
                            lastProminentIdx = i;
                        } else {
                            break;
                        }
                    }
                    // แทรกต่อท้ายกลุ่มงานที่ติดธงล่าสุด
                    space.tasks.splice(lastProminentIdx + 1, 0, movedTask);
                }
                saveData(); onRefresh(); return;
            }
            
            // 🟢 NEW: Context Menu for Focus (Right-click on Flag) in Master View
            const flagBtn = target.closest('.btn-prominent-task[data-focus-trigger="true"]');
            if (flagBtn) {
                e.preventDefault(); // Prevent default browser context menu
                e.stopPropagation();

                // Close any existing custom menu
                const existingMenu = document.getElementById('task-focus-context-menu');
                if (existingMenu) existingMenu.remove();

                const taskItemEl = flagBtn.closest('.task-item');
                if (!taskItemEl) return;

                const spaceId = parseInt(taskItemEl.dataset.spaceId);
                const taskIndex = parseInt(taskItemEl.dataset.index);

                const space = getSpaces().find(s => s.id === spaceId);
                const task = space.tasks[taskIndex];
                if (!task) return;

                const settings = getAppSettings();
                const isFocused = settings.focusedTask &&
                                  settings.focusedTask.spaceId === spaceId &&
                                  settings.focusedTask.createdAt === task.createdAt;

                const menu = document.createElement('div');
                menu.id = 'task-focus-context-menu';
                menu.className = 'sf-sub-popup'; // Reusing existing popup style
                menu.style.cssText = `
                    position: fixed;
                    top: ${e.clientY}px;
                    left: ${e.clientX}px;
                    min-width: 150px;
                    padding: 4px;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                `;

                menu.innerHTML = `
                    <button class="menu-item" id="ctx-toggle-focus" style="display:flex; align-items:center; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:var(--text-main); text-align:left; border-radius:4px;">
                        <svg class="svg-icon-sm" style="margin-right:8px;"><use href="#icon-${isFocused ? 'eye-off' : 'target'}"></use></svg> ${isFocused ? 'Stop Focusing' : 'Focus this task'}
                    </button>
                `;

                document.body.appendChild(menu);

                // Position adjustment to keep it in viewport
                const menuRect = menu.getBoundingClientRect();
                if (menuRect.right > window.innerWidth) menu.style.left = `${e.clientX - menuRect.width}px`;
                if (menuRect.bottom > window.innerHeight) menu.style.top = `${e.clientY - menuRect.height}px`;

                document.getElementById('ctx-toggle-focus').addEventListener('click', () => {
                    toggleTaskFocus(spaceId, taskIndex, false, null); // Call the shared function
                    menu.remove();
                });
                document.addEventListener('click', () => menu.remove(), { once: true }); // Close on outside click
                return; // Stop further click processing
            }
            // 🟢 แก้ไข: จัดการปุ่มแก้ไขและลบให้ครอบคลุมถึง Subtask
            const editSubBtn = target.closest('.edit-subtask-btn');
            const delSubBtn = target.closest('.delete-subtask-btn');

            if ( target.closest('.edit-task-btn') || target.closest('.delete-task-btn') || editSubBtn || delSubBtn) {
                setCurrentSpaceId(spaceId); window._isModalOpenedFromCommandCenter = true;
            }
            if (editSubBtn) openTaskEditModal(parseInt(editSubBtn.dataset.parentIndex), true, parseInt(editSubBtn.dataset.id));
            else if (target.closest('.edit-task-btn')) openTaskEditModal(taskIndex, true);
            else if (delSubBtn) {
                const pIdx = parseInt(delSubBtn.dataset.parentIndex);
                const space = getSpaces().find(s => s.id === spaceId);
                if (confirm("Delete subtask?") && space) {
                    space.tasks[pIdx].subtasks.splice(taskIndex, 1);
                    saveData(); onRefresh();
                }
            }
            else if (target.closest('.delete-task-btn')) {
                if (confirm("Delete this task?")) {
                    const space = getSpaces().find(s => s.id === spaceId);
                    if (space) { 
                        const task = space.tasks[taskIndex];
                        space.tasks.splice(taskIndex, 1); saveData(); setCurrentSpaceId(0); onRefresh(); 
                    }
                } else setCurrentSpaceId(0);
            }
        });

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
