// features/habitSheet.js
import { saveData, getAppSettings, getCurrentSpace, setFilterTags, setFilterMode, getFilterTags } from '../core/storage.js';
import { renderTasks, isAnyEditableElementFocused } from './todoManager.js';
import { generateMiniTagsBtn, handleTagAutocomplete, applySyntaxHighlighting } from '../core/ui-helpers.js';
import Sortable from '../sortable.esm.js';
import { svgTrashRed } from '../core/icons.js';
import { renderAll } from '../core/contentManager.js';

// --- 1. เติม export เพื่อให้หน้าจอหลัก (todoManager) เรียกใช้ได้ ---
export function checkAndResetHabits(space) {
    if (!space || !space.habits) return;
    
    const todayStr = new Date().toDateString(); 
    let hasChanged = false;

    space.habits.forEach(habit => {
        if (!habit.lastUpdate) {
            habit.lastUpdate = todayStr;
            hasChanged = true;
        }

        if (habit.lastUpdate !== todayStr) {
            const lastDate = new Date(habit.lastUpdate);
            const currentDate = new Date(todayStr);
            const diffDays = Math.round((currentDate - lastDate) / (1000 * 60 * 60 * 24));
            const interval = habit.resetInterval || 1;

            if (diffDays >= interval) {
                habit.completed = false;
                habit.lastUpdate = todayStr; // อัปเดตเวลาเช็คของระบบ
                hasChanged = true;
            }
        }
    });

    if (hasChanged) saveData();
}
// --------------------------------------------------

export function toggleHabitModal(space) {
    const settings = getAppSettings();
    settings.habitState.open = !settings.habitState.open;
    saveData();
    if (settings.habitState.open) openHabitModal(space);
    else {
        const modal = document.getElementById('habit-modal');
        if (modal) modal.style.display = 'none';
    }
}

export function openHabitModal(space) {
    let modal = document.getElementById('habit-modal');
    if (!modal) {
        const modalHTML = ` 
        <div id="habit-modal" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:1100; pointer-events:none;">
            <div class="modal-content" style="position:absolute; display:flex; flex-direction:column; background:var(--bg-card); pointer-events:auto; box-shadow: 0 10px 40px rgba(0,0,0,0.2); border: 1px solid var(--border-color); padding: 0; overflow:hidden;">
                <div id="habit-header" style="display:flex; justify-content:space-between; align-items:flex-start; padding: 12px 20px; border-bottom:1px solid var(--border-color); background: var(--bg-spacebar); cursor: grab; user-select:none;">
                    <div style="flex: 1;">
                        <h3 style="margin:0; font-size:16px; font-weight: 800;">Habit Tracker</h3>
                        <div id="habit-stats-text" style="font-size:12px; color:#888; margin-top:2px;">Keep the streak alive!</div>
                        
                        <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                            <button class="btn-icon" id="toggle-habit-actions" title="Toggle Edit/Delete/Cycle" style="padding: 2px; border-radius: 4px; transition: all 0.3s ease;">
                                <svg class="svg-icon-sm" style="width:14px; height:14px;"><use href="#icon-eye"></use></svg>
                            </button>
                            <label class="task-item" style="display:flex; align-items:center; gap:4px; font-size:10px; color:var(--text-muted); cursor:pointer; background:var(--hover-bg); padding:2px 6px; border-radius:4px; margin:0;">
                                <input type="checkbox" id="toggle-hide-completed-habits" ${getAppSettings().hideCompletedHabits ? 'checked' : ''} style="cursor:pointer; width:12px; height:12px;"> 
                                Hide Done
                            </label>
                        </div>
                    </div>
                    <button class="btn-icon" id="btn-close-habit" style="font-size:18px; padding: 4px;">✕</button>
                </div>
                
                <div style="display:flex; gap:8px; padding: 20px 20px 10px 20px; align-items: center;">
                    <input type="text" id="new-habit-input" class="settings-input" placeholder="✨ New Habit..." style="flex:1;">
                    <!-- 🟢 Optimized Cycle Selector (Smaller) -->
                    <div style="display: flex; align-items: center; gap: 2px; background: var(--hover-bg); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-color); height: 30px;" title="Wait X days before reset">
                        <span style="font-size: 9px; font-weight: 800; color: var(--text-muted); text-transform:uppercase;">Ev.</span>
                        <input type="number" id="new-habit-interval" value="1" min="1" style="width: 28px; border: none; background: transparent; text-align: center; font-weight: 700; font-size: 12px; outline: none; color: var(--primary-color);">
                        <span style="font-size: 9px; font-weight: 800; color: var(--text-muted); text-transform:uppercase;">d</span>
                    </div>
                    <!-- 🟢 Single Direct Save Group Button (Shared Globally) -->
                    <button class="btn btn-outline habit-action-btn" id="btn-save-habit-group" title="Save current list as a Global Group" style="padding: 5px; width: 30px; height: 30px; justify-content: center; display: none; color: #f59e0b; border-color: #f59e0b;">
                        <svg class="svg-icon-sm"><use href="#icon-package"></use></svg>
                    </button>
                    <button class="btn btn-primary" id="btn-add-habit">Add</button>
                </div>

                <!-- 🟢 Habit Template Bar -->
                <div id="habit-template-bar" style="padding: 0 20px 10px 20px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--border-color); margin-bottom: 10px;">
                    <span style="font-size: 10px; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Templates:</span>
                    <div id="habit-templates-list" style="display: flex; gap: 5px; flex-wrap: wrap; flex: 1;"></div>
                    <button class="btn btn-outline" id="btn-manage-habit-templates" style="font-size: 10px; padding: 2px 6px; height: 22px;" title="Manage Templates"><svg class="svg-icon-sm" style="width:12px;height:12px;"><use href="#icon-settings"></use></svg></button>
                </div>

                <div id="habit-list-container" style="flex:1; overflow-y:auto; padding: 0 20px 10px 20px;"></div>
                
                <div style="padding: 10px 20px 20px 20px; border-top:1px solid var(--border-color); text-align:center;">
                   <div style="background:#f0fdf4; border:1px solid #bbf7d0; color:#15803d; border-radius:8px; padding:8px; font-size:13px; font-weight:600;">
                       Today's Progress: <span id="habit-progress-percent">0%</span>
                       <div style="height:6px; background:#bbf7d0; border-radius:3px; margin-top:6px; overflow:hidden;">
                           <div id="habit-progress-bar" style="height:100%; width:0%; background:#16a34a; transition:width 0.3s;"></div>
                       </div>
                   </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById('habit-modal');
        
        document.getElementById('btn-close-habit').addEventListener('click', () => { 
            getAppSettings().habitState.open = false;
            saveData();
            modal.style.display = 'none'; 
        });
        document.getElementById('toggle-habit-actions').addEventListener('click', () => {
            const settings = getAppSettings();
            settings.showHabitActions = !settings.showHabitActions;
            saveData(true);
            renderHabitList(getCurrentSpace()); 
            updateHabitToggleUI();
        });

        document.getElementById('toggle-hide-completed-habits').addEventListener('change', (e) => {
            getAppSettings().hideCompletedHabits = e.target.checked;
            saveData(true);
            renderHabitList(getCurrentSpace());
        });

        document.getElementById('btn-add-habit').addEventListener('click', () => handleAddHabit(getCurrentSpace()));
        
        // 🟢 Save Group Listener
        document.getElementById('btn-save-habit-group').onclick = () => {
            showSaveHabitGroupModal(getCurrentSpace()); // 🟢 เรียก Modal ใหม่แทน prompt
        };

        document.getElementById('btn-manage-habit-templates').onclick = () => {
            showHabitTemplateManager();
        };

        const newHabitInput = document.getElementById('new-habit-input');
        if (newHabitInput) {
            newHabitInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleAddHabit(getCurrentSpace()); });
            // 🟢 NEW: Add input event for autocomplete and highlighting
            newHabitInput.addEventListener('input', (e) => { 
                const currentS = getCurrentSpace();
                handleTagAutocomplete(e, () => currentS?.tags || []); 
                applySyntaxHighlighting(newHabitInput); 
            });
        }

        // --- 🖐️ Drag Logic for Habit Window ---
        const header = document.getElementById('habit-header');
        const content = modal.querySelector('.modal-content');
        let isDragging = false;
        let offset = { x: 0, y: 0 };

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            isDragging = true;
            const rect = content.getBoundingClientRect();
            offset.x = e.clientX - rect.left;
            offset.y = e.clientY - rect.top;
            content.style.transition = 'none';
            header.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            content.style.left = `${e.clientX - offset.x}px`;
            content.style.top = `${e.clientY - offset.y}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = 'grab';
                content.style.transition = 'all 0.2s ease';
                const rect = content.getBoundingClientRect();
                const state = getAppSettings().habitState;
                state.x = rect.left;
                state.y = rect.top;
                saveData();
            }
        });
    }

    const state = getAppSettings().habitState;
    const content = modal.querySelector('.modal-content');
    
    // บนมือถือ: ล้างค่าพิกัด Inline สไตล์ทิ้ง เพื่อให้ CSS (@media) จัดการให้อยู่กึ่งกลางเอง
    if (window.innerWidth <= 768) {
        content.style.left = '';
        content.style.top = '';
        content.style.transform = '';
    } else {
        content.style.left = `${state.x}px`;
        content.style.top = `${state.y}px`;
    }

    updateHabitToggleUI();
    renderHabitList(space);
    renderHabitTemplates(); // 🟢 วาดรายการ Template (Global)
    modal.style.display = 'flex';
    document.getElementById('new-habit-input').focus();
}

function showSaveHabitGroupModal(space) {
    const habits = space.habits || [];

    // 🟢 สร้างรายการชั่วคราวสำหรับ Modal (เริ่มจาก Habit ที่มีอยู่)
    let tempGroupItems = habits.map(h => ({ 
        text: h.text, 
        tags: [...(h.tags || [])], 
        resetInterval: h.resetInterval || 1,
        selected: true 
    }));

    const modalId = 'save-habit-group-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    const modalHTML = `
    <div class="modal-overlay" id="${modalId}" style="display:flex; z-index:13000;">
        <div class="modal-content" style="width:380px;">
            <h3 style="margin-top:0; display:flex; align-items:center; gap:8px;">
                <svg class="svg-icon-sm" style="color:#f59e0b;"><use href="#icon-package"></use></svg>
                Save Group Template
            </h3>
            <div class="settings-group">
                <label>Group Name:</label>
                <input type="text" id="habit-group-name-input" class="settings-input" placeholder="e.g. Morning Set">
            </div>
            <div style="margin-top:15px;">
                <label style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; display:block;">Included Items:</label>
                
                <!-- 🟢 Quick Add inside Modal -->
                <div style="display:flex; gap:5px; margin-bottom:10px;">
                    <input type="text" id="modal-new-habit-input" class="settings-input" placeholder="Add more habit to group..." style="font-size:12px; height:30px;">
                    <button id="btn-modal-add-habit" class="btn btn-outline" style="padding:0 10px; height:30px;">+</button>
                </div>

                <div id="modal-included-items-list" style="max-height:200px; overflow-y:auto; background:var(--bg-body); border-radius:8px; padding:5px; border:1px solid var(--border-color); display:flex; flex-direction:column; gap:2px;">
                </div>
            </div>
            <div class="modal-actions" style="margin-top:20px; display:flex; justify-content:flex-end; gap:8px;">
                <button class="btn btn-outline" id="btn-cancel-group-save">Cancel</button>
                <button class="btn btn-primary" id="btn-confirm-group-save">Save Group</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const listContainer = document.getElementById('modal-included-items-list');
    const modalAddInput = document.getElementById('modal-new-habit-input');
    const modalAddBtn = document.getElementById('btn-modal-add-habit');

    const renderModalList = () => {
        listContainer.innerHTML = tempGroupItems.map((item, idx) => `
            <label class="tag-select-row task-item" style="padding:6px 10px; border-radius:6px; ${item.selected ? '' : 'opacity:0.5;'}">
                <label class="google-task-checkbox">
                    <input type="checkbox" class="modal-item-check" data-index="${idx}" ${item.selected ? 'checked' : ''}>
                    <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></div>
                </label>
                <span style="font-size:13px; margin-left:8px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.text}</span>
                <button class="btn-icon btn-modal-remove-item" data-index="${idx}" style="color:#ef4444; padding:2px;">✕</button>
            </label>
        `).join('') || '<div style="text-align:center; padding:20px; font-size:12px; color:var(--text-muted);">No items added</div>';
    };

    renderModalList();

    // 🟢 List Interaction (Checkbox & Remove)
    listContainer.onclick = (e) => {
        const check = e.target.closest('.modal-item-check');
        const remove = e.target.closest('.btn-modal-remove-item');
        if (check) {
            tempGroupItems[parseInt(check.dataset.index)].selected = check.checked;
            renderModalList();
        } else if (remove) {
            tempGroupItems.splice(parseInt(remove.dataset.index), 1);
            renderModalList();
        }
    };

    // 🟢 Quick Add inside Modal Logic
    const addItem = () => {
        const val = modalAddInput.value.trim();
        if (val) {
            tempGroupItems.push({ text: val, tags: [], resetInterval: 1, selected: true });
            modalAddInput.value = '';
            renderModalList();
        }
    };
    modalAddBtn.onclick = addItem;
    modalAddInput.onkeydown = (e) => { if(e.key === 'Enter') addItem(); };

    const nameInput = document.getElementById('habit-group-name-input');
    nameInput.focus();

    document.getElementById('btn-cancel-group-save').onclick = () => document.getElementById(modalId).remove();
    document.getElementById('btn-confirm-group-save').onclick = () => {
        const groupName = nameInput.value.trim();
        const selectedItems = tempGroupItems.filter(i => i.selected);
        
        if (!groupName) return alert("Please enter a group name");
        if (selectedItems.length === 0) return alert("Please select at least one habit");

        const settings = getAppSettings();
        if (!settings.habitTemplates) settings.habitTemplates = [];
        settings.habitTemplates.push({ 
            text: groupName, 
            isGroup: true, 
            items: selectedItems.map(i => ({ text: i.text, tags: i.tags, resetInterval: i.resetInterval })) 
        });
        
        saveData(); 
        renderHabitTemplates(); 
        document.getElementById(modalId).remove();
    };
}

/**
 * � วาดรายการ Template ของ Habit ให้เลือกกด
 */
function renderHabitTemplates() {
    const container = document.getElementById('habit-templates-list');
    if (!container) return;
    const settings = getAppSettings();
    if (!settings.habitTemplates) settings.habitTemplates = [];

    container.innerHTML = settings.habitTemplates.map((temp, idx) => `
        <button class="tag-pill habit-template-pill" data-index="${idx}" 
            title="${temp.isGroup ? `Add group: ${temp.items.length} items` : 'Click to add this habit'}" 
            style="font-size: 10px; padding: 2px 8px; height: auto; line-height: 1.2; display: inline-flex; align-items: center; gap: 4px; ${temp.isGroup ? 'border-color: #f59e0b; color: #d97706; background: rgba(245, 158, 11, 0.05);' : ''}">
            ${temp.isGroup ? `<svg class="svg-icon-sm" style="width:10px;height:10px;"><use href="#icon-package"></use></svg>` : ''}${temp.text}
        </button>
    `).join('');

    container.querySelectorAll('.habit-template-pill').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.index);
            const template = settings.habitTemplates[idx];
            if (template) {
                const space = getCurrentSpace();
                if (!space.habits) space.habits = [];
                
                if (template.isGroup) {
                    // 📦 เพิ่มทุกรายการในกลุ่ม
                    template.items.forEach(item => {
                        space.habits.push({
                            ...item,
                            completed: false,
                            streak: 0,
                            lastUpdate: new Date().toDateString()
                        });
                    });
                }
                saveData();
                renderHabitList(space);
                renderTasks(space);
            }
        };
    });
}

/**
 * ⚙️ หน้าต่างจัดการ Template (ลบทิ้ง)
 */
function showHabitTemplateManager() {
    const existing = document.getElementById('habit-template-manager-modal');
    if (existing) existing.remove();
    const settings = getAppSettings();

    const modalHTML = `
    <div class="modal-overlay" id="habit-template-manager-modal" style="display:flex; z-index:12000;">
        <div class="modal-content" style="width:300px;">
            <h3 style="margin-top:0; font-size: 16px;">📦 Global Habit Templates</h3>
            <div id="habit-template-manager-list" style="max-height:300px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
                ${(settings.habitTemplates || []).map((t, i) => `
                    <div class="loot-item" style="padding:8px 12px; margin:0; border-radius: 8px;">
                        <span style="font-size:13px; font-weight:600; flex:1; display:flex; align-items:center; gap:6px;">
                            ${t.isGroup ? `<svg class="svg-icon-sm" style="width:12px;height:12px;color:#f59e0b;"><use href="#icon-package"></use></svg>` : ''}
                            ${t.text}
                        </span>
                        <button class="btn-icon delete-habit-template" data-index="${i}" style="color:#ef4444;">${svgTrashRed}</button>
                    </div>
                `).join('') || '<div style="text-align:center; opacity:0.5; font-size:12px; padding:20px;">No templates saved</div>'}
            </div>
            <div class="modal-actions" style="margin-top:20px; text-align:right;">
                <button class="btn btn-outline" id="btn-close-habit-temp-manager">Close</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('btn-close-habit-temp-manager').onclick = () => document.getElementById('habit-template-manager-modal').remove();
    document.getElementById('habit-template-manager-list').onclick = (e) => {
        const delBtn = e.target.closest('.delete-habit-template');
        if (delBtn) {
            const idx = parseInt(delBtn.dataset.index);
            settings.habitTemplates.splice(idx, 1);
            saveData();
            document.getElementById('habit-template-manager-modal').remove();
            showHabitTemplateManager();
            renderHabitTemplates();
        }
    };
}

/**
 * อัปเดตสไตล์ของปุ่ม Toggle Actions ให้ดูแตกต่างชัดเจน
 */
function updateHabitToggleUI() {
    const btn = document.getElementById('toggle-habit-actions');
    if (!btn) return;
    const isActive = getAppSettings().showHabitActions;
    btn.style.color = isActive ? 'var(--primary-color)' : 'var(--text-muted)';
    btn.style.background = isActive ? 'rgba(47, 128, 237, 0.15)' : 'transparent';
    btn.style.border = isActive ? '1px solid var(--primary-color)' : '1px solid transparent';
    btn.style.opacity = isActive ? '1' : '0.6';
    btn.innerHTML = `<svg class="svg-icon-sm" style="width:14px; height:14px;"><use href="#icon-${isActive ? 'eye' : 'eye-off'}"></use></svg>`;

    // 🟢 ซ่อน/แสดงปุ่ม Template & Group ในแถบรับข้อมูล
    document.querySelectorAll('.habit-action-btn').forEach(el => {
        el.style.display = isActive ? 'inline-flex' : 'none';
    });
}

export function renderHabitList(space) {
    // 🟢 ป้องกันการวาดทับเฉพาะตอนกำลังพิมพ์ชื่อ Habit เท่านั้น (เพื่อให้การติ๊ก Checkbox ยังอัปเดตได้)
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.id === 'new-habit-input' || activeEl.classList.contains('habit-text-content'))) {
        return;
    }
    const container = document.getElementById('habit-list-container');
    const progressText = document.getElementById('habit-progress-percent');
    const progressBar = document.getElementById('habit-progress-bar');
    
    // 🟢 Update Dashboard Toggle Button if present
    const dashHabitBtn = document.querySelector('.btn-habit-toggle');
    if (dashHabitBtn) {
        const hList = space.habits || [];
        const hTotal = hList.length;
        const hDone = hList.filter(h => h.completed).length;
        const isMobile = window.innerWidth <= 768;
        const iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>`;
        const countHtml = (hTotal > 0 && !isMobile) ? `<span style="font-size: 9px; font-weight: 700; margin-left: 4px; vertical-align: middle;">${hDone}/${hTotal}</span>` : '';
        
        let statusStyle = '';
        if (hTotal === 0) statusStyle = 'color: var(--text-muted); border: 1px solid var(--border-color); background: rgba(0,0,0,0.05);';
        else if (hDone === 0) statusStyle = 'color: #ef4444; border: 1px solid #ef4444; background: rgba(239, 68, 68, 0.1);';
        else if (hDone < hTotal) statusStyle = 'color: #d97706; border: 1px solid #f59e0b; background: rgba(245, 158, 11, 0.1);';
        else statusStyle = 'color: #10b981; border: 1px solid #10b981; background: rgba(16, 185, 129, 0.1);';
        
        dashHabitBtn.style.cssText = `margin-right: 10px; width: auto; padding: 3px 6px; transition: all 0.3s ease; ${statusStyle}`;
        dashHabitBtn.innerHTML = iconSvg + countHtml;
    }

    checkAndResetHabits(space);

    if (container.sortable) {
        try { container.sortable.destroy(); } catch (e) {}
        container.sortable = null;
    }
    container.innerHTML = '';
    if (!space.habits) space.habits = [];

    const total = space.habits.length;
    const completed = space.habits.filter(h => h.completed).length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    
    progressText.innerText = `${percent}%`;
    progressBar.style.width = `${percent}%`;

    if (total === 0) {
        container.innerHTML = `<div style="padding:30px; text-align:center; color:#ccc; font-style:italic;">No habits yet<br>Start building good habits today!</div>`;
        return;
    }

    const todayStr = new Date().toDateString();
    const todayObj = new Date(todayStr);
    const monthsTh = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    const hideCompleted = getAppSettings().hideCompletedHabits;
    const showActions = getAppSettings().showHabitActions;

    // 🟢 เตรียมค่า Filter ปัจจุบันเพื่อเปรียบเทียบ
    const currentFilters = getFilterTags().map(t => t.toUpperCase());

    space.habits.forEach((habit, index) => {
        if (hideCompleted && habit.completed) return; // กรองออกถ้าโหมดซ่อนเปิดอยู่

        if (typeof habit.streak === 'undefined') habit.streak = 0;
        if (typeof habit.resetInterval === 'undefined') habit.resetInterval = 1;

        // 🟢 ตรวจสอบว่า Habit นี้ถูก Filter อยู่หรือไม่
        const hTags = (habit.tags || []).map(t => t.toUpperCase());
        const isFilterActive = hTags.length > 0 && hTags.length === currentFilters.length && hTags.every(t => currentFilters.includes(t));

        // 🟢 ตรวจสอบการเชื่อมโยง Template
        const linkedTemplate = (space.todoTemplates && typeof habit.linkedTemplateIdx === 'number') 
            ? space.todoTemplates[habit.linkedTemplateIdx] 
            : null;
        const hasTemplate = !!linkedTemplate;

        // ดึงวันที่กดติ๊กถูกล่าสุด (ถ้าไม่มี ให้ใช้วันที่เคยทำ หรือวันนี้)
        const lastDoneStr = habit.lastCompletedDate || habit.lastUpdate || todayStr;
        const lastDateObj = new Date(lastDoneStr);
        const diffDays = Math.round((todayObj - lastDateObj) / (1000 * 60 * 60 * 24));
        
        // 🔴 คำนวณวันที่จะต้องทำรอบถัดไป สำหรับ Habit ที่มี Cycle > 1
        let nextDueHtml = '';
        if (habit.resetInterval > 1) {
            const nextDate = new Date(lastDateObj);
            nextDate.setDate(lastDateObj.getDate() + habit.resetInterval);
            nextDueHtml = `<span style="font-size: 10px; color: #ef4444; font-weight: 700; margin-left: 4px;" title="Next Schedule">Next: ${String(nextDate.getDate()).padStart(2, '0')} ${monthsTh[nextDate.getMonth()]} ${nextDate.getFullYear() + 543}</span>`;
        }

        const d = lastDateObj.getDate();
        const m = monthsTh[lastDateObj.getMonth()];
        const y = lastDateObj.getFullYear() + 543;
        const formattedDate = `${String(d).padStart(2, '0')} ${m} ${y}`;

        const el = document.createElement('div');
        el.setAttribute('data-index', index);
        el.className = 'habit-item task-item'; // 🟢 เพิ่ม task-item เพื่อให้ checkbox เปลี่ยนสี
        el.style.display = 'flex'; 
        el.style.alignItems = 'center';
        el.style.marginBottom = '10px';
        el.style.background = habit.completed ? (habit.isFailed ? '#fef2e2' : '#f0fdf4') : '#fff';
        el.style.border = habit.completed ? (habit.isFailed ? '1px solid #fecaca' : '1px solid #bbf7d0') : '1px solid #eee';
        el.style.padding = '10px 12px';
        el.style.borderRadius = '8px';
        el.style.transition = 'all 0.2s';

        el.innerHTML = `
            <div class="item-main-row" style="display:flex; align-items:center; width:100%;">
                <label class="google-task-checkbox" style="margin-right:8px;">
                <input type="checkbox" ${habit.completed ? 'checked' : ''} class="habit-checkbox">
                <div class="checkmark-circle">
                    <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                </div>
            </label>
            
            <div style="flex:1; min-width:0;" title="${habit.text}">
                <div style="display:flex; align-items:center; gap:6px;">
                    <div class="habit-text-content" contenteditable="true" style="font-size:15px; font-weight:500; color:${habit.completed ? (habit.isFailed ? '#b91c1c' : '#15803d') : '#333'}; cursor:text; outline:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-radius:4px; padding:0 2px; flex:1;" title="${habit.text}">
                        ${habit.text}
                    </div>
                    ${hasTemplate ? `
                        <button class="btn-icon btn-generate-from-temp" style="width: 22px; height: 22px; border-radius: 6px; color:#10b981;" title="Generate tasks from: ${linkedTemplate.name}">
                            <svg class="svg-icon-sm" style="width:14px; height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                    ` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:10px; margin-top:2px;">
                    ${generateMiniTagsBtn(habit.tags, 'habit', index)}
                    ${(habit.tags && habit.tags.length > 0) ? `
                        <button class="btn-icon filter-habit-tag-btn ${isFilterActive ? 'active' : ''}" data-index="${index}" title="Filter items by these tags" style="padding:2px; color:var(--primary-color);">
                            <svg class="svg-icon-sm"><use href="#icon-eye"></use></svg>
                        </button>
                    ` : ''}

                    ${showActions ? `
                        <div class="habit-cycle-badge" data-index="${index}" style="font-size:10px; color:var(--text-muted); background:var(--bg-body); padding:1px 6px; border-radius:4px; border:1px solid var(--border-color); display:flex; align-items:center; gap:2px;" title="Click to change cycle">
                            Cycle: <span style="font-weight:700; color:var(--primary-color);">${habit.resetInterval}</span>d
                        </div>
                    ` : ''}
                    ${nextDueHtml}
                </div>
            </div>

            <div style="display: flex; gap: 4px; align-items: center;">
                <button class="btn-icon btn-link-todo-temp" style="display: ${(showActions || hasTemplate) ? 'inline-flex' : 'none'}; color: ${hasTemplate ? 'var(--primary-color)' : 'inherit'}; padding: 2px;" title="Link To-Do Template">
                    <svg class="svg-icon-sm"><use href="#icon-layers"></use></svg>
                </button>
                <button class="btn-icon delete-habit" style="display: ${showActions ? 'inline-flex' : 'none'}; color:#ef4444; padding: 2px;" title="Delete Habit">${svgTrashRed}</button>
                <button class="btn-icon fail-habit" style="display: ${showActions ? 'flex' : 'none'}; width: 22px; height: 22px; background: #fee2e2; color: #ef4444; border-radius: 50%; align-items: center; justify-content: center; border: 1px solid #fecaca; transition: all 0.2s; margin-left: 2px;" title="Mark as Failed (No Rewards)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            </div>
        `;

        // --- Event: Open Stylish Popup for Cycle ---
        const cycleBadge = el.querySelector('.habit-cycle-badge');
        if (cycleBadge) {
            cycleBadge.addEventListener('click', (e) => {
                showCycleEditPopup(e.currentTarget, habit, space);
            });
        }

        const nameTextEl = el.querySelector('.habit-text-content');

        // ฟังก์ชันสำหรับเลือกข้อความทั้งหมดเมื่อเข้าโหมดแก้ไข
        const triggerFocus = () => {
            nameTextEl.focus();
            const range = document.createRange();
            range.selectNodeContents(nameTextEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        };

        // --- 🖐️ Long Press Logic (แก้ไขชื่อได้ทันทีแม้ซ่อนปุ่ม Action) ---
        let longPressTimer;
        const startPress = (e) => {
            if (e.type === 'mousedown' && e.button !== 0) return;
            longPressTimer = setTimeout(triggerFocus, 600);
        };
        const cancelPress = () => clearTimeout(longPressTimer);

        nameTextEl.addEventListener('mousedown', startPress);
        nameTextEl.addEventListener('touchstart', startPress, { passive: true });
        nameTextEl.addEventListener('mouseup', cancelPress);
        nameTextEl.addEventListener('mouseleave', cancelPress);
        nameTextEl.addEventListener('touchend', cancelPress);
        nameTextEl.addEventListener('touchcancel', cancelPress);

        // --- 🟢 Event: Autocomplete for Habits ---
        nameTextEl.addEventListener('input', (e) => {
            handleTagAutocomplete(e, () => space?.tags || []);
            applySyntaxHighlighting(nameTextEl); // 🟢 เพิ่มการไฮไลท์ใน Habit Tracker
        });

        // --- ⌨️ Inline Edit Events ---
        nameTextEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameTextEl.blur(); // การ blur จะไปเรียก Event 'blur' ด้านล่างเพื่อเซฟ
            } else if (e.key === 'Escape') {
                e.preventDefault();
                nameTextEl.innerText = habit.text; // คืนค่าเดิม
                nameTextEl.blur();
            }
        });

        nameTextEl.addEventListener('blur', () => {
            const newName = nameTextEl.textContent.trim();
            if (newName && newName !== habit.text) {
                habit.text = newName;
                saveData(true);
                
                // ✨ เอฟเฟกต์กระพริบสีเหลืองยืนยันการบันทึก
                nameTextEl.classList.add('flash-confirm');
                setTimeout(() => nameTextEl.classList.remove('flash-confirm'), 800);
                
                renderTasks(space); // อัปเดต Progress Badge ที่ To-do list หลัก
            } else {
                nameTextEl.innerText = habit.text; // คืนค่าเดิมถ้าเว้นว่าง
            }
        });

        // ป้องกันการวางรูปแบบข้อความ (เช่น สี, ตัวหนา) เมื่อ Copy มาวาง
        nameTextEl.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        });

        el.querySelector('.habit-checkbox').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            
            // 🟢 แสดงสถานะ Syncing บนปุ่ม
            const checkboxWrapper = e.target.closest('.google-task-checkbox');
            if (checkboxWrapper) checkboxWrapper.classList.add('is-syncing');

            if (isChecked) el.classList.add('completed-hold'); // แสดงผลขีดฆ่าทันที

            // 🌟 Quest Loot Scanner
            if (window.processRewardScanner) {
                window.processRewardScanner(habit.text, false, { x: e.clientX, y: e.clientY }, 'habit', space.id);
            }

            habit.completed = isChecked;
            
            if (isChecked) {
                habit.streak++;
                // --- จำวันที่กดติ๊กถูกของจริง เอาไว้คำนวณวันห่าง ---
                habit.lastCompletedDate = new Date().toDateString(); 

                // 🥳 ตรวจสอบว่าทำครบทุกอันหรือยัง (เช็คเฉพาะอันที่ยังไม่ถูกลบ)
                const allHabits = space.habits || [];
                const isAllDone = allHabits.length > 0 && allHabits.every(h => h.completed);
                if (isAllDone) {
                    playSuccessSound();
                    // ดึงตำแหน่งของ Checkbox ที่คลิก
                    const rect = e.target.getBoundingClientRect();
                    triggerConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
                }
            } else {
                    delete habit.isFailed; // เคลียร์สถานะล้มเหลวถ้าเอาติ๊กออก
                if (habit.streak > 0) habit.streak--;
            }
            
            habit.lastUpdate = new Date().toDateString();
            saveData(true); // บันทึกทันทีไม่ต้องรอ

            setTimeout(() => {
                // ตรวจสอบโฟกัสอีกครั้งก่อนวาดใหม่
                const active = document.activeElement;
                if (active && (active.id === 'new-habit-input' || active.classList.contains('habit-text-content'))) return;
                
                renderHabitList(space);
                renderTasks(space);
            }, isChecked ? 800 : 0); // เพิ่มเป็น 800ms ให้เท่ากับระบบ Task
        });

        // --- 🟢 Event: Link To-Do Template ---
        const linkBtn = el.querySelector('.btn-link-todo-temp');
        if (linkBtn) {
            linkBtn.onclick = (e) => {
                e.stopPropagation();
                showHabitTemplatePicker(linkBtn, habit, space);
            };
        }

        // --- 🟢 Event: Generate Tasks from Template ---
        const genBtn = el.querySelector('.btn-generate-from-temp');
        if (genBtn) {
            genBtn.onclick = (e) => {
                e.stopPropagation();
                generateTasksFromHabitTemplate(habit, space);
            };
        }

        // --- � Event: Filter by Tag ---
        const filterBtn = el.querySelector('.filter-habit-tag-btn');
        if (filterBtn) {
            filterBtn.onclick = (e) => {
                e.stopPropagation();
                // 🟢 Toggle Logic: ถ้าเปิดอยู่ให้ปิด ถ้าปิดอยู่ให้เปิด
                if (isFilterActive) {
                    setFilterTags([]);
                } else if (hTags.length > 0) {
                    setFilterTags(hTags);
                    setFilterMode('OR');
                }
                renderAll();
            };
        }

        const delBtn = el.querySelector('.delete-habit');
        if (delBtn) delBtn.addEventListener('click', () => { // 🟢 ปรับปรุง: เพิ่ม Guard ป้องกัน Error ถ้าปุ่มถูกซ่อน
            if(confirm('Delete this habit?')) {
                space.habits.splice(index, 1);
                saveData(true);
                renderHabitList(space);
                renderTasks(space);
            }
        });

            const failBtn = el.querySelector('.fail-habit');
            if (failBtn) failBtn.addEventListener('click', () => {
                habit.completed = true;
                habit.isFailed = true;
                habit.lastCompletedDate = new Date().toDateString();
                habit.lastUpdate = new Date().toDateString();
                saveData(true);
                renderHabitList(space);
                renderTasks(space);
            });

        container.appendChild(el);
        
        // 🟢 NEW: Apply syntax highlighting to the text right after it's rendered
        if (nameTextEl) {
            applySyntaxHighlighting(nameTextEl);
        }
    });

    container.sortable = Sortable.create(container, {
        animation: 150,
        ghostClass: "sortable-ghost",
        onEnd: function (evt) {
            const movedItem = space.habits.splice(evt.oldIndex, 1)[0];
            space.habits.splice(evt.newIndex, 0, movedItem);
            saveData(true);
            renderHabitList(space);
            renderTasks(space);
        }
    });
}

/**
 * 📋 Popup เลือก To-Do Template สำหรับ Habit
 */
function showHabitTemplatePicker(anchorEl, habit, space) {
    const existing = document.getElementById('habit-todo-link-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'habit-todo-link-popup';
    popup.className = 'sf-sub-popup'; // ใช้สไตล์ที่มีอยู่
    popup.style.width = '220px';
    popup.style.padding = '12px';
    
    const templates = space.todoTemplates || [];
    
    popup.innerHTML = `
        <div style="font-weight:800; font-size:10px; margin-bottom:10px; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.5px;">Link To-Do Template</div>
        <div style="display:flex; flex-direction:column; gap:4px; max-height:200px; overflow-y:auto; margin-bottom:10px;">
            ${templates.map((t, i) => `
                <div class="habit-link-item-row" data-index="${i}" style="display:flex; align-items:center; padding:6px 8px; border-radius:6px; cursor:pointer; font-size:13px; transition:0.2s; ${habit.linkedTemplateIdx === i ? 'background:rgba(47,128,237,0.1); color:var(--primary-color); font-weight:700;' : ''}">
                    <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.name}</span>
                    ${habit.linkedTemplateIdx === i ? '✅' : ''}
                </div>
            `).join('') || '<div style="font-size:11px; opacity:0.5; padding:15px; text-align:center;">No To-Do templates found in this space.</div>'}
        </div>
        ${habit.linkedTemplateIdx !== undefined ? `
            <button id="btn-unlink-todo-temp" class="btn btn-outline" style="width:100%; border:none; color:#ef4444; font-size:11px; justify-content:center; padding:8px; background:rgba(239,68,68,0.05);">Unlink Template</button>
        ` : ''}
    `;

    document.body.appendChild(popup);

    const rect = anchorEl.getBoundingClientRect();
    popup.style.top = `${rect.bottom + window.scrollY + 5}px`;
    popup.style.left = `${Math.max(10, rect.left + window.scrollX - 180)}px`;

    popup.querySelectorAll('.habit-link-item-row').forEach(row => {
        row.onclick = () => {
            habit.linkedTemplateIdx = parseInt(row.dataset.index);
            saveData(true); renderHabitList(space); popup.remove();
        };
        row.onmouseenter = () => row.style.background = 'var(--hover-bg)';
        row.onmouseleave = () => row.style.background = habit.linkedTemplateIdx === parseInt(row.dataset.index) ? 'rgba(47,128,237,0.1)' : 'transparent';
    });

    const unlinkBtn = document.getElementById('btn-unlink-todo-temp');
    if (unlinkBtn) {
        unlinkBtn.onclick = () => {
            delete habit.linkedTemplateIdx;
            saveData(true); renderHabitList(space); popup.remove();
        };
    }

    setTimeout(() => {
        const close = (ev) => { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('mousedown', close); } };
        document.addEventListener('mousedown', close);
    }, 0);
}

/**
 * 🚀 สร้างรายการงานจาก Template ที่ผูกไว้
 */
function generateTasksFromHabitTemplate(habit, space) {
    const template = space.todoTemplates ? space.todoTemplates[habit.linkedTemplateIdx] : null;
    if (!template) return;

    if (!space.tasks) space.tasks = [];
    
    // ทำ Deep Copy รายการงานจาก Template เข้าสู่รายการงานจริง
    template.tasks.forEach(t => {
        space.tasks.push({
            ...t,
            subtasks: (t.subtasks || []).map(s => ({ ...s, id: Date.now() + Math.random() })),
            createdAt: Date.now(),
            isFromTemplate: true,
            googleTaskId: null
        });
    });

    saveData(true);
    renderTasks(space); // อัปเดต UI รายการงานหลัก
    
    // 🎊 Enhanced Feedback Animation
    const btn = document.querySelector(`.habit-item[data-index="${space.habits.indexOf(habit)}"] .btn-generate-from-temp`);
    if (btn) {
        btn.animate([
            { transform: 'scale(1)', backgroundColor: 'rgba(16,185,129,0.1)' },
            { transform: 'scale(1.4) rotate(90deg)', backgroundColor: '#10b981', color: 'white' },
            { transform: 'scale(1)', backgroundColor: 'rgba(16,185,129,0.1)' }
        ], {
            duration: 500,
            easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        });
    }
}

/**
 * 🎨 Stylish Popup สำหรับแก้ไข Cycle
 */
function showCycleEditPopup(anchorEl, habit, space) {
    // ลบ Popup เก่าที่อาจจะค้างอยู่
    const existing = document.getElementById('habit-cycle-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'habit-cycle-popup';
    popup.style.cssText = `
        position: fixed; z-index: 10000; background: var(--bg-card);
        border: 1px solid var(--border-color); border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2); padding: 15px;
        width: 180px; display: flex; flex-direction: column; gap: 10px;
        top: 50%; left: 50%; transform: translate(-50%, -50%);
        animation: fadeIn 0.2s ease;
    `;

    popup.innerHTML = `
        <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-align: center;">RESET EVERY (DAYS)</div>
        <input type="number" id="popup-cycle-input" value="${habit.resetInterval}" min="1" 
            style="width: 100%; padding: 8px; border: 1px solid var(--primary-color); border-radius: 6px; 
            text-align: center; font-size: 18px; font-weight: 700; outline: none; background: var(--input-bg); color: var(--text-main);">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button class="btn btn-outline" id="btn-popup-cancel" style="font-size: 11px; justify-content: center;">Cancel</button>
            <button class="btn btn-primary" id="btn-popup-save" style="font-size: 11px; justify-content: center;">Update</button>
        </div>
    `;

    document.body.appendChild(popup);
    const input = document.getElementById('popup-cycle-input');
    input.focus();
    input.select();

    const closePopup = () => popup.remove();

    const handleSave = () => {
        const newVal = parseInt(input.value) || 1;
        if (newVal !== habit.resetInterval) {
            habit.resetInterval = newVal;
            saveData(true);
            
            // 🟢 FIX: ไม่ต้อง re-render ถ้ามี Element ที่กำลังแก้ไขอยู่
            if (!isAnyEditableElementFocused()) {
                renderHabitList(space);
            }
            // 🟡 เพิ่มเอฟเฟกต์กระพริบสีเหลืองที่ Badge เดิม
            anchorEl.querySelector('span').innerText = newVal;
            anchorEl.classList.add('flash-confirm');
            setTimeout(() => anchorEl.classList.remove('flash-confirm'), 800);
            
            // อัปเดตระบบเบื้องหลัง
            checkAndResetHabits(space);
            renderTasks(space);
        }
        closePopup();
    };

    document.getElementById('btn-popup-cancel').onclick = closePopup;
    document.getElementById('btn-popup-save').onclick = handleSave;
    input.onkeydown = (e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') closePopup(); };

    // คลิกข้างนอกเพื่อปิด
    setTimeout(() => {
        window.onclick = (e) => { if (!popup.contains(e.target)) closePopup(); };
    }, 0);
}

function handleAddHabit(space) {
    const input = document.getElementById('new-habit-input');
    const intervalInput = document.getElementById('new-habit-interval');
    const text = input.value.trim();
    const interval = parseInt(intervalInput.value) || 1;

    if (text) {
        if (!space.habits) space.habits = [];
        space.habits.push({ 
            text: text, 
            tags: [], // 🟢 เพิ่มพื้นที่เก็บป้ายกำกับ
            completed: false, 
            streak: 0,
            resetInterval: interval,
            lastUpdate: new Date().toDateString() 
        });
        input.value = '';
        saveData(true);
        renderHabitList(space);
        renderTasks(space);
    }
}

/**
 * 🎵 ฟังก์ชันสร้างเสียงฉลองพรีเมียมแบบ Arpeggio (C Major 7)
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
        playNote(523.25, now, 2.0, 0.08);        // C5
        playNote(659.25, now + 0.1, 2.0, 0.06);  // E5
        playNote(783.99, now + 0.2, 2.0, 0.04);  // G5
        playNote(987.77, now + 0.3, 2.5, 0.03);  // B5
        playNote(1046.50, now + 0.4, 3.0, 0.02); // C6
    } catch (e) {}
}

/**
 * 🎊 ฟังก์ชันสร้างเอฟเฟกต์พลุฉลอง (Lightweight Confetti)
 */
function triggerConfetti(originX, originY) {
    const colors = ['#2f80ed', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899'];
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
        const confetti = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = Math.random() * 7 + 4;
        
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
            border-radius: 50%;
        `;
        document.body.appendChild(confetti);

        const destinationX = (Math.random() - 0.5) * 400;
        const destinationY = (Math.random() - 0.5) * 400 - 100; // พุ่งขึ้นแล้วตกลง

        const animation = confetti.animate([
            { transform: `translate3d(0, 0, 0) scale(1)`, opacity: 1 },
            { transform: `translate3d(${destinationX}px, ${destinationY}px, 0) scale(0) rotate(${Math.random() * 1000}deg)`, opacity: 0 }
        ], {
            duration: 1000 + Math.random() * 1000,
            easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)'
        });

        animation.onfinish = () => confetti.remove();
    }
}