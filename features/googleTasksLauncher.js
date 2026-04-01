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
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 1. Extract the target URL based on the current object
            const targetUrl = "https://tasks.google.com/";

            // 2. Generate a unique ID for this specific button so the manager can save its individual state
            const sourceId = 'google_tasks_launcher';

            // 3. Open the custom split view
            if (window.splitViewManager) {
                window.splitViewManager.open(targetUrl, sourceId);
            } else {
                console.error("splitViewManager not found!");
                window.open(targetUrl, '_blank'); // Fallback
            }
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
            e.preventDefault();
            e.stopPropagation();

            // 1. Extract the target URL based on the current object
            const targetUrl = "https://tasks.google.com/";

            // 2. Generate a unique ID for this specific button so the manager can save its individual state
            const sourceId = 'master_google_tasks_launcher';

            // 3. Open the custom split view
            if (window.splitViewManager) {
                window.splitViewManager.open(targetUrl, sourceId);
            } else {
                console.error("splitViewManager not found!");
                window.open(targetUrl, '_blank'); // Fallback
            }
        }
    });
}

export function openGoogleTasks(isSideView) {
    // Full screen embedded version of Google Tasks
    const targetUrl = "https://tasks.google.com/";
    if (isSideView) {
        window.splitViewManager.open(targetUrl, 'google_tasks_launcher');
    } else {
        openOrFocusTab(targetUrl);
    }
}