import { getSpaces, getAppSettings, saveData, getFilterTags } from '../core/storage.js';
import { getGoogleStatus, fetchGoogleLists } from './googleTasks.js';
import { updateKeepTagButtonState, openKeepWithTag } from './googleKeep.js';
import { openGoogleTasks } from './googleTasksLauncher.js';
import { renderMasterTodoList, renderMasterHeaderControls, masterTodoListState as commandCenterState } from './masterTodoList.js';
import { renderSmartFlow, initSmartFlow, flowState, showFocusPopup, formatFocusTime } from './smartFlow.js';
import { toggleDashboardQuickNote, renderDashboardQuickNote } from './dashboardQuickNote.js';
import Sortable from '../sortable.esm.js';

let ccWidgetStateCache = null; // 🟢 แคชสถานะ UI ไว้ในแรมเพื่อให้ทำงานเร็วขึ้น

export async function renderDefaultDashboard() {
    const container = document.getElementById('default-dashboard-container');
    if (!container) return;

    // 🟢 โหลดจาก Storage เฉพาะครั้งแรก ครั้งต่อไปอ่านจากแรมทันที
    if (!ccWidgetStateCache) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const uiRes = await chrome.storage.local.get(['ccWidgetState']);
            ccWidgetStateCache = uiRes.ccWidgetState || {
                minimized: [],
                order: ['todo', 'flow'],
                isLocked: false
            };
        } else {
            // Fallback สำหรับ Web/Mobile
            const saved = localStorage.getItem('ccWidgetState');
            ccWidgetStateCache = saved ? JSON.parse(saved) : {
                minimized: [],
                order: ['todo', 'flow'],
                isLocked: false
            };
        }
    }
    const uiState = ccWidgetStateCache;
    const isMinimized = (id) => uiState.minimized.includes(id);

    const allSpaces = getSpaces().filter(s => !s.isArchived);
    await initSmartFlow(); 
    const settings = getAppSettings();

    // 1. Render Dashboard Wrapper
    container.innerHTML = `
        <div id="cc-minimized-row" class="minimized-widgets-bar">
            <button class="btn-icon btn-lock-widgets ${uiState.isLocked ? 'is-locked' : ''}" title="${uiState.isLocked ? 'Unlock Widgets' : 'Lock Widgets'}" style="margin-right: 10px; border: 1px solid ${uiState.isLocked ? '#ef4444' : 'var(--border-color)'}; color: ${uiState.isLocked ? '#ef4444' : 'inherit'};">
                <svg class="svg-icon-sm"><use href="${uiState.isLocked ? '#icon-lock-minimal' : '#icon-unlock-minimal'}"></use></svg>
            </button>
            <button class="btn-icon btn-dashboard-note-toggle" title="Dashboard Quick Note" style="margin-right: 10px; ${settings.dashboardQuickNote?.isOpen ? 'color: var(--primary-color); border: 1px solid var(--primary-color); background: rgba(47, 128, 237, 0.1);' : ''}">
                <svg class="svg-icon-sm"><use href="#icon-pencil"></use></svg>
            </button>
            <div class="reward-system-btn-group" style="display: flex; align-items: center; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 20px; padding: 2px 4px; margin-right: 10px;">
                <button id="btn-master-open-rewards" class="btn-icon" title="Quest Loot & Rewards" style="color: #f59e0b; width: 32px; height: 32px; opacity: 1; margin: 0;"><svg class="svg-icon-lg"><use href="#icon-sparkles"></use></svg></button>
                <div style="width: 1px; height: 16px; background: rgba(245, 158, 11, 0.2); margin: 0 2px;"></div>
                <button id="btn-master-open-combo" class="btn-icon" title="Combo Rules" style="color: #f59e0b; width: 32px; height: 32px; opacity: 1; margin: 0;"><svg class="svg-icon-lg" style="width: 18px; height: 18px;"><use href="#icon-dice"></use></svg></button>
            </div>
            ${isMinimized('todo') ? `<div class="minimized-bubble" data-id="todo" title="Restore Todo List"><svg class="svg-icon-sm"><use href="#icon-check-square"></use></svg></div>` : ''}
            ${isMinimized('flow') ? `<div class="minimized-bubble" data-id="flow" title="Restore Smart Flow"><svg class="svg-icon-sm"><use href="#icon-sparkles"></use></svg></div>` : ''}
        </div>

        <div id="cc-widget-grid" class="dashboard-grid-inner ${uiState.isLocked ? 'is-locked' : ''}">
            ${uiState.order.filter(id => !isMinimized(id)).map(id => {
                
                if (id === 'todo') {
                    return `
                        <div class="card widget-card master-todo-widget" data-id="todo">
                            <div class="card-header" style="display: flex; align-items: center; gap: 15px; padding: 10px 20px;">
                                <div id="master-header-controls-container" style="display: contents;">
                                    ${renderMasterHeaderControls()}
                                </div>
                                <button class="btn-icon btn-minimize-widget" data-id="todo" title="Minimize">
                                    <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                </button>
                                ${renderGoogleIntegrations()}
                            </div>
                            <div id="master-todo-list-container" class="card-body" style="padding-top: 5px;"></div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="card widget-card smart-flow-widget" data-id="flow">
                            <div class="card-header" style="display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 10px 20px;">
                                <button class="btn-icon ${flowState.isFocusRunning ? (flowState.isPaused ? 'active-orange' : 'active-red') : (flowState.focusMode ? 'active-blue' : '')}" id="sf-widget-focus-btn" title="Focus Mode" style="font-size: 11px; gap: 4px; padding: 2px 8px; width: auto; border-radius: 20px;">
                                    <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                                    <span id="sf-widget-focus-text">${flowState.isFocusRunning ? (flowState.isPaused ? 'Paused' : formatFocusTime(flowState.focusTimeLeft)) : 'Focus'}</span>
                                </button>
                                <button class="btn-icon btn-toggle-all-flow-actions" title="Toggle Flow Actions" style="opacity: ${flowState.showActions ? '1' : '0.6'};">
                                    <svg class="svg-icon-sm"><use href="#icon-${flowState.showActions ? 'eye' : 'eye-off'}"></use></svg>
                                </button>
                                <button class="btn-icon btn-minimize-widget" data-id="flow" title="Minimize">
                                    <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                </button>
                            </div>
                            <div id="smart-flow-container" class="card-body" style="padding-top: 5px;"></div>
                        </div>
                    `;
                }
            }).join('')}
        </div>
    `;

    // 2. Delegate Rendering
    if (!isMinimized('todo')) renderMasterTodoList(document.getElementById('master-todo-list-container'));
    if (!isMinimized('flow')) renderSmartFlow(document.getElementById('smart-flow-container'));

    // 3. Setup Events (Minimize/Restore/Sort)
    container.querySelectorAll('.btn-minimize-widget').forEach(btn => {
        btn.onclick = () => {
            const id = btn.dataset.id;
            if (!uiState.minimized.includes(id)) uiState.minimized.push(id);
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ ccWidgetState: uiState });
            } else {
                localStorage.setItem('ccWidgetState', JSON.stringify(uiState));
            }
            renderDefaultDashboard(); // 🟢 วาดใหม่ทันที ไม่ต้องรอ Storage Callback
        };
    });

    // Focus Mode Popup Trigger
    const focusWidgetBtn = container.querySelector('#sf-widget-focus-btn');
    if (focusWidgetBtn) {
        focusWidgetBtn.onclick = (e) => {
            e.stopPropagation();
            showFocusPopup(focusWidgetBtn);
        };
    }

    // Toggle All Flow Actions
    container.querySelectorAll('.btn-toggle-all-flow-actions').forEach(btn => {
        btn.onclick = () => {
            flowState.showActions = !flowState.showActions;
            renderDefaultDashboard();
        };
    });

    container.querySelectorAll('.minimized-bubble').forEach(bub => {
        bub.onclick = () => {
            const id = bub.dataset.id;
            uiState.minimized = uiState.minimized.filter(m => m !== id);
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ ccWidgetState: uiState });
            } else {
                localStorage.setItem('ccWidgetState', JSON.stringify(uiState));
            }
            renderDefaultDashboard(); // 🟢 กู้คืนทันที
        };
    });

    const gridEl = document.getElementById('cc-widget-grid');
    if (gridEl) {
        Sortable.create(gridEl, {
            handle: '.card-header', // ใช้หัว Card เป็นจุดจับลากแทน
            animation: 150,
            ghostClass: 'widget-ghost',
            disabled: uiState.isLocked,
            onEnd: () => {
                const newOrder = Array.from(gridEl.querySelectorAll('.widget-card')).map(el => el.dataset.id);
                // รวมลำดับเดิมเข้าไปด้วยเผื่อมีตัวที่ถูกซ่อนอยู่
                const finalOrder = [...newOrder];
                uiState.order.forEach(id => { if(!finalOrder.includes(id)) finalOrder.push(id); });
                uiState.order = finalOrder;
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ ccWidgetState: uiState });
                } else {
                    localStorage.setItem('ccWidgetState', JSON.stringify(uiState));
                }
            }
        });
    }

    // Toggle Layout Lock
    const lockBtn = container.querySelector('.btn-lock-widgets');
    if (lockBtn) {
        lockBtn.onclick = () => {
            uiState.isLocked = !uiState.isLocked;
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ ccWidgetState: uiState });
            } else {
                localStorage.setItem('ccWidgetState', JSON.stringify(uiState));
            }
            renderDefaultDashboard(); // 🟢 ล็อคทันที
        };
    }

    // Dashboard Quick Note Toggle
    const noteBtn = container.querySelector('.btn-dashboard-note-toggle');
    if (noteBtn) {
        noteBtn.onclick = () => toggleDashboardQuickNote();
    }

    // 3. Global Dashboard UI Updates
    updateKeepTagButtonState(); // อัปเดตสถานะปุ่ม Tag ทันทีที่เรนเดอร์
    if (getGoogleStatus().googleAuthToken) { fetchGoogleLists(renderDefaultDashboard); }
    
    // Attached to window for masterTodoList.js callbacks
    window.renderDefaultDashboard = renderDefaultDashboard;
    initMasterEvents(); // 🟢 สั่งรัน Event Listeners หลังจากวาดหน้าจอเสร็จ
}

/**
 * Helper: Google Integrations Dropdown
 */
function renderGoogleIntegrations() {
    return `
        <div style="position: relative; display:flex; align-items:center; gap:8px; flex-shrink: 0;">
            <button class="btn-icon" id="master-btn-google-apps-menu" title="Google Integrations" style="padding: 6px;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
            </button>
            <div id="master-google-apps-popup" class="dropdown-menu" style="display: none; top: 110%; right: 0;">
                <div class="app-row">
                    <span class="app-label label-keep">Keep</span>
                    <div class="app-controls">
                        <button id="master-btn-open-keep" class="btn-icon app-btn" title="Open Keep" style="color:#f59e0b;"><svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"></path></svg></button>
                        <button class="btn-icon app-btn side-view-toggle" id="master-keep-side-view-btn" title="Toggle Side View"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg></button>
                        <button id="master-btn-keep-tag" class="btn-icon app-btn" title="Filter Label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg></button>
                    </div>
                </div>
            </div>
            <div style="width:1px; height:16px; background:var(--border-color); margin:0 4px;"></div>
        </div>
    `;
}

function initMasterEvents() {
    const addBtn = document.getElementById('btn-master-add-task');
    const taskInput = document.getElementById('master-task-input');
    const spaceSelect = document.getElementById('master-space-selector');
    const groupContainer = document.getElementById('master-groups-container');

    // Toggle แสดง/ซ่อน Progress
    const toggleProgressBtn = document.getElementById('btn-master-toggle-progress');
    if (toggleProgressBtn) {
        toggleProgressBtn.onclick = () => {
            commandCenterState.isProgressVisible = !commandCenterState.isProgressVisible;
            renderDefaultDashboard();
        };
    }

    // Toggle Master Task Actions Visibility
    const toggleMasterTaskActionsBtn = document.getElementById('btn-master-toggle-task-actions');
    if (toggleMasterTaskActionsBtn) {
        toggleMasterTaskActionsBtn.onclick = () => {
            commandCenterState.showMasterTaskActions = !commandCenterState.showMasterTaskActions;
            renderDefaultDashboard();
        };
    }

    // Toggle กรองงานติดธง
    const filterFlagBtn = document.getElementById('btn-master-filter-flagged');
    if (filterFlagBtn) {
        filterFlagBtn.onclick = () => {
            commandCenterState.showOnlyFlagged = !commandCenterState.showOnlyFlagged;
            renderDefaultDashboard();
        };
    }

    // Toggle โหมดการเลือก (Single/Multi)
    const toggleSelectBtn = document.getElementById('btn-master-toggle-select-mode');
    if (toggleSelectBtn) {
        toggleSelectBtn.onclick = () => {
            commandCenterState.isSingleSelectMode = !commandCenterState.isSingleSelectMode;
            renderDefaultDashboard();
        };
    }

    const handleAdd = async () => {
        let text = taskInput.value.trim();
        const spaceId = parseInt(spaceSelect.value);
        if (!text) return;

        taskInput.disabled = true;
        const spaces = getSpaces();
        const targetSpace = spaces.find(s => s.id === spaceId);
        
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
            
            let newTask = { text, completed: false, createdAt: Date.now(), isProminent: false, tags: tags, googleTaskId: null, subtasksHidden: false };

            // Google Tasks Integration
            const status = getGoogleStatus();
            if (status.isGoogleSyncEnabled && status.googleAuthToken) {
                taskInput.placeholder = "Syncing with Google...";
                const gTitle = `${text} (S: ${targetSpace.name})`;
                const gTask = await fetchGoogleAPI(`/lists/${status.currentGoogleListId}/tasks`, 'POST', { title: gTitle });
                if (gTask && gTask.id) newTask.googleTaskId = gTask.id;
            }

            targetSpace.tasks.push(newTask);
            taskInput.value = '';
            taskInput.disabled = false;
            taskInput.placeholder = "Quick add task...";
            saveData();
            renderDefaultDashboard();
        }
    };

    addBtn.onclick = handleAdd;
    taskInput.onkeypress = (e) => { if (e.key === 'Enter') handleAdd(); };

    // Subtask Keyboard Logic for Command Center
    const handleMasterSubtaskKey = (e) => {
        const input = e.target;
        if (!input.classList.contains('subtask-add-input')) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            const pIdx = parseInt(input.getAttribute('data-parent'));
            const value = input.value.trim();
            const space = getSpaces().find(s => s.id === commandCenterState.addingSubtaskToSpace);

            if (value && space && space.tasks[pIdx]) {
                if (!space.tasks[pIdx].subtasks) space.tasks[pIdx].subtasks = [];
                space.tasks[pIdx].subtasks.push({ id: Date.now(), text: value, completed: false });
                saveData();
            } else {
                commandCenterState.addingSubtaskToIndex = null;
                commandCenterState.addingSubtaskToSpace = null;
            }

            renderDefaultDashboard();

            if (commandCenterState.addingSubtaskToIndex !== null) {
                setTimeout(() => {
                    const newInput = document.querySelector(`.subtask-add-input[data-parent="${pIdx}"]`);
                    if (newInput) newInput.focus();
                }, 50);
            }
        } else if (e.key === 'Escape') {
            commandCenterState.addingSubtaskToIndex = null;
            commandCenterState.addingSubtaskToSpace = null;
            renderDefaultDashboard();
        }
    };

    const handleMasterSubtaskBlur = (e) => {
        if (e.target.classList.contains('subtask-add-input')) {
            setTimeout(() => {
                // Abort closing if we are currently auto-creating the next subtask
                if (document.activeElement && document.activeElement.classList.contains('subtask-add-input')) {
                    return;
                }
                commandCenterState.addingSubtaskToIndex = null;
                commandCenterState.addingSubtaskToSpace = null;
                renderDefaultDashboard();
            }, 100);
        }
    };

    if (groupContainer) {
        groupContainer.addEventListener('keydown', handleMasterSubtaskKey);
        // เพิ่มการตรวจจับ Enter ใน Command Center เพื่อสร้าง Subtask ต่อเนื่อง
        groupContainer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('task-actual-text')) {
                const li = e.target.closest('li');
                if (li && li.dataset.type === 'subtask') {
                    const subList = li.closest('.subtask-list');
                    if (subList) {
                        commandCenterState.addingSubtaskToIndex = parseInt(subList.dataset.parentIndex);
                        commandCenterState.addingSubtaskToSpace = parseInt(li.getAttribute('data-space-id'));
                    }
                }
            }
        });
        groupContainer.addEventListener('focusout', handleMasterSubtaskBlur);
        groupContainer.addEventListener('contextmenu', (e) => {
            const linkBtn = e.target.closest('.task-link-btn');
            if (linkBtn) {
                e.preventDefault();
                const idx = parseInt(linkBtn.getAttribute('data-index'));
                const pIdxAttr = linkBtn.getAttribute('data-parent-index');
                const pIdx = pIdxAttr !== null ? parseInt(pIdxAttr) : null;
                const sid = parseInt(linkBtn.getAttribute('data-space-id'));
                openTaskLinkModal(idx, pIdx !== null, pIdx, sid);
            }
        });
    }

    // Add listener for background sync completion
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GOOGLE_TASKS_SYNC_COMPLETE') {
            renderDefaultDashboard(); // Trigger re-render of the entire dashboard
        }
    });


    // All Spaces Filter
    const allPill = document.getElementById('btn-master-filter-all');
    if (allPill) {
        allPill.onclick = (e) => {
            e.stopPropagation();
            commandCenterState.activeSpaceFilters.clear();
            renderDefaultDashboard();
        };
    }

    // 1.5 Google Apps Menu logic
    const menuBtn = document.getElementById('master-btn-google-apps-menu');
    const popup = document.getElementById('master-google-apps-popup');
    if (menuBtn && popup) {
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
        };
        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && e.target !== menuBtn) popup.style.display = 'none';
        });
    }

    const mkSide = document.getElementById('master-keep-side-view-btn');
    const mtSide = document.getElementById('master-tasks-side-view-btn');

    const mOpenTasks = document.getElementById('master-btn-open-tasks');
    if (mOpenTasks) mOpenTasks.onclick = () => {
        const isSide = mtSide && mtSide.classList.contains('active-side-view');
        openGoogleTasks(isSide);
    };

    const mOpenKeep = document.getElementById('master-btn-open-keep');
    if (mOpenKeep) mOpenKeep.onclick = () => {
        const isSide = mkSide && mkSide.classList.contains('active-side-view');
        // ใช้ฟังก์ชันมาตรฐานเพื่อให้ Filter Tag ติดไปด้วย
        const btnTag = document.getElementById('master-btn-keep-tag');
        const currentTag = btnTag && btnTag.classList.contains('active') 
            ? btnTag.title.replace('Keep Filter: #', '') 
            : null;
        openKeepWithTag(currentTag, isSide);
    };

    const mConnectBtn = document.getElementById('master-connect-google-btn');
    if (mConnectBtn) {
        const status = getGoogleStatus();
        if (status.googleAuthToken) {
            mConnectBtn.style.background = '#34a853';
            mConnectBtn.style.color = '#ffffff';
        }
        mConnectBtn.onclick = () => document.getElementById('connect-google-btn')?.click();
    }

    if (groupContainer) {
        // 2.1 Event Delegation สำหรับ Actions (Edit, Delete, Tags)
        // 2. Toggle Completion (Delegated)
        groupContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('master-task-checkbox')) {
                const sid = parseInt(e.target.dataset.space);
                const idx = parseInt(e.target.dataset.idx);
                const isChecked = e.target.checked;
                const taskItem = e.target.closest('.task-item');

                // แสดง Animation ขีดฆ่าก่อนหายไป
                if (isChecked && taskItem) {
                    taskItem.classList.add('completed-hold');
                }
                
                const spaces = getSpaces();
                const space = spaces.find(s => s.id === sid);
                if (space && space.tasks[idx]) {
                    const task = space.tasks[idx];
                    
                    // Sync กับ Google Tasks API
                    const status = getGoogleStatus();
                    if (task.googleTaskId && status.googleAuthToken && status.isGoogleSyncEnabled) {
                        fetchGoogleAPI(`/lists/${status.currentGoogleListId}/tasks/${task.googleTaskId}`, 'PATCH', { 
                            status: isChecked ? 'completed' : 'needsAction' 
                        });
                    }

                    task.completed = isChecked;
                    task.completedAt = isChecked ? Date.now() : null;
                    if (isChecked) task.isProminent = false;

                    // อัปเดตสถานะงานย่อยทั้งหมด
                    if (task.subtasks && task.subtasks.length > 0) {
                        task.subtasks.forEach(sub => {
                            if (!sub) return;
                            sub.completed = isChecked;
                            if (sub.googleTaskId && status.googleAuthToken && status.isGoogleSyncEnabled) {
                                fetchGoogleAPI(`/lists/${status.currentGoogleListId}/tasks/${sub.googleTaskId}`, 'PATCH', { 
                                    status: isChecked ? 'completed' : 'needsAction' 
                                });
                            }
                        });
                    }

                    saveData();
                    
                    // หน่วงเวลา Re-render เพื่อให้ผู้ใช้เห็น Animation
                    setTimeout(() => {
                        renderDefaultDashboard();
                    }, isChecked ? 800 : 0);
                }
            }
        });

        groupContainer.addEventListener('click', async (e) => {
            const target = e.target;
            
            // Collapsible Toggle Logic
            const toggleBtn = target.closest('.toggle-actions-btn');
            if (toggleBtn) {
                const container = toggleBtn.parentElement.querySelector('.collapsible-actions');
                if (container) {
                    const isHidden = container.style.display === 'none';
                    container.style.display = isHidden ? 'flex' : 'none';
                    toggleBtn.classList.toggle('expanded');
                }
            }

            // ปุ่ม Toggle Visibility ราย Space (ที่อยู่หน้าชื่อ Space ใน Command Center)
            const visibilityBtn = target.closest('.btn-master-space-toggle-prominent');
            if (visibilityBtn) {
                e.preventDefault();
                e.stopPropagation();
                const sid = parseInt(visibilityBtn.dataset.spaceId);
                const space = getSpaces().find(s => s.id === sid);
                if (space) {
                    space.hideProminentTasks = !space.hideProminentTasks;
                    saveData();
                    renderDefaultDashboard();
                }
                return;
            }

            // ปุ่ม Open Space (สลับไปยัง Space นั้นๆ)
            const gotoBtn = target.closest('.btn-master-goto-space');
            if (gotoBtn) {
                e.preventDefault();
                e.stopPropagation();
                const sid = parseInt(gotoBtn.dataset.spaceId);

                // 🟢 ตรวจสอบและคลายโฟลเดอร์ที่ซ่อนอยู่ก่อนจะสลับ Space
                const spaces = getSpaces();
                const targetSpace = spaces.find(s => s.id === sid);
                if (targetSpace) {
                    const folderName = targetSpace.folder || 'General';
                    const settings = getAppSettings();
                    if (settings.collapsedFolders && settings.collapsedFolders.includes(folderName)) {
                        settings.collapsedFolders = settings.collapsedFolders.filter(f => f !== folderName);
                        saveData();
                        renderSidebar();
                    }
                }

                // ใช้การจำลองการคลิกที่รายการใน Sidebar เพื่อรัน logic การเปลี่ยน Space ตัวกลาง
                const sidebarItem = document.querySelector(`#spacebar .space-item[data-id="${sid}"]`);
                if (sidebarItem) sidebarItem.click();
                return;
            }

            // Add Subtask Button
            if (target.closest('.add-subtask-btn')) {
                const idx = parseInt(target.closest('.add-subtask-btn').getAttribute('data-index'));
                const taskItem = target.closest('.task-item');
                const spaceId = parseInt(taskItem.getAttribute('data-space-id'));

                if (isNaN(spaceId)) return; // Ensure spaceId is valid
                addingSubtaskToIndex = idx;
                addingSubtaskToSpace = spaceId;
                renderDefaultDashboard();
                setTimeout(() => {
                    const input = document.querySelector(`.subtask-add-input[data-parent="${idx}"]`);
                    if (input) input.focus();
                }, 10);
                return;
            }

                        // Sub-task Sync Toggle
            if (target.closest('.subtask-sync-toggle-btn')) {
                const btn = target.closest('.subtask-sync-toggle-btn');
                const pIdx = parseInt(btn.getAttribute('data-parent-index'));
                const sIdx = parseInt(btn.getAttribute('data-sub-index'));
                const sid = parseInt(btn.getAttribute('data-space-id'));
                
                const space = getSpaces().find(s => s.id === sid);
                const parentTask = space?.tasks?.[pIdx];
                const subtask = parentTask?.subtasks?.[sIdx];

                if (subtask) {
                    const status = getGoogleStatus();
                    
                    if (!status.googleAuthToken) {
                        alert("Please connect to Google first");
                        return;
                    }

                    if (subtask.googleTaskId) {
                        await fetchGoogleAPI(`/lists/${status.currentGoogleListId}/tasks/${subtask.googleTaskId}`, 'DELETE');
                        subtask.googleTaskId = null;
                    } else {
                        if (!parentTask.googleTaskId) {
                            alert("Please sync the main task first to nest this subtask in Google Tasks.");
                            return;
                        }

                        const gTitle = `${subtask.text} (S: ${space.name})`;
                        let gBody = { title: gTitle };
                        if (subtask.dueDate) { gBody.due = new Date(subtask.dueDate).toISOString(); }
                        const gTask = await createGoogleTask(status.currentGoogleListId, gBody, parentTask.googleTaskId);
                        if (gTask && gTask.id) {
                            subtask.googleTaskId = gTask.id;
                        }
                    }
                    saveData();
                    renderDefaultDashboard();
                }
                return;
            }




            const taskItem = target.closest('.task-item');
            if (!taskItem) return;

            const spaceId = parseInt(taskItem.dataset.spaceId);
            const taskIndex = parseInt(taskItem.dataset.index);

            // ปุ่มปักธง (Flag)
            if (target.closest('.btn-prominent-task')) {
                const space = getSpaces().find(s => s.id === spaceId);
                const task = space.tasks[taskIndex];
                if (task.isProminent) {
                    task.isProminent = false;
                    if (typeof task.originalIndex === 'number') {
                        const [movedTask] = space.tasks.splice(taskIndex, 1);
                        const finalIndex = Math.min(task.originalIndex, space.tasks.length);
                        space.tasks.splice(finalIndex, 0, movedTask);
                        delete task.originalIndex;
                    }
                } else {
                    task.isProminent = true;
                    task.originalIndex = taskIndex;
                    const [movedTask] = space.tasks.splice(taskIndex, 1);
                    
                    // 🟢 FIFO Flagging: ค้นหาตำแหน่งสุดท้ายของกลุ่มงานที่ติดธงอยู่แล้ว เพื่อต่อท้าย
                    let lastProminentIdx = -1;
                    for (let i = 0; i < space.tasks.length; i++) {
                        if (space.tasks[i].isProminent) {
                            lastProminentIdx = i;
                        } else {
                            break; // เจอส่วนงานปกติแล้ว ให้หยุดหา
                        }
                    }
                    space.tasks.splice(lastProminentIdx + 1, 0, movedTask);
                }
                saveData();
                renderDefaultDashboard();
                return;
            }

            // ตั้งค่า Space ID ชั่วคราวเพื่อให้ Modal ดึงข้อมูลป้ายกำกับของ Space นั้นๆ มาแสดง
            if (
                target.closest('.edit-task-btn') || 
                target.closest('.delete-task-btn') ||
                target.closest('.edit-subtask-btn') ||
                target.closest('.delete-subtask-btn')
            ) {
                setCurrentSpaceId(spaceId);
                window._isModalOpenedFromCommandCenter = true; // Set flag for modals
            }

            if (target.closest('.edit-subtask-btn')) {
                const pIdx = parseInt(target.closest('.edit-subtask-btn').getAttribute('data-parent-index'));
                const sId = parseInt(target.closest('.edit-subtask-btn').getAttribute('data-id'));
                openTaskEditModal(pIdx, true, sId);
            } else if (target.closest('.edit-task-btn')) {
                openTaskEditModal(taskIndex, true); // Pass true to indicate it's from Command Center
            } else if (target.closest('.delete-task-btn')) {
                if (confirm("Delete this task?")) {
                    const space = getSpaces().find(s => s.id === spaceId);
                    if (space) {
                        space.tasks.splice(taskIndex, 1);
                        saveData();
                        setCurrentSpaceId(0);
                        renderDefaultDashboard();
                    }
                } else { setCurrentSpaceId(0); }
            }
        });

        // 3. Space Filter Pills
        document.querySelectorAll('.space-pill').forEach(pill => {
            if (pill.id === 'btn-master-filter-all') return; // ข้ามป้าย All เพราะมี Logic แยก
            pill.onclick = (e) => {
                e.stopPropagation();
                const sid = parseInt(pill.dataset.spaceId);
                
                if (commandCenterState.isSingleSelectMode) {
                    const isVisible = !commandCenterState.activeSpaceFilters.has(sid);
                    const allSpaces = getSpaces().filter(s => !s.isArchived);
                    const visibleCount = allSpaces.length - commandCenterState.activeSpaceFilters.size;

                    if (isVisible && visibleCount === 1) {
                        // ถ้าเหลือตัวเดียวแล้วกดซ้ำ ให้กลับไปแสดงทั้งหมด (All)
                        commandCenterState.activeSpaceFilters.clear();
                    } else {
                        // เลือกแสดงแค่ตัวนี้ตัวเดียว (ซ่อนตัวอื่นทั้งหมด)
                        commandCenterState.activeSpaceFilters = new Set(allSpaces.map(s => s.id).filter(id => id !== sid));
                    }
                } else {
                    // โหมด Multi (ปกติ)
                    if (commandCenterState.activeSpaceFilters.has(sid)) {
                        commandCenterState.activeSpaceFilters.delete(sid);
                    } else {
                        commandCenterState.activeSpaceFilters.add(sid);
                    }
                }
                renderDefaultDashboard();
            };
        });

        // 🟢 4. Cross-Space Drag and Drop overhaul for precision
        const initListSortable = (el) => {
            Sortable.create(el, {
                group: 'nested-tasks',
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                onStart: () => { document.body.classList.add('is-sorting-tasks'); window.getSelection().removeAllRanges(); },
                onEnd: (evt) => {
                    document.body.classList.remove('is-sorting-tasks');
                    const { from, to, item } = evt;
                    if (from === to && evt.oldIndex === evt.newIndex) return;

                    const arrayIdx = parseInt(item.getAttribute('data-index'));

                    const fromIsSub = from.classList.contains('subtask-list');
                    const toIsSub = to.classList.contains('subtask-list');
                    
                    const getSpaceId = (list) => parseInt(list.closest('.task-group-details')?.dataset.spaceId || list.dataset.spaceId);
                    const fromSpaceId = getSpaceId(from);
                    const toSpaceId = getSpaceId(to);

                    const spaces = getSpaces();
                    const fromSpace = spaces.find(s => s.id === fromSpaceId);
                    const toSpace = spaces.find(s => s.id === toSpaceId);
                    if (!fromSpace || !toSpace) return;

                    // 1. นำข้อมูลออกจากต้นทาง (Source)
                    let movedTask;
                    if (fromIsSub) {
                        const pIdx = parseInt(from.dataset.parentIndex);
                        movedTask = fromSpace.tasks[pIdx].subtasks.splice(arrayIdx, 1)[0];
                    } else {
                        movedTask = fromSpace.tasks.splice(arrayIdx, 1)[0];
                    }

                    // 2. แทรกข้อมูลลงในปลายทาง (Target)
                    const targetArray = toIsSub ? toSpace.tasks[parseInt(to.dataset.parentIndex)].subtasks : toSpace.tasks;
                    const nextEl = item.nextElementSibling;
                    
                    let targetIdx;
                    if (nextEl && nextEl.hasAttribute('data-index')) {
                        targetIdx = parseInt(nextEl.getAttribute('data-index'));
                        if (from === to && targetIdx > arrayIdx) targetIdx--;
                    } else {
                        targetIdx = toIsSub ? targetArray.length : targetArray.findIndex(t => t.completed);
                        if (targetIdx === -1) targetIdx = targetArray.length;
                    }

                    if (toIsSub) {
                        targetArray.splice(targetIdx, 0, {
                            id: movedTask.id || Date.now(),
                            text: movedTask.text,
                            completed: movedTask.completed,
                            tags: movedTask.tags || []
                        });
                    } else {
                        targetArray.splice(targetIdx, 0, {
                            ...movedTask,
                            subtasks: movedTask.subtasks || [],
                            createdAt: movedTask.createdAt || Date.now()
                        });
                    }

                    saveData();
                    renderDefaultDashboard();
                }
            });
        };

        document.querySelectorAll('.master-group-list').forEach(initListSortable);
        document.querySelectorAll('.subtask-list').forEach(initListSortable);
    } // 🟢 ปิด if (groupContainer)
} // 🟢 ปิดฟังก์ชัน initMasterEvents
