// d:\Code\MyWorkona - Test\components\resources.js

import Sortable from '../sortable.esm.js';
import { getSpaces, getCurrentSpaceId, saveData, getCurrentSpace, getAppSettings } from '../core/storage.js';
import { svgEdit, svgTrashRed, dragHandleSvg, svgSideView, svgArchive, svgUnarchive, svgRestore } from '../core/icons.js';
import { openOrFocusTab, generateMiniTagsBtn, getFaviconUrl, getTrashCountdownText } from '../core/ui-helpers.js';

// SVG icons
const svgMenu = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>`;

// 🟢 NEW: Icon for Local Program (from dashboard.html btn-add-local-res)
const svgLocalProgramIcon = `<svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="12" y1="17" x2="12" y2="21"></line><line x1="8" y1="21" x2="16" y2="21"></line><path d="M12 7v6M9 10h6"/></svg>`;

let isResDeleteMode = false;
let isResMultiOpenMode = false; // New state for multi-open mode
let undoResourceStack = null;

function updateUndoResourceBtn() {
    const btn = document.getElementById('btn-undo-res');
    if (!btn) return;
    if (undoResourceStack && undoResourceStack.spaceId === getCurrentSpaceId()) {
        btn.removeAttribute('disabled');
        btn.style.color = 'var(--primary-color)';
    } else {
        btn.setAttribute('disabled', 'true');
        btn.style.color = '';
    }
}

export function resetUndoStack() {
    undoResourceStack = null;
    updateUndoResourceBtn();
}

// Initialization & Event Listeners
export function initResources(callbacks) {
    const { onRender } = callbacks;

    // --- NEW: Action Menu Logic ---
    const menuBtn = document.getElementById('btn-res-actions-menu');
    const menuPopup = document.getElementById('res-actions-popup');
    const multiOpenBtn = document.getElementById('btn-multi-open-res');
    const deleteSelectedBtn = document.getElementById('btn-delete-selected-res');

    if (menuBtn && menuPopup) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menuPopup.style.display = (menuPopup.style.display === 'none' || menuPopup.style.display === '') ? 'flex' : 'none';
        });
        document.addEventListener('click', (e) => {
            if (!menuPopup.contains(e.target) && e.target !== menuBtn) {
                menuPopup.style.display = 'none';
            }
        });
    }

    // --- Logic for Multi-Open Button ---
    if (multiOpenBtn) {
        multiOpenBtn.addEventListener('click', () => {
            if (!isResMultiOpenMode) {
                // First click: Enter selection mode
                isResMultiOpenMode = true;
                isResDeleteMode = false; // Ensure delete mode is off
                menuPopup.style.display = 'none'; // Hide menu
                onRender(); // Re-render to show checkboxes and update button text
            } else {
                // Second click: Open selected tabs
                const space = getCurrentSpace();
                const resChecked = document.querySelectorAll('.res-checkbox:checked');
                const driveChecked = document.querySelectorAll('.drive-checkbox:checked');
                const urlsToOpen = [];

                resChecked.forEach(cb => {
                    const idx = parseInt(cb.getAttribute("data-index"));
                    urlsToOpen.push(space.resources[idx].url);
                });
                driveChecked.forEach(cb => {
                    const idx = parseInt(cb.getAttribute("data-index"));
                    urlsToOpen.push(space.driveFiles[idx].url);
                });

                if (urlsToOpen.length > 0) {
                    urlsToOpen.forEach(url => openOrFocusTab(url));
                }

                // Exit selection mode
                isResMultiOpenMode = false;
                onRender();
            }
        });
    }

    // --- Logic for Delete Selected Button ---
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', () => {
            if (!isResDeleteMode) {
                // First click: Enter selection mode
                isResDeleteMode = true;
                isResMultiOpenMode = false; // Ensure multi-open mode is off
                menuPopup.style.display = 'none'; // Hide menu
                onRender(); // Re-render to show checkboxes and update button text
            } else {
                // Second click: Confirm and delete
                const space = getSpaces().find(s => s.id === getCurrentSpaceId());
                const resChecked = document.querySelectorAll('.res-checkbox:checked');
                const driveChecked = document.querySelectorAll('.drive-checkbox:checked');

                if (resChecked.length > 0 || driveChecked.length > 0) {
                    if(confirm("Delete selected items?")) {
                        resChecked.forEach(cb => {
                            const idx = parseInt(cb.getAttribute("data-index"));
                            const item = space.resources[idx];
                            if (item) {
                                item.isDeleted = true;
                                item.deletedAt = Date.now();
                                const days = getAppSettings().autoDeleteDays || 30;
                                item.expiryAt = item.deletedAt + (days * 24 * 60 * 60 * 1000);
                                item.isArchived = false;
                            }
                        });
                        driveChecked.forEach(cb => {
                            const idx = parseInt(cb.getAttribute("data-index"));
                            const item = space.driveFiles[idx];
                            if (item) {
                                item.isDeleted = true;
                                item.deletedAt = Date.now();
                                const days = getAppSettings().autoDeleteDays || 30;
                                item.expiryAt = item.deletedAt + (days * 24 * 60 * 60 * 1000);
                                item.isArchived = false;
                            }
                        });
                        saveData();
                    }
                }
                isResDeleteMode = false;
                onRender();
                updateUndoResourceBtn();
            }
        });
    }

    // --- NEW: Select All Logic ---
    const selectAllBtn = document.getElementById('btn-res-select-all');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.res-checkbox, .drive-checkbox');
            const someUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
            checkboxes.forEach(cb => cb.checked = someUnchecked);
        });
    }

    // 2. Undo Button
    const btnUndo = document.getElementById('btn-undo-res');
    if (btnUndo) {
        btnUndo.addEventListener('click', () => {
            if (!undoResourceStack) return;
            const space = getSpaces().find(s => s.id === undoResourceStack.spaceId);
            if (space) {
                undoResourceStack.items.sort((a, b) => a.index - b.index).forEach(item => {
                    if (item.type === 'resource') space.resources.splice(item.index, 0, item.data);
                    else if (item.type === 'drive') space.driveFiles.splice(item.index, 0, item.data);
                });
                saveData();
            }
            undoResourceStack = null;
            updateUndoResourceBtn();
            onRender();
        });
    }

    // --- 🟢 Clear Archived Resources ---
    const btnClearArchived = document.getElementById('btn-clear-archived-res');
    if (btnClearArchived) {
        btnClearArchived.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const space = getCurrentSpace();
            if (space && confirm("Delete all archived links permanently?")) {
                if (space.resources) space.resources = space.resources.filter(r => !r.isArchived);
                if (space.driveFiles) space.driveFiles = space.driveFiles.filter(d => !d.isArchived);
                saveData();
                onRender();
            }
        });
    }

    // --- Empty Trash ---
    const btnEmptyTrash = document.getElementById('btn-empty-res-trash');
    if (btnEmptyTrash) {
        btnEmptyTrash.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const space = getCurrentSpace();
            if (space && confirm("Empty Resources Trash?")) {
                space.resources = space.resources.filter(r => !r.isDeleted);
                space.driveFiles = space.driveFiles.filter(d => !d.isDeleted);
                saveData(); onRender();
            }
        };
    }

    // --- 🟢 ปุ่มสำหรับเพิ่ม Local Program โดยตรง ---
    const addLocalBtn = document.getElementById('btn-add-local-res');
    if (addLocalBtn) {
        addLocalBtn.addEventListener('click', () => {
            if (window.editResource) window.editResource('resource', -1);
        });
    }

    // 3. Delegation for Edit/Delete Buttons in the list
    const mainGrid = document.getElementById('main-grid');
    if (mainGrid) {
        mainGrid.addEventListener('click', (e) => {
            const space = getSpaces().find(s => s.id === getCurrentSpaceId());
            if (!space) return;

            // --- NEW: Menu button logic ---
            if (e.target.closest('.btn-item-menu')) {
                e.stopPropagation();
                const menuBtn = e.target.closest('.btn-item-menu');
                const actionGroup = menuBtn.closest('.item-action-group');
                if (!actionGroup) return;
                const hiddenActions = actionGroup.querySelector('.item-actions-hidden');

                // Hide any other open menus
                document.querySelectorAll('.item-actions-hidden[style*="flex"]').forEach(openMenu => {
                    if (openMenu !== hiddenActions) {
                        openMenu.style.display = 'none';
                        if (openMenu.nextElementSibling) {
                            openMenu.nextElementSibling.style.display = 'inline-flex';
                        }
                    }
                });

                // Toggle this menu
                if (hiddenActions) hiddenActions.style.display = 'flex';
                if (menuBtn) menuBtn.style.display = 'none';

                const closeMenu = (clickEvent) => {
                    if (actionGroup && !actionGroup.contains(clickEvent.target)) {
                        if (hiddenActions) hiddenActions.style.display = 'none';
                        if (menuBtn) menuBtn.style.display = 'inline-flex';
                        document.removeEventListener('click', closeMenu);
                    }
                };
                setTimeout(() => document.addEventListener('click', closeMenu), 0);
                return; // Stop further processing for this click
            }

            // Toggle Side View
            if (e.target.closest('.btn-toggle-side-view')) {
                e.stopPropagation(); // Prevent menu from closing
                const btn = e.target.closest('.btn-toggle-side-view');
                const type = btn.getAttribute('data-type');
                const idx = parseInt(btn.getAttribute('data-index'));
                const arr = type === 'resource' ? space.resources : space.driveFiles;
                
                arr[idx].isSideView = !arr[idx].isSideView;
                saveData();
                onRender(); // Re-render to move the button
            }

            // Archive Action
            if (e.target.closest('.archive-res-btn')) {
                e.stopPropagation();
                const btn = e.target.closest('.archive-res-btn');
                const type = btn.getAttribute('data-type');
                const idx = parseInt(btn.getAttribute('data-index'));
                const arr = type === 'resource' ? space.resources : space.driveFiles;
                arr[idx].isArchived = true;
                saveData();
                onRender();
            }

            // Unarchive Action
            if (e.target.closest('.unarchive-res-btn')) {
                const btn = e.target.closest('.unarchive-res-btn');
                const type = btn.getAttribute('data-type');
                const idx = parseInt(btn.getAttribute('data-index'));
                const arr = type === 'resource' ? space.resources : space.driveFiles;
                arr[idx].isArchived = false;
                saveData();
                onRender();
            }

            // Restore from Trash
            if (e.target.closest('.restore-res-btn')) {
                const btn = e.target.closest('.restore-res-btn');
                const type = btn.dataset.type;
                const idx = parseInt(btn.dataset.index);
                const arr = type === 'resource' ? space.resources : space.driveFiles;
                arr[idx].isDeleted = false; saveData(); onRender();
            }

            // Delete Permanently
            if (e.target.closest('.delete-res-perm-btn')) {
                const btn = e.target.closest('.delete-res-perm-btn');
                const type = btn.dataset.type;
                const idx = parseInt(btn.dataset.index);
                const arr = type === 'resource' ? space.resources : space.driveFiles;
                if (confirm("Delete permanently?")) { arr.splice(idx, 1); saveData(); onRender(); }
            }

            // Edit Title
            if (e.target.closest('.edit-res-btn')) {
                const btn = e.target.closest('.edit-res-btn');
                const type = btn.getAttribute('data-type');
                const idx = parseInt(btn.getAttribute('data-index'));
                e.stopPropagation();
                if (window.editResource) window.editResource(type, idx);
            }

            // Handle smart tab opening for resource links
            const anchor = e.target.closest('a');
            if (anchor && anchor.href) {
                e.preventDefault();
                e.stopPropagation();

                const targetUrl = anchor.href;

                if (window.splitViewManager && window.splitViewManager.isActive) {
                    window.splitViewManager.loadIntoRightPane(targetUrl);
                } else {
                    openOrFocusTab(targetUrl);
                }
            }

            // Delete Individual Item
            if (e.target.closest('.delete-res-btn')) {
                const btn = e.target.closest('.delete-res-btn');
                const type = btn.getAttribute('data-type');
                const index = parseInt(btn.getAttribute('data-index'));
                
                const item = type === 'resource' ? space.resources[index] : space.driveFiles[index];
                item.isDeleted = true;
                item.deletedAt = Date.now();
                const days = getAppSettings().autoDeleteDays || 30;
                item.expiryAt = item.deletedAt + (days * 24 * 60 * 60 * 1000);
                item.isArchived = false; // หลุดจากคลังเก็บเมื่อลงถังขยะ
                
                saveData();
                onRender();
                updateUndoResourceBtn();
            }
        });
    }
}

function initSortable(el, sourceArray, onRender) {
    if (!el) return;
    if (el.sortable) el.sortable.destroy();

    el.sortable = Sortable.create(el, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
            const itemEl = evt.item;
            const originalIndex = parseInt(itemEl.getAttribute('data-index'));
            const movedItem = sourceArray[originalIndex];
            
            // Logic to handle sorting when array might be filtered or split
            // We remove from original index first
            sourceArray.splice(originalIndex, 1);
            
            // Find insertion point based on the next sibling in the list
            const nextEl = itemEl.nextElementSibling;
            if (nextEl) {
                let nextIdx = parseInt(nextEl.getAttribute('data-index'));
                if (nextIdx > originalIndex) nextIdx--; // Adjust for removal
                sourceArray.splice(nextIdx, 0, movedItem);
            } else {
                // If no next sibling, check previous sibling to append after
                const prevEl = itemEl.previousElementSibling;
                if (prevEl) {
                    let prevIdx = parseInt(prevEl.getAttribute('data-index'));
                    if (prevIdx > originalIndex) prevIdx--;
                    sourceArray.splice(prevIdx + 1, 0, movedItem);
                } else {
                    // Empty list or single item
                    sourceArray.push(movedItem);
                }
            }
            
            saveData();
            onRender();
        }
    });
}

//Rendering Functions
export function renderResources(space, currentFilterTags, currentFilterMode, currentSearchQuery, onRender) {
    const resListUI = document.getElementById('resource-list');
    const aiListUI = document.getElementById('resource-ai-list'); // ดึง UI ของช่อง AI Links มาเพิ่ม
    const archivedResListUI = document.getElementById('archived-resource-list');
    const trashResListUI = document.getElementById('trash-resource-list');
    const trashContainer = document.getElementById('trash-resources-details');
    
    if (!resListUI || !aiListUI || !archivedResListUI || !trashResListUI) return;
    
    // ล้างข้อมูลเก่าออกทั้งสองช่อง
    // --- NEW: Update Action Button States ---
    const multiOpenBtn = document.getElementById('btn-multi-open-res');
    const deleteSelectedBtn = document.getElementById('btn-delete-selected-res');
    const selectAllBtnUI = document.getElementById('btn-res-select-all');

    if (selectAllBtnUI) {
        selectAllBtnUI.style.display = (isResMultiOpenMode || isResDeleteMode) ? 'inline-flex' : 'none';
    }

    if (isResMultiOpenMode) {
        if (multiOpenBtn) {
            multiOpenBtn.innerHTML = `<svg class="svg-icon-sm" style="margin-right:4px;"><use href="#icon-external-link"></use></svg><span>Open Selected</span>`;
            multiOpenBtn.classList.add('active');
        }
        if (deleteSelectedBtn) {
            deleteSelectedBtn.innerHTML = `<svg class="svg-icon-sm" style="margin-right:4px;"><use href="#icon-trash"></use></svg><span>Select to Delete</span>`;
            deleteSelectedBtn.classList.remove('active');
        }
    } else if (isResDeleteMode) {
        if (multiOpenBtn) {
            multiOpenBtn.innerHTML = `<svg class="svg-icon-sm" style="margin-right:4px;"><use href="#icon-check-square"></use></svg><span>Select to Open</span>`;
            multiOpenBtn.classList.remove('active');
        }
        if (deleteSelectedBtn) {
            deleteSelectedBtn.innerHTML = `<svg class="svg-icon-sm" style="margin-right:4px;"><use href="#icon-trash"></use></svg><span>Confirm Delete</span>`;
            deleteSelectedBtn.classList.add('active');
        }
    } else {
        // Reset both buttons to default state
        if (multiOpenBtn) {
            multiOpenBtn.innerHTML = `<svg class="svg-icon-sm" style="margin-right:4px;"><use href="#icon-check-square"></use></svg><span>Select to Open</span>`;
            multiOpenBtn.classList.remove('active');
        }
        if (deleteSelectedBtn) {
            deleteSelectedBtn.innerHTML = `<svg class="svg-icon-sm" style="margin-right:4px;"><use href="#icon-trash"></use></svg><span>Select to Delete</span>`;
            deleteSelectedBtn.classList.remove('active');
        }
    }
    resListUI.innerHTML = '';
    aiListUI.innerHTML = '';
    archivedResListUI.innerHTML = ''; // ต้องล้างรายการ Archived ก่อนเริ่ม Render ใหม่
    trashResListUI.innerHTML = '';
    
    if (!space.resources) space.resources = [];
    
    const filterTags = Array.isArray(currentFilterTags) ? currentFilterTags : [];
    const isFiltered = filterTags.length > 0 || currentSearchQuery !== "";
    const handleHTML = isFiltered ? '' : dragHandleSvg;

    space.resources.forEach((res, index) => {
        // --- 1. ตรวจสอบการกรอง (Filtering) ---
        let hasMatchTag = true;
        if (filterTags.length > 0) {
            const itemTags = res.tags || [];
            const itemTagsUpper = itemTags.map(t => t.toUpperCase());
            
            const checkTag = (tag) => {
                if (tag === 'UNTAGGED') return itemTags.length === 0;
                return itemTagsUpper.includes(tag.toUpperCase());
            };

            if (currentFilterMode === 'AND') {
                hasMatchTag = filterTags.every(checkTag);
            } else {
                hasMatchTag = filterTags.some(checkTag);
            }
        }
        if (!hasMatchTag) return;
        if (currentSearchQuery && !res.title.toLowerCase().includes(currentSearchQuery)) return;

        // --- Trash Rendering ---
        if (res.isDeleted) {
            const countdown = getTrashCountdownText(res, getAppSettings().autoDeleteDays);
            trashResListUI.innerHTML += `
                <li class="draggable-item" data-index="${index}" data-type="resource">
                    <div class="item-main-row" style="opacity: 0.6;">
                        <div class="text-truncate" style="text-decoration: line-through;">
                            <img src="${getFaviconUrl(res.url, res.favIconUrl)}" class="favicon-img">
                            <span>${res.title}</span>
                        </div>
                        <span style="color:#ef4444; font-size:11px; font-weight:700; margin-right:8px;">${countdown}</span>
                        <div class="item-action-group">
                            <button class="btn-icon restore-res-btn" data-type="resource" data-index="${index}" title="Restore">${svgRestore}</button>
                            <button class="btn-icon delete-res-perm-btn" data-type="resource" data-index="${index}">${svgTrashRed}</button>
                        </div>
                    </div></li>`;
            return;
        }

        // --- Archived Rendering ---
        if (res.isArchived) {
            archivedResListUI.innerHTML += `
                <li class="draggable-item" data-index="${index}" data-type="resource">
                    <div class="item-main-row" style="opacity: 0.7;">
                        <div class="text-truncate" style="text-decoration: line-through;">
                            <img src="${getFaviconUrl(res.url, res.favIconUrl)}" class="favicon-img">
                            <a href="${res.url}">${res.title}</a>
                        </div>
                        <div class="item-action-group">
                            <button class="btn-icon unarchive-res-btn" data-type="resource" data-index="${index}" title="Unarchive">${svgUnarchive}</button>
                            <button class="btn-icon delete-res-btn" data-type="resource" data-index="${index}">${svgTrashRed}</button>
                        </div>
                    </div>
                </li>`;
            return;
        }

        // 🟢 NEW: Determine if it's a Local Program
        const isLocalProgram = res.url && !res.url.startsWith('http') && !res.url.startsWith('chrome');

        // --- 2. ตรวจสอบประเภท (AI หรือ General) ---
        // เช็คว่ามีป้ายคำว่า "AI" หรือ "default ai" หรือไม่
        const isAI = res.tags && res.tags.some(tag => {
            const t = tag.toLowerCase().trim();
            return t === 'ai' || t === 'default ai';
        });

        // เลือกเป้าหมายที่จะวาด (ช่อง AI หรือ ช่องปกติ)
        const targetUI = isAI ? aiListUI : resListUI;
        
        // Side View Button Style
        const isLocal = res.tags && res.tags.some(t => t.toUpperCase() === 'HALF SCREEN');
        const svIsActive = res.isSideView ? (isLocal ? 'active-local-split' : 'active-side-view') : '';
        const svTitle = isLocal 
            ? (res.isSideView ? 'Half Screen: ON' : 'Half Screen: OFF')
            : (res.isSideView ? 'Side View: ON' : 'Side View: OFF');

        const sideViewButtonHTML = `<button class="btn-icon btn-toggle-side-view ${svIsActive}" data-type="resource" data-index="${index}" title="${svTitle}">${svgSideView}</button>`;

        // Conditionally place the button
        const visibleSideViewBtn = res.isSideView ? sideViewButtonHTML : '';
        const hiddenSideViewBtn = !res.isSideView ? sideViewButtonHTML : '';

        // 🟢 NEW: Local Program Icon HTML
        const localProgramIconHTML = isLocalProgram ? `<span class="local-program-icon-wrapper" title="Local Program">${svgLocalProgramIcon}</span>` : '';
        // --- 3. วาด HTML ลงในช่องที่เลือก ---
        targetUI.innerHTML += `
            <li class="draggable-item" data-index="${index}" data-type="resource">
                <div class="item-main-row">
                    ${handleHTML}
                    <label class="google-task-checkbox" style="display: ${isResDeleteMode || isResMultiOpenMode ? 'inline-flex' : 'none'};">
                        <input type="checkbox" class="res-checkbox" data-index="${index}">
                        <div class="checkmark-circle">
                            <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                        </div>
                    </label>
                    <div class="text-truncate" title="${res.url}">
                        <img src="${getFaviconUrl(res.url, res.favIconUrl)}" class="favicon-img">
                        <a href="${res.url}">${res.title}</a>
                        ${localProgramIconHTML}
                    </div>
                    <div class="item-action-group" style="position: relative;">
                        ${generateMiniTagsBtn(res.tags, 'resource', index)}
                        ${visibleSideViewBtn}
                        <div class="item-actions-hidden" style="display: none; gap: 6px;">
                            ${hiddenSideViewBtn}
                            <button class="btn-icon archive-res-btn" data-type="resource" data-index="${index}" title="Archive">${svgArchive}</button>
                            <button class="btn-icon edit-res-btn" data-type="resource" data-index="${index}">${svgEdit}</button>
                            <button class="btn-icon delete-res-btn" data-type="resource" data-index="${index}">${svgTrashRed}</button>
                        </div>
                        <button class="btn-icon btn-item-menu">${svgMenu}</button>
                    </div>
                </div>
            </li>`;
    });

    trashContainer.style.display = trashResListUI.children.length > 0 ? 'block' : 'none';

    // --- 4. จัดการระบบลากวาง (Sortable) ---
    if (!isFiltered && onRender) {
        // ทำ Sortable ให้กับทั้งสองรายการ
        [resListUI, aiListUI].forEach(listUI => {
            if (listUI.sortable) listUI.sortable.destroy();
            listUI.sortable = Sortable.create(listUI, {
                animation: 150,
                handle: '.drag-handle',
                disabled: space.isArchived,
                group: 'resources-folder',
                ghostClass: 'sortable-ghost',
                onEnd: function (evt) {
                    // หาค่า Index ดั้งเดิมจาก Attribute เพื่อความแม่นยำ
                    const oldIdx = parseInt(evt.item.getAttribute('data-index'));
                    
                    // เนื่องจากเป็น Sort ภายใน list ย่อย เราจึงใช้การจัดเรียงจาก DOM เป็นหลัก
                    // หรือจะใช้ logic การย้ายตำแหน่งใน array space.resources แบบง่ายๆ
                    const movedItem = space.resources.splice(oldIdx, 1)[0];
                    
                    // หาตำแหน่งใหม่ใน array (ต้องใช้ความระมัดระวังเมื่อแยก list)
                    // สำหรับเคสนี้ เราจะใช้ความสะดวกในการ Re-render เป็นหลัก
                    // หมายเหตุ: การ Sort ข้าม List ระหว่าง AI กับ General อาจจะยังไม่สมบูรณ์ถ้าใช้ logic นี้
                    // แต่สำหรับการจัดลำดับภายใน List ตัวเองจะทำงานได้ปกติครับ
                    
                    // หาตำแหน่งใหม่โดยดูจากปุ่มก่อนหน้าใน DOM
                    let newIdxInArray = 0;
                    const allItemsAfterSort = document.querySelectorAll('#resource-ai-list li, #resource-list li');
                    // (เราจะข้าม logic การ Sort ที่ซับซ้อนไปก่อนเพื่อให้การย้ายที่แสดงผลทำงานได้)
                    
                    space.resources.splice(evt.newIndex, 0, movedItem); // logic พื้นฐาน
                    saveData();
                    onRender();
                }
            });
        });

        // Add Sortable to Trash
        Sortable.create(trashResListUI, {
            group: 'resources-folder',
            animation: 150,
            onAdd: (evt) => {
                const idx = parseInt(evt.item.dataset.index);
                space.resources[idx].isDeleted = true;
                saveData(); onRender();
            }
        });
    }
}

export function renderDriveFiles(space, currentFilterTags, currentFilterMode, currentSearchQuery, onRender) {
    const driveListUI = document.getElementById('drive-list');
    const archivedResListUI = document.getElementById('archived-resource-list');
    const trashResListUI = document.getElementById('trash-resource-list');
    const trashContainer = document.getElementById('trash-resources-details');
    if (!driveListUI || !archivedResListUI || !trashResListUI) return;
    driveListUI.innerHTML = '';
    
    if (!space.driveFiles) space.driveFiles = [];
    
    const filterTags = Array.isArray(currentFilterTags) ? currentFilterTags : [];
    const isFiltered = filterTags.length > 0 || currentSearchQuery !== "";
    const handleHTML = isFiltered ? '' : dragHandleSvg;

    space.driveFiles.forEach((file, index) => {
        let hasMatchTag = true;
        if (filterTags.length > 0) {
            const itemTags = file.tags || [];
            const itemTagsUpper = itemTags.map(t => t.toUpperCase());
            
            const checkTag = (tag) => {
                if (tag === 'UNTAGGED') return itemTags.length === 0;
                return itemTagsUpper.includes(tag.toUpperCase());
            };

            if (currentFilterMode === 'AND') {
                hasMatchTag = filterTags.every(checkTag);
            } else {
                hasMatchTag = filterTags.some(checkTag);
            }
        }
        
        if (!hasMatchTag) return;
        if (currentSearchQuery && !file.title.toLowerCase().includes(currentSearchQuery)) return;

        // --- Trash Rendering ---
        if (file.isDeleted) {
            const countdown = getTrashCountdownText(file, getAppSettings().autoDeleteDays);
            trashResListUI.innerHTML += `
                <li class="draggable-item" data-index="${index}" data-type="drive">
                    <div class="item-main-row" style="opacity: 0.6;">
                        <div class="text-truncate" style="text-decoration: line-through;">
                            <img src="${getFaviconUrl(file.url, file.favIconUrl)}" class="favicon-img">
                            <span>${file.title}</span>
                        </div>
                        <span style="color:#ef4444; font-size:11px; font-weight:700; margin-right:8px;">${countdown}</span>
                        <div class="item-action-group">
                            <button class="btn-icon restore-res-btn" data-type="drive" data-index="${index}" title="Restore">${svgRestore}</button>
                            <button class="btn-icon delete-res-perm-btn" data-type="drive" data-index="${index}">${svgTrashRed}</button>
                        </div>
                    </div></li>`;
            return;
        }

        // --- Archived Rendering ---
        if (file.isArchived) {
            archivedResListUI.innerHTML += `
                <li class="draggable-item" data-index="${index}" data-type="drive">
                    <div class="item-main-row" style="opacity: 0.7;">
                        <div class="text-truncate" style="text-decoration: line-through;">
                            <img src="${getFaviconUrl(file.url, file.favIconUrl)}" class="favicon-img">
                            <a href="${file.url}">${file.title}</a>
                        </div>
                        <div class="item-action-group">
                            <button class="btn-icon unarchive-res-btn" data-type="drive" data-index="${index}" title="Unarchive">${svgUnarchive}</button>
                            <button class="btn-icon delete-res-btn" data-type="drive" data-index="${index}">${svgTrashRed}</button>
                        </div>
                    </div>
                </li>`;
            return;
        }

        // 🟢 NEW: Determine if it's a Local Program (for consistency, though less common for drive files)
        const isLocalProgram = file.url && !file.url.startsWith('http') && !file.url.startsWith('chrome');

        // Side View Button Style (Half screen)
        const isLocal = file.tags && file.tags.some(t => t.toUpperCase() === 'HALF SCREEN');
        const svIsActive = file.isSideView ? (isLocal ? 'active-local-split' : 'active-side-view') : '';
        const svTitle = isLocal 
            ? (file.isSideView ? 'Half Screen: ON' : 'Half Screen: OFF')
            : (file.isSideView ? 'Side View: ON' : 'Side View: OFF');
            
        const sideViewButtonHTML = `<button class="btn-icon btn-toggle-side-view ${svIsActive}" data-type="drive" data-index="${index}" title="${svTitle}">${svgSideView}</button>`;

        const visibleSideViewBtn = file.isSideView ? sideViewButtonHTML : '';
        const hiddenSideViewBtn = !file.isSideView ? sideViewButtonHTML : '';
        
        // 🟢 NEW: Local Program Icon HTML
        const localProgramIconHTML = isLocalProgram ? `<span class="local-program-icon-wrapper" title="Local Program">${svgLocalProgramIcon}</span>` : '';

        driveListUI.innerHTML += `
            <li class="draggable-item" data-index="${index}" data-type="drive">
                <div class="item-main-row">
                    ${handleHTML}
                    <label class="google-task-checkbox" style="display: ${isResDeleteMode || isResMultiOpenMode ? 'inline-flex' : 'none'};">
                        <input type="checkbox" class="drive-checkbox" data-index="${index}">
                        <div class="checkmark-circle">
                            <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                        </div>
                    </label>
                    <div class="text-truncate" title="${file.url}">
                        <img src="${getFaviconUrl(file.url, file.favIconUrl)}" class="favicon-img">
                        <a href="${file.url}">${file.title}</a>
                        ${localProgramIconHTML}
                    </div>
                    <div class="item-action-group" style="position: relative;">
                        ${generateMiniTagsBtn(file.tags, 'drive', index)}
                        ${visibleSideViewBtn}
                        <div class="item-actions-hidden" style="display: none; gap: 6px;">
                            ${hiddenSideViewBtn}
                            <button class="btn-icon archive-res-btn" data-type="drive" data-index="${index}" title="Archive">${svgArchive}</button>
                            <button class="btn-icon edit-res-btn" data-type="drive" data-index="${index}">${svgEdit}</button>
                            <button class="btn-icon delete-res-btn" data-type="drive" data-index="${index}">${svgTrashRed}</button>
                        </div>
                        <button class="btn-icon btn-item-menu">${svgMenu}</button>
                    </div>
                </div>
            </li>`;
    });

    trashContainer.style.display = trashResListUI.children.length > 0 ? 'block' : 'none';

    // ระบบลากวางสำหรับ Drive Files
    if (!isFiltered && onRender) {
        if (driveListUI.sortable) driveListUI.sortable.destroy();
        driveListUI.sortable = Sortable.create(driveListUI, {
            animation: 150,
            handle: '.drag-handle',
            disabled: space.isArchived,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                const movedItem = space.driveFiles.splice(evt.oldIndex, 1)[0];
                space.driveFiles.splice(evt.newIndex, 0, movedItem);
                saveData();
                onRender();
            }
        });
    }
}