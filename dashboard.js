import { initFocusTimer } from './features/focusTimer.js';
import { initFirebaseSync, forcePushNote, forcePullNote, updateSyncStatusUI, handleAutoSyncActivation, switchSpaceContext, cleanupFirebaseSync, subscribeToMetadata, subscribeToSpace, forcePushToCloud, forcePullFromCloud } from "./core/firebaseSync.js";
import { initDriveSync, markDirty as driveDirty, pushToDrive, pullFromDrive, forcePush, setupVault, startAutoSync as driveStartAutoSync, stopAutoSync as driveStopAutoSync, isDirty, getLastSyncedAt, getVaultFolderName, getHasConflict, clearConflict, getSyncHistory, clearSyncHistory } from './core/driveSync.js';
import { setOnSaveDriveHook } from './core/storage.js';

import { initScheduleMode } from './features/scheduleMode.js';
import { initSidebar, renderSidebar } from './components/sidebar.js';
import { initTabs } from './components/tabs.js';
import { initResources, resetUndoStack } from './components/resources.js';
import { initTodoManager } from './features/todoManager.js';
import { initGoogleKeep } from './features/googleKeep.js';
import { initCustomLaunchers } from './features/customLaunchers.js';
import { setupSpaceModals, setupItemModals, setupTagModal, setupSettingsModal, setupLauncherModal } from './components/modals.js';
import { initDragAndDrop } from './core/drag-and-drop.js';
import { applyAppSettings, initSettingsManager } from './core/settings-manager.js';
import { initSearchManager } from './core/searchManager.js';
import { initRewardSystem } from './features/rewardSystem.js';
import { initContentManager, renderMainContent, renderAll } from './core/contentManager.js';
import { openOrFocusTab } from './core/ui-helpers.js';
import { initDashboardQuickNote } from './features/dashboardQuickNote.js';
import { initStateManagerIntegration, stateManager, eventBus, Events } from './core/StateManagerIntegration.js';
import { createMaintenanceButton, initMaintenanceTracking } from './core/maintenance-button.js';
import { 
  getAppSettings, saveData, loadData, getSpaces,
  getCurrentSpaceId, setCurrentSpaceId, getFilterTags, setFilterTags, setSearchQuery, getCurrentSpace, getFilterMode, setFilterMode, getLocalSettings
} from './core/storage.js';

let sessionReminderActive = true; // 🟢 ตัวแปรสำหรับคุมการแจ้งเตือนในเซสชั่นปัจจุบัน
let isActivatingAutoSync = false; // 🔒 ป้องกันการปิด Popup ขณะกำลังตั้งค่า

/**
 * Phase 5: Helper to filter out soft-deleted items from rendering
 * Prevents deleted items from appearing in UI while maintaining them for sync
 */
function filterVisibleItems(items = []) {
    return items.filter(item => !item?.isDeleted);
}

/**
 * Phase 6: Test Helper for Selective Push Verification
 * Run from console: window.testPhase6Selective()
 */
function testPhase6Selective() {
    console.group("🧪 PHASE 6: SELECTIVE PUSH TEST");
    
    const space = getCurrentSpace();
    const spaceId = getCurrentSpaceId();
    
    console.log("=== TEST A: Change Detection ===");
    console.log("Instructions:");
    console.log("1. Edit or add a task");
    console.log("2. Save (Ctrl+S)");
    console.log("3. Watch F12 console for: '📤 Space N: Selective push (X changes)'");
    console.log("4. Save again without editing");
    console.log("5. Watch for: '✅ Space N: No changes, skipping write'");
    
    console.log("\n=== TEST B: Soft-Delete Verification ===");
    console.log("Current space tasks:", space?.tasks?.length || 0);
    const softDeleted = space?.tasks?.filter(t => t.isDeleted) || [];
    console.log("Soft-deleted tasks:", softDeleted.length);
    softDeleted.forEach(t => {
        console.log(`  - [${t.id}] "${t.text?.substring(0, 50)}" (isDeleted:true, syncVersion:${t.syncVersion})`);
    });
    
    console.log("\n=== TEST C: LocalStorage Check ===");
    const localData = JSON.parse(localStorage.getItem('mySpacesData') || '[]');
    const localSpace = localData.find(s => s.id === spaceId);
    if (localSpace?.tasks) {
        const deletedInStorage = localSpace.tasks.filter(t => t.isDeleted);
        console.log(`Local tasks in storage: ${localSpace.tasks.length}`);
        console.log(`Soft-deleted in storage: ${deletedInStorage.length}`);
        if (deletedInStorage.length > 0) {
            console.log("✅ Soft-deleted items preserved in localStorage");
            deletedInStorage.forEach(t => {
                console.log(`   - ${t.text?.substring(0, 50)} (syncVersion: ${t.syncVersion})`);
            });
        }
    }
    
    console.log("\n=== TEST D: Snapshot Comparison ===");
    const snapshotKey = `snapshot-space-${spaceId}`;
    const snapshot = JSON.parse(localStorage.getItem(snapshotKey) || '{}');
    if (snapshot.tasks) {
        console.log(`Snapshot tasks: ${snapshot.tasks.length}`);
        console.log(`Current tasks: ${space?.tasks?.length || 0}`);
        const diff = Math.abs((space?.tasks?.length || 0) - snapshot.tasks.length);
        console.log(`Difference: ${diff} items`);
        if (diff === 0) {
            console.log("✅ No changes since last sync (next save should skip write)");
        } else {
            console.log(`⚠️ ${diff} items changed (next save will push selective update)`);
        }
    } else {
        console.log("ℹ️ No snapshot yet (first sync will send full space)");
    }
    
    console.log("\n=== NEXT STEPS ===");
    console.log("1. Add a new task and save");
    console.log("2. Check console for selective push message");
    console.log("3. Save again → should see 'No changes, skipping write'");
    console.log("4. Verify in Network tab → smaller payloads");
    
    console.groupEnd();
}

// Make available globally
window.testPhase6Selective = testPhase6Selective;

function handleSpaceChange(newId, isNewSpace) {
    const oldId = getCurrentSpaceId();
    
    setCurrentSpaceId(newId);
    if (isNewSpace) {
        setFilterTags([]);
    }
    // Reset filters
    setFilterTags([]);
    setSearchQuery("");
    resetUndoStack();
    document.getElementById('quick-search-input').value = "";
    saveData(true); // 🟢 บันทึกทันทีเพื่อให้เครื่องอื่นเปลี่ยน Space ตามได้เร็วขึ้น
    renderAll();
    updateArchivedStateUI();

    // 🟢 NEW: Switch Firebase listener scope (old space unsubscribe, new space subscribe)
    if (getLocalSettings().firebaseAutoSync) {
        switchSpaceContext(oldId, newId);
    }

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
    // 🔍 DIAGNOSTIC: Read raw chrome.storage BEFORE loadData to confirm what was actually written
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['mySpacesData', 'myLocalDeviceSettings'], (raw) => {
            const details = (raw.mySpacesData || []).map(s => `${s.name}:${s.tasks?.filter(t => !t.isDeleted).length ?? 0}tasks`).join(' | ');
            console.log('[DIAG] Raw storage — spaces:', raw.mySpacesData?.length, '| autoSync:', raw.myLocalDeviceSettings?.firebaseAutoSync, '| expiry:', raw.myLocalDeviceSettings?.autoSyncSessionExpiry);
            console.log('[DIAG] Space details:', details || '(empty)');
        });
    }
    loadData(() => {
        const appSettings = getAppSettings();
        const lSettings = getLocalSettings();
        
        // ⏱️ Device-Specific Auto Sync Persistence Logic
        const now = Date.now();
        const expiry = lSettings.autoSyncSessionExpiry || 0;
        const spaceDetails = (getSpaces() || []).map(s => `${s.name}:${s.tasks?.filter(t => !t.isDeleted).length ?? 0}tasks`).join(' | ');
        console.log('[STARTUP] flag:', localStorage.getItem('myws-just-imported'), '| expiry:', expiry, '| firebaseAutoSync:', lSettings.firebaseAutoSync, '| spaces:', getSpaces()?.length);
        console.log('[STARTUP] Space details:', spaceDetails || '(empty)');

        // 🛡️ If we just restored a backup, force Auto Sync OFF regardless of what was in the file
        if (localStorage.getItem('myws-just-imported') === '1') {
            localStorage.removeItem('myws-just-imported');
            lSettings.firebaseAutoSync = false;
            lSettings.autoSyncSessionExpiry = 0;
            console.log('[STARTUP] 🛡️ Just-imported flag detected — Auto Sync forced OFF');
        } else if (expiry > now) {
            // 🟢 ตรวจพบ Session ที่ยังไม่หมดอายุ: บังคับเปิด Auto Sync ทันที
            lSettings.firebaseAutoSync = true;
        } else {
            // 🔴 ไม่มี Session หรือหมดอายุแล้ว: บังคับปิด Auto Sync (กฎความปลอดภัยพื้นฐาน)
            lSettings.firebaseAutoSync = false;
            lSettings.autoSyncSessionExpiry = 0;
        }
        saveData(true);
        updateSyncStatusUI(); // 🛰️ อัปเดตสีไอคอน Cloud ทันทีตามสถานะใหม่

        // 🎨 Fix for tagBar.js: ทำให้ตัวแปร isDarkMode เข้าถึงได้จากทุกสคริปต์
        window.isDarkMode = !!appSettings.isDarkMode;

        // 🔗 Initialize StateManager (must happen before component initialization)
        initStateManagerIntegration().then(() => {
          console.log('✅ StateManager ready for components');
        }).catch(e => {
          console.error('🔴 StateManager initialization failed:', e);
          // Continue anyway - components will fall back to storage.js
        });

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
        window.renderAll = renderAll;
        
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
            onRender: renderAll
        });
        
        initGoogleKeep();
        initCustomLaunchers();
        initDashboardQuickNote();
        initFirebaseSync();

        // 🗂️ GDrive Sync: realtime push on every save
        setOnSaveDriveHook((data) => {
            if (localStorage.getItem('drive-sync-enabled') !== 'false') pushToDrive(data);
        }); // fromUserGesture=false, auto-sync path
        initDriveSync();

        // ── Vault Sync Popup Logic ──────────────────────────────────────────────────────────────
        {
            const driveSyncContainer = document.getElementById('drive-sync-container');
            const driveSyncPopup     = document.getElementById('drive-sync-popup');

            const positionDrivePopup = () => {
                if (!driveSyncPopup || !driveSyncContainer) return;
                if (window.innerWidth <= 768) {
                    const rect   = driveSyncContainer.getBoundingClientRect();
                    const margin = 8;
                    const top    = Math.min(window.innerHeight - 70, rect.bottom + 8);
                    const width  = Math.min(280, window.innerWidth - margin * 2);
                    let left = rect.right - width;
                    if (left < margin) left = margin;
                    driveSyncPopup.style.position  = 'fixed';
                    driveSyncPopup.style.width     = `${width}px`;
                    driveSyncPopup.style.left      = `${left}px`;
                    driveSyncPopup.style.right     = 'auto';
                    driveSyncPopup.style.top       = `${top}px`;
                    driveSyncPopup.style.maxHeight = `calc(100vh - ${top + margin}px)`;
                    driveSyncPopup.style.overflowY = 'auto';
                } else {
                    driveSyncPopup.style.position  = 'absolute';
                    driveSyncPopup.style.width     = '';
                    driveSyncPopup.style.left      = 'auto';
                    driveSyncPopup.style.right     = '0';
                    driveSyncPopup.style.top       = '115%';
                    driveSyncPopup.style.maxHeight = '';
                    driveSyncPopup.style.overflowY = '';
                }
            };

            const _applyDeviceCapabilityUI = () => {
                const supported = 'showDirectoryPicker' in window;
                const ua        = navigator.userAgent;
                const isMobile  = /Android|iPhone|iPod/i.test(ua);
                const isTablet  = /iPad|Android(?!.*Mobile)/i.test(ua);

                const badgeIcon      = document.getElementById('drive-device-badge-icon');
                const badgeText      = document.getElementById('drive-device-badge-text');
                const badge          = document.getElementById('drive-device-badge');
                const desktopSection = document.getElementById('drive-vault-desktop-section');
                const notSupported   = document.getElementById('drive-not-supported-msg');

                let icon, label, bg;
                if (isMobile)       { icon = '\uD83D\uDCF1'; label = 'Mobile \u2014 Vault Sync unavailable';    bg = 'rgba(239,68,68,0.08)'; }
                else if (isTablet)  { icon = '\uD83D\uDCF1'; label = 'Tablet \u2014 Vault Sync unavailable';    bg = 'rgba(245,158,11,0.08)'; }
                else if (supported) { icon = '\uD83D\uDCBB'; label = 'Desktop \u2014 Vault Sync ready';         bg = 'rgba(16,185,129,0.08)'; }
                else                { icon = '\u26A0\uFE0F'; label = 'Browser not supported';                    bg = 'rgba(239,68,68,0.08)'; }

                if (badgeIcon) badgeIcon.textContent = icon;
                if (badgeText) badgeText.textContent = label;
                if (badge)     badge.style.background = bg;

                if (supported) {
                    if (desktopSection) desktopSection.style.display = 'contents';
                    if (notSupported)   notSupported.style.display   = 'none';
                } else {
                    if (desktopSection) desktopSection.style.display = 'none';
                    if (notSupported)   notSupported.style.display   = 'flex';
                }
            };

            const _updateSyncEnabledRow = () => {
                const enabled = localStorage.getItem('drive-sync-enabled') !== 'false';
                const row  = document.getElementById('drive-sync-enabled-row');
                const icon = document.getElementById('drive-sync-enabled-icon');
                const chk  = document.getElementById('chk-drive-sync-enabled');
                if (row) {
                    row.style.background  = enabled ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
                    row.style.borderColor = enabled ? 'rgba(16,185,129,0.3)'  : 'rgba(239,68,68,0.3)';
                }
                if (icon) icon.textContent = enabled ? '\uD83D\uDD04' : '\u23F8';
                if (chk)  chk.checked = enabled;
                const dot = document.getElementById('drive-topbar-dot');
                if (dot && !enabled) { dot.style.background = '#ef4444'; dot.title = 'Vault Sync paused'; }
                else if (dot && enabled) { dot.style.background = '#94a3b8'; dot.title = ''; }
            };

            const updateDriveStayActiveLabel = () => {
                const label  = document.getElementById('drive-stay-active-label');
                if (!label) return;
                const expiry = parseInt(localStorage.getItem('drive-stay-active-expiry') ?? '0', 10);
                if (expiry > Date.now()) {
                    const diff = expiry - Date.now();
                    const hrs  = Math.floor(diff / (1000 * 60 * 60));
                    const mins = Math.round((diff % (1000 * 60 * 60)) / (1000 * 60));
                    label.textContent = hrs > 0 ? `Active for ${hrs}h ${mins}m` : `Active for ${mins}m`;
                } else {
                    label.textContent = 'Reset on Refresh';
                }
            };

            const refreshDrivePopupUI = () => {
                const lsa = getLastSyncedAt();
                const lastSyncEl = document.getElementById('drive-last-sync-time');
                if (lastSyncEl) lastSyncEl.textContent = lsa ? `Last Synced: ${new Date(lsa).toLocaleTimeString()}` : 'Last Synced: Never';
                _updateSyncEnabledRow();
                _applyDeviceCapabilityUI();
                updateDriveStayActiveLabel();
                const histContent  = document.getElementById('drive-sync-history-content');
                const clearHistBtn = document.getElementById('btn-drive-clear-history');
                if (histContent) {
                    const hist = getSyncHistory();
                    if (hist.length === 0) {
                        histContent.innerHTML = '<span>No sync history yet</span>';
                        if (clearHistBtn) clearHistBtn.style.display = 'none';
                    } else {
                        histContent.innerHTML = hist.map(h => {
                            const icon  = h.status === 'success' ? '✓' : '⚠';
                            const color = h.status === 'success' ? '#10b981' : '#ef4444';
                            const time  = new Date(h.time).toLocaleTimeString();
                            return `<div style="display:flex;justify-content:space-between;"><span style="color:${color};font-weight:700;">${icon} ${h.type}</span><span>${time}</span></div>`;
                        }).join('');
                        if (clearHistBtn) clearHistBtn.style.display = 'flex';
                    }
                }
            };

            const _getDriveData = async () => {
                const { getSpaces, getAppSettings, getGlobalLaunchers, getLauncherTags, getCurrentSpaceId } = await import('./core/storage.js');
                return { mySpacesData: getSpaces(), lastSpaceId: getCurrentSpaceId(), appSettings: getAppSettings(), globalLaunchers: getGlobalLaunchers(), launcherTags: getLauncherTags() };
            };

            const _applyPulledData = async (data) => {
                try {
                    const { setSpaces, setCurrentSpaceId, setAppSettings, setGlobalLaunchers, setLauncherTags, saveData } = await import('./core/storage.js');
                    if (data.mySpacesData)    setSpaces(data.mySpacesData);
                    if (data.lastSpaceId)     setCurrentSpaceId(data.lastSpaceId);
                    if (data.appSettings)     setAppSettings(data.appSettings);
                    if (data.globalLaunchers) setGlobalLaunchers(data.globalLaunchers);
                    if (data.launcherTags)    setLauncherTags(data.launcherTags);
                    saveData(true);
                } catch (err) {
                    console.error('[DriveSync] Apply pulled data error:', err);
                }
                if (typeof window.showToast === 'function') window.showToast('Vault data applied. Reloading…');
                setTimeout(() => window.location.reload(), 700);
            };

            // ─ Toggle popup
            document.getElementById('btn-drive-sync-now-topbar')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!driveSyncPopup) return;
                const isHidden = driveSyncPopup.style.display === 'none';
                driveSyncPopup.style.display = isHidden ? 'flex' : 'none';
                if (isHidden) { positionDrivePopup(); refreshDrivePopupUI(); }
            });

            window.addEventListener('resize', () => {
                if (driveSyncPopup && driveSyncPopup.style.display !== 'none') positionDrivePopup();
            });

            document.addEventListener('click', (e) => {
                if (!driveSyncPopup || driveSyncPopup.style.display === 'none') return;
                if (!driveSyncPopup.contains(e.target) && !driveSyncContainer?.contains(e.target)) {
                    driveSyncPopup.style.display = 'none';
                }
            });

            // ─ Pick folder
            document.getElementById('btn-drive-pick-folder-popup')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await setupVault();
            });

            // ─ Sync Now (fromUserGesture: true — re-auth dialog allowed)
            document.getElementById('btn-drive-sync-now-popup')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (localStorage.getItem('drive-sync-enabled') === 'false') {
                    if (typeof window.showToast === 'function') window.showToast('\u23F8 Vault Sync is paused — enable sync first');
                    return;
                }
                const data = await _getDriveData();
                await pushToDrive(data, { fromUserGesture: true });
                refreshDrivePopupUI();
            });

            // ─ Push
            document.getElementById('btn-drive-push')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Push local data → vault?\n\nThis will overwrite vault files with current local data.')) return;
                const data = await _getDriveData();
                await pushToDrive(data, { fromUserGesture: true });
                refreshDrivePopupUI();
                if (driveSyncPopup) driveSyncPopup.style.display = 'none';
            });

            // ─ Pull
            document.getElementById('btn-drive-pull')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Pull vault → local data?\n\nThis will overwrite local data with vault files. Page will reload.')) return;
                const pulled = await pullFromDrive({ fromUserGesture: true });
                if (pulled) { await _applyPulledData(pulled); clearConflict(); }
                if (driveSyncPopup) driveSyncPopup.style.display = 'none';
            });

            // ─ Force Push
            document.getElementById('btn-drive-force-push')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('⚠️ Force Push — write local data to vault WITHOUT any merge.\n\nAll vault files will be completely overwritten. Are you sure?')) return;
                const data = await _getDriveData();
                await forcePush(data, { fromUserGesture: true });
                clearConflict();
                refreshDrivePopupUI();
                if (driveSyncPopup) driveSyncPopup.style.display = 'none';
            });

            // ─ Force Pull
            document.getElementById('btn-drive-force-pull')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('⚠️ Force Pull — load vault into local data WITHOUT any merge.\n\nAll local data will be completely replaced. Page will reload. Are you sure?')) return;
                const pulled = await pullFromDrive({ fromUserGesture: true });
                if (pulled) { clearConflict(); await _applyPulledData(pulled); }
                if (driveSyncPopup) driveSyncPopup.style.display = 'none';
            });

            // ─ Conflict banner buttons
            document.getElementById('btn-drive-conflict-pull')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Pull vault → local? Vault version is newer.\n\nLocal data will be replaced. Page will reload.')) return;
                const pulled = await pullFromDrive({ fromUserGesture: true });
                if (pulled) { clearConflict(); await _applyPulledData(pulled); }
            });

            document.getElementById('btn-drive-conflict-force-push')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('⚠️ Force Push — keep local data and overwrite vault?\n\nNewer vault version will be lost.')) return;
                const data = await _getDriveData();
                await forcePush(data, { fromUserGesture: true });
                clearConflict();
                refreshDrivePopupUI();
            });

            // ─ Reminders toggle
            const driveReminderChk = document.getElementById('chk-drive-reminders');
            if (driveReminderChk) {
                driveReminderChk.checked = localStorage.getItem('drive-reminders-enabled') === 'true';
                driveReminderChk.onchange = (e) => { e.stopPropagation(); localStorage.setItem('drive-reminders-enabled', String(driveReminderChk.checked)); };
            }

            // ─ Sync Enabled toggle
            const driveSyncEnabledChk = document.getElementById('chk-drive-sync-enabled');
            if (driveSyncEnabledChk) {
                _updateSyncEnabledRow();
                driveSyncEnabledChk.onchange = (e) => {
                    e.stopPropagation();
                    localStorage.setItem('drive-sync-enabled', String(driveSyncEnabledChk.checked));
                    _updateSyncEnabledRow();
                    if (!driveSyncEnabledChk.checked) {
                        if (typeof window.showToast === 'function') window.showToast('\u23F8 Vault Sync paused — data will not be written to vault');
                    } else {
                        if (typeof window.showToast === 'function') window.showToast('\uD83D\uDD04 Vault Sync resumed');
                    }
                };
            }

            // ─ Stay Active After Refresh (timed)

            document.getElementById('btn-drive-stay-active-set')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const raw = (document.getElementById('drive-stay-active-input')?.value ?? '').toLowerCase().trim();
                let ms = 0;
                if (raw.endsWith('m'))           ms = parseFloat(raw) * 60 * 1000;
                else if (raw.endsWith('h'))      ms = parseFloat(raw) * 60 * 60 * 1000;
                else if (parseFloat(raw) > 0)   ms = parseFloat(raw) * 60 * 60 * 1000;
                if (ms > 0) {
                    localStorage.setItem('drive-stay-active-expiry', String(Date.now() + ms));
                    updateDriveStayActiveLabel();
                    const setBtn = document.getElementById('btn-drive-stay-active-set');
                    if (setBtn) { setBtn.classList.add('flash-confirm'); setTimeout(() => setBtn.classList.remove('flash-confirm'), 500); }
                }
            });

            document.getElementById('btn-drive-stay-active-off')?.addEventListener('click', (e) => {
                e.stopPropagation();
                localStorage.removeItem('drive-stay-active-expiry');
                const input = document.getElementById('drive-stay-active-input');
                if (input) input.value = '';
                updateDriveStayActiveLabel();
            });

            // ─ History toggle
            document.getElementById('btn-drive-view-history')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const list = document.getElementById('drive-sync-history-list');
                if (!list) return;
                const isHidden = list.style.display === 'none';
                list.style.display = isHidden ? 'flex' : 'none';
                if (isHidden) refreshDrivePopupUI();
            });

            document.getElementById('btn-drive-clear-history')?.addEventListener('click', (e) => {
                e.stopPropagation();
                clearSyncHistory();
                refreshDrivePopupUI();
            });

            // ─ Reminders interval
            let _lastDisabledReminderAt = 0;
            const DRIVE_REMINDER_MS          = 10 * 60 * 1000;
            const DRIVE_DISABLED_REMINDER_MS =  5 * 60 * 1000;
            setInterval(() => {
                if (localStorage.getItem('drive-reminders-enabled') !== 'true') return;

                // Reminder: sync is OFF
                if (localStorage.getItem('drive-sync-enabled') === 'false') {
                    if (Date.now() - _lastDisabledReminderAt > DRIVE_DISABLED_REMINDER_MS) {
                        _lastDisabledReminderAt = Date.now();
                        const dot = document.getElementById('drive-topbar-dot');
                        if (dot) { dot.style.background = '#ef4444'; dot.title = 'Vault Sync paused'; }
                        if (typeof window.showToast === 'function')
                            window.showToast('\u23F8 Vault Sync is still paused — remember to re-enable sync');
                    }
                    return;
                }

                // Reminder: unsaved data
                if (!isDirty()) return;
                const lsa = getLastSyncedAt();
                if (lsa > 0 && (Date.now() - lsa) > DRIVE_REMINDER_MS) {
                    const dot = document.getElementById('drive-topbar-dot');
                    if (dot) { dot.style.background = '#f59e0b'; dot.title = 'Vault not synced for 10+ min'; }
                    if (typeof window.showToast === 'function') window.showToast('Vault has unsaved changes for 10+ minutes — tap Sync');
                }
            }, 60 * 1000);

            // Expose globals for settings/external UI
            window.drivePushNow      = async () => { const d = await _getDriveData(); const ok = await pushToDrive(d, { fromUserGesture: true }); refreshDrivePopupUI(); return ok; };
            window.drivePullNow      = async () => { const pulled = await pullFromDrive({ fromUserGesture: true }); refreshDrivePopupUI(); return pulled; };
            window.driveForcePushNow = async () => { const d = await _getDriveData(); const ok = await forcePush(d, { fromUserGesture: true }); refreshDrivePopupUI(); return ok; };
            window.driveSetupVault    = setupVault;
            window.driveStartAutoSync = driveStartAutoSync;
            window.driveStopAutoSync  = driveStopAutoSync;
        }

        initRewardSystem();

        // 🔒 Edit Safe Zone Button
        const maintenanceBtnContainer = document.getElementById('maintenance-btn-container');
        if (maintenanceBtnContainer) {
            maintenanceBtnContainer.appendChild(createMaintenanceButton());
        }
        initMaintenanceTracking();

        // 🛰️ Firebase Sync Manual Actions
        const syncTrigger = document.getElementById('btn-firebase-sync-trigger');
        const syncPopup = document.getElementById('firebase-sync-popup');
        const autoSyncChk = document.getElementById('chk-firebase-auto-sync');
        const sessionAreaId = 'sf-auto-sync-persistence-area';

        const positionSyncPopup = () => {
            if (!syncPopup || !syncTrigger) return;
            const isMobile = window.innerWidth <= 768;

            if (isMobile) {
                const triggerRect = syncTrigger.getBoundingClientRect();
                const margin = 8;
                const top = Math.min(window.innerHeight - 70, triggerRect.bottom + 8);
                const desiredWidth = Math.min(280, window.innerWidth - margin * 2);
                let left = triggerRect.right - desiredWidth;
                if (left < margin) left = margin;
                if (left + desiredWidth > window.innerWidth - margin) {
                    left = window.innerWidth - desiredWidth - margin;
                }
                syncPopup.style.position = 'fixed';
                syncPopup.style.width = `${desiredWidth}px`;
                syncPopup.style.left = `${left}px`;
                syncPopup.style.right = 'auto';
                syncPopup.style.top = `${top}px`;
                syncPopup.style.maxHeight = `calc(100vh - ${top + margin}px)`;
                syncPopup.style.overflowY = 'auto';
            } else {
                syncPopup.style.position = 'absolute';
                syncPopup.style.width = '';
                syncPopup.style.left = 'auto';
                syncPopup.style.right = '0';
                syncPopup.style.top = '115%';
                syncPopup.style.maxHeight = '';
                syncPopup.style.overflowY = '';
            }
        };

        if (syncTrigger && syncPopup) {
            syncTrigger.onclick = (e) => {
                e.stopPropagation();
                const isHidden = syncPopup.style.display === 'none';
                syncPopup.style.display = isHidden ? 'flex' : 'none';
                if (isHidden) {
                    positionSyncPopup();
                    updateExpiryUI(); // 🟢 อัปเดตเวลาที่เหลือเมื่อเปิดหน้าต่าง
                }
            };

            window.addEventListener('resize', () => {
                if (syncPopup.style.display !== 'none') positionSyncPopup();
            });
            
            document.addEventListener('click', (e) => {
                if (isActivatingAutoSync) return; // 🛑 ห้ามปิดหน้าต่างถ้ากำลังอยู่ในขั้นตอน Reconciliation
                if (!syncPopup.contains(e.target) && e.target !== syncTrigger) {
                    syncPopup.style.display = 'none';
                }
            });

            // 🟢 Session Persistence UI Injection
            if (!document.getElementById(sessionAreaId)) {
                const area = document.createElement('div');
                area.id = sessionAreaId;
                area.style.cssText = 'margin-top: 15px; padding-top: 12px; border-top: 1px dashed var(--border-color); display: flex; flex-direction: column; gap: 8px;';
                area.innerHTML = `
                <style>
                    #sf-auto-sync-custom-hrs::-webkit-outer-spin-button, #sf-auto-sync-custom-hrs::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
                    #sf-auto-sync-custom-hrs { -moz-appearance: textfield; }
                </style>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Stay Active After Refresh</span>
                        <span id="sf-auto-sync-timer-label" style="font-size:10px; font-weight:700; color:var(--primary-color);"></span>
                    </div>
                    <div style="display:flex; gap:5px; align-items:center;">
                        <div style="flex:1; position:relative; display:flex; align-items:center; height:30px;">
                        <input type="text" id="sf-auto-sync-custom-val" placeholder="30m or 1h" style="width:100%; height:100%; padding:0 10px; font-size:13px; font-weight:800; border-radius:6px; border:1.5px solid var(--border-color); background:var(--bg-card); color:var(--text-main); outline:none; box-sizing:border-box;">
                        </div>
                        <button class="btn btn-primary" id="btn-sf-set-session" style="height:30px; padding:0 12px; font-size:10px; border-radius:6px; font-weight:800; justify-content:center;">Set</button>
                        <button class="btn btn-outline" id="btn-sf-clear-session" style="height:30px; padding:0 10px; font-size:10px; color:#ef4444; border-color:#fecaca; border-radius:6px; font-weight:800; justify-content:center;">Off</button>
                    </div>
                `;
                syncPopup.appendChild(area);

                const setBtn = area.querySelector('#btn-sf-set-session');
                const clearBtn = area.querySelector('#btn-sf-clear-session');
                const valInput = area.querySelector('#sf-auto-sync-custom-val');

                setBtn.onclick = (e) => {
                    e.stopPropagation();
                    const raw = valInput.value.toLowerCase().trim();
                    let ms = 0;
                    if (raw.endsWith('m')) ms = parseFloat(raw) * 60 * 1000;
                    else if (raw.endsWith('h')) ms = parseFloat(raw) * 60 * 60 * 1000;
                    else ms = parseFloat(raw) * 60 * 60 * 1000; // default to hours

                    if (ms > 0) {
                        lSettings.autoSyncSessionExpiry = Date.now() + ms;
                        saveData(true);
                        updateExpiryUI();
                        setBtn.classList.add('flash-confirm');
                        setTimeout(() => setBtn.classList.remove('flash-confirm'), 500);
                    }
                };

                clearBtn.onclick = (e) => {
                    e.stopPropagation();
                    lSettings.autoSyncSessionExpiry = 0;
                    saveData(true);
                    updateExpiryUI();
                    valInput.value = '';
                };
            }
        }

        function updateExpiryUI() {
            const label = document.getElementById('sf-auto-sync-timer-label');
            if (!label) return;
            const expiry = lSettings.autoSyncSessionExpiry || 0;
            if (expiry > Date.now()) {
                const diff = expiry - Date.now();
                const hrs = Math.floor(diff / (1000 * 60 * 60));
                const mins = Math.round((diff % (1000 * 60 * 60)) / (1000 * 60));
                label.innerText = `Active for ${hrs}h ${mins}m`;
            } else {
                label.innerText = "Reset on Refresh";
            }
        }

        function showSessionDurationModal() {
            return new Promise((resolve) => {
                const modalId = 'sdm-' + Date.now();
                const presets = [
                    { label: '5m',  ms: 5  * 60 * 1000 },
                    { label: '15m', ms: 15 * 60 * 1000 },
                    { label: '30m', ms: 30 * 60 * 1000 },
                    { label: '1h',  ms: 60 * 60 * 1000 },
                    { label: '2h',  ms: 2  * 60 * 60 * 1000 },
                ];
                document.body.insertAdjacentHTML('beforeend', `
                    <div id="${modalId}" style="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;">
                        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:20px;width:280px;box-shadow:0 12px 40px rgba(0,0,0,0.3);display:flex;flex-direction:column;gap:12px;">
                            <div style="text-align:center;">
                                <div style="font-size:22px;margin-bottom:4px;">⏱</div>
                                <div style="font-size:14px;font-weight:800;color:var(--text-main);">Stay Active After Refresh?</div>
                                <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Auto Sync จะ reset เมื่อ refresh ถ้าไม่ตั้งเวลา</div>
                            </div>
                            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">
                                ${presets.map(p => `<button data-ms="${p.ms}" class="sdm-preset" style="padding:6px 12px;border-radius:8px;border:1.5px solid var(--border-color);background:var(--bg-body);color:var(--text-main);font-size:12px;font-weight:700;cursor:pointer;transition:background 0.15s,color 0.15s,border-color 0.15s;">${p.label}</button>`).join('')}
                            </div>
                            <div style="display:flex;gap:6px;align-items:center;">
                                <input id="sdm-custom-input" type="text" placeholder="30m or 1.5h" style="flex:1;height:30px;padding:0 10px;font-size:12px;font-weight:700;border-radius:6px;border:1.5px solid var(--border-color);background:var(--bg-body);color:var(--text-main);outline:none;box-sizing:border-box;">
                                <button id="sdm-custom-set" style="height:30px;padding:0 12px;font-size:11px;font-weight:800;border-radius:6px;border:none;background:var(--primary-color);color:#fff;cursor:pointer;">Set</button>
                            </div>
                            <button id="sdm-skip" style="width:100%;padding:8px;border-radius:8px;border:1px dashed var(--border-color);background:transparent;color:var(--text-muted);font-size:11px;font-weight:700;cursor:pointer;">ข้ามไปก่อน (Reset on Refresh)</button>
                        </div>
                    </div>
                `);
                const modal = document.getElementById(modalId);
                const finish = (ms) => { modal.remove(); resolve(ms); };

                modal.querySelectorAll('.sdm-preset').forEach(btn => {
                    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--primary-color)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--primary-color)'; });
                    btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--bg-body)'; btn.style.color = 'var(--text-main)'; btn.style.borderColor = 'var(--border-color)'; });
                    btn.addEventListener('click', () => finish(parseInt(btn.dataset.ms)));
                });

                document.getElementById('sdm-custom-set').addEventListener('click', () => {
                    const raw = (document.getElementById('sdm-custom-input').value || '').toLowerCase().trim();
                    let ms = 0;
                    if (raw.endsWith('m'))      ms = parseFloat(raw) * 60 * 1000;
                    else if (raw.endsWith('h')) ms = parseFloat(raw) * 60 * 60 * 1000;
                    else if (parseFloat(raw) > 0) ms = parseFloat(raw) * 60 * 60 * 1000;
                    if (ms > 0) finish(ms);
                });

                document.getElementById('sdm-skip').addEventListener('click', () => finish(0));
                modal.addEventListener('click', (e) => { if (e.target === modal) finish(0); });
            });
        }

        const muteReminderWrapper = document.getElementById('wrapper-mute-reminder');
        const muteReminderChk = document.getElementById('chk-mute-sync-reminder');
        const updateReminderUI = () => {
            if (!muteReminderWrapper || !muteReminderChk) return;
            if (!lSettings.firebaseAutoSync) {
                muteReminderWrapper.style.display = 'flex';
                muteReminderChk.checked = sessionReminderActive;
            } else {
                muteReminderWrapper.style.display = 'none';
            }
        };

        if (autoSyncChk) {
            autoSyncChk.checked = !!lSettings.firebaseAutoSync;
            autoSyncChk.onchange = async () => {
                if (autoSyncChk.checked) {
                    isActivatingAutoSync = true;
                    const success = await handleAutoSyncActivation();
                    isActivatingAutoSync = false;
                    
                    if (success) {
                        lSettings.firebaseAutoSync = true;

                        // ⏱ Ask user for session duration (Stay Active After Refresh)
                        const sessionMs = await showSessionDurationModal();
                        if (sessionMs > 0) {
                            lSettings.autoSyncSessionExpiry = Date.now() + sessionMs;
                            updateExpiryUI();
                        }

                        // 🟢 FIX #5: Activate scoped listeners
                        await subscribeToMetadata();
                        await subscribeToSpace(getCurrentSpaceId());
                        
                        // 💾 Auto Export: เซฟลง laptop ทันทีทุกครั้งที่เปิด Auto Sync สำเร็จ
                        if (appSettings.autoExportEnabled) {
                            document.getElementById('btn-manual-export')?.click();
                        }
                    } else {
                        autoSyncChk.checked = false;
                        lSettings.firebaseAutoSync = false;
                    }
                } else {
                    lSettings.firebaseAutoSync = false;
                    
                    // 🟢 FIX #5: Unsubscribe from all listeners when disabled
                    await cleanupFirebaseSync();
                }
                saveData(true);
                updateSyncStatusUI(); 
                updateReminderUI();
            };
        }

        if (muteReminderChk) {
            muteReminderChk.onchange = (e) => {
                e.stopPropagation();
                sessionReminderActive = muteReminderChk.checked;
                const status = sessionReminderActive ? "เปิด" : "ปิด";
                if (typeof window.showToast === 'function') window.showToast(`${status}การเตือนความจำสำหรับรอบนี้แล้วครับ`);
            };
        }

        updateReminderUI(); // Initial Check

        document.getElementById('btn-firebase-push')?.addEventListener('click', () => { forcePushNote(); if(syncPopup) syncPopup.style.display = 'none'; });
        document.getElementById('btn-firebase-pull')?.addEventListener('click', () => { forcePullNote(); if(syncPopup) syncPopup.style.display = 'none'; });

        document.getElementById('btn-force-push')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const scope = document.getElementById('force-sync-scope')?.value || 'current';
            const scopeLabel = scope === 'all' ? 'ทุก Space' : 'Space นี้';
            const confirmed = confirm(`⚠️ Force Push — เขียนข้อมูลจากเครื่องนี้ทับ Cloud (${scopeLabel})\n\nข้อมูลบน Cloud จะถูกแทนที่ทั้งหมด ดำเนินการต่อ?`);
            if (!confirmed) return;
            if (syncPopup) syncPopup.style.display = 'none';
            await forcePushToCloud(scope);
        });

        document.getElementById('btn-force-pull')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const scope = document.getElementById('force-sync-scope')?.value || 'current';
            const scopeLabel = scope === 'all' ? 'ทุก Space' : 'Space นี้';
            const confirmed = confirm(`⚠️ Force Pull — ดึงข้อมูลจาก Cloud มาทับเครื่องนี้ (${scopeLabel})\n\nข้อมูลใน Local จะถูกแทนที่ทั้งหมด ดำเนินการต่อ?`);
            if (!confirmed) return;
            if (syncPopup) syncPopup.style.display = 'none';
            await forcePullFromCloud(scope);
        });

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

        // Keep vault sync container in topbar-nav-group on mobile,
        // and restore its original desktop position before utility-group.
        const repositionTopbarVaultSyncByViewport = () => {
            const syncContainer = document.getElementById('drive-sync-container');
            const topbar   = document.querySelector('.topbar');
            const navGroup = document.querySelector('.topbar-nav-group');
            const divider  = navGroup?.querySelector('.topbar-divider');
            if (!syncContainer || !topbar || !utilityGroup || !navGroup) return;

            if (window.matchMedia('(max-width: 1100px)').matches) {
                if (syncContainer.parentElement !== navGroup) {
                    navGroup.insertBefore(syncContainer, divider || null);
                }
                return;
            }

            // Desktop: always keep vault sync container right before utility-group.
            if (syncContainer.parentElement !== topbar || syncContainer.nextElementSibling !== utilityGroup) {
                topbar.insertBefore(syncContainer, utilityGroup);
            }
        };
        repositionTopbarVaultSyncByViewport();
        window.addEventListener('resize', repositionTopbarVaultSyncByViewport);

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
        const btnManualExport = document.getElementById('btn-manual-export');
        const btnImportData = document.getElementById('btn-import-data');
        const fileImportInput = document.getElementById('file-import-data');
        const btnPickFolder = document.getElementById('btn-pick-export-folder');
        const folderNameLabel = document.getElementById('export-folder-name');
        const intervalSel = document.getElementById('auto-export-interval');

        // ── IndexedDB handle storage (survives page reload) ────────────────
        const FS_DB = 'myworkona-fs', FS_STORE = 'handles';
        async function _openFsDb() {
            return new Promise((res, rej) => {
                const r = indexedDB.open(FS_DB, 1);
                r.onupgradeneeded = e => e.target.result.createObjectStore(FS_STORE);
                r.onsuccess = e => res(e.target.result);
                r.onerror = rej;
            });
        }
        async function saveFolderHandle(h) {
            const db = await _openFsDb();
            return new Promise((res, rej) => {
                const tx = db.transaction(FS_STORE, 'readwrite');
                tx.objectStore(FS_STORE).put(h, 'exportFolder');
                tx.oncomplete = res; tx.onerror = rej;
            });
        }
        async function loadFolderHandle() {
            const db = await _openFsDb();
            return new Promise((res, rej) => {
                const tx = db.transaction(FS_STORE, 'readonly');
                const r = tx.objectStore(FS_STORE).get('exportFolder');
                r.onsuccess = () => res(r.result || null); r.onerror = rej;
            });
        }

        // Restore handle name label on load
        let _folderHandle = null;
        loadFolderHandle().then(h => {
            if (h) { _folderHandle = h; if (folderNameLabel) folderNameLabel.textContent = h.name; }
        }).catch(() => {});

        // Pick folder button
        btnPickFolder?.addEventListener('click', async () => {
            try {
                const h = await window.showDirectoryPicker({ mode: 'readwrite' });
                _folderHandle = h;
                await saveFolderHandle(h);
                if (folderNameLabel) folderNameLabel.textContent = h.name;
                if (typeof window.showToast === 'function') window.showToast(`Local folder set: ${h.name}`);
            } catch (e) {
                if (e.name !== 'AbortError') console.error('[Export] showDirectoryPicker:', e);
            }
        });

        window.updateExportUI = () => {
            if (btnManualExport) btnManualExport.innerHTML = "💻 Export Now";
        };

        if (subfolderInput) subfolderInput.value = appSettings.exportSubfolder || "MyBackups";
        if (intervalSel && appSettings.autoExportIntervalMin != null)
            intervalSel.value = String(appSettings.autoExportIntervalMin);

        const saveDataManagementSettings = () => {
            appSettings.exportSubfolder = subfolderInput?.value.trim() || "MyBackups";
            appSettings.autoExportIntervalMin = parseInt(intervalSel?.value || '0', 10);
            appSettings.exportTarget = "computer";
            saveData(true);
            _restartAutoExportTimer();
        };

        if (subfolderInput) subfolderInput.addEventListener('change', saveDataManagementSettings);
        if (intervalSel) intervalSel.addEventListener('change', saveDataManagementSettings);

        window.updateExportUI();

        // ── Silent export via File System Access API ───────────────────────
        async function _silentWriteToFolder(handle, filename, content) {
            const perm = await handle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                await handle.requestPermission({ mode: 'readwrite' });
            }
            const fh = await handle.getFileHandle(filename, { create: true });
            const wr = await fh.createWritable();
            await wr.write(content); await wr.close();
        }

        // ── Core export function (silent if folder handle available) ───────
        window.performSilentExport = async (allData) => {
            const content = JSON.stringify(allData, null, 2);
            const d = new Date();
            const ts = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}`;
            const filename = `myworkona_backup_${ts}.json`;

            if (_folderHandle) {
                try {
                    await _silentWriteToFolder(_folderHandle, filename, content);
                    getAppSettings().lastExportTimestamp = Date.now();
                    saveData();
                    if (typeof window.showToast === 'function') window.showToast('✓ Auto-exported to local folder');
                    return;
                } catch (err) {
                    console.warn('[Export] Silent write failed, falling back to download:', err);
                }
            }
            // Fallback: browser download
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const settings = getAppSettings();
            const folder = (settings.exportSubfolder || 'MyBackups').trim();
            const dlFilename = `${folder}/myworkona_backup_${ts}.json`;
            if (typeof chrome !== 'undefined' && chrome.downloads) {
                chrome.downloads.download({ url, filename: dlFilename }, () => {
                    settings.lastExportTimestamp = Date.now(); saveData(); URL.revokeObjectURL(url);
                });
            } else {
                const a = document.createElement('a');
                a.href = url; a.download = filename; a.click();
                settings.lastExportTimestamp = Date.now(); saveData();
                setTimeout(() => URL.revokeObjectURL(url), 100);
            }
        };

        function _getExportData() {
            return new Promise(res => {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(null, res);
                } else {
                    const data = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        try { data[key] = JSON.parse(localStorage.getItem(key)); } catch(e) { data[key] = localStorage.getItem(key); }
                    }
                    res(data);
                }
            });
        }

        btnManualExport?.addEventListener('click', async () => {
            const data = await _getExportData();
            await window.performSilentExport(data);
        });

        // ── Auto export timer ──────────────────────────────────────────────
        let _autoExportTimer = null;
        function _restartAutoExportTimer() {
            if (_autoExportTimer) { clearInterval(_autoExportTimer); _autoExportTimer = null; }
            const mins = appSettings.autoExportIntervalMin || 0;
            if (mins <= 0) return;
            _autoExportTimer = setInterval(async () => {
                const data = await _getExportData();
                await window.performSilentExport(data);
            }, mins * 60 * 1000);
            console.log(`[Export] Auto-export every ${mins} min`);
        }
        _restartAutoExportTimer(); // kick off on load

        btnImportData?.addEventListener('click', () => fileImportInput?.click());

        fileImportInput?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = ''; // Reset input so the same file can be re-selected if needed

            // --- Step 1: Parse & Validate ---
            let data;
            try {
                data = JSON.parse(await file.text());
            } catch {
                alert('Invalid backup file: not valid JSON.');
                return;
            }
            if (!Array.isArray(data.mySpacesData) || data.mySpacesData.length === 0) {
                alert('Invalid backup file: no space data found.');
                return;
            }

            if (!confirm(`Restore backup? (${data.mySpacesData.length} space(s) found)\n\nThis will REPLACE ALL current data and reload the app.`)) return;

            // --- Step 2: Build clean restore payload ---
            // Hard reset: clear() + set() = 100% replacement, no merge/timestamp logic
            // Strip stale snapshot keys; force Auto Sync OFF to prevent Firebase overwrite on reload
            const restore = {};
            for (const [k, v] of Object.entries(data)) {
                if (!k.startsWith('snapshot-space-')) restore[k] = v;
            }
            restore['myLocalDeviceSettings'] = { firebaseAutoSync: false, autoSyncSessionExpiry: 0 };

            // --- Step 3: Lock UI to prevent double-click during async write ---
            if (btnImportData) { btnImportData.disabled = true; btnImportData.textContent = 'Importing…'; }

            // --- Step 4: Write to storage & reload ---
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    // MV3 native Promise API — errors throw as exceptions (no lastError needed)
                    await chrome.storage.local.clear();
                    await chrome.storage.local.set(restore);
                    // 🛡️ localStorage flag: not cleared by chrome.storage.local.clear(), survives reload
                    localStorage.setItem('myws-just-imported', '1');
                    console.log('[IMPORT] ✅ chrome.storage written. Spaces:', restore.mySpacesData?.length, '| autoSync:', restore.myLocalDeviceSettings?.firebaseAutoSync, '| flag:', localStorage.getItem('myws-just-imported'));
                } else {
                    localStorage.clear();
                    for (const [k, v] of Object.entries(restore)) {
                        localStorage.setItem(k, JSON.stringify(v));
                    }
                    // 🛡️ Re-set flag after localStorage.clear()
                    localStorage.setItem('myws-just-imported', '1');
                    console.log('[IMPORT] ✅ localStorage written. Spaces:', restore.mySpacesData?.length, '| autoSync:', restore.myLocalDeviceSettings?.firebaseAutoSync, '| flag:', localStorage.getItem('myws-just-imported'));
                }
                location.reload();
            } catch (err) {
                if (btnImportData) { btnImportData.disabled = false; btnImportData.textContent = 'Import'; }
                const isQuota = err.message && (err.message.includes('QUOTA') || err.message.includes('quota'));
                if (isQuota) {
                    alert('Import failed: backup file exceeds the 10 MB storage limit.\nTo fix: add "unlimitedStorage" to permissions in manifest.json.');
                } else {
                    alert('Import failed — storage error: ' + err.message + '\n\nPlease try again.');
                }
                console.error('[IMPORT ERROR]', err);
            }
        });

        // 🌙 อัปเดตตัวแปร Global เมื่อมีการสลับ Dark Mode
        document.getElementById('btn-toggle-darkmode')?.addEventListener('click', () => {
            setTimeout(() => {
                window.isDarkMode = !!getAppSettings().isDarkMode;
            }, 100);
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

                // 🟢 3. ส่วนของ Custom Tags (ดึงจาก Space และ Items) - Phase 5: Filter deleted items
                const allTagsSet = new Set(space.tags || []);
                filterVisibleItems(space.tasks).forEach(task => {
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

// ========== 🧹 CLEANUP ON APP CLOSE ==========

/**
 * 🟢 Cleanup all Firebase listeners when tab closes
 * Prevents listener leaks and ensures final data save
 */
window.addEventListener('beforeunload', async () => {
    console.log('👋 App closing, cleaning up...');
    await cleanupFirebaseSync();
});
