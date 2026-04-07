import { getSpaces, saveData, getAppSettings, getCurrentSpace } from '../core/storage.js';
import Sortable from '../sortable.esm.js';
import { renderSidebar } from '../components/sidebar.js';
import { svgArchive, svgUnarchive, svgTrashRed } from '../core/icons.js';
import { handleTagAutocomplete, applySyntaxHighlighting } from '../core/ui-helpers.js';

const svgMenu = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;

function playStepStartSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
}

/**
 * State Manager for Smart Flow
 */
let flowItems = [];
export const getFlowItems = () => flowItems;
let editingFlowItemId = null;
let refreshInterval = null;
let isCreatingNewStep = false; // 🟢 ตัวเช็คว่ากำลังสร้าง Step ใหม่ (เพื่อใช้ลบออกหากกดยกเลิก)
let isFlowDataLoaded = false; // 🟢 ตัวเช็คสถานะการโหลด
let editingFlowItemTags = []; // ตัวแปรชั่วคราวสำหรับเก็บ Tag ที่เลือกใน Modal
let confirmingFlowItemId = null; // 🟢 สำหรับจำว่างานไหนกำลังอยู่ในโหมดเลือกผลลัพธ์

/**
 * State for Smart Flow UI
 */
export const flowState = {
    showActions: false,
    hideCompleted: false,
    hideLocked: false,
    activeMenuId: null, // เพิ่มเพื่อจำว่าเมนูของแถวไหนกำลังเปิดอยู่
    showOnlyToday: false, // เพิ่มตัวกรองงานของวันนี้
    focusMode: false,      // เปิด/ปิดโหมด Focus
    focusTimeLeft: 0,     // เวลาที่เหลือ (วินาที)
    isFocusRunning: false, // สถานะการวิ่งของตัวจับเวลา
    isPaused: false,       // สถานะหยุดเวลาชั่วคราว
    currentFilterTags: [], // ป้ายกำกับที่กำลังกรอง
    currentFilterMode: 'OR', // โหมดการกรอง OR หรือ AND
    isSingleSelectMode: false, // โหมดการเลือกป้ายเดียวหรือหลายป้าย
    areTagsVisible: true,   // ซ่อน/แสดงแถบป้ายกำกับ
    managedTags: [],        // 🟢 รายการป้ายกำกับทั้งหมดที่ระบบจำไว้
    focusPopupState: {      // 🟢 สถานะของ Focus Popup ที่ลอยอยู่
        isOpen: false, // 🟢 สถานะของ Focus Popup ที่ลอยอยู่
        isMinimized: false,
        x: 100,
        y: 100,
        w: 250,
        h: 150,
        collapsed: false
    },
    postConfirmPopupState: { // 🟢 สถานะของ Post-Transition Confirm Popup
        isMinimized: false,
        x: 100,
        y: 100,
        w: 250,
        h: 150,
        collapsed: false
    }
};

/**
 * 🟢 Render Focus Persistent Popup (ลอยอยู่เหนือทุก Space)
 * ย้ายขึ้นมาด้านบนเพื่อให้แน่ใจว่าถูกนิยามก่อนเรียกใช้
 */
export function renderFocusPersistentPopup() {
    const settings = getAppSettings();
    const state = flowState.focusPopupState;
    const isFocusActive = flowState.focusMode && flowState.isFocusRunning;

    let el = document.getElementById('sf-focus-persistent-popup');

    if (!state?.isOpen || flowState.focusTimeLeft <= 0 || !isFocusActive) {
        if (el) el.remove();
        return;
    }

    if (!el) {
        el = document.createElement('div');
        el.id = 'sf-focus-persistent-popup';
        el.className = 'sf-focus-popup-persistent';
        document.body.appendChild(el);
    }

    const isMinimized = !!state.isMinimized;
    const wasMinimized = el.getAttribute('data-minimized') === 'true';

    // 🟢 FIX Content Swap: จัดการสลับ HTML ระหว่างโหมด Full และ Dot
    if (wasMinimized !== isMinimized || !el.innerHTML.trim()) {
        el.setAttribute('data-minimized', isMinimized);
        el.classList.toggle('is-minimized', isMinimized);

        if (isMinimized) {
            el.innerHTML = `
                <div id="sf-focus-dot-container" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                    <div class="sf-dot-core" style="width:14px; height:14px; border-radius:50%; transition: all 0.3s ease;"></div>
                </div>`;
            el.onclick = () => {
                state.isMinimized = false;
                saveFlow().then(renderFocusPersistentPopup);
            };
        } else {
            el.onclick = null;
            el.innerHTML = `
                <div id="sf-focus-popup-header" style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:10px 12px; background:rgba(255,255,255,0.05); cursor:grab; box-sizing:border-box; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span id="sf-watch-status" style="font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#10b981; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Focusing</span>
                    <div style="display:flex; gap:8px; align-items:center; margin-left:10px;">
                        <button class="btn-icon" id="sf-focus-popup-pause-resume" style="color:white; opacity:0.5; padding:2px; transform:scale(0.8);"></button>
                        <button class="btn-icon" id="sf-focus-popup-minimize" title="Minimize" style="color:white; opacity:0.5; padding:2px; transform:scale(0.8);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                        <button class="btn-icon" id="sf-focus-popup-close" style="color:white; opacity:0.5; padding:2px; transform:scale(0.8);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                    </div>
                </div>
                <div style="padding:15px; text-align:center; width:100%; box-sizing:border-box;">
                    <div class="focus-time-display" id="sf-watch-time" style="font-size:48px; font-weight:700; color:#10b981; line-height:1;">00:00</div>
                    <div id="sf-watch-progress-bar" style="width:100%; height:3px; background:rgba(255,255,255,0.1); border-radius:2px; margin-top:12px; overflow:hidden;">
                        <div id="sf-watch-progress-fill" style="width:0%; height:100%; background:#10b981; transition:width 1s linear;"></div>
                    </div>
                </div>
            `;

            // Bind Listeners
            el.querySelector('#sf-focus-popup-close').onclick = (e) => {
                e.stopPropagation();
                flowState.focusMode = false; flowState.isFocusRunning = false; flowState.focusTimeLeft = 0; state.isOpen = false;
                saveFlow().then(() => { if (window.handleSpaceChange) window.handleSpaceChange(0, false); });
            };
            el.querySelector('#sf-focus-popup-pause-resume').onclick = (e) => {
                e.stopPropagation();
                flowState.isPaused = !flowState.isPaused;
                if (!flowState.isPaused) {
                    // เมื่อกลับมาทำงานต่อ ให้เลื่อนเวลาสิ้นสุดออกไปตามเวลาที่เหลือ
                    flowState.focusEndTime = Date.now() + (flowState.focusTimeLeft * 1000);
                }
                saveFlow();
            };
            el.querySelector('#sf-focus-popup-minimize').onclick = (e) => {
                e.stopPropagation();
                state.isMinimized = true;
                saveFlow().then(renderFocusPersistentPopup);
            };
        }
        setupFocusPopupDrag(el);
    }

    // 🟢 Selective Update: อัปเดตเฉพาะข้อมูลภายใน ไม่ทำลาย Element (แก้บัคลากไม่ได้)
    const isPaused = flowState.isPaused;
    const isCritical = (flowState.focusTimeLeft > 0 && flowState.focusTimeLeft <= 60 && !isPaused);
    
    let timeText = isPaused ? 'PAUSED' : formatFocusTime(flowState.focusTimeLeft);
    if (!isPaused && flowState.focusStartTime && flowState.focusEndTime && flowState.focusTimeLeft >= 0) {
        timeText = `${formatFocusClock(flowState.focusStartTime)} - ${formatFocusClock(flowState.focusEndTime)} (${formatFocusTime(flowState.focusTimeLeft)})`;
    }

    const statusColor = isPaused ? '#f59e0b' : (isCritical ? '#ef4444' : '#10b981');

    // 🟢 ป้องกันการ Snap Back: อัปเดตพิกัดเฉพาะเมื่อไม่ได้กำลังลากอยู่
    if (!el.classList.contains('is-dragging')) {
        el.style.left = `${state.x}px`;
        el.style.top = `${state.y}px`;
    }

    if (isMinimized) {
        const dot = el.querySelector('.sf-dot-core');
        if (dot) {
            dot.style.background = statusColor;
            dot.style.boxShadow = `0 0 12px ${statusColor}`;
        }
        return;
    }

    el.classList.toggle('critical', isCritical);

    const timeEl = el.querySelector('#sf-watch-time');
    const statusEl = el.querySelector('#sf-watch-status');
    const pauseBtn = el.querySelector('#sf-focus-popup-pause-resume');
    const progressFill = el.querySelector('#sf-watch-progress-fill');

    if (timeEl) {
        timeEl.innerText = timeText;
        timeEl.style.color = statusColor;
        timeEl.style.fontSize = isPaused ? '24px' : (timeText.includes('-') ? '28px' : '42px');
    }
    if (statusEl) {
        statusEl.innerText = isPaused ? 'PAUSED' : (isCritical ? 'FINISHING...' : 'FOCUSING');
        statusEl.style.color = statusColor;
    }
    if (pauseBtn) {
        pauseBtn.innerHTML = isPaused 
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    }
    if (progressFill) {
        const total = 25 * 60; 
        const percent = (flowState.focusTimeLeft / total) * 100;
        progressFill.style.width = `${percent}%`;
        progressFill.style.background = statusColor;
    }
}

function formatFocusClock(timestamp) {
    const d = new Date(timestamp);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function setupFocusPopupDrag(el) {
    const isMinimized = el.getAttribute('data-minimized') === 'true';
    const header = el.querySelector('#sf-focus-popup-header');
    const handle = isMinimized ? el : header;
    
    if (!handle) return;

    let isDragging = false;
    let offset = { x: 0, y: 0 };

    const onMouseDown = (e) => {
        if (e.target.closest('button')) return;
        isDragging = true;
        el.classList.add('is-dragging'); // 🟢 เพิ่ม class เพื่อบอกสถานะการลาก
        const rect = el.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;
        document.body.style.userSelect = 'none';
        el.style.transition = 'none';
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => { // 🟢 ย้ายฟังก์ชันมาไว้ในนี้
        if (!isDragging) return;
        const newX = e.clientX - offset.x;
        const newY = e.clientY - offset.y;
        el.style.left = `${newX}px`;
        el.style.top = `${newY}px`;
        
        // 🟢 อัปเดตพิกัดลงใน state ทันทีเพื่อป้องกันการ snap back ตอนอัปเดตเวลารายวินาที
        flowState.focusPopupState.x = newX;
        flowState.focusPopupState.y = newY;
    };

    const onMouseUp = () => { // 🟢 ย้ายฟังก์ชันมาไว้ในนี้
        if (isDragging) {
            isDragging = false;
            el.classList.remove('is-dragging');
            document.body.style.userSelect = '';
            el.style.transition = 'all 0.2s ease';
            
            const rect = el.getBoundingClientRect();
            
            // 🟢 อัปเดตทั้งใน State และ Settings
            flowState.focusPopupState.x = rect.left;
            flowState.focusPopupState.y = rect.top;
            getAppSettings().focusPopupState = { ...flowState.focusPopupState };
            
            saveFlow();

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    };

    header.addEventListener('mousedown', onMouseDown);
}

export async function initSmartFlow() {
    if (isFlowDataLoaded) return; // 🟢 ถ้ามีข้อมูลในแรมแล้ว ให้ข้ามการดึงจาก Storage ไปเลย
    let res;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        res = await chrome.storage.local.get(['smartFlowItems', 'smartFlowTags', 'smartFlowFocusTimer']);
    } else {
        res = {
            smartFlowItems: JSON.parse(localStorage.getItem('smartFlowItems') || '[]'),
            smartFlowTags: JSON.parse(localStorage.getItem('smartFlowTags') || '[]'),
            smartFlowFocusTimer: JSON.parse(localStorage.getItem('smartFlowFocusTimer') || 'null')
        };
    }

    flowItems = res.smartFlowItems || [];
    flowState.managedTags = res.smartFlowTags || [];
    const appSettings = getAppSettings();
    flowState.focusPopupState = appSettings.focusPopupState || flowState.focusPopupState;

    flowState.postConfirmPopupState = appSettings.postConfirmPopupState || { x: 0, y: 0, isLocked: false }; // NEW: Load postConfirmPopupState
    // 🟢 โหลดสถานะตัวจับเวลาที่ค้างไว้
    if (res.smartFlowFocusTimer) {
        flowState.focusMode = res.smartFlowFocusTimer.focusMode;
        flowState.isFocusRunning = res.smartFlowFocusTimer.isFocusRunning;
        flowState.focusTimeLeft = res.smartFlowFocusTimer.focusTimeLeft;
        flowState.focusStartTime = res.smartFlowFocusTimer.focusStartTime;
        flowState.focusEndTime = res.smartFlowFocusTimer.focusEndTime;
        flowState.isPaused = res.smartFlowFocusTimer.isPaused;
    }

    initSmartFlowSettingsModal(); // Initialize the settings modal once
    initSmartFlowDependenciesModal(); // Initialize the dependencies modal
    isFlowDataLoaded = true;
}

export async function saveFlow() {
    const data = {
        'smartFlowItems': flowItems,
        'smartFlowTags': flowState.managedTags,
        'appSettings': { ...getAppSettings(), focusPopupState: flowState.focusPopupState },
        'smartFlowFocusTimer': {
            focusMode: flowState.focusMode,
            isFocusRunning: flowState.isFocusRunning,
            focusTimeLeft: flowState.focusTimeLeft,
            focusStartTime: flowState.focusStartTime,
            focusEndTime: flowState.focusEndTime,
            isPaused: flowState.isPaused
        }
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set(data);
    } else {
        Object.keys(data).forEach(key => localStorage.setItem(key, JSON.stringify(data[key])));
    }
}

/**
 * 🔄 ตรวจสอบและรีเซ็ตสถานะ Completed สำหรับงานที่ทำซ้ำได้ (Repeatable)
 * เพื่อให้งานกลับมาพร้อมให้กดได้ใหม่ในวันถัดไปโดยไม่ต้องกด Uncheck เอง
 */
function checkAndResetFlowItems() {
    let hasChanged = false;
    flowItems.forEach(item => {
        if (item.isCompleted && item.repeatConfig?.enabled) {
            if (isRepeatMet(item)) {
                item.isCompleted = false;
                hasChanged = true;
            }
        }
    });
    if (hasChanged) saveFlow();
}

/**
 * Main Export: Renders the Smart Flow section
 */
export function renderSmartFlow(container) {
    if (!container) return;
    
    // Create basic structure if not exists
    container.innerHTML = `
        <div class="smart-flow-header">
            <span class="section-label" style="margin:0; white-space: nowrap; flex-shrink: 1; overflow: hidden; text-overflow: ellipsis;">Smart Flow</span>
            <div class="sf-header-actions">
                <button class="btn btn-outline ${flowState.showOnlyToday ? 'active' : ''}" id="sf-btn-today-filter" title="Show Today's Tasks" style="font-size: 11px; padding: 2px 8px; gap: 4px; flex-shrink: 0;">
                    <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span>Today</span>
                </button>
                <div style="position: relative; display: flex; align-items: center; flex-shrink: 0;">
                    <button class="btn btn-outline" id="sf-btn-view-toggle" title="View Options" style="font-size: 11px; padding: 2px 8px; gap: 4px;">
                        <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        <span>View</span>
                    </button>
                    <div id="sf-view-popup" class="dropdown-menu" style="display: none; top: 110%; right: 0; min-width: 160px; padding: 10px; flex-direction: column; gap: 4px;">
                        <label class="tag-select-row" style="padding: 4px 8px; cursor: pointer; margin: 0;">
                            <label class="google-task-checkbox">
                                <input type="checkbox" class="sf-view-opt" data-prop="hideCompleted" ${flowState.hideCompleted ? 'checked' : ''}>
                                <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div>
                            </label>
                            <span style="font-size: 13px; font-weight: 600; margin-left: 8px;">Hide Done</span>
                        </label>
                        <label class="tag-select-row" style="padding: 4px 8px; cursor: pointer; margin: 0;">
                            <label class="google-task-checkbox">
                                <input type="checkbox" class="sf-view-opt" data-prop="hideLocked" ${flowState.hideLocked ? 'checked' : ''}>
                                <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div>
                            </label>
                            <span style="font-size: 13px; font-weight: 600; margin-left: 8px;">Hide Locked</span>
                        </label>
                    </div>
                </div>
                <button class="btn btn-outline" id="btn-add-flow-item" style="padding: 2px 8px; font-size: 11px; flex-shrink: 0; gap: 4px;">
                    <svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span>New Step</span>
                </button>
            </div>
        </div>
        <div style="height: 1px; background: var(--border-color); margin: 8px 0; opacity: 0.5;"></div>
        
        <div id="sf-tag-bar-container" class="tag-bar" style="padding: 5px 0; min-height: auto; gap: 8px;"></div>

        <div style="position: relative;">
            <ul id="smart-flow-list" class="smart-flow-list"></ul>
            <div id="sf-focus-overlay-wrapper">
                ${flowState.focusMode && !flowState.isFocusRunning ? renderFocusOverlayHtml() : ''} 
            </div>
        </div>

        <details id="sf-archived-container" style="margin-top: 15px; display: none;">
            <summary class="section-label details-summary" style="margin:0; padding:5px 0; border:none; cursor:pointer; justify-content: flex-start;">
                <svg class="svg-icon-sm summary-chevron" style="margin-right:5px;"><use href="#icon-chevron-right"></use></svg>
                <span>Archived Steps</span>
            </summary>
            <ul id="smart-flow-archived-list" class="smart-flow-list"></ul>
        </details>
    `;

    renderSmartFlowTagBar();
    renderFlowList();

    // Today Filter Toggle
    const todayBtn = container.querySelector('#sf-btn-today-filter');
    if (todayBtn) {
        todayBtn.onclick = () => {
            flowState.showOnlyToday = !flowState.showOnlyToday;
            renderSmartFlow(container);
        };
    }

    // ระบบ Auto-Refresh ทุกวินาทีเพื่อให้ตัวเลข Countdown เดิน
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        const list = document.getElementById('smart-flow-list');
        if (list) {
            updateFlowTimers(); // อัปเดตเฉพาะเวลา แทนการวาดใหม่ทั้งหมด
        } else {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }, 1000);

    // View Popup Toggle
    const viewBtn = container.querySelector('#sf-btn-view-toggle');
    const viewPopup = container.querySelector('#sf-view-popup');
    if (viewBtn && viewPopup) {
        viewBtn.onclick = (e) => {
            e.stopPropagation();
            viewPopup.style.display = viewPopup.style.display === 'none' ? 'flex' : 'none';
        };
        document.addEventListener('click', (e) => {
            if (!viewPopup.contains(e.target) && e.target !== viewBtn) viewPopup.style.display = 'none';
        });
    }

    // View Options Checkboxes
    container.querySelectorAll('.sf-view-opt').forEach(cb => {
        cb.onchange = () => {
            flowState[cb.dataset.prop] = cb.checked;
            renderSmartFlow(container); // Re-render whole section
        };
    });
    renderFocusPersistentPopup(); // 🟢 Render persistent popup on dashboard load

    document.getElementById('btn-add-flow-item').onclick = () => {
        const newItem = {
            id: 'flow-' + Date.now(),
            title: "New Workflow Step",
            description: "Click settings to link a space",
            linkedSpaceId: null,
            focusConfig: { enabled: false, minutes: 25 },
            habitConfig: { enabled: false }, // 🟢 เพิ่มการตั้งค่า Habit Tracker
            scheduleConfig: { enabled: false, days: [], hour: 9, min: 0 },
            repeatConfig: { enabled: true, interval: 1, lastCompletedDate: null }, // 🟢 Default ให้เปิด Repeat 1 วันไว้เลย
            dependencies: [],
            isCompleted: false
        };
        flowItems.push(newItem);
        isCreatingNewStep = true; // 🟢 มาร์คว่าเป็นการสร้างใหม่
        saveFlow().then(() => {
            renderFlowList();
            openSmartFlowSettingsModal(newItem.id); // เปิดหน้าต่างตั้งค่าทันทีหลังสร้าง
        });
    };
}

/**
 * 🏷️ เรนเดอร์แถบป้ายกำกับของ Smart Flow (ถอดแบบมาจาก Space)
 */
function renderSmartFlowTagBar() {
    const container = document.getElementById('sf-tag-bar-container');
    if (!container) return;

    // 🟢 ดึงการตั้งค่าแยกตาม Space (Dashboard ใช้ appSettings)
    const space = getCurrentSpace();
    const settings = getAppSettings();
    const targetStore = space || settings;

    const isSingle = targetStore.sfIsSingleSelectMode ?? flowState.isSingleSelectMode;
    const filterMode = targetStore.sfCurrentFilterMode ?? flowState.currentFilterMode;
    const isLocked = !!targetStore.sfIsTagModeLocked;

    // 🟢 1. ตรวจสอบให้แน่ใจว่า Managed Tags มีป้ายจากงานทั้งหมด (รักษาลำดับเดิม)
    flowItems.forEach(item => {
        (item.tags || []).forEach(tag => {
            if (!flowState.managedTags.some(t => t.toUpperCase() === tag.toUpperCase())) {
                flowState.managedTags.push(tag);
            }
        });
    });
    const tagsToDisplay = flowState.managedTags; // 🟢 ใช้ลำดับตาม managedTags แทนการเรียง A-Z เสมอ

    container.innerHTML = `
        <button class="btn-icon" id="sf-tag-visibility-toggle" title="${flowState.areTagsVisible ? 'Hide Tags' : 'Show Tags'}" style="padding: 2px;">
            <svg class="svg-icon-sm" style="transform: ${flowState.areTagsVisible ? 'rotate(0deg)' : 'rotate(-90deg)'}; transition: transform 0.2s;"><use href="#icon-chevron-down"></use></svg>
        </button>
        <div id="sf-tags-wrapper" style="display: ${flowState.areTagsVisible ? 'flex' : 'none'}; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 4px; background: var(--bg-body); padding: 2px 6px; border-radius: 8px; border: 1px solid var(--border-color);">
                <button class="btn-icon" id="sf-btn-tag-lock" title="${isLocked ? 'Unlock Settings' : 'Lock Settings'}" style="padding: 2px; color: ${isLocked ? '#ef4444' : '#10b981'}; opacity: ${isLocked ? '1' : '0.4'};">
                    <svg class="svg-icon-sm"><use href="#icon-${isLocked ? 'lock-minimal' : 'unlock-minimal'}"></use></svg>
                </button>
                <button class="btn-tag-mode" id="sf-btn-tag-select-mode" style="padding: 2px 8px; font-size: 10px; border-radius: 4px; font-weight: 700; background: ${isSingle ? '#f3e8ff' : '#dcfce7'}; color: ${isSingle ? '#6b21a8' : '#166534'}; border: 1px solid ${isSingle ? '#6b21a8' : '#166534'}; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; opacity: ${isLocked ? '0.7' : '1'};">
                    ${isSingle ? 'Single' : 'Multi'}
                </button>
                <button class="btn-tag-mode" id="sf-btn-tag-filter-mode" style="padding: 2px 8px; font-size: 10px; border-radius: 4px; font-weight: 700; background: ${filterMode === 'OR' ? '#e3f2fd' : '#ffebee'}; color: ${filterMode === 'OR' ? '#0b6e99' : '#991b1b'}; border: 1px solid ${filterMode === 'OR' ? '#0b6e99' : '#991b1b'}; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; opacity: ${isLocked ? '0.7' : '1'};">
                    ${filterMode}
                </button>
            </div>
            <div style="width: 1px; height: 14px; background: var(--border-color); margin: 0 4px;"></div>
            <div style="display:flex; align-items:center; gap:4px;">
                <div class="tag-pill ${flowState.currentFilterTags.length === 0 ? 'active' : ''}" data-tag="ALL">All</div>
                <button class="btn-icon" id="sf-btn-add-tag-global" title="Add New Tag" style="padding: 2px; border: 1px dashed var(--border-color); border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: var(--text-muted);">+</button>
            </div>
            <div class="tag-pill ${flowState.currentFilterTags.includes('UNTAGGED') ? 'active' : ''}" data-tag="UNTAGGED">🚫 No Tag</div>
            <div id="sf-draggable-tags" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                ${tagsToDisplay.map(tag => `
                    <div class="tag-pill ${flowState.currentFilterTags.includes(tag) ? 'active' : ''}" data-tag="${tag}" style="cursor: grab;">
                        <span>${tag}</span>
                        <button class="btn-icon sf-tag-menu-btn" style="margin-left:5px; opacity:0.5; display:flex;">${svgMenu}</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // 🟢 ปิดเมนู Tag Context Menu เมื่อคลิกที่อื่น
    document.removeEventListener('click', closeSfTagContextMenu);
    document.addEventListener('click', closeSfTagContextMenu);
    
    // Events
    const addTagBtn = container.querySelector('#sf-btn-add-tag-global');
    if (addTagBtn) {
        addTagBtn.onclick = (e) => {
            e.stopPropagation();
            showSfAddTagPopup(addTagBtn);
        };
    }

    container.querySelector('#sf-tag-visibility-toggle').onclick = () => {
        flowState.areTagsVisible = !flowState.areTagsVisible;
        renderSmartFlowTagBar();
    };

    container.querySelector('#sf-btn-tag-lock').onclick = (e) => {
        e.stopPropagation();
        const target = getCurrentSpace() || getAppSettings();
        target.sfIsTagModeLocked = !target.sfIsTagModeLocked;
        saveData();
        renderSmartFlowTagBar();
    };

    container.querySelector('#sf-btn-tag-select-mode').onclick = () => {
        const target = getCurrentSpace() || getAppSettings();
        if (target.sfIsTagModeLocked) return; // 🔒 ตรวจสอบการล็อค

        const newVal = !(target.sfIsSingleSelectMode ?? flowState.isSingleSelectMode);
        target.sfIsSingleSelectMode = newVal;
        
        if (newVal && flowState.currentFilterTags.length > 1) flowState.currentFilterTags = [flowState.currentFilterTags[0]];
        saveData();
        renderSmartFlowTagBar();
        renderFlowList();
    };

    container.querySelector('#sf-btn-tag-filter-mode').onclick = () => {
        const target = getCurrentSpace() || getAppSettings();
        if (target.sfIsTagModeLocked) return; // 🔒 ตรวจสอบการล็อค

        const current = target.sfCurrentFilterMode ?? flowState.currentFilterMode;
        target.sfCurrentFilterMode = (current === 'OR' ? 'AND' : 'OR');
        saveData();
        renderSmartFlowTagBar();
        renderFlowList();
    };

    container.querySelectorAll('.tag-pill').forEach(pill => {
        pill.onclick = () => {
            const tag = pill.dataset.tag;
            if (tag === 'ALL') {
                flowState.currentFilterTags = [];
            } else {
                const idx = flowState.currentFilterTags.indexOf(tag);
                if (flowState.isSingleSelectMode) {
                    flowState.currentFilterTags = (idx > -1) ? [] : [tag];
                } else {
                    if (idx > -1) flowState.currentFilterTags.splice(idx, 1);
                    else flowState.currentFilterTags.push(tag);
                }
            }
            renderSmartFlowTagBar();
            renderFlowList();
        };
        
        // 🟢 ปุ่มเมนู (Context Menu) - ตรวจสอบก่อนว่าป้ายนี้มีปุ่มเมนูหรือไม่ (เฉพาะป้ายที่แก้ไขได้)
        const menuBtn = pill.querySelector('.sf-tag-menu-btn');
        if (menuBtn) {
            menuBtn.onclick = (e) => {
                e.stopPropagation(); // ป้องกันไม่ให้ไปกดโดนตัวป้าย (Pill)
                showSfTagContextMenu(e, pill.dataset.tag);
            };
        }
    });

    // 🟢 2. เปิดใช้งานการลากวาง (Sortable) สำหรับป้ายกำกับ
    const draggableContainer = container.querySelector('#sf-draggable-tags');
    if (draggableContainer) {
        Sortable.create(draggableContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                const newOrder = Array.from(draggableContainer.querySelectorAll('.tag-pill')).map(el => el.dataset.tag);
                flowState.managedTags = newOrder;
                saveFlow(); // บันทึกลำดับใหม่ลง Storage
            }
        });
    }
}

function renderFlowList() {
    const listEl = document.getElementById('smart-flow-list');
    const archivedListEl = document.getElementById('smart-flow-archived-list');
    const archivedContainer = document.getElementById('sf-archived-container');
    if (!listEl) return;

    checkAndResetFlowItems(); // 🟢 รีเซ็ตสถานะก่อนวาดรายการ

    // ID to Index mapping for dependency display
    const idToNumMap = {};
    flowItems.forEach((item, idx) => idToNumMap[item.id] = idx + 1);

    // 🟢 ดึงค่า Filter Mode จาก Space ปัจจุบัน
    const targetStore = getCurrentSpace() || getAppSettings();
    const filterMode = targetStore.sfCurrentFilterMode ?? flowState.currentFilterMode;

    // เตรียมข้อมูลและกรองรายการตาม State
    const itemsToRender = flowItems.map((item, index) => {
        const depsMet = checkDependencies(item);
        const schedMet = isScheduleMet(item);
        const repeatMet = isRepeatMet(item);
        const canExecute = depsMet && schedMet && repeatMet;
        const isLocked = !canExecute && !item.isCompleted;
        const isExpanded = flowState.showActions || flowState.activeMenuId === item.id;
        return { item, index, depsMet, schedMet, repeatMet, canExecute, isLocked, isExpanded };
    }).filter(wrapped => {
        if (wrapped.item.isArchived) return false;
        if (flowState.hideCompleted && wrapped.item.isCompleted) return false;
        if (flowState.hideLocked && wrapped.isLocked) return false;
        // 🟢 กรองออกเฉพาะงานที่ถูกตั้งเวลาไว้วันอื่น (ที่ไม่ใช่วันนี้)
        if (flowState.showOnlyToday) {
            const today = new Date().getDay();
            const config = wrapped.item.scheduleConfig;
            // ถ้าเปิดใช้งาน Schedule และ "วันนี้" ไม่ได้อยู่ในรายการวันที่เลือก -> ให้ซ่อนงานนี้ไป
            if (config?.enabled && config.days && config.days.length > 0 && !config.days.includes(today)) {
                return false;
            }
        }

        // 🟢 แก้ไข: เพิ่มการกรองชั้นสุดท้ายด้วยป้ายกำกับ (Tags)
        if (flowState.currentFilterTags.length > 0) {
            const itemTags = (wrapped.item.tags || []).map(t => t.toUpperCase());
            const checkMatch = (tag) => {
                if (tag === 'UNTAGGED') return itemTags.length === 0;
                return itemTags.includes(tag.toUpperCase());
            };

            if (filterMode === 'AND') {
                if (!flowState.currentFilterTags.every(checkMatch)) return false;
            } else {
                if (!flowState.currentFilterTags.some(checkMatch)) return false;
            }
        }

        return true;
    });

    listEl.innerHTML = itemsToRender.map(({ item, index, depsMet, schedMet, repeatMet, canExecute, isLocked, isExpanded }) => {
        const rowNum = index + 1;
        const completedClass = item.isCompleted ? 'completed' : '';
        const failedClass = (item.isCompleted && item.isFailed) ? 'failed' : ''; // 🟢 เพิ่มตัวแปรเช็คสถานะล้มเหลว
        const linkedClass = item.linkedSpaceId ? 'sf-linked-step' : ''; // 🟢 เพิ่ม class สำหรับ step ที่มีลิงก์
        const lockedClass = isLocked ? 'sf-locked' : '';
        const countdownText = !schedMet && !item.isCompleted ? getScheduleCountdown(item) : "";
        const repeatCountdownText = !repeatMet && item.isCompleted ? getRepeatCountdown(item) : "";
        let disabledReason = "";
        if (!depsMet) disabledReason = "Complete previous steps first";
        else if (!schedMet) disabledReason = "Not yet time for this step";

        const isConfirming = confirmingFlowItemId === item.id;
        let actionBtnHtml = '';
        if (item.isCompleted) {
            // 🟢 แสดงไอคอนตามผลลัพธ์ (✔ หรือ ✖)
            const isFailed = item.isFailed;
            const icon = isFailed ? cancelIcon() : checkIcon();
            const extraStyle = isFailed ? 'background:rgba(239, 68, 68, 0.1); color:#ef4444; border-color:#ef4444;' : '';
            actionBtnHtml = `<button class="smart-flow-action-btn" data-id="${item.id}" style="${extraStyle}">${icon}</button>`;
        } else if (isConfirming) {
            actionBtnHtml = `
                <div class="sf-confirm-group" style="display:flex; gap:4px;">
                    <button class="smart-flow-action-btn sf-btn-success" data-id="${item.id}" title="Success (Claim Rewards)" style="background:#10b981; color:white; border-color:#10b981;">${checkIcon()}</button>
                    <button class="smart-flow-action-btn sf-btn-fail" data-id="${item.id}" title="Failed (No Rewards)" style="background:rgba(239, 68, 68, 0.1); color:#ef4444; border-color:#ef4444;">${cancelIcon()}</button>
                </div>
            `;
        } else {
            actionBtnHtml = `
                <button class="smart-flow-action-btn" 
                    ${!canExecute ? `data-locked="true" title="${disabledReason}" style="opacity:0.3; cursor:not-allowed; filter:grayscale(1);"` : ''}
                    data-id="${item.id}">
                    ${playIcon()}
                </button>
            `;
        }

        // 🟢 Requirement 2: ป้าย Habit Tracker สวยๆ
        const habitBadge = (item.habitConfig && item.habitConfig.enabled) ? `<span class="sf-habit-indicator-badge">H</span>` : '';

        // 🟢 เพิ่มป้าย Focus Mode สวยๆ
        const focusBadge = (item.focusConfig && item.focusConfig.enabled) ? `<span class="sf-focus-indicator-badge">F${item.focusConfig.minutes || 25}</span>` : '';

        // 🟢 ล้างข้อความส่วนเกินออกจาก Description เนื่องจากมี Badge แสดงผลแล้ว
        let displayDesc = (item.description || "")
            .replace(/ • \+Habit Tracker/g, '')
            .replace(/\+Habit Tracker/g, '')
            .replace(/ • \+Focus Mode/g, '')
            .replace(/\+Focus Mode/g, '')
            .replace(/ • \d+m Focus/gi, '')
            .replace(/ • Repeat every 1 days/g, '')
            .trim();

        // 🟢 เพิ่มไอคอนโซ่สีเขียวหน้าข้อความ Space เพื่อความชัดเจน (ใช้ stroke-width หนาตามคำขอ)
        if (item.linkedSpaceId && displayDesc.startsWith('Space:')) {
            displayDesc = displayDesc.replace('Space:', `${linkIcon()}Space:`);
        }

        // Map dependency IDs to visual row numbers
        const depLabels = item.dependencies
            .map(id => idToNumMap[id] ? `#${idToNumMap[id]}` : null)
            .filter(n => n)
            .join(', ');

        return `
            <li class="smart-flow-item ${completedClass} ${failedClass} ${lockedClass} ${linkedClass}" data-id="${item.id}" data-index="${index}" style="position:relative;">
                <div class="drag-handle">${dragHandleIcon()}</div>
                <div class="smart-flow-number">${rowNum}</div>
                
                ${actionBtnHtml}

                <div class="smart-flow-content">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div class="smart-flow-title" contenteditable="true" data-id="${item.id}">${item.title}</div>
                        ${focusBadge}
                        ${habitBadge}
                        ${(item.tags && item.tags.length > 0) ? `
                            <div class="sf-item-tags-badge" title="${item.tags.join(', ')}"><svg class="svg-icon-sm" style="width:10px; height:10px;"><use href="#icon-tag"></use></svg><span>${item.tags.length}</span></div>
                        ` : ''}
                    </div>
                    <div class="sf-timer-container" style="padding-left: 6px;">
                        ${repeatCountdownText ? `<div class="sf-countdown-timer">${repeatCountdownText}</div>` : ''}
                        ${countdownText ? `<div class="sf-countdown-timer">${countdownText}</div>` : ''}
                    </div>
                    <div class="smart-flow-desc" style="padding-left: 6px;">
                        ${displayDesc} 
                        ${depLabels ? `<span class="flow-dep-tag">Requires ${depLabels}</span>` : ''}
                    </div>
                </div>

                <div class="smart-flow-actions-container ${isExpanded ? 'expanded' : ''} ${flowState.showActions ? 'global-expand' : ''}">
                    <div class="flow-actions-menu-popup">
                        <button class="btn-icon flow-opt-note" data-id="${item.id}" title="Edit Session Note"><svg class="svg-icon-sm"><use href="#icon-notebook"></use></svg></button>
                        <button class="btn-icon flow-opt-reset" data-id="${item.id}" title="Reset & Unlock Step"><svg class="svg-icon-sm"><use href="#icon-rotate-ccw"></use></svg></button>
                        <button class="btn-icon flow-opt-deps" data-id="${item.id}" title="Dependencies"><svg class="svg-icon-sm"><use href="#icon-link"></use></svg></button>
                        <button class="btn-icon flow-opt-settings" data-id="${item.id}" title="Settings"><svg class="svg-icon-sm"><use href="#icon-settings"></use></svg></button>
                        <button class="btn-icon flow-opt-archive" data-id="${item.id}" title="Archive">${svgArchive}</button>
                        <button class="btn-icon flow-opt-duplicate" data-id="${item.id}" title="Duplicate Step"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg></button>
                        <button class="btn-icon flow-opt-delete" data-id="${item.id}" title="Delete" style="color: #dc2626;"><svg class="svg-icon-sm"><use href="#icon-trash"></use></svg></button>
                    </div>
                    <button class="btn-icon flow-menu-trigger" title="Actions" style="${flowState.showActions ? 'display:none;' : ''}; font-weight: 900; font-size: 18px;">⋮</button>
                </div>
            </li>
        `;
    }).join('');

    initSortable();
    attachFlowEvents(listEl);

    // 🟢 Apply syntax highlighting to both title and description after rendering
    listEl.querySelectorAll('.smart-flow-title, .smart-flow-desc').forEach(el => {
        applySyntaxHighlighting(el);
    });

    // 🟢 Render Archived Items
    const archivedItems = flowItems.filter(item => item.isArchived);
    if (archivedContainer) {
        archivedContainer.style.display = archivedItems.length > 0 ? 'block' : 'none';
        if (archivedListEl) {
            archivedListEl.innerHTML = archivedItems.map((item) => `
                <li class="smart-flow-item completed" style="opacity: 0.6; padding: 8px 12px;">
                    <div class="smart-flow-number">#</div>
                    <div class="smart-flow-content">
                        <div class="smart-flow-title" style="text-decoration: line-through; font-size: 13px;">${item.title}</div>
                        <div class="smart-flow-desc" style="font-size: 10px;">${item.description}</div>
                    </div>
                    <div class="item-action-group" style="opacity: 1;">
                        <button class="btn-icon flow-opt-unarchive" data-id="${item.id}" title="Restore">${svgUnarchive}</button>
                        <button class="btn-icon flow-opt-delete-perm" data-id="${item.id}" title="Delete Permanently">${svgTrashRed}</button>
                    </div>
                </li>
            `).join('');
            
            // Listeners for archived list
            archivedListEl.onclick = (e) => {
                const target = e.target;
                const unarchiveBtn = target.closest('.flow-opt-unarchive');
                const deleteBtn = target.closest('.flow-opt-delete-perm');
                if (!unarchiveBtn && !deleteBtn) return;

                const id = (unarchiveBtn || deleteBtn).dataset.id;
                const item = flowItems.find(fi => fi.id === id);
                if (!item) return;

                if (unarchiveBtn) {
                    item.isArchived = false;
                    saveFlow().then(() => renderSmartFlow(document.getElementById('smart-flow-container')));
                } else if (deleteBtn) {
                    if (confirm("Delete this step permanently?")) {
                        flowItems = flowItems.filter(fi => fi.id !== id);
                        saveFlow().then(() => renderSmartFlow(document.getElementById('smart-flow-container')));
                    }
                }
            };
        }
    }
}

/**
 * 🟢 อัปเดตเฉพาะตัวเลขเวลานับถอยหลัง โดยไม่วาด HTML ใหม่ทั้งรายการ
 * ช่วยแก้ปัญหาเมนูหาย ปัญหาการพิมพ์สะดุด และประหยัดทรัพยากร
 */
function updateFlowTimers() {
    const listEl = document.getElementById('smart-flow-list');
    if (!listEl) return;

    let needsFullRender = false;

    const now = Date.now();

    // 🟢 จัดการตัวจับเวลา Focus
    if (flowState.isFocusRunning && !flowState.isPaused) {
        if (flowState.focusEndTime && now >= flowState.focusEndTime) {
            flowState.focusTimeLeft = 0;
        } else if (flowState.focusEndTime) {
            flowState.focusTimeLeft = Math.max(0, Math.floor((flowState.focusEndTime - now) / 1000));
        } else {
            flowState.focusTimeLeft--;
        }
        
        // อัปเดตตัวเลขเวลาที่ปุ่มหัว Card โดยตรงเพื่อความสมูท
        const btnText = document.getElementById('sf-widget-focus-text');
        const btn = document.getElementById('sf-widget-focus-btn');
        if (btnText) {
            if (flowState.isPaused) btnText.innerText = "Paused";
            else if (flowState.focusStartTime && flowState.focusEndTime) {
                btnText.innerText = `${formatFocusClock(flowState.focusStartTime)} - ${formatFocusClock(flowState.focusEndTime)}`;
            } else {
                btnText.innerText = formatFocusTime(flowState.focusTimeLeft);
            }
        }
        
        // อัปเดตคลาสสีปุ่ม
        if (btn) {
            btn.classList.toggle('active-red', !flowState.isPaused);
            btn.classList.toggle('active-orange', flowState.isPaused);
        }

        if (flowState.focusTimeLeft <= 0) {
            flowState.isFocusRunning = false;
            const btn = document.getElementById('sf-widget-focus-btn');
            if (btn) btn.classList.remove('active-red');
            playZenBell();

            // 🟢 นำ Overlay กลับมาบังรายการเมื่อหมดเวลา (Lock อีกครั้ง)
            const wrapper = document.getElementById('sf-focus-overlay-wrapper');
            if (wrapper) wrapper.innerHTML = renderFocusOverlayHtml();
            needsFullRender = true;

            alert("⏰ Focus session ended! Smart Flow is now locked.");
            saveFlow(); // บันทึกสถานะจบ
        }
    }

    // 🟢 อัปเดตหน้าต่างลอยทุกวินาทีถ้าสถานะเปิดอยู่
    renderFocusPersistentPopup();

    if (needsFullRender && !flowState.isFocusRunning) {
        renderSmartFlow(document.getElementById('smart-flow-container'));
    }

    flowItems.forEach(item => {
        const itemEl = listEl.querySelector(`.smart-flow-item[data-id="${item.id}"]`);
        if (!itemEl) return;

        const schedMet = isScheduleMet(item);
        const repeatMet = isRepeatMet(item);
        const depsMet = checkDependencies(item);
        const isLocked = !(schedMet && repeatMet && depsMet) && !item.isCompleted;

        // 1. ตรวจสอบการเปลี่ยนสถานะ (ถ้างานถูกปลดล็อค ต้องสั่ง Render ใหม่เพื่ออัปเดตปุ่มและตัวกรอง)
        const wasLocked = itemEl.classList.contains('sf-locked');
        if (wasLocked !== isLocked) {
            needsFullRender = true;
            return;
        }

        // 2. อัปเดตข้อความ Countdown ใน Container
        const timerContainer = itemEl.querySelector('.sf-timer-container');
        if (timerContainer) {
            const countdownText = !schedMet && !item.isCompleted ? getScheduleCountdown(item) : "";
            const repeatCountdownText = !repeatMet && item.isCompleted ? getRepeatCountdown(item) : "";
            
            let newHtml = "";
            if (repeatCountdownText) newHtml += `<div class="sf-countdown-timer">${repeatCountdownText}</div>`;
            if (countdownText) newHtml += `<div class="sf-countdown-timer">${countdownText}</div>`;
            
            // อัปเดตเฉพาะเมื่อมีการเปลี่ยนแปลงข้อความจริงๆ
            if (timerContainer.innerHTML !== newHtml) {
                timerContainer.innerHTML = newHtml;
            }
        }
    });
}

/**
 * 🎨 เปิดหน้าต่างตั้งค่า Focus Mode แบบสวยงาม
 */
export function showFocusPopup(anchorEl) {
    const existing = document.getElementById('sf-focus-config-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'sf-focus-config-popup';
    popup.className = 'sf-focus-popup';
    
    const rect = anchorEl.getBoundingClientRect();
    popup.style.cssText = `top: ${rect.bottom + 8}px; left: ${rect.left}px;`;

    popup.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <span style="font-weight:800; font-size:13px;">🎯 Focus Settings</span>
            <label class="switch">
                <input type="checkbox" id="sf-popup-focus-mode-toggle" ${flowState.focusMode ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        </div>
        
        <div id="sf-popup-timer-controls" style="display: ${flowState.focusMode ? 'block' : 'none'};">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:12px;">
                <button class="btn btn-outline sf-timer-preset" data-mins="25" style="font-size:11px; justify-content:center;">25 Min</button>
                <button class="btn btn-outline sf-timer-preset" data-mins="60" style="font-size:11px; justify-content:center;">60 Min</button>
            </div>
            <div style="margin-bottom:15px;">
                <label style="font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:5px; display:block;">Custom Minutes</label>
                <input type="number" id="sf-popup-custom-mins" class="settings-input" value="25" min="1" style="padding:4px 8px; font-size:13px; font-weight:700;">
            </div>
            <button class="btn btn-primary" id="sf-popup-start-btn" style="width:100%; justify-content:center; background:#ef4444; border:none; color:white;">
                ${flowState.isFocusRunning ? '⏹️ Stop Focus' : '🚀 Start Focus'}
            </button>
        </div>
        <p id="sf-popup-disabled-msg" style="display: ${flowState.focusMode ? 'none' : 'block'}; font-size:11px; color:var(--text-muted); text-align:center; margin:10px 0;">
            Enable Focus Mode to lock Smart Flow tasks while you concentrate.
        </p>
    `;

    document.body.appendChild(popup);

    // Logic: Toggle Switch
    const modeToggle = popup.querySelector('#sf-popup-focus-mode-toggle');
    const controls = popup.querySelector('#sf-popup-timer-controls');
    const msg = popup.querySelector('#sf-popup-disabled-msg');
    
    modeToggle.onchange = () => {
        flowState.focusMode = modeToggle.checked;
        controls.style.display = flowState.focusMode ? 'block' : 'none';
        msg.style.display = flowState.focusMode ? 'none' : 'block';
        if (!flowState.focusMode) {
            flowState.isFocusRunning = false;
            flowState.isPaused = false;
            flowState.focusTimeLeft = 0;
        }

        // 🟢 อัปเดตสถานะการล็อคทันทีที่สับสวิตช์
        const wrapper = document.getElementById('sf-focus-overlay-wrapper');
        if (wrapper) wrapper.innerHTML = (flowState.focusMode && !flowState.isFocusRunning) ? renderFocusOverlayHtml() : '';

        // 🟢 อัปเดตสีปุ่มบน Dashboard ทันทีที่เลื่อนเปิด
        if (window.renderDefaultDashboard) window.renderDefaultDashboard();

        saveFlow();
    };

    // Logic: Preset Buttons
    popup.querySelectorAll('.sf-timer-preset').forEach(btn => {
        btn.onclick = () => { popup.querySelector('#sf-popup-custom-mins').value = btn.dataset.mins; };
    });

    // Logic: Pause/Resume
    const pauseBtn = popup.querySelector('#sf-popup-pause-btn');
    if (pauseBtn) {
        pauseBtn.onclick = () => {
            flowState.isPaused = !flowState.isPaused;
            popup.remove();
            renderSmartFlow(document.getElementById('smart-flow-container'));
        };
    }

    // Logic: Start/Stop (Reset logic included)
    popup.querySelector('#sf-popup-start-btn').onclick = () => {
        if (flowState.isFocusRunning) {
            flowState.isFocusRunning = false;
            flowState.isPaused = false;
            flowState.focusTimeLeft = 0;
        } else {
            const mins = parseInt(popup.querySelector('#sf-popup-custom-mins').value);
            flowState.focusStartTime = Date.now();
            flowState.focusEndTime = flowState.focusStartTime + (mins * 60 * 1000);
            flowState.focusTimeLeft = mins * 60;
            flowState.isFocusRunning = true;
            flowState.isPaused = false;
            flowState.focusPopupState.isOpen = true; // 🟢 บังคับเปิดหน้าต่างลอย
        }
        popup.remove();
        renderSmartFlow(document.getElementById('smart-flow-container'));
        renderFocusPersistentPopup(); // 🟢 อัปเดตสถานะของ Persistent Popup
    };

    // Close on outside click
    setTimeout(() => {
        const close = (e) => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 0);
}

export function formatFocusTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 🎨 สร้าง HTML สำหรับหน้าจอ Lock เมื่ออยู่ในโหมด Focus แต่ไม่ได้เริ่มจับเวลา (ย้ายออกมาด้านนอกเพื่อให้เรียกใช้ได้ทุกที่)
 */
function renderFocusOverlayHtml() {
    const isPaused = flowState.isPaused;
    return `
        <div class="sf-focus-overlay">
            <div class="sf-focus-lock-card">
                <div style="font-size: 24px; margin-bottom: 8px;">${isPaused ? '☕' : '🔒'}</div>
                <div style="font-weight: 800; font-size: 16px;">${isPaused ? 'Focus Paused' : 'Smart Flow Locked'}</div>
                <div style="font-size: 12px; opacity: 0.8; margin-top: 4px;">${isPaused ? 'Session is paused. <br>Resume to continue.' : 'Focus Mode is active. <br>Start a focus session to unlock access.'}</div>
            </div>
        </div>
    `;
}

/**
 * ตรวจสอบว่าถึงเวลา/วันที่ที่กำหนดใน Schedule หรือยัง
 */
function isScheduleMet(item) {
    if (!item.scheduleConfig || !item.scheduleConfig.enabled) return true;
    if (!item.scheduleConfig.days || item.scheduleConfig.days.length === 0) return false;

    const now = new Date();
    const curDay = now.getDay();
    const curTimeInMins = now.getHours() * 60 + now.getMinutes();
    const scheduledTimeInMins = (item.scheduleConfig.hour || 0) * 60 + (item.scheduleConfig.min || 0);

    // ต้องเป็นวันที่เลือก และเวลาปัจจุบันต้องไม่น้อยกว่าเวลาที่ตั้งไว้
    return item.scheduleConfig.days.includes(curDay) && curTimeInMins >= scheduledTimeInMins;
}

/**
 * คำนวณเวลาที่เหลือจนกว่าจะถึงเวลาเริ่มงานตาม Schedule
 */
function getScheduleCountdown(item) {
    if (!item.scheduleConfig || !item.scheduleConfig.enabled || !item.scheduleConfig.days?.length) return "";
    
    const now = new Date();
    const curDay = now.getDay();
    const curTimeInMins = now.getHours() * 60 + now.getMinutes();
    const curSec = now.getSeconds();
    const targetTimeInMins = (item.scheduleConfig.hour || 0) * 60 + (item.scheduleConfig.min || 0);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let daysUntilNext = -1;

    // ค้นหาวันถัดไปที่อนุญาตให้เริ่มงาน
    for (let i = 0; i < 8; i++) {
        const checkDay = (curDay + i) % 7;
        if (item.scheduleConfig.days.includes(checkDay)) {
            if (i === 0 && targetTimeInMins > curTimeInMins) {
                daysUntilNext = 0;
                break;
            } else if (i > 0) {
                daysUntilNext = i;
                break;
            }
        }
    }

    if (daysUntilNext === -1) return "";

    // 🟢 หากไม่ใช่ของวันนี้ ให้บอกชื่อวันและจำนวนวันที่เหลือ
    if (daysUntilNext > 0) {
        const targetDayName = dayNames[(curDay + daysUntilNext) % 7];
        return `Starts ${targetDayName} (in ${daysUntilNext} ${daysUntilNext === 1 ? 'day' : 'days'})`;
    }

    const totalTargetMins = (daysUntilNext * 24 * 60) + targetTimeInMins;
    const diffMins = totalTargetMins - curTimeInMins;
    
    let remMins = diffMins;
    let remSecs = 0;
    if (curSec > 0) {
        remMins--;
        remSecs = 60 - curSec;
    }

    const h = Math.floor(remMins / 60);
    const m = remMins % 60;
    const s = remSecs;

    return `Starts in ${h > 0 ? String(h).padStart(2, '0') + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function checkDependencies(item) {
    if (!item.dependencies || item.dependencies.length === 0) return true;
    return item.dependencies.every(depId => {
        const depItem = flowItems.find(fi => fi.id === depId);
        return depItem ? depItem.isCompleted : true; 
    });
}

function attachFlowEvents(listEl) {
    // 1. Completion Toggle
    listEl.querySelectorAll('.smart-flow-action-btn').forEach(btn => {
        btn.onclick = async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const item = flowItems.find(fi => fi.id === id);
            if (!item) return;

            // 1. กรณีงานเสร็จแล้ว -> กดเพื่อ Reset สถานะ
            if (item.isCompleted) {
                item.isCompleted = false;
                delete item.isFailed; // ล้างสถานะล้มเหลวทิ้งเมื่อรีเซ็ต
                saveFlow().then(renderFlowList);
                return;
            }

            // 2. ตรวจสอบว่าถูกล็อคอยู่หรือไม่
            if (btn.hasAttribute('data-locked') && !item.isCompleted) {
                const row = btn.closest('.smart-flow-item');
                row.classList.add('sf-shake');
                setTimeout(() => row.classList.remove('sf-shake'), 400);
                return;
            }

            // 3. จัดการสถานะยืนยันผลลัพธ์
            if (btn.classList.contains('sf-btn-success')) {
                confirmingFlowItemId = null;
                await processFlowCompletion(item, true, e);
            } else if (btn.classList.contains('sf-btn-fail')) {
                confirmingFlowItemId = null;
                await processFlowCompletion(item, false, e);
            } else {
                // กดปุ่ม Play ครั้งแรก -> แสดงปุ่ม ✔ / ✖
                confirmingFlowItemId = id;
                playStepStartSound();
                renderFlowList();
                if (item.linkedSpaceId) {
                    await simulateWorkflow(item);
                }
            }
        };
    });

    // Toggle Actions Menu logic
    listEl.querySelectorAll('.flow-menu-trigger').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.closest('.smart-flow-item').dataset.id;
            // ถ้ากดตัวเดิมให้ปิด ถ้ากดตัวใหม่ให้เปิดตัวใหม่
            flowState.activeMenuId = (flowState.activeMenuId === id) ? null : id;
            renderFlowList();
        };
    });

    // 🟢 ปรับปรุง: ตรวจสอบและปิดเมนูเมื่อคลิกข้างนอก (ใช้แค่ Listener เดียวที่ระดับ Global)
    if (!window._sfClickBound) {
        document.addEventListener('click', (e) => {
            // 🟢 ปิดโหมดเลือกผลลัพธ์เมื่อคลิกที่อื่น
            if (!e.target.closest('.sf-confirm-group') && confirmingFlowItemId !== null) {
                confirmingFlowItemId = null;
                renderFlowList();
            }

            if (!e.target.closest('.smart-flow-actions-container') && flowState.activeMenuId !== null) {
                flowState.activeMenuId = null;
                renderFlowList();
            }
        });
        window._sfClickBound = true;
    }

    // 2. Inline Title Edit
    listEl.querySelectorAll('.smart-flow-title').forEach(el => {
        // 🟢 เพิ่ม Autocomplete ขณะแก้ไขชื่อใน Smart Flow
        el.oninput = (e) => {
            handleTagAutocomplete(e, () => flowState.managedTags || []);
            applySyntaxHighlighting(el); // 🟢 เพิ่มการไฮไลท์ใน Smart Flow
        };

        el.onblur = () => {
            const id = el.dataset.id;
            const item = flowItems.find(fi => fi.id === id);
            if (item) {
                const newText = el.innerText.trim();
                if (el.classList.contains('smart-flow-title')) {
                    if (newText) item.title = newText;
                } else {
                    item.description = newText;
                }
                saveFlow().then(renderFlowList);
            }
        };
        el.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } };
    });

    // 3. Dropdown Menu Actions
    listEl.onclick = (e) => {
        const target = e.target;
        
        // ใช้ closest เพื่อให้กดโดนไอคอนแล้วปุ่มยังทำงานได้แม่นยำ
        const depsBtn = target.closest('.flow-opt-deps');
        const settingsBtn = target.closest('.flow-opt-settings');
        const deleteBtn = target.closest('.flow-opt-delete');
        const archiveBtn = target.closest('.flow-opt-archive');
        const resetBtn = target.closest('.flow-opt-reset');
        const noteBtn = target.closest('.flow-opt-note');
        const duplicateBtn = target.closest('.flow-opt-duplicate'); // NEW: Duplicate button

        if (!depsBtn && !settingsBtn && !deleteBtn && !archiveBtn && !resetBtn && !noteBtn && !duplicateBtn) return;
        
        const id = (depsBtn || settingsBtn || deleteBtn || archiveBtn || resetBtn || noteBtn || duplicateBtn).dataset.id;
        const item = flowItems.find(fi => fi.id === id);
        if (!item) return;

        if (deleteBtn) {
            if (confirm("Delete this workflow step?")) {
                flowItems = flowItems.filter(fi => fi.id !== id);
                saveFlow().then(renderFlowList);
            }
        } else if (archiveBtn) {
            item.isArchived = true;
            saveFlow().then(() => renderSmartFlow(document.getElementById('smart-flow-container')));
        } else if (resetBtn) {
            // 🟢 ล้างสถานะให้กลับมาเป็นงานใหม่ พร้อมกดซ้ำได้ทันที
            item.isCompleted = false;
            if (item.repeatConfig) item.repeatConfig.lastCompletedDate = null;
            saveFlow().then(renderFlowList);
        } else if (noteBtn) {
            // 🟢 Requirement 1: แก้ไข Note ได้ตลอดเวลาจากเมนู 3 จุด
            const spaces = getSpaces();
            const targetSpace = spaces.find(s => String(s.id) === String(item.linkedSpaceId));
            showWorkflowTransitionPopup(item, targetSpace || { name: 'this space' }, true);
        } else if (depsBtn) {
            openSmartFlowDependenciesModal(id);
        } else if (settingsBtn) {
            isCreatingNewStep = false; // 🟢 มาร์คว่าเป็นการแก้ไขงานเดิม
            openSmartFlowSettingsModal(item.id);
        } else if (duplicateBtn) { // NEW: Handle duplicate action
            duplicateFlowItem(id);
            flowState.activeMenuId = null; // Close menu after duplicating
        }
    };
}

/**
 * 🚀 ระบบแสดงหน้าต่างยืนยันก่อนสลับพื้นที่ทำงาน
 */
async function showWorkflowTransitionPopup(item, targetSpace, onlyNote = false) {
    const modalId = 'sf-transition-modal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        const html = `
            <div class="modal-overlay" id="${modalId}" style="z-index: 20000;">
                <div class="modal-content" style="width: 400px; text-align: center; padding: 30px; border-radius: 16px;">
                    <div style="font-size: 40px; margin-bottom: 15px;">🚀</div>
                    <h2 id="sf-trans-title" style="margin: 0 0 10px 0; font-size: 20px;"></h2>
                    <p id="sf-trans-desc" style="color: var(--text-muted); font-size: 14px; line-height: 1.5; margin-bottom: 20px;"></p>
                    
                    <div style="background: var(--bg-body); padding: 15px; border-radius: 10px; margin-bottom: 20px; text-align: left; border: 1px solid var(--border-color);">
                        <label style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; display: block; margin-bottom: 8px;">Session Notes / Message:</label>
                        <textarea id="sf-trans-note" class="settings-input" style="height: 80px; resize: none; font-size: 13px;" placeholder="What are we focusing on in this space?"></textarea>
                    </div>

                    <div id="sf-trans-habit-info" style="display: none; align-items: center; justify-content: center; gap: 8px; color: #16a34a; font-weight: 700; font-size: 13px; margin-bottom: 25px;">
                        <svg class="svg-icon-sm" style="width:16px; height:16px;"><use href="#icon-sparkles"></use></svg>
                        Habit Tracker will be opened
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 12px;">
                        <button class="btn btn-outline" id="sf-btn-trans-cancel" style="justify-content: center; padding: 10px;">Stay Here</button>
                        <button class="btn btn-primary" id="sf-btn-trans-confirm" style="justify-content: center; padding: 10px; font-weight: 800;">Enter Space</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        modal = document.getElementById(modalId);
    }

    // 🟢 Requirement 3: เน้นชื่อ Space ให้โดดเด่น
    document.getElementById('sf-trans-title').innerText = onlyNote ? "📝 Session Note" : `Enter Space: ${targetSpace.name}`;
    document.getElementById('sf-trans-desc').innerHTML = `Proceed to <span class="sf-trans-target-space">${targetSpace.name}</span> to continue <strong>"${item.title}"</strong>.`;
    document.getElementById('sf-trans-habit-info').style.display = (item.habitConfig && item.habitConfig.enabled) ? 'flex' : 'none';
    
    // 🟢 Requirement 1: ข้อมูล Note ไม่หายไป (ดึงจาก item.note)
    document.getElementById('sf-trans-note').value = item.note || "";
    document.getElementById('sf-btn-trans-confirm').innerText = onlyNote ? "Save Note" : "Enter Space";

    modal.style.display = 'flex';
    document.getElementById('sf-trans-note').focus();

    return new Promise((resolve) => {
        document.getElementById('sf-btn-trans-confirm').onclick = () => {
            item.note = document.getElementById('sf-trans-note').value.trim();
            saveFlow(); // บันทึกโน้ตลงฐานข้อมูล
            modal.style.display = 'none';
            resolve(true);
        };
        document.getElementById('sf-btn-trans-cancel').onclick = () => {
            modal.style.display = 'none';
            resolve(false);
        };
    });
}

async function simulateWorkflow(item) {
    if (!item.linkedSpaceId) return;

    // หาข้อมูล Space เป้าหมาย
    const spaces = getSpaces();
    const targetSpace = spaces.find(s => String(s.id) === String(item.linkedSpaceId));
    if (!targetSpace) return;

    // 🟢 แสดงหน้าต่างยืนยันก่อนสลับ
    const confirmed = await showWorkflowTransitionPopup(item, targetSpace);
    if (confirmed === false) {
        // 🟢 กรณีเลือก Stay Here: ให้ขึ้น Popup ติ๊กจบงานทันที
        showPostTransitionConfirmPopup(item);
        return;
    }

    // 1. คลายโฟลเดอร์ถ้าถูกพับอยู่
    const folderName = targetSpace.folder || 'General';
    const settings = getAppSettings();
    if (settings.collapsedFolders && settings.collapsedFolders.includes(folderName)) {
        settings.collapsedFolders = settings.collapsedFolders.filter(f => f !== folderName);
        saveData();
        renderSidebar();
    }

    // 2. สลับ Space
    const sidebarItem = document.querySelector(`#spacebar .space-item[data-id="${item.linkedSpaceId}"]`);
    if (sidebarItem) sidebarItem.click();

    // 3. เริ่ม Focus Mode (เฉพาะใน Space ที่ระบุเท่านั้น ไม่เปิดใน Command Center)
    if (item.focusConfig && item.focusConfig.enabled) {
        // 🟢 เปิดโหมด Focus (ON) และตั้งเวลาเตรียมไว้ แต่ยังไม่เริ่มนับถอยหลัง (รอให้ผู้ใช้กดเริ่มเอง)
        if (targetSpace) {
            if (!targetSpace.focusTimer) targetSpace.focusTimer = { mode: 'off', timeLeft: 0 };
            targetSpace.focusTimer.mode = 'setup';
            targetSpace.focusTimer.duration = item.focusConfig.minutes || 25;
        }

        saveData();
        saveFlow();
    }

    // 4. เปิด Habit Tracker
    if (item.habitConfig && item.habitConfig.enabled) {
        setTimeout(() => {
            import('./habitSheet.js').then(m => m.openHabitModal(targetSpace));
        }, 350);
    }

    // 5. แสดงหน้าต่างยืนยันผลลัพธ์ (✔/✖) หลังจากย้าย Space แล้ว
    setTimeout(() => {
        showPostTransitionConfirmPopup(item);
    }, 800);
}

function initSortable() {
    const el = document.getElementById('smart-flow-list');
    Sortable.create(el, {
        handle: '.drag-handle',
        animation: 150,
        onEnd: (evt) => {
            const movedItem = flowItems.splice(evt.oldIndex, 1)[0];
            flowItems.splice(evt.newIndex, 0, movedItem);
            saveFlow().then(renderFlowList);
        }
    });
}

/** Icons */
function linkIcon() {
    return `<svg class="sf-link-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; margin-top: -2px;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
}

function dragHandleIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.4;"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>`;
}

function playIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
}

function checkIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
}

function cancelIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
}

/**
 * ⚙️ ประมวลผลการจบขั้นตอนของ Smart Flow
 * @param {Object} item - ขั้นตอนที่กำลังทำ
 * @param {boolean} shouldClaimRewards - จะรับรางวัลหรือไม่
 * @param {Event} e - event object สำหรับพิกัดแอนิเมชั่น
 */
async function processFlowCompletion(item, shouldClaimRewards, e) {
    confirmingFlowItemId = null; // 🟢 เคลียร์สถานะการเลือกทันที
    item.isCompleted = true;
    item.isFailed = !shouldClaimRewards; // 🟢 บันทึกสถานะว่าล้มเหลวหรือไม่ (X = Failed)

    if (!item.repeatConfig) item.repeatConfig = {};
    item.repeatConfig.lastCompletedDate = new Date().toDateString(); 

    // 🌟 Quest Loot Scanner: สแกนหาเงิน/เวลา เฉพาะเมื่อเลือกสำเร็จ (✔) เท่านั้น
    if (shouldClaimRewards && window.processRewardScanner) {
        const combinedText = `${item.title} ${item.description || ''}`;
        const coords = e ? { x: e.clientX, y: e.clientY } : { x: window.innerWidth/2, y: window.innerHeight/2 };
        window.processRewardScanner(combinedText, false, coords, 'flow', item.linkedSpaceId, { id: item.id, tags: item.tags });
    }

    // --- Success Celebration Check ---
    const incompleteVisible = flowItems.filter(fi => {
        const isLocked = !(checkDependencies(fi) && isScheduleMet(fi)) && !fi.isCompleted;
        if (flowState.hideLocked && isLocked) return false;
        return !fi.isCompleted;
    });

    if (incompleteVisible.length === 0 && !item.isFailed) {
        const cx = e ? e.clientX : window.innerWidth/2;
        const cy = e ? e.clientY : window.innerHeight/2;
        triggerFlowConfetti(cx, cy);
        playSuccessSound();
    }

    saveFlow().then(renderFlowList);
}

/**
 * 🏁 หน้าต่างยืนยันผลลัพธ์หลังจากเข้าสู่ Space เป้าหมายแล้ว
 */
async function showPostTransitionConfirmPopup(item) {
    const modalId = 'sf-post-result-modal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
    const html = `
            <div class="modal-overlay sf-post-confirm-overlay" id="${modalId}" style="z-index: 30000; background: none; backdrop-filter: none; display:none;">
                <div class="modal-content sf-post-confirm-popup" style="padding: 0; position: fixed;">
                    <div id="sf-post-result-header" style="background: var(--bg-spacebar); padding: 6px 10px; cursor: grab; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border-color);">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.4;"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                        <span style="font-size: 11px; font-weight: 800; color: var(--text-muted); flex: 1;">DONE?</span>
                        <button id="sf-btn-result-close" style="background: none; border: none; cursor: pointer; color: var(--text-muted); opacity:0.5; padding: 0;">✕</button>
                    </div>
                    <div style="padding: 12px 10px; display: flex; flex-direction: column; gap: 8px; align-items: center;">
                        <div style="font-size: 11px; font-weight: 700; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff;">${item.title}</div>
                        <div style="display: flex; gap: 8px;">
                            <button class="sf-result-action-btn sf-res-fail" id="sf-btn-res-fail" title="Fail" style="width:30px; height:30px;">${cancelIcon()}</button>
                            <button class="sf-result-action-btn sf-res-success" id="sf-btn-res-success" title="Success" style="width:30px; height:30px;">${checkIcon()}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        modal = document.getElementById(modalId);
    }
    
    const popupContent = modal.querySelector('.sf-post-confirm-popup');

    // Set initial position (centered if not saved, or from saved state)
    const savedX = flowState.postConfirmPopupState.x;
    const savedY = flowState.postConfirmPopupState.y;

    if (savedX === 0 && savedY === 0) { // 🟢 เปลี่ยนจากกึ่งกลาง เป็นมุมขวาล่าง
        // Temporarily show to measure dimensions
        modal.style.display = 'block';
        popupContent.style.display = 'block';
        popupContent.style.visibility = 'hidden'; // Hide it from user view

        const margin = 25; // ระยะห่างจากขอบจอ
        const posX = window.innerWidth - popupContent.offsetWidth - margin;
        const posY = 75; // 🟢 ย้ายไปอยู่ด้านบน
        
        popupContent.style.left = `${posX}px`;
        popupContent.style.top = `${posY}px`;
        flowState.postConfirmPopupState.x = posX;
        flowState.postConfirmPopupState.y = posY;
        popupContent.style.visibility = 'visible'; // Make it visible after positioning
    } else {
        popupContent.style.left = `${savedX}px`;
        popupContent.style.top = `${savedY}px`;
    }

    playPopSound(); // 🔊 เล่นเสียง Pop เบาๆ เมื่อ Popup ปรากฏ
    modal.style.display = 'block'; // Ensure overlay is visible
    popupContent.style.display = 'block'; // Ensure popup is visible

    setupPostConfirmPopupDrag(popupContent);

    return new Promise((resolve) => {
        // ✖ ปุ่มล้มเหลว
        document.getElementById('sf-btn-res-fail').onclick = async (e) => {
            await processFlowCompletion(item, false, e);
            closeResultPopup();
            resolve(false);
        };

        // ✔ ปุ่มสำเร็จ
        document.getElementById('sf-btn-res-success').onclick = async (e) => {
            await processFlowCompletion(item, true, e);
            closeResultPopup();
            resolve(true);
        };

        document.getElementById('sf-btn-result-close').onclick = closeResultPopup;

        function closeResultPopup() {
            modal.style.display = 'none';
            popupContent.style.display = 'none';
            resolve(null);
        }
    });
}

/**
 * 🖐️ Drag Logic for Post-Transition Confirmation Popup
 */
function setupPostConfirmPopupDrag(el) {
    const header = el.querySelector('#sf-post-result-header');
    if (!header) return;

    let isDragging = false;
    let offset = { x: 0, y: 0 };

    header.onmousedown = (e) => {
        if (e.target.closest('button')) return; // Don't drag if clicking buttons
        if (flowState.postConfirmPopupState.isLocked) return; // Optional lock
        isDragging = true;
        el.classList.add('is-dragging'); // Add class for visual feedback
        const rect = el.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;
        document.body.style.userSelect = 'none'; // Prevent text selection during drag
        el.style.transition = 'none'; // Disable transition for smooth dragging
    };

    const handleMove = (e) => {
        if (!isDragging) return;
        const newX = e.clientX - offset.x;
        const newY = e.clientY - offset.y;
        el.style.left = `${newX}px`;
        el.style.top = `${newY}px`;
        flowState.postConfirmPopupState.x = newX;
        flowState.postConfirmPopupState.y = newY;
    };

    const handleUp = () => {
        if (isDragging) {
            isDragging = false;
            el.classList.remove('is-dragging');
            document.body.style.userSelect = '';
            el.style.transition = 'all 0.2s ease'; // Re-enable transition
            saveFlow(); // Save final position
        }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
}

// --- Smart Flow Settings Modal ---
function initSmartFlowSettingsModal() {
    if (document.getElementById('smart-flow-settings-modal')) return; // Already initialized

    const modalHTML = `
        <div class="modal-overlay" id="smart-flow-settings-modal" style="z-index: 12000;"> 
            <div class="modal-content" style="width: 480px; padding: 25px;">
                <h3 style="margin-top:0; font-size:18px; display:flex; align-items:center; gap:8px;">⚙️ Workflow Step Settings</h3>

                <div style="margin-bottom: 20px;">
                    <div class="settings-group">
                        <label>Title</label>
                        <input type="text" id="sf-setting-title" class="settings-input" placeholder="Step title...">
                    </div>
                    <div class="settings-group">
                        <label>Linked Space</label>
                        <select id="sf-setting-linked-space" class="settings-input"></select>
                    </div>
                    <div class="settings-group">
                        <label>Description</label>
                        <div id="sf-setting-description" class="settings-input" contenteditable="true" style="min-height: 34px; height: auto;" placeholder="Notes or auto-generated info..."></div>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 25px;">
                    <label class="section-label" style="margin:0; font-size: 11px;">AUTOMATION FEATURES</label>
                    
                    <!-- Habit Toggle Row -->
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 12px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color);">
                        <label style="font-weight:700; font-size:13px; margin:0; display:flex; align-items:center; gap:8px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;opacity:0.6;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                            Auto-open Habit Tracker
                        </label>
                        <label class="switch"><input type="checkbox" id="sf-setting-habit-enabled"><span class="slider"></span></label>
                    </div>

                    <!-- Focus Toggle Row -->
                    <div style="padding: 8px 12px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <label style="font-weight:700; font-size:13px; margin:0; display:flex; align-items:center; gap:8px;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;opacity:0.6;"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="1"></circle></svg>
                                Auto Focus Mode
                            </label>
                            <label class="switch"><input type="checkbox" id="sf-setting-focus-enabled"><span class="slider"></span></label>
                        </div>
                        <div id="sf-focus-config-wrapper" style="display:none; align-items:center; gap:10px; margin-top:10px; padding-top:10px; border-top: 1px dashed var(--border-color);">
                            <span style="font-size:12px; color:var(--text-muted);">Duration:</span>
                            <input type="number" id="sf-setting-focus-minutes" class="settings-input" style="width:60px; padding:4px;" min="1" value="25">
                            <span style="font-size:12px; color:var(--text-muted);">mins</span>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 25px;">
                    <label class="section-label" style="margin-bottom:10px; font-size: 11px;">TIMING & REPEAT</label>
                    <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                        <div style="flex:1; padding: 10px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                                <span style="font-size:12px; font-weight:700;">Schedule</span>
                                <label class="switch"><input type="checkbox" id="sf-setting-schedule-enabled"><span class="slider"></span></label>
                            </div>
                            <div id="sf-schedule-config-wrapper" style="display:none;">
                                <div id="sf-days-container" style="display:flex; gap:3px; margin-bottom:10px;">
                                    ${['S','M','T','W','T','F','S'].map((d, i) => `<div class="sf-day-pill" data-day="${i}" style="width:24px; height:24px; font-size:9px;">${d}</div>`).join('')}
                                </div>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <input type="number" id="sf-setting-hour" class="settings-input" style="width:45px; padding:2px; text-align:center;" placeholder="HH">
                                    <span>:</span>
                                    <input type="number" id="sf-setting-min" class="settings-input" style="width:45px; padding:2px; text-align:center;" placeholder="MM">
                                </div>
                            </div>
                        </div>
                        <div style="flex:1; padding: 10px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                                <span style="font-size:12px; font-weight:700;">Repeat</span>
                                <label class="switch"><input type="checkbox" id="sf-setting-repeat-enabled"><span class="slider"></span></label>
                            </div>
                            <div id="sf-repeat-config-wrapper" style="display:none; align-items:center; gap:5px;">
                                <span style="font-size:11px; color:var(--text-muted);">Every</span>
                                <input type="number" id="sf-setting-repeat-interval" class="settings-input" style="width:45px; padding:2px; text-align:center;" min="1" value="1">
                                <span style="font-size:11px; color:var(--text-muted);">days</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 25px;">
                    <label class="section-label" style="margin-bottom:8px; font-size: 11px;">TAGS & DEPENDENCIES</label>
                    <div id="sf-setting-tag-selection-list" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:8px; padding: 10px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color); min-height: 30px;"></div>
                    <div style="display:flex; gap:5px; margin-bottom:15px;">
                        <input type="text" id="sf-setting-add-tag-input" class="settings-input" placeholder="New tag..." style="flex:1; font-size:12px; padding: 4px 8px;">
                        <button class="btn btn-outline" id="sf-setting-add-tag-btn" style="padding:0 12px; font-size:12px;">Add</button>
                    </div>
                    <div id="sf-setting-deps-container" style="max-height: 100px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; background: var(--bg-body);"></div>
                </div>

                <div class="modal-actions" style="margin-top: 20px; display:flex; justify-content:flex-end; gap:8px;">
                    <button class="btn btn-outline" id="sf-btn-cancel-settings">Cancel</button> 
                    <button class="btn btn-primary" id="sf-btn-save-settings">Save Changes</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('smart-flow-settings-modal');
    const saveBtn = document.getElementById('sf-btn-save-settings');
    const cancelBtn = document.getElementById('sf-btn-cancel-settings');

    // Conditional Visibility Listeners
    const focusToggle = document.getElementById('sf-setting-focus-enabled');
    const focusWrapper = document.getElementById('sf-focus-config-wrapper');
    const scheduleToggle = document.getElementById('sf-setting-schedule-enabled');
    const scheduleWrapper = document.getElementById('sf-schedule-config-wrapper');
    // Repeat Config Elements
    const repeatToggle = document.getElementById('sf-setting-repeat-enabled');
    const repeatWrapper = document.getElementById('sf-repeat-config-wrapper');


    focusToggle.onchange = () => focusWrapper.style.display = focusToggle.checked ? 'flex' : 'none';
    scheduleToggle.onchange = () => {
        if (scheduleToggle.checked) {
            repeatToggle.checked = false;
            repeatWrapper.style.display = 'none';
        }
        scheduleWrapper.style.display = scheduleToggle.checked ? 'block' : 'none';
    };


    // Toggle Day Selection
    document.getElementById('sf-days-container').onclick = (e) => {
        const pill = e.target.closest('.sf-day-pill');
        if (pill) pill.classList.toggle('active');
    };
    repeatToggle.onchange = () => {
        if (repeatToggle.checked) {
            scheduleToggle.checked = false;
            scheduleWrapper.style.display = 'none';
        }
        repeatWrapper.style.display = repeatToggle.checked ? 'flex' : 'none';
    };

    saveBtn.onclick = saveSmartFlowSettings;
    cancelBtn.onclick = () => {
        if (isCreatingNewStep) {
            // 🟢 ถ้าเป็นงานใหม่ที่เพิ่งกดสร้างแล้วกดยกเลิก ให้ลบทิ้งทันที
            flowItems = flowItems.filter(fi => fi.id !== editingFlowItemId);
            saveFlow().then(renderFlowList);
        }
        isCreatingNewStep = false;
        modal.style.display = 'none';
    };
}

function openSmartFlowSettingsModal(itemId) {
    editingFlowItemId = itemId;
    const item = flowItems.find(fi => fi.id === itemId);
    if (!item) return;

    const modal = document.getElementById('smart-flow-settings-modal');
    document.getElementById('sf-setting-title').value = item.title;
    
    const sfSettingDescInput = document.getElementById('sf-setting-description');
    sfSettingDescInput.innerText = item.description || "";
    applySyntaxHighlighting(sfSettingDescInput);
    
    // 🟢 NEW: Add input event for autocomplete and highlighting to the settings title input
    const sfSettingTitleInput = document.getElementById('sf-setting-title');
    sfSettingTitleInput.oninput = (e) => { handleTagAutocomplete(e, () => flowState.managedTags || []); applySyntaxHighlighting(sfSettingTitleInput); };

    // 🟢 Add input event for description in settings
    sfSettingDescInput.oninput = (e) => { handleTagAutocomplete(e, () => flowState.managedTags || []); applySyntaxHighlighting(sfSettingDescInput); };

    // 🟢 จัดการส่วนการเลือก Tag แบบใหม่ (จิ้มเลือก)
    editingFlowItemTags = [...(item.tags || [])];
    renderSettingsTagSelection();

    const addTagBtn = document.getElementById('sf-setting-add-tag-btn');
    const addTagInput = document.getElementById('sf-setting-add-tag-input');
    addTagBtn.onclick = () => {
        const val = addTagInput.value.trim();
        if (val && !editingFlowItemTags.includes(val)) {
            editingFlowItemTags.push(val);
            // 🟢 เพิ่มลงในรายการจำป้ายของระบบด้วย
            if (!flowState.managedTags.some(t => t.toUpperCase() === val.toUpperCase())) {
                flowState.managedTags.push(val);
            }
            addTagInput.value = '';
            renderSettingsTagSelection();
        }
    };
    addTagInput.onkeydown = (e) => { if(e.key === 'Enter') addTagBtn.click(); };

    // Populate Focus Config
    const focusEnabled = item.focusConfig?.enabled || false;
    document.getElementById('sf-setting-focus-enabled').checked = focusEnabled;
    document.getElementById('sf-focus-config-wrapper').style.display = focusEnabled ? 'flex' : 'none';
    document.getElementById('sf-setting-focus-minutes').value = item.focusConfig?.minutes || 25;

    // Populate Habit Config
    const habitEnabled = item.habitConfig?.enabled || false;
    document.getElementById('sf-setting-habit-enabled').checked = habitEnabled;

    // Populate Schedule Config
    const sched = item.scheduleConfig || { enabled: false, days: [], hour: 9, min: 0 };
    document.getElementById('sf-setting-schedule-enabled').checked = sched.enabled;
    document.getElementById('sf-schedule-config-wrapper').style.display = sched.enabled ? 'block' : 'none';
    document.getElementById('sf-setting-hour').value = String(sched.hour || 0).padStart(2, '0');
    document.getElementById('sf-setting-min').value = String(sched.min || 0).padStart(2, '0');

    // Populate Repeat Config
    const repeat = item.repeatConfig || { enabled: true, interval: 1, lastCompletedDate: null };
    
    // 🟢 Requirement: หากยังไม่มีการตั้งค่าใดๆ เลย ให้บังคับเปิด Repeat On : 1 วันไว้ก่อนเพื่อความสะดวก
    if (!sched.enabled && !repeat.enabled) {
        repeat.enabled = true;
        repeat.interval = 1;
    }

    document.getElementById('sf-setting-repeat-enabled').checked = repeat.enabled;
    document.getElementById('sf-repeat-config-wrapper').style.display = repeat.enabled ? 'flex' : 'none';
    document.getElementById('sf-setting-repeat-interval').value = repeat.interval || 1;

    // Populate Dependencies List inside Settings
    const depsContainer = document.getElementById('sf-setting-deps-container');
    depsContainer.innerHTML = '';
    flowItems.forEach((fItem, idx) => {
        if (fItem.id === itemId) return; // ไม่แสดงตัวเองในรายการ
        const isChecked = item.dependencies?.includes(fItem.id) ? 'checked' : '';
        const row = document.createElement('label');
        row.className = 'tag-select-row';
        row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:4px; border-radius:4px; cursor:pointer; margin:0;';
        row.innerHTML = `
            <label class="google-task-checkbox">
                <input type="checkbox" class="sf-setting-dep-checkbox" value="${fItem.id}" ${isChecked}>
                <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div>
            </label>
            <span style="font-size:12px; font-weight:600;">#${idx + 1} ${fItem.title}</span>
        `;
        depsContainer.appendChild(row);
    });
    if (depsContainer.innerHTML === '') {
        depsContainer.innerHTML = '<span style="font-size:11px; color:var(--text-muted); font-style:italic;">No other steps available</span>';
    }
    
    // Reset and Set Day Pills
    const dayPills = document.querySelectorAll('.sf-day-pill');
    dayPills.forEach((pill, i) => {
        if (sched.days && sched.days.includes(i)) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });

    // Populate Linked Space dropdown
    const spaceSelect = document.getElementById('sf-setting-linked-space');
    spaceSelect.innerHTML = '<option value="">-- Select Space (Optional) --</option>';
    getSpaces().filter(s => !s.isArchived && !s.isDeleted).forEach(space => {
        const option = document.createElement('option');
        option.value = String(space.id); // Ensure value is string
        option.innerText = space.name;
        if (String(space.id) === item.linkedSpaceId) { // Compare string IDs
            option.selected = true;
        }
        spaceSelect.appendChild(option);
    });
    // If linkedSpaceId is a name (legacy), try to find its ID
    if (item.linkedSpaceId && typeof item.linkedSpaceId === 'string' && isNaN(parseInt(item.linkedSpaceId)) && !spaceSelect.querySelector(`option[value="${item.linkedSpaceId}"]`)) {
        const spaceByName = getSpaces().find(s => s.name === item.linkedSpaceId);
        if (spaceByName) { // If found by name, set its ID
            spaceSelect.value = spaceByName.id;
        }
    } else {
        spaceSelect.value = item.linkedSpaceId || "";
    }


    modal.style.display = 'flex';
}

async function saveSmartFlowSettings() {
    const item = flowItems.find(fi => fi.id === editingFlowItemId);
    if (!item) return;

    // 🟢 Validation: ตรวจสอบว่าต้องเปิด Schedule หรือ Repeat อย่างใดอย่างหนึ่ง
    const scheduleEnabled = document.getElementById('sf-setting-schedule-enabled').checked;
    const repeatEnabled = document.getElementById('sf-setting-repeat-enabled').checked;

    if (!scheduleEnabled && !repeatEnabled) {
        alert("⚠️ Workflow Step must have either 'Schedule' or 'Repeat Interval' enabled to save changes.");
        return;
    }

    item.title = document.getElementById('sf-setting-title').value.trim();
    item.linkedSpaceId = document.getElementById('sf-setting-linked-space').value || null;
    item.tags = [...editingFlowItemTags];
    
    // Save Focus Config
    item.focusConfig = {
        enabled: document.getElementById('sf-setting-focus-enabled').checked,
        minutes: parseInt(document.getElementById('sf-setting-focus-minutes').value) || 25
    };

    // Save Habit Config
    item.habitConfig = {
        enabled: document.getElementById('sf-setting-habit-enabled').checked
    };

    // Save Schedule Config
    const selectedDays = Array.from(document.querySelectorAll('.sf-day-pill.active')).map(p => parseInt(p.dataset.day));
    item.scheduleConfig = {
        enabled: document.getElementById('sf-setting-schedule-enabled').checked,
        days: selectedDays,
        hour: parseInt(document.getElementById('sf-setting-hour').value) || 0,
        min: parseInt(document.getElementById('sf-setting-min').value) || 0
    };

    // Save Repeat Config
    item.repeatConfig = {
        enabled: document.getElementById('sf-setting-repeat-enabled').checked,
        interval: parseInt(document.getElementById('sf-setting-repeat-interval').value) || 1,
        lastCompletedDate: item.repeatConfig?.lastCompletedDate || null // 🟢 แก้ไข: ป้องกัน Error กรณีไอเทมเก่ายังไม่มี repeatConfig
    };

    // Save Dependencies from Settings Modal
    const selectedDeps = Array.from(document.querySelectorAll('.sf-setting-dep-checkbox:checked')).map(cb => cb.value);
    item.dependencies = selectedDeps;

    // Determine description: prioritize generated if linked space/focus is set, otherwise use manual input
    let manualDescription = document.getElementById('sf-setting-description').innerText.trim();
    let generatedDescription = "";
    
    if (item.linkedSpaceId) {
        const linkedSpace = getSpaces().find(s => String(s.id) === item.linkedSpaceId); // Compare string IDs
        if (linkedSpace) {
            generatedDescription = `Space: ${linkedSpace.name}`;
            if (item.focusConfig.enabled) {
                generatedDescription += ` • ${item.focusConfig.minutes}m Focus`;
            }
            if (item.habitConfig && item.habitConfig.enabled) {
                generatedDescription += ` • +Habit Tracker`;
            }
            if (item.scheduleConfig.enabled && item.scheduleConfig.days.length > 0) {
                const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                const daysStr = item.scheduleConfig.days.map(d => dayNames[d]).join(',');
                const timeStr = `${String(item.scheduleConfig.hour).padStart(2,'0')}:${String(item.scheduleConfig.min).padStart(2,'0')}`;
                generatedDescription += ` • ${daysStr} @ ${timeStr}`;
            }
            if (item.repeatConfig.enabled) {
                generatedDescription += ` • Repeat every ${item.repeatConfig.interval} days`;
            }
        }
    }
    
    // If a generated description exists, use it. Otherwise, use the manually entered one.
    // If neither, default.
    item.description = generatedDescription || manualDescription || "Click settings to link a space";

    isCreatingNewStep = false; // 🟢 เซฟสำเร็จแล้ว ไม่ใช่การสร้างใหม่อีกต่อไป
    await saveFlow();
    document.getElementById('smart-flow-settings-modal').style.display = 'none';
    renderSmartFlowTagBar(); // อัปเดตรายการ Tag ในแถบกรองด้วย
    renderFlowList(); // Re-render the list to reflect changes
}

/**
 * 🏷️ วาดรายการ Tag ในหน้า Settings ให้เลือกจิ้มได้
 */
function renderSettingsTagSelection() {
    const container = document.getElementById('sf-setting-tag-selection-list');
    if (!container) return;

    // ดึง Tag ทั้งหมดในระบบ
    const allUniqueTags = new Set();
    flowItems.forEach(fi => { if (fi.tags) fi.tags.forEach(t => allUniqueTags.add(t)); });
    flowState.managedTags.forEach(t => allUniqueTags.add(t.toUpperCase())); // 🟢 รวมจากป้ายที่จำไว้
    editingFlowItemTags.forEach(t => allUniqueTags.add(t)); // รวมที่เลือกอยู่ตอนนี้ด้วย
    
    const sorted = Array.from(allUniqueTags).sort();

    container.innerHTML = sorted.map(tag => {
        const isActive = editingFlowItemTags.includes(tag);
        return `<div class="tag-pill ${isActive ? 'active' : ''}" data-tag="${tag}" style="font-size:11px; padding:2px 8px; cursor:pointer; height:auto; line-height:1.2; border-style: ${isActive ? 'solid' : 'dashed'};">${tag}</div>`;
    }).join('');

    container.querySelectorAll('.tag-pill').forEach(pill => {
        pill.onclick = () => {
            const tag = pill.dataset.tag;
            if (editingFlowItemTags.includes(tag)) editingFlowItemTags = editingFlowItemTags.filter(t => t !== tag);
            else editingFlowItemTags.push(tag);
            renderSettingsTagSelection();
        };
    });
}

/**
 * ตรวจสอบว่าถึงเวลาที่จะทำซ้ำได้หรือยัง
 */
function isRepeatMet(item) {
    if (!item.repeatConfig || !item.repeatConfig.enabled) return true;
    if (!item.repeatConfig.lastCompletedDate) return true; // ถ้าไม่เคยทำเลย ให้ถือว่าผ่านเงื่อนไข (พร้อมทำครั้งแรก)

    const lastDate = new Date(item.repeatConfig.lastCompletedDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // เคลียร์เวลาเพื่อเปรียบเทียบแค่วันที่
    lastDate.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(today.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays >= item.repeatConfig.interval;
}

/**
 * คำนวณเวลาที่เหลือจนกว่าจะทำซ้ำได้
 */
function getRepeatCountdown(item) {
    if (!item.repeatConfig || !item.repeatConfig.enabled || !item.repeatConfig.lastCompletedDate) return "";
    const lastDate = new Date(item.repeatConfig.lastCompletedDate);
    lastDate.setHours(0, 0, 0, 0);

    const nextRepeatDate = new Date(lastDate.getTime() + item.repeatConfig.interval * 24 * 60 * 60 * 1000);
    nextRepeatDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = nextRepeatDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const targetDayName = dayNames[nextRepeatDate.getDay()];
        return `Starts ${targetDayName} (in ${diffDays} ${diffDays === 1 ? 'day' : 'days'})`;
    }
    
    return ""; 
} 

// --- Smart Flow Dependencies Modal ---
function initSmartFlowDependenciesModal() {
    if (document.getElementById('smart-flow-deps-modal')) return;

    const modalHTML = `
        <div class="modal-overlay" id="smart-flow-deps-modal" style="z-index: 12000;">
            <div class="modal-content" style="width: 350px;">
                <h3 style="margin-top:0; font-size:18px; display:flex; align-items:center; gap:8px;">🔗 Set Dependencies</h3>
                <p style="font-size:12px; color:var(--text-muted); margin-bottom:15px;">Select steps that must be completed before this one:</p>
                
                <div id="sf-deps-list-container" style="max-height: 250px; overflow-y: auto; margin-bottom: 20px; display: flex; flex-direction: column; gap: 4px;">
                    <!-- Checkboxes will be inserted here -->
                </div>

                <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:8px;">
                    <button class="btn btn-outline" id="sf-btn-cancel-deps">Cancel</button> 
                    <button class="btn btn-primary" id="sf-btn-save-deps">Save Dependencies</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('smart-flow-deps-modal');
    document.getElementById('sf-btn-save-deps').onclick = saveSmartFlowDependencies;
    document.getElementById('sf-btn-cancel-deps').onclick = () => modal.style.display = 'none';
}

function openSmartFlowDependenciesModal(itemId) {
    editingFlowItemId = itemId;
    const currentItem = flowItems.find(fi => fi.id === itemId);
    if (!currentItem) return;

    const container = document.getElementById('sf-deps-list-container');
    container.innerHTML = '';

    flowItems.forEach((item, index) => {
        // ห้ามตั้งตัวเองเป็น Dependency
        if (item.id === itemId) return;

        const isChecked = currentItem.dependencies.includes(item.id) ? 'checked' : '';
        const label = document.createElement('label');
        label.className = 'tag-select-row';
        label.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px; border-radius:6px; cursor:pointer;';
        label.innerHTML = `
            <label class="google-task-checkbox">
                <input type="checkbox" class="sf-dep-checkbox" value="${item.id}" ${isChecked}>
                <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div>
            </label>
            <div style="flex:1;">
                <div style="font-size:13px; font-weight:700;">#${index + 1} ${item.title}</div>
                <div style="font-size:11px; color:var(--text-muted);">${item.description}</div>
            </div>
        `;
        container.appendChild(label);
    });

    if (container.innerHTML === '') {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:12px; font-style:italic;">No other steps available</p>';
    }

    document.getElementById('smart-flow-deps-modal').style.display = 'flex';
}

async function saveSmartFlowDependencies() {
    const currentItem = flowItems.find(fi => fi.id === editingFlowItemId);
    if (!currentItem) return;

    const selectedIds = [];
    document.querySelectorAll('#sf-deps-list-container .sf-dep-checkbox:checked').forEach(cb => {
        selectedIds.push(cb.value);
    });

    currentItem.dependencies = selectedIds;
    await saveFlow();
    document.getElementById('smart-flow-deps-modal').style.display = 'none';
    renderFlowList();
}

/**
 * 🎊 ฟังก์ชันสร้างเอฟเฟกต์พลุฉลอง (Confetti)
 */
function triggerFlowConfetti(originX, originY) {
    const colors = ['#2f80ed', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899'];
    const particleCount = 60;

    for (let i = 0; i < particleCount; i++) {
        const confetti = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = Math.random() * 8 + 4;
        
        confetti.style.cssText = `
            position: fixed;
            width: ${size}px;
            height: ${size}px;
            background-color: ${color};
            top: ${originY}px;
            left: ${originX}px;
            opacity: ${Math.random() * 0.5 + 0.5};
            transform: rotate(${Math.random() * 360}deg);
            z-index: 10000;
            pointer-events: none;
            border-radius: 2px;
        `;
        document.body.appendChild(confetti);

        const destinationX = (Math.random() - 0.5) * 500;
        const destinationY = (Math.random() - 0.5) * 500 - 150; 

        const animation = confetti.animate([
            { transform: `translate3d(0, 0, 0) scale(1) rotate(0deg)`, opacity: 1 },
            { transform: `translate3d(${destinationX}px, ${destinationY}px, 0) scale(0) rotate(${Math.random() * 1000}deg)`, opacity: 0 }
        ], {
            duration: 1200 + Math.random() * 800,
            easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)'
        });

        animation.onfinish = () => confetti.remove();
    }
}

/**
 * 🎵 สร้างเสียงฉลองพรีเมียมแบบ Arpeggio (C Major 7) ที่มีความกังวานยาวกว่าเดิม
 */
function playSuccessSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const playNote = (freq, start, duration, vol = 0.05) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(vol, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + duration);
        };
        const now = ctx.currentTime;
        // ✨ สร้างเสียงคอร์ดไล่ระดับที่มีความกังวาน (C Major 7)
        playNote(523.25, now, 2.0, 0.08);        // C5
        playNote(659.25, now + 0.1, 2.0, 0.06);  // E5
        playNote(783.99, now + 0.2, 2.0, 0.04);  // G5
        playNote(987.77, now + 0.3, 2.5, 0.03);  // B5 (โน้ตเสียงที่ทำให้ดูหรูหรา)
        playNote(1046.50, now + 0.4, 3.0, 0.02); // C6 (ปลายเสียง Shimmer)
    } catch (e) { console.error("Audio celebration failed", e); }
}

/**
 * 🔔 สร้างเสียงระฆัง "Zen Bell" นุ่มนวลเพื่อแจ้งเตือนเมื่อหมดเวลา Focus
 */
function playZenBell() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const playTone = (freq, start, duration, volume) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume, start + 0.02); // การโจมตีเสียงที่เร็วแต่ไม่กระชาก
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration); // การจางหายที่ยาวและนุ่มนวล
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + duration);
        };
        // ใช้ชุดความถี่ที่สร้างความรู้สึกสงบ (โทนเสียงสูงที่กังวาน)
        playTone(440, ctx.currentTime, 3, 0.3); // A4
        playTone(880, ctx.currentTime, 2, 0.1); // A5 (Overtone 1)
        playTone(1320, ctx.currentTime, 1.5, 0.05); // E6 (Overtone 2)
    } catch (e) { console.error("Zen Bell failed", e); }
}

/**
 * 🏷️ Popup สำหรับเพิ่มป้ายกำกับใหม่
 */
function showSfAddTagPopup(anchorEl) {
    const existing = document.getElementById('sf-add-tag-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'sf-add-tag-popup';
    popup.className = 'sf-focus-popup'; 
    popup.style.width = '180px';
    popup.style.visibility = 'hidden'; // ซ่อนเพื่อวัดขนาดก่อนจัดตำแหน่ง
    
    const rect = anchorEl.getBoundingClientRect();
    popup.innerHTML = `
        <div style="font-weight:800; font-size:12px; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
            <svg class="svg-icon-sm"><use href="#icon-tag"></use></svg> Create New Tag
        </div>
        <input type="text" id="sf-new-tag-input" class="settings-input" placeholder="Tag name..." style="padding:6px; font-size:13px; margin-bottom:10px;">
        <button class="btn btn-primary" id="sf-btn-confirm-add-tag" style="width:100%; justify-content:center; font-size:12px;">Add Tag</button>
    `;

    document.body.appendChild(popup);
    
    // 🟢 Smart Positioning: ป้องกันล้นขอบล่างและขอบขวา
    const popupHeight = popup.offsetHeight;
    let top = rect.bottom + 8;
    
    if (top + popupHeight > window.innerHeight - 10) top = rect.top - popupHeight - 8;
    // 🟢 Prevent top overflow
    top = Math.max(10, Math.min(top, window.innerHeight - popupHeight - 10));
    
    let left = rect.left;
    if (left + 180 > window.innerWidth) left = window.innerWidth - 190;

    popup.style.top = `${top}px`;
    popup.style.left = `${Math.max(10, left)}px`;
    popup.style.visibility = 'visible';

    const input = popup.querySelector('#sf-new-tag-input');
    input.focus();

    const handleAdd = () => {
        const val = input.value.trim();
        if (val) {
            const tagUpper = val.toUpperCase();
            // 1. บันทึกลงในรายการ Managed Tags เพื่อไม่ให้หายไปเมื่อเลิกกดกรอง
            if (!flowState.managedTags.some(t => t.toUpperCase() === tagUpper)) {
                flowState.managedTags.push(val);
            }
            // 2. เลือกกรองป้ายนี้ทันที
            if (!flowState.currentFilterTags.includes(tagUpper)) {
                flowState.currentFilterTags.push(tagUpper);
            }
            saveFlow().then(() => renderSmartFlow(document.getElementById('smart-flow-container')));
        }
        popup.remove();
    };

    popup.querySelector('#sf-btn-confirm-add-tag').onclick = handleAdd;
    input.onkeydown = (e) => { if (e.key === 'Enter') handleAdd(); };

    setTimeout(() => {
        const close = (e) => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 0);
}

/**
 * 🟢 ฟังก์ชันสำหรับแสดง Context Menu ของป้ายกำกับ Smart Flow
 */
function showSfTagContextMenu(e, tag) {
    e.preventDefault();
    e.stopPropagation();
    closeSfTagContextMenu(); // ปิดเมนูเก่าก่อน

    const btn = e.currentTarget;

    const menu = document.createElement('div');
    menu.id = 'sf-tag-context-menu';
    menu.style.cssText = `
        position: absolute;
        visibility: hidden;
        background: var(--bg-card, #fff);
        border: 1px solid var(--border-color, #e1e1e1);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 4px;
        min-width: 120px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
    `;

    menu.innerHTML = `
        <button class="menu-item" id="sf-ctx-edit-tag" style="display:flex; align-items:center; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:var(--text-main); text-align:left; border-radius:4px;">
            <svg class="svg-icon-sm" style="margin-right:8px;"><use href="#icon-pencil"></use></svg> Edit
        </button>
        <div style="height:1px; background:var(--border-color); margin: 4px 8px;"></div>
        <button class="menu-item" id="sf-ctx-delete-tag" style="display:flex; align-items:center; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:#dc2626; text-align:left; border-radius:4px;">
            <svg class="svg-icon-sm delete-btn-red" style="margin-right:8px;"><use href="#icon-trash"></use></svg> Delete
        </button>
    `;

    document.body.appendChild(menu);

    // Smart Positioning
    const rect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    let top = rect.bottom + window.scrollY;
    if (top + menuRect.height > viewportHeight) {
        top = rect.top - menuRect.height + window.scrollY;
    }

    menu.style.top = `${top}px`;
    
    // 🟢 ป้องกันล้นขอบซ้าย/ขวา
    let left = rect.right + window.scrollX - menuRect.width;
    if (left + menuRect.width > window.innerWidth) left = window.innerWidth - menuRect.width - 10;
    if (left < 10) left = 10;

    menu.style.left = `${left}px`;
    menu.style.visibility = 'visible';

    // Hover effects
    menu.querySelectorAll('.menu-item').forEach(b => {
        b.addEventListener('mouseenter', () => b.style.backgroundColor = 'var(--hover-bg, #f1f1ef)');
        b.addEventListener('mouseleave', () => b.style.background = 'transparent');
    });

    // Actions
    document.getElementById('sf-ctx-edit-tag').addEventListener('click', () => {
        closeSfTagContextMenu();
        const newName = prompt(`Rename tag "${tag}" to:`, tag);
        if (newName && newName.trim() !== "" && newName.trim() !== tag) {
            const validName = newName.trim();
            updateSfTagName(tag, validName);
        }
    });

    document.getElementById('sf-ctx-delete-tag').addEventListener('click', () => {
        closeSfTagContextMenu();
        if (confirm(`Delete tag "${tag}" from all Smart Flow items?`)) {
            deleteSfTag(tag);
        }
    });
}

function closeSfTagContextMenu() {
    const existing = document.getElementById('sf-tag-context-menu');
    if (existing) existing.remove();
}

function updateSfTagName(oldName, newName) {
    // 1. อัปเดตใน managedTags
    const managedIdx = flowState.managedTags.findIndex(t => t.toUpperCase() === oldName.toUpperCase());
    if (managedIdx > -1) {
        flowState.managedTags[managedIdx] = newName;
    }

    // 2. อัปเดตใน flowItems
    flowItems.forEach(item => {
        if (item.tags) {
            item.tags = item.tags.map(t => t.toUpperCase() === oldName.toUpperCase() ? newName : t);
        }
    });

    // 3. อัปเดตใน currentFilterTags
    flowState.currentFilterTags = flowState.currentFilterTags.map(t => t.toUpperCase() === oldName.toUpperCase() ? newName.toUpperCase() : t);

    saveFlow().then(() => renderSmartFlow(document.getElementById('smart-flow-container')));
}

/**
 * 📄 คัดลอก Workflow Step
 * @param {string} originalId - ID ของ Step ต้นฉบับที่ต้องการคัดลอก
 */
function duplicateFlowItem(originalId) {
    const originalItemIndex = flowItems.findIndex(fi => fi.id === originalId);
    if (originalItemIndex === -1) return;

    const originalItem = flowItems[originalItemIndex];
    // สร้างสำเนาแบบ Deep Copy เพื่อให้ข้อมูลแยกจากต้นฉบับอย่างสมบูรณ์
    const duplicatedItem = JSON.parse(JSON.stringify(originalItem));

    // กำหนด ID ใหม่ที่ไม่ซ้ำกัน
    duplicatedItem.id = 'flow-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    duplicatedItem.isCompleted = false; // รีเซ็ตสถานะเป็นยังไม่เสร็จ
    delete duplicatedItem.isFailed;      // ล้างสถานะล้มเหลว
    if (duplicatedItem.repeatConfig) duplicatedItem.repeatConfig.lastCompletedDate = null; // รีเซ็ตวันที่ทำล่าสุด

    flowItems.splice(originalItemIndex + 1, 0, duplicatedItem); // แทรก Step ที่คัดลอกไว้ต่อจาก Step ต้นฉบับ
    saveFlow().then(renderFlowList);
}

/**
 * 🍬 สร้างเสียง 'Pop' เบาๆ เพื่อเป็นสัญญาณว่า Mini Popup ปรากฏแล้ว
 */
function playPopSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        // เริ่มต้นด้วยความถี่ต่ำแล้วพุ่งขึ้นสูงอย่างรวดเร็วเพื่อให้เกิดเสียง Pop
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01); // ตั้งค่าระดับเสียงที่ 0.08 เพื่อให้ดูนุ่มนวล
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
        console.error("Pop sound playback failed", e);
    }
}

function deleteSfTag(tagName) {
    // 1. ลบออกจาก managedTags
    flowState.managedTags = flowState.managedTags.filter(t => t.toUpperCase() !== tagName.toUpperCase());

    // 2. ลบออกจาก flowItems
    flowItems.forEach(item => {
        if (item.tags) {
            item.tags = item.tags.filter(t => t.toUpperCase() !== tagName.toUpperCase());
        }
    });

    // 3. ลบออกจาก currentFilterTags
    flowState.currentFilterTags = flowState.currentFilterTags.filter(t => t.toUpperCase() !== tagName.toUpperCase());

    saveFlow().then(() => renderSmartFlow(document.getElementById('smart-flow-container')));
}