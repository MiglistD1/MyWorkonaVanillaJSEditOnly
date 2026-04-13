import { getSpaces, getAppSettings, saveData, getFilterTags, getCurrentSpace } from '../core/storage.js';
import { updateKeepTagButtonState, openKeepWithTag } from './googleKeep.js';
import { renderMasterTodoList, renderMasterHeaderControls, initMasterEvents, masterTodoListState as commandCenterState } from './masterTodoList.js';
import { renderSmartFlow, initSmartFlow, flowState, showFocusPopup, formatFocusTime } from './smartFlow.js';
import { toggleDashboardQuickNote, renderDashboardQuickNote } from './dashboardQuickNote.js';
import { toggleHabitModal } from './habitSheet.js';
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

    const currentSpace = getCurrentSpace();
    const habits = currentSpace?.habits || [];
    const hTotal = habits.length;
    const hDone = habits.filter(h => h.completed).length;
    const isMobile = window.innerWidth <= 768;
    const habitCountHtml = (hTotal > 0 && !isMobile) 
        ? `<span style="font-size: 9px; font-weight: 700; margin-left: 4px; vertical-align: middle;">${hDone}/${hTotal}</span>` 
        : '';

    let habitStatusStyle = '';
    if (hTotal === 0) {
        habitStatusStyle = 'color: var(--text-muted); border: 1px solid var(--border-color); background: rgba(0,0,0,0.05);';
    } else if (hDone === 0) {
        habitStatusStyle = 'color: #ef4444; border: 1px solid #ef4444; background: rgba(239, 68, 68, 0.1);';
    } else if (hDone < hTotal) {
        habitStatusStyle = 'color: #d97706; border: 1px solid #f59e0b; background: rgba(245, 158, 11, 0.1);';
    } else {
        habitStatusStyle = 'color: #10b981; border: 1px solid #10b981; background: rgba(16, 185, 129, 0.1);';
    }

    // 1. Render Dashboard Wrapper
    container.innerHTML = `
        <div id="cc-minimized-row" class="minimized-widgets-bar">
            <button class="btn-icon btn-lock-widgets ${uiState.isLocked ? 'is-locked' : ''}" title="${uiState.isLocked ? 'Unlock Widgets' : 'Lock Widgets'}" style="margin-right: 10px; border: 1px solid ${uiState.isLocked ? '#ef4444' : 'var(--border-color)'}; color: ${uiState.isLocked ? '#ef4444' : 'inherit'};">
                <svg class="svg-icon-sm"><use href="${uiState.isLocked ? '#icon-lock-minimal' : '#icon-unlock-minimal'}"></use></svg>
            </button>
            <button class="btn-icon btn-dashboard-note-toggle" title="Dashboard Quick Note" style="margin-right: 10px; ${settings.dashboardQuickNote?.isOpen ? 'color: var(--primary-color); border: 1px solid var(--primary-color); background: rgba(47, 128, 237, 0.1);' : ''}">
                <svg class="svg-icon-sm"><use href="#icon-pencil"></use></svg>
            </button>
            <button class="btn-icon btn-habit-toggle" title="Habit Tracker" style="margin-right: 10px; width: auto; padding: 3px 6px; transition: all 0.3s ease; ${habitStatusStyle}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>
                ${habitCountHtml}
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

    // Habit Tracker Toggle
    const habitToggleBtn = container.querySelector('.btn-habit-toggle');
    if (habitToggleBtn) {
        habitToggleBtn.onclick = () => toggleHabitModal(getCurrentSpace());
    }

    // 3. Global Dashboard UI Updates
    updateKeepTagButtonState(); // อัปเดตสถานะปุ่ม Tag ทันทีที่เรนเดอร์
    
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
                <!-- Row 2: Calendar -->
                <div class="app-row">
                    <span class="app-label label-calendar">Calendar</span>
                    <div class="app-controls">
                        <button id="master-connect-calendar-btn" class="btn-icon app-btn" title="Connect Google Calendar"><svg class="svg-icon-sm" style="width:20px;height:20px;"><use href="#icon-calendar"></use></svg></button>
                    </div>
                </div>
            </div>
            <div style="width:1px; height:16px; background:var(--border-color); margin:0 4px;"></div>
        </div>
    `;
}
