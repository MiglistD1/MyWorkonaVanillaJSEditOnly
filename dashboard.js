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
  getCurrentSpaceId, setCurrentSpaceId, getFilterTags, setFilterTags, setSearchQuery, getCurrentSpace, getFilterMode, setFilterMode
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

    // 🟢 Mobile UI: Auto-close Sidebar after selecting a space
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const spacebar = document.getElementById('spacebar');
        if (spacebar && !spacebar.classList.contains('collapsed')) {
            spacebar.classList.add('collapsed');
            // อัปเดตสถานะปุ่ม Toggle ให้สอดคล้องกัน (อ้างอิงตาม Logic ใน contentManager.js)
            document.getElementById('btn-toggle-spacebar')?.classList.add('sidebar-hidden');
            document.getElementById('btn-command-center-topbar')?.classList.add('sidebar-hidden');
        }
    }
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
            const performExport = (allData) => {
                const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const d = new Date();
                const timestamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
                const filename = (appSettings.exportSubfolder || "MyBackups") + '/MyWorkspace_Backup_' + timestamp + '.json';
                
                if (typeof chrome !== 'undefined' && chrome.downloads) {
                    chrome.downloads.download({ url, filename }, () => {
                        appSettings.lastExportTimestamp = Date.now();
                        saveData();
                        URL.revokeObjectURL(url);
                    });
                } else {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename.split('/').pop();
                    a.click();
                    appSettings.lastExportTimestamp = Date.now();
                    saveData();
                    setTimeout(() => URL.revokeObjectURL(url), 100);
                }
            };

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(null, performExport);
            } else {
                const data = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    try { data[key] = JSON.parse(localStorage.getItem(key)); } catch(e) { data[key] = localStorage.getItem(key); }
                }
                performExport(data);
            }
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
                        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                            chrome.storage.local.clear(() => {
                                chrome.storage.local.set(data, () => { location.reload(); });
                            });
                        } else {
                            localStorage.clear();
                            Object.keys(data).forEach(k => localStorage.setItem(k, JSON.stringify(data[k])));
                            location.reload();
                        }
                    }
                } catch (err) { alert('Invalid JSON file.'); }
            };
            reader.readAsText(file);
        });

        // 🟢 Mobile Tag Modal Logic
        const mobileTagBtn = document.getElementById('btn-open-mobile-tag-modal');
        const mobileTagModal = document.getElementById('mobile-tag-modal');
        const mobileTagInput = document.getElementById('mobile-tag-input');
        const mobileAddTagBtn = document.getElementById('mobile-add-tag-btn');
        const mobileTagSelectionList = document.getElementById('mobile-tag-selection-list');
        const mobileCloseTagModalBtn = document.getElementById('btn-close-mobile-tag-modal');

        if (mobileTagBtn && mobileTagModal) {
            const renderMobileTags = () => {
                const space = getCurrentSpace();
                if (!space) return;
                const filterTags = getFilterTags();
                const filterMode = getFilterMode();
                const isSingle = !!space.isSingleSelectMode;
                const isLocked = !!space.isTagModeLocked;

                // 🟢 1. สร้าง Header (โหมดการกรอง)
                let html = `
                    <div style="width:100%; display: flex; align-items: center; gap: 8px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
                        <div style="display: flex; align-items: center; gap: 4px; background: var(--bg-body); padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border-color);">
                            <button id="mobile-tag-lock-btn" class="btn-icon" title="${isLocked ? 'Unlock' : 'Lock'}" style="color: ${isLocked ? '#ef4444' : '#10b981'}; opacity: ${isLocked ? '1' : '0.4'};">
                                <svg class="svg-icon-sm"><use href="#icon-${isLocked ? 'lock-minimal' : 'unlock-minimal'}"></use></svg>
                            </button>
                            <button id="mobile-tag-select-btn" class="btn-tag-mode" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; font-weight: bold; background: ${isSingle ? '#f3e8ff' : '#dcfce7'}; color: ${isSingle ? '#6b21a8' : '#166534'}; border: 1px solid ${isSingle ? '#6b21a8' : '#166534'}; opacity: ${isLocked ? '0.7' : '1'};">
                                ${isSingle ? 'Single' : 'Multi'}
                            </button>
                            <button id="mobile-tag-mode-btn" class="btn-tag-mode" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; font-weight: bold; background: ${filterMode === 'OR' ? '#e3f2fd' : '#ffebee'}; color: ${filterMode === 'OR' ? '#0b6e99' : '#991b1b'}; border: 1px solid ${filterMode === 'OR' ? '#0b6e99' : '#991b1b'}; opacity: ${isLocked ? '0.7' : '1'};">
                                ${filterMode}
                            </button>
                        </div>
                    </div>
                `;

                // 🟢 2. ส่วนของ System Tags
                const systemTags = [
                    { label: "All", value: "ALL", active: filterTags.length === 0 },
                    { label: "🚫 No Tag", value: "UNTAGGED", active: filterTags.includes("UNTAGGED") },
                    { label: "🤖 AI", value: "AI", active: filterTags.includes("AI") },
                    { label: "💻 Half screen", value: "HALF SCREEN", active: filterTags.includes("HALF SCREEN") }
                ];

                html += `<div style="width:100%; font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; letter-spacing:0.5px;">Standard Tags</div>`;
                html += `<div style="width:100%; display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">`;
                systemTags.forEach(t => {
                    html += `<div class="tag-pill ${t.active ? 'active' : ''}" data-tag="${t.value}">${t.label}</div>`;
                });
                html += `</div>`;

                // 🟢 3. ส่วนของ Custom Tags (ดึงจาก Space และ Items)
                const allTagsSet = new Set(space.tags || []);
                space.tasks.forEach(task => {
                    if (task.tags) task.tags.forEach(t => allTagsSet.add(t));
                    if (task.subtasks) task.subtasks.forEach(sub => { if (sub.tags) sub.tags.forEach(t => allTagsSet.add(t)); });
                });
                const sortedCustom = Array.from(allTagsSet).filter(t => !['AI', 'HALF SCREEN'].includes(t.toUpperCase())).sort((a, b) => a.localeCompare(b));

                html += `<div style="width:100%; font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; letter-spacing:0.5px;">Your Tags</div>`;
                html += `<div style="width:100%; display:flex; flex-wrap:wrap; gap:8px;">`;
                sortedCustom.forEach(tag => {
                    const isActive = filterTags.includes(tag.toUpperCase());
                    html += `
                        <div class="tag-pill ${isActive ? 'active' : ''}" data-tag="${tag.toUpperCase()}" style="display:flex; align-items:center; gap:6px;">
                            <span>${tag}</span>
                            <button class="btn-icon mobile-tag-edit-trigger" data-tag="${tag}" style="padding:2px; opacity:0.5; margin-left:4px;">⋮</button>
                        </div>`;
                });
                html += `</div>`;

                mobileTagSelectionList.innerHTML = html;
                mobileTagSelectionList.style.flexDirection = 'column';
                mobileTagSelectionList.style.alignItems = 'flex-start';

                // --- Bind Events ---
                const lockBtn = document.getElementById('mobile-tag-lock-btn');
                const selectBtn = document.getElementById('mobile-tag-select-btn');
                const modeBtn = document.getElementById('mobile-tag-mode-btn');

                lockBtn.onclick = () => { space.isTagModeLocked = !space.isTagModeLocked; saveData(); renderMobileTags(); };
                selectBtn.onclick = () => { if (isLocked) return; space.isSingleSelectMode = !isSingle; saveData(); renderMobileTags(); };
                modeBtn.onclick = () => {
                    if (isLocked) return;
                    const nextMode = filterMode === 'OR' ? 'AND' : 'OR';
                    setFilterMode(nextMode);
                    saveData();
                    renderMainContent();
                    renderMobileTags();
                };

                mobileTagSelectionList.querySelectorAll('.tag-pill').forEach(pill => {
                    pill.onclick = (e) => {
                        if (e.target.tagName === 'BUTTON') return;
                        const tag = pill.dataset.tag;
                        let newTags;
                        if (tag === 'ALL') {
                            newTags = [];
                        } else {
                            if (isSingle) {
                                newTags = filterTags.includes(tag) && filterTags.length === 1 ? [] : [tag];
                            } else {
                                newTags = [...filterTags];
                                const idx = newTags.indexOf(tag);
                                if (idx > -1) newTags.splice(idx, 1);
                                else newTags.push(tag);
                            }
                        }
                        setFilterTags(newTags);
                        saveData();
                        renderMainContent();
                        renderMobileTags();
                    };
                });

                // ระบบแก้ไขป้ายกำกับ
                mobileTagSelectionList.querySelectorAll('.mobile-tag-edit-trigger').forEach(btn => {
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const tag = btn.dataset.tag;
                        const action = prompt(`Edit tag "${tag}"?\nType 'rename' or 'delete'.`, 'rename');
                        if (action === 'rename') {
                            const newName = prompt(`Rename tag "${tag}" to:`, tag);
                            if (newName && newName.trim() !== "" && newName.trim() !== tag) {
                                const validName = newName.trim();
                                const updateT = (item) => { if (item.tags) item.tags = item.tags.map(t => t === tag ? validName : t); };
                                space.resources.forEach(updateT); space.driveFiles.forEach(updateT);
                                space.tasks.forEach(updateT); space.tabs.forEach(updateT);
                                const idx = space.tags.indexOf(tag); if (idx !== -1) space.tags[idx] = validName;
                                saveData(); renderMainContent(); renderMobileTags();
                            }
                        } else if (action === 'delete') {
                            if (confirm(`Delete tag "${tag}"?`)) {
                                space.tags = space.tags.filter(t => t !== tag);
                                saveData(); renderMainContent(); renderMobileTags();
                            }
                        }
                    };
                });
            };

            mobileTagBtn.onclick = () => {
                mobileTagModal.style.display = 'flex';
                renderMobileTags();
            };

            mobileAddTagBtn.onclick = () => {
                const newTag = mobileTagInput.value.trim();
                const space = getCurrentSpace();
                if (newTag && space && !space.tags.includes(newTag)) {
                    space.tags.push(newTag);
                    saveData();
                    mobileTagInput.value = '';
                    renderMobileTags();
                }
            };
            mobileTagInput.onkeydown = (e) => { if (e.key === 'Enter') mobileAddTagBtn.click(); };
            mobileCloseTagModalBtn.onclick = () => { mobileTagModal.style.display = 'none'; };
        }

        renderSidebar();
        renderMainContent();
        updateArchivedStateUI();
    });
});
