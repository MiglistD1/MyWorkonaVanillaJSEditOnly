// features/scheduleMode.js
import { getCurrentSpace, saveData, getAppSettings } from '../core/storage.js';
import { renderSidebar } from '../components/sidebar.js';
import { svgTrashRed } from '../core/icons.js';

export function initScheduleMode() {
    // 0. CSS
    const style = document.createElement('style');
    style.innerHTML = `        
        .schedule-interval-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; background: var(--hover-bg); padding: 8px; border-radius: 6px; }
        .time-input { padding: 4px; border: 1px solid var(--border-color); border-radius: 4px; font-family: inherit; }
    `;
    document.head.appendChild(style);

    // Shared Minimal Icon (Calendar) - Adjusted size to fit
    const svgScheduleIcon = `<svg class="svg-icon" style="width:16px; height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
    const svgClock = `<svg class="svg-icon" style="width:20px; height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

    // 1. Bar HTML (Simplified)
    const scheduleHtml = `
        <div id="schedule-mode-bar" style="
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 30px; background: var(--bg-card); border-bottom: 1px solid var(--border-color);
            position: relative; z-index: 1005;
        ">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span id="schedule-status-text" style="font-weight: 700; font-size: 14px; color: var(--text-main); display:flex; align-items:center; gap:6px;">${svgScheduleIcon} Schedule: OFF</span>
                    
                    <button id="schedule-toggle-btn" style="
                        width: 44px; height: 24px; border-radius: 12px; border: none; cursor: pointer;
                        position: relative; transition: background 0.3s; background: #cecece; padding: 2px; flex-shrink: 0;
                    ">
                        <div id="schedule-toggle-circle" style="
                            width: 20px; height: 20px; border-radius: 50%; background: #fff;
                            transition: transform 0.3s; box-shadow: 0 1px 2px rgba(0,0,0,0.2);
                        "></div>
                    </button>
                    
                    <button id="btn-schedule-settings" class="btn-icon" style="margin-left: 10px; color: var(--text-muted);" title="Schedule Settings">${svgClock}</button>
                </div>
            </div>

            <div id="schedule-countdown-area" style="display: none; font-size: 14px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 6px 12px; border-radius: 4px;">
                ⏳ <span id="schedule-timer-text">00:00:00</span>
            </div>
        </div>
    `;

    // 2. Lock Overlay
    const overlayHtml = `
        <div id="schedule-lock-overlay" style="
            display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(8px); z-index: 998;
            flex-direction: column; justify-content: center; align-items: center; text-align: center;
        ">
            <div style="background: white; padding: 50px; border-radius: 12px; border: 1px solid #e1e1e1; box-shadow: 0 10px 30px rgba(0,0,0,0.08);">
                <div style="font-size: 50px; margin-bottom: 20px;">🔒</div>
                <h2 style="color: #37352f; margin: 0 0 10px 0; font-size: 24px; font-weight: 700;">This Space is currently locked</h2>
                <div id="schedule-lock-timer" style="font-size: 24px; font-weight: 600; color: #555; margin-top:10px;">
                    00:00:00
                </div>
            </div>
        </div>
    `;

    // 3. Settings Modal HTML
    const modalHtml = `
        <div class="modal-overlay" id="schedule-modal">
            <div class="modal-content" style="width: 450px;">
                <h3 style="margin-top:0; display:flex; align-items:center; gap:8px;">${svgClock} Work Schedule Settings</h3>
                <p style="font-size:13px; color:var(--text-muted); margin-bottom:15px;">Select days and times to allow access to this space</p>
                
                <div style="margin-bottom: 20px;">
                    <label style="display:block; font-size:13px; font-weight:600; margin-bottom:8px;">Work Days:</label>
                    <div style="display: flex; gap: 10px; flex-wrap:wrap;" id="day-checkboxes">
                        <label class="google-task-checkbox">
                            <input type="checkbox" value="1">
                            <div class="checkmark-circle">
                                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <span style="margin-left: 8px;">Mon</span>
                        </label>
                        <label class="google-task-checkbox">
                            <input type="checkbox" value="2">
                            <div class="checkmark-circle">
                                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <span style="margin-left: 8px;">Tue</span>
                        </label>
                        <label class="google-task-checkbox">
                            <input type="checkbox" value="3">
                            <div class="checkmark-circle">
                                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <span style="margin-left: 8px;">Wed</span>
                        </label>
                        <label class="google-task-checkbox">
                            <input type="checkbox" value="4">
                            <div class="checkmark-circle">
                                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <span style="margin-left: 8px;">Thu</span>
                        </label>
                        <label class="google-task-checkbox">
                            <input type="checkbox" value="5">
                            <div class="checkmark-circle">
                                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <span style="margin-left: 8px;">Fri</span>
                        </label>
                        <label class="google-task-checkbox">
                            <input type="checkbox" value="6">
                            <div class="checkmark-circle">
                                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <span style="margin-left: 8px;">Sat</span>
                        </label>
                        <label class="google-task-checkbox">
                            <input type="checkbox" value="0">
                            <div class="checkmark-circle">
                                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <span style="margin-left: 8px;">Sun</span>
                        </label>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display:block; font-size:13px; font-weight:600; margin-bottom:8px;">Time Intervals:</label>
                    <div id="interval-container"></div>
                    <button class="btn btn-outline" id="btn-add-interval" style="width:100%; justify-content:center; margin-top:8px;">+ Add Interval</button>
                </div>

                <div class="modal-actions" style="text-align:right;">
                    <button class="btn btn-outline" id="btn-close-schedule">Cancel</button>
                    <button class="btn btn-primary" id="btn-save-schedule">Save Settings</button>
                </div>
            </div>
        </div>
    `;

    const topbar = document.querySelector('.topbar');
    const workspace = document.querySelector('.workspace');
    topbar.insertAdjacentHTML('afterend', scheduleHtml);
    workspace.insertAdjacentHTML('beforeend', overlayHtml);
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Elements
    const toggleBtn = document.getElementById('schedule-toggle-btn');
    const toggleCircle = document.getElementById('schedule-toggle-circle');
    const statusText = document.getElementById('schedule-status-text');
    const countdownArea = document.getElementById('schedule-countdown-area');
    const timerText = document.getElementById('schedule-timer-text');
    const lockOverlay = document.getElementById('schedule-lock-overlay');
    const lockTimer = document.getElementById('schedule-lock-timer');
    const modal = document.getElementById('schedule-modal');

    // UI State Observers
    const titleObserver = new MutationObserver(() => {
        const newSpaceName = document.getElementById('current-space-title').innerText;
        if (newSpaceName && newSpaceName !== "Loading...") renderScheduleUI();
    });
    titleObserver.observe(document.getElementById('current-space-title'), { childList: true, characterData: true, subtree: true });

    setTimeout(() => { if (document.getElementById('current-space-title').innerText !== "Loading...") renderScheduleUI(); }, 500);

    // --- Functions ---
    
    function renderScheduleUI() {
        const space = getCurrentSpace();
        const sBar = document.getElementById('schedule-mode-bar');
        if (!sBar) return;
        
        if (!space) {
            sBar.style.display = 'none';
            return;
        }

        if (space.showSchedule === false) { sBar.style.display = 'none'; return; }
        else sBar.style.display = 'flex';

        if (!space.schedule) space.schedule = { active: false, days: [], intervals: [{start:"09:00", end:"17:00"}] };
        // Migrate old data
        if (!space.schedule.intervals && space.schedule.start) {
            space.schedule.intervals = [{ start: space.schedule.start, end: space.schedule.end }];
        }
        
        const state = space.schedule;
        const focusBar = document.getElementById('focus-mode-bar');

        if (!state.active) {
            toggleBtn.style.background = '#cecece';
            toggleCircle.style.transform = 'translateX(0)';
            statusText.innerHTML = `${svgScheduleIcon} Schedule: OFF`;
            countdownArea.style.display = 'none';
            lockOverlay.style.display = 'none';
        } else {
            toggleBtn.style.background = '#0284c7';
            toggleCircle.style.transform = 'translateX(20px)';
            statusText.innerHTML = `${svgScheduleIcon} Schedule: ON`;

            const calc = calculateTime(state);
            if (calc.isLocked) {
                lockOverlay.style.display = 'flex';
                lockTimer.innerText = calc.text;
                countdownArea.style.display = 'none';
            } else {
                lockOverlay.style.display = 'none';
                countdownArea.style.display = 'block';
                timerText.innerText = calc.text;
            }
        }
    }

    function calculateTime(state) {
        const now = new Date();
        const curDay = now.getDay();
        const curMin = now.getHours() * 60 + now.getMinutes();
        const curSec = now.getSeconds();
        
        // Helper: Format HH:mm:ss consistently
        const fmt = (totalMin, sec) => {
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            const s = sec;
            return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        };

        if (state.days.includes(curDay)) {
            // Check if active in any interval
            for (let iv of state.intervals) {
                const [sh, sm] = iv.start.split(':').map(Number);
                const [eh, em] = iv.end.split(':').map(Number);
                const sMin = sh * 60 + sm;
                const eMin = eh * 60 + em;
                
                if (curMin >= sMin && curMin < eMin) {
                    // Active: Countdown to END
                    let diffMin = eMin - curMin;
                    let diffSec = 0;
                    
                    if (curSec > 0) {
                        diffMin--;
                        diffSec = 60 - curSec;
                    }

                    return { isLocked: false, text: fmt(diffMin, diffSec) };
                }
            }
        }
        
        // Locked: Find next unlock
        // ค้นหาเวลาเริ่มงานครั้งถัดไปใน 7 วันข้างหน้า
        for(let d = 0; d < 8; d++) {
            const checkDay = (curDay + d) % 7;
            if (state.days.includes(checkDay)) {
                let starts = state.intervals.map(iv => {
                    const [h, mm] = iv.start.split(':').map(Number);
                    return h * 60 + mm;
                }).sort((a,b) => a - b);

                for (let startMin of starts) {
                    // ถ้าเป็นวันนี้ เวลาต้องยังไม่ผ่านไป
                    if (d === 0 && startMin <= curMin) continue;

                    let diffMin = (d * 24 * 60) + startMin - curMin;
                    let diffSec = 0;

                    if (curSec > 0) {
                        diffMin--;
                        diffSec = 60 - curSec;
                    }

                    return { isLocked: true, text: fmt(diffMin, diffSec) };
                }
            }
        }

        return { isLocked: true, text: `00:00:00` };
    }

    function openSettings() {
        const space = getCurrentSpace();
        if(!space.schedule) space.schedule = { active: false, days: [], intervals: [] };
        // Checkboxes
        document.querySelectorAll('#day-checkboxes input').forEach(cb => {
            cb.checked = space.schedule.days.includes(Number(cb.value));
        });
        // Intervals
        const container = document.getElementById('interval-container');
        container.innerHTML = '';
        if(!space.schedule.intervals || space.schedule.intervals.length === 0) {
            space.schedule.intervals = [{start:"09:00", end:"17:00"}];
        }
        space.schedule.intervals.forEach(iv => addIntervalRow(iv.start, iv.end));
        
        modal.style.display = 'flex';
    }

    function addIntervalRow(startVal, endVal) {
        const div = document.createElement('div');
        div.className = 'schedule-interval-row';
        div.innerHTML = `
            <input type="text" class="time-input start-time" value="${startVal || ''}" placeholder="09:00" maxlength="5" style="width:60px; text-align:center;">
            <span style="color:var(--text-muted);">-</span>
            <input type="text" class="time-input end-time" value="${endVal || ''}" placeholder="17:00" maxlength="5" style="width:60px; text-align:center;">
            <button class="btn-icon" style="color:red; margin-left:auto;">${svgTrashRed}</button>
        `;
        
        // Auto-format time input on blur (e.g., 930 -> 09:30)
        div.querySelectorAll('.time-input').forEach(input => {
            input.addEventListener('blur', () => {
                let v = input.value.replace(/[^0-9]/g, '');
                if (v.length === 3) v = '0' + v; // 930 -> 0930
                if (v.length === 4) input.value = v.substring(0, 2) + ':' + v.substring(2, 4);
                else if(v.length < 3 && v.length > 0) input.value = v.padStart(2,'0') + ':00';
            });
        });

        div.querySelector('button').onclick = () => div.remove();
        document.getElementById('interval-container').appendChild(div);
    }

    // --- Events ---
    document.getElementById('btn-schedule-settings').onclick = openSettings;
    document.getElementById('btn-close-schedule').onclick = () => modal.style.display = 'none';
    document.getElementById('btn-add-interval').onclick = () => addIntervalRow("09:00", "17:00");
    
    document.getElementById('btn-save-schedule').onclick = () => {
        const space = getCurrentSpace();
        const days = [];
        document.querySelectorAll('#day-checkboxes input:checked').forEach(cb => days.push(Number(cb.value)));
        
        const intervals = [];
        document.querySelectorAll('.schedule-interval-row').forEach(row => {
            intervals.push({
                start: row.querySelector('.start-time').value,
                end: row.querySelector('.end-time').value
            });
        });

        if (days.length === 0) return alert("Please select at least 1 day");
        if (intervals.length === 0) return alert("Please add at least 1 time interval");

        space.schedule.days = days;
        space.schedule.intervals = intervals;
        
        saveData();
        modal.style.display = 'none';
        renderScheduleUI();
        renderSidebar();
        if(window.refreshSidebarIcon) window.refreshSidebarIcon();
    };

    toggleBtn.addEventListener('click', () => {
        const space = getCurrentSpace();
        if (!space) return;
        if (!space.schedule) space.schedule = { active: false, days: [], intervals: [{start:"09:00", end:"17:00"}] };
        space.schedule.active = !space.schedule.active;
        if(space.schedule.active && space.schedule.days.length === 0) {
             alert("Please configure schedule before enabling");
             openSettings();
             return;
        }
        saveData();
        renderScheduleUI();
        renderSidebar();
        if(window.refreshSidebarIcon) window.refreshSidebarIcon();
    });

    setInterval(() => {
        const space = getCurrentSpace();
        if (space && space.schedule && space.schedule.active) {
            renderSidebar();
            renderScheduleUI();
        }
    }, 1000);
}

export function getScheduleRemainingTime(space) {
    if (!space || !space.schedule || !space.schedule.active) {
        return null;
    }

    const state = space.schedule;
    const now = new Date();
    const curDay = now.getDay();
    const curMin = now.getHours() * 60 + now.getMinutes();
    const curSec = now.getSeconds();

    let intervals = state.intervals || [];
    if (intervals.length === 0 && space.schedule.start && space.schedule.end) {
        intervals = [{ start: space.schedule.start, end: space.schedule.end }];
    }
    intervals.sort((a, b) => a.start.localeCompare(b.start));

    // Check if currently active
    if (state.days.includes(curDay)) {
        for (const iv of intervals) {
            const [sh, sm] = iv.start.split(':').map(Number);
            const [eh, em] = iv.end.split(':').map(Number);
            const sMin = sh * 60 + sm;
            const eMin = eh * 60 + em;

            if (curMin >= sMin && curMin < eMin) {
                // Active: countdown to end
                const totalSecondsRemaining = (eMin - curMin - 1) * 60 + (60 - curSec);
                if (totalSecondsRemaining < 0) return { isLocked: false, text: '00:00:00' };
                const h = Math.floor(totalSecondsRemaining / 3600);
                const m = Math.floor((totalSecondsRemaining % 3600) / 60);
                const s = totalSecondsRemaining % 60;
                return { isLocked: false, text: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` };
            }
        }
    }

    // Locked: Find next unlock time
    let nextUnlockMin = null;
    let daysUntilUnlock = 0;

    // 1. Find next interval today
    if (state.days.includes(curDay)) {
        for (const iv of intervals) {
            const [sh, sm] = iv.start.split(':').map(Number);
            const sMin = sh * 60 + sm;
            if (sMin > curMin) {
                nextUnlockMin = sMin;
                break;
            }
        }
    }

    // 2. If not today, find in coming days
    if (nextUnlockMin === null) {
        for (let i = 1; i <= 7; i++) {
            const d = (curDay + i) % 7;
            if (state.days.includes(d)) {
                daysUntilUnlock = i;
                const firstInterval = intervals[0];
                if (firstInterval) {
                    const [sh, sm] = firstInterval.start.split(':').map(Number);
                    nextUnlockMin = sh * 60 + sm;
                }
                break;
            }
        }
    }

    if (nextUnlockMin !== null) {
        const totalMinutesWait = (daysUntilUnlock * 1440) + nextUnlockMin - curMin;
        
        if (totalMinutesWait >= 1440) { // 24 hours in minutes
            const days = Math.ceil(totalMinutesWait / 1440);
            return { isLocked: true, text: `${days} Days` };
        } else {
            const totalSecondsWait = (totalMinutesWait * 60) - curSec;
            if (totalSecondsWait < 0) return { isLocked: true, text: 'Locked' };
            const h = Math.floor(totalSecondsWait / 3600);
            const m = Math.floor((totalSecondsWait % 3600) / 60);
            const s = totalSecondsWait % 60;
            return { isLocked: true, text: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` };
        }
    }

    return { isLocked: true, text: 'Locked' };
}
