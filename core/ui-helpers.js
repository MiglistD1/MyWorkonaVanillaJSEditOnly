import { svgTag, dragHandleSvg, googleTasksIcon, svgEdit, svgTrashRed, svgPencil, svgRestore } from './icons.js';
import { getShortDate, getAppSettings } from './storage.js';

export function generateMiniTagsBtn(itemTags, type, index) {
  const count = itemTags ? itemTags.length : 0;
  const btnText = count > 0 ? `${svgTag} ${count}` : '+ Tag';
  const activeClass = count > 0 ? 'has-tags' : '';
  return `<button class="btn-add-mini-tag btn-edit-tags ${activeClass}" data-type="${type}" data-index="${index}">${btnText}</button>`;
}

/**
 * คำนวณเวลาที่เหลือในถังขยะ
 */
export function getTrashCountdownText(item, autoDeleteDays) {
    if (!item.deletedAt && !item.expiryAt) return "";
    // ใช้ expiryAt ที่บันทึกไว้ในตัว หรือคำนวณใหม่กรณีเป็นข้อมูลเก่าที่ยังไม่มีฟิลด์นี้
    const expiryAt = item.expiryAt || (item.deletedAt + (autoDeleteDays || 30) * 24 * 60 * 60 * 1000);
    const remaining = expiryAt - Date.now();
    if (remaining <= 0) return "Deleting...";
    
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${mins}m`;
}

export function getFaviconUrl(tabUrl, favIconUrl) {
    if (favIconUrl && favIconUrl.startsWith('data:')) {
        return favIconUrl;
    }
    try {
        // กลับมาใช้ API ของ Chrome Extension (ต้องมี permission: "favicon")
        // วิธีนี้จะได้ไอคอน Google Apps (Docs, Sheets, Drive) ที่ถูกต้องแยกตามประเภท
        const url = new URL(chrome.runtime.getURL("/_favicon/"));
        url.searchParams.set("pageUrl", tabUrl);
        url.searchParams.set("size", "32");
        return url.toString();
    } catch (e) {
        // Fallback: รูปโลก Minimal (SVG)
        return 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
    }
}

/**
 * Opens a new tab or focuses an existing one using Smart URL Normalization.
 * Handles Google Docs/Sheets by matching File ID regardless of view/edit mode.
 * @param {string} url The target URL to open.
 */
export function openOrFocusTab(url) {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
        window.open(url, '_blank');
        return;
    }

    try {
        const targetUrlObj = new URL(url);

        chrome.tabs.query({}, (tabs) => {
            const match = tabs.find(tab => {
                if (!tab.url) return false;
                try {
                    const tabUrlObj = new URL(tab.url);

                    // 1. Check Origin (Protocol + Host)
                    if (tabUrlObj.origin !== targetUrlObj.origin) return false;

                    // 2. Special Case: Google Docs/Sheets/Slides (Match by File ID)
                    if (targetUrlObj.hostname === 'docs.google.com') {
                        // Regex to capture /d/FILE_ID
                        const idRegex = /\/d\/([a-zA-Z0-9-_]+)/;
                        const targetMatch = targetUrlObj.pathname.match(idRegex);
                        const tabMatch = tabUrlObj.pathname.match(idRegex);
                        
                        if (targetMatch && tabMatch && targetMatch[1] === tabMatch[1]) {
                            return true;
                        }
                    }

                    // 3. Special Case: Google Tasks (Match any tasks.google.com)
                    if (targetUrlObj.hostname === 'tasks.google.com') {
                        return true;
                    }

                    // Special Case: Google Keep (Match any keep.google.com)
                    if (targetUrlObj.hostname === 'keep.google.com') {
                        return true;
                    }

                    // 4. General Case: Compare Pathnames (Ignore trailing slash, query, hash)
                    const cleanPath1 = tabUrlObj.pathname.replace(/\/$/, "");
                    const cleanPath2 = targetUrlObj.pathname.replace(/\/$/, "");
                    
                    return cleanPath1 === cleanPath2;
                } catch (e) { return false; }
            });

            if (match) {
                chrome.tabs.update(match.id, { url: url, active: true });
                if (match.windowId) {
                    chrome.windows.update(match.windowId, { focused: true });
                }
            } else {
                chrome.tabs.create({ url: url });
            }
        });
    } catch (e) {
        console.error("Invalid URL passed to openOrFocusTab:", url);
        window.open(url, '_blank');
    }
}

/**
 * Generates the HTML for a single task item.
 * @param {Object} task The task object.
 * @param {number} index The index of the task in the array.
 * @param {Object} options Configuration options.
 */
export function generateTaskHTML(task, index, {
    showSpaceBadge = false,
    spaceName = '',
    spaceId = null,
    isMasterView = false,
    isProminentHidden = false,
    isFiltered = false,
    depth = 0,
    parentIndex = null, // For subtasks
    showActions = false, // New parameter to control visibility of collapsible actions
    isTrash = false, // New parameter for Trash view
    addingSubtaskToIndex = null,
} = {}) {
    if (!task) return '';

    const isSubtask = depth > 0;
    const svgBreakLink = `<svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.72 6.72 3 10.44a4 4 0 0 0 5.66 5.66l1.42-1.42M13.56 13.56l1.42-1.42a4 4 0 0 0-5.66-5.66l-1.42 1.42M8 12h8M3 21l18-18"/></svg>`;
    
    const prominentClass = (task.isProminent && !isSubtask) ? 'prominent' : '';
    const draggableClass = (isFiltered || isSubtask) ? '' : 'draggable-item';
    const handleHTML = isFiltered ? '' : `<div class="drag-handle" style="display: flex; align-items: center; cursor: grab; opacity: 0.4; flex-shrink: 0;">${dragHandleSvg}</div>`;

    // Conditional logic for Checkboxes and Data attributes based on depth
    const checkboxClass = isSubtask ? 'subtask-check-box' : (isMasterView ? 'master-task-checkbox' : 'task-check-box');
    const checkboxDataAttrs = isSubtask 
        ? `data-parent-index="${parentIndex}" data-sub-index="${index}"` 
        : (isMasterView ? `data-space="${spaceId}" data-idx="${index}"` : `data-index="${index}"`);

    const editBtnClass = isMasterView ? 'edit-task-btn' : 'edit-task-text-btn';
    const cloudIndicator = (task.googleTaskId) ? `<span style="display: inline-flex; align-items: center; margin-right: 6px; flex-shrink: 0; color: #2684fc;">${googleTasksIcon}</span>` : '';
    
    const isDateOverdue = task.dueDate && !task.completed && new Date(task.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0);
    const dateColor = isDateOverdue ? '#ef4444' : (isSubtask ? 'var(--primary-color)' : 'var(--text-muted)');
    const textStyle = (task.completed) 
        ? "flex: 1; word-break: break-word; white-space: normal; line-height: 1.4; color: var(--text-muted); text-decoration: line-through; opacity: 0.8;" 
        : `flex: 1; word-break: break-word; white-space: normal; line-height: 1.4; color: ${task.isProminent && !isSubtask ? 'var(--primary-color)' : 'var(--text-main)'}; ${task.isProminent && !isSubtask ? 'font-weight: 700;' : ''}`;

    let dateDisplay = task.dueDate ? getShortDate(new Date(task.dueDate)) : '';
    if (task.completed && task.createdAt && task.completedAt) {
        let diffDays = Math.ceil(Math.abs(new Date(task.completedAt).setHours(0,0,0,0) - new Date(task.createdAt).setHours(0,0,0,0)) / (1000 * 60 * 60 * 24));
        dateDisplay = `${getShortDate(new Date(task.createdAt))} - ${getShortDate(new Date(task.completedAt))} (${diffDays===0?"0 Days":diffDays+" Days"})`;
    }

    // Recursively render Sub-tasks
    let subtasksHTML = '';
    if (!isSubtask) {
        let subItems = '';
        if (task.subtasks && task.subtasks.length > 0) {
            subItems = task.subtasks.map((sub, subIdx) => { 
                return generateTaskHTML(sub, subIdx, { 
                    depth: depth + 1, parentIndex: index, isFiltered, showActions, 
                    isMasterView, spaceId, showSpaceBadge, spaceName 
                });
            }).join('');
        }

        // Add "New Sub-task" input row if active
        if (addingSubtaskToIndex === index) {
            subItems += `
                <li class="subtask-item subtask-add-row">
                    <div style="width: 18px; margin-right: 14px; opacity: 0.3;">●</div>
                    <input type="text" class="subtask-inline-input subtask-add-input" data-parent="${index}" placeholder="New sub-task...">
                </li>`;
        }

        // เรนเดอร์คอนเทนเนอร์เสมอเพื่อให้เป็นเป้าหมายในการวาง (Drop Target) สำหรับงานหลักที่ถูกลากเข้ามา
        subtasksHTML = `<ul class="subtask-list" data-parent-index="${index}">${subItems}</ul>`;
    }

    const hasLink = task.linkData && task.linkData.url;
    let linkTypeClass = '';
    if (hasLink) {
        const url = task.linkData.url.toLowerCase();
        if (url.includes('keep.google.com')) {
            linkTypeClass = 'link-keep';
        } else if (url.includes('docs.google.com/document')) {
            linkTypeClass = 'link-docs';
        } else if (url.includes('docs.google.com/spreadsheets')) {
            linkTypeClass = 'link-sheets';
        } else {
            linkTypeClass = 'link-other';
        }
    }
    const linkBtnClass = hasLink ? `btn-icon task-link-btn has-link ${linkTypeClass}` : 'btn-icon task-link-btn';
    const iconHref = hasLink ? '#icon-notebook' : '#icon-link';
    const linkBtnHTML = `<button class="${linkBtnClass}" data-index="${index}" ${isSubtask ? `data-parent-index="${parentIndex}"` : ''} ${isMasterView ? `data-space-id="${spaceId}"` : ''} title="Task Link"><svg class="svg-icon-sm"><use href="${iconHref}"></use></svg></button>`;

    if (isTrash) {
        const countdown = getTrashCountdownText(task, getAppSettings().autoDeleteDays);
        return `<li class="task-item" data-index="${index}" style="opacity:0.7;">
            <div class="item-main-row" style="padding:4px 0;">
                <span style="flex:1; text-decoration:line-through; font-size:13.5px;">${task.text}</span>
                <span style="color:#ef4444; font-size:11px; font-weight:700; margin-right:8px;">${countdown}</span>
                <div class="item-action-group"><button class="btn-icon restore-task-btn" data-index="${index}" title="Restore">${svgRestore}</button><button class="btn-icon delete-task-perm-btn" data-index="${index}">${svgTrashRed}</button></div>
            </div></li>`;
    }

    let actionButtons = '';
    const subtaskSyncBtn = isSubtask ? `<button class="btn-icon subtask-sync-toggle-btn ${task.googleTaskId ? 'active' : ''}" data-parent-index="${parentIndex}" data-sub-index="${index}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} title="Toggle Google Tasks Sync" style="padding: 2px;">${googleTasksIcon}</button>` : '';

    // Actions that are always visible (tags, prominent button, link button if it has a link)
    actionButtons += isSubtask ? `
        ${generateMiniTagsBtn(task.tags, 'subtask', index)}
        ${hasLink ? linkBtnHTML : ''}
        <button class="btn-icon convert-to-main-btn" data-parent-index="${parentIndex}" data-sub-index="${index}" title="Break into Main Task">${svgBreakLink}</button>
        ${subtaskSyncBtn}
    ` : `
        ${generateMiniTagsBtn(task.tags, 'task', index)}
        ${hasLink ? linkBtnHTML : ''}
    `;

    // Content of the collapsible actions (add subtask, edit, delete, link button if no link)
    const collapsibleActionsContent = `
            ${!hasLink ? linkBtnHTML : ''}
            ${(!isSubtask) ? `<button class="btn-icon add-subtask-btn" data-index="${index}" title="Add Sub-task" style="margin: 0; padding: 2px;"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>` : ''}
            ${isSubtask ? `
                <button class="btn-icon edit-subtask-btn" data-parent-index="${parentIndex}" data-sub-index="${index}" data-id="${task.id}" title="Edit Sub-task">${svgEdit}</button>
                <button class="btn-icon delete-subtask-btn" data-parent-index="${parentIndex}" data-sub-index="${index}" data-id="${task.id}" title="Delete Sub-task">${svgTrashRed}</button>
            ` : `
                <button class="btn-icon ${editBtnClass}" data-index="${index}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} style="margin: 0; padding: 2px;">${svgEdit}</button>
                <button class="btn-icon delete-task-btn" data-index="${index}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} style="margin: 0; padding: 2px;">${svgTrashRed}</button>
            `}
    `;

    if (showActions) {
        // If global toggle is ON, render all actions directly visible
        actionButtons += `<div class="collapsible-actions" style="display: flex; align-items: center; gap: 6px;">${collapsibleActionsContent}</div>`;
    } else {
        // If global toggle is OFF, render the "More Actions" button and the collapsible actions hidden by default
        actionButtons += `<span class="toggle-actions-btn circle-icon" title="More Actions"></span>`;
        actionButtons += `<div class="collapsible-actions" style="display: none; align-items: center; gap: 6px;">${collapsibleActionsContent}</div>`;
    }

    const itemType = isSubtask ? 'subtask' : 'task';
    return `
    <li class="${isSubtask ? 'subtask-item' : 'task-item'} ${draggableClass} ${prominentClass}" data-index="${index}" data-type="${itemType}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} style="list-style: none; width: 100%; margin-bottom: 0px; border-bottom: 1px solid transparent;">
        <div class="item-main-row" style="display: flex; align-items: center; gap: 6px; padding: 2px 0; width: 100%; min-height: 28px;">
            ${handleHTML}
            ${!isSubtask ? `<button class="btn-icon btn-prominent-task ${task.isProminent ? 'active' : ''}" data-index="${index}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} title="Mark as Next Up" style="margin: 0; padding: 2px; flex-shrink: 0; color: ${task.isProminent ? 'var(--primary-color)' : 'var(--text-muted)'}; display: ${isProminentHidden ? 'none' : 'inline-flex'};">
                <svg class="svg-icon-sm"><use href="#icon-flag"></use></svg>
            </button>` : ''}

            <label class="google-task-checkbox">
                <input type="checkbox" class="${checkboxClass}" ${checkboxDataAttrs} ${task.completed ? 'checked' : ''}>
                <div class="checkmark-circle">
                    <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                </div>
            </label>

            <div style="flex: 1; min-width: 0; display: flex; align-items: center;">
                <div class="task-text-container" style="display: flex; align-items: center; font-size: 13.5px; width: 100%;">
                    ${cloudIndicator}
                    <span class="task-actual-text" contenteditable="true" style="${textStyle}">${task.text}</span>
                    ${showSpaceBadge ? `<span class="space-tag" style="margin-left: 8px; flex-shrink: 0;">${spaceName}</span>` : ''}
                </div>
            </div>

            <div class="item-action-group" style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: auto;">
                <span class="task-date" style="font-size: 11px; opacity: 0.6; white-space: nowrap; color: ${dateColor};">${dateDisplay}</span> 
                ${actionButtons}
            </div>
        </div>
        ${subtasksHTML}
    </li>`;
}

/**
 * Attaches specific event listeners to a subtask list container.
 * Handles circular checkbox status and deletion buttons via delegation.
 * @param {HTMLElement} container The .subtask-list element.
 * @param {Object} space The specific space object containing the tasks.
 * @param {Function} onUpdate Callback to handle persistence and re-render.
 */
export function attachSubtaskEventListeners(container, space, onRenderCallback, googleApiCallbacks = {}, onUpdate) {
    if (!container) return;

    // 1. Handle Status Toggling (Checkbox)
    container.addEventListener('change', (e) => {
        if (e.target.classList.contains('subtask-check-box')) {
            const pIdx = parseInt(e.target.getAttribute('data-parent-index'));
            const sIdx = parseInt(e.target.getAttribute('data-sub-index')); // This is the index within the subtasks array
            
            if (space.tasks[pIdx]?.subtasks?.[sIdx]) {
                const subtask = space.tasks[pIdx].subtasks[sIdx];
                subtask.completed = e.target.checked;

                // Sync with Google Tasks API if enabled and subtask has a Google Task ID
                if (subtask.googleTaskId && googleApiCallbacks.isGoogleSyncEnabled() && googleApiCallbacks.getGoogleAuthToken()) {
                    googleApiCallbacks.fetchGoogleAPI(`/lists/${googleApiCallbacks.getCurrentGoogleListId()}/tasks/${subtask.googleTaskId}`, 'PATCH', { status: subtask.completed ? 'completed' : 'needsAction' });
                }
            }
            if (space.tasks[pIdx]?.subtasks?.[sIdx]) {
                space.tasks[pIdx].subtasks[sIdx].completed = e.target.checked;
                onUpdate();
            }
        }
    });

    // 2. Handle Action Buttons (Delete)
    container.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.delete-subtask-btn');
        if (delBtn) {
            const pIdx = parseInt(delBtn.getAttribute('data-parent-index'));
            const sIdx = parseInt(delBtn.getAttribute('data-sub-index'));
            if (space.tasks[pIdx]?.subtasks) {
                space.tasks[pIdx].subtasks.splice(sIdx, 1);
                onUpdate();
            }
        }
    });
}

/**
 * Attaches inline editing listeners to a container for task items.
 */
export function attachTaskInlineEditListeners(container, getSpaceFn, callbacks = {}) {
    const { fetchGoogleAPI, getGoogleAuthToken, getCurrentGoogleListId, saveData, onUpdate } = callbacks;

    // Handle Enter and Escape keys
    container.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('task-actual-text')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur(); // Trigger the blur event to save
            } else if (e.key === 'Escape') {
                e.preventDefault();
                const li = e.target.closest('li');
                if (!li) return;
                const idx = parseInt(li.dataset.index);
                const type = li.dataset.type;
                const space = getSpaceFn(li);
                if (!space) return;

                let originalText = "";
                if (type === 'task') {
                    originalText = space.tasks[idx].text;
                } else if (type === 'subtask') {
                    const pIdx = parseInt(li.closest('.subtask-list').dataset.parentIndex);
                    originalText = space.tasks[pIdx]?.subtasks?.[idx]?.text || "";
                }
                e.target.innerText = originalText;
                e.target.blur();
            }
        }
    });

    // Handle saving on blur
    container.addEventListener('blur', async (e) => {
        if (e.target.classList.contains('task-actual-text')) {
            const li = e.target.closest('li');
            if (!li) return;
            
            const idx = parseInt(li.dataset.index);
            const type = li.dataset.type;
            const space = getSpaceFn(li);
            if (!space) return;

            const newText = e.target.innerText.trim();
            let taskObj = null;

            if (type === 'task') {
                taskObj = space.tasks[idx];
            } else if (type === 'subtask') {
                const pIdx = parseInt(li.closest('.subtask-list').dataset.parentIndex);
                taskObj = space.tasks[pIdx]?.subtasks?.[idx];
            }

            if (taskObj) {
                const textChanged = taskObj.text !== newText;
                if (newText === "" && textChanged) {
                    e.target.innerText = taskObj.text; // Revert if empty
                    return;
                }

                taskObj.text = newText;
                
                // Google Tasks Sync
                if (textChanged && taskObj.googleTaskId && getGoogleAuthToken && getGoogleAuthToken() && fetchGoogleAPI) {
                    const listId = getCurrentGoogleListId ? getCurrentGoogleListId() : '@default';
                    const gTitle = `${newText} (S: ${space.name})`;
                    fetchGoogleAPI(`/lists/${listId}/tasks/${taskObj.googleTaskId}`, 'PATCH', { title: gTitle });
                }
                
                if (saveData) saveData();
                if (onUpdate) onUpdate();
            }
        }
    }, true);

    // Prevent formatting on paste
    container.addEventListener('paste', (e) => {
        if (e.target.classList.contains('task-actual-text')) {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        }
    });
}