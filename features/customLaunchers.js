// features/customLaunchers.js
import Sortable from '../sortable.esm.js';
import { getGlobalLaunchers, setGlobalLaunchers, saveData, getCurrentSpace, getCurrentSpaceId } from '../core/storage.js';
import { openOrFocusTab } from '../core/ui-helpers.js';
import { openLauncherModal } from '../components/modals.js';
import { svgPencil, svgTrashRed } from '../core/icons.js';

export function initCustomLaunchers() {
    renderLaunchers();
}

export function renderLaunchers() {
    const container = document.getElementById('global-launchers-bar');
    if (!container) return;

    // Destroy existing sortable instance on the container to prevent memory leaks
    if (container.sortable) {
        container.sortable.destroy();
    }

    container.innerHTML = '';
    const allLaunchers = getGlobalLaunchers();
    const currentSpaceId = getCurrentSpaceId();

    // Filter launchers based on the current space
    const launchers = allLaunchers.filter(item => {
        // If visibleInSpaces doesn't exist, is null, or is an empty array, it's global.
        if (!item.visibleInSpaces || item.visibleInSpaces.length === 0) {
            return true;
        }
        // Otherwise, check if the current space ID is in the array.
        return item.visibleInSpaces.includes(currentSpaceId);
    });

    // 1. Group by Tag, while maintaining the original group order
    const groups = {}; // { tag: [items] }
    const orderedTags = []; // ['tagA', 'tagB', '']
    const seenTags = new Set();

    launchers.forEach(item => {
        const tag = item.tag || ""; 
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(item);
        if (!seenTags.has(tag)) {
            orderedTags.push(tag);
            seenTags.add(tag);
        }
    });

    // 2. Render Groups
    orderedTags.forEach((tag, index) => {
        if (index > 0) {
            const sep = document.createElement('div');
            sep.className = 'launcher-separator';
            container.appendChild(sep);
        }

        const groupContainer = document.createElement('div');
        groupContainer.className = 'launcher-group';
        groupContainer.setAttribute('data-tag', tag);

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'launcher-group-items';

        groups[tag].forEach(item => {
            const btn = createLauncherBtn(item);
            itemsContainer.appendChild(btn);
        });

        groupContainer.appendChild(itemsContainer);

        // Add Label if tag exists
        if (tag) {
            const label = document.createElement('div');
            label.className = 'launcher-group-label';
            label.innerText = tag;
            
            // ใช้สีจาก Item ตัวแรกในกลุ่ม
            if (groups[tag][0].tagColor) {
                label.style.color = groups[tag][0].tagColor;
                label.style.opacity = "1";
            }

            // Right Click to Edit/Delete Tag
            label.addEventListener('contextmenu', (e) => {
                handleGroupContextMenu(e, tag, groups[tag]);
            });

            groupContainer.appendChild(label);
        }

        container.appendChild(groupContainer);

        // 3. Init Sortable for this group
        const isArchived = getCurrentSpace()?.isArchived;
        Sortable.create(itemsContainer, {
            group: `launchers-${tag}`, // Make group unique to prevent dragging between tags
            animation: 150,
            disabled: isArchived,
            draggable: ".launcher-btn",
            onEnd: function (evt) {
                // Reconstruct the global list based on the new DOM state
                const fullList = getGlobalLaunchers();
                const newDomOrder = Array.from(document.querySelectorAll('.launcher-group .launcher-btn'));

                const newVisibleOrderMap = new Map(
                    newDomOrder.map((el, index) => [el.getAttribute('data-id'), { index, tag: el.closest('.launcher-group').getAttribute('data-tag') }])
                );

                const finalLaunchers = fullList
                    .map(item => {
                        const sortInfo = newVisibleOrderMap.get(String(item.id));
                        return {
                            item,
                            isVisible: !!sortInfo,
                            sortKey: sortInfo ? sortInfo.index : -1,
                            newTag: sortInfo ? sortInfo.tag : item.tag
                        };
                    })
                    .sort((a, b) => (a.isVisible && b.isVisible) ? a.sortKey - b.sortKey : 0)
                    .map(wrapped => {
                        if (wrapped.isVisible) wrapped.item.tag = wrapped.newTag;
                        return wrapped.item;
                    });
                
                setGlobalLaunchers(finalLaunchers);
                saveData();
                renderLaunchers(); 
            }
        });
    });

    // Add Button (Outside of groups)
    const addBtn = document.createElement('button');
    addBtn.className = 'launcher-add-btn';
    addBtn.innerHTML = '+';
    addBtn.title = "Add Shortcut";
    addBtn.onclick = () => openLauncherModal(null);
    container.appendChild(addBtn);

    // 4. NEW: Init Sortable for the main container to drag groups
    const isArchived = getCurrentSpace()?.isArchived;
    container.sortable = Sortable.create(container, {
        group: 'launcher-groups',
        animation: 150,
        disabled: isArchived,
        draggable: ".launcher-group",
        handle: ".launcher-group-label",
        filter: ".launcher-separator, .launcher-add-btn", // Ignore separators and add button
        onEnd: function (evt) {
            const newOrderOfTags = Array.from(container.querySelectorAll('.launcher-group')).map(g => g.getAttribute('data-tag'));
            
            const originalLaunchers = getGlobalLaunchers();

            const newLaunchers = [];
            newOrderOfTags.forEach(tag => {
                const itemsForTag = originalLaunchers.filter(l => (l.tag || "") === tag);
                newLaunchers.push(...itemsForTag);
            });
            setGlobalLaunchers(newLaunchers);
            saveData();
            renderLaunchers(); // Re-render to fix separators and state
        }
    });
}

function handleGroupContextMenu(e, tag, items) {
    e.preventDefault();
    e.stopPropagation();

    // Remove existing menu
    const existing = document.getElementById('launcher-group-ctx');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'launcher-group-ctx';
    menu.style.cssText = `position:fixed; top:${e.clientY}px; left:${e.clientX}px; background:var(--bg-card); border:1px solid var(--border-color); box-shadow:0 4px 12px rgba(0,0,0,0.15); border-radius:6px; padding:4px; z-index:9999; display:flex; flex-direction:column; min-width:120px;`;
    
    menu.innerHTML = `
        <div style="padding:4px 8px; font-size:11px; color:var(--text-muted); font-weight:700; border-bottom:1px solid var(--border-color); margin-bottom:2px;">Tag: ${tag}</div>
        <button id="ctx-rename-group" style="display:flex; align-items:center; gap:6px; padding:6px 8px; border:none; background:transparent; cursor:pointer; color:var(--text-main); font-size:13px; text-align:left; border-radius:4px;">${svgPencil} Rename</button>
        <button id="ctx-delete-group" style="display:flex; align-items:center; gap:6px; padding:6px 8px; border:none; background:transparent; cursor:pointer; color:#dc2626; font-size:13px; text-align:left; border-radius:4px;">${svgTrashRed} Ungroup</button>
    `;

    document.body.appendChild(menu);

    // Hover effect
    menu.querySelectorAll('button').forEach(btn => {
        btn.onmouseenter = () => btn.style.background = 'var(--hover-bg)';
        btn.onmouseleave = () => btn.style.background = 'transparent';
    });

    // Actions
    document.getElementById('ctx-rename-group').onclick = () => {
        const newName = prompt("Rename tag:", tag);
        if (newName && newName.trim() !== "") {
            items.forEach(item => item.tag = newName.trim());
            saveAndRefresh();
        }
        menu.remove();
    };

    document.getElementById('ctx-delete-group').onclick = () => {
        if (confirm(`Remove tag "${tag}" from ${items.length} items?`)) {
            items.forEach(item => item.tag = "");
            saveAndRefresh();
        }
        menu.remove();
    };

    // Close on outside click
    setTimeout(() => {
        const close = () => { menu.remove(); document.removeEventListener('click', close); };
        document.addEventListener('click', close);
    }, 0);
}

function saveAndRefresh() {
    // Data is reference based, so items are already modified in the global array
    // But to be safe, we rely on reference. setGlobalLaunchers works on the same array reference in memory usually, 
    // but explicit save is better.
    saveData();
    renderLaunchers();
}

function createLauncherBtn(item) {
        const btn = document.createElement('div');
        btn.className = 'launcher-btn';
        btn.setAttribute('data-id', item.id); // ใช้สำหรับ Sortable
        
        const tooltip = item.name || item.url;
        btn.title = item.tag ? `${tooltip} (${item.tag})` : tooltip;
        btn.style.backgroundColor = item.bgColor || '#ffffff';

        // Icon Logic
        if (item.iconData) {
            btn.innerHTML = `<img src="${item.iconData}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;">`;
        } else {
            // Default Link Icon
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
        }

        // Click to Open
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 1. Extract the target URL based on the current object
            const targetUrl = item.url;

            // 2. Generate a unique ID for this specific button so the manager can save its individual state
            const sourceId = 'launcher_' + item.id;

            // 3. Open the custom split view
            if (window.splitViewManager) {
                window.splitViewManager.open(targetUrl, sourceId);
            } else {
                console.error("splitViewManager not found!");
                window.open(targetUrl, '_blank'); // Fallback
            }
        });

        // Right Click to Edit
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (getCurrentSpace()?.isArchived) return;
            openLauncherModal(item.id);
        });

    return btn;
}
