import { getSpaces, getAppSettings, saveData, getFilterTags, getCurrentSpace, getCurrentSpaceId } from '../core/storage.js';
import { openNoteWebappInNewTab } from '../core/noteWebapp.js';
import { openNoteWebappPickWindow, resolveDefaultPickForSpaceId } from '../core/noteWebappPickBridge.js';
import { renderQuickNoteLinkBanner } from '../core/quickNoteWebLinkUi.js';
import { noteSpaceLinkReady } from '../features/noteWebappBridge.js';
import { updateKeepTagButtonState, openKeepWithTag } from './googleKeep.js';
import { renderMasterTodoList, renderMasterHeaderControls, initMasterEvents, masterTodoListState as commandCenterState } from './masterTodoList.js';
import { renderSmartFlow, initSmartFlow, flowState, showFocusPopup, formatFocusTime } from './smartFlow.js';
import { toggleDashboardQuickNote, renderDashboardQuickNote } from './dashboardQuickNote.js';
import { toggleHabitModal } from './habitSheet.js';
import Sortable from '../sortable.esm.js';

let ccWidgetStateCache = null; // 🟢 แคชสถานะ UI ไว้ในแรมเพื่อให้ทำงานเร็วขึ้น

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Space ที่ใช้เก็บ Quick Note บน Command Center — สอดคล้องกับ Master Quick Add / filter */
function getCommandCenterNoteSpace() {
    const allSpaces = getSpaces().filter(s => !s.isArchived);
    const pickId = commandCenterState.selectedQuickAddSpaceId ?? allSpaces[0]?.id;
    if (pickId == null) return null;
    return getSpaces().find(s => s.id === pickId) || null;
}

function setupCommandCenterQuickNote() {
    const toolbar = document.getElementById('cc-quick-note-toolbar');
    const noteEl = document.getElementById('cc-workspace-note');
    if (!noteEl) return;

    if (toolbar) {
        toolbar.querySelectorAll('button[data-cc-note-cmd]').forEach((btn) => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const cmd = btn.getAttribute('data-cc-note-cmd');
                if (cmd) document.execCommand(cmd, false, undefined);
            });
        });
    }

    const sp = getCommandCenterNoteSpace();
    const ccLinked = noteSpaceLinkReady(sp);
    const ccSuppressed = !!(sp?.quickNoteSuppressLocalEditor);
    if (!ccLinked && document.activeElement !== noteEl) {
        noteEl.innerHTML = ccSuppressed ? '' : sp?.note || '';
    }

    const persist = () => {
        const target = getCommandCenterNoteSpace();
        if (!target) return;
        target.note = noteEl.innerHTML;
        saveData();
    };
    noteEl.addEventListener('input', persist);
    noteEl.addEventListener('blur', persist);

    document.getElementById('cc-btn-open-note-webapp')?.addEventListener('click', () => openNoteWebappInNewTab());
    document.getElementById('cc-btn-pick-note')?.addEventListener('click', () =>
        openNoteWebappPickWindow({
            pickTarget: 'space',
            forSpaceId: resolveDefaultPickForSpaceId(),
        })
    );

    const ccBan = document.getElementById('cc-quick-note-link-banner');
    const ccSp = getCommandCenterNoteSpace();
    if (ccBan && ccSp) {
        renderQuickNoteLinkBanner(
            ccBan,
            ccSp,
            { pickTarget: 'space', forSpaceId: resolveDefaultPickForSpaceId() },
            {
                note: document.getElementById('cc-workspace-note'),
                toolbar: document.getElementById('cc-quick-note-toolbar'),
            }
        );
    }
}

function saveCommandCenterUiState(uiState) {
    const settings = getAppSettings();
    settings.commandCenterUiState = {
        minimized: Array.isArray(uiState.minimized) ? [...uiState.minimized] : [],
        order: Array.isArray(uiState.order) ? [...uiState.order] : ['todo', 'flow'],
        isLocked: !!uiState.isLocked,
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ ccWidgetState: uiState });
    } else {
        localStorage.setItem('ccWidgetState', JSON.stringify(uiState));
    }

    saveData();
}

export async function renderDefaultDashboard() {
    const container = document.getElementById('default-dashboard-container');
    if (!container) return;

    // 🟢 โหลดจาก Storage เฉพาะครั้งแรก ครั้งต่อไปอ่านจากแรมทันที
    if (!ccWidgetStateCache) {
        const syncedUiState = getAppSettings().commandCenterUiState;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const uiRes = await chrome.storage.local.get(['ccWidgetState']);
            ccWidgetStateCache = uiRes.ccWidgetState || syncedUiState || {
                minimized: [],
                order: ['todo', 'flow'],
                isLocked: false
            };
        } else {
            // Fallback สำหรับ Web/Mobile
            const saved = localStorage.getItem('ccWidgetState');
            ccWidgetStateCache = saved ? JSON.parse(saved) : (syncedUiState || {
                minimized: [],
                order: ['todo', 'flow'],
                isLocked: false
            });
        }
    }
    const uiState = ccWidgetStateCache;
    const isMinimized = (id) => uiState.minimized.includes(id);

    const allSpaces = getSpaces().filter(s => !s.isArchived);
    await initSmartFlow(); 
    const settings = getAppSettings();

    // 🟢 FIX: ในหน้า Command Center (Space 0) ให้คำนวณจาก Space ที่เลือกใน Quick Add Dropdown
    const sidForHabits = getCurrentSpaceId() === 0 
        ? (commandCenterState.selectedQuickAddSpaceId || (allSpaces.length > 0 ? allSpaces[0].id : null))
        : getCurrentSpaceId();
    
    const currentSpace = getSpaces().find(s => s.id === sidForHabits);
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

    // 🟢 Capture scroll positions RIGHT BEFORE innerHTML to prevent inaccuracies
    const dashScroll = container.scrollTop;
    const todoScroller = document.getElementById('master-todo-list-container');
    const todoScroll = todoScroller ? todoScroller.scrollTop : 0;
    const flowScroller = document.getElementById('smart-flow-container');
    const flowScroll = flowScroller ? flowScroller.scrollTop : 0;

    const ccNoteSpace = getCommandCenterNoteSpace();
    const ccNoteSpaceLabel = escapeHtml(ccNoteSpace?.name || '—');

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

        <div id="cc-quick-note-card" class="card" style="width:100%;margin-bottom:16px;padding:12px 16px;box-sizing:border-box;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-card);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
                <span class="section-label" style="margin:0;">Quick Notes</span>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:11px;color:var(--text-muted);">Space: ${ccNoteSpaceLabel}</span>
                    <button type="button" class="btn-icon" id="cc-btn-pick-note" title="เลือกโน้ตจาก LLM Wiki" style="color:var(--primary-color);">📎</button>
                    <button type="button" class="btn-icon" id="cc-btn-open-note-webapp" title="เปิด LLM Wiki Manager ในแท็บใหม่" style="color:var(--primary-color);">📝</button>
                </div>
            </div>
            <div id="cc-quick-note-link-banner" style="flex-shrink:0;margin-bottom:8px;"></div>
            <div id="cc-quick-note-toolbar" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
                <button type="button" class="btn-icon" data-cc-note-cmd="bold" title="Bold" style="font-weight:800;">B</button>
                <button type="button" class="btn-icon" data-cc-note-cmd="italic" title="Italic" style="font-style:italic;">I</button>
                <button type="button" class="btn-icon" data-cc-note-cmd="underline" title="Underline" style="text-decoration:underline;">U</button>
                <button type="button" class="btn-icon" data-cc-note-cmd="insertUnorderedList" title="Bullet list">•</button>
                <button type="button" class="btn-icon" data-cc-note-cmd="insertOrderedList" title="Numbered list">1.</button>
            </div>
            <div id="cc-workspace-note" contenteditable="true" spellcheck="true"
                style="min-height:180px;max-height:min(420px,50vh);overflow-y:auto;padding:10px 12px;font-family:var(--note-font);font-size:var(--app-font-size);line-height:1.55;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-card);outline:none;"></div>
        </div>

        <div id="cc-widget-grid" class="dashboard-grid-inner ${uiState.isLocked ? 'is-locked' : ''}">
            ${uiState.order.filter(id => !isMinimized(id)).map(id => {
                
                if (id === 'todo') {
                    return `
                        <div class="card widget-card master-todo-widget" data-id="todo">
                            <div class="card-header master-todo-card-header" style="display: flex; align-items: center; gap: 12px; padding: 10px 20px;">
                                <div id="master-header-controls-container" style="display: contents;">
                                    ${renderMasterHeaderControls()}
                                </div>
                                <button class="btn-icon btn-minimize-widget" data-id="todo" title="Minimize">
                                    <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                </button>
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
            saveCommandCenterUiState(uiState);
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
            saveFlow().then(() => renderDefaultDashboard());
        };
    });

    container.querySelectorAll('.minimized-bubble').forEach(bub => {
        bub.onclick = () => {
            const id = bub.dataset.id;
            uiState.minimized = uiState.minimized.filter(m => m !== id);
            saveCommandCenterUiState(uiState);
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
                saveCommandCenterUiState(uiState);
            }
        });
    }

    // Toggle Layout Lock
    const lockBtn = container.querySelector('.btn-lock-widgets');
    if (lockBtn) {
        lockBtn.onclick = () => {
            uiState.isLocked = !uiState.isLocked;
            saveCommandCenterUiState(uiState);
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
        habitToggleBtn.onclick = () => {
            let space = getCurrentSpace();
            if (!space) {
                const sid = commandCenterState.selectedQuickAddSpaceId || (getSpaces().length > 0 ? getSpaces()[0].id : null);
                space = getSpaces().find(s => s.id === sid);
            }
            if (space) toggleHabitModal(space);
        };
    }

    // 3. Global Dashboard UI Updates
    updateKeepTagButtonState(); // อัปเดตสถานะปุ่ม Tag ทันทีที่เรนเดอร์
    
    // Attached to window for masterTodoList.js callbacks
    window.renderDefaultDashboard = renderDefaultDashboard;
    initMasterEvents(); // 🟢 สั่งรัน Event Listeners หลังจากวาดหน้าจอเสร็จ

    // 🟢 Robust Scroll Restoration
    const restoreScrolls = () => {
        const newDash = document.getElementById('default-dashboard-container');
        if (newDash) newDash.scrollTop = dashScroll;
        
        const newTodo = document.getElementById('master-todo-list-container');
        if (newTodo) newTodo.scrollTop = todoScroll;
        
        const newFlow = document.getElementById('smart-flow-container');
        if (newFlow) newFlow.scrollTop = flowScroll;
    };

    restoreScrolls(); // Sync restore
    requestAnimationFrame(restoreScrolls); // Async backup for DOM flow

    setupCommandCenterQuickNote();
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
                    <span class="app-label" style="color:var(--primary-color);">Note webapp</span>
                    <div class="app-controls">
                        <button type="button" id="master-btn-open-keep" class="btn-icon app-btn" title="เปิด Note webapp ในแท็บใหม่" style="color:var(--primary-color);">📝</button>
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
