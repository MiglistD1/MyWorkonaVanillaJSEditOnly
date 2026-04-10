import Sortable from '../sortable.esm.js';
import { svgEdit, svgTrashRed, svgRepeat } from '../core/icons.js';
import { getCurrentSpace, saveData, getShortDate, getAppSettings, setCurrentSpaceId, getSpaces, getFilterTags, loadData, getGlobalLaunchers, getLauncherTags, getCurrentSpaceId, getFilterMode } from '../core/storage.js';
import { generateMiniTagsBtn, generateTaskHTML, attachSubtaskEventListeners, attachTaskInlineEditListeners, handleTagAutocomplete, applySyntaxHighlighting } from '../core/ui-helpers.js';
import { onSnapshot } from '../core/lib/firebase-firestore.js';
import { checkAndResetHabits, renderHabitList } from './habitSheet.js';
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../core/calendarSync.js';

// State & Callbacks
/** 🟢 Helper: ตรวจสอบว่ากำลังโฟกัสที่ Element ที่พิมพ์ได้หรือไม่ */
export function isAnyEditableElementFocused() {
    const el = document.activeElement;
    if (!el) return false;
    return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

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

/** 🔄 Helper: Calculate next due date with End Conditions */
export function calculateNextDate(currentDateStr, repeatConfig, currentTask = {}) {
    if (!currentDateStr || !repeatConfig || !repeatConfig.isRepeating) return null;

    // 1. ตรวจสอบเงื่อนไขสิ้นสุดแบบ "ทำครบ X ครั้ง" (Occurrences)
    if (repeatConfig.endType === 'after_count') {
        const currentCount = currentTask.occurrenceCount || 1;
        if (currentCount >= repeatConfig.endCount) return null;
    }
    
    let date = new Date(currentDateStr);
    const today = new Date();
    const interval = parseInt(repeatConfig.interval) || 1;
    
    switch (repeatConfig.frequency) {
        case 'daily':
            date.setDate(date.getDate() + interval);
            break;
        case 'weekly':
            // เลือกวันในสัปดาห์ (0-6) ถ้าไม่ได้เลือกไว้ ให้ใช้ค่าวันปัจจุบัน
            const targetDays = (repeatConfig.daysOfWeek && repeatConfig.daysOfWeek.length > 0) 
                ? repeatConfig.daysOfWeek 
                : [date.getDay()];
            
            let found = false;
            let checkDate = new Date(date);
            // วนลูปหาใน 7 วันข้างหน้า
            for (let i = 1; i <= 7; i++) {
                checkDate.setDate(date.getDate() + i);
                if (targetDays.includes(checkDate.getDay())) {
                    // ถ้าวนกลับมาขึ้นสัปดาห์ใหม่ และมี Interval > 1 ให้บวกสัปดาห์เพิ่ม
                    if (checkDate.getDay() <= date.getDay() && interval > 1) {
                        checkDate.setDate(checkDate.getDate() + (interval - 1) * 7);
                    }
                    date = checkDate;
                    found = true;
                    break;
                }
            }
            // Fallback ถ้าหาไม่เจอจริงๆ (ไม่ควรเกิดขึ้น) ให้บวกไปตามจำนวนสัปดาห์ปกติ
            if (!found) date.setDate(date.getDate() + (interval * 7));
            break;
        case 'monthly':
            const targetDay = parseInt(repeatConfig.dayOfMonth) || date.getDate();
            date.setMonth(date.getMonth() + interval);
            // ปรับวันที่ให้ตรงกับที่ระบุ (JS จะจัดการเรื่องเดือนที่มี 28/30/31 วันให้โดยอัตโนมัติ)
            date.setDate(targetDay);
            break;
        case 'yearly':
            date.setFullYear(date.getFullYear() + interval);
            break;
    }
    
    const nextDateStr = date.toISOString().split('T')[0];

    // 2. ตรวจสอบเงื่อนไขสิ้นสุดแบบ "ตามวันที่" (On Date)
    if (repeatConfig.endType === 'on_date' && repeatConfig.endDate) {
        if (nextDateStr > repeatConfig.endDate) return null;
    }
    
    return nextDateStr;
}

// Function to toggle task focus
export function toggleTaskFocus(spaceId, taskIndex, isSubtask, parentIndex = null) {
    const settings = getAppSettings();
    const targetSpace = getSpaces().find(s => s.id === spaceId);
    if (!targetSpace) return;

    let task;
    if (isSubtask) {
        task = targetSpace.tasks[parentIndex]?.subtasks?.[taskIndex];
    } else {
        task = targetSpace.tasks[taskIndex];
    }

    if (task) {
        const isCurrentlyFocused = settings.focusedTask &&
                                   settings.focusedTask.spaceId === spaceId &&
                                   settings.focusedTask.createdAt === task.createdAt;

        settings.focusedTask = isCurrentlyFocused ? null : { spaceId: spaceId, createdAt: task.createdAt };
        saveData();
        onRenderCallback();
    }
}
let onRenderCallback = () => {};

let _fromCommandCenter = false;
// SVG Icons
const svgBreakLink = `<svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.72 6.72 3 10.44a4 4 0 0 0 5.66 5.66l1.42-1.42M13.56 13.56l1.42-1.42a4 4 0 0 0-5.66-5.66l-1.42 1.42M8 12h8M3 21l18-18"/></svg>`;

let editingTaskLocalIndex = null;
let editingSubtaskLocalId = null;
let editingLinkTaskIdx = null;
let editingLinkSubIdx = null;
let editingLinkSpaceId = null;
let addingSubtaskToIndex = null; // เก็บ Index ของงานหลักที่กำลังจะเพิ่มงานย่อย
let currentTaskRepeatConfig = { isRepeating: false, frequency: 'daily', interval: 1 };
let currentTaskCalendarSync = false;
let editingTaskRepeatConfig = { isRepeating: false, frequency: 'daily', interval: 1 };
let editingTemplateIndex = null; // 🟢 สำหรับจำว่ากำลังแก้ไข Template ไหนอยู่
let currentTemplateTasks = []; // ตัวแปรชั่วคราวขณะสร้าง Template

// Helpers

export function applyTaskSectionsOrder() {
    const todoWrapper = document.getElementById('todo-list-section-wrapper');
    const noteWrapper = document.getElementById('quick-note-wrapper');
    if (!todoWrapper || !noteWrapper) return;

    const settings = getAppSettings();
    const isMobile = window.innerWidth <= 768;
    // บนมือถือ: บังคับโน้ตกลับมาฝั่ง Tasks เสมอเพราะคอลัมน์ Tabs ถูกซ่อน
    const location = isMobile ? 'tasks' : (settings.quickNoteLocation || 'tasks');
    const order = settings.taskSectionOrder || 'todo-first';

    // 1. จัดการตำแหน่งคอลัมน์ (Column Placement)
    if (location === 'tabs') {
        const tabsBody = document.getElementById('tabs-card-body');
        if (tabsBody && noteWrapper.parentElement !== tabsBody) {
            tabsBody.appendChild(noteWrapper);
        }
        noteWrapper.style.order = '';
        noteWrapper.style.marginTop = '15px';
        
        const tasksBody = document.getElementById('tasks-card-body');
        if (tasksBody && todoWrapper.parentElement !== tasksBody) {
            tasksBody.appendChild(todoWrapper);
        }
        todoWrapper.style.order = '1';
        todoWrapper.style.marginTop = '0';
    } else {
        const tasksBody = document.getElementById('tasks-card-body');
        if (tasksBody) {
            if (noteWrapper.parentElement !== tasksBody) tasksBody.appendChild(noteWrapper);
            if (todoWrapper.parentElement !== tasksBody) tasksBody.appendChild(todoWrapper);
        }

        if (order === 'note-first') {
            noteWrapper.style.order = '1';
            todoWrapper.style.order = '2';
            noteWrapper.style.marginTop = '0';
            todoWrapper.style.marginTop = '15px';
        } else {
            todoWrapper.style.order = '1';
            noteWrapper.style.order = '2';
            todoWrapper.style.marginTop = '0';
            noteWrapper.style.marginTop = '15px';
        }
    }

    // 2. อัปเดตไอคอนปุ่ม (Toggle UI Icon)
    const btnMove = document.getElementById('btn-move-note-location');
    const btnNoteUp = document.getElementById('btn-order-note-up');
    const btnTodoUp = document.getElementById('btn-order-todo-up');

    // 🟢 กำหนดสไตล์ความโดดเด่น (Prominence Styles)
    const activeStyle = 'color: #2f80ed; background: rgba(47, 128, 237, 0.15); border: 1px solid rgba(47, 128, 237, 0.5); opacity: 1; box-shadow: 0 0 8px rgba(47, 128, 237, 0.2);';
    const inactiveStyle = 'color: var(--text-muted); background: transparent; border: 1px solid transparent; opacity: 0.5;';
    const baseBtnStyle = 'padding: 2px; width: 18px; height: 18px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;';

    if (btnMove) {
        if (location === 'tabs') {
            btnMove.innerHTML = `<svg class="svg-icon-sm" style="width:12px; height:12px;"><use href="#icon-chevron-right"></use></svg>`;
            btnMove.title = "Move back to Tasks Column";
        } else {
            btnMove.innerHTML = `<svg class="svg-icon-sm" style="width:12px; height:12px;"><use href="#icon-chevron-left"></use></svg>`;
            btnMove.title = "Move to Tabs Column";
        }
        // 🔵 ปรับสีปุ่มย้ายฝั่ง (Tabs/Tasks)
        btnMove.style.cssText = (location === 'tabs') ? `${baseBtnStyle} ${activeStyle}` : `${baseBtnStyle} ${inactiveStyle}`;
    }

    // 🔵 ปรับสีปุ่มลำดับ (Up/Down)
    if (btnNoteUp) btnNoteUp.style.cssText = (order === 'note-first' && location === 'tasks') ? `${baseBtnStyle} ${activeStyle}` : `${baseBtnStyle} ${inactiveStyle}`;
    if (btnTodoUp) btnTodoUp.style.cssText = (order === 'todo-first' && location === 'tasks') ? `${baseBtnStyle} ${activeStyle}` : `${baseBtnStyle} ${inactiveStyle}`;
}

/** 🎵 Sound Helpers สำหรับความรู้สึก Premium */
function playTaskAddedSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const playNote = (freq, start, duration, vol) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(vol, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + duration);
        };
        playNote(880, ctx.currentTime, 0.1, 0.05); // A5
        playNote(1320, ctx.currentTime + 0.05, 0.15, 0.03); // E6
    } catch (e) {}
}

/** 🔔 เสียงแจ้งเตือนเมื่องานเสร็จสิ้น (Catchy Chime) */
export function playTaskCompletedSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const playNote = (freq, start, duration, vol) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(vol, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + duration);
        };
        playNote(1046.50, ctx.currentTime, 0.1, 0.05); // C6
        playNote(1318.51, ctx.currentTime + 0.05, 0.2, 0.03); // E6
    } catch (e) {}
}

function playTrashSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
}

/** 📅 Helper: จัดรูปแบบวันที่ภาษาไทยสำหรับ Input Display */
function updateDateInputLabel(inputEl) {
    const label = inputEl.parentElement.querySelector('.date-display-label');
    if (!label) return;
    
    if (inputEl.value) {
        const d = new Date(inputEl.value);
        const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const yearBE = d.getFullYear() + 543;
        label.innerText = `${String(d.getDate()).padStart(2, '0')} ${m[d.getMonth()]} ${String(yearBE).slice(-2)}`;
        label.style.color = 'var(--primary-color)';
    } else {
        label.innerText = inputEl.placeholder || 'Set Date';
        label.style.color = 'var(--text-muted)';
    }
}

export function initTodoManager(callbacks) {
    onRenderCallback = callbacks.onRender;

    // 🟢 ระบบ Mobile Tools Menu (3 จุด)
    const mobileToolsBtn = document.getElementById('btn-mobile-todo-tools');
    if (mobileToolsBtn) {
        mobileToolsBtn.onclick = (e) => {
            e.stopPropagation();
            
            // 1. ตรวจสอบหรือสร้าง Popup Element (Singleton)
            let menuPopup = document.getElementById('sf-mobile-tools-popup');
            if (!menuPopup) {
                menuPopup = document.createElement('div');
                menuPopup.id = 'sf-mobile-tools-popup';
                menuPopup.className = 'mobile-tools-popup';
                document.body.appendChild(menuPopup);
            }

            const isActive = menuPopup.classList.contains('is-active');
            if (isActive) {
                menuPopup.classList.remove('is-active');
            } else {
                // 2. อัปเดตเนื้อหาและแสดงผล
                updateMobileToolsContent(menuPopup);
                menuPopup.classList.add('is-active');
            }
        };
    }

    /** 🛠️ ฟังก์ชันย่อยสำหรับวาดเนื้อหาเมนูเครื่องมือมือถือ */
    function updateMobileToolsContent(container) {
        const settings = getAppSettings();
        const space = getCurrentSpace();
        // หากอยู่ใน Command Center ให้ใช้ Default Object เพื่อไม่ให้ Code พัง
        const spaceRef = space || { showTaskActions: false, hideProminentTasks: true };
        const showExtra = settings.showExtraTaskSections !== false;

        const activeStyle = 'background: rgba(47, 128, 237, 0.15) !important; color: var(--primary-color) !important; border: 1.5px solid var(--primary-color) !important;';
        const inactiveStyle = 'background: var(--bg-body) !important; opacity: 0.5; border: 1px solid var(--border-color) !important;';

        container.innerHTML = `
            <div class="drag-handle-bar"></div>
            <div class="sf-input-bar-header" style="padding: 0 10px 15px 10px; border-bottom: 1px solid var(--border-color); margin-bottom: 15px;">
                <span style="font-size: 11px; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px;">✨ Todo Tools</span>
                <button class="btn-icon sf-btn-close-tools" style="font-size: 18px; font-weight: bold;">✕</button>
            </div>
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button class="sf-tool-btn" data-action="actions" style="flex:1; justify-content:center; ${spaceRef.showTaskActions ? activeStyle : inactiveStyle}">
                    <span class="toggle-actions-btn circle-icon ${spaceRef.showTaskActions ? 'expanded' : ''}" style="margin:0; pointer-events:none; border-color: currentColor;"></span>
                </button>
                <button class="sf-tool-btn" data-action="flags" style="flex:1; justify-content:center; ${!spaceRef.hideProminentTasks ? activeStyle : inactiveStyle}">
                    <svg class="svg-icon-sm" style="width:18px; height:18px;"><use href="#icon-flag"></use></svg>
                </button>
                <button class="sf-tool-btn" data-action="extra" style="flex:1; justify-content:center; ${showExtra ? activeStyle : inactiveStyle}">
                    <svg class="svg-icon-sm" style="width:18px; height:18px;"><use href="#icon-${showExtra ? 'eye' : 'eye-off'}"></use></svg>
                </button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <button class="sf-tool-btn" data-action="expand" style="background: var(--bg-body) !important; border: 1px solid var(--border-color) !important; justify-content: center;"><svg class="svg-icon-sm" style="margin-right:8px;"><use href="#icon-chevrons-down"></use></svg> ขยาย</button>
                <button class="sf-tool-btn" data-action="collapse" style="background: var(--bg-body) !important; border: 1px solid var(--border-color) !important; justify-content: center;"><svg class="svg-icon-sm" style="margin-right:8px;"><use href="#icon-chevrons-up"></use></svg> ยุบ</button>
            </div>
            <button class="sf-tool-btn" data-action="templates" style="width: 100%; justify-content: center; background: var(--bg-body) !important; border: 1px solid var(--border-color) !important;"><svg class="svg-icon-sm" style="margin-right:8px;"><use href="#icon-layers"></use></svg> Templates Manager</button>
        `;

        // ผูกเหตุการณ์ปุ่มปิด
        container.querySelector('.sf-btn-close-tools').onclick = () => container.classList.remove('is-active');

        // ผูกเหตุการณ์ปุ่มคำสั่ง (ใช้ Delegation ภายใน Container)
        container.querySelectorAll('.sf-tool-btn').forEach(btn => {
            btn.onclick = (ev) => {
                const action = btn.dataset.action;
                if (action === 'actions') document.getElementById('btn-toggle-task-actions')?.click();
                else if (action === 'flags') document.getElementById('btn-toggle-prominent-tasks')?.click();
                else if (action === 'extra') document.getElementById('btn-toggle-extra-sections')?.click();
                else if (action === 'expand') document.getElementById('btn-expand-all-subtasks')?.click();
                else if (action === 'collapse') document.getElementById('btn-collapse-all-subtasks')?.click();
                else if (action === 'templates') { container.classList.remove('is-active'); document.getElementById('btn-todo-templates')?.click(); }
                
                if (action !== 'templates') setTimeout(() => updateMobileToolsContent(container), 50);
            };
        });
    }

    // 🟢 ระบบปิดเมนูเมื่อคลิกนอกพื้นที่
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('sf-mobile-tools-popup');
        if (menu && menu.classList.contains('is-active') && !menu.contains(e.target) && !e.target.closest('#btn-mobile-todo-tools')) {
            menu.classList.remove('is-active');
        }
    });

    // 📅 ระบบตรวจสอบสถานะการเชื่อมต่อ Google Calendar
    const checkCalendarAuth = async () => {
        // TODO: Refactor Calendar Auth using chrome.identity later
        // const token = await getAuthToken(false);
        // const btns = [document.getElementById('connect-calendar-btn'), document.getElementById('master-connect-calendar-btn')];
        
        // btns.forEach(btn => {
        //     if (!btn) return;
        //     if (token) {
        //         btn.style.background = '#34a853';
        //         btn.style.color = '#ffffff';
        //         btn.title = "Google Calendar: Connected";
        //     } else {
        //         btn.style.background = '';
        //         btn.style.color = '';
        //         btn.title = "Connect Google Calendar";
        //     }
            
        //     btn.onclick = async (e) => {
        //         e.stopPropagation();
        //         if (!token) {
        //             const newToken = await getAuthToken(true);
        //             if (newToken) checkCalendarAuth();
        //         } else {
        //             alert("Google Calendar เชื่อมต่อเรียบร้อยแล้วผ่านระบบ Drive Sync ครับ");
        //         }
        //     };
        // });
    };

    // 🟢 Moved from top level to inside init
    const taskInput = document.getElementById('new-task-input');
    if (taskInput) {
        taskInput.addEventListener('input', (e) => handleTagAutocomplete(e, () => getCurrentSpace()?.tags || []));
        taskInput.addEventListener('focus', () => {
            if (taskInput.value.trim() === "") {
                const currentFilters = (getFilterTags() || []).filter(t => !['ALL', 'UNTAGGED', 'AI', 'HALF SCREEN'].includes(t.toUpperCase()));
                if (currentFilters.length > 0) {
                    taskInput.value = '#1 ';
                }
            }
        });
    }

    // 📅 ผูกเหตุการณ์อัปเดตวันที่ไทยให้กับทุกช่อง Input วันที่
    const dateInputs = ['new-task-date', 'edit-task-date-input', 'repeat-modal-due-date', 'repeat-end-date'];
    dateInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => updateDateInputLabel(el));
            // 🟢 บังคับให้ Picker แสดงผลเมื่อคลิกที่กรอบ หรือไอคอน
            const wrapper = el.closest('.date-wrapper');
            if (wrapper) {
                wrapper.addEventListener('click', () => {
                    try { el.showPicker(); } catch (err) { el.focus(); el.click(); }
                });
            }
        }
    });

    // 🟢 Inject CSS สำหรับ Task Entry Animation
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes taskEntry {
            from { opacity: 0; transform: translateY(-8px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .task-item { animation: taskEntry 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }

        /* ปรับปรุงความชัดเจนและพื้นที่สัมผัสของปุ่มลากบนมือถือ */
        @media (max-width: 768px) {
            .drag-handle { 
                display: flex !important; 
                opacity: 1 !important; 
                visibility: visible !important;
                min-width: 32px !important; 
                justify-content: center; 
                align-items: center;
                color: var(--primary-color) !important;
                cursor: grab;
            }
            .drag-handle svg { width: 16px; height: 16px; }
        }
    `;
    document.head.appendChild(style);

    // Listen for background sync completion
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'GOOGLE_TASKS_SYNC_COMPLETE') {
                // 🟢 โหลดข้อมูลใหม่จาก Storage ก่อนเรนเดอร์ เพื่อให้เห็นการเปลี่ยนแปลงจาก Google Tasks
                loadData(() => {
                    onRenderCallback(); 
                });
            }
        });
    }
    onRenderCallback = callbacks.onRender;

    // Event Listeners
    document.getElementById('btn-add-task').addEventListener('click', addTask);
    document.getElementById('new-task-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') addTask(); });

    // 🟢 Mobile FAB & Input Overlay Logic - จัดการตัวแปรให้ถูกต้อง
    const tasksColumn = document.getElementById('tasks-card'); // Use tasks-card as scrollable area
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const isCommandCenter = getCurrentSpaceId() === 0;

    if (isMobile && !isCommandCenter) { // 🟢 ไม่แสดง FAB ใน Command Center
        let fab = document.getElementById('sf-mobile-fab-add');
        if (!fab) { // สร้าง FAB ถ้ายังไม่มี
            fab = document.createElement('button');
            fab.id = 'sf-mobile-fab-add';
            fab.className = 'sf-mobile-fab';
            fab.innerHTML = '+';
            document.body.appendChild(fab); // ติดที่ Body เพื่อให้ลอยอยู่เสมอ

            // 🟢 เพิ่ม Logic ให้ FAB ซ่อนเมื่อเลื่อนลง และแสดงเมื่อเลื่อนขึ้น
            let lastScrollTop = 0;
            if (tasksColumn) {
                tasksColumn.addEventListener('scroll', () => {
                    const scrollTop = tasksColumn.scrollTop;
                    if (scrollTop > lastScrollTop && scrollTop > 50) { // เลื่อนลง
                        fab.style.transform = 'translateY(100px)'; // ซ่อนลงด้านล่าง
                    } else { // เลื่อนขึ้น
                        fab.style.transform = 'translateY(0)'; // แสดงขึ้นมา
                    }
                    lastScrollTop = scrollTop;
                });
            }
        }

        const taskInputBar = document.getElementById('new-task-input').closest('.task-input-bar'); // 🟢 หา Element โดยใช้ ID ที่แน่นอนกว่า

        // 🟢 เพิ่มปุ่มปิดและหัวข้อให้กับ Popup (Bottom Sheet) เพื่อความสะดวกในการใช้งาน
        if (taskInputBar && !taskInputBar.querySelector('.sf-input-bar-header')) {
            const header = document.createElement('div');
            header.className = 'sf-input-bar-header';
            header.innerHTML = `
                <span style="font-size: 10px; font-weight: 900; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; display:flex; align-items:center; gap:4px;">✨ New Task</span>
                <button class="btn-icon sf-btn-close-input" style="padding: 4px 8px; opacity: 0.8; font-size: 18px; color: var(--text-main); font-weight: bold;">✕</button>
            `;
            taskInputBar.prepend(header);
            
            header.querySelector('.sf-btn-close-input').onclick = (e) => {
                e.stopPropagation();
                taskInputBar.classList.remove('is-active');
                if (fab) fab.classList.remove('is-hidden');
            };
        }

        // 🟢 สร้าง Mobile FAB Menu
        let fabMenu = document.getElementById('sf-mobile-fab-menu');
        if (!fabMenu) {
            fabMenu = document.createElement('div');
            fabMenu.id = 'sf-mobile-fab-menu';
            fabMenu.className = 'mobile-tools-popup sf-mobile-fab-menu'; // ใช้สไตล์เดียวกับ mobile-tools-popup
            fabMenu.innerHTML = `
                <div class="drag-handle-bar"></div>
                <button id="sf-fab-menu-add-task" style="display:flex; align-items:center; gap:12px;"><svg class="svg-icon-lg" style="width:20px; height:20px;"><use href="#icon-pencil"></use></svg> Add new task</button>
                <button id="sf-fab-menu-templates" style="display:flex; align-items:center; gap:12px;"><svg class="svg-icon-lg" style="width:20px; height:20px;"><use href="#icon-layers"></use></svg> Templates</button>
            `;
            document.body.appendChild(fabMenu);

            // Event Listener สำหรับ FAB Menu
            fabMenu.querySelector('#sf-fab-menu-add-task').onclick = (e) => {
                e.stopPropagation();
                fabMenu.classList.remove('is-active'); // ซ่อนเมนู
                taskInputBar.classList.add('is-active'); // แสดงแถบพิมพ์
                document.getElementById('new-task-input').focus();
                fab.classList.add('is-hidden'); // ซ่อน FAB ชั่วคราวเมื่อแถบพิมพ์เปิด
            };
            fabMenu.querySelector('#sf-fab-menu-templates').onclick = (e) => {
                e.stopPropagation();
                fabMenu.classList.remove('is-active');
                document.getElementById('btn-todo-templates')?.click(); // เปิด Modal Templates
                fab.classList.remove('is-hidden'); // ซ่อน FAB ชั่วคราวเมื่อแถบพิมพ์เปิด
            };

            // 🟢 ปิด FAB Menu เมื่อคลิกนอกพื้นที่
            document.addEventListener('click', (e) => {
                if (!fabMenu.contains(e.target) && fabMenu.classList.contains('is-active')) {
                    fabMenu.classList.remove('is-active');
                }
            });

            // 🟢 Drag Logic for FAB Menu (Bottom Sheet)
            const fabMenuHeader = fabMenu.querySelector('.drag-handle-bar');
            let isDraggingMenu = false;
            let startY = 0;
            let initialY = 0;

            if (fabMenuHeader) {
                fabMenuHeader.addEventListener('touchstart', (e) => {
                    if (fabMenu.classList.contains('is-active')) {
                        isDraggingMenu = true;
                        startY = e.touches[0].clientY;
                        initialY = fabMenu.getBoundingClientRect().top;
                        fabMenu.style.transition = 'none'; // ปิด transition ขณะลาก
                    }
                }, { passive: true });

                document.addEventListener('touchmove', (e) => {
                    if (!isDraggingMenu) return;
                    const currentY = e.touches[0].clientY;
                    const dy = currentY - startY;
                    const newTop = Math.max(window.innerHeight / 2, initialY + dy); // ไม่ให้ลากขึ้นสูงเกินครึ่งจอ
                    fabMenu.style.transform = `translateY(${newTop - fabMenu.getBoundingClientRect().height}px)`;
                }, { passive: true });

                document.addEventListener('touchend', () => {
                    if (isDraggingMenu) {
                        isDraggingMenu = false;
                        fabMenu.style.transition = ''; // เปิด transition คืน
                        const currentPos = fabMenu.getBoundingClientRect().top;
                        if (currentPos > window.innerHeight * 0.7) { // ถ้าลากลงเกินครึ่ง ให้ปิดเมนู
                            fabMenu.classList.remove('is-active');
                        } else {
                            fabMenu.style.transform = 'translateY(0)'; // Snap กลับไปที่เดิม
                        }
                    }
                });
            }
        }

        // 🟢 Fix: FAB Directly opens task input bar and focuses the field for immediate typing
        fab.onclick = (e) => {
            e.stopPropagation();
            const bar = document.getElementById('new-task-input')?.closest('.task-input-bar');
            if (bar) bar.classList.add('is-active');
            document.getElementById('new-task-input')?.focus();
            fab.classList.add('is-hidden');
        };

        // คลิกที่อื่นเพื่อซ่อนแถบพิมพ์ (ยกเว้นในตัวแถบเอง)
        document.addEventListener('click', (e) => {
            if (taskInputBar && !taskInputBar.contains(e.target) && taskInputBar.classList.contains('is-active')) {
                taskInputBar.classList.remove('is-active');
                fab.classList.remove('is-hidden');
            }
            if (!fabMenu.contains(e.target) && fabMenu.classList.contains('is-active')) {
                fabMenu.classList.remove('is-active');
                fab.classList.remove('is-hidden');
            }

        });
    }

    // 🟢 Template System Initialization
    initTodoTemplateSystem();

    // 🔄 Repeating Tasks Modal Logic
    const repeatModal = document.getElementById('repeat-settings-modal');
    const repeatEnabled = document.getElementById('repeat-enabled');
    const repeatOptions = document.getElementById('repeat-options');
    const weeklyOptions = document.getElementById('repeat-weekly-options');
    const monthlyOptions = document.getElementById('repeat-monthly-options');
    const freqSelect = document.getElementById('repeat-frequency');
    
    if (repeatEnabled) {
        repeatEnabled.onchange = () => { repeatOptions.style.display = repeatEnabled.checked ? 'block' : 'none'; };
    }

    if (freqSelect) {
        freqSelect.onchange = () => {
            weeklyOptions.style.display = freqSelect.value === 'weekly' ? 'block' : 'none';
            monthlyOptions.style.display = freqSelect.value === 'monthly' ? 'block' : 'none';
        };
    }

    // Day pill selection logic
    document.getElementById('repeat-days-container').onclick = (e) => {
        const pill = e.target.closest('.repeat-day-pill');
        if (pill) pill.classList.toggle('active');
    };

    const syncRepeatUI = (config) => {
        repeatEnabled.checked = config.isRepeating;
        freqSelect.value = config.frequency;
        document.getElementById('repeat-interval').value = config.interval;
        document.getElementById('repeat-day-of-month').value = config.dayOfMonth || 1;
        
        // 📅 Sync Date from external input to Modal
        const mode = repeatModal.dataset.mode;
        const externalDate = (mode === 'add') 
            ? document.getElementById('new-task-date').value 
            : document.getElementById('edit-task-date-input').value;
        document.getElementById('repeat-modal-due-date').value = externalDate;
        updateDateInputLabel(document.getElementById('repeat-modal-due-date'));

        // Ends On UI
        const endType = config.endType || 'never';
        document.querySelector(`input[name="repeat-end"][value="${endType}"]`).checked = true;
        document.getElementById('repeat-end-date').value = config.endDate || "";
        document.getElementById('repeat-end-count').value = config.endCount || 1;
        
        // Reset and set day pills
        document.querySelectorAll('.repeat-day-pill').forEach((p, i) => {
            p.classList.toggle('active', config.daysOfWeek?.includes(i));
        });

        repeatOptions.style.display = config.isRepeating ? 'block' : 'none';
        weeklyOptions.style.display = config.frequency === 'weekly' ? 'block' : 'none';
        monthlyOptions.style.display = config.frequency === 'monthly' ? 'block' : 'none';
    };

    // 📅 ระบบ Toggle Sync Calendar สำหรับช่อง Add Task
    const quickCalBtn = document.getElementById('btn-task-calendar-sync');
    if (quickCalBtn) {
        quickCalBtn.onclick = () => {
            currentTaskCalendarSync = !currentTaskCalendarSync;
            quickCalBtn.style.color = currentTaskCalendarSync ? 'var(--primary-color)' : '#4285f4';
            quickCalBtn.style.borderColor = currentTaskCalendarSync ? 'var(--primary-color)' : 'var(--border-color)';
            quickCalBtn.style.background = currentTaskCalendarSync ? 'rgba(47, 128, 237, 0.1)' : 'var(--bg-body)';
        };
    }

    document.getElementById('btn-task-repeat').onclick = () => {
        syncRepeatUI(currentTaskRepeatConfig);
        repeatModal.dataset.mode = 'add';
        repeatModal.style.display = 'flex';
    };

    document.getElementById('btn-edit-task-repeat').onclick = () => {
        syncRepeatUI(editingTaskRepeatConfig);
        repeatModal.dataset.mode = 'edit';
        repeatModal.style.display = 'flex';
    };

    document.getElementById('btn-save-repeat-settings').onclick = () => {
        const mode = repeatModal.dataset.mode;
        const modalDate = document.getElementById('repeat-modal-due-date').value;

        // 🔴 Validation: บังคับให้ตั้งวันที่หากมีการใช้ Repeat
        if (repeatEnabled.checked) {
            if (!modalDate) {
                alert("⚠️ โปรดตั้งค่า 'กำหนดส่ง' (Due Date) ก่อนเปิดใช้งานการทำซ้ำ (Repeat)\nระบบต้องการวันที่เริ่มต้นเพื่อคำนวณรอบถัดไปครับ");
                return;
            }
        }

        // 📅 Sync Date back to external input
        if (mode === 'add') {
            document.getElementById('new-task-date').value = modalDate;
        } else {
            document.getElementById('edit-task-date-input').value = modalDate;
        }

        const selectedDays = Array.from(document.querySelectorAll('.repeat-day-pill.active')).map(p => parseInt(p.dataset.day));
        const endType = document.querySelector('input[name="repeat-end"]:checked').value;
        const config = { 
            isRepeating: repeatEnabled.checked, 
            frequency: freqSelect.value, 
            interval: parseInt(document.getElementById('repeat-interval').value) || 1,
            daysOfWeek: selectedDays,
            dayOfMonth: parseInt(document.getElementById('repeat-day-of-month').value) || 1,
            endType: endType,
            endDate: document.getElementById('repeat-end-date').value,
            endCount: parseInt(document.getElementById('repeat-end-count').value) || 1
        };
        if (repeatModal.dataset.mode === 'add') { currentTaskRepeatConfig = config; document.getElementById('btn-task-repeat').style.color = config.isRepeating ? 'var(--primary-color)' : 'inherit'; }
        else { editingTaskRepeatConfig = config; document.getElementById('btn-edit-task-repeat').style.color = config.isRepeating ? 'var(--primary-color)' : 'inherit'; }
        repeatModal.style.display = 'none';
    };

    document.getElementById('btn-close-repeat-modal').onclick = () => repeatModal.style.display = 'none';

    // 🟢 Toggle Extra Sections (Archive/Trash/Repeat)
    const btnToggleExtra = document.getElementById('btn-toggle-extra-sections');
    if (btnToggleExtra) {
        btnToggleExtra.onclick = () => {
            const settings = getAppSettings();
            settings.showExtraTaskSections = !settings.showExtraTaskSections;
            saveData();
            onRenderCallback();
        };
    }

    // Toggle Global Prominent Visibility
    const toggleProminentBtn = document.getElementById('btn-toggle-prominent-tasks'); //
    if (toggleProminentBtn) {
        toggleProminentBtn.addEventListener('click', () => {
            const space = getCurrentSpace();
            if (!space) return;
            space.hideProminentTasks = !space.hideProminentTasks;
            saveData();
            onRenderCallback();
        });
    }

        // Toggle Task Actions Visibility
    const toggleTaskActionsBtn = document.getElementById('btn-toggle-task-actions');
    if (toggleTaskActionsBtn) {
        toggleTaskActionsBtn.addEventListener('click', () => {
            const space = getCurrentSpace();
            if (!space) return;
            space.showTaskActions = !space.showTaskActions;
            saveData();
            onRenderCallback();
        });
    }

    // 🟢 Expand All Subtasks
    const btnExpandAll = document.getElementById('btn-expand-all-subtasks');
    if (btnExpandAll) {
        btnExpandAll.onclick = () => {
            const space = getCurrentSpace();
            if (!space || !space.tasks) return;
            space.tasks.forEach(t => { if (t.subtasks && t.subtasks.length > 0) t.subtasksHidden = false; });
            saveData(); onRenderCallback();
        };
    }

    // 🟢 Collapse All Subtasks
    const btnCollapseAll = document.getElementById('btn-collapse-all-subtasks');
    if (btnCollapseAll) {
        btnCollapseAll.onclick = () => {
            const space = getCurrentSpace();
            if (!space || !space.tasks) return;
            space.tasks.forEach(t => { if (t.subtasks && t.subtasks.length > 0) t.subtasksHidden = true; });
            saveData(); onRenderCallback();
        };
    }

        // --- Google Keep Mode Logic ---
    const keepToggle = document.getElementById('quick-note-keep-toggle');
    const keepEdit = document.getElementById('quick-note-keep-edit');
    const keepExternal = document.createElement('button'); // สร้างปุ่มเพิ่มสำหรับเปิด Tab ใหม่
    const saveKeepBtn = document.getElementById('save-keep-url-btn');
    const keepUrlInput = document.getElementById('keep-url-input');
    const keepIframe = document.getElementById('keep-iframe');
    const keepSetup = document.getElementById('keep-setup-container');
    const noteContainer = document.getElementById('quick-note-body');
    const noteToolbar = document.querySelector('.note-toolbar');
    const workspaceNote = document.getElementById('workspace-note');

    // 🟢 รวมกลุ่มปุ่มและใส่พื้นหลังสีส้ม
    let keepGroup = document.getElementById('quick-note-keep-group');
    if (!keepGroup) {
        keepGroup = document.createElement('div');
        keepGroup.id = 'quick-note-keep-group';
        keepGroup.style = 'display: flex; gap: 2px; background: rgba(245, 158, 11, 0.15); padding: 2px; border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.2); align-items: center;';
        keepToggle.parentNode.insertBefore(keepGroup, keepToggle);
        keepGroup.appendChild(keepToggle);
    }

    // เตรียมปุ่ม External ถ้ายังไม่มี
    if (!document.getElementById('quick-note-keep-external')) {
        keepExternal.id = 'quick-note-keep-external';
        keepExternal.className = 'btn-icon';
        keepExternal.innerHTML = `<svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="11" x2="21" y2="3"></line></svg>`;
        keepGroup.appendChild(keepExternal);
        if (keepEdit) keepGroup.appendChild(keepEdit);
    }

    const renderKeepLogic = () => {
        const space = getCurrentSpace();
        if (!space) return;

        const isKeepMode = space.quickNoteKeepMode || false;
        const url = space.quickNoteKeepUrl || "";

        if (!isKeepMode) {
            workspaceNote.style.display = 'block';
            noteToolbar.style.display = 'flex';
            keepSetup.style.display = 'none';
            keepIframe.style.display = 'none';
            keepToggle.style.opacity = '0.5';
            if (keepEdit) keepEdit.style.display = 'none';
            document.getElementById('quick-note-keep-external').style.display = 'none';
            if (noteContainer) noteContainer.classList.remove('keep-mode-active');
        } else {
            workspaceNote.style.display = 'none';
            noteToolbar.style.display = 'none';
            keepToggle.style.opacity = '1';
            if (keepEdit) keepEdit.style.display = 'inline-flex';
            document.getElementById('quick-note-keep-external').style.display = 'inline-flex';
            if (noteContainer) noteContainer.classList.add('keep-mode-active');
            
            if (!url) {
                keepSetup.style.display = 'flex';
                keepIframe.style.display = 'none';
            } else {
                keepSetup.style.display = 'none';
                keepIframe.style.display = 'block';
                if (keepIframe.src !== url) {
                    keepIframe.src = 'about:blank';
                    setTimeout(() => { keepIframe.src = url; }, 50);
                }
            }
        }
    };

    if (keepEdit) {
        keepEdit.onclick = () => {

            const space = getCurrentSpace();
            if (!space) return;
            const newUrl = prompt("Enter new Google Keep URL for this Space:", space.quickNoteKeepUrl || "");
            if (newUrl !== null && newUrl.trim() !== "") {
                space.quickNoteKeepUrl = newUrl.trim();
                saveData();
                renderKeepLogic();
            }
        };
    }

    const btnExternal = document.getElementById('quick-note-keep-external');
    if (btnExternal) {
        btnExternal.onclick = () => {
            const space = getCurrentSpace();
            if (space && space.quickNoteKeepUrl) window.open(space.quickNoteKeepUrl, '_blank');
        };
    }

    keepToggle.onclick = () => {
        const space = getCurrentSpace();
        if (!space) return;
        space.quickNoteKeepMode = !(space.quickNoteKeepMode || false);
        saveData();
        renderKeepLogic();
    };

    saveKeepBtn.onclick = () => {
        const val = keepUrlInput.value.trim();
        const space = getCurrentSpace();
        if (val && space) {
            space.quickNoteKeepUrl = val;
            saveData();
            renderKeepLogic();
        }
    };

    renderKeepLogic();

    // Section Order Events
    const btnNoteUp = document.getElementById('btn-order-note-up');
    const btnTodoUp = document.getElementById('btn-order-todo-up');
    const btnMoveLocation = document.getElementById('btn-move-note-location');
    if (btnNoteUp && btnTodoUp) {
        btnNoteUp.onclick = () => {
            getAppSettings().taskSectionOrder = 'note-first';
            saveData(); applyTaskSectionsOrder();
        };
        btnTodoUp.onclick = () => {
            getAppSettings().taskSectionOrder = 'todo-first';
            saveData(); applyTaskSectionsOrder();
        };
    }
    if (btnMoveLocation) {
        btnMoveLocation.onclick = () => {
            const settings = getAppSettings();
            const current = settings.quickNoteLocation || 'tasks';
            settings.quickNoteLocation = (current === 'tasks') ? 'tabs' : 'tasks';
            saveData();
            applyTaskSectionsOrder();
        };
    }
    applyTaskSectionsOrder();

    // Edit Modal Events
    document.getElementById('btn-close-task-edit').addEventListener('click', () => { document.getElementById('task-edit-modal').style.display = 'none'; }); //
    document.getElementById('btn-save-task-edit').addEventListener('click', saveEditedTask);
    
    // Task Link Modal Events
    document.getElementById('btn-save-task-link')?.addEventListener('click', saveTaskLink);
    document.getElementById('btn-close-link-modal')?.addEventListener('click', () => { 
        document.getElementById('task-link-modal').style.display = 'none'; 
    });

    // 🟢 New: Clear Calendar Sync Tasks Button
    const btnClearCal = document.getElementById('btn-clear-calendar-sync');
    if (btnClearCal) {
        btnClearCal.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const space = getCurrentSpace();
            if (space && confirm("ต้องการล้างรายการงานที่ซิงค์ปฏิทินและเสร็จสิ้นแล้วทั้งหมดหรือไม่?")) {
                space.tasks = space.tasks.filter(t => !(t.completed && t.calendarEventId));
                saveData(); onRenderCallback();
            }
        });
    }

    // รันการตรวจสอบสถานะเริ่มต้น
    setTimeout(checkCalendarAuth, 1000);

    // Note Events
    document.querySelectorAll('.custom-color-slot').forEach((picker, index) => {
        picker.addEventListener('input', (e) => { document.execCommand('foreColor', false, e.target.value); getCurrentSpace().note = document.getElementById('workspace-note').innerHTML; getAppSettings().quickColors[index] = e.target.value; saveData(); });
    });
    // workspaceNote ถูกประกาศไว้แล้วด้านบน
    document.getElementById('btn-undo-note').addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('undo', false, null); getCurrentSpace().note = document.getElementById('workspace-note').innerHTML; saveData(); });
    document.querySelectorAll('.note-toolbar select').forEach(el => { el.addEventListener('change', (e) => { document.execCommand(e.target.dataset.cmd, false, e.target.value); getCurrentSpace().note = document.getElementById('workspace-note').innerHTML; saveData(); }); });
    
    workspaceNote.addEventListener('input', (e) => { 
        const content = e.target.innerHTML;
        getCurrentSpace().note = content; 
        saveData(); 
        // Sync local changes to Firestore
        setDoc(docRef, { content: content }, { merge: true });
    });

    // Setup real-time listener from Firestore
    onSnapshot(docRef, (snapshot) => {
        const data = snapshot.data();
        if (data && data.content !== undefined) {
            // Update UI only if content is different to avoid infinite loops and cursor jumping
            if (workspaceNote && workspaceNote.innerHTML !== data.content) {
                workspaceNote.innerHTML = data.content;
                const space = getCurrentSpace();
                if (space) space.note = data.content;
            }
        }
    });


    // 🟢 Smart Checkbox Logic for Workspace Note
    const CHECKBOX_HTML = '<label class="google-task-checkbox" contenteditable="false" style="display:inline-flex; align-items:center; margin-right:8px; vertical-align:middle;"><input type="checkbox"> <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div></label>&nbsp;';

    workspaceNote.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            
            const range = selection.getRangeAt(0);
            let line = range.startContainer;
            if (line.nodeType === 3) line = line.parentNode;
            line = line.closest('div, p') || line;

            // ตรวจสอบว่าบรรทัดปัจจุบันมี Checkbox หรือไม่
            if (line && line.querySelector('.google-task-checkbox')) {
                const text = line.textContent.trim();
                
                if (text === "") {
                    // กรณีบรรทัดว่าง: ลบ Checkbox ออกแล้วเปลี่ยนเป็นบรรทัดปกติ
                    e.preventDefault();
                    line.querySelector('.google-task-checkbox').remove();
                    if (line.innerHTML === "") line.innerHTML = "<br>";
                } else {
                    // กรณีมีข้อความ: สร้างบรรทัดใหม่พร้อม Checkbox
                    e.preventDefault();
                    document.execCommand('insertParagraph');
                    document.execCommand('insertHTML', false, CHECKBOX_HTML);
                }
                getCurrentSpace().note = workspaceNote.innerHTML;
                saveData();
            }
        }
    });

    // 🟢 บันทึกสถานะ Checked ลงใน HTML เพื่อให้ Persistence ทำงาน
    workspaceNote.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox' && e.target.closest('.google-task-checkbox')) {
            if (e.target.checked) {
                e.target.setAttribute('checked', 'checked');
            } else {
                e.target.removeAttribute('checked');
            }
            getCurrentSpace().note = workspaceNote.innerHTML;
            saveData();
        }
    });

    // 🟢 New Formatting Buttons for Workspace Note (Google Docs Style)
    const bindNoteCmd = (id, cmd, value = null) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                document.execCommand(cmd, false, value);
                getCurrentSpace().note = document.getElementById('workspace-note').innerHTML;
                saveData();
            });
        }
    };

    bindNoteCmd('btn-note-bold', 'bold');
    bindNoteCmd('btn-note-italic', 'italic');
    bindNoteCmd('btn-note-underline', 'underline');
    bindNoteCmd('btn-note-strikethrough', 'strikeThrough');
    bindNoteCmd('btn-note-bullet-list', 'insertUnorderedList');
    bindNoteCmd('btn-note-numbered-list', 'insertOrderedList');
    bindNoteCmd('btn-note-reset-format', 'removeFormat');
    bindNoteCmd('btn-note-left', 'justifyLeft');
    bindNoteCmd('btn-note-center', 'justifyCenter');
    bindNoteCmd('btn-note-right', 'justifyRight');
    bindNoteCmd('btn-note-indent', 'indent');
    bindNoteCmd('btn-note-outdent', 'outdent');
    bindNoteCmd('btn-note-hr', 'insertHorizontalRule');
    
    // Special Case: Checkbox
    const btnCheckbox = document.getElementById('btn-note-checkbox');
    if (btnCheckbox) {
        btnCheckbox.addEventListener('mousedown', (e) => {
            e.preventDefault();
            // ใช้ insertParagraph ก่อนเพื่อให้มั่นใจว่าเป็นบรรทัดใหม่ที่สะอาด แล้วค่อยใส่ Checkbox
            document.execCommand('insertParagraph');
            document.execCommand('insertHTML', false, CHECKBOX_HTML);
            getCurrentSpace().note = document.getElementById('workspace-note').innerHTML;
            saveData();
        });
    }

    // Clear Archive Button
    const btnClearArchive = document.getElementById('btn-clear-archive');
    if (btnClearArchive) {
        btnClearArchive.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); // ป้องกันไม่ให้ accordion พับเปิด-ปิดเมื่อกดลบ
            const space = getCurrentSpace();
            if (space && confirm("Clear all completed tasks?")) {
                space.tasks = space.tasks.filter(t => t && !t.completed);
                saveData();
                onRenderCallback();
            }
        });
    }

    // 🔄 Clear Repeating History Button
    const btnClearRepeating = document.getElementById('btn-clear-repeating-history');
    if (btnClearRepeating) {
        btnClearRepeating.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const space = getCurrentSpace();
            if (space && confirm("Clear all repeating task history? This won't affect pending tasks.")) {
                space.tasks = space.tasks.filter(t => !(t && (t.completed || t.isDeleted) && t.repeatConfig?.isRepeating));
                saveData();
                onRenderCallback();
            }
        });
    }

    // 🟢 Empty Trash Tasks Button
    const btnEmptyTrash = document.getElementById('btn-empty-tasks-trash');
    if (btnEmptyTrash) {
        btnEmptyTrash.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation(); // ป้องกันการพับ/เปิดของ Details เมื่อกดปุ่ม
            const space = getCurrentSpace();
            if (space && confirm("Empty Tasks Trash? This cannot be undone.")) {
                space.tasks = space.tasks.filter(t => !t.isDeleted);
                saveData();
                onRenderCallback();
            }
        });
    }

    // Delegation for Task List Actions
    const handleTaskClick = async (e) => {
        const space = getCurrentSpace();
        if (!space) return;
        
        // 🔘 Toggle Hide Pending Subtasks
        const hidePendingBtn = e.target.closest('.hide-pending-subtasks-btn');
        if (hidePendingBtn) {
            const idx = parseInt(hidePendingBtn.dataset.index);
            if (space.tasks[idx]) {
                space.tasks[idx].pendingSubtasksHidden = !space.tasks[idx].pendingSubtasksHidden;
                saveData();
                onRenderCallback();
            }
            return;
        }

        // 🔘 Toggle Hide Completed Subtasks
        const hideCompletedBtn = e.target.closest('.hide-completed-subtasks-btn');
        if (hideCompletedBtn) {
            const idx = parseInt(hideCompletedBtn.dataset.index);
            if (space.tasks[idx]) {
                space.tasks[idx].completedSubtasksHidden = !space.tasks[idx].completedSubtasksHidden;
                saveData();
                onRenderCallback();
            }
            return;
        }

        // NEW: Toggle Subtasks Visibility
        const toggleSubtasksBtn = e.target.closest('.toggle-subtasks-btn');
        if (toggleSubtasksBtn) {
            const idx = parseInt(toggleSubtasksBtn.dataset.index);
            if (space.tasks[idx]) {
                space.tasks[idx].subtasksHidden = !space.tasks[idx].subtasksHidden;
                saveData();
                onRenderCallback();
            }
            return; // Prevent other click handlers from firing
        }

        // Collapsible Toggle Logic
        const toggleBtn = e.target.closest('.toggle-actions-btn');
        if (toggleBtn) {
            // If global task actions are forced visible, do nothing with individual toggle
            if (space.showTaskActions) return;
            const collapsibleActions = toggleBtn.parentElement.querySelector('.collapsible-actions');
            if (collapsibleActions) {
                const isHidden = collapsibleActions.style.display === 'none';
                collapsibleActions.style.display = isHidden ? 'flex' : 'none';
                toggleBtn.classList.toggle('expanded');
            }
        }

        // 🔘 Close Actions Button
        const closeActionsBtn = e.target.closest('.close-actions-btn');
        if (closeActionsBtn) {
            const group = closeActionsBtn.closest('.item-action-group');
            const menu = group?.querySelector('.collapsible-actions');
            const toggle = group?.querySelector('.toggle-actions-btn');
            if (menu) menu.style.display = 'none';
            if (toggle) toggle.classList.remove('expanded');
            return;
        }

        // 🔘 Toggle Calendar Sync
        const calBtn = e.target.closest('.toggle-calendar-sync-btn');
        if (calBtn) {
            const idx = parseInt(calBtn.dataset.index);
            const pIdxAttr = calBtn.dataset.parentIndex;
            const pIdx = pIdxAttr !== undefined ? parseInt(pIdxAttr) : null;
            const task = (pIdx !== null) ? space.tasks[pIdx].subtasks[idx] : space.tasks[idx];

            if (task.calendarEventId) {
                const token = await getAuthToken(false);
                if (token) {
                    await deleteCalendarEvent(task.calendarEventId, token);
                    delete task.calendarEventId;
                    saveData(); onRenderCallback();
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
                        saveData(); onRenderCallback();
                    }
                }
            }
            return;
        }


        // 🔘 Toggle Subtask Specific Controls
        const subtaskMenuBtn = e.target.closest('.toggle-subtask-controls-btn');
        if (subtaskMenuBtn) {
            const idx = parseInt(subtaskMenuBtn.dataset.index);
            if (space.tasks[idx]) {
                space.tasks[idx].subtaskControlsOpen = !space.tasks[idx].subtaskControlsOpen;
                saveData();
                onRenderCallback();
            }
            return;
        }

        // 🔘 Archive Task Button (Main Task)
        if (e.target.closest('.archive-task-btn')) {
            const btn = e.target.closest('.archive-task-btn');
            const idx = parseInt(btn.getAttribute('data-index'));
            const task = space.tasks[idx];
            if (task) {
                task.completed = true;
                task.completedAt = Date.now();
                task.isProminent = false;
                // Auto-complete subtasks
                if (task.subtasks) {
                    task.subtasks.forEach(sub => { sub.completed = true; });
                }
                saveData(); onRenderCallback();
            }
            return;
        }

        // 🔘 Archive Subtask Button
        if (e.target.closest('.archive-subtask-btn')) {
            const btn = e.target.closest('.archive-subtask-btn');
            const pIdx = parseInt(btn.getAttribute('data-parent-index'));
            const sIdx = parseInt(btn.getAttribute('data-index'));
            const task = space.tasks[pIdx]?.subtasks?.[sIdx];
            if (task) {
                task.completed = true;
                saveData(); onRenderCallback();
            }
            return;
        }

        // Edit Task
        if (e.target.closest('.edit-task-text-btn')) {
            const idx = parseInt(e.target.closest('.edit-task-text-btn').getAttribute('data-index'));
            openTaskEditModal(idx);
        }
        // Delete Task
        if (e.target.closest('.delete-task-btn')) { 
            const idx = parseInt(e.target.closest('.delete-task-btn').getAttribute('data-index')); 
            const task = space.tasks[idx];
            task.isDeleted = true;
            task.deletedAt = Date.now();
            const days = getAppSettings().autoDeleteDays || 30;
            task.expiryAt = task.deletedAt + (days * 24 * 60 * 60 * 1000);
            task.completed = false; // เอากลับมาเป็นงานที่ยังไม่เสร็จเผื่อกู้คืน
            saveData(); onRenderCallback();
            triggerCloudSave();
        }
        // Restore Task
        // 🟢 NEW: Restore Task (from trash)
        if (e.target.closest('.restore-task-btn')) {
            const idx = parseInt(e.target.closest('.restore-task-btn').dataset.index);
            const task = space.tasks[idx];
            if (task) {
                task.isDeleted = false;
                task.deletedAt = null;
                task.expiryAt = null;
                if (task.subtasks) {
                    task.subtasks.forEach(sub => {
                        sub.isDeleted = false;
                        sub.deletedAt = null;
                        sub.expiryAt = null;
                    });
                }
                saveData();
                onRenderCallback();
            }
        }
        // Permanent Delete Task
        if (e.target.closest('.delete-task-perm-btn')) {
            const idx = parseInt(e.target.closest('.delete-task-perm-btn').dataset.index);
            if (confirm("Delete task permanently?")) {
                const task = space.tasks[idx];
                if (task.calendarEventId) {
                    getAuthToken(false).then(token => {
                        if (token) deleteCalendarEvent(task.calendarEventId, token);
                    });
                }
                space.tasks.splice(idx, 1);
                saveData(); onRenderCallback();
            }
        }
        // 🟢 NEW: Permanent Delete Subtask
        if (e.target.closest('.delete-subtask-perm-btn')) {
            const btn = e.target.closest('.delete-subtask-perm-btn');
            const pIdx = parseInt(btn.getAttribute('data-parent-index'));
            const sIdx = parseInt(btn.getAttribute('data-sub-index'));
            if (confirm("Delete subtask permanently?")) {
                const subtask = space.tasks[pIdx]?.subtasks?.[sIdx];
                if (subtask && subtask.calendarEventId) {
                    getAuthToken(false).then(token => {
                        if (token) deleteCalendarEvent(subtask.calendarEventId, token);
                    });
                }
                space.tasks[pIdx].subtasks.splice(sIdx, 1);
                saveData();
                onRenderCallback();
            }
        }


        // Task Link Click
        const linkBtn = e.target.closest('.task-link-btn');
        if (linkBtn) {
            const idx = parseInt(linkBtn.getAttribute('data-index'));
            const pIdxAttr = linkBtn.getAttribute('data-parent-index');
            const pIdx = pIdxAttr !== null ? parseInt(pIdxAttr) : null;
            
            const task = pIdx !== null ? space.tasks[pIdx].subtasks[idx] : space.tasks[idx];
            
            if (task.linkData && task.linkData.url) {
                e.preventDefault();
                if (task.linkData.isSideview && typeof chrome !== 'undefined' && chrome.sidePanel) {
                    chrome.sidePanel.setOptions({ path: task.linkData.url, enabled: true });
                    chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
                } else {
                    window.open(task.linkData.url, '_blank');
                }
            } else {
                openTaskLinkModal(idx, pIdx !== null, pIdx);
            }
        }
        // Add Sub-task
        if (e.target.closest('.add-subtask-btn')) {
            const idx = parseInt(e.target.closest('.add-subtask-btn').getAttribute('data-index'));
            addingSubtaskToIndex = idx;
            onRenderCallback();
            // Focus input หลัง render
            setTimeout(() => {
                const input = document.querySelector(`.subtask-add-input[data-parent="${idx}"]`);
                if (input) input.focus();
            }, 10);
        }
        // Edit Sub-task
        if (e.target.closest('.edit-subtask-btn')) {
            const pIdx = e.target.closest('.edit-subtask-btn').getAttribute('data-parent-index');
            const sId = parseInt(e.target.closest('.edit-subtask-btn').getAttribute('data-id'));
            openTaskEditModal(parseInt(pIdx), false, sId);
        }
        if (e.target.closest('.convert-to-main-btn')) {
            const pIdx = parseInt(e.target.closest('.convert-to-main-btn').getAttribute('data-parent-index'));
            const sIdx = parseInt(e.target.closest('.convert-to-main-btn').getAttribute('data-sub-index'));
            if (space.tasks[pIdx] && space.tasks[pIdx].subtasks) {
                const sub = space.tasks[pIdx].subtasks.splice(sIdx, 1)[0];
                // สร้างเป็น Main Task ใหม่ (ไม่มีงานย่อยติดไป)
                space.tasks.push({ ...sub, subtasks: [], createdAt: Date.now() });
                saveData(); // Save data locally
                onRenderCallback(); // Rerender UI
            }
        }
    };

    const handleProminentTaskClick = (e) => {
        const btn = e.target.closest('.btn-prominent-task');
        if (btn) {
            const space = getCurrentSpace();
            const index = parseInt(btn.getAttribute('data-index'));
            const pIdxAttr = btn.getAttribute('data-parent-index');
            const pIdx = pIdxAttr !== null ? parseInt(pIdxAttr) : null;

            let task;
            if (pIdx !== null) {
                task = space.tasks[pIdx]?.subtasks?.[index];
                if (task) {
                    task.isProminent = !task.isProminent;
                    saveData();
                    onRenderCallback();
                }
                return;
            }

            task = space.tasks[index];

            if (task.isProminent) {
                task.isProminent = false;
                // Clear focus if unflagged
                const settings = getAppSettings();
                if (settings.focusedTask && settings.focusedTask.spaceId === space.id && settings.focusedTask.createdAt === task.createdAt) {
                    settings.focusedTask = null;
                }

                // ย้ายกลับไปยังตำแหน่งเดิมหากมีการบันทึกไว้
                if (typeof task.originalIndex === 'number') {
                    const targetIndex = task.originalIndex;
                    const [movedTask] = space.tasks.splice(index, 1);
                    // ป้องกันกรณี index เปลี่ยนแปลงไปมากจนเกินอาเรย์ (เช่น มีการลบงานอื่นออก)
                    const finalIndex = Math.min(targetIndex, space.tasks.length);
                    space.tasks.splice(finalIndex, 0, movedTask);
                    delete task.originalIndex; // ลบค่าบันทึกทิ้งหลังจากย้ายกลับแล้ว
                }
            } else {
                // อนุญาตให้เลือกเน้นงานได้หลายงานพร้อมกัน
                task.isProminent = true;

                // บันทึกตำแหน่งเดิมไว้ก่อนย้าย (เพื่อเอากลับมาที่เดิมเมื่อเลิกติดธง)
                task.originalIndex = index; 
                const [movedTask] = space.tasks.splice(index, 1);
                
                // 🟢 ค้นหาตำแหน่งสุดท้ายของกลุ่มงานที่ติดธงอยู่แล้ว
                let lastProminentIdx = -1;
                for (let i = 0; i < space.tasks.length; i++) {
                    if (space.tasks[i].isProminent) {
                        lastProminentIdx = i;
                    } else {
                        break; // งานติดธงจะอยู่บนสุดเสมอ จึงหยุดหาได้ทันทีที่เจองานปกติ
                    }
                }
                // แทรกต่อท้ายกลุ่มงานที่ติดธงล่าสุด
                space.tasks.splice(lastProminentIdx + 1, 0, movedTask);
            }
            saveData();
            onRenderCallback();
        }
    };

    const handleTaskContextMenu = (e) => {
        const flagBtn = e.target.closest('.btn-prominent-task[data-focus-trigger="true"]');
        if (flagBtn) {
            e.preventDefault(); // Prevent default browser context menu
            e.stopPropagation();

            closeFocusContextMenu(); // Close any existing custom menu

            const taskItemEl = flagBtn.closest('.task-item');
            if (!taskItemEl) return;

            const space = getCurrentSpace();
            const spaceId = parseInt(taskItemEl.dataset.spaceId || space.id);
            const taskIndex = parseInt(taskItemEl.dataset.index);
            const isSubtask = taskItemEl.classList.contains('subtask-item');
            const parentIndex = isSubtask ? parseInt(taskItemEl.dataset.parentIndex) : null;

            let task;
            if (isSubtask) {
                task = space.tasks[parentIndex]?.subtasks?.[taskIndex];
            } else {
                task = space.tasks[taskIndex];
            }
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
            if (menuRect.right > window.innerWidth) {
                menu.style.left = `${e.clientX - menuRect.width}px`;
            }
            if (menuRect.bottom > window.innerHeight) {
                menu.style.top = `${e.clientY - menuRect.height}px`;
            }

            // Hover effects
            menu.querySelectorAll('.menu-item').forEach(b => {
                b.addEventListener('mouseenter', () => b.style.backgroundColor = 'var(--hover-bg, #f1f1ef)');
                b.addEventListener('mouseleave', () => b.style.background = 'transparent');
            });

            // Action
            document.getElementById('ctx-toggle-focus').addEventListener('click', () => {
                toggleTaskFocus(spaceId, taskIndex, isSubtask, parentIndex);
                closeFocusContextMenu();
            });

            // Close on outside click
            const closeHandler = (clickEvent) => {
                if (!menu.contains(clickEvent.target)) {
                    closeFocusContextMenu();
                }
            };
            document.addEventListener('click', closeHandler);
            menu._closeHandler = closeHandler; // Store handler to remove later
            return; // Stop further contextmenu processing
        }

        const linkBtn = e.target.closest('.task-link-btn');
        if (linkBtn) {
            e.preventDefault();
            const idx = parseInt(linkBtn.getAttribute('data-index'));
            const pIdxAttr = linkBtn.getAttribute('data-parent-index');
            const pIdx = pIdxAttr !== null ? parseInt(pIdxAttr) : null;
            const sid = linkBtn.getAttribute('data-space-id');
            
            openTaskLinkModal(idx, pIdx !== null, pIdx, sid ? parseInt(sid) : null);
        }
    };

    function closeFocusContextMenu() {
        const existing = document.getElementById('task-focus-context-menu');
        if (existing) {
            if (existing._closeHandler) {
                document.removeEventListener('click', existing._closeHandler);
            }
            existing.remove();
        }
    };

    // Scope listeners to specific containers instead of document
    const taskListEl = document.getElementById('task-list');
    const archiveListEl = document.getElementById('archive-list');
    const trashListEl = document.getElementById('trash-task-list');
    
    // Logic สำหรับ Checkbox แยกออกมา
    const handleTaskChange = (e) => { // This handles main tasks
        if (e.target.classList.contains('subtask-check-box')) {
            const isChecked = e.target.checked;
            const pIdx = parseInt(e.target.dataset.parentIndex);
            const sIdx = parseInt(e.target.dataset.subIndex);
            const taskItem = e.target.closest('.subtask-item');
            
            // 🟢 แสดงผลขีดฆ่าทันทีที่กด (Immediate Feedback)
            if (taskItem) {
                taskItem.classList.toggle('completed-hold', isChecked);
                if (isChecked) playTaskCompletedSound();
            }
            
            const space = getCurrentSpace();
            const subtask = space?.tasks[pIdx]?.subtasks?.[sIdx];
            if (subtask) {
                subtask.completed = isChecked;
                // 🌟 เรียก Reward Scanner สำหรับงานย่อย
                if (isChecked && window.processRewardScanner) {
                    window.processRewardScanner(subtask.text, false, { x: e.clientX, y: e.clientY }, 'task', space.id);
                }
                saveData(true);
                triggerCloudSave();
                // หน่วงเวลา Re-render เพื่อให้เห็น Animation
                setTimeout(() => onRenderCallback(), isChecked ? 800 : 0);
            }
            return;
        }

        if (e.target.classList.contains('task-check-box')) {
            const isChecked = e.target.checked;
            const index = parseInt(e.target.getAttribute('data-index'));
            const taskItem = e.target.closest('.task-item');

            // Animation 4: Hold & Vanish Effect
            if (isChecked && taskItem) {
                taskItem.classList.add('completed-hold');
                playTaskCompletedSound();

                // 🌟 Quest Loot Scanner
                const space = getCurrentSpace();
                if (window.processRewardScanner && space?.tasks[index]) {
                    // ดึงตำแหน่งเมาส์ล่าสุดจาก Event e
                    window.processRewardScanner(space.tasks[index].text, false, { x: e.clientX, y: e.clientY }, 'task', space.id, { tags: space.tasks[index].tags });
                }
            }

            // 🟢 อัปเดตข้อมูลทันที (ลดปัญหา Race Condition กับพื้นหลัง)
            const space = getCurrentSpace();
            const task = space?.tasks[index];
            if (!task) return;

            if (task.repeatConfig && task.repeatConfig.isRepeating) {
                // For repeating tasks, mark as completed, not deleted
                task.completed = isChecked;
                task.completedAt = isChecked ? Date.now() : null;
                task.isProminent = false; // Repeating tasks should not be prominent when completed
                // Do not touch isDeleted, deletedAt, expiryAt for repeating tasks here

                if (task.subtasks) {
                    task.subtasks.forEach(sub => {
                        sub.completed = isChecked;
                        // Subtasks of repeating tasks should also not be marked as deleted
                    });
                }
                console.log(`[handleTaskChange] Repeating task ${task.text} (ID: ${task.id}) completed: ${isChecked}.`);

            } else if (task.calendarEventId) {
                // 🟢 NEW: สำหรับงานที่ซิงค์ปฏิทิน ให้ถือว่าเป็นการ Complete (ย้ายเข้าส่วน Synced Calendar) แทนการลงถังขยะ
                task.completed = isChecked;
                task.completedAt = isChecked ? Date.now() : null;
                task.isDeleted = false;
                task.isProminent = false;
                if (task.subtasks) {
                    task.subtasks.forEach(sub => { sub.completed = isChecked; });
                }
                console.log(`[handleTaskChange] Task ${task.text} (ID: ${task.id}) with calendarEventId: ${task.calendarEventId} is now completed: ${isChecked}. isDeleted: ${task.isDeleted}`);
            } else {
                // For non-repeating tasks, use the existing logic (mark as deleted when checked)
                if (isChecked) {
                    const settings = getAppSettings();
                    if (settings.focusedTask && settings.focusedTask.spaceId === space.id && settings.focusedTask.createdAt === task.createdAt) {
                        settings.focusedTask = null;
                    }
                    task.isDeleted = true;
                    task.deletedAt = Date.now();
                    const days = settings.autoDeleteDays || 30;
                    task.expiryAt = task.deletedAt + (days * 24 * 60 * 60 * 1000);
                    task.completed = false; // Mark as false for deleted tasks
                    task.isProminent = false;
                    if (task.subtasks) task.subtasks.forEach(sub => { sub.isDeleted = true; sub.deletedAt = task.deletedAt; sub.expiryAt = task.expiryAt; sub.completed = false; });
                } else {
                    task.completed = false;
                    task.completedAt = null;
                    task.isDeleted = false;
                    task.deletedAt = null;
                    task.expiryAt = null;
                    if (task.subtasks) task.subtasks.forEach(sub => { sub.isDeleted = false; sub.completed = false; });
                    const [restoredTask] = space.tasks.splice(index, 1);
                    space.tasks.unshift(restoredTask);
                }
            }

            // Sync completion status to Google Calendar if linked
            if (task.calendarEventId) {
                // TODO: Refactor Calendar Auth using chrome.identity later
                // getAuthToken(false).then(token => {
                //     if (token) {
                //         // Map isDeleted (Trash) to completed status for Calendar prefixing
                //         const summaryTask = { ...task, completed: task.completed || task.isDeleted };
                //         updateCalendarEvent(task.calendarEventId, summaryTask, token);
                //     }
                // });
            }

            // 🔄 Repeating Task Logic: Regenerate task on completion
            if (isChecked && task.repeatConfig && task.repeatConfig.isRepeating && task.dueDate && !task.wasRegenerated) {
                const nextDate = calculateNextDate(task.dueDate, task.repeatConfig, task);
                
                if (nextDate) {
                    task.wasRegenerated = true; // 🟢 มาร์คว่าสร้างงานใหม่ไปแล้ว ป้องกันการงอกซ้ำ
                    const clonedTask = JSON.parse(JSON.stringify(task));
                    clonedTask.completed = false;
                    clonedTask.completedAt = null;
                    clonedTask.isDeleted = false;
                    clonedTask.deletedAt = null;
                    clonedTask.expiryAt = null;
                    clonedTask.createdAt = Date.now();
                    clonedTask.wasRegenerated = false; // งานตัวใหม่ต้องพร้อมสำหรับการทำซ้ำรอบถัดไป
                    clonedTask.calendarEventId = null; // New task needs its own event
                    clonedTask.dueDate = nextDate;
                    clonedTask.occurrenceCount = (task.occurrenceCount || 1) + 1; // 🟢 เพิ่มตัวนับครั้งที่ทำ
                    
                    space.tasks.push(clonedTask);
                }
            }

            saveData(true); // บันทึกทันที

            // 🟢 เอาการหน่วงเวลาออกตามคำขอเพื่อให้ UI ลื่นไหลขึ้น
            onRenderCallback(); 
        }
    };

    // ฟังก์ชันจัดการการพิมพ์ในช่อง Sub-task (Enter เพื่อบันทึก, Esc เพื่อยกเลิก)
    const handleSubtaskInputKey = (e) => {
        const input = e.target;
        if (!input.classList.contains('subtask-add-input')) return;

        if (e.key === 'Enter') {
            e.preventDefault(); // Stop page refresh
            input.dataset.isSubmitting = "true"; // 🟢 มาร์คไว้ว่ากำลังบันทึก ป้องกัน Blur ล้างค่า
            const pIdx = parseInt(input.getAttribute('data-parent'));
            const value = input.value.trim();
            const space = getCurrentSpace();

            if (value && space.tasks[pIdx]) {
                if (!space.tasks[pIdx].subtasks) space.tasks[pIdx].subtasks = [];
                space.tasks[pIdx].subtasks.push({ id: Date.now(), text: value, completed: false });
                saveData();
                // We keep addingSubtaskToIndex as pIdx to trigger the next input rendering
            } else {
                addingSubtaskToIndex = null;
            }

            onRenderCallback();

            if (addingSubtaskToIndex !== null) {
                setTimeout(() => {
                    const newInput = document.querySelector(`.subtask-add-input[data-parent="${pIdx}"]`);
                    if (newInput) newInput.focus();
                }, 50);
            }
        }

        if (e.key === 'Escape') {
            addingSubtaskToIndex = null;
            onRenderCallback();
        }
    };

    // จัดการเหตุการณ์การหลุดโฟกัส (Blur) เพื่อปิดช่อง Input
    const handleSubtaskBlur = (e) => {
        if (e.target.classList.contains('subtask-add-input') || e.target.classList.contains('subtask-edit-input')) {
            if (e.target.dataset.isSubmitting === "true") return; // 🟢 ข้ามการล้างค่าถ้าเป็นการกดยืนยัน

            setTimeout(() => {
                // If focus shifted to another subtask input (auto-create flow), do not clear state
                if (document.activeElement && document.activeElement.classList.contains('subtask-add-input')) {
                    return;
                }
                addingSubtaskToIndex = null;
                onRenderCallback();
            }, 100);
        }
    };

    if (taskListEl) {
        taskListEl.addEventListener('click', handleTaskClick);
        taskListEl.addEventListener('click', handleProminentTaskClick); // Add listener for prominent button
        taskListEl.addEventListener('contextmenu', handleTaskContextMenu);
        document.addEventListener('click', closeFocusContextMenu); // Global click to close menu
        // The main task checkbox change is handled here
        taskListEl.addEventListener('change', handleTaskChange); 

        taskListEl.addEventListener('keydown', handleSubtaskInputKey); // 🟢 กู้คืน: จัดการ Enter ในช่อง Add Subtask

        taskListEl.addEventListener('focusout', handleSubtaskBlur);

        // Add Inline Editing for Main and Subtasks
        // ... (existing attachTaskInlineEditListeners code)

            attachTaskInlineEditListeners(taskListEl, () => getCurrentSpace(), {
            saveData,
            onAddMainTaskAfter: (space, index) => {
                const newTask = { text: "", completed: false, tags: [], dueDate: null, createdAt: Date.now(), googleTaskId: null, isProminent: false, subtasks: [] };
                space.tasks.splice(index + 1, 0, newTask);
                saveData();
                onRenderCallback();
                setTimeout(() => {
                    const items = document.querySelectorAll('#task-list .task-actual-text');
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
                    addingSubtaskToIndex = parseInt(subList.dataset.parentIndex);
                    onRenderCallback();
                    setTimeout(() => {
                        const input = document.querySelector(`.subtask-add-input[data-parent="${addingSubtaskToIndex}"]`);
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
                saveData(); onRenderCallback();
            },
            onUpdate: () => {
                onRenderCallback();
                if (addingSubtaskToIndex !== null) {
                    setTimeout(() => {
                        const input = document.querySelector(`.subtask-add-input[data-parent="${addingSubtaskToIndex}"]`);
                        if (input) input.focus();
                    }, 50);
                }
            }
        });
    }
    if (trashListEl) {
        trashListEl.addEventListener('click', handleTaskClick);
        trashListEl.addEventListener('click', handleProminentTaskClick);
        trashListEl.addEventListener('contextmenu', handleTaskContextMenu);
        trashListEl.addEventListener('change', handleTaskChange);
    }
    if (archiveListEl) {
        archiveListEl.addEventListener('click', handleTaskClick);
        archiveListEl.addEventListener('click', handleProminentTaskClick);
        archiveListEl.addEventListener('contextmenu', handleTaskContextMenu);
        archiveListEl.addEventListener('change', handleTaskChange);
        archiveListEl.addEventListener('keydown', (e) => {
            handleSubtaskInputKey(e);
            if (e.key === 'Enter' && e.target.classList.contains('task-actual-text')) {
                const li = e.target.closest('li');
                if (li && li.dataset.type === 'subtask') {
                    const subList = li.closest('.subtask-list');
                    if (subList) {
                        addingSubtaskToIndex = parseInt(subList.dataset.parentIndex);
                    }
                }
            }
        });

        attachTaskInlineEditListeners(archiveListEl, () => getCurrentSpace(), {
            saveData,
            onAddMainTaskAfter: (space, index) => {
                // 🟢 สร้างงานหลักใหม่ต่อท้ายตำแหน่งที่เพิ่งพิมพ์เสร็จ
                const newTask = { text: "", completed: false, tags: [], dueDate: null, createdAt: Date.now(), googleTaskId: null, isProminent: false, subtasks: [] };
                space.tasks.splice(index + 1, 0, newTask);
                saveData();
                onRenderCallback();

                // Focus งานที่เพิ่งสร้างขึ้นมาใหม่
                setTimeout(() => {
                    const items = document.querySelectorAll('#task-list .task-actual-text');
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
                saveData(); onRenderCallback();
            },
            onUpdate: () => {
                onRenderCallback();
                if (addingSubtaskToIndex !== null) {
                    setTimeout(() => {
                        const input = document.querySelector(`.subtask-add-input[data-parent="${addingSubtaskToIndex}"]`);
                        if (input) input.focus();
                    }, 50);
                }
            }
        });
    }

    // --- Quick Note Controls (Float / Collapse) ---
    const btnFloat = document.getElementById('btn-float-note');
    const btnToggle = document.getElementById('btn-toggle-note');
    const noteWrapper = document.getElementById('quick-note-wrapper');
    const noteHeader = document.getElementById('quick-note-header');
    
    if (btnFloat && btnToggle && noteWrapper) {
        const updateNoteUI = () => {
            const settings = getAppSettings();
            const s = settings.quickNoteState;

            // 1. Float State
            if (s.float) {
                noteWrapper.classList.add('floating-note');
                noteWrapper.style.top = `${s.y}px`;
                noteWrapper.style.left = `${s.x}px`;
                noteWrapper.style.width = `${s.w}px`;
                noteWrapper.style.height = s.collapsed ? 'auto' : `${s.h}px`;
                
                // Icon Change: Show "Dock/Reset" icon
                btnFloat.innerHTML = `<svg class="svg-icon-sm"><use href="#icon-dock"></use></svg>`;
                btnFloat.title = "Dock (Reset)";
            } else {
                noteWrapper.classList.remove('floating-note');
                noteWrapper.style.top = '';
                noteWrapper.style.left = '';
                noteWrapper.style.width = '';
                noteWrapper.style.height = '';

                // Icon Change: Show "Float" icon
                btnFloat.innerHTML = `<svg class="svg-icon-sm"><use href="#icon-external-link"></use></svg>`;
                btnFloat.title = "Float Window";
            }

            // 2. Collapse State
            const body = document.getElementById('quick-note-body');
            if (s.collapsed) {
                body.style.display = 'none';
                btnToggle.innerHTML = `<svg class="svg-icon-sm"><use href="#icon-chevron-up"></use></svg>`;
            } else {
                body.style.display = 'flex';
                btnToggle.innerHTML = `<svg class="svg-icon-sm"><use href="#icon-chevron-down"></use></svg>`;
            }
        };

        // Init UI
        updateNoteUI();

        btnFloat.onclick = () => {
            const settings = getAppSettings();
            settings.quickNoteState.float = !settings.quickNoteState.float;
            saveData();
            updateNoteUI();
        };

        btnToggle.onclick = () => {
            const settings = getAppSettings();
            settings.quickNoteState.collapsed = !settings.quickNoteState.collapsed;
            saveData();
            updateNoteUI();
        };

        // --- Drag Logic for Floating Note ---
        let isDragging = false;
        let offset = { x: 0, y: 0 };

        noteHeader.addEventListener('mousedown', (e) => {
            const settings = getAppSettings();
            if (!settings.quickNoteState.float) return;
            
            e.preventDefault(); // 1. แก้ปัญหาลากแล้วคลุมดำ (สำคัญมาก)
            isDragging = true;
            offset.x = e.clientX - noteWrapper.getBoundingClientRect().left;
            offset.y = e.clientY - noteWrapper.getBoundingClientRect().top;
            
            document.body.style.userSelect = 'none'; // ปิดการเลือก Text ทั้งหน้าชั่วคราว
            noteHeader.style.cursor = 'grabbing';
            // ✅ ปิด Animation ชั่วคราวตอนลาก เพื่อให้กล่องตามมือทันที ไม่หน่วง
            noteWrapper.style.transition = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            // 2. แก้ปัญหาหน่วง: อัปเดตแค่ DOM ไม่ต้องเขียนค่าลงตัวแปร settings ทุก pixel
            noteWrapper.style.left = `${e.clientX - offset.x}px`;
            noteWrapper.style.top = `${e.clientY - offset.y}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = ''; // คืนค่าให้เลือก Text ได้ปกติ
                noteHeader.style.cursor = 'grab';
                // ✅ เปิด Animation คืน เพื่อให้ตอนย่อ/ขยาย ยังดูนุ่มนวลเหมือนเดิม
                noteWrapper.style.transition = 'all 0.2s ease';

                // Save new position & size (if resized)
                const settings = getAppSettings();
                const rect = noteWrapper.getBoundingClientRect();
                settings.quickNoteState.x = rect.left;
                settings.quickNoteState.y = rect.top;
                if (!settings.quickNoteState.collapsed) {
                    settings.quickNoteState.w = rect.width;
                    settings.quickNoteState.h = rect.height;
                }
                saveData();
            }
        });
    }
}

/**
 * 📑 ระบบจัดการ Template To-Do List
 */
function initTodoTemplateSystem() {
    const btnOpen = document.getElementById('btn-todo-templates');
    if (!btnOpen) return;

    // สร้าง Modal HTML
    if (!document.getElementById('todo-template-modal')) {
        const modalHTML = `
        <div class="modal-overlay" id="todo-template-modal" style="display:none; z-index:12000;">
            <div class="modal-content" style="width:500px; max-height:85vh; display:flex; flex-direction:column;">
                <h3 style="margin-top:0;">📑 Template Manager</h3>
                
                <div id="template-editor-section" style="border:1px solid var(--border-color); border-radius:8px; padding:15px; background:var(--bg-body); margin-bottom:15px; flex-shrink:0; transition: border-color 0.3s ease;">
                    <label style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Create / Edit Template</label>
                    <input type="text" id="template-name-input" class="settings-input" placeholder="Template Name (e.g. Morning Routine)" style="margin:8px 0;">
                    
                    <div class="task-input-bar" style="margin-bottom:10px;">
                        <input type="text" id="template-task-input" class="task-input" placeholder="Add task to template...">
                        <button class="btn btn-primary" id="btn-add-task-to-temp" style="padding:4px 12px;">+</button>
                    </div>
                    <ul class="task-list" id="template-sandbox-list" style="max-height:250px; overflow-y:auto; background:var(--bg-card); border-radius:6px; padding:5px; border:1px solid var(--border-color);"></ul>
                    
                    <button class="btn btn-primary" id="btn-save-full-template" style="width:100%; justify-content:center; margin-top:10px;">💾 Save Template</button>
                </div>

                <label style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Saved Templates</label>
                <div id="saved-templates-list" style="flex:1; overflow-y:auto; margin-top:8px; display:flex; flex-direction:column; gap:8px;"></div>

                <div class="modal-actions" style="margin-top:20px; text-align:right;">
                    <button class="btn btn-outline" id="btn-close-todo-template-modal">Close</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    const modal = document.getElementById('todo-template-modal');
    const sandboxList = document.getElementById('template-sandbox-list');
    const tempTaskInput = document.getElementById('template-task-input');
    const nameInput = document.getElementById('template-name-input');
    const savedListUI = document.getElementById('saved-templates-list');

    // 🟢 บันทึกฟังก์ชัน Refresh ไว้เพื่อให้ Modals เรียกใช้งานได้
    const renderSandbox = () => {
        sandboxList.innerHTML = currentTemplateTasks.map((t, i) => {
            const hasLink = t.linkData && t.linkData.url;
            
            return `
            <li class="task-item" style="padding:8px 12px; border-bottom:1px solid var(--border-color); display:flex; align-items:center; gap:10px;">
                <div style="width:16px; height:16px; border-radius:50%; border:2px solid var(--border-color); opacity:0.3;"></div>
                <span style="flex:1; font-size:14px; font-weight:500;">${t.text}</span>
                
                <div class="item-action-group" style="display:flex; align-items:center; gap:6px; opacity:1;">
                    ${generateMiniTagsBtn(t.tags, 'sandbox-task', i)}
                    
                    <button class="btn-icon btn-remove-temp-task" data-index="${i}" style="color:#ef4444; margin-left: 5px;">✕</button>
                </div>
            </li>`;
        }).join('');
    };

    sandboxList.onclick = (e) => {
        const target = e.target;
        const removeBtn = target.closest('.btn-remove-temp-task');
        const tagBtn = target.closest('.btn-edit-tags');

        if (removeBtn) {
            const i = parseInt(removeBtn.dataset.index);
            currentTemplateTasks.splice(i, 1);
            renderSandbox();
        } else if (tagBtn) {
            openSandboxTagModal(parseInt(tagBtn.dataset.index));
        }
    };

    const renderSavedTemplates = () => {
        const space = getCurrentSpace();
        if (!space.todoTemplates) space.todoTemplates = [];
        
        savedListUI.innerHTML = space.todoTemplates.map((temp, idx) => `
            <div class="loot-item" style="margin:0; padding:10px 15px; border-left:4px solid var(--primary-color);">
                <div style="flex:1;">
                    <div style="font-weight:700; font-size:14px;">${temp.name}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${temp.tasks.length} tasks</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-primary btn-apply-template" data-index="${idx}" style="padding:4px 12px; font-size:11px;">Use Template</button>
                    <button class="btn-icon btn-edit-template" data-index="${idx}" style="color:var(--primary-color);">${svgEdit}</button>
                    <button class="btn-icon btn-delete-template" data-index="${idx}" style="color:#ef4444;">${svgTrashRed}</button>
                </div>
            </div>
        `).join('') || '<div style="text-align:center; padding:20px; opacity:0.5; font-size:12px;">No templates saved yet</div>';
    };

    const applyTodoTemplate = async (idx) => {
        const space = getCurrentSpace();
        const template = space.todoTemplates[idx];
        if (template) {
            for (const t of template.tasks) {
                const newTask = {
                    ...t,
                    subtasks: (t.subtasks || []).map(s => ({ ...s, id: Date.now() + Math.random() })),
                    createdAt: Date.now(),
                    isFromTemplate: true, // 🟢 มาร์คว่าเป็นงานจาก Template เพื่อติดสีส้ม
                };

                space.tasks.push(newTask);
            }
            saveData();
            onRenderCallback();
            modal.style.display = 'none';
        }
    };

    const editTodoTemplate = (idx) => {
        const space = getCurrentSpace();
        const template = space.todoTemplates[idx];
        if (template) {
            editingTemplateIndex = idx;
            nameInput.value = template.name;
            // สร้างสำเนาข้อมูล (Deep Copy) เพื่อไม่ให้กระทบต้นฉบับขณะแก้
            currentTemplateTasks = JSON.parse(JSON.stringify(template.tasks));
            renderSandbox();
            document.getElementById('btn-save-full-template').innerText = "💾 Update Template";
            document.getElementById('template-editor-section').style.borderColor = 'var(--primary-color)';
        }
    };

    const deleteTodoTemplate = (idx) => {
        if (confirm("Delete this template?")) {
            getCurrentSpace().todoTemplates.splice(idx, 1);
            saveData(); renderSavedTemplates();
        }
    };

    savedListUI.onclick = (e) => {
        const applyBtn = e.target.closest('.btn-apply-template');
        const delBtn = e.target.closest('.btn-delete-template');
        const editBtn = e.target.closest('.btn-edit-template');
        if (applyBtn) {
            applyTodoTemplate(parseInt(applyBtn.dataset.index));
        } else if (delBtn) {
            deleteTodoTemplate(parseInt(delBtn.dataset.index));
        } else if (editBtn) {
            editTodoTemplate(parseInt(editBtn.dataset.index));
        }
    };

    document.getElementById('btn-close-todo-template-modal').onclick = () => modal.style.display = 'none';

    btnOpen.onclick = () => {
        currentTemplateTasks = [];
        tempTaskInput.value = '';
        nameInput.value = '';
        renderSandbox();
        renderSavedTemplates();
        modal.style.display = 'flex';
    };

    document.getElementById('btn-add-task-to-temp').onclick = () => {
        const val = tempTaskInput.value.trim();
        if (val) { currentTemplateTasks.push({ text: val, completed: false, subtasks: [], tags: [], linkData: null }); tempTaskInput.value = ''; renderSandbox(); }
    };

    document.getElementById('btn-save-full-template').onclick = () => {
        const name = nameInput.value.trim();
        if (!name || currentTemplateTasks.length === 0) return alert("Please enter name and at least 1 task");
        const space = getCurrentSpace();
        if (!space.todoTemplates) space.todoTemplates = [];
        space.todoTemplates.push({ name, tasks: [...currentTemplateTasks] });
        saveData();
        currentTemplateTasks = []; nameInput.value = ''; renderSandbox(); renderSavedTemplates();
    };
}

async function addTask() { 
    const input = document.getElementById('new-task-input'); 
    const dateInput = document.getElementById('new-task-date');
    const quickCalBtn = document.getElementById('btn-task-calendar-sync');
    let text = input.value.trim();
    if (text !== '') {
        // 🔴 ป้องกันการเพิ่มงาน Repeat ที่ไม่มีวันที่ (กรณีผู้ใช้ลบวันที่ออกหลังตั้งค่า Repeat)
        if (currentTaskRepeatConfig.isRepeating && !dateInput.value) {
            alert("⚠️ งานที่ตั้งค่าทำซ้ำ (Repeat) จำเป็นต้องมีกำหนดส่งครับ");
            return;
        }

        input.disabled = true; 
        const space = getCurrentSpace();

        // 🟢 Shortcut #1: แทนที่ด้วยป้ายกำกับที่กำลังกรองอยู่ (ยกเว้นป้ายระบบ)
        const currentFilters = (getFilterTags() || []).filter(t => !['ALL', 'UNTAGGED', 'AI', 'HALF SCREEN'].includes(t.toUpperCase()));
        if (text.includes('#1') && currentFilters.length > 0) {
            const filterTagsString = currentFilters.map(t => '#' + t).join(' ');
            text = text.replace(/#1/g, filterTagsString);
        }

        // 🟢 Extract tags from text (e.g., #Work #Urgent)
        let tags = [];
        const tagMatches = text.match(/#([^\s#]+)/g);
        if (tagMatches) {
            tags = tagMatches.map(t => t.substring(1)); // Remove '#'
            text = text.replace(/#([^\s#]+)/g, '').trim(); // Remove tags from title
            if (!text && tags.length > 0) text = tags[0]; // Fallback if only tags were typed

            // Add to space tags if new
            if (!space.tags) space.tags = [];
            tags.forEach(t => {
                if (!space.tags.some(st => st.toUpperCase() === t.toUpperCase())) space.tags.push(t);
            });
        }

        // Initialize new task with isProminent: false
        let newTask = { text: text, completed: false, tags: tags, dueDate: dateInput.value || null, createdAt: Date.now(), isProminent: false, subtasks: [], subtasksHidden: false, repeatConfig: { ...currentTaskRepeatConfig } }; 

        // 📅 Calendar Sync Logic for Quick Add
        if (currentTaskCalendarSync && newTask.dueDate) {
            try {
                // TODO: Refactor Calendar Auth using chrome.identity later
                // const token = await getAuthToken(false);
                // if (token) {
                //     const event = await createCalendarEvent(newTask, token);
                //     if (event && event.id) newTask.calendarEventId = event.id;
                // }
            } catch (err) { console.error("Quick add calendar sync error:", err); }
        }

        space.tasks.push(newTask); 
        currentTaskRepeatConfig = { isRepeating: false, frequency: 'daily', interval: 1 }; // Reset UI and state after add
        document.getElementById('btn-task-repeat').style.color = 'inherit';

        // Reset Calendar Sync UI
        currentTaskCalendarSync = false;
        if (quickCalBtn) {
            quickCalBtn.style.color = '#4285f4';
            quickCalBtn.style.borderColor = 'var(--border-color)';
            quickCalBtn.style.background = 'var(--bg-body)';
        }

        if (space.taskSortOrder && space.taskSortOrder !== 'manual') sortSpaceTasks(space);
        playTaskAddedSound();
        input.value = ''; input.disabled = false; input.placeholder = "Type a task..."; input.focus();
        dateInput.value = ''; updateDateInputLabel(dateInput);
        saveData(); 
        onRenderCallback(); 
    } 
}

export function openTaskEditModal(idx, fromCommandCenter = false, subId = null) {
    _fromCommandCenter = fromCommandCenter;
    editingTaskLocalIndex = idx;
    editingSubtaskLocalId = subId;
    
    const space = getCurrentSpace();
    if (!space || !space.tasks) return;

    let task = space.tasks[idx];
    
    if (subId) {
        task = task.subtasks.find(s => s.id === subId);
    }

    if (!task) return;

    document.getElementById('edit-task-name-input').value = task.text;
    document.getElementById('edit-task-date-input').value = task.dueDate || "";
    updateDateInputLabel(document.getElementById('edit-task-date-input'));
    editingTaskRepeatConfig = task.repeatConfig || { isRepeating: false, frequency: 'daily', interval: 1 };
    document.getElementById('btn-edit-task-repeat').style.color = editingTaskRepeatConfig.isRepeating ? 'var(--primary-color)' : 'inherit';
    document.getElementById('sync-calendar-checkbox').checked = !!task.calendarEventId;
    document.getElementById('task-edit-modal').style.display = 'flex';
}

async function saveEditedTask() {
    // ใน Master View, getCurrentSpace() จะคืนค่า Space ที่เราสับเปลี่ยนไว้ก่อนเปิด Modal
    const space = getCurrentSpace(); 
    if (!space) return;

    let task = space.tasks[editingTaskLocalIndex];
    
    if (editingSubtaskLocalId) {
        task = task.subtasks.find(s => s.id === editingSubtaskLocalId);
    }

    if (!task) return;

    const newName = document.getElementById('edit-task-name-input').value.trim();
    const newDate = document.getElementById('edit-task-date-input').value;
    const wantsCalendarSync = document.getElementById('sync-calendar-checkbox').checked;
    
    console.log("Saving task (edit modal):", { newName, newDate, wantsCalendarSync, calendarEventId: task.calendarEventId, taskId: task.id });

    if(newName === "") return;
    
    const btnSave = document.getElementById('btn-save-task-edit');

    // 🔴 ตรวจสอบเงื่อนไขวันที่สำหรับงาน Repeat ขณะแก้ไข
    if (editingTaskRepeatConfig.isRepeating && !newDate) {
        alert("⚠️ งานที่ตั้งค่าทำซ้ำ (Repeat) จำเป็นต้องมีกำหนดส่งครับ");
        btnSave.innerText = "Save"; btnSave.disabled = false;
        return;
    }
    if (wantsCalendarSync && !newDate) {
        alert("⚠️ งานที่ต้องการซิงค์กับ Google Calendar จำเป็นต้องมีกำหนดส่งครับ");
        return;
    }

    btnSave.innerText = "Saving..."; btnSave.disabled = true;
    
    task.text = newName;
    task.dueDate = newDate || null;
    task.repeatConfig = { ...editingTaskRepeatConfig };

    // Calendar Sync Logic
    try {
        // TODO: Refactor Calendar Auth using chrome.identity later
        // const token = await getAuthToken(false);
        // if (token) {
        //     if (wantsCalendarSync && task.dueDate) {
        //         if (!task.calendarEventId) {
        //             console.log("Attempting to create new calendar event for task:", task.text);
        //             const event = await createCalendarEvent(task, token);
        //             if (event && event.id) {
        //                 task.calendarEventId = event.id;
        //                 console.log("Calendar event created and assigned ID:", event.id, "to task:", task.text, "(Task ID:", task.id, ")");
        //             } else {
        //                 console.error("Failed to create calendar event for task:", task.text, "(Task ID:", task.id, "). Event response:", event);
        //             }
        //         } else {
        //             console.log("Updating existing calendar event for ID:", task.calendarEventId, "with new text:", task.text);
        //             await updateCalendarEvent(task.calendarEventId, task, token);
        //             console.log("Calendar event updated successfully.");
        //         }
        //     } else if (task.calendarEventId) {
        //         // Delete if unchecked or if dueDate was removed
        //         await deleteCalendarEvent(task.calendarEventId, token);
        //         delete task.calendarEventId;
        //         console.log("Calendar event deleted for ID:", task.calendarEventId);
        //     }
        // } else if (wantsCalendarSync) {
        //     alert("⚠️ ไม่สามารถซิงค์ปฏิทินได้: โปรดเชื่อมต่อ Google Drive/Calendar ในเมนู Google Integrations (ไอคอน 9 จุด) ก่อนครับ");
        // }
    } catch (err) { console.error("Calendar sync error:", err); }

    if (space.taskSortOrder && space.taskSortOrder !== 'manual') sortSpaceTasks(space);
    document.getElementById('task-edit-modal').style.display = 'none';
    btnSave.innerText = "Save"; btnSave.disabled = false;
    saveData(); 
    if (_fromCommandCenter) {
        setCurrentSpaceId(0); // Reset to Command Center
        if (window.renderDefaultDashboard) window.renderDefaultDashboard(); // 🟢 แก้ไข: เรียกผ่าน window เพื่อป้องกัน Reference Error
    } else {
        onRenderCallback(); // Original callback for regular spaces
    }
    _fromCommandCenter = false; // Reset the flag
}

/**
 * 🏷️ ฟังก์ชันขับเคลื่อน Tag Modal สำหรับโหมด Sandbox
 */
function openSandboxTagModal(index) {
    const task = currentTemplateTasks[index];
    if (!task) return;

    const modal = document.getElementById('tag-modal');
    const container = document.getElementById('modal-tag-list-container');
    const space = getCurrentSpace();
    
    // วาดรายการ Tag จาก Space ปัจจุบัน
    container.innerHTML = (space?.tags || []).map(tag => `
        <label class="tag-select-row">
            <input type="checkbox" class="sandbox-tag-check" value="${tag}" ${task.tags.includes(tag) ? 'checked' : ''}>
            <span>${tag}</span>
        </label>
    `).join('') || '<p style="font-size:12px; opacity:0.5; padding:10px;">No tags found in this space.</p>';

    modal.style.display = 'flex';
    
    document.getElementById('btn-save-item-tags').onclick = () => {
        task.tags = Array.from(container.querySelectorAll('.sandbox-tag-check:checked')).map(cb => cb.value);
        modal.style.display = 'none';
    };
    document.getElementById('btn-close-modal').onclick = () => { modal.style.display = 'none'; };
}

export function openTaskLinkModal(idx, isSubtask, pIdx = null, spaceId = null) {
    if (isSubtask) {
        editingLinkTaskIdx = pIdx;
        editingLinkSubIdx = idx;
    } else {
        editingLinkTaskIdx = idx;
        editingLinkSubIdx = null;
    }
    editingLinkSpaceId = spaceId;

    let task;
    if (spaceId === 'sandbox') {
        task = currentTemplateTasks[idx]; // 🟢 ดึงข้อมูลจาก Sandbox Array
    } else {
        const spaces = getSpaces();
        const space = spaceId ? spaces.find(s => s.id === spaceId) : getCurrentSpace();
        if (!space) return;

        task = space.tasks[editingLinkTaskIdx];
        if (isSubtask && task.subtasks) {
            task = task.subtasks[editingLinkSubIdx];
        }
    }

    if (!task) return;

    const linkData = task.linkData || { url: "", isSideview: false };
    document.getElementById('task-link-input').value = linkData.url;
    document.getElementById('task-link-sideview').checked = linkData.isSideview;
    document.getElementById('task-link-modal').style.display = 'flex';
}

async function saveTaskLink() {
    const url = document.getElementById('task-link-input').value.trim();
    const isSideview = document.getElementById('task-link-sideview').checked;

    let task;
    if (editingLinkSpaceId === 'sandbox') {
        task = currentTemplateTasks[editingLinkSubIdx !== null ? editingLinkSubIdx : editingLinkTaskIdx];
    } else {
        const spaces = getSpaces();
        const space = (editingLinkSpaceId && editingLinkSpaceId !== 'sandbox') ? spaces.find(s => s.id === editingLinkSpaceId) : getCurrentSpace();
        if (!space) return;

        task = space.tasks[editingLinkTaskIdx];
        if (editingLinkSubIdx !== null && task.subtasks) {
            task = task.subtasks[editingLinkSubIdx];
        }
    }

    if (task) {
        task.linkData = { url, isSideview };
        saveData();
        document.getElementById('task-link-modal').style.display = 'none';
        if (editingLinkSpaceId === 0 || window._isModalOpenedFromCommandCenter) {
            import('./defaultDashboard.js').then(m => m.renderDefaultDashboard());
        } else if (editingLinkSpaceId === 'sandbox') {
        } else {
            onRenderCallback();
        }
    }
}
export function renderQuickNotes(space) {
    const noteArea = document.getElementById('workspace-note');
    if (noteArea) {
        // Note: We don't overwrite innerHTML if it's focused to avoid cursor jumping, 
        // but initially or when switching spaces we must set it.
        if (document.activeElement !== noteArea) {
            noteArea.innerHTML = space.note || "";
        }
    }
}

export function renderTasks(space, currentFilterTags, currentFilterMode, currentSearchQuery) {
    if (!space) return;
    const taskListUI = document.getElementById('task-list');
    const archiveListUI = document.getElementById('archive-list');
    const repeatingWaitingListUI = document.getElementById('repeating-waiting-list');
    const repeatingContainer = document.getElementById('repeating-tasks-details');
    const calendarSyncListUI = document.getElementById('calendar-sync-list');
    const calendarSyncContainer = document.getElementById('calendar-sync-tasks-details');
    const trashListUI = document.getElementById('trash-task-list');
    const trashContainer = document.getElementById('trash-tasks-details');
    const archiveContainer = document.getElementById('archived-tasks-details');

    if (!taskListUI) return;
    if (document.activeElement && document.activeElement.classList.contains('task-actual-text')) return; 

    taskListUI.innerHTML = ''; 
    if (archiveListUI) archiveListUI.innerHTML = ''; 
    if (trashListUI) trashListUI.innerHTML = '';
    if (repeatingWaitingListUI) repeatingWaitingListUI.innerHTML = '';
    if (calendarSyncListUI) calendarSyncListUI.innerHTML = '';
    
    if(!space.tasks) space.tasks = [];
    checkAndResetHabits(space);

    const isProminentHidden = space.hideProminentTasks || false;
    const isMobile = window.innerWidth <= 768;

    const toggleTaskActionsBtn = document.getElementById('btn-toggle-task-actions');
    if (toggleTaskActionsBtn) {
        toggleTaskActionsBtn.innerHTML = `<span class="toggle-actions-btn circle-icon ${space.showTaskActions ? 'expanded' : ''}" style="margin: 0; pointer-events: none;"></span>`;
    }
    
    const filterTags = Array.isArray(currentFilterTags) ? currentFilterTags : [];
    const isFiltered = filterTags.length > 0 || (currentSearchQuery && currentSearchQuery !== "");
    const filterMode = getFilterMode();

    let todoHTML = '';
    let archiveHTML = '';
    let repeatingHTML = '';
    let calendarSyncHTML = '';
    let trashHTML = '';

    let todoCount = 0;
    let archiveCount = 0;
    let repeatingCount = 0;
    let calendarSyncCount = 0;
    let trashCount = 0;

    if (space.taskSortOrder && space.taskSortOrder !== 'manual') sortSpaceTasks(space);

    space.tasks.forEach((task, index) => {
        if (!task) return;
        
        let hasMatchTag = true;
        if (filterTags.length > 0) {
            const itemTags = task.tags || [];
            const itemTagsUpper = itemTags.map(t => t.toUpperCase());
            const checkTag = (tag) => {
                if (tag === 'UNTAGGED') return itemTags.length === 0;
                return itemTagsUpper.includes(tag.toUpperCase());
            };
            hasMatchTag = (filterMode === 'AND') ? filterTags.every(checkTag) : filterTags.some(checkTag);
        }
        
        if (!hasMatchTag) return;
        if (currentSearchQuery && !task.text.toLowerCase().includes(currentSearchQuery)) return;

        const today = new Date().setHours(0,0,0,0);
        const taskDue = task.dueDate ? new Date(task.dueDate).setHours(0,0,0,0) : null;
        const isRepeating = task.repeatConfig && task.repeatConfig.isRepeating;
        if (!task.completed && !task.isDeleted && taskDue && taskDue > today && !task.isProminent && isRepeating) return;

        const isRepeatingComplete = task.completed && task.repeatConfig && task.repeatConfig.isRepeating;
        const nextDate = isRepeatingComplete ? calculateNextDate(task.dueDate, task.repeatConfig, task) : null;

        const liContent = generateTaskHTML(task, index, {
            // ... (existing options)
            showSpaceBadge: false, spaceId: space.id, isProminentHidden, isFiltered,
            showActions: space.showTaskActions, isTrash: task.isDeleted, addingSubtaskToIndex, nextDueDate: nextDate
        });
        
        if (task.isDeleted) { trashHTML += liContent; trashCount++; }
        else if (task.completed && task.calendarEventId) {
            console.log(`[renderTasks] Task ${task.text} (ID: ${task.id}) is being added to Synced Calendar Tasks. Completed: ${task.completed}, Calendar ID: ${task.calendarEventId}`);
            calendarSyncHTML += liContent; calendarSyncCount++;
        }
        else if (isRepeatingComplete) { repeatingHTML += liContent; repeatingCount++; }
        else if (task.completed) { archiveHTML += liContent; archiveCount++; }
        else { todoHTML += liContent; todoCount++; }
    });

    taskListUI.innerHTML = todoHTML;
    if (archiveListUI) archiveListUI.innerHTML = archiveHTML;
    if (repeatingWaitingListUI) repeatingWaitingListUI.innerHTML = repeatingHTML;
    if (calendarSyncListUI) calendarSyncListUI.innerHTML = calendarSyncHTML;
    if (trashListUI) trashListUI.innerHTML = trashHTML;

    const updateLabel = (id, count) => {
        const el = document.getElementById(id);
        if (el) el.innerText = `(${count})`;
    };
    updateLabel('todo-count-label', todoCount);
    updateLabel('repeating-count-label', repeatingCount);
    updateLabel('calendar-sync-count-label', calendarSyncCount);
    updateLabel('archive-count-label', archiveCount);
    updateLabel('trash-count-label', trashCount);

    const showExtra = getAppSettings().showExtraTaskSections !== false;
    if (repeatingContainer) repeatingContainer.style.display = showExtra ? 'block' : 'none';
    if (calendarSyncContainer) calendarSyncContainer.style.display = showExtra ? 'block' : 'none';
    if (archiveContainer) archiveContainer.style.display = showExtra ? 'block' : 'none';
    if (trashContainer) trashContainer.style.display = showExtra ? 'block' : 'none';

    [taskListUI, archiveListUI, trashListUI, repeatingWaitingListUI, calendarSyncListUI].forEach(c => c && c.querySelectorAll('.task-actual-text').forEach(el => applySyntaxHighlighting(el)));

    if (!isFiltered && taskListUI) {
        if (taskListUI.sortable) taskListUI.sortable.destroy();
        taskListUI.sortable = Sortable.create(taskListUI, { 
            group: 'nested-tasks', animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost',
            disabled: space.isArchived || (space.taskSortOrder !== 'manual' && !!space.taskSortOrder),
            onStart: () => { document.body.classList.add('is-sorting-tasks'); window.getSelection().removeAllRanges(); },
            onEnd: function (evt) { 
                const oldIdx = parseInt(evt.item.getAttribute('data-index'));
                const movedItem = space.tasks.splice(oldIdx, 1)[0];
                const nextEl = evt.item.nextElementSibling;
                let targetIdx = nextEl ? parseInt(nextEl.getAttribute('data-index')) : space.tasks.length;
                if (nextEl && targetIdx > oldIdx) targetIdx--;
                space.tasks.splice(targetIdx, 0, movedItem);
                saveData(); onRenderCallback(); 
            }
        });
    }
}