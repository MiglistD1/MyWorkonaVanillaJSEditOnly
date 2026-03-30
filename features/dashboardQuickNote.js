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
                <button class="btn-icon" id="db-note-keep-toggle" title="Toggle Google Keep Mode" style="opacity: ${isKeepMode ? '1' : '0.5'}">💡</button>
                <button class="btn-icon" id="db-note-keep-edit" title="Change Keep Link" style="display: ${isKeepMode && state.keepUrl ? 'inline-flex' : 'none'};"><svg class="svg-icon-sm"><use href="#icon-edit"></use></svg></button>
                <button class="btn-icon" id="db-note-collapse" title="Collapse / Expand"><svg class="svg-icon-sm"><use href="#icon-chevron-${state.collapsed ? 'up' : 'down'}"></use></svg></button>
                <button class="btn-icon" id="db-note-close" style="font-size: 16px; opacity: 0.6; width: 24px; height: 24px;">✕</button>
            </div>
        </div>
        
        <div class="note-container" id="db-note-body" style="flex: 1; margin-top: 0; border: none; box-shadow: none; overflow: hidden; background: var(--bg-card); display: ${state.collapsed ? 'none' : 'flex'}">
            <div id="db-note-local-area" style="display: ${isKeepMode ? 'none' : 'flex'}; flex-direction: column; height: 100%;">
                <div class="note-toolbar" style="padding: 6px 10px; border-bottom: 1px dashed var(--border-color); background: rgba(0,0,0,0.02);">
                    <button class="btn-icon" id="db-note-undo" title="Undo"><svg class="svg-icon-sm"><use href="#icon-undo"></use></svg></button>
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
                    `<iframe src="${state.keepUrl}" style="width:100%; height:100%; border:none;"></iframe>` : 
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
