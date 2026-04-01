// features/googleTasksLauncher.js
import { openOrFocusTab } from '../core/ui-helpers.js';

export function initGoogleTasksLauncher() {
    const btn = document.getElementById('btn-open-google-tasks-launcher');
    const sideBtn = document.getElementById('tasks-side-view-btn');
    
    if (sideBtn) {
        sideBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sideBtn.classList.toggle('active-side-view');
        });
    }

    if (btn) {
        btn.addEventListener('click', () => {
            const isSideView = sideBtn && sideBtn.classList.contains('active-side-view');
            openGoogleTasks(isSideView);
        });
    }

    // --- Delegation สำหรับปุ่มใน Master Command Center ---
    document.addEventListener('click', (e) => {
        const target = e.target;
        const mSideBtn = target.closest('#master-tasks-side-view-btn');
        if (mSideBtn) {
            e.stopPropagation();
            mSideBtn.classList.toggle('active-side-view');
            return;
        }
        if (target.closest('#master-btn-open-tasks')) {
            const mSideBtn = document.getElementById('master-tasks-side-view-btn');
            const isSideView = mSideBtn && mSideBtn.classList.contains('active-side-view');
            openGoogleTasks(isSideView);
        }
    });
}

export function openGoogleTasks(isSideView) {
    // Full screen embedded version of Google Tasks
    const targetUrl = "https://tasks.google.com/";
    // คืนค่าเป็น native behavior เพื่อไม่ให้กระทบส่วนอื่นของโปรเจกต์ตามคำขอ
    if (isSideView && chrome.sidePanel) {
        chrome.sidePanel.setOptions({ path: targetUrl, enabled: true });
        chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    } else {
        openOrFocusTab(targetUrl);
    }
}