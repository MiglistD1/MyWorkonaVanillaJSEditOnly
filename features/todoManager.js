import Sortable from '../sortable.esm.js';
import { svgEdit, svgTrashRed, googleTasksIcon } from '../core/icons.js';
import { getCurrentSpace, saveData, getShortDate, getAppSettings, setCurrentSpaceId, getSpaces, getFilterTags, loadData, getGlobalLaunchers, getLauncherTags, getCurrentSpaceId } from '../core/storage.js';
import { generateMiniTagsBtn, generateTaskHTML, attachSubtaskEventListeners, attachTaskInlineEditListeners, handleTagAutocomplete, applySyntaxHighlighting } from '../core/ui-helpers.js';

import { saveToDrive, getAuthToken } from '../core/driveSync.js';
import { svgRefresh, svgSpinner } from '../core/icons.js';
import { syncAllGoogleTasks, createGoogleTask, updateGoogleTaskUI, getTargetListId } from './googleTasks.js';
import { checkAndResetHabits, renderHabitList } from './habitSheet.js';
import { openGoogleTasks } from './googleTasksLauncher.js';

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

/** ☁️ ฟังก์ชันสำหรับสั่ง Sync ข้อมูลขึ้น Google Drive อัตโนมัติ (Background Auto-Sync) */
async function triggerCloudSave() {
    // ตรวจสอบสถานะการล็อกอินแบบเงียบๆ (ไม่เด้งหน้าต่างถาม)
    const token = await getAuthToken(false);
    if (!token) return; // ถ้าไม่ได้ล็อกอิน Drive ไว้ ก็ไม่ต้องทำอะไรต่อ

    // เตรียมข้อมูลชุดเดียวกับที่ระบบ Restore (loadFromDrive) ต้องการ
    const fullAppData = {
        mySpacesData: getSpaces(),
        appSettings: getAppSettings(),
        lastSpaceId: getCurrentSpaceId(),
        globalLaunchers: getGlobalLaunchers(),
        launcherTags: getLauncherTags()
    };

    // ระบบ Debounce: หน่วงเวลา 5 วินาทีก่อนเซฟ เพื่อรวบรวมการแก้ไขหลายๆ อย่างไว้ในครั้งเดียว
    if (window._driveSyncTimeout) clearTimeout(window._driveSyncTimeout);
    window._driveSyncTimeout = setTimeout(() => {
        // เรียกใช้ฟังก์ชันที่เตรียมไว้ใน window (หรือจะเรียกจาก import ก็ได้)
        window.saveToDrive(fullAppData).then(success => {
            if (success) console.log("☁️ Auto-synced tasks to Google Drive");
        });
    }, 5000);
}

let fetchGoogleAPI = null;
let getGoogleAuthToken = null;
let getCurrentGoogleListId = null;
let isGoogleSyncEnabled = null;
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

export function initTodoManager(callbacks) {
    fetchGoogleAPI = callbacks.fetchGoogleAPI;
    getGoogleAuthToken = callbacks.getGoogleAuthToken;
    getCurrentGoogleListId = callbacks.getCurrentGoogleListId;
    isGoogleSyncEnabled = callbacks.isGoogleSyncEnabled;
    onRenderCallback = callbacks.onRender;

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

    // 🟢 Inject CSS สำหรับ Task Entry Animation
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes taskEntry {
            from { opacity: 0; transform: translateY(-8px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .task-item { animation: taskEntry 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
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
    document.getElementById('btn-close-link-modal').addEventListener('click', () => { document.getElementById('task-link-modal').style.display = 'none'; });
    document.getElementById('btn-save-task-link').addEventListener('click', saveTaskLink);
    document.getElementById('task-sync-row').addEventListener('click', (e) => {
        if (e.target.id !== 'edit-task-sync-check') document.getElementById('edit-task-sync-check').click();
    });

    // Note Events
    document.querySelectorAll('.custom-color-slot').forEach((picker, index) => {
        picker.addEventListener('input', (e) => { document.execCommand('foreColor', false, e.target.value); getCurrentSpace().note = document.getElementById('workspace-note').innerHTML; getAppSettings().quickColors[index] = e.target.value; saveData(); });
    });
    // workspaceNote ถูกประกาศไว้แล้วด้านบน
    document.getElementById('btn-undo-note').addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('undo', false, null); getCurrentSpace().note = document.getElementById('workspace-note').innerHTML; saveData(); });
    document.querySelectorAll('.note-toolbar select').forEach(el => { el.addEventListener('change', (e) => { document.execCommand(e.target.dataset.cmd, false, e.target.value); getCurrentSpace().note = document.getElementById('workspace-note').innerHTML; saveData(); }); });
    
    workspaceNote.addEventListener('input', (e) => { getCurrentSpace().note = e.target.innerHTML; saveData(); });

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

    // 🟢 Empty Trash Tasks Button
    const btnEmptyTrash = document.getElementById('btn-empty-tasks-trash');
    if (btnEmptyTrash) {
        btnEmptyTrash.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation(); // ป้องกันการพับ/เปิดของ Details เมื่อกดปุ่ม
            const space = getCurrentSpace();
            if (space && confirm("Empty Tasks Trash? This cannot be undone.")) {
                // ลบออกจาก Google Tasks ด้วยหากมีการซิงค์อยู่
                for (const t of space.tasks) {
                    if (t.isDeleted && t.googleTaskId && getGoogleAuthToken()) {
                        await fetchGoogleAPI(`/lists/${getCurrentGoogleListId()}/tasks/${t.googleTaskId}`, 'DELETE');
                    }
                }
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
        
        // 🔘 0. Focus Task Button Logic (Correct Location)
        const focusBtn = e.target.closest('.btn-focus-task');
        if (focusBtn) {
            const idx = parseInt(focusBtn.getAttribute('data-index'));
            const sid = parseInt(focusBtn.getAttribute('data-space-id'));
            const settings = getAppSettings();
            const targetSpace = (sid === space.id) ? space : getSpaces().find(s => s.id === sid);
            const task = targetSpace?.tasks[idx];

            if (task) {
                const isCurrentlyFocused = settings.focusedTask && 
                                           settings.focusedTask.spaceId === sid && 
                                           settings.focusedTask.createdAt === task.createdAt;

                // 🟢 สลับการโฟกัสทันทีอย่างอิสระ
                settings.focusedTask = isCurrentlyFocused ? null : { spaceId: sid, createdAt: task.createdAt };
                saveData();
                onRenderCallback();
            }
            return;
        }

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

        // 🔘 Main Task Sync Toggle
        if (e.target.closest('.main-task-sync-toggle-btn')) {
            const btn = e.target.closest('.main-task-sync-toggle-btn');
            const idx = parseInt(btn.getAttribute('data-index'));
            const task = space.tasks[idx];
            if (!task) return;

            const token = getGoogleAuthToken();
            const listId = getCurrentGoogleListId(space); // 🟢 ส่ง space เข้าไปด้วย

            if (!token) {
                alert("Please connect to Google first");
                return;
            }

            if (task.googleTaskId) {
                // ปิดการซิงค์: ลบออกจาก Google
                await fetchGoogleAPI(`/lists/${listId}/tasks/${task.googleTaskId}`, 'DELETE');
                task.googleTaskId = null;
            } else {
                // เปิดการซิงค์: สร้างบน Google
                const gTitle = `${task.text} (S: ${space.name})`;
                let gBody = { title: gTitle };
                if (task.dueDate) { gBody.due = new Date(task.dueDate).toISOString(); }
                const gTask = await createGoogleTask(listId, gBody);
                if (gTask && gTask.id) {
                    task.googleTaskId = gTask.id;
                }
            }
            saveData();
            onRenderCallback();
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
                // Google Sync
                if (task.googleTaskId && getGoogleAuthToken()) {
                    const targetListId = getCurrentGoogleListId(space);
                    fetchGoogleAPI(`/lists/${targetListId}/tasks/${task.googleTaskId}`, 'PATCH', { status: 'completed' });
                }
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
                if (task.googleTaskId && getGoogleAuthToken()) {
                    const targetListId = getCurrentGoogleListId(space);
                    fetchGoogleAPI(`/lists/${targetListId}/tasks/${task.googleTaskId}`, 'PATCH', { status: 'completed' });
                }
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
            playTrashSound();
            const days = getAppSettings().autoDeleteDays || 30;
            task.expiryAt = task.deletedAt + (days * 24 * 60 * 60 * 1000);
            task.completed = false; // เอากลับมาเป็นงานที่ยังไม่เสร็จเผื่อกู้คืน

            // ☁️ Sync with Google Tasks: เมื่อลบงานในแอป ให้ทำเครื่องหมายว่าเสร็จใน Google เพื่อซ่อนงาน
            if (task.googleTaskId && getGoogleAuthToken()) {
                const targetListId = getTargetListId(space);
                fetchGoogleAPI(`/lists/${targetListId}/tasks/${task.googleTaskId}`, 'PATCH', { status: 'completed' });
            }
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
                triggerCloudSave();
            }
        }
        // Permanent Delete Task
        if (e.target.closest('.delete-task-perm-btn')) {
            const idx = parseInt(e.target.closest('.delete-task-perm-btn').dataset.index);
            if (confirm("Delete task permanently?")) {
                if (space.tasks[idx].googleTaskId && getGoogleAuthToken()) {
                    const targetListId = getCurrentGoogleListId(space);
                    fetchGoogleAPI(`/lists/${targetListId}/tasks/${space.tasks[idx].googleTaskId}`, 'DELETE'); 
                }
                space.tasks.splice(idx, 1);
                saveData(); onRenderCallback();
                triggerCloudSave();
            }
        }
        // 🟢 NEW: Permanent Delete Subtask
        if (e.target.closest('.delete-subtask-perm-btn')) {
            const btn = e.target.closest('.delete-subtask-perm-btn');
            const pIdx = parseInt(btn.getAttribute('data-parent-index'));
            const sIdx = parseInt(btn.getAttribute('data-sub-index'));
            if (confirm("Delete subtask permanently?")) {
                const subtask = space.tasks[pIdx]?.subtasks?.[sIdx];
                if (subtask && subtask.googleTaskId && getGoogleAuthToken()) {
                    const targetListId = getCurrentGoogleListId(space);
                    fetchGoogleAPI(`/lists/${targetListId}/tasks/${subtask.googleTaskId}`, 'DELETE');
                }
                space.tasks[pIdx].subtasks.splice(sIdx, 1);
                saveData();
                onRenderCallback();
                triggerCloudSave();
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
                triggerCloudSave(); // Trigger cloud save after converting
                onRenderCallback(); // Rerender UI
            }
        }
        // Sub-task Sync Toggle
        if (e.target.closest('.subtask-sync-toggle-btn')) {
            const btn = e.target.closest('.subtask-sync-toggle-btn');
            const pIdx = parseInt(btn.getAttribute('data-parent-index'));
            const sIdx = parseInt(btn.getAttribute('data-sub-index'));

            const parentTask = space.tasks[pIdx];
            const task = parentTask?.subtasks?.[sIdx];
            if (!task) return;

            const token = getGoogleAuthToken();
            const targetListId = getCurrentGoogleListId(space);

            if (!token) {
                alert("Please connect to Google first");
                return;
            }

            if (task.googleTaskId) {
                // ปิดการซิงค์: ลบออกจาก Google
                await fetchGoogleAPI(`/lists/${targetListId}/tasks/${task.googleTaskId}`, 'DELETE');
                task.googleTaskId = null;
            } else {
                // เปิดการซิงค์: ตรวจสอบว่างานหลักซิงค์แล้วหรือยังเพื่อทำการ Nesting
                if (!parentTask.googleTaskId) {
                    alert("Please sync the main task first to nest this subtask in Google Tasks.");
                    return;
                }

                // สร้างบน Google พร้อมระบุ Parent ID
                const gTitle = `${task.text} (S: ${space.name})`;
                let gBody = { title: gTitle };
                if (task.dueDate) { gBody.due = new Date(task.dueDate).toISOString(); }
                const gTask = await createGoogleTask(targetListId, gBody, parentTask.googleTaskId);
                if (gTask && gTask.id) {
                    task.googleTaskId = gTask.id;
                }
            }
            
            saveData();
            onRenderCallback();
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

    // Scope listeners to specific containers instead of document
    const taskListEl = document.getElementById('task-list');
    const archiveListEl = document.getElementById('archive-list');
    const trashListEl = document.getElementById('trash-task-list');
    
    // Logic สำหรับ Checkbox แยกออกมา
    const handleTaskChange = (e) => { // This handles main tasks
        // Subtask checkboxes are handled by attachSubtaskEventListeners
        if (e.target.classList.contains('subtask-check-box')) {
            return; 
        }

        if (e.target.classList.contains('task-check-box')) {
            const isChecked = e.target.checked;
            const index = parseInt(e.target.getAttribute('data-index'));
            const taskItem = e.target.closest('.task-item');

            // Animation 4: Hold & Vanish Effect
            if (isChecked && taskItem) {
                taskItem.classList.add('completed-hold');

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

            if (isChecked) {
                const settings = getAppSettings();
                if (settings.focusedTask && settings.focusedTask.spaceId === space.id && settings.focusedTask.createdAt === task.createdAt) {
                    settings.focusedTask = null;
                }
                task.isDeleted = true;
                task.deletedAt = Date.now();
                const days = settings.autoDeleteDays || 30;
                task.expiryAt = task.deletedAt + (days * 24 * 60 * 60 * 1000);
                task.completed = false;
                task.isProminent = false;
                if (task.subtasks) task.subtasks.forEach(sub => { sub.isDeleted = true; sub.deletedAt = task.deletedAt; sub.expiryAt = task.expiryAt; sub.completed = false; });
            } else {
                task.completed = false;
                task.completedAt = null;
                task.isDeleted = false;
                task.deletedAt = null;
                task.expiryAt = null;
                if (task.subtasks) task.subtasks.forEach(sub => { sub.isDeleted = false; sub.completed = false; });
                
                // 🟢 ย้ายงานที่กู้คืนกลับไปไว้บนสุดเพื่อให้เห็นชัดเจน
                const [restoredTask] = space.tasks.splice(index, 1);
                space.tasks.unshift(restoredTask);
            }

            // ☁️ Sync with Google Tasks (ใช้ targetListId ที่ถูกต้อง)
            if (task.googleTaskId && getGoogleAuthToken()) {
                const targetListId = getTargetListId(space);
                fetchGoogleAPI(`/lists/${targetListId}/tasks/${task.googleTaskId}`, 'PATCH', { status: isChecked ? 'completed' : 'needsAction' });
            }

            // อัปเดตสถานะงานย่อยทั้งหมด
            if (task.subtasks && task.subtasks.length > 0) {
                task.subtasks.forEach(sub => {
                    if (!sub) return;
                    sub.completed = isChecked;
                    if (sub.googleTaskId && getGoogleAuthToken()) {
                        const targetListId = getCurrentGoogleListId(space);
                        fetchGoogleAPI(`/lists/${targetListId}/tasks/${sub.googleTaskId}`, 'PATCH', { status: isChecked ? 'completed' : 'needsAction' });
                    }
                });
            }

            saveData(true); // บันทึกทันที
            triggerCloudSave(); // ☁️ ซิงค์ไปที่ Cloud หลังเปลี่ยนสถานะงาน

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
        // The main task checkbox change is handled here
        taskListEl.addEventListener('change', handleTaskChange); 

        taskListEl.addEventListener('keydown', handleSubtaskInputKey); // 🟢 กู้คืน: จัดการ Enter ในช่อง Add Subtask

        taskListEl.addEventListener('focusout', handleSubtaskBlur);

        // Add Inline Editing for Main and Subtasks
        attachTaskInlineEditListeners(taskListEl, () => getCurrentSpace(), {
            fetchGoogleAPI,
            getGoogleAuthToken,
            getCurrentGoogleListId,
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
                if (task && task.googleTaskId && getGoogleAuthToken()) {
                    const targetListId = getCurrentGoogleListId(space);
                    fetchGoogleAPI(`/lists/${targetListId || '@default'}/tasks/${task.googleTaskId}`, 'DELETE');
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
        trashListEl.addEventListener('contextmenu', handleTaskContextMenu);
        trashListEl.addEventListener('change', handleTaskChange);
    }
    if (archiveListEl) {
        archiveListEl.addEventListener('click', handleTaskClick);
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
            fetchGoogleAPI,
            getGoogleAuthToken,
            getCurrentGoogleListId,
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
                if (task && task.googleTaskId && getGoogleAuthToken()) {
                    const targetListId = getCurrentGoogleListId(space);
                    fetchGoogleAPI(`/lists/${targetListId || '@default'}/tasks/${task.googleTaskId}`, 'DELETE');
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
    window._refreshSandbox = () => { renderSandbox(); };

    const renderSandbox = () => {
        sandboxList.innerHTML = currentTemplateTasks.map((t, i) => {
            const hasLink = t.linkData && t.linkData.url;
            const linkIcon = hasLink ? '#icon-notebook' : '#icon-link';
            const syncActive = t.wantsSync ? 'active' : '';
            
            return `
            <li class="task-item" style="padding:8px 12px; border-bottom:1px solid var(--border-color); display:flex; align-items:center; gap:10px;">
                <div style="width:16px; height:16px; border-radius:50%; border:2px solid var(--border-color); opacity:0.3;"></div>
                <span style="flex:1; font-size:14px; font-weight:500;">${t.text}</span>
                
                <div class="item-action-group" style="display:flex; align-items:center; gap:6px; opacity:1;">
                    ${generateMiniTagsBtn(t.tags, 'sandbox-task', i)}
                    
                    <button class="btn-icon task-link-btn ${hasLink ? 'has-link' : ''}" data-index="${i}" title="Task Link">
                        <svg class="svg-icon-sm"><use href="${linkIcon}"></use></svg>
                    </button>

                    <button class="btn-icon main-task-sync-toggle-btn ${syncActive}" data-index="${i}" title="Google Tasks Sync">
                        ${googleTasksIcon}
                    </button>

                    <button class="btn-icon btn-remove-temp-task" data-index="${i}" style="color:#ef4444; margin-left: 5px;">✕</button>
                </div>
            </li>`;
        }).join('');
    };

    sandboxList.onclick = (e) => {
        const target = e.target;
        const removeBtn = target.closest('.btn-remove-temp-task');
        const tagBtn = target.closest('.btn-edit-tags');
        const linkBtn = target.closest('.task-link-btn');
        const syncBtn = target.closest('.main-task-sync-toggle-btn');

        if (removeBtn) {
            const i = parseInt(removeBtn.dataset.index);
            currentTemplateTasks.splice(i, 1);
            renderSandbox();
        } else if (tagBtn) {
            openSandboxTagModal(parseInt(tagBtn.dataset.index)); // 🟢 เรียก Modal แทน prompt
        } else if (linkBtn) {
            openTaskLinkModal(parseInt(linkBtn.dataset.index), false, null, 'sandbox'); // 🟢 เรียก Modal แทน prompt
        } else if (syncBtn) {
            const i = parseInt(syncBtn.dataset.index);
            currentTemplateTasks[i].wantsSync = !currentTemplateTasks[i].wantsSync;
            renderSandbox();
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
                    googleTaskId: null
                };

                // ☁️ Auto-sync with Google Tasks if enabled in Template
                if (t.wantsSync && isGoogleSyncEnabled() && getGoogleAuthToken()) {
                    const gTitle = `${t.text} (S: ${space.name})`;
                    let gBody = { title: gTitle };
                    if (t.dueDate) gBody.due = new Date(t.dueDate).toISOString();
                    
                    const gTask = await fetchGoogleAPI(`/lists/${getCurrentGoogleListId()}/tasks`, 'POST', gBody);
                    if (gTask && gTask.id) {
                        newTask.googleTaskId = gTask.id;
                    }
                }

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
        if (val) { currentTemplateTasks.push({ text: val, completed: false, subtasks: [], tags: [], linkData: null, wantsSync: true }); tempTaskInput.value = ''; renderSandbox(); }
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
    let text = input.value.trim();
    if (text !== '') {
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
        let newTask = { text: text, completed: false, tags: tags, dueDate: dateInput.value || null, createdAt: Date.now(), googleTaskId: null, isProminent: false, subtasks: [], subtasksHidden: false }; 

        if (isGoogleSyncEnabled() && getGoogleAuthToken()) {
            input.placeholder = "Syncing... ☁️";
            const listId = getCurrentGoogleListId(space);
            const gTitle = `${text} (S: ${space.name})`;
            let gBody = { title: gTitle };
            if (newTask.dueDate) { gBody.due = new Date(newTask.dueDate).toISOString(); }
            const gTask = await fetchGoogleAPI(`/lists/${listId}/tasks`, 'POST', gBody);
            if (gTask && gTask.id) { newTask.googleTaskId = gTask.id; } 
        }
        space.tasks.push(newTask); 
        if (space.taskSortOrder && space.taskSortOrder !== 'manual') sortSpaceTasks(space);
        playTaskAddedSound();
        input.value = ''; input.disabled = false; input.placeholder = "Type a task..."; input.focus();
        saveData(); 
        triggerCloudSave(); // ☁️ ซิงค์ไปที่ Cloud หลังเพิ่มงานใหม่
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
    document.getElementById('edit-task-sync-check').checked = task.googleTaskId ? true : false;
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
    const wantsSync = document.getElementById('edit-task-sync-check').checked;
    const token = getGoogleAuthToken();
    const listId = getCurrentGoogleListId(space);
    
    if(newName === "") return;
    
    const btnSave = document.getElementById('btn-save-task-edit');
    btnSave.innerText = "Saving..."; btnSave.disabled = true;
    
    const gTitle = `${newName} (S: ${space.name})`;
    let gPatchBody = { title: gTitle };
    if (newDate) gPatchBody.due = new Date(newDate).toISOString(); else gPatchBody.due = null;

    if (task.googleTaskId && wantsSync && token) {
        await fetchGoogleAPI(`/lists/${listId}/tasks/${task.googleTaskId}`, 'PATCH', gPatchBody);
    } else if (!task.googleTaskId && wantsSync && token) {
        let parentGoogleTaskId = null;
        if (editingSubtaskLocalId) {
            const parentTask = space.tasks[editingTaskLocalIndex];
            parentGoogleTaskId = parentTask.googleTaskId;
            
            if (!parentGoogleTaskId) {
                alert("Please sync the main task first to nest this subtask.");
                btnSave.innerText = "Save"; btnSave.disabled = false;
                return;
            }
        }
        const gTask = await createGoogleTask(listId, gPatchBody, parentGoogleTaskId);
        if (gTask && gTask.id) { task.googleTaskId = gTask.id; }
    } else if (task.googleTaskId && !wantsSync && token) {
        await fetchGoogleAPI(`/lists/${listId}/tasks/${task.googleTaskId}`, 'DELETE');
        task.googleTaskId = null;
    } else if (wantsSync && !token) {
        alert("Please connect to Google first");
        btnSave.innerText = "Save"; btnSave.disabled = false;
        return;
    }

    task.text = newName;
    task.dueDate = newDate || null;
    if (space.taskSortOrder && space.taskSortOrder !== 'manual') sortSpaceTasks(space);
    document.getElementById('task-edit-modal').style.display = 'none';
    btnSave.innerText = "Save"; btnSave.disabled = false;
    saveData(); 
    triggerCloudSave(); // ☁️ ซิงค์ไปที่ Cloud หลังแก้ไขเสร็จ
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
        if (window._refreshSandbox) window._refreshSandbox();
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
        triggerCloudSave(); // ☁️ ซิงค์ไปที่ Cloud
        document.getElementById('task-link-modal').style.display = 'none';
        if (editingLinkSpaceId === 0 || window._isModalOpenedFromCommandCenter) {
            import('./defaultDashboard.js').then(m => m.renderDefaultDashboard());
        } else if (editingLinkSpaceId === 'sandbox') {
            if (window._refreshSandbox) window._refreshSandbox(); // 🟢 Refresh Sandbox UI หลังเซฟลิงก์
        } else {
            onRenderCallback();
        }
    }
}

export function renderTasks(space, currentFilterTags, currentFilterMode, currentSearchQuery) {
    const taskListUI = document.getElementById('task-list'); 
    const archiveListUI = document.getElementById('archive-list');
    const trashListUI = document.getElementById('trash-task-list');
    const trashContainer = document.getElementById('trash-tasks-details');

    // 🟢 1. จัดการตัวแปรและสถานะ Mobile
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const isCommandCenter = getCurrentSpaceId() === 0;
    const mobileTagBtn = document.getElementById('btn-open-mobile-tag-modal');

    // 🟢 2. ระบบ Mobile FAB และ Menu (ย้ายมาไว้ที่นี่เพื่อให้รองรับการเปลี่ยน Space)
    if (isMobile) {
        const fab = document.getElementById('sf-mobile-fab-add');
        const fabMenu = document.getElementById('sf-mobile-fab-menu');

        // จัดการการแสดงผลของ FAB ตามหน้า (Command Center ไม่ให้มี)
        if (fab) fab.style.setProperty('display', isCommandCenter ? 'none' : 'flex', 'important');

        if (!isCommandCenter) {
            let targetFab = fab;
            if (!targetFab) {
                targetFab = document.createElement('button');
                targetFab.id = 'sf-mobile-fab-add';
                targetFab.className = 'sf-mobile-fab';
                targetFab.innerHTML = '+';
                document.body.appendChild(targetFab);

                // ระบบซ่อน FAB เมื่อเลื่อนจอ
                const tasksCard = document.getElementById('tasks-card');
                let lastSt = 0;
                if (tasksCard) {
                    tasksCard.onscroll = () => {
                        let st = tasksCard.scrollTop;
                        if (st > lastSt && st > 50) targetFab.style.transform = 'translateY(100px)';
                        else targetFab.style.transform = 'translateY(0)';
                        lastSt = st;
                    };
                }
            }

            // สร้าง Menu Popup ถ้ายังไม่มี
            let targetMenu = fabMenu;
            if (!targetMenu) {
                targetMenu = document.createElement('div');
                targetMenu.id = 'sf-mobile-fab-menu';
                targetMenu.className = 'mobile-tools-popup';
                targetMenu.innerHTML = `
                    <div class="drag-handle-bar"></div>
                    <button id="sf-fab-menu-add-task" style="display:flex; align-items:center; gap:12px;"><svg class="svg-icon-lg" style="width:20px; height:20px;"><use href="#icon-pencil"></use></svg> Add new task</button>
                    <button id="sf-fab-menu-templates" style="display:flex; align-items:center; gap:12px;"><svg class="svg-icon-lg" style="width:20px; height:20px;"><use href="#icon-layers"></use></svg> Templates</button>
                `;
                document.body.appendChild(targetMenu);

                targetMenu.querySelector('#sf-fab-menu-add-task').onclick = (e) => {
                    e.stopPropagation();
                    targetMenu.classList.remove('is-active');
                    const bar = document.getElementById('new-task-input')?.closest('.task-input-bar');
                    if (bar) bar.classList.add('is-active');
                    document.getElementById('new-task-input').focus();
                    document.getElementById('sf-mobile-fab-add')?.classList.add('is-hidden');
                };

                targetMenu.querySelector('#sf-fab-menu-templates').onclick = (e) => {
                    e.stopPropagation();
                    targetMenu.classList.remove('is-active');
                    document.getElementById('btn-todo-templates')?.click();
                };
            }

            // 🟢 Fix: Ensure the re-rendered FAB also triggers the task input directly
            targetFab.onclick = (e) => {
                e.stopPropagation();
                const bar = document.getElementById('new-task-input')?.closest('.task-input-bar');
                if (bar) bar.classList.add('is-active');
                document.getElementById('new-task-input')?.focus();
                targetFab.classList.add('is-hidden');
            };
        }
    }

    if (mobileTagBtn) {
        mobileTagBtn.style.display = isMobile ? 'inline-flex' : 'none';
    }

    // รวบปุ่มบนหัว To-do เป็น Menu เดียวกันบนมือถือ
    const btnToggleActions = document.getElementById('btn-toggle-task-actions');
    const btnToggleProminent = document.getElementById('btn-toggle-prominent-tasks');
    const btnExpand = document.getElementById('btn-expand-all-subtasks');
    const btnCollapse = document.getElementById('btn-collapse-all-subtasks');
    const btnTemplates = document.getElementById('btn-todo-templates');

    if (isMobile) {
        let mobileToolsBtn = document.getElementById('btn-mobile-todo-tools');
        if (!mobileToolsBtn) {
            mobileToolsBtn = document.createElement('button');
            mobileToolsBtn.id = 'btn-mobile-todo-tools';
            mobileToolsBtn.className = 'btn-icon mobile-only';
            mobileToolsBtn.innerHTML = '⋮'; 
            btnToggleActions.parentNode.insertBefore(mobileToolsBtn, btnToggleActions);
        }

        let menuPopup = document.getElementById('sf-mobile-tools-popup');
        if (!menuPopup) {
            menuPopup = document.createElement('div');
            menuPopup.id = 'sf-mobile-tools-popup';
            menuPopup.className = 'mobile-tools-popup';
            document.body.appendChild(menuPopup);
        }

        // คลิกข้างนอกเพื่อปิดเมนู (รวมทั้ง FAB Menu และ Tools Menu)
        if (!window._mobileMenuGlobalClickBound) {
            document.addEventListener('click', (e) => {
                const toolsMenu = document.getElementById('sf-mobile-tools-popup');
                const fabMenu = document.getElementById('sf-mobile-fab-menu');
                const inputBar = document.getElementById('new-task-input')?.closest('.task-input-bar');
                
                // 🟢 แก้ไข: ตรวจสอบว่าไม่ได้คลิกที่ตัวปุ่มเปิด (Trigger) เพื่อไม่ให้ปิดทันทีที่เปิด
                if (toolsMenu && !toolsMenu.contains(e.target) && !e.target.closest('#btn-mobile-todo-tools')) toolsMenu.style.display = 'none';
                if (fabMenu && !fabMenu.contains(e.target) && !e.target.closest('#sf-mobile-fab-add')) fabMenu.classList.remove('is-active');
                
                if (inputBar && !inputBar.contains(e.target) && inputBar.classList.contains('is-active') && !e.target.closest('#sf-mobile-fab-add')) {
                    inputBar.classList.remove('is-active');
                    document.getElementById('sf-mobile-fab-add')?.classList.remove('is-hidden');
                }
            });
            window._mobileMenuGlobalClickBound = true;
        }

        mobileToolsBtn.onclick = (e) => {
                e.stopPropagation();
                // 🟢 อัปเดตเนื้อหาเมนูตามสถานะปัจจุบันก่อนแสดงผล
                menuPopup.innerHTML = `
                    <button data-action="1">👁️ ${space.showTaskActions ? 'Hide' : 'Show'} Quick Actions</button>
                    <button data-action="2">🚩 ${space.hideProminentTasks ? 'Show' : 'Hide'} Flags</button>
                    <div style="height:1px; background:var(--border-color); margin:4px 0; opacity:0.5;"></div>
                    <button data-action="3">📂 Expand All Subtasks</button>
                    <button data-action="4">📁 Collapse All Subtasks</button>
                    <div style="height:1px; background:var(--border-color); margin:4px 0; opacity:0.5;"></div>
                    <button data-action="5">📑 Templates</button>
                `;
                const isVisible = menuPopup.style.display === 'flex';
                menuPopup.style.display = isVisible ? 'none' : 'flex';
            };

            menuPopup.onclick = (e) => {
                const action = e.target.closest('button')?.dataset.action;
                if (action === '1') btnToggleActions.click();
                if (action === '2') btnToggleProminent.click();
                if (action === '3') btnExpand.click();
                // 🟢 เพิ่มปุ่ม Templates เข้าไปใน Mobile Menu ด้วย
                if (action === '5') {
                    document.getElementById('btn-todo-templates')?.click();
                }
                if (action === '4') btnCollapse.click();
                menuPopup.style.display = 'none';
            };

        mobileToolsBtn.style.display = 'inline-flex';
    } else {
        // กลับสู่โหมด Desktop
        const mobileToolsBtn = document.getElementById('btn-mobile-todo-tools');
        if (mobileToolsBtn) mobileToolsBtn.style.display = 'none';
    }

    // 🛑 ป้องกัน UI เอ๋อ: หากผู้ใช้กำลังพิมพ์งานอยู่ ห้ามวาดรายการใหม่ทับเด็ดขาด
    if (document.activeElement && document.activeElement.classList.contains('task-actual-text')) {
        console.log("Render skipped: User is typing to prevent blinking and data loss.");
        return; 
    }

    if (taskListUI) taskListUI.innerHTML = ''; 
    if (archiveListUI) archiveListUI.innerHTML = ''; 
    if (trashListUI) trashListUI.innerHTML = '';
    
    if(!space.tasks) space.tasks = [];

    // 🟢 ตรวจสอบว่ามีงานที่มี Subtask หรือไม่ เพื่อซ่อน/แสดงปุ่ม Expand/Collapse All
    const btnExpandAll = document.getElementById('btn-expand-all-subtasks');
    const btnCollapseAll = document.getElementById('btn-collapse-all-subtasks');
    if (btnExpandAll && btnCollapseAll) {
        const hasSubtasks = space.tasks.some(t => t && !t.completed && !t.isDeleted && t.subtasks && t.subtasks.length > 0);
        btnExpandAll.style.display = hasSubtasks ? 'inline-flex' : 'none';
        btnCollapseAll.style.display = hasSubtasks ? 'inline-flex' : 'none';
    }

    // Update Google Task UI (Space-specific list settings)
    updateGoogleTaskUI(space);

    // ตรวจสอบและรีเซ็ตสถานะ Habit ของวันใหม่ก่อนคำนวณจำนวนงานบนปุ่ม
    checkAndResetHabits(space);

    const isProminentHidden = space.hideProminentTasks || false;

    // Update master toggle button UI
    const toggleProminentBtn = document.getElementById('btn-toggle-prominent-tasks');
    if (toggleProminentBtn) {
        toggleProminentBtn.style.opacity = isProminentHidden ? '0.3' : '1';
        toggleProminentBtn.classList.toggle('active', !isProminentHidden);
    }

        // Update task actions toggle button UI
    const toggleTaskActionsBtn = document.getElementById('btn-toggle-task-actions');
    if (toggleTaskActionsBtn) {
        toggleTaskActionsBtn.style.opacity = space.showTaskActions ? '1' : '0.6';
        toggleTaskActionsBtn.innerHTML = `<svg class="svg-icon-sm"><use href="#icon-${space.showTaskActions ? 'eye' : 'eye-off'}"></use></svg>`;
    }


    // --- Habit Sheet Button Injection ---
    const taskHeader = document.getElementById('header-tasks-text');
    if (taskHeader) {
        const habits = space.habits || [];
        const total = habits.length;
        const done = habits.filter(h => h.completed).length;
        const percent = total > 0 ? (done / total) * 100 : 0;

        let btnBg, btnText, btnBorder;
        if (total === 0) { btnBg = '#f7f7f5'; btnText = '#787774'; btnBorder = '#e1e1e1'; } 
        else if (percent === 0) { btnBg = '#fee2e2'; btnText = '#ef4444'; btnBorder = '#fca5a5'; } 
        else if (percent < 100) { btnBg = '#fef3c7'; btnText = '#d97706'; btnBorder = '#fcd34d'; } 
        else { btnBg = '#eafaf1'; btnText = '#27ae60'; btnBorder = '#2ecc71'; }

        let habitBtn = document.getElementById('btn-open-habit');
        if (!habitBtn) {
            habitBtn = document.createElement('button');
            habitBtn.id = 'btn-open-habit';
            habitBtn.style = `margin-left: 15px; padding: 4px 12px; font-size: 13px; font-weight: 700; border-radius: 6px; cursor: pointer; vertical-align: middle; transition: all 0.3s ease;`;
            taskHeader.parentElement.appendChild(habitBtn);
        }

        habitBtn.innerHTML = `✨ Habit ${done}/${total}`;
        habitBtn.style.background = btnBg;
        habitBtn.style.color = btnText;
        habitBtn.style.border = `1px solid ${btnBorder}`;
        habitBtn.onclick = () => { import('./habitSheet.js').then(m => m.toggleHabitModal(space)); };
    }

    // --- Sort Dropdown Injection ---
    if (taskHeader) {
        let sortContainer = document.getElementById('task-sort-container');
        if (!sortContainer) {
            sortContainer = document.createElement('div');
            sortContainer.id = 'task-sort-container';
            sortContainer.style = 'margin-left: 6px; display: flex; align-items: center;';
        }

        // 🟢 ย้ายตำแหน่งมาไว้หลังปุ่ม Template (ถ้ามี) เพื่อความเป็นระเบียบ
        const templateBtn = document.getElementById('btn-todo-templates');
        if (templateBtn) {
            templateBtn.after(sortContainer);
        } else {
            taskHeader.parentElement.appendChild(sortContainer);
        }

        const currentSort = space.taskSortOrder || 'manual';
        sortContainer.innerHTML = `
            <select id="task-sort-select" title="Sort Tasks" style="font-family: var(--app-font); font-size: 11px; font-weight: 700; padding: 3px 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-body); color: var(--text-main); cursor: pointer; outline: none; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <option value="manual" ${currentSort === 'manual' ? 'selected' : ''}>⇅ Manual</option>
                <option value="date" ${currentSort === 'date' ? 'selected' : ''}>📅 By Date</option>
                <option value="name" ${currentSort === 'name' ? 'selected' : ''}>🔤 By Name</option>
            </select>
        `;
        sortContainer.querySelector('#task-sort-select').onchange = (e) => {
            const val = e.target.value;
            space.taskSortOrder = val;
            if (val !== 'manual') {
                sortSpaceTasks(space);
            }
            saveData(true);
            onRenderCallback();
        };
    }

    const filterTags = Array.isArray(currentFilterTags) ? currentFilterTags : [];
    const isFiltered = filterTags.length > 0 || (currentSearchQuery && currentSearchQuery !== "");

    // 🟢 สร้างตัวแปรเก็บ HTML ไว้ก่อนวาดทีเดียวเพื่อประสิทธิภาพสูงสุด
    let todoHTML = '';
    let archiveHTML = '';
    let trashHTML = '';

    // 🟢 ตรวจสอบและจัดเรียงก่อนเริ่มลูปแสดงผล
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

            if (currentFilterMode === 'AND') {
                hasMatchTag = filterTags.every(checkTag);
            } else {
                hasMatchTag = filterTags.some(checkTag);
            }
        }
        
        if (!hasMatchTag) return;
        if (currentSearchQuery && !task.text.toLowerCase().includes(currentSearchQuery)) return;

        const liContent = generateTaskHTML(task, index, {
            showSpaceBadge: false,
            isMasterView: false,
            spaceId: space.id,
            isProminentHidden: isProminentHidden,
            isFiltered: isFiltered, // This is for drag-handle visibility
            showActions: space.showTaskActions, // Pass the new state
            isTrash: task.isDeleted, 
            addingSubtaskToIndex            
        });
        
        if (task.isDeleted) { trashHTML += liContent; }
        else if (task.completed) { archiveHTML += liContent; } 
        else { todoHTML += liContent; }
    });

    // 🟢 วาด HTML ลงใน Container ต่างๆ เพียงครั้งเดียว (ลดอาการชื่อหายและกระพริบ)
    if (taskListUI) taskListUI.innerHTML = todoHTML;
    if (archiveListUI) archiveListUI.innerHTML = archiveHTML;
    if (trashListUI) trashListUI.innerHTML = trashHTML;

    // 🟢 NEW: Apply syntax highlighting to all rendered tasks after insertion
    if (taskListUI) {
        taskListUI.querySelectorAll('.task-actual-text').forEach(el => {
            applySyntaxHighlighting(el);
        });
    }
    if (archiveListUI) {
        archiveListUI.querySelectorAll('.task-actual-text').forEach(el => {
            applySyntaxHighlighting(el);
        });
    }
    if (trashListUI) {
        trashListUI.querySelectorAll('.task-actual-text').forEach(el => {
            applySyntaxHighlighting(el);
        });
    }

    trashContainer.style.display = trashListUI.children.length > 0 ? 'block' : 'none';

    // 🟢 อัปเดตข้อมูลใน Habit Modal ทันที (ถ้ามันเปิดอยู่) เพื่อแก้บัค Tag ไม่อัปเดตล่าสุด
    const habitModal = document.getElementById('habit-modal');
    if (habitModal && habitModal.style.display !== 'none') {
        renderHabitList(space);
    }

    if (!isFiltered && taskListUI) {
        const isManual = (space.taskSortOrder || 'manual') === 'manual';
        if (taskListUI.sortable) taskListUI.sortable.destroy();
        taskListUI.sortable = Sortable.create(taskListUI, { 
            group: 'nested-tasks', // กำหนดกลุ่มเพื่อให้ลากข้ามไปหา sub-task ได้
            animation: 150,
            disabled: space.isArchived || !isManual,
            handle: '.drag-handle', // ล็อคให้ลากได้เฉพาะที่ไอคอน 6 จุด
            ghostClass: 'sortable-ghost', 
            onMove: function (evt) {
                const draggedIsProminent = evt.dragged.classList.contains('prominent');
                const relatedIsProminent = evt.related.classList.contains('prominent');
                
                // ไม่อนุญาตให้ลากสลับกันระหว่างกลุ่มที่เปิดธง (Prominent) กับกลุ่มปกติ
                // เพื่อให้งานที่ติดธงอยู่ด้านบนเสมอ และงานปกติห้ามแทรกขึ้นไปในโซนของธง
                // คืนค่า false เพื่อยกเลิกการสลับตำแหน่งหากประเภทไม่ตรงกัน
                return draggedIsProminent === relatedIsProminent;
            },
            onEnd: function (evt) { 
                // 1. หาตำแหน่งจริงใน Array จาก attribute ที่เราฝังไว้
                const oldIdxInArray = parseInt(evt.item.getAttribute('data-index'));
                const movedItem = space.tasks.splice(oldIdxInArray, 1)[0];

                // 2. หาตำแหน่งที่จะไปวาง โดยดูจากลำดับของ "เพื่อนบ้าน" ในหน้าจอ
                const nextEl = evt.item.nextElementSibling;
                if (nextEl) {
                    let nextIdxInArray = parseInt(nextEl.getAttribute('data-index'));
                    // ถ้าตำแหน่งเป้าหมายอยู่หลังตำแหน่งเดิม ต้องลด index ลง 1 เพราะเรา splice ตัวเองออกไปแล้ว
                    if (nextIdxInArray > oldIdxInArray) nextIdxInArray--;
                    space.tasks.splice(nextIdxInArray, 0, movedItem);
                } else {
                    // ถ้าไม่มีเพื่อนบ้านข้างล่าง (วางท้ายสุดของรายการที่ยังไม่เสร็จ)
                    // ให้ค้นหาตำแหน่งสุดท้ายของงานที่ยังไม่เสร็จใน Array รวม
                    let lastActiveIdx = -1;
                    for (let i = space.tasks.length - 1; i >= 0; i--) {
                        if (!space.tasks[i].completed) { lastActiveIdx = i; break; }
                    }
                    if (lastActiveIdx === -1) space.tasks.push(movedItem);
                    else space.tasks.splice(lastActiveIdx + 1, 0, movedItem);
                }

                saveData(); 
                triggerCloudSave(); // ☁️ ซิงค์ไปที่ Cloud หลังจัดลำดับงาน
                onRenderCallback(); 
            },
            // เมื่อลากจาก Sub-task กลับมาเป็นงานหลัก
            onAdd: function (evt) {
                const space = getCurrentSpace();
                const fromSubList = evt.from;
                const oldParentIdx = parseInt(fromSubList.getAttribute('data-parent-index'));
                const oldSubIdx = evt.oldIndex;
                const newMainIdx = evt.newIndex;

                // 1. ดึงข้อมูลออกจาก Sub-tasks เดิม
                if (space.tasks[oldParentIdx] && space.tasks[oldParentIdx].subtasks) {
                    const movedSubtask = space.tasks[oldParentIdx].subtasks.splice(oldSubIdx, 1)[0];
                    
                    // 2. แปลงโครงสร้างให้เป็น Main Task โดยรักษา Metadata ทั้งหมดไว้
                    const newMainTask = { ...movedSubtask };
                    if (!newMainTask.subtasks) newMainTask.subtasks = [];
                    if (!newMainTask.createdAt) newMainTask.createdAt = Date.now();

                    // 3. แทรกเข้าไปในรายการหลัก
                    space.tasks.splice(newMainIdx, 0, newMainTask);
                    
                    saveData();
                    triggerCloudSave(); // ☁️ ซิงค์ไปที่ Cloud
                    onRenderCallback();
                }
            }
        });
    }

    // --- New: Sub-task Drag & Drop ---
    document.querySelectorAll('.subtask-list').forEach(subListEl => {
        const pIdx = parseInt(subListEl.getAttribute('data-parent-index'));

        // Shared subtask event handling (checkbox and delete)
        attachSubtaskEventListeners(subListEl, space, onRenderCallback, {
            fetchGoogleAPI: fetchGoogleAPI,
            getGoogleAuthToken: getGoogleAuthToken,
            getCurrentGoogleListId: getCurrentGoogleListId,
            isGoogleSyncEnabled: isGoogleSyncEnabled
        }, () => {
            // This is the onUpdate callback for re-rendering from subtask changes
            saveData();
            onRenderCallback();
            triggerCloudSave(); // ☁️ ซิงค์ไปที่ Cloud หลังแก้ไข Subtask (Checkbox หรือ Delete)
        });

        if (subListEl.sortable) subListEl.sortable.destroy();
        
        subListEl.sortable = Sortable.create(subListEl, {
            group: 'nested-tasks', // ต้องชื่อเดียวกับรายการหลักด้านบน
            animation: 150,
            fallbackOnBody: true,
            swapThreshold: 0.65,
            draggable: ".subtask-item:not(.subtask-add-row)",
            ghostClass: 'sortable-ghost',
            onUpdate: function (evt) { // ใช้ onUpdate สำหรับการสลับที่ภายในตัวเอง
                const space = getCurrentSpace();
                if (!space.tasks[pIdx] || !space.tasks[pIdx].subtasks) return;

                const subtasks = space.tasks[pIdx].subtasks;
                const movedItem = subtasks.splice(evt.oldIndex, 1)[0];
                subtasks.splice(evt.newIndex, 0, movedItem);

                saveData();
                // Re-render เฉพาะส่วนอาจจะยากในโครงสร้างปัจจุบัน 
                // จึงขอใช้ onRenderCallback() เพื่อความแม่นยำของลำดับ index
                onRenderCallback();
            },
            // เมื่อลากจาก Main Task เข้ามาเป็น Sub-task
            onAdd: function (evt) {
                const space = getCurrentSpace();
                const oldMainIdx = parseInt(evt.item.getAttribute('data-index'));
                const newSubIdx = evt.newIndex;

                // 1. ดึงข้อมูลจาก Main Tasks ออก
                const movedTask = space.tasks.splice(oldMainIdx, 1)[0];

                // 2. เตรียมข้อมูลงานย่อย โดยรักษา Metadata ทั้งหมด (รวมถึง googleTaskId)
                const newSubtask = { ...movedTask };
                delete newSubtask.subtasks; // งานย่อยไม่ควรซ้อนงานย่อยอีกชั้นในตอนนี้

                // 3. ใส่เข้าไปในกลุ่ม Sub-tasks ของตัวเป้าหมาย
                if (!space.tasks[pIdx].subtasks) space.tasks[pIdx].subtasks = [];
                space.tasks[pIdx].subtasks.splice(newSubIdx, 0, newSubtask);

                saveData();
                onRenderCallback();
            }
        });
    });
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