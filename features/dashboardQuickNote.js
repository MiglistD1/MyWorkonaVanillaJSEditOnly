import { getAppSettings, saveData, getCurrentSpaceId } from '../core/storage.js';

/**
 * 📝 Global Dashboard Quick Note Logic
 */

export function initDashboardQuickNote() {
    // โหลดหน้าต่างขึ้นมาทันทีถ้าถูกเปิดค้างไว้
    renderDashboardQuickNote();
}

export function toggleDashboardQuickNote() {
    const settings = getAppSettings();
    if (!settings.dashboardQuickNote) {
       settings.dashboardQuickNote = { isOpen: false, isPinned: false, mode: 'local', collapsed: false, content: "", keepUrl: "", x: 100, y: 100, w: 350, h: 400 };
    }
    settings.dashboardQuickNote.isOpen = !settings.dashboardQuickNote.isOpen;
    saveData();
    renderDashboardQuickNote();
    
    // อัปเดตสถานะสีปุ่มในหน้า Dashboard
    if (window.renderDefaultDashboard) window.renderDefaultDashboard();
}

export function renderDashboardQuickNote() {
    const settings = getAppSettings();
    const state = settings.dashboardQuickNote;
    if (!state) return;

    const spaceId = getCurrentSpaceId();
    const shouldShow = state.isOpen && (state.isPinned || spaceId === 0);

    let el = document.getElementById('dashboard-floating-note');
    
    if (!shouldShow) {
        if (el) el.remove(); // ลบ Element ออกเพื่อความสะอาด
        return;
    }

    if (!el) {
        el = document.createElement('div');
        el.id = 'dashboard-floating-note';
        el.className = 'floating-note';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        document.body.appendChild(el);
    }

    el.style.left = `${state.x}px`;
    el.style.top = `${state.y}px`;
    el.style.width = `${state.w}px`;
    el.style.height = state.collapsed ? 'auto' : `${state.h}px`;

    const isKeepMode = state.mode === 'keep';
    
    el.innerHTML = `
        <div id="db-note-header" class="section-label" style="display:flex; justify-content:space-between; align-items:center; padding: 10px 15px; background: var(--bg-spacebar); border-bottom: 1px solid var(--border-color); cursor: grab; user-select:none; margin: -10px -10px 0 -10px; border-radius: 8px 8px 0 0;">
            <div style="font-weight: 800; font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; display:flex; align-items:center; gap:6px;">
                <svg class="svg-icon-sm" style="width:14px; height:14px;"><use href="#icon-pencil"></use></svg>
                Quick Note
            </div>
            <div class="note-controls" style="display:flex; gap: 4px; align-items: center;">
                <button class="btn-icon" id="db-note-pin" title="Pin note to stay visible in all spaces" style="color: ${state.isPinned ? 'var(--primary-color)' : 'inherit'}; opacity: ${state.isPinned ? '1' : '0.5'}"><svg class="svg-icon-sm"><use href="#icon-pin"></use></svg></button>
                <div class="keep-btn-group" style="display: flex; gap: 2px; background: rgba(245, 158, 11, 0.15); padding: 2px; border-radius: 6px; border: 1px solid rgba(245, 158, 11, 0.2);">
                    <button class="btn-icon" id="db-note-keep-toggle" title="Toggle Google Keep Mode" style="opacity: ${isKeepMode ? '1' : '0.5'}"><svg class="svg-icon-sm"><use href="#icon-keep"></use></svg></button>
                    <button class="btn-icon" id="db-note-keep-external" title="Open in New Tab" style="display: ${isKeepMode && state.keepUrl ? 'inline-flex' : 'none'}; color: #d97706;"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="11" x2="21" y2="3"></line></svg></button>
                    <button class="btn-icon" id="db-note-keep-edit" title="Change Keep Link" style="display: ${isKeepMode && state.keepUrl ? 'inline-flex' : 'none'}; opacity: 0.7;"><svg class="svg-icon-sm"><use href="#icon-edit"></use></svg></button>
                </div>
                <button class="btn-icon" id="db-note-collapse" title="Collapse / Expand"><svg class="svg-icon-sm"><use href="#icon-chevron-${state.collapsed ? 'up' : 'down'}"></use></svg></button>
                <button class="btn-icon" id="db-note-close" style="font-size: 16px; opacity: 0.6; width: 24px; height: 24px;">✕</button>
            </div>
        </div>
        
        <div class="note-container" id="db-note-body" style="flex: 1; margin-top: 0; border: none; box-shadow: none; overflow: hidden; background: var(--bg-card); display: ${state.collapsed ? 'none' : 'flex'}">
            <div id="db-note-local-area" style="display: ${isKeepMode ? 'none' : 'flex'}; flex-direction: column; height: 100%;">
                <div class="note-toolbar" style="padding: 6px 10px; border-bottom: 1px dashed var(--border-color); background: rgba(0,0,0,0.02);">
                    <button class="btn-icon" id="db-note-undo" title="Undo"><svg class="svg-icon-sm"><use href="#icon-undo"></use></svg></button>
                    <span style="color:var(--border-color); margin: 0 5px; opacity: 0.5;">|</span>
                    <button class="btn-icon" id="db-note-checkbox" title="Insert Checkbox"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg></button>
                    <button class="btn-icon" id="db-note-reset-format" title="Reset Format"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path><line x1="17" y1="12" x2="17" y2="18"></line><line x1="13" y1="12" x2="13" y2="18"></line><line x1="9" y1="12" x2="9" y2="18"></line><line x1="5" y1="12" x2="5" y2="18"></line></svg></button>
                    <span style="color:var(--border-color); margin: 0 5px; opacity: 0.5;">|</span>
                    <button class="btn-icon" id="db-note-bold" title="Bold"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg></button>
                    <button class="btn-icon" id="db-note-italic" title="Italic"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg></button>
                    <button class="btn-icon" id="db-note-underline" title="Underline"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 6 6h0a6 6 0 0 0 6-6V4"></path><line x1="4" y1="20" x2="20" y2="20"></line></svg></button>
                    <button class="btn-icon" id="db-note-strikethrough" title="Strikethrough"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"></path><path d="M2 12h20"></path><path d="M6 14h12"></path></svg></button>
                    <span style="color:var(--border-color); margin: 0 5px; opacity: 0.5;">|</span>
                    <button class="btn-icon" id="db-note-bullet-list" title="Bulleted List"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
                    <button class="btn-icon" id="db-note-numbered-list" title="Numbered List"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1.1.9-2 2-2s2 .9 2 2c0 1.1-.9 2-2 2z"></path></svg></button>
                    <span style="color:var(--border-color); margin: 0 5px; opacity: 0.5;">|</span>
                    <select id="db-note-font-size" style="padding: 2px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-main); font-size: 11px; outline: none; cursor: pointer;" data-cmd="fontSize">
                        <option value="3">Normal Text</option>
                        <option value="4">Large Text</option>
                        <option value="5">Heading</option>
                    </select>
                    <span style="color:var(--border-color); margin: 0 5px; opacity: 0.5;">|</span>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        ${(settings.quickColors || ["#ff4d4f", "#4a86e8", "#52c41a"]).map((color, i) => `
                            <input type="color" class="custom-color-slot db-note-color-slot" data-index="${i}" value="${color}" style="width:18px; height:18px;">
                        `).join('')}
                    </div>
                </div>
                <div id="db-note-editor" class="note-area" contenteditable="true" placeholder="Start typing here..." style="flex: 1; padding: 15px; font-size: 14px; line-height: 1.6; overflow-y: auto; outline: none;">${state.content || ''}</div>
            </div>
            
            <div id="db-note-keep-area" style="display: ${isKeepMode ? 'block' : 'none'}; height: 100%;">
                ${state.keepUrl ? 
                    `<iframe id="db-keep-iframe" src="about:blank" style="width:100%; height:100%; border:none;"></iframe>` : 
                    `<div style="padding: 40px 20px; text-align:center; display: flex; flex-direction: column; gap: 15px; height: 100%; justify-content: center; background: var(--bg-body);">
                        <div style="font-size: 32px; opacity: 0.8;">💡</div>
                        <p style="font-size:12px; color:var(--text-muted); margin: 0; line-height: 1.5;">Connect this Dashboard Quick Note to a Google Keep Note URL:</p>
                        <input type="text" id="db-note-keep-input" class="settings-input" placeholder="https://keep.google.com/..." style="font-size: 12px; text-align: center;">
                        <button class="btn btn-primary" id="db-note-keep-save" style="width:100%; justify-content: center; padding: 8px;">Connect Keep</button>
                    </div>`
                }
            </div>
        </div>
    `;

    // 🟢 ระบบป้องกันการโหลดซ้ำ (Persistence Fix)
    if (isKeepMode && state.keepUrl) {
        const iframe = el.querySelector('#db-keep-iframe');
        // ถ้า iframe มีอยู่แล้ว และ URL ยังเป็นอันเดิม ไม่ต้องโหลดใหม่
        if (iframe && iframe.dataset.loadedUrl !== state.keepUrl) {
            iframe.src = state.keepUrl;
            iframe.dataset.loadedUrl = state.keepUrl;
        }
    }

    // 🟢 เรียกใช้ระบบลากหลังจากใส่ innerHTML เรียบร้อยแล้ว เพื่อให้หา Header เจอ
    setupNoteDrag(el);

    // Event Listeners สำหรับหน้าต่างโน้ต
    el.querySelector('#db-note-close').onclick = () => toggleDashboardQuickNote();

    el.querySelector('#db-note-pin').onclick = () => {
        state.isPinned = !state.isPinned;
        saveData();
        renderDashboardQuickNote();
    };

    el.querySelector('#db-note-collapse').onclick = () => {
        state.collapsed = !state.collapsed;
        saveData();
        renderDashboardQuickNote();
    };

    el.querySelector('#db-note-keep-toggle').onclick = () => {
        state.mode = state.mode === 'keep' ? 'local' : 'keep';
        saveData();
        renderDashboardQuickNote();
    };

    const keepExternal = el.querySelector('#db-note-keep-external');
    if (keepExternal) {
        keepExternal.onclick = () => {
            if (state.keepUrl) window.open(state.keepUrl, '_blank');
        };
    }

    const keepEdit = el.querySelector('#db-note-keep-edit');
    if (keepEdit) {
        keepEdit.onclick = () => {
            const newUrl = prompt("Enter new Google Keep URL for Dashboard:", state.keepUrl || "");
            if (newUrl !== null && newUrl.trim() !== "") {
                state.keepUrl = newUrl.trim();
                saveData();
                renderDashboardQuickNote();
            }
        };
    }

    const undoBtn = el.querySelector('#db-note-undo');
    if (undoBtn) {
        undoBtn.onclick = (e) => {
            e.preventDefault();
            document.execCommand('undo', false, null);
        };
    }

    const fontSizeSelect = el.querySelector('#db-note-font-size');
    if (fontSizeSelect) {
        fontSizeSelect.onchange = (e) => {
            document.execCommand('fontSize', false, e.target.value);
        };
    }

    el.querySelectorAll('.db-note-color-slot').forEach(picker => {
        picker.oninput = (e) => {
            document.execCommand('foreColor', false, e.target.value);
            const idx = parseInt(e.target.dataset.index);
            settings.quickColors[idx] = e.target.value;
            saveData();
        };
    });

    // New Formatting Buttons
    el.querySelector('#db-note-checkbox').onclick = (e) => {
        e.preventDefault();
        document.execCommand('insertHTML', false, '<label class="google-task-checkbox" style="display:inline-flex; align-items:center; margin-right:8px;"><input type="checkbox"> <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div></label>');
    };
    el.querySelector('#db-note-reset-format').onclick = (e) => {
        e.preventDefault();
        document.execCommand('removeFormat', false, null);
    };
    el.querySelector('#db-note-bold').onclick = (e) => { e.preventDefault(); document.execCommand('bold', false, null); };
    el.querySelector('#db-note-italic').onclick = (e) => { e.preventDefault(); document.execCommand('italic', false, null); };
    el.querySelector('#db-note-underline').onclick = (e) => { e.preventDefault(); document.execCommand('underline', false, null); };
    el.querySelector('#db-note-strikethrough').onclick = (e) => { e.preventDefault(); document.execCommand('strikeThrough', false, null); };
    el.querySelector('#db-note-bullet-list').onclick = (e) => { e.preventDefault(); document.execCommand('insertUnorderedList', false, null); };
    el.querySelector('#db-note-numbered-list').onclick = (e) => { e.preventDefault(); document.execCommand('insertOrderedList', false, null); };

    // The existing font size and color pickers already use execCommand and are functional.
    // The editor.oninput already saves the innerHTML, so changes will persist.


    const editor = el.querySelector('#db-note-editor');
    if (editor) {
        editor.oninput = () => {
            state.content = editor.innerHTML;
            saveData();
        };
    }

    const keepInput = el.querySelector('#db-note-keep-input');
    const keepSave = el.querySelector('#db-note-keep-save');
    if (keepSave && keepInput) {
        keepSave.onclick = () => {
            const url = keepInput.value.trim();
            if (url) {
                state.keepUrl = url;
                saveData();
                renderDashboardQuickNote();
            }
        };
    }
}

function setupNoteDrag(el) {
    const header = el.querySelector('#db-note-header');
    if (!header) return; // ป้องกัน Error กรณีหา Header ไม่เจอ

    let isDragging = false;
    let offset = { x: 0, y: 0 };

    header.onmousedown = (e) => {
        if (e.target.closest('button')) return;
        isDragging = true;
        el.classList.add('is-interacting'); // เปิด Shield ทันทีที่เริ่มลาก
        const rect = el.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;
        document.body.style.userSelect = 'none';
        el.style.transition = 'none';
    };

    const handleMove = (e) => {
        if (!isDragging) return;
        el.style.left = `${e.clientX - offset.x}px`;
        el.style.top = `${e.clientY - offset.y}px`;
    };

    const handleUp = () => {
        if (isDragging || el.classList.contains('is-interacting')) {
            isDragging = false;
            el.classList.remove('is-interacting'); // ปิด Shield
            document.body.style.userSelect = '';
            el.style.transition = 'all 0.2s ease';
            const settings = getAppSettings();
            const rect = el.getBoundingClientRect();
            settings.dashboardQuickNote.x = rect.left;
            settings.dashboardQuickNote.y = rect.top;
            settings.dashboardQuickNote.w = rect.width;
            settings.dashboardQuickNote.h = rect.height;
            saveData();
        }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
}
