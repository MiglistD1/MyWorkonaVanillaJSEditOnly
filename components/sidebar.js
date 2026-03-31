import Sortable from '../sortable.esm.js';
import { getSpaces, getCurrentSpaceId, setCurrentSpaceId, saveData, setSpaces, getAppSettings } from '../core/storage.js';
import { getScheduleRemainingTime } from '../features/scheduleMode.js';
import { svgCustomize, svgShare, svgArchive, svgUnarchive, svgTrashRed, dragHandleSvg, svgRestore, svgPin } from '../core/icons.js';
import { getTrashCountdownText } from '../core/ui-helpers.js';

// Callbacks to the main dashboard.js
let onSpaceChangeCallback = () => {};

// Module-level state
let editingSpaceId = null;
let sidebarSortables = [];
let sortTimeout = null;

/**
 * Synchronizes the spaces array with the current DOM order in the sidebar.
 * Also updates folder property and archive status based on DOM location.
 */
function handleSidebarSort() {
    if (sortTimeout) clearTimeout(sortTimeout);
    sortTimeout = setTimeout(() => {
        const allSpaces = getSpaces();
        const newOrderedSpaces = [];
        
        // Scan every space item across the entire sidebar (Active folders + Archive)
        const domItems = document.querySelectorAll('#spacebar .space-item');
        domItems.forEach(el => {
            const id = parseInt(el.dataset.id);
            const space = allSpaces.find(s => s.id === id);
            if (space) {
                // Update Folder assignment based on the wrapper it landed in
                const group = el.closest('.folder-group');
                if (group && group.dataset.folder) {
                    const fName = group.dataset.folder;
                    space.folder = (fName === 'General') ? null : fName;
                } else {
                    space.folder = null;
                }
                // อัปเดตสถานะ Archive และ Deleted ตามคอนเทนเนอร์ที่ไปวาง
                space.isArchived = !!el.closest('#archived-spaces-container');
                const isNowDeleted = !!el.closest('#trash-spaces-container');
                if (isNowDeleted && !space.isDeleted) {
                    space.deletedAt = Date.now();
                    const days = getAppSettings().autoDeleteDays || 30;
                    space.expiryAt = space.deletedAt + (days * 24 * 60 * 60 * 1000);
                }
                space.isDeleted = isNowDeleted;
                
                newOrderedSpaces.push(space);
            }
        });

        // Safety: ensure any spaces missed by DOM scan (if any) are preserved
        allSpaces.forEach(s => {
            if (!newOrderedSpaces.some(ns => ns.id === s.id)) newOrderedSpaces.push(s);
        });

        setSpaces(newOrderedSpaces);
        saveData();
        // สั่งวาดใหม่หลังจากเซฟ เพื่อให้ลำดับในข้อมูลตรงกับหน้าจอ 100%
        renderSidebar();
    }, 50);
}

// SVG icons
const svgMenu = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7;"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;

/**
 * Initializes the sidebar component with callbacks from the main script.
 * @param {{onSpaceChange: (spaceId: number, isNew: boolean) => void}} callbacks
 */
export function initSidebar(callbacks) {
    onSpaceChangeCallback = callbacks.onSpaceChange;
    window.refreshSidebarIcon = refreshSidebarIcon; 

    const btnAddFolder = document.getElementById('btn-add-folder');
    if (btnAddFolder) {
        btnAddFolder.onclick = () => showFolderEditModal(null); // Passing null means create mode
    }

    const btnCollapseAll = document.getElementById('btn-collapse-all-folders');
    if (btnCollapseAll) {
        btnCollapseAll.onclick = () => {
            const settings = getAppSettings();
            const allSpaces = getSpaces();
            const spaces = allSpaces.filter(s => !s.isDeleted);
            const allFolders = new Set(['General']);
            spaces.forEach(s => { if (s.folder) allFolders.add(s.folder); });
            
            const locked = settings.lockedFolders || [];
            const currentSpace = allSpaces.find(s => s.id === getCurrentSpaceId());
            const activeFolder = currentSpace ? (currentSpace.folder || 'General') : null;
            // พับทุกโฟลเดอร์ในรายการ ยกเว้นอันที่ถูกล็อคไว้ และโฟลเดอร์ที่มี Space ที่กำลังใช้งานอยู่
            settings.collapsedFolders = Array.from(allFolders).filter(f => !locked.includes(f) && f !== activeFolder);
            saveData();
            renderSidebar();
        };
    }

    const btnExpandAll = document.getElementById('btn-expand-all-folders');
    if (btnExpandAll) {
        btnExpandAll.onclick = () => {
            const settings = getAppSettings();
            settings.collapsedFolders = []; // ล้างรายการโฟลเดอร์ที่พับอยู่ทั้งหมด
            saveData();
            renderSidebar();
        };
    }

    const btnReorder = document.getElementById('btn-reorder-folders');
    if (btnReorder) {
        btnReorder.onclick = () => showFolderReorderModal();
    }

    const btnEmptyTrash = document.getElementById('btn-empty-trash');
    if (btnEmptyTrash) {
        btnEmptyTrash.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm("Permanently delete all items in trash? This cannot be undone.")) {
                setSpaces(getSpaces().filter(s => !s.isDeleted));
                saveData();
                renderSidebar();
            }
        };
    }
}

function toggleFolder(folderName) {
    const settings = getAppSettings();
    
    if (settings.lockedFolders && settings.lockedFolders.includes(folderName)) {
        return;
    }

    if (!settings.collapsedFolders) settings.collapsedFolders = [];
    
    const idx = settings.collapsedFolders.indexOf(folderName);
    if (idx > -1) {
        settings.collapsedFolders.splice(idx, 1);
    } else {
        settings.collapsedFolders.push(folderName);
    }
    saveData();
    renderSidebar();
}


// --- Status Logic ---

function getCombinedStatus(space) {
    // 1. Priority: Focus Timer
    if (space.focusTimer) {
        if (space.focusTimer.mode === 'running') {
            const timeLeft = space.focusTimer.timeLeft || 0;
            const h = Math.floor(timeLeft / 3600);
            const m = Math.floor((timeLeft % 3600) / 60);
            const s = timeLeft % 60;
            const timeText = `${h > 0 ? h + ':' : ''}${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
            return { 
                active: true, type: 'focus', isLocked: false, timeText: timeText,
                color: '#10b981', bg: '#ecfdf5', border: '#10b981', 
                icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`
            };
        } else if (space.focusTimer.mode === 'paused') {
            return { 
                active: true, type: 'focus-paused', isLocked: true, timeText: 'PAUSED',
                color: '#f59e0b', bg: '#fffbeb', border: '#f59e0b',
                icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
            };
        }
    }

    // 2. Priority: Schedule Mode
    if (space.schedule && space.schedule.active) {
        const scheduleTime = getScheduleRemainingTime(space);
        if (scheduleTime) {
            if (scheduleTime.isLocked) {
                return {
                    active: true, type: 'schedule-locked', isLocked: true, timeText: scheduleTime.text,
                    color: '#991b1b', bg: '#fef2f2', border: '#ef4444',
                    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
                };
            } else { // is not locked, so it's active
                return {
                    active: true, type: 'schedule-active', isLocked: false,
                    timeText: scheduleTime.text,
                    color: '#15803d', bg: '#f0fdf4', border: '#22c55e',
                    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`
                };
            }
        }
    }
    return { active: false };
}

function updateSpaceItemUI(div, space) {
    const status = getCombinedStatus(space);
    
    // Select elements
    const statusIcon = div.querySelector('.status-indicator');
    const statusTimer = div.querySelector('.status-timer');
    const nameSpan = div.querySelector('.space-name-text');
    const iconWrapper = div.querySelector('.space-icon-wrapper');

    if (status.active) {
        // Apply Styles
        div.style.backgroundColor = status.bg;
        div.style.borderLeft = `4px solid ${status.border}`;
        div.style.borderBottom = `1px solid ${status.bg}`; // blend bottom border

        // Apply Text Color
        if (nameSpan) nameSpan.style.color = status.color;
        if (nameSpan) nameSpan.style.fontWeight = '700';
        
        // Apply Icon Color
        if (iconWrapper) iconWrapper.style.color = status.color;

        // Apply Icon
        if (statusIcon) {
            statusIcon.style.display = 'inline-flex';
            statusIcon.style.color = status.color;
            statusIcon.innerHTML = status.icon;
        }

        // Apply Timer
        if (statusTimer) {
            statusTimer.style.display = 'inline-block';
            statusTimer.innerText = status.timeText;
            statusTimer.style.color = status.color;
        }
    } else {
        // Reset Styles
        div.style.backgroundColor = '';
        div.style.borderLeft = '4px solid transparent';
        div.style.borderBottom = '';

        if (nameSpan) nameSpan.style.color = 'inherit';
        // By removing the inline style, the font-weight will be correctly
        // determined by the CSS classes '.space-item' (font-weight: 500) or
        // '.space-item.active' (font-weight: 700).
        if (nameSpan) nameSpan.style.fontWeight = '';
        
        if (iconWrapper) iconWrapper.style.color = 'inherit';

        if (statusIcon) statusIcon.style.display = 'none';
        if (statusTimer) statusTimer.style.display = 'none';
    }
}

export function renderSidebar() {
    const spaceListUI = document.getElementById('space-list');
    const archivedListUI = document.getElementById('archived-space-list');
    const archivedContainer = document.getElementById('archived-spaces-container');
    const trashListUI = document.getElementById('trash-space-list');
    const trashContainer = document.getElementById('trash-spaces-container');

    if (!spaceListUI || !archivedListUI || !archivedContainer || !trashListUI || !trashContainer) return;

    // ป้องกันการวาดทับขณะกำลังลาก (แก้ปัญหาเด้งกลับและ Error removeEventListener)
    if (Sortable && Sortable.active) return;

    sidebarSortables.forEach(s => s.destroy());
    sidebarSortables = [];

    spaceListUI.innerHTML = '';
    archivedListUI.innerHTML = '';
    trashListUI.innerHTML = '';

    const allSpaces = getSpaces();
    const activeAndArchived = allSpaces.filter(s => !s.isDeleted);
    const archivedSpaces = activeAndArchived.filter(s => s.isArchived);
    const deletedSpaces = allSpaces.filter(s => s.isDeleted);

    archivedContainer.style.display = archivedSpaces.length > 0 ? 'block' : 'none';
    trashContainer.style.display = deletedSpaces.length > 0 ? 'block' : 'none';

    const createSpaceElement = (space) => {
        const div = document.createElement('div');
        div.dataset.id = space.id;
        const status = getCombinedStatus(space);
        const isWorking = status.active && !status.isLocked; // 🟢 ทามเมอร์กำลังเดิน หรืออยู่ในเวลาทำงาน
        const pinnedClass = space.isPinned ? 'is-pinned' : '';
        div.className = `space-item ${space.id === getCurrentSpaceId() ? 'active' : ''} ${status.isLocked ? 'locked-space' : ''} ${pinnedClass} ${isWorking ? 'is-working' : ''}`;
        
        let iconVal = space.icon || "📁";
        let iconHTML;
        if (iconVal.startsWith('http') || iconVal.startsWith('data:image')) {
            iconHTML = `<img src="${iconVal}" style="width:14px; height:14px; margin-right:6px; border-radius:3px; object-fit:cover; display:inline-block; vertical-align:middle;">`;
        } else {
            iconHTML = `<span style="margin-right:6px; font-size:12px;">${iconVal}</span>`;
        }

        // Create structure with placeholders for status
        const countdown = space.isDeleted ? getTrashCountdownText(space, getAppSettings().autoDeleteDays) : "";
        const countdownHTML = space.isDeleted ? `<span style="color:#dc2626; font-size:10px; font-weight:700; margin-left:auto; margin-right:8px;">${countdown}</span>` : "";

        div.innerHTML = `
            <div class="space-info" style="display:flex; align-items:center; flex:1; overflow:hidden; cursor:pointer; min-height: 24px;">
                <div class="space-icon-wrapper" style="flex-shrink:0; display:flex; align-items:center;">
                    ${iconHTML}
                    <span class="status-indicator" style="margin-right:8px; display:none; align-items:center;"></span>
                </div>
                <span class="space-name-text" style="flex:1; line-height:1.4;">
                    ${space.name}
                </span>
                ${countdownHTML}
                <span class="status-timer" style="display:none; margin-left:auto; margin-right:4px; font-size:11px; font-weight:600; background:rgba(255,255,255,0.7); padding:1px 6px; border-radius:4px; min-width:48px; text-align:center; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"></span>
            </div>
            <div class="space-actions" style="position:relative;">
                <button class="btn-icon more-btn" style="padding:4px; border-radius:4px; transition:background 0.2s;">${svgMenu}</button>
            </div>
        `;

        // Apply initial status
        updateSpaceItemUI(div, space);

        // All spaces are clickable to switch
        div.addEventListener('click', (e) => {
            // Prevent click on action buttons from triggering space change
            if (e.target.closest('.more-btn')) return;
            onSpaceChangeCallback(space.id, false);
        });

        if (space.isArchived) {
            div.style.opacity = '0.6';
        }
        if (space.isDeleted) {
            div.style.opacity = '0.5';
            div.querySelector('.space-name-text').style.textDecoration = 'line-through';
        }

        // Open Floating Context Menu
        const moreBtn = div.querySelector('.more-btn');
        moreBtn.addEventListener('click', (e) => {
            showSpaceContextMenu(e, space, moreBtn);
        });
        return div;
    };

    // Group active spaces while maintaining the order they appear in the master array
    const activeSpaces = activeAndArchived.filter(s => !s.isArchived);
    const settings = getAppSettings();
    const groups = { 'General': [] };
    const allFolderNames = new Set(['General']);

    // รวบรวมชื่อโฟลเดอร์ทั้งหมดที่มีอยู่
    if (settings.folderIcons) Object.keys(settings.folderIcons).forEach(f => allFolderNames.add(f));
    if (settings.folderThemes) Object.keys(settings.folderThemes).forEach(f => allFolderNames.add(f));
    activeSpaces.forEach(s => {
        const folder = s.folder || 'General';
        allFolderNames.add(folder);
    });

    // เตรียมกลุ่มข้อมูล
    allFolderNames.forEach(f => { if(!groups[f]) groups[f] = []; });
    activeSpaces.forEach(s => {
        const folder = s.folder || 'General';
        groups[folder].push(s);
    });

    // จัดลำดับโฟลเดอร์ตาม settings.folderOrder
    const customOrder = settings.folderOrder || [];
    const orderedCustom = customOrder.filter(f => f !== 'General' && allFolderNames.has(f));
    const remaining = Array.from(allFolderNames).filter(f => f !== 'General' && !orderedCustom.includes(f)).sort();
    const folderOrder = ['General', ...orderedCustom, ...remaining];

    const collapsedFolders = settings.collapsedFolders || [];

    folderOrder.forEach(folderName => {
        const isCollapsed = settings.collapsedFolders?.includes(folderName);

        const isLocked = settings.lockedFolders?.includes(folderName);
        
        const folderWrapper = document.createElement('div');
        const isGeneral = folderName === 'General';
        folderWrapper.className = 'folder-group' + (isGeneral ? ' static-folder' : '');
        folderWrapper.classList.add(isCollapsed ? 'folder-collapsed' : 'folder-expanded');
        folderWrapper.dataset.folder = folderName;

        const fIcon = (settings.folderIcons && settings.folderIcons[folderName]) ? settings.folderIcons[folderName] : "📁";
        const fTheme = (settings.folderThemes && settings.folderThemes[folderName]) ? settings.folderThemes[folderName] : { color: '', fontSize: '' };

        let fIconHTML;
        if (fIcon.startsWith('http') || fIcon.startsWith('data:image')) {
            fIconHTML = `<img src="${fIcon}" class="folder-icon-img" style="width:14px; height:14px; margin-right:4px; border-radius:3px; object-fit:cover;">`;
        } else {
            fIconHTML = `<span class="folder-icon-emoji" style="margin-right:4px; font-size:14px;">${fIcon}</span>`;
        }

        const header = document.createElement('div');
        header.className = 'folder-header';
        if (fTheme.color) header.style.color = fTheme.color;
        if (fTheme.fontSize) header.style.fontSize = fTheme.fontSize + 'px';

        header.innerHTML = `
            <div class="folder-header-main" style="display:flex; align-items:center; gap:6px; flex:1; overflow:hidden;">
                <svg class="svg-icon-sm folder-chevron" style="transform: ${isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)'};">
                    <use href="#icon-chevron-right"></use>
                </svg>
                ${fIconHTML}
                <span class="folder-name-text" style="overflow:hidden; text-overflow:ellipsis;">${folderName}</span>
            </div>
            <div class="folder-actions" style="display:none; gap:4px;">
                <button class="btn-icon add-space-to-folder-btn" title="Add Space to this Folder" style="padding:4px; font-size:18px;">+</button>
                <button class="btn-icon lock-folder-btn ${isLocked ? 'active-lock' : ''}" title="Lock/Unlock Expansion" style="padding:4px;"><svg class="svg-icon-sm" style="margin:0;"><use href="#icon-lock-minimal"></use></svg></button>
                <button class="btn-icon edit-folder-props-btn" title="Edit Folder Settings" style="padding:4px;"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin:0;"><circle cx="12" cy="12" r="9"></circle></svg></button>
            </div>
        `;

        // Toggle Collapse when clicking main part
        header.querySelector('.folder-header-main').onclick = (e) => {
            e.stopPropagation();
            toggleFolder(folderName);
        };

        // Add Space to Folder Logic
        const addSpaceBtn = header.querySelector('.add-space-to-folder-btn');
        if (addSpaceBtn) {
            addSpaceBtn.onclick = (e) => {
                e.stopPropagation();
                window.openCustomizeSpaceModal(null, folderName); // Pass folderName to pre-fill
            };
        }

        // Lock Folder Logic
        const lockBtn = header.querySelector('.lock-folder-btn');
        if (lockBtn) {
            lockBtn.onclick = (e) => {
                e.stopPropagation();
                if (!settings.lockedFolders) settings.lockedFolders = [];
                const idx = settings.lockedFolders.indexOf(folderName);
                if (idx > -1) {
                    settings.lockedFolders.splice(idx, 1);
                } else {
                    settings.lockedFolders.push(folderName);
                    // 🟢 เมื่อ Lock ให้ทำการกางโฟลเดอร์ออกทันที (ถ้ามันพับอยู่)
                    if (settings.collapsedFolders) {
                        const cIdx = settings.collapsedFolders.indexOf(folderName);
                        if (cIdx > -1) settings.collapsedFolders.splice(cIdx, 1);
                    }
                }
                saveData();
                renderSidebar();
            };
        }

        // New Unified Edit Modal Trigger
        const editBtn = header.querySelector('.edit-folder-props-btn');
        if (editBtn) {
            editBtn.onclick = (e) => {
                e.stopPropagation();
                showFolderEditModal(folderName);
            };
        }

        folderWrapper.appendChild(header);

        const content = document.createElement('div');
        content.className = `folder-content ${isCollapsed ? 'is-collapsed' : ''}`;
        content.dataset.folder = folderName;
        
        groups[folderName].forEach(space => {
            content.appendChild(createSpaceElement(space));
        });
        
        folderWrapper.appendChild(content);
        spaceListUI.appendChild(folderWrapper);

        // Nested Sortable: Allow reordering spaces within and between folders
        sidebarSortables.push(Sortable.create(content, {
            group: 'sidebar-spaces',
            animation: 150,
            delay: 100, // ป้องกันการเริ่มลากทันทีเมื่อกดปุ่ม Lock
            fallbackOnBody: true,
            swapThreshold: 0.65,
            draggable: '.space-item',
            onEnd: handleSidebarSort
        }));
    });

    archivedSpaces.forEach(space => {
        archivedListUI.appendChild(createSpaceElement(space));
    });

    deletedSpaces.forEach(space => {
        trashListUI.appendChild(createSpaceElement(space));
    });

    // Archive Sortable: จัดลำดับในคลังเก็บ และลากกลับไปโฟลเดอร์เพื่อ Unarchive
    sidebarSortables.push(Sortable.create(archivedListUI, {
        group: 'sidebar-spaces',
        animation: 150,
        draggable: '.space-item',
        onEnd: handleSidebarSort
    }));

    // Trash Sortable: จัดลำดับในถังขยะ และลากกลับไปโฟลเดอร์เพื่อ Restore
    sidebarSortables.push(Sortable.create(trashListUI, {
        group: 'sidebar-spaces',
        animation: 150,
        draggable: '.space-item',
        onEnd: handleSidebarSort
    }));
}

function closeContextMenu() {
    const existing = document.getElementById('space-context-menu');
    if (existing) existing.remove();
    document.removeEventListener('click', closeContextMenu);
}

function showSpaceContextMenu(e, space, btn) {
    e.preventDefault();
    e.stopPropagation();
    closeContextMenu();

    const menu = document.createElement('div');
    menu.id = 'space-context-menu';
    menu.className = 'action-popup'; // Use existing class for base styles
    
    // Set base styles for dimension calculation
    menu.style.cssText = `
        position: absolute; /* Must be absolute for getBoundingClientRect to work correctly */
        visibility: hidden; /* Hide until positioned */
        background: var(--bg-card, #fff);
        border: 1px solid var(--border-color, #e1e1e1);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 4px;
        min-width: 140px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
    `;

    const isTrash = space.isDeleted;

    menu.innerHTML = `
        ${!isTrash ? `
            <button class="menu-item" id="ctx-cust-btn" style="display:flex; align-items:center; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:var(--text-main); text-align:left; border-radius:4px;">${svgCustomize} Customize Space</button>
            <button class="menu-item" id="ctx-pin-btn" style="display:flex; align-items:center; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:var(--text-main); text-align:left; border-radius:4px;">${svgPin} ${space.isPinned ? 'Unpin Space' : 'Pin Space'}</button>
            <button class="menu-item" id="ctx-share-btn" style="display:flex; align-items:center; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:var(--text-main); text-align:left; border-radius:4px;">${svgShare} Share Space</button>
            <button class="menu-item" id="ctx-delete-btn" style="display:flex; align-items:center; gap:8px; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:#dc2626; text-align:left; border-radius:4px;">${svgTrashRed} Move to Trash</button>
            <div style="height:1px; background:var(--border-color); margin: 4px 8px;"></div>
            <button class="menu-item" id="ctx-archive-btn" style="display:flex; align-items:center; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; text-align:left; border-radius:4px;"></button>
        ` : `
            <button class="menu-item" id="ctx-restore-btn" style="display:flex; align-items:center; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:var(--primary-color); text-align:left; border-radius:4px;">
                <span style="margin-right:8px; display:flex;">${svgRestore}</span>
                Restore Space
            </button>
            <button class="menu-item" id="ctx-permanent-delete-btn" style="display:flex; align-items:center; gap:8px; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:#dc2626; text-align:left; border-radius:4px;">${svgTrashRed} Delete Permanently</button>
        `}
    `;

    document.body.appendChild(menu);

    // --- Smart Positioning Logic ---
    const rect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    let top = rect.bottom + window.scrollY;
    // If the menu would go off-screen at the bottom, place it above the button instead
    if (top + menuRect.height > viewportHeight) {
        top = rect.top - menuRect.height + window.scrollY;
    }

    menu.style.top = `${top}px`;

    // 🟢 ป้องกันล้นขอบขวา
    let left = rect.left + window.scrollX;
    if (left + menuRect.width > window.innerWidth) left = window.innerWidth - menuRect.width - 10;
    
    menu.style.left = `${Math.max(10, left)}px`;
    menu.style.visibility = 'visible'; // Show the menu now that it's positioned

    // Hover effects
    menu.querySelectorAll('.menu-item').forEach(b => {
        b.addEventListener('mouseenter', () => b.style.backgroundColor = 'var(--bg-hover, #f1f1ef)');
        b.addEventListener('mouseleave', () => b.style.backgroundColor = 'transparent');
    });

    // Actions
    const custBtn = document.getElementById('ctx-cust-btn');
    if (custBtn) custBtn.onclick = () => { closeContextMenu(); window.openCustomizeSpaceModal(space.id); };
    
    const pinBtn = document.getElementById('ctx-pin-btn');
    if (pinBtn) pinBtn.onclick = () => {
        closeContextMenu();
        space.isPinned = !space.isPinned;
        saveData();
        renderSidebar();
    };

    const shareBtn = document.getElementById('ctx-share-btn');
    if (shareBtn) shareBtn.onclick = () => { closeContextMenu(); const link = `https://myworkona.test/open?spaceId=${space.id}`; prompt('Copy this link:', link); };

    const deleteBtn = document.getElementById('ctx-delete-btn');
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            closeContextMenu();
            const activeSpaces = getSpaces().filter(s => !s.isDeleted);
            if (activeSpaces.length <= 1) return alert("Cannot delete the last space");
            
            if (confirm(`Move space "${space.name}" to trash?`)) {
                space.isDeleted = true;
                space.deletedAt = Date.now();
                const days = getAppSettings().autoDeleteDays || 30;
                space.expiryAt = space.deletedAt + (days * 24 * 60 * 60 * 1000);
                space.isArchived = false; // เคลียร์สถานะคลังเก็บเมื่อลงถังขยะ
                saveData();
                
                if (space.id === getCurrentSpaceId()) {
                    const next = getSpaces().find(s => !s.isDeleted);
                    if (next) onSpaceChangeCallback(next.id, false);
                } else renderSidebar();
            }
        };
    }

    const restoreBtn = document.getElementById('ctx-restore-btn');
    if (restoreBtn) {
        restoreBtn.onclick = () => {
            closeContextMenu();
            space.isDeleted = false;
            saveData();
            renderSidebar();
        };
    }

    const permDeleteBtn = document.getElementById('ctx-permanent-delete-btn');
    if (permDeleteBtn) {
        permDeleteBtn.onclick = () => {
            closeContextMenu();
            if (confirm(`Delete space "${space.name}" permanently? This cannot be undone.`)) {
                setSpaces(getSpaces().filter(s => s.id !== space.id));
                saveData();
                renderSidebar();
            }
        };
    }

    const archiveBtn = document.getElementById('ctx-archive-btn');
    if (archiveBtn) {
        if (space.isArchived) {
            archiveBtn.innerHTML = `${svgUnarchive} Unarchive`;
            archiveBtn.style.color = 'var(--text-main)';
        } else {
            archiveBtn.innerHTML = `${svgArchive} Archive Space`;
            archiveBtn.style.color = '#dc2626';
        }

        archiveBtn.onclick = () => {
        closeContextMenu();
        
        // Prevent archiving the last active space
        if (!space.isArchived) {
            const activeSpaces = getSpaces().filter(s => !s.isArchived && !s.isDeleted);
            if (activeSpaces.length <= 1 && activeSpaces[0].id === space.id) {
                alert("Cannot archive the last active space");
                return;
            }
        }

        space.isArchived = !space.isArchived;

        // If we just archived the current space, switch to another one
        if (space.isArchived && space.id === getCurrentSpaceId()) {
            const nextSpace = getSpaces().find(s => !s.isArchived && !s.isDeleted);
            if (nextSpace) onSpaceChangeCallback(nextSpace.id, false);
        } else {
            saveData();
            renderSidebar();
        }
        };
    }

    // Close on click outside
    setTimeout(() => { document.addEventListener('click', closeContextMenu); }, 0);
}

// Function to update status without full re-render
export function refreshSidebarIcon() {
    getSpaces().forEach(space => {
        const spaceItem = document.querySelector(`.space-item[data-id="${space.id}"]`);
        if (spaceItem) {
            updateSpaceItemUI(spaceItem, space);
        }
    });
}

/**
 * Shows a custom designed modal to edit folder name and icon
 */
function showFolderEditModal(folderName) {
    const settings = getAppSettings();
    const isCreateMode = folderName === null;
    const activeName = isCreateMode ? "" : folderName;
    const currentIcon = (!isCreateMode && settings.folderIcons && settings.folderIcons[folderName]) ? settings.folderIcons[folderName] : "📁";
    const currentTheme = (!isCreateMode && settings.folderThemes && settings.folderThemes[folderName]) ? settings.folderThemes[folderName] : { color: '#555555', fontSize: 11 };
    
    const modalId = 'folder-edit-modal-custom';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        const html = `
        <div class="modal-overlay" id="${modalId}" style="display:none; z-index:12000;">
            <div class="modal-content" style="width:360px;">
                <div style="margin-bottom:15px;">
                    <h3 style="margin:0;" id="folder-modal-title">📂 Edit Folder</h3>
                </div>
                <div class="customize-section">
                    <label class="section-label" style="display:flex; justify-content:space-between; align-items:center;">
                        Folder Identity
                        <button class="btn btn-outline" id="folder-modal-reset-identity" style="font-size:10px; padding:1px 6px;">Reset</button>
                    </label>
                    <div style="display:flex; gap:15px; align-items:center;">
                        <div id="folder-modal-preview" class="folder-edit-preview" title="Click to upload image"></div>
                        <div style="flex:1;">
                            <input type="text" id="folder-modal-name" class="settings-input" placeholder="Folder Name">
                            <input type="text" id="folder-modal-icon-input" class="settings-input" placeholder="Emoji or URL" style="margin-top:8px; font-size:12px;">
                            <input type="file" id="folder-modal-file" accept="image/*" style="display:none;">
                        </div>
                    </div>
                </div>
                <div class="customize-section">
                    <label class="section-label" style="display:flex; justify-content:space-between; align-items:center;">
                        Typography & Style
                        <button class="btn btn-outline" id="folder-modal-reset-typography" style="font-size:10px; padding:1px 6px;">Reset</button>
                    </label>
                    <div class="customize-row">
                        <span style="font-size:13px;">Font Color</span>
                        <input type="color" id="folder-modal-color" style="width:28px; height:28px; border:none; background:transparent; cursor:pointer;">
                    </div>
                    <div class="customize-row" style="margin-top:8px;">
                        <span style="font-size:13px;">Font Size</span>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <input type="number" id="folder-modal-size" class="settings-input" style="width:60px; padding:4px; text-align:center;" min="10" max="20">
                            <span style="font-size:12px; color:var(--text-muted);">px</span>
                        </div>
                    </div>
                </div>
                <div class="modal-actions" style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
                    <button class="btn btn-outline delete-btn-red" id="folder-modal-delete" style="display:none; font-size:12px;">Delete Folder</button>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-outline" id="folder-modal-cancel">Cancel</button>
                        <button class="btn btn-primary" id="folder-modal-save">${isCreateMode ? 'Create Folder' : 'Save Changes'}</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        modal = document.getElementById(modalId);
    }

    const nameInput = document.getElementById('folder-modal-name');
    const iconInput = document.getElementById('folder-modal-icon-input');
    const preview = document.getElementById('folder-modal-preview');
    const fileInput = document.getElementById('folder-modal-file');
    const colorInput = document.getElementById('folder-modal-color');
    const sizeInput = document.getElementById('folder-modal-size');
    const deleteBtn = document.getElementById('folder-modal-delete');
    const resetIdentityBtn = document.getElementById('folder-modal-reset-identity');
    const resetTypographyBtn = document.getElementById('folder-modal-reset-typography');
    const saveBtn = document.getElementById('folder-modal-save');
    const cancelBtn = document.getElementById('folder-modal-cancel');
    const titleHeader = document.getElementById('folder-modal-title');

    titleHeader.innerText = isCreateMode ? "📁 Create Folder" : "📂 Edit Folder";
    nameInput.value = activeName;
    nameInput.disabled = (folderName === 'General');
    iconInput.value = currentIcon;
    colorInput.value = currentTheme.color || "#555555";
    sizeInput.value = currentTheme.fontSize || 11;
    deleteBtn.style.display = (isCreateMode || folderName === 'General') ? "none" : "block";
    saveBtn.innerText = isCreateMode ? "Create Folder" : "Save Changes";

    const updatePreview = () => {
        const val = iconInput.value || "📁";
        if (val.startsWith('http') || val.startsWith('data:image')) {
            preview.innerHTML = `<img src="${val}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            preview.innerText = val;
        }
    };

    updatePreview();
    iconInput.oninput = updatePreview;
    preview.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            iconInput.value = ev.target.result;
            updatePreview();
        };
        reader.readAsDataURL(file);
    };

    resetIdentityBtn.onclick = () => { iconInput.value = "📁"; updatePreview(); };
    resetTypographyBtn.onclick = () => { colorInput.value = "#555555"; sizeInput.value = 11; };

    modal.style.display = 'flex';

    saveBtn.onclick = () => {
        const newName = nameInput.value.trim();
        if (!newName) return alert("Folder name cannot be empty");
        const spaces = getSpaces();
        const settings = getAppSettings();
        if (!settings.folderThemes) settings.folderThemes = {};
        if (!isCreateMode && newName !== folderName) {
            spaces.forEach(s => { if (s.folder === folderName) s.folder = newName; });
            delete settings.folderIcons[folderName];
            delete settings.folderThemes[folderName];
        }
        if (!settings.folderIcons) settings.folderIcons = {};
        settings.folderIcons[newName] = iconInput.value.trim() || "📁";
        settings.folderThemes[newName] = { color: colorInput.value, fontSize: sizeInput.value };
        saveData();
        modal.style.display = 'none';
        renderSidebar();
    };

    deleteBtn.onclick = () => {
        if (confirm(`Move folder "${folderName}" and all its spaces to trash?`)) {
            const spaces = getSpaces();
            const settings = getAppSettings();
            const activeCount = spaces.filter(s => !s.isDeleted).length;
            const folderSpaces = spaces.filter(s => s.folder === folderName && !s.isDeleted);
            
            if (activeCount - folderSpaces.length < 1) {
                return alert("Cannot delete: At least one active space must remain.");
            }

            // 1. ย้าย Space ในโฟลเดอร์ลงถังขยะ
            folderSpaces.forEach(s => { s.isDeleted = true; });

            // 2. ล้างข้อมูล Metadata ของโฟลเดอร์เพื่อให้โฟลเดอร์หายไปจาก Sidebar
            if (settings.folderIcons) delete settings.folderIcons[folderName];
            if (settings.folderThemes) delete settings.folderThemes[folderName];
            if (settings.folderOrder) settings.folderOrder = settings.folderOrder.filter(f => f !== folderName);
            if (settings.lockedFolders) settings.lockedFolders = settings.lockedFolders.filter(f => f !== folderName);
            if (settings.collapsedFolders) settings.collapsedFolders = settings.collapsedFolders.filter(f => f !== folderName);

            saveData();
            
            modal.style.display = 'none';
            renderSidebar();
        }
    };
    cancelBtn.onclick = () => { modal.style.display = 'none'; };
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

/**
 * Shows a modal to manually reorder folders using drag and drop
 */
function showFolderReorderModal() {
    const settings = getAppSettings();
    const allSpaces = getSpaces();
    
    // Identify all custom folders (excluding General)
    const allFolderNames = new Set();
    if (settings.folderIcons) Object.keys(settings.folderIcons).forEach(f => { if(f !== 'General') allFolderNames.add(f); });
    if (settings.folderThemes) Object.keys(settings.folderThemes).forEach(f => { if(f !== 'General') allFolderNames.add(f); });
    allSpaces.forEach(s => {
        if (!s.isArchived && s.folder && s.folder !== 'General') allFolderNames.add(s.folder);
    });

    const folders = Array.from(allFolderNames);
    const customOrder = settings.folderOrder || [];
    
    folders.sort((a, b) => {
        const idxA = customOrder.indexOf(a);
        const idxB = customOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    const modalId = 'folder-reorder-modal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        const html = `
        <div class="modal-overlay" id="${modalId}" style="display:none; z-index:12000;">
            <div class="modal-content" style="width:360px;">
                <h3 style="margin-top:0;">↕️ Reorder Folders</h3>
                <p style="font-size:12px; color:var(--text-muted); margin-bottom:15px;">Drag and drop to arrange folder order.</p>
                <ul id="reorder-folder-list" class="reorder-list" style="max-height: 300px; overflow-y: auto; margin-bottom: 15px; padding:0;"></ul>
                <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:8px;">
                    <button class="btn btn-outline" id="reorder-modal-cancel">Cancel</button>
                    <button class="btn btn-primary" id="reorder-modal-save">Save Order</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        modal = document.getElementById(modalId);
    }

    const listContainer = document.getElementById('reorder-folder-list');
    listContainer.innerHTML = folders.map(f => `
        <li class="reorder-item" data-name="${f}">
            ${dragHandleSvg}
            <span style="font-size:14px; font-weight:600;">${f}</span>
        </li>
    `).join('');

    Sortable.create(listContainer, { animation: 150, handle: '.drag-handle' });
    modal.style.display = 'flex';

    document.getElementById('reorder-modal-save').onclick = () => {
        settings.folderOrder = Array.from(listContainer.children).map(li => li.dataset.name);
        saveData();
        modal.style.display = 'none';
        renderSidebar();
    };
    document.getElementById('reorder-modal-cancel').onclick = () => { modal.style.display = 'none'; };
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}