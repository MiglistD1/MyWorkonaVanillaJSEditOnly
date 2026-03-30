// features/habitSheet.js
import { saveData, getAppSettings, getCurrentSpace, setFilterTags, setFilterMode, getFilterTags } from '../core/storage.js';
import { renderTasks } from './todoManager.js';
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
            <div class="modal-content" style="position:absolute; width: 450px; max-height: 85vh; display:flex; flex-direction:column; background:var(--bg-card); pointer-events:auto; box-shadow: 0 10px 40px rgba(0,0,0,0.2); border: 1px solid var(--border-color); padding: 0; overflow:hidden;">
                <div id="habit-header" style="display:flex; justify-content:space-between; align-items:center; padding: 15px 20px; border-bottom:1px solid var(--border-color); background: var(--bg-spacebar); cursor: grab; user-select:none;">
                    <div>
                        <h3 style="margin:0; font-size:20px;">🔥 Habit Tracker</h3>
                        <div id="habit-stats-text" style="font-size:13px; color:#888; margin-top:4px;">Keep the streak alive!</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button class="btn-icon" id="toggle-habit-actions" title="Toggle Edit/Delete/Cycle" style="padding: 4px; border-radius: 6px; transition: all 0.3s ease;">
                            <svg class="svg-icon-sm"><use href="#icon-eye"></use></svg>
                        </button>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); cursor:pointer; background:var(--hover-bg); padding:4px 8px; border-radius:6px;">
                            <input type="checkbox" id="toggle-hide-completed-habits" ${getAppSettings().hideCompletedHabits ? 'checked' : ''} style="cursor:pointer;"> 
                            Hide Done
                        </label>
                        <button class="btn-icon" id="btn-close-habit" style="font-size:18px;">✕</button>
                    </div>
                </div>
                
                <div style="display:flex; gap:8px; padding: 20px 20px 10px 20px; align-items: center;">
                    <input type="text" id="new-habit-input" class="settings-input" placeholder="✨ New Habit..." style="flex:1;">
                    <div style="display: flex; align-items: center; gap: 4px; background: var(--hover-bg); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color);" title="Wait X days before reset">
                        <span style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform:uppercase;">Every</span>
                        <input type="number" id="new-habit-interval" value="1" min="1" style="width: 35px; border: none; background: transparent; text-align: center; font-weight: 700; font-size: 13px; outline: none; color: var(--primary-color);">
                        <span style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform:uppercase;">Days</span>
                    </div>
                    <button class="btn btn-primary" id="btn-add-habit">Add</button>
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
            saveData();
            renderHabitList(space); // 🟢 แก้ไข: ใช้ตัวแปร space จาก Closure เพื่อความแม่นยำ
            updateHabitToggleUI();
        });

        document.getElementById('toggle-hide-completed-habits').addEventListener('change', (e) => {
            getAppSettings().hideCompletedHabits = e.target.checked;
            saveData();
            renderHabitList(space);
        });

        document.getElementById('btn-add-habit').addEventListener('click', () => handleAddHabit(space));
        document.getElementById('new-habit-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') handleAddHabit(space); });

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
    content.style.left = `${state.x}px`;
    content.style.top = `${state.y}px`;

    updateHabitToggleUI();
    renderHabitList(space);
    modal.style.display = 'flex';
    document.getElementById('new-habit-input').focus();
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
    btn.innerHTML = `<svg class="svg-icon-sm"><use href="#icon-${isActive ? 'eye' : 'eye-off'}"></use></svg>`;
}

export function renderHabitList(space) {
    const container = document.getElementById('habit-list-container');
    const progressText = document.getElementById('habit-progress-percent');
    const progressBar = document.getElementById('habit-progress-bar');
    
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
    const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

        // ดึงวันที่กดติ๊กถูกล่าสุด (ถ้าไม่มี ให้ใช้วันที่เคยทำ หรือวันนี้)
        const lastDoneStr = habit.lastCompletedDate || habit.lastUpdate || todayStr;
        const lastDateObj = new Date(lastDoneStr);
        const diffDays = Math.round((todayObj - lastDateObj) / (1000 * 60 * 60 * 24));
        
        const d = lastDateObj.getDate();
        const m = monthsEn[lastDateObj.getMonth()];
        const y = lastDateObj.getFullYear().toString().slice(-2);
        const formattedDate = `${d}/${m}/${y}`;

        const el = document.createElement('div');
        el.setAttribute('data-index', index);
        el.className = 'habit-item'; // เพิ่ม class สำหรับ CSS selector
        el.style.display = 'flex'; 
        el.style.alignItems = 'center';
        el.style.marginBottom = '10px';
        el.style.background = habit.completed ? '#f0fdf4' : '#fff';
        el.style.border = habit.completed ? '1px solid #bbf7d0' : '1px solid #eee';
        el.style.padding = '10px 12px';
        el.style.borderRadius = '8px';
        el.style.transition = 'all 0.2s';

        el.innerHTML = `
            <label class="google-task-checkbox" style="margin-right:4px;">
                <input type="checkbox" ${habit.completed ? 'checked' : ''} class="habit-checkbox">
                <div class="checkmark-circle">
                    <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                </div>
            </label>
            
            <div style="flex:1; min-width:0;">
                <div class="habit-text-content" contenteditable="true" style="font-size:15px; font-weight:500; color:${habit.completed ? '#15803d' : '#333'}; cursor:text; outline:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-radius:4px; padding:0 2px;" title="Click to edit name">
                    ${habit.text}
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
                </div>
            </div>

            <div style="display: ${showActions ? 'flex' : 'none'}; gap: 4px; align-items: center;">
                <button class="btn-icon delete-habit" style="color:#ef4444; padding: 2px;" title="Delete Habit">${svgTrashRed}</button>
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
            const newName = nameTextEl.innerText.trim();
            if (newName && newName !== habit.text) {
                habit.text = newName;
                saveData();
                
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
                if (habit.streak > 0) habit.streak--;
            }
            
            habit.lastUpdate = new Date().toDateString();

            setTimeout(() => {
                saveData();
                renderHabitList(space);
                renderTasks(space);
            }, isChecked ? 800 : 0); // เพิ่มเป็น 800ms ให้เท่ากับระบบ Task
        });

        // --- 🔘 Event: Filter by Tag ---
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
                saveData();
                renderHabitList(space);
                renderTasks(space);
            }
        });

        container.appendChild(el);
    });

    container.sortable = Sortable.create(container, {
        animation: 150,
        ghostClass: "sortable-ghost",
        onEnd: function (evt) {
            const movedItem = space.habits.splice(evt.oldIndex, 1)[0];
            space.habits.splice(evt.newIndex, 0, movedItem);
            saveData();
            renderHabitList(space);
            renderTasks(space);
        }
    });
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
            saveData();
            
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
        saveData();
        renderHabitList(space);
        renderTasks(space);
    }
}

/**
 * 🎵 ฟังก์ชันสร้างเสียง Ta-da! (Simple Beep)
 */
function playSuccessSound() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playNote = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.1, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
    };
    // เล่น 2 ตัวโน้ตต่อเนื่อง (C5 -> G5)
    playNote(523.25, ctx.currentTime, 0.15);
    playNote(783.99, ctx.currentTime + 0.12, 0.4);
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