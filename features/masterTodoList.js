import { getSpaces, saveData, getAppSettings, setCurrentSpaceId, getFilterTags } from '../core/storage.js';
import Sortable from '../sortable.esm.js';
import { googleTasksIcon } from '../core/icons.js';
import { getGoogleStatus, fetchGoogleAPI, fetchGoogleLists, getGoogleAuthToken, getCurrentGoogleListId, getIsGoogleSyncEnabled, createGoogleTask, syncAllGoogleTasks } from './googleTasks.js';
import { openTaskEditModal, openTaskLinkModal } from './todoManager.js';
import { handleMiniTagClick } from '../components/modals.js';
import { generateTaskHTML, attachSubtaskEventListeners, attachTaskInlineEditListeners, handleTagAutocomplete } from '../core/ui-helpers.js';
    const taskInput = document.getElementById('master-task-input');
    const spaceSelect = document.getElementById('master-space-selector');

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

import { renderSidebar } from '../components/sidebar.js';
import { updateKeepTagButtonState } from './googleKeep.js';

const computerIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="12" y1="17" x2="12" y2="21"></line><line x1="8" y1="21" x2="16" y2="21"></line></svg>`;

/**
 * State for the Master Todo List
 */
export const masterTodoListState = {
    activeSpaceFilters: new Set(),
    showOnlyFlagged: false,
    isProgressVisible: true,
    showMasterTaskActions: false,
    isSingleSelectMode: false,
    addingSubtaskToIndex: null,
    addingSubtaskToSpace: null,
    selectedQuickAddSpaceId: null
};

/**
 * Renders the controls (Buttons & Input Bar) typically placed in the header.
 */
export function renderMasterHeaderControls() {
    const allSpaces = getSpaces().filter(s => !s.isArchived && !s.isDeleted);
    const googleStatus = getGoogleStatus();
    const isSync = googleStatus.isGoogleSyncEnabled;
    
    // หา ID ที่ควรจะถูกเลือกใน Dropdown (จาก State หรือค่าแรกสุดในรายการ)
    const selectedId = masterTodoListState.selectedQuickAddSpaceId || (allSpaces.length > 0 ? allSpaces[0].id : null);

    return `
        <div style="display:flex; align-items:center; gap:6px; flex-shrink: 0;">
            <button id="btn-master-toggle-task-actions" class="btn-icon" title="Toggle Task Actions Visibility" style="padding: 2px; opacity: ${masterTodoListState.showMasterTaskActions ? '1' : '0.6'};">
                <svg class="svg-icon-sm"><use href="#icon-${masterTodoListState.showMasterTaskActions ? 'eye' : 'eye-off'}"></use></svg>
            </button>
            <button id="btn-master-toggle-progress" class="btn-icon" title="${masterTodoListState.isProgressVisible ? 'Hide Space Tags' : 'Show Space Tags'}" style="padding:2px; opacity: 0.6;">
                <svg class="svg-icon-sm" style="transform: ${masterTodoListState.isProgressVisible ? 'rotate(0deg)' : 'rotate(180deg)'}; transition: transform 0.2s;"><use href="#icon-chevron-up"></use></svg>
            </button>
        </div>
        
        <div class="task-input-bar master-input-area" style="flex: 1; margin: 0; height: 34px; box-shadow: none;">
            <button id="btn-master-sync-toggle" class="btn-sync-toggle ${isSync ? 'active' : ''}" title="Google Tasks Sync" style="border-radius: 6px 0 0 6px; border-right: 1px solid var(--border-color);">
                ${isSync ? googleTasksIcon : computerIcon}
            </button>
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

    initMasterEvents();

    const onRefresh = () => { if (window.renderDefaultDashboard) window.renderDefaultDashboard(); };

    // Attach Subtask Listeners
    container.querySelectorAll('.subtask-list').forEach(subListEl => {
        const groupDetails = subListEl.closest('.task-group-details');
        if (!groupDetails) return;
        const spaceId = parseInt(groupDetails.dataset.spaceId);
        const space = allSpaces.find(s => s.id === spaceId);
        const googleApiCallbacks = { fetchGoogleAPI, getGoogleAuthToken, getCurrentGoogleListId, isGoogleSyncEnabled: getIsGoogleSyncEnabled };
        if (space) {
            attachSubtaskEventListeners(subListEl, space, onRefresh, googleApiCallbacks, () => { saveData(); onRefresh(); });
        }
    });

    // Attach Inline Editing
    attachTaskInlineEditListeners(container, (li) => {
        const spaceId = parseInt(li.getAttribute('data-space-id'));
        return getSpaces().find(s => s.id === spaceId);
    }, {
        fetchGoogleAPI, getGoogleAuthToken, getCurrentGoogleListId, saveData,
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
            if (task && task.googleTaskId && getGoogleAuthToken()) {
                const listId = getCurrentGoogleListId() || '@default';
                fetchGoogleAPI(`/lists/${listId}/tasks/${task.googleTaskId}`, 'DELETE');
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
    return `
        <div class="master-progress-container">
            <div class="master-progress-info">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:700;">Task Completion</span>                                
                    <button id="btn-master-filter-flagged" class="${masterTodoListState.showOnlyFlagged ? 'active' : ''}" 
                        title="${masterTodoListState.showOnlyFlagged ? 'Show All Tasks' : 'Show Only Flagged Tasks'}">
                        <svg class="svg-icon-sm"><use href="#icon-flag"></use></svg>
                    </button>
                    <button id="btn-master-toggle-select-mode" 
                        style="padding: 2px 8px; font-size: 10px; border-radius: 4px; font-weight: 700; cursor: pointer; transition: all 0.2s; 
                        background: ${masterTodoListState.isSingleSelectMode ? '#f3e8ff' : '#dcfce7'}; color: ${masterTodoListState.isSingleSelectMode ? '#6b21a8' : '#166534'}; border: 1px solid ${masterTodoListState.isSingleSelectMode ? '#6b21a8' : '#166534'};">
                        ${masterTodoListState.isSingleSelectMode ? 'Select : Single' : 'Select : Multi'}
                    </button>
                    <select id="google-task-list-select-master" class="master-space-select" style="display: none; height: 20px; font-size: 10px; margin-left: 4px; padding: 0 4px; border-radius: 4px;"></select>
                </div>
                <span id="progress-text" style="font-weight: 700; color: var(--primary-color);"> ${masterTodoListState.showOnlyFlagged ? 'Flagged' : ''} Tasks Remaining</span>
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
    return allSpaces.map(space => {
        const isHidden = masterTodoListState.activeSpaceFilters.has(space.id);
        const tasks = space.tasks || [];
        const isSpaceProminentHidden = space.hideProminentTasks || false;
        
        let displayTasks = tasks.filter(t => t && !t.completed && !t.isDeleted);
        if (masterTodoListState.showOnlyFlagged) {
            displayTasks = displayTasks.filter(t => t && t.isProminent);
        }
        
        if (displayTasks.length === 0) return '';

        return `
            <details class="task-group-details" data-space-id="${space.id}" ${isHidden ? 'style="display:none;"' : 'open'}>
                <summary class="task-group-summary">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="group-title">${space.name} (${displayTasks.length})</span>
                        <button class="btn-icon btn-master-space-toggle-prominent" data-space-id="${space.id}" title="Toggle Next Up Visibility" style="padding:2px; opacity: ${isSpaceProminentHidden ? '0.3' : '0.8'};">
                            <svg class="svg-icon-sm" style="color: ${isSpaceProminentHidden ? 'inherit' : 'var(--primary-color)'};"><use href="#icon-flag"></use></svg>
                        </button>
                        <button class="btn btn-outline btn-master-goto-space" data-space-id="${space.id}" style="padding: 2px 8px; font-size: 10px; height: 20px; border-radius: 4px; font-weight: 600; margin-left: 4px;">open space</button>
                    </div>
                    <span class="group-chevron"></span>
                </summary>
                <ul class="task-list master-group-list" data-space-id="${space.id}">
                    ${displayTasks.map(task => {
                        const originalIndex = space.tasks.indexOf(task);
                        return generateTaskHTML(task, originalIndex, {
                            showSpaceBadge: false,
                            isMasterView: true,
                            spaceId: space.id,
                            isProminentHidden: isSpaceProminentHidden,
                            showActions: masterTodoListState.showMasterTaskActions,
                            addingSubtaskToIndex: (masterTodoListState.addingSubtaskToSpace === space.id) ? masterTodoListState.addingSubtaskToIndex : null,
                            // isTrash: task.isDeleted // Removed, using task.isDeleted directly
                        });
                    }).join('')}
                </ul>
            </details>
        `;
    }).join('');
}

function initMasterEvents() {
    const addBtn = document.getElementById('btn-master-add-task');
    const taskInput = document.getElementById('master-task-input');
    const spaceSelect = document.getElementById('master-space-selector');
    const groupContainer = document.getElementById('master-groups-container');

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

            let newTask = { text, completed: false, createdAt: Date.now(), isProminent: false, tags: tags, googleTaskId: null };
            const status = getGoogleStatus();
            if (status.isGoogleSyncEnabled && status.googleAuthToken) {
                taskInput.placeholder = "Syncing...";
                const gTask = await fetchGoogleAPI(`/lists/${status.currentGoogleListId}/tasks`, 'POST', { title: `${text} (S: ${targetSpace.name})` });
                if (gTask && gTask.id) newTask.googleTaskId = gTask.id;
            }
            targetSpace.tasks.push(newTask);
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
    if (toggleSelectBtn) toggleSelectBtn.onclick = () => { masterTodoListState.isSingleSelectMode = !masterTodoListState.isSingleSelectMode; onRefresh(); };

    const allPill = document.getElementById('btn-master-filter-all');
    if (allPill) allPill.onclick = () => { masterTodoListState.activeSpaceFilters.clear(); onRefresh(); };

    document.querySelectorAll('.space-pill').forEach(pill => {
        if (pill.id === 'btn-master-filter-all') return;
        pill.onclick = (e) => {
            const sid = parseInt(pill.dataset.spaceId);
            if (masterTodoListState.isSingleSelectMode) {
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
                const space = getSpaces().find(s => s.id === sid);
                if (space && space.tasks[idx]) {
                    const task = space.tasks[idx];
                    const status = getGoogleStatus();
                    if (task.googleTaskId && status.googleAuthToken && status.isGoogleSyncEnabled) fetchGoogleAPI(`/lists/${status.currentGoogleListId}/tasks/${task.googleTaskId}`, 'PATCH', { status: isChecked ? 'completed' : 'needsAction' });
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
                    }
                    saveData(); setTimeout(onRefresh, isChecked ? 800 : 0);
                }
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

            // 🔘 3. Toggle Google Tasks Sync (Subtask)
            const syncBtn = target.closest('.subtask-sync-toggle-btn');
            if (syncBtn) {
                const pIdx = parseInt(syncBtn.dataset.parentIndex);
                const sIdx = parseInt(syncBtn.dataset.subIndex);
                const sid = parseInt(syncBtn.closest('li').dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                const parentTask = space?.tasks[pIdx];
                const subtask = parentTask?.subtasks[sIdx];

                if (subtask) {
                    const status = getGoogleStatus();
                    if (!status.googleAuthToken) return alert("Please connect to Google first");

                    if (subtask.googleTaskId) {
                        await fetchGoogleAPI(`/lists/${status.currentGoogleListId}/tasks/${subtask.googleTaskId}`, 'DELETE');
                        subtask.googleTaskId = null;
                    } else {
                        if (!parentTask.googleTaskId) return alert("Sync main task first to nest subtasks.");
                        const gTask = await createGoogleTask(status.currentGoogleListId, { title: subtask.text }, parentTask.googleTaskId);
                        if (gTask?.id) subtask.googleTaskId = gTask.id;
                    }
                    saveData(); onRefresh();
                }
                return;
            }

            // 🔘 6. Toggle Google Tasks Sync (Main Task)
            const mainSyncBtn = target.closest('.main-task-sync-toggle-btn');
            if (mainSyncBtn) {
                const idx = parseInt(mainSyncBtn.dataset.index);
                const sid = parseInt(mainSyncBtn.closest('li').dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                const task = space?.tasks[idx];

                if (task) {
                    const status = getGoogleStatus();
                    if (!status.googleAuthToken) return alert("Please connect to Google first");

                    if (task.googleTaskId) {
                        const listId = space.isSpecificListEnabled ? (space.googleTaskListId || status.currentGoogleListId) : status.currentGoogleListId;
                        await fetchGoogleAPI(`/lists/${listId}/tasks/${task.googleTaskId}`, 'DELETE');
                        task.googleTaskId = null;
                    } else {
                        const listId = space.isSpecificListEnabled ? (space.googleTaskListId || status.currentGoogleListId) : status.currentGoogleListId;
                        const gTask = await createGoogleTask(listId, { title: `${task.text} (S: ${space.name})` });
                        if (gTask?.id) task.googleTaskId = gTask.id;
                    }
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
                    if (task.googleTaskId && getGoogleAuthToken()) {
                        fetchGoogleAPI(`/lists/${getCurrentGoogleListId()}/tasks/${task.googleTaskId}`, 'PATCH', { status: 'completed' });
                    }
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
                    if (subtask.googleTaskId && getGoogleAuthToken()) {
                        fetchGoogleAPI(`/lists/${getCurrentGoogleListId()}/tasks/${subtask.googleTaskId}`, 'PATCH', { status: 'completed' });
                    }
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
                    if (task.linkData.isSideview && chrome.sidePanel) {
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
            const taskItem = target.closest('.task-item');
            if (!taskItem) return;
            const spaceId = parseInt(taskItem.dataset.spaceId);
            const taskIndex = parseInt(taskItem.dataset.index);
            if (target.closest('.btn-prominent-task')) {
                const space = getSpaces().find(s => s.id === spaceId);
                const task = space.tasks[taskIndex];
                if (task.isProminent) {
                    task.isProminent = false;
                    if (typeof task.originalIndex === 'number') {
                        const [movedTask] = space.tasks.splice(taskIndex, 1);
                        space.tasks.splice(Math.min(task.originalIndex, space.tasks.length), 0, movedTask);
                        delete task.originalIndex;
                    }
                } else {
                    task.isProminent = true; task.originalIndex = taskIndex;
                    const [movedTask] = space.tasks.splice(taskIndex, 1);
                    space.tasks.unshift(movedTask);
                }
                saveData(); onRefresh(); return;
            }
            
            // 🟢 แก้ไข: จัดการปุ่มแก้ไขและลบให้ครอบคลุมถึง Subtask
            const editSubBtn = target.closest('.edit-subtask-btn');
            const delSubBtn = target.closest('.delete-subtask-btn');

            if (target.closest('.btn-edit-tags') || target.closest('.edit-task-btn') || target.closest('.delete-task-btn') || editSubBtn || delSubBtn) {
                setCurrentSpaceId(spaceId); window._isModalOpenedFromCommandCenter = true;
            }
            if (target.closest('.btn-edit-tags')) handleMiniTagClick(target.closest('.btn-edit-tags'), onRefresh);
            else if (editSubBtn) openTaskEditModal(parseInt(editSubBtn.dataset.parentIndex), true, parseInt(editSubBtn.dataset.id));
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
                    if (space) { space.tasks.splice(taskIndex, 1); saveData(); setCurrentSpaceId(0); onRefresh(); }
                } else setCurrentSpaceId(0);
            }
        });

        // 🟢 เปิดใช้งาน Drag & Drop สำหรับงานในหน้า Master List (ลากข้ามกลุ่ม Space ได้)
        const initListSortable = (el) => {
            Sortable.create(el, {
                group: 'nested-tasks', // ใช้กลุ่มเดียวกันเพื่อให้สามารถลากงานข้ามกลุ่ม Space หรือข้ามไปเป็น Subtask ได้
                animation: 150,
                handle: '.drag-handle',
                draggable: '.task-item',
                ghostClass: 'sortable-ghost',
                onEnd: (evt) => {
                    const { from, to, item, oldIndex, newIndex } = evt;
                    if (from === to && oldIndex === newIndex) return;

                    // หา Space ID จากกลุ่มที่ลากออกมาและกลุ่มที่นำไปวาง
                    const getSpaceId = (list) => parseInt(list.closest('.task-group-details')?.dataset.spaceId || list.dataset.spaceId);
                    const fromSpaceId = getSpaceId(from);
                    const toSpaceId = getSpaceId(to);

                    const spaces = getSpaces();
                    const fromSpace = spaces.find(s => s.id === fromSpaceId);
                    const toSpace = spaces.find(s => s.id === toSpaceId);
                    if (!fromSpace || !toSpace) return;

                    // 1. ดึงข้อมูลออกจาก Array ต้นทาง (ดึงตามตำแหน่งจริงใน Array)
                    const arrayIdx = parseInt(item.getAttribute('data-index'));
                    const [movedTask] = fromSpace.tasks.splice(arrayIdx, 1);

                    // 2. คำนวณตำแหน่งใหม่ใน Array ปลายทาง
                    const nextEl = item.nextElementSibling;
                    if (nextEl && nextEl.dataset.index) {
                        let targetIdx = parseInt(nextEl.dataset.index);
                        // ถ้าอยู่ Space เดียวกันและลากลงล่าง ต้องลด index ลง 1 เพราะตัวมันเองถูกดึงออกไปแล้ว
                        if (fromSpaceId === toSpaceId && targetIdx > arrayIdx) targetIdx--;
                        toSpace.tasks.splice(targetIdx, 0, movedTask);
                    } else {
                        // ถ้าไม่มีตัวล่าง (ลากไปวางท้ายสุดของกลุ่ม) ให้วางต่อท้ายงานที่ยังไม่เสร็จตัวสุดท้าย
                        let lastActive = -1;
                        for (let i = toSpace.tasks.length - 1; i >= 0; i--) {
                            if (toSpace.tasks[i] && !toSpace.tasks[i].completed) { lastActive = i; break; }
                        }
                        if (lastActive === -1) toSpace.tasks.push(movedTask);
                        else toSpace.tasks.splice(lastActive + (fromSpaceId === toSpaceId ? 0 : 1), 0, movedTask);
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
