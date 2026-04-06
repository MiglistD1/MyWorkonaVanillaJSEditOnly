import { initFocusTimer } from './features/focusTimer.js';
import { initScheduleMode } from './features/scheduleMode.js';
import { initSidebar, renderSidebar } from './components/sidebar.js';
import { initTabs } from './components/tabs.js';
import { initResources, resetUndoStack } from './components/resources.js';
import { initTodoManager } from './features/todoManager.js';
import { initGoogleTasks, fetchGoogleAPI, getGoogleStatus } from './features/googleTasks.js';
import { initGoogleKeep } from './features/googleKeep.js';
import { initGoogleTasksLauncher } from './features/googleTasksLauncher.js';
import { initCustomLaunchers } from './features/customLaunchers.js';
import { setupSpaceModals, setupItemModals, setupTagModal, setupSettingsModal, setupLauncherModal } from './components/modals.js';
import { initDragAndDrop } from './core/drag-and-drop.js';
import { applyAppSettings, initSettingsManager } from './core/settings-manager.js';
import { initSearchManager } from './core/searchManager.js';
import { initRewardSystem } from './features/rewardSystem.js';
import { initContentManager, renderMainContent, renderAll } from './core/contentManager.js';
import { openOrFocusTab } from './core/ui-helpers.js';
import { initDashboardQuickNote } from './features/dashboardQuickNote.js';
import { 
  getAppSettings, saveData, loadData, getSpaces,
  getCurrentSpaceId, setCurrentSpaceId, setFilterTags, setSearchQuery, getCurrentSpace
} from './core/storage.js';


function handleSpaceChange(newId, isNewSpace) {
    setCurrentSpaceId(newId);
    if (isNewSpace) {
        setFilterTags([]);
    }
    // Reset filters
    setFilterTags([]);
    setSearchQuery("");
    resetUndoStack();
    document.getElementById('quick-search-input').value = "";
    saveData();
    renderAll();
    updateArchivedStateUI();
}

// Global Error Handler for Images
document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') {
        if (e.target.dataset.isFallback) return;
        e.target.dataset.isFallback = "true";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
        e.target.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        e.target.style.opacity = "0.7";
    }
}, true);

function updateArchivedStateUI() {
    const space = getCurrentSpace();
    const workspace = document.querySelector('.workspace');
    const banner = document.getElementById('archived-space-banner');

    if (!workspace || !banner) return;

    if (space && space.isArchived) {
        workspace.classList.add('is-archived');
        banner.style.display = 'block';
    } else {
        workspace.classList.remove('is-archived');
        banner.style.display = 'none';
    }
}

// Use DOMContentLoaded for reliable loading
document.addEventListener('DOMContentLoaded', () => {
    loadData(() => {
        const appSettings = getAppSettings();
        
        // 1. Requirement: Collapse all folders on refresh except locked ones
        const allSpaces = getSpaces();
        const spaces = allSpaces.filter(s => !s.isDeleted);
        const allFolders = new Set(['General']);
        spaces.forEach(s => { if(s.folder) allFolders.add(s.folder); });
        const locked = appSettings.lockedFolders || [];

        const curSpace = allSpaces.find(s => s.id === getCurrentSpaceId());
        const activeFolder = curSpace ? (curSpace.folder || 'General') : null;
        // กรองโฟลเดอร์ที่จะพับ: ต้องไม่ใช่ General, ไม่อยู่ในรายการ Locked และไม่ใช่โฟลเดอร์ที่กำลังใช้งาน
        appSettings.collapsedFolders = Array.from(allFolders).filter(f => f !== 'General' && !locked.includes(f) && f !== activeFolder);

        setFilterTags([]);
        setSearchQuery("");
        resetUndoStack();
        
        if(appSettings.quickColors && appSettings.quickColors.length >= 3) {
            const c1 = document.getElementById('quick-color-1');
            const c2 = document.getElementById('quick-color-2');
            const c3 = document.getElementById('quick-color-3');
            if(c1) c1.value = appSettings.quickColors[0];
            if(c2) c2.value = appSettings.quickColors[1];
            if(c3) c3.value = appSettings.quickColors[2];
        }

        // Make the smart tab opener globally available for other modules
        window.openOrFocusTab = openOrFocusTab;
        window.handleSpaceChange = handleSpaceChange;
        
        // Initialize Core Modules
        applyAppSettings();
        initContentManager();
        initSearchManager({ onRender: renderMainContent });
        initSettingsManager({ onRenderAll: renderAll });
        
        // Initialize Components
        initSidebar({ onSpaceChange: handleSpaceChange });
        initTabs({ onRender: renderAll });
        initResources({ onRender: renderAll });
        initDragAndDrop({ onRender: renderMainContent });

        // Initialize Modals
        setupSpaceModals(renderAll);
        setupItemModals(renderMainContent);
        setupTagModal(renderMainContent);
        setupSettingsModal(renderMainContent);
        setupLauncherModal();

        // Initialize Features
        initFocusTimer();
        initScheduleMode();
        initTodoManager({ 
            fetchGoogleAPI: fetchGoogleAPI,
            getGoogleAuthToken: () => getGoogleStatus().googleAuthToken,
            // 🟢 ปรับปรุงให้รองรับการส่ง Space เข้าไปตรวจสอบ Specific List
            getCurrentGoogleListId: (space) => {
                const s = space || getCurrentSpace();
                return (s && s.isSpecificListEnabled && s.googleTaskListId) ? s.googleTaskListId : getGoogleStatus().currentGoogleListId;
            },
            isGoogleSyncEnabled: () => getGoogleStatus().isGoogleSyncEnabled,
            onRender: renderAll
        });
        
        initGoogleTasks({ onRender: renderAll });
        initGoogleKeep();
        initGoogleTasksLauncher();
        initCustomLaunchers();
        initDashboardQuickNote();
        initRewardSystem();
        
        const unarchiveBtn = document.getElementById('btn-unarchive-from-banner');
        if (unarchiveBtn) {
            unarchiveBtn.addEventListener('click', () => {
                const space = getCurrentSpace();
                if (space && space.isArchived) {
                    space.isArchived = false;
                    saveData();
                    renderAll();
                    updateArchivedStateUI();
                }
            });
        }

        // Command Center Trigger
        document.querySelectorAll('.btn-cc-trigger').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                handleSpaceChange(0, false);
            };
        });

        // Shortcut Bar Collapse Logic
        const btnCollapseLaunchers = document.getElementById('btn-collapse-launchers');
        if (btnCollapseLaunchers) {
            btnCollapseLaunchers.addEventListener('click', () => {
                document.querySelector('.topbar').classList.toggle('launchers-collapsed');
            });
        }

        // Topbar Utility Group Popup Logic
        const utilityMoreBtn = document.getElementById('btn-utility-more');
        const utilityGroup = document.getElementById('utility-group');

        if (utilityMoreBtn && utilityGroup) {
            utilityMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                utilityGroup.classList.toggle('show-popup');
            });
            document.addEventListener('click', (e) => {
                if (utilityGroup.classList.contains('show-popup') && !utilityGroup.contains(e.target) && e.target !== utilityMoreBtn) {
                    utilityGroup.classList.remove('show-popup');
                }
            });
        }

        // Advanced Data Management Logic
        const subfolderInput = document.getElementById('export-subfolder');
        const autoExportSelect = document.getElementById('auto-export-days');
        const btnManualExport = document.getElementById('btn-manual-export');
        const btnImportData = document.getElementById('btn-import-data');
        const fileImportInput = document.getElementById('file-import-data');

        if (subfolderInput) subfolderInput.value = appSettings.exportSubfolder || "MyBackups";
        if (autoExportSelect) autoExportSelect.value = appSettings.autoExportDays || 0;

        const saveDataManagementSettings = () => {
            appSettings.exportSubfolder = subfolderInput.value.trim() || "MyBackups";
            appSettings.autoExportDays = parseInt(autoExportSelect.value, 10);
            saveData();
        };

        subfolderInput?.addEventListener('change', saveDataManagementSettings);
        autoExportSelect?.addEventListener('change', saveDataManagementSettings);

        btnManualExport?.addEventListener('click', () => {
            chrome.storage.local.get(null, (allData) => {
                const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const d = new Date();
                const timestamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
                const filename = (appSettings.exportSubfolder || "MyBackups") + '/MyWorkspace_Backup_' + timestamp + '.json';
                chrome.downloads.download({ url, filename }, () => {
                    appSettings.lastExportTimestamp = Date.now();
                    saveData();
                    URL.revokeObjectURL(url);
                });
            });
        });

        btnImportData?.addEventListener('click', () => fileImportInput?.click());

        fileImportInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (confirm('Replace all existing data with this backup? This will reload the application.')) {
                        chrome.storage.local.clear(() => {
                            chrome.storage.local.set(data, () => {
                                location.reload();
                            });
                        });
                    }
                } catch (err) { alert('Invalid JSON file.'); }
            };
            reader.readAsText(file);
        });

        renderSidebar();
        renderMainContent();
        updateArchivedStateUI();
    });
});
