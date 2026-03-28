import { getSpaces, saveData, getAppSettings, setCurrentSpaceId } from '../core/storage.js';
import Sortable from '../sortable.esm.js';
import { googleTasksIcon } from '../core/icons.js';
import { getGoogleStatus, fetchGoogleAPI, fetchGoogleLists, getGoogleAuthToken, getCurrentGoogleListId, getIsGoogleSyncEnabled, createGoogleTask } from './googleTasks.js';
import { openTaskEditModal, openTaskLinkModal } from './todoManager.js';
import { handleMiniTagClick } from '../components/modals.js';
import { generateTaskHTML, attachSubtaskEventListeners, attachTaskInlineEditListeners } from '../core/ui-helpers.js';
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
    addingSubtaskToSpace: null
};

/**
 * Renders the controls (Buttons & Input Bar) typically placed in the header.
 */
export function renderMasterHeaderControls() {
    const allSpaces = getSpaces().filter(s => !s.isArchived);
    const googleStatus = getGoogleStatus();
    const isSync = googleStatus.isGoogleSyncEnabled;
    
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
                ${allSpaces.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
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

    const allSpaces = getSpaces().filter(s => !s.isArchived);
    let totalTasks = 0;
    let completedTasks = 0;

    allSpaces.forEach(space => {
        if (!masterTodoListState.activeSpaceFilters.has(space.id) && space.tasks) {
            const activeTasks = space.tasks.filter(t => t && !t.completed);
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
        
        let displayTasks = tasks.filter(t => t && !t.completed);
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
                            addingSubtaskToIndex: (masterTodoListState.addingSubtaskToSpace === space.id) ? masterTodoListState.addingSubtaskToIndex : null
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
    const onRefresh = () => { if (window.renderDefaultDashboard) window.renderDefaultDashboard(); };

    if (addBtn) addBtn.onclick = async () => {
        const text = taskInput.value.trim();
        const spaceId = parseInt(spaceSelect.value);
        if (!text) return;
        taskInput.disabled = true;
        const targetSpace = getSpaces().find(s => s.id === spaceId);
        if (targetSpace) {
            if (!targetSpace.tasks) targetSpace.tasks = [];
            let newTask = { text, completed: false, createdAt: Date.now(), isProminent: false, tags: [], googleTaskId: null };
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
                if (isVisible && (allSpaces.length - masterTodoListState.activeSpaceFilters.size) === 1) masterTodoListState.activeSpaceFilters.clear();
                else masterTodoListState.activeSpaceFilters = new Set(allSpaces.map(s => s.id).filter(id => id !== sid));
            } else {
                if (masterTodoListState.activeSpaceFilters.has(sid)) masterTodoListState.activeSpaceFilters.delete(sid);
                else masterTodoListState.activeSpaceFilters.add(sid);
            }
            onRefresh();
        };
    });

    if (groupContainer) {
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
                    task.completed = isChecked;
                    task.completedAt = isChecked ? Date.now() : null;
                    if (isChecked) task.isProminent = false;
                    saveData(); setTimeout(onRefresh, isChecked ? 800 : 0);
                }
            }
        });

        groupContainer.addEventListener('click', async (e) => {
            const target = e.target;
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
            if (target.closest('.btn-edit-tags') || target.closest('.edit-task-btn') || target.closest('.delete-task-btn')) {
                setCurrentSpaceId(spaceId); window._isModalOpenedFromCommandCenter = true;
            }
            if (target.closest('.btn-edit-tags')) handleMiniTagClick(target.closest('.btn-edit-tags'), onRefresh);
            else if (target.closest('.edit-task-btn')) openTaskEditModal(taskIndex, true);
            else if (target.closest('.delete-task-btn')) {
                if (confirm("Delete this task?")) {
                    const space = getSpaces().find(s => s.id === spaceId);
                    if (space) { space.tasks.splice(taskIndex, 1); saveData(); setCurrentSpaceId(0); onRefresh(); }
                } else setCurrentSpaceId(0);
            }
        });

        // Drag & Drop
        Sortable.create(groupContainer, {
            group: 'nested-tasks', animation: 150, handle: '.drag-handle', draggable: '.task-item',
            onEnd: (evt) => {
                const { from, to, item, oldIndex, newIndex } = evt;
                if (from === to && oldIndex === newIndex) return;
                const fromSpaceId = parseInt(from.dataset.spaceId);
                const toSpaceId = parseInt(to.dataset.spaceId);
                const fromSpace = getSpaces().find(s => s.id === fromSpaceId);
                const toSpace = getSpaces().find(s => s.id === toSpaceId);
                if (fromSpace && toSpace) {
                    const [movedTask] = fromSpace.tasks.splice(parseInt(item.dataset.index), 1);
                    toSpace.tasks.splice(newIndex, 0, movedTask);
                    saveData(); onRefresh();
                }
            }
        });
    }
}
