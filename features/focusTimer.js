import { getCurrentSpace, saveData, getSpaces, getAppSettings } from '../core/storage.js';
import { renderSidebar } from '../components/sidebar.js';

export function initFocusTimer() {
    const workspace = document.querySelector('.workspace');
    workspace.style.position = 'relative';

    // Minimalist Focus Icon (Target)
    const svgFocusIcon = `<svg class="svg-icon" style="width:16px; height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>`;

    const focusBarHtml = `
        <div id="focus-mode-bar" style="
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 30px; background: var(--bg-card); border-bottom: 1px solid var(--border-color);
            position: relative; z-index: 1005;
        ">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span id="focus-status-text" style="font-weight: 700; font-size: 14px; color: var(--text-muted); display:flex; align-items:center; gap:6px;">${svgFocusIcon} Focus Mode: OFF</span>
                    
                    <button id="focus-toggle-btn" style="
                        width: 48px; height: 26px; border-radius: 13px; border: none; cursor: pointer;
                        position: relative; transition: background 0.3s; background: #ccc;
                        display: flex; align-items: center; padding: 2px; flex-shrink: 0;
                    ">
                        <div id="focus-toggle-circle" style="
                            width: 22px; height: 22px; border-radius: 50%; background: #fff;
                            transition: transform 0.3s; box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                        "></div>
                    </button>
                </div>
            </div>

            <div id="focus-setup-area" style="display: none; align-items: center; gap: 10px;">
                <span style="font-size: 13px; color: var(--text-main);">Set Duration (Mins):</span>
                <input type="number" id="focus-time-input" min="1" step="1" value="25" style="
                    width: 60px; padding: 5px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-main); font-size: 13px; outline: none; text-align: center;
                ">
                <button id="focus-start-btn" style="
                    background: #10b981; color: white; border: none; padding: 6px 15px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600;
                ">✅ Confirm & Start</button>
            </div>

            <div id="focus-active-area" style="display: none; align-items: center; gap: 15px;">
                <div id="focus-countdown" style="font-size: 20px; font-weight: bold; color: var(--text-main); font-variant-numeric: tabular-nums;">00:00:00</div>
                <button id="focus-pause-btn" style="
                    background: #f59e0b; color: white; border: none; padding: 6px 15px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600;
                ">⏸️ Pause (Lock Space)</button>
                <button id="focus-resume-btn" style="
                    display: none; background: #2f80ed; color: white; border: none; padding: 6px 15px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600;
                ">▶️ Resume</button>
            </div>
        </div>
    `;

    const overlayHtml = `
        <div id="space-lock-overlay" style="
            display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(128, 128, 128, 0.15); backdrop-filter: blur(8px); z-index: 1000;
            flex-direction: column; justify-content: center; align-items: center; text-align: center;
        ">
            <div style="background: var(--bg-card); padding: 30px; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <h2 id="overlay-title" style="margin: 0 0 10px 0; color: var(--text-main);">🔒 This Space is Locked</h2>
                <p id="overlay-desc" style="margin: 0; color: var(--text-muted); line-height: 1.5;">
                    Please set a timer above to start working<br>or disable Focus Mode to use normally.
                </p>
            </div>
        </div>
    `;

    const topbar = document.querySelector('.topbar');
    topbar.insertAdjacentHTML('afterend', focusBarHtml);
    workspace.insertAdjacentHTML('beforeend', overlayHtml);

    const toggleBtn = document.getElementById('focus-toggle-btn');
    const toggleCircle = document.getElementById('focus-toggle-circle');
    const statusText = document.getElementById('focus-status-text');
    const setupArea = document.getElementById('focus-setup-area');
    const activeArea = document.getElementById('focus-active-area');
    const timeInput = document.getElementById('focus-time-input');
    const startBtn = document.getElementById('focus-start-btn');
    const pauseBtn = document.getElementById('focus-pause-btn');
    const resumeBtn = document.getElementById('focus-resume-btn');
    const countdownEl = document.getElementById('focus-countdown');
    const lockOverlay = document.getElementById('space-lock-overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayDesc = document.getElementById('overlay-desc');

    let globalInterval = null;

    const titleObserver = new MutationObserver(() => {
        const newSpaceName = document.getElementById('current-space-title').innerText;
        if (newSpaceName && newSpaceName !== "Loading...") {
            renderUIForCurrentSpace();
        }
    });
    titleObserver.observe(document.getElementById('current-space-title'), { childList: true, characterData: true, subtree: true });

    setTimeout(() => {
        const currentTitle = document.getElementById('current-space-title').innerText;
        if (currentTitle && currentTitle !== "Loading...") {
            renderUIForCurrentSpace();
        }
    }, 500);

    function renderUIForCurrentSpace() {
        const bar = document.getElementById('focus-mode-bar');
        if (!bar) return;

        const space = getCurrentSpace();
        
        // Handle Command Center (Space 0 / undefined space)
        if (!space) {
            bar.style.display = 'none';
            statusText.innerHTML = `${svgFocusIcon} Focus Mode: OFF`;
            statusText.style.color = 'var(--text-muted)';
            setupArea.style.display = 'none';
            activeArea.style.display = 'none';
            lockOverlay.style.display = 'none';
            toggleBtn.style.background = '#ccc';
            toggleCircle.style.transform = 'translateX(0)';
            return;
        }

        if (space && space.showFocusMode === false) {
            bar.style.display = 'none';
            return; 
        }
        
        if (!space.focusTimer) {
            space.focusTimer = { mode: 'off', timeLeft: 0 };
        }
        const state = space.focusTimer;

        setupArea.style.display = 'none';
        activeArea.style.display = 'none';
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'none';
        lockOverlay.style.display = 'none';

        if (state.mode === 'off') {
            toggleBtn.style.background = '#ccc';
            toggleCircle.style.transform = 'translateX(0)';
            statusText.innerHTML = `${svgFocusIcon} Focus Mode: OFF`;
            statusText.style.color = 'var(--text-muted)';
        } else if (state.mode === 'setup') {
            toggleBtn.style.background = '#10b981';
            toggleCircle.style.transform = 'translateX(22px)';
            statusText.innerHTML = `${svgFocusIcon} Focus Mode: ON`;
            statusText.style.color = '#10b981';
            setupArea.style.display = 'flex';
            lockOverlay.style.display = 'flex';
            overlayTitle.innerHTML = "🔒 Ready to Focus";
            overlayDesc.innerHTML = "Please set duration and confirm above<br>to unlock this space.";
        } else if (state.mode === 'running') {
            toggleBtn.style.background = '#10b981';
            toggleCircle.style.transform = 'translateX(22px)';
            statusText.innerHTML = `${svgFocusIcon} Focus Mode: ON`;
            statusText.style.color = '#10b981';
            activeArea.style.display = 'flex';
            pauseBtn.style.display = 'block';
            updateCountdownText(state.timeLeft);
        } else if (state.mode === 'paused') {
            toggleBtn.style.background = '#10b981';
            toggleCircle.style.transform = 'translateX(22px)';
            statusText.innerHTML = `${svgFocusIcon} Focus Mode: PAUSED`;
            statusText.style.color = '#f59e0b';
            activeArea.style.display = 'flex';
            resumeBtn.style.display = 'block';
            updateCountdownText(state.timeLeft);
            lockOverlay.style.display = 'flex';
            overlayTitle.innerHTML = "☕ Paused";
            overlayDesc.innerHTML = "Space locked while paused<br>Click 'Resume' above when ready.";
        }
    }

    function updateCountdownText(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        countdownEl.innerText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    globalInterval = setInterval(() => {
        let needsUpdate = false;
        const currentSpace = getCurrentSpace();
        if (!currentSpace) return; // Skip if in Command Center

        getSpaces().forEach(space => {
            if (!space.focusTimer) return;
            if (space.focusTimer.mode === 'running') {
                space.focusTimer.timeLeft--;
                if (space.focusTimer.timeLeft <= 0) {
                    space.focusTimer.mode = 'off';
                    space.focusTimer.timeLeft = 0;
                    if (currentSpace && space.id === currentSpace.id) alert("🎉 Focus session ended! Great job.");
                }
                saveData();
                if (currentSpace && space.id === currentSpace.id) needsUpdate = true;
            }
        });

        // 🟢 FIX: Ensure sidebar updates every second if any timer is running
        if (typeof window.refreshSidebarIcon === 'function') {
            window.refreshSidebarIcon();
        }

        if (needsUpdate) renderUIForCurrentSpace();
        if (needsUpdate) renderSidebar(); // Re-sort sidebar if current space changed state
    }, 1000);

    toggleBtn.addEventListener('click', () => {
        const space = getCurrentSpace();
        if (!space) {
            // Optionally show a message that Focus is per-space
            alert("Focus Mode details are space-specific. Please select a space from the sidebar to start a timer.");
            return;
        }
        if (!space.focusTimer) space.focusTimer = { mode: 'off', timeLeft: 0 };
        const state = space.focusTimer;

        if (state.mode === 'off') {
            state.mode = 'setup';
        } else {
            state.mode = 'off';
            state.timeLeft = 0;
        }
        saveData();
        renderUIForCurrentSpace();
        renderSidebar();
        if (window.refreshSidebarIcon) window.refreshSidebarIcon();
    });

    startBtn.addEventListener('click', () => {
        const space = getCurrentSpace();
        if (!space) return;
        if (!space.focusTimer) space.focusTimer = { mode: 'off', timeLeft: 0 };
        const state = space.focusTimer;
        const minutes = parseInt(timeInput.value) || 25;
        state.timeLeft = minutes * 60;
        state.mode = 'running';
        saveData();
        renderUIForCurrentSpace();
        renderSidebar();
        if (window.refreshSidebarIcon) window.refreshSidebarIcon();
    });

    pauseBtn.addEventListener('click', () => {
        const space = getCurrentSpace();
        if (!space.focusTimer) space.focusTimer = { mode: 'off', timeLeft: 0 };
        const state = space.focusTimer;
        state.mode = 'paused';
        saveData();
        renderUIForCurrentSpace();
        renderSidebar();
        if (window.refreshSidebarIcon) window.refreshSidebarIcon();
    });

    resumeBtn.addEventListener('click', () => {
        const space = getCurrentSpace();
        if (!space.focusTimer) space.focusTimer = { mode: 'off', timeLeft: 0 };
        const state = space.focusTimer;
        state.mode = 'running';
        saveData();
        renderUIForCurrentSpace();
        renderSidebar();
        if (window.refreshSidebarIcon) window.refreshSidebarIcon();
    });
}