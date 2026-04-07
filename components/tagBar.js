// components/tagBar.js
import { saveData, getCurrentSpace, getAppSettings } from '../core/storage.js';
import Sortable from '../sortable.esm.js';
import { svgPencil, svgTrashRed } from '../core/icons.js';

const svgMenu = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7;"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;

let areDefaultsVisible = true; // State สำหรับการซ่อน/แสดงป้าย Default

export function renderTagBar(space, currentFilterTags, currentFilterMode, callbacks) {
    const { onFilterChange, onRenderMain } = callbacks;
    const tagBarContainer = document.getElementById('tag-bar-container');
    if (!tagBarContainer || !space) return;
    const isLocked = !!space.isTagModeLocked;
    const settings = getAppSettings();

    // 🟢 ดึงสถานะ Single/Multi จาก Space โดยตรง
    const isSingle = !!space.isSingleSelectMode;

    // 1. ล้างข้อมูล
    tagBarContainer.innerHTML = '';

    // 🟢 NEW: เพิ่มปุ่ม Expand Tabs ไว้ด้านหน้าสุด (เฉพาะเมื่อถูกซ่อน)
    if (settings.isTabsCollapsed) {
        const expandBtn = document.createElement('button');
        expandBtn.className = 'btn-icon collapsed-tabs-btn';
        expandBtn.id = 'btn-tabs-collapsed-indicator';
        expandBtn.title = "Expand Tabs";
        const baseColorTabs = '#2f80ed';
        const baseBgTabs = 'rgba(47, 128, 237, 0.1)';
        const baseBorderTabs = 'rgba(47, 128, 237, 0.3)';

        expandBtn.style.cssText = `
            margin-right: 10px;
            color: ${baseColorTabs};
            background: ${baseBgTabs};
            border: 1px solid ${baseBorderTabs};
            width: 28px;
            height: 28px;
            border-radius: 50%;
            opacity: 1;
            transition: all 0.2s ease; /* Add transition for smooth effect */
        `;
        expandBtn.innerHTML = '<svg class="svg-icon-sm" style="width:16px; height:16px;"><use href="#icon-browser"></use></svg>';
        expandBtn.onclick = (e) => {
            e.stopPropagation();
            settings.isTabsCollapsed = false;
            saveData();
            onRenderMain(); // สั่งวาดหน้าจอใหม่ทั้งหมดเพื่อกาง Tabs
        };

        expandBtn.onmouseenter = () => {
            expandBtn.style.cssText += isDarkMode ? neumorphismHoverStyleDark(baseBgTabs) : neumorphismHoverStyle(baseBgTabs);
        };
        expandBtn.onmouseleave = () => {
            expandBtn.style.cssText = `
                margin-right: 10px;
                color: ${baseColorTabs};
                background: ${baseBgTabs};
                border: 1px solid ${baseBorderTabs};
                width: 28px;
                height: 28px;
                border-radius: 50%;
                opacity: 1;
                transition: all 0.2s ease;
            `;
        };

        tagBarContainer.appendChild(expandBtn);
    }

    // 🟢 NEW: เพิ่มปุ่ม Expand Resources ไว้ด้านหน้า (เฉพาะเมื่อถูกซ่อน)
    if (settings.isResourcesCollapsed) {
        const expandResBtn = document.createElement('button');
        expandResBtn.className = 'btn-icon collapsed-res-btn';
        expandResBtn.title = "Expand Resources";
        const baseColorRes = '#db2777';
        const baseBgRes = 'rgba(219, 39, 119, 0.1)';
        const baseBorderRes = 'rgba(219, 39, 119, 0.3)';

        expandResBtn.style.cssText = `
            margin-right: 10px;
            color: ${baseColorRes};
            background: ${baseBgRes};
            border: 1px solid ${baseBorderRes};
            width: 28px;
            height: 28px;
            border-radius: 50%;
            opacity: 1;
            transition: all 0.2s ease;
        `;
        expandResBtn.innerHTML = '<svg class="svg-icon-sm" style="width:16px; height:16px;"><use href="#icon-layers"></use></svg>';
        expandResBtn.onclick = (e) => {
            e.stopPropagation();
            settings.isResourcesCollapsed = false;
            saveData();
            onRenderMain();
        };

        expandResBtn.onmouseenter = () => {
            expandResBtn.style.cssText += isDarkMode ? neumorphismHoverStyleDark(baseBgRes) : neumorphismHoverStyle(baseBgRes);
        };
        expandResBtn.onmouseleave = () => {
            expandResBtn.style.cssText = `
                margin-right: 10px;
                color: ${baseColorRes};
                background: ${baseBgRes};
                border: 1px solid ${baseBorderRes};
                width: 28px;
                height: 28px;
                border-radius: 50%;
                opacity: 1;
                transition: all 0.2s ease;
            `;
        };

        tagBarContainer.appendChild(expandResBtn);
    }

    // 🟢 NEW: เพิ่มปุ่ม Expand Tasks ไว้ด้านหน้า (เฉพาะเมื่อถูกซ่อน)
    if (settings.isTasksCollapsed) {
        const expandTasksBtn = document.createElement('button');
        expandTasksBtn.className = 'btn-icon collapsed-tasks-btn';
        expandTasksBtn.title = "Expand Tasks & Notes";
        const baseColorTasks = '#16a34a';
        const baseBgTasks = 'rgba(22, 163, 74, 0.1)';
        const baseBorderTasks = 'rgba(22, 163, 74, 0.3)';

        expandTasksBtn.style.cssText = `
            margin-right: 10px;
            color: ${baseColorTasks};
            background: ${baseBgTasks};
            border: 1px solid ${baseBorderTasks};
            width: 28px;
            height: 28px;
            border-radius: 50%;
            opacity: 1;
            transition: all 0.2s ease;
        `;
        expandTasksBtn.innerHTML = '<svg class="svg-icon-sm" style="width:16px; height:16px;"><use href="#icon-check-square"></use></svg>';
        expandTasksBtn.onclick = (e) => {
            e.stopPropagation();
            settings.isTasksCollapsed = false;
            saveData();
            onRenderMain();
        };

        expandTasksBtn.onmouseenter = () => {
            expandTasksBtn.style.cssText += isDarkMode ? neumorphismHoverStyleDark(baseBgTasks) : neumorphismHoverStyle(baseBgTasks);
        };
        expandTasksBtn.onmouseleave = () => {
            expandTasksBtn.style.cssText = `
                margin-right: 10px;
                color: ${baseColorTasks};
                background: ${baseBgTasks};
                border: 1px solid ${baseBorderTasks};
                width: 28px;
                height: 28px;
                border-radius: 50%;
                opacity: 1;
                transition: all 0.2s ease;
            `;
        };

        tagBarContainer.appendChild(expandTasksBtn);
    }

    // 2. ใส่ไอคอน Tag (แบบสร้าง Element เพื่อไม่ให้ไปทับอันอื่น)
    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = '<svg class="svg-icon-sm" style="color:var(--text-muted); margin-right:5px;"><use href="#icon-tag"></use></svg>';
    tagBarContainer.appendChild(iconSpan);

    // 4. ปุ่ม Toggle (Icon Minimal คล้าย Notion)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-icon';
    toggleBtn.title = areDefaultsVisible ? "ซ่อนป้ายเริ่มต้น" : "แสดงป้ายเริ่มต้น";
    toggleBtn.style = 'margin-right: 8px; color: var(--text-muted); padding: 4px; border-radius: 4px; transition: background 0.2s; cursor: pointer;';
    toggleBtn.innerHTML = areDefaultsVisible 
        ? `<svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>` 
        : `<svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    
    toggleBtn.onclick = () => {
        areDefaultsVisible = !areDefaultsVisible;
        renderTagBar(space, currentFilterTags, currentFilterMode, callbacks);
    };
    tagBarContainer.appendChild(toggleBtn);

    // 5. Default Tags Group (All, AI, No Tag)
    if (areDefaultsVisible) {
        const defaultsWrapper = document.createElement('div');
        defaultsWrapper.style = "display:flex; flex-wrap: wrap; gap: 8px; margin-right:12px; border-right:1px solid var(--border-color); padding-right:12px; align-items:center;";

        // --- 🟢 สร้างกลุ่มปุ่มโหมด (Lock, Single/Multi, OR/AND) ---
        const modeGroup = document.createElement('div');
        modeGroup.style = "display: flex; align-items: center; gap: 4px; background: var(--bg-body); padding: 2px 6px; border-radius: 8px; border: 1px solid var(--border-color);";

        // --- 0. ปุ่ม Lock ---
        const lockBtn = document.createElement('button');
        lockBtn.className = 'btn-icon';
        lockBtn.title = isLocked ? 'Unlock Tag Settings' : 'Lock Tag Settings';
        lockBtn.style = `color: ${isLocked ? '#ef4444' : '#10b981'}; opacity: ${isLocked ? '1' : '0.4'}; padding: 2px;`;
        lockBtn.innerHTML = `<svg class="svg-icon-sm"><use href="#icon-${isLocked ? 'lock-minimal' : 'unlock-minimal'}"></use></svg>`;
        lockBtn.onclick = () => {
            space.isTagModeLocked = !space.isTagModeLocked;
            saveData();
            renderTagBar(space, currentFilterTags, currentFilterMode, callbacks);
        };
        modeGroup.appendChild(lockBtn);

        // --- 1. ปุ่มเลือกโหมดการเลือก (Select : Single / Multi) ---
        const selectBtn = document.createElement('button');
        selectBtn.className = 'btn-tag-mode';
        selectBtn.style = `padding: 2px 10px; font-size: 11px; border-radius: 4px; font-weight: bold; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; flex-shrink: 0; transition: all 0.2s; opacity: ${isLocked ? '0.7' : '1'};`;
        
        selectBtn.style.background = isSingle ? '#f3e8ff' : '#dcfce7'; 
        selectBtn.style.color = isSingle ? '#6b21a8' : '#166534';
        selectBtn.style.border = `1px solid ${isSingle ? '#6b21a8' : '#166534'}`;
        selectBtn.innerHTML = isSingle ? 'Single' : 'Multi';

        selectBtn.onclick = () => {
            if (isLocked) return;
            space.isSingleSelectMode = !isSingle;
            saveData();
            renderTagBar(space, currentFilterTags, currentFilterMode, callbacks);
        };
        modeGroup.appendChild(selectBtn);

        // --- 2. ปุ่ม Mode (OR / AND) ---
        const modeBtn = document.createElement('button');
        modeBtn.className = 'btn-tag-mode'; 
        // ตัด margin-right ออก เพราะใช้ gap ของ parent แล้ว
        modeBtn.style = `padding: 2px 10px; font-size: 11px; border-radius: 4px; font-weight: bold; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; flex-shrink: 0; transition: all 0.2s; opacity: ${isLocked ? '0.7' : '1'};`;
        
        const isOR = currentFilterMode === 'OR';
        modeBtn.style.background = isOR ? '#e3f2fd' : '#ffebee';
        modeBtn.style.color = isOR ? '#0b6e99' : '#991b1b';
        modeBtn.style.border = `1px solid ${isOR ? '#0b6e99' : '#991b1b'}`;
        modeBtn.innerHTML = currentFilterMode; 

        modeBtn.onclick = () => {
            if (isLocked) return;
            const nextMode = currentFilterMode === 'OR' ? 'AND' : 'OR';
            onFilterChange(currentFilterTags, nextMode);
        };
        modeGroup.appendChild(modeBtn);

        defaultsWrapper.appendChild(modeGroup); // ใส่กลุ่มโหมดเข้าไปใน Wrapper หลัก

        // Helper สร้าง Pill แบบมาตรฐานเดียวกันหมด
        const createPill = (label, value, isActive, onClick) => {
            const pill = document.createElement('div');
            pill.className = `tag-pill ${isActive ? 'active' : ''}`;
            pill.innerText = label;
            pill.onclick = onClick;
            return pill;
        };

        // 5.1 All
        defaultsWrapper.appendChild(createPill("All", "ALL", currentFilterTags.length === 0, () => onFilterChange([], currentFilterMode)));

        // 5.2 Untagged (New!)
        const isUntagged = currentFilterTags.includes('UNTAGGED');
        defaultsWrapper.appendChild(createPill("🚫 No Tag", "UNTAGGED", isUntagged, () => {
             let newTags;
             if (isSingle) {
                 newTags = isUntagged ? [] : ['UNTAGGED'];
             } else {
                 newTags = [...currentFilterTags];
                 if (isUntagged) newTags = newTags.filter(t => t !== 'UNTAGGED');
                 else newTags.push('UNTAGGED');
             }
             onFilterChange(newTags, currentFilterMode);
        }));

        // 5.3 AI
        const isAi = currentFilterTags.includes('AI');
        defaultsWrapper.appendChild(createPill("🤖 AI", "AI", isAi, () => {
             let newTags;
             if (isSingle) {
                 newTags = isAi ? [] : ['AI'];
             } else {
                 newTags = [...currentFilterTags];
                 if (isAi) newTags = newTags.filter(t => t !== 'AI');
                 else newTags.push('AI');
             }
             onFilterChange(newTags, currentFilterMode);
        }));

        // 5.4 Half screen
        const isHalfScreen = currentFilterTags.includes('HALF SCREEN');
        defaultsWrapper.appendChild(createPill("💻 Half screen", "HALF SCREEN", isHalfScreen, () => {
             let newTags;
             if (isSingle) {
                 newTags = isHalfScreen ? [] : ['HALF SCREEN'];
             } else {
                 newTags = [...currentFilterTags];
                 if (isHalfScreen) newTags = newTags.filter(t => t !== 'HALF SCREEN');
                 else newTags.push('HALF SCREEN');
             }
             onFilterChange(newTags, currentFilterMode);
        }));

        tagBarContainer.appendChild(defaultsWrapper);
    }

    // --- สร้าง Wrapper สำหรับป้ายที่ลากวางได้ ---
    const sortableWrapper = document.createElement('div');
    sortableWrapper.className = 'sortable-tags-container';
    sortableWrapper.style.display = 'flex';
    sortableWrapper.style.flexWrap = 'wrap';
    sortableWrapper.style.gap = '10px';
    sortableWrapper.style.alignItems = 'center';
    tagBarContainer.appendChild(sortableWrapper);

    // 5. วาดป้ายกำกับที่มีอยู่ใน Space (รวมถึงป้าย AI ที่นายทำไว้)
    if (space.tags) {
        space.tags.forEach(tag => {
            if (tag.toUpperCase() === 'AI' || tag.toUpperCase() === 'HALF SCREEN') return; // ข้ามป้ายที่เป็น Default
            const isActive = currentFilterTags.includes(tag.toUpperCase()); // เช็คแบบตัวพิมพ์ใหญ่
            const pill = document.createElement('div');
            pill.className = `tag-pill ${isActive ? 'active' : ''}`;
            pill.setAttribute('data-tag-name', tag); // เก็บชื่อป้ายไว้สำหรับ Sortable
            
            pill.innerHTML = `
                <span>${tag}</span>
                <button class="btn-icon btn-tag-menu" style="margin-left:5px; opacity:0.5; display:flex;">${svgMenu}</button>
            `;

            // คลิกเพื่อกรอง
            pill.onclick = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                const tagUpper = tag.toUpperCase();
                let newTags;
                
                if (isSingle) {
                    // Single Mode: ถ้าเลือกอยู่แล้วให้ยกเลิก (เป็นว่าง) ถ้ายังไม่เลือกให้เลือกแค่อันเดียว
                    newTags = currentFilterTags.includes(tagUpper) && currentFilterTags.length === 1 ? [] : [tagUpper];
                } else {
                    // Multi Mode: เดิม
                    newTags = [...currentFilterTags];
                    if (newTags.includes(tagUpper)) {
                        newTags = newTags.filter(t => t !== tagUpper);
                    } else {
                        newTags.push(tagUpper);
                    }
                }
                onFilterChange(newTags, currentFilterMode);
            };

            // ปุ่มเมนู (Context Menu)
            pill.querySelector('.btn-tag-menu').onclick = (e) => {
                e.stopPropagation();
                showTagContextMenu(e, tag, space, { onFilterChange, onRenderMain, currentFilterTags, currentFilterMode });
            };

            sortableWrapper.appendChild(pill);
        });
    }

    // --- ตั้งค่า Sortable ให้กับ Wrapper ---
    if (sortableWrapper.sortable) sortableWrapper.sortable.destroy();
    sortableWrapper.sortable = Sortable.create(sortableWrapper, {
        animation: 150,
        disabled: space.isArchived,
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
            // ดึงชื่อป้ายตามลำดับใหม่
            const newTags = Array.from(sortableWrapper.children).map(el => el.getAttribute('data-tag-name'));
            // รักษาป้าย 'AI' ไว้หากมีอยู่ในข้อมูลเดิม (แต่ซ่อนไว้)
            const preservedTags = space.tags.filter(t => t.toUpperCase() === 'AI');
            space.tags = [...preservedTags, ...newTags];
            saveData();
        }
    });

    // 6. ปุ่ม Add New Tag
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add-tag';
    addBtn.innerText = '+ New Tag';
    addBtn.onclick = () => {
        const newTag = prompt('ชื่อป้ายกำกับ:');
        if (newTag && newTag.trim() !== '') {
            const currentSpace = getCurrentSpace(); // Ensure we use the latest space object
            if (!currentSpace.tags) currentSpace.tags = [];
            const val = newTag.trim();
            if (!currentSpace.tags.some(t => t.toLowerCase() === val.toLowerCase())) {
                currentSpace.tags.push(val);
                saveData();
                onRenderMain();
            }
        }
    };
    tagBarContainer.appendChild(addBtn);
}

function closeTagContextMenu() {
    const existing = document.getElementById('tag-context-menu');
    if (existing) existing.remove();
    document.removeEventListener('click', closeTagContextMenu);
}

function showTagContextMenu(e, tag, space, callbacks) {
    e.preventDefault();
    e.stopPropagation();
    closeTagContextMenu();

    const { onFilterChange, onRenderMain, currentFilterTags, currentFilterMode } = callbacks;
    const btn = e.currentTarget;

    const menu = document.createElement('div');
    menu.id = 'tag-context-menu';
    menu.style.cssText = `
        position: absolute;
        visibility: hidden;
        background: var(--bg-card, #fff);
        border: 1px solid var(--border-color, #e1e1e1);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 4px;
        min-width: 120px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
    `;

    menu.innerHTML = `
        <button class="menu-item" id="ctx-edit-tag" style="display:flex; align-items:center; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:var(--text-main); text-align:left; border-radius:4px;">${svgPencil} Edit</button>
        <div style="height:1px; background:var(--border-color); margin: 4px 8px;"></div>
        <button class="menu-item" id="ctx-delete-tag" style="display:flex; align-items:center; width:100%; padding:6px 10px; border:none; background:transparent; cursor:pointer; font-size:13px; color:#dc2626; text-align:left; border-radius:4px;">${svgTrashRed} Delete</button>
    `;

    document.body.appendChild(menu);

    // Smart Positioning
    const rect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    let top = rect.bottom + window.scrollY;
    if (top + menuRect.height > viewportHeight) {
        top = rect.top - menuRect.height + window.scrollY;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${rect.right + window.scrollX - menuRect.width}px`; // Align right
    menu.style.visibility = 'visible';

    // Hover effects
    menu.querySelectorAll('.menu-item').forEach(b => {
        b.addEventListener('mouseenter', () => b.style.backgroundColor = 'var(--bg-hover, #f1f1ef)');
        b.addEventListener('mouseleave', () => b.style.backgroundColor = 'transparent');
    });

    // Actions
    document.getElementById('ctx-edit-tag').addEventListener('click', () => {
        closeTagContextMenu();
        const newName = prompt(`Rename tag "${tag}" to:`, tag);
        if (newName && newName.trim() !== "" && newName.trim() !== tag) {
            const validName = newName.trim();
            updateTagNameInSpace(space, tag, validName);
            if (currentFilterTags.includes(tag.toUpperCase())) {
                const newFilter = currentFilterTags.map(t => t === tag.toUpperCase() ? validName.toUpperCase() : t);
                onFilterChange(newFilter, currentFilterMode);
            } else { onRenderMain(); }
        }
    });

    document.getElementById('ctx-delete-tag').addEventListener('click', () => {
        closeTagContextMenu();
        if (confirm(`Delete tag "${tag}"?`)) {
            space.tags = space.tags.filter(t => t !== tag);
            saveData();
            onRenderMain();
        }
    });

    setTimeout(() => { document.addEventListener('click', closeTagContextMenu); }, 0);
}

// Helper ภายในสำหรับเปลี่ยนชื่อ Tag ในทุกที่
function updateTagNameInSpace(space, oldName, newName) {
    const updateTags = (item) => {
        if (item.tags) item.tags = item.tags.map(t => t === oldName ? newName : t);
    };
    if (space.resources) space.resources.forEach(updateTags);
    if (space.driveFiles) space.driveFiles.forEach(updateTags);
    if (space.tasks) space.tasks.forEach(updateTags);
    if (space.tabs) space.tabs.forEach(updateTags);
    
    const idx = space.tags.indexOf(oldName);
    if (idx !== -1) space.tags[idx] = newName;
    saveData();
}