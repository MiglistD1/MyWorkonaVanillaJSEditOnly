import { svgTag, dragHandleSvg, svgEdit, svgTrashRed, svgPencil, svgRestore, svgArchive, svgRepeat, svgManualRepeat } from './icons.js';
import { getShortDate, getAppSettings, getUnitCharFromThai, getFilterTags } from './storage.js';
import { eventBus, Events } from './EventBus.js';

/**
 * Generates the HTML for a mini tags button.
 * @param {Array} itemTags The tags for the item.
 * @param {string} type The type of the item.
 * @param {number} index The index of the item.
 * @param {number} [parentIndex=null] The index of the parent item.
 * @param {string} [spaceId=null] The ID of the space.
 * @returns {string} The HTML for the mini tags button.
 */
export function generateMiniTagsBtn(itemTags, type, index, parentIndex = null, spaceId = null) {
  const count = itemTags ? itemTags.length : 0;
  const isMobile = window.innerWidth <= 768;
  // บนมือถือ: ถ้ายังไม่มี Tag ให้เหลือแค่เครื่องหมาย +
  const btnText = count > 0 ? `${svgTag} ${count}` : (isMobile ? '+' : '+ Tag');
  const activeClass = count > 0 ? 'has-tags' : '';
  const pIdxAttr = parentIndex !== null ? `data-parent-index="${parentIndex}"` : '';
  const sIdAttr = spaceId !== null ? `data-space-id="${spaceId}"` : '';
  return `<button class="btn-add-mini-tag btn-edit-tags ${activeClass}" data-type="${type}" data-index="${index}" ${pIdxAttr} ${sIdAttr}>${btnText}</button>`;
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

    // 1. กรณีอยู่ในสภาพแวดล้อม Extension ให้ใช้ API ของ Chrome
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        try {
            const url = new URL(chrome.runtime.getURL("/_favicon/"));
            url.searchParams.set("pageUrl", tabUrl);
            url.searchParams.set("size", "32");
            return url.toString();
        } catch (e) { /* ถ้าล้มเหลวให้ไปข้อถัดไป */ }
    }

    // 2. กรณีเปิดผ่าน Web (เช่น GitHub Pages) ให้ใช้ Google Favicon Service แทนเพื่อให้เห็นไอคอนจริง
    if (tabUrl && tabUrl.startsWith('http')) {
        try {
            const domain = new URL(tabUrl).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch (e) { /* ถ้าดึงไม่ได้ให้ไปข้อสุดท้าย */ }
    }

    // 3. Fallback สุดท้าย: รูปโลก Minimal (SVG) - แก้ไขโดยใช้ %22 แทน " เพื่อไม่ให้ HTML attribute พัง
    return 'data:image/svg+xml;charset=utf-8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239ca3af%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22></circle><line x1=%222%22 y1=%2212%22 x2=%2222%22 y2=%2212%22></line><path d=%22M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z%22></path></svg>';
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
    addingSubtaskToId = null,
    nextDueDate = null, // New: Next date for repeating tasks
    subtaskNumber = null, // 🟢 New: ลำดับตัวเลขสำหรับงานย่อย
    parentId = null, // parent task's createdAt (set for subtasks so drag-drop can read it)
} = {}) {
    if (!task) return '';

    const isSubtask = depth > 0;
    const isCompletedOrDeleted = task.completed; // For line-through if completed
    const isActuallyDeleted = task.isDeleted; // For trash-specific styling and buttons
    const isMobile = window.innerWidth <= 768;

    const appSettings = getAppSettings();
    const templateClass = task.isFromTemplate ? 'is-from-template' : '';
    const focusedTask = appSettings.focusedTask;
    const isFocused = focusedTask && focusedTask.spaceId === spaceId && focusedTask.createdAt === task.createdAt; // 🟢 ตรวจสอบ createdAt ที่ถูกต้อง
    const focusActiveClass = isFocused ? 'is-focus-active' : '';

    // 🟢 NEW: Subtask count badge logic
    let subtaskCountBadge = '';
    if (!isSubtask && task.subtasks && task.subtasks.length > 0) {
        const totalSub = task.subtasks.length;
        const compSub = task.subtasks.filter(s => s.completed).length;
        const isAllDone = compSub === totalSub;
        const badgeBg = isAllDone ? '#10b981' : 'var(--primary-color)';
        // 🟢 ปรับสไตล์ Badge ให้เด่นชัดขึ้น และเปลี่ยนเป็นสีเขียวเมื่อเสร็จครบ
        subtaskCountBadge = `<span class="subtask-count-badge" style="font-size: 10px; color: white; font-weight: 900; background: ${badgeBg}; padding: 1px 7px; border-radius: 10px; flex-shrink: 0; line-height: 1; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: background 0.3s ease;">${compSub}/${totalSub}</span>`;
    }

    // NEW: Toggle Completed Subtasks Button HTML
    let hideCompletedSubtaskBtnHTML = '';
    if (!isSubtask && task.subtasks && task.subtasks.length > 0 && !isActuallyDeleted) {
        const isHidden = task.completedSubtasksHidden || false;
        const icon = isHidden ? '#icon-eye' : '#icon-eye-off';
        const title = isHidden ? 'Show Completed Subtasks' : 'Hide Completed Subtasks';
        // 🟢 ปรับสไตล์ให้เป็นสีแดงและเรืองแสงเมื่อมีการ "ซ่อน" (Active)
        const activeStyle = isHidden ? 'color: #ef4444; opacity: 1; background: rgba(239, 68, 68, 0.1); border-radius: 4px; box-shadow: 0 0 8px rgba(239, 68, 68, 0.2);' : '';
        hideCompletedSubtaskBtnHTML = `
            <button class="btn-icon hide-completed-subtasks-btn" data-index="${index}" data-space-id="${spaceId}" title="${title}" style="${activeStyle}">
                <svg class="svg-icon-sm"><use href="${icon}"></use></svg>
            </button>
        `;
    }

    // NEW: Toggle Subtasks Button HTML
    let toggleSubtaskBtnHTML = '';
    if (!isSubtask && task.subtasks && task.subtasks.length > 0 && !isActuallyDeleted) {
        const isSubtasksHidden = task.subtasksHidden || false;
        const icon = isSubtasksHidden ? '#icon-chevron-down' : '#icon-chevron-up'; // Minimal icons
        const title = isSubtasksHidden ? 'Show Subtasks' : 'Hide Subtasks';
        const prominentClass = !isSubtasksHidden ? 'active-red-prominent' : ''; // สีแดงเมื่อแสดง Subtask (ปุ่มหมายถึงซ่อน)
        toggleSubtaskBtnHTML = `
            <button class="btn-icon toggle-subtasks-btn ${prominentClass}" data-index="${index}" data-space-id="${spaceId}" title="${title}">
                <svg class="svg-icon-sm"><use href="${icon}"></use></svg>
            </button>
        `;
    }

    // 🟢 NEW: ชุดควบคุม Subtask แยกออกมาจากจุดไข่ปลา
    let subtaskSpecificActionsHTML = '';
    if (!isSubtask && task.subtasks && task.subtasks.length > 0 && !isActuallyDeleted) {
        const isControlsOpen = task.subtaskControlsOpen || false;
        const menuOpacity = isControlsOpen ? '1' : '0.8';
        subtaskSpecificActionsHTML = `
            <div class="subtask-actions-wrapper" style="display: inline-flex; align-items: center; position: relative;">
                <button class="btn-icon toggle-subtask-controls-btn" data-index="${index}" data-space-id="${spaceId}" title="Subtask Options" style="padding: 4px; color: var(--primary-color); opacity: ${menuOpacity};"><svg class="svg-icon-sm"><use href="#icon-subtasks"></use></svg></button>
                <div class="subtask-controls-hidden" style="display: ${isControlsOpen ? 'flex' : 'none'}; align-items: center; gap: 6px; margin-left: 4px;">
                    ${subtaskCountBadge}${hideCompletedSubtaskBtnHTML}${toggleSubtaskBtnHTML}
                </div>
            </div>`;
    }

    const svgBreakLink = `<svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.72 6.72 3 10.44a4 4 0 0 0 5.66 5.66l1.42-1.42M13.56 13.56l1.42-1.42a4 4 0 0 0-5.66-5.66l-1.42 1.42M8 12h8M3 21l18-18"/></svg>`;
    
    const prominentClass = task.isProminent ? 'prominent' : '';
    const draggableClass = (isFiltered || isSubtask) ? '' : 'draggable-item';

    // 🟢 แยกสี Icon ลากระหว่าง Main Task และ Subtask เพื่อให้เห็นความแตกต่างชัดเจน
    const handleColorClass = isSubtask ? 'subtask-drag-handle' : 'maintask-drag-handle';
    const handleHTML = isFiltered ? '' : dragHandleSvg.replace('class="drag-handle"', `class="drag-handle ${handleColorClass}"`);

    // Conditional logic for Checkboxes and Data attributes based on depth
    const checkboxClass = isSubtask ? 'subtask-check-box' : (isMasterView ? 'master-task-checkbox' : 'task-check-box');
    const checkboxDataAttrs = isSubtask 
        ? `data-parent-index="${parentIndex}" data-sub-index="${index}"` 
        : (isMasterView ? `data-space="${spaceId}" data-idx="${index}"` : `data-index="${index}"`);

    const editBtnClass = isMasterView ? 'edit-task-btn' : 'edit-task-text-btn';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDateObj = task.dueDate ? new Date(task.dueDate) : null;
    if (dueDateObj) dueDateObj.setHours(0, 0, 0, 0);
    
    const isOverdue = dueDateObj && dueDateObj < today && !task.completed && !task.isDeleted;
    const isToday = dueDateObj && dueDateObj.getTime() === today.getTime() && !task.completed && !task.isDeleted;
    const isFuture = (dueDateObj && dueDateObj > today && !task.completed && !task.isDeleted) || (!!nextDueDate && !task.isDeleted);
    const isSynced = !!task.calendarEventId;

    const textStyle = (isCompletedOrDeleted || isActuallyDeleted) 
        ? "word-break: break-word; white-space: normal; line-height: 1.4; color: var(--text-muted); text-decoration: line-through; opacity: 0.7;" 
        : `word-break: break-word; white-space: normal; line-height: 1.4; color: ${task.isProminent ? 'var(--primary-color)' : (isSynced ? '#166534' : 'var(--text-main)')}; ${(task.isProminent || isSynced) ? 'font-weight: 700;' : ''}`;

    // 🟢 ย่อวันที่ให้สั้นลงสำหรับมือถือ
    const formatDateMinimal = (d) => {
        if (!d || isNaN(d.getTime())) return "";
        const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const yearBE = d.getFullYear() + 543;
        return `${String(d.getDate()).padStart(2, '0')} ${m[d.getMonth()]} ${String(yearBE).slice(-2)}`;
    };

    let dateDisplay = task.dueDate ? formatDateMinimal(dueDateObj) : '';
    if (nextDueDate) {
        dateDisplay = `Next: ${formatDateMinimal(new Date(nextDueDate))}`;
    } else if (task.completed && task.createdAt && task.completedAt) {
        dateDisplay = 'Done';
    }

    // กำหนด Style ของ Badge วันที่แบบใหม่ให้โดดเด่นตามสถานะ
    let dateBadgeStyle = `${isMobile ? 'font-size: 9px; padding: 1px 5px;' : 'font-size: 10px; padding: 2px 8px;'} border-radius: 6px; font-weight: 800; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s ease; vertical-align: middle;`;
    
    if (isActuallyDeleted) {
        dateBadgeStyle += " background: #fee2e2; color: #ef4444; border: 1px solid #fecaca;";
    } else if (isOverdue) {
        dateBadgeStyle += " background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.15);";
    } else if (isToday) {
        dateBadgeStyle += " background: var(--primary-color); color: #fff; border: 1px solid var(--primary-color); box-shadow: 0 4px 10px rgba(74, 134, 232, 0.3); transform: scale(1.05);";
    } else if (isFuture) {
        dateBadgeStyle += " background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;";
    } else {
        dateBadgeStyle += " background: var(--bg-body); color: var(--text-muted); opacity: 0.6; border: 1px solid var(--border-color); font-weight: 600;";
    }

    let repeatIcon = '';
    if (task.repeatConfig && task.repeatConfig.isRepeating) {
        const isManual = task.repeatConfig.frequency === 'manual';
        const icon = isManual ? svgManualRepeat : svgRepeat;
        const color = isManual ? '#a855f7' : 'var(--primary-color)';
        const bg = isManual ? 'rgba(168, 85, 247, 0.12)' : 'rgba(47, 128, 237, 0.12)';
        const border = isManual ? 'rgba(168, 85, 247, 0.3)' : 'rgba(47, 128, 237, 0.3)';
        
        repeatIcon = `<span style="margin-left:6px; padding: 2px 6px; background: ${bg}; border: 1px solid ${border}; border-radius: 6px; color: ${color}; display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 800; vertical-align: middle; box-shadow: 0 1px 3px rgba(0,0,0,0.05);" title="Repeating: ${task.repeatConfig.frequency}">
            <span style="width:12px; height:12px; display:flex;">${icon}</span>
            ${isManual ? 'MANUAL' : ''}
        </span>`;
    }

    const calendarIcon = task.calendarEventId ? `<span style="margin-right:4px; color:#166534; display: inline-flex; vertical-align: middle;" title="Synced with Google Calendar"><svg class="svg-icon-sm" style="width:12px; height:12px;"><use href="#icon-calendar"></use></svg></span>` : '';

    // Recursively render Sub-tasks
    let subtasksHTML = '';
    if (!isSubtask) {
        let subItems = '';
        if (task.subtasks && task.subtasks.length > 0) {
            let activeSubtaskCounter = 0; // 🟢 ตัวนับสำหรับงานย่อยที่ยังไม่เสร็จ
            subItems = task.subtasks.map((sub, subIdx) => {
                // 🟢 ซ่อนงานย่อยที่เสร็จแล้วหากเปิดโหมดซ่อนไว้
                if (task.completedSubtasksHidden && sub.completed) return '';

                // 🟢 ซ่อนงานย่อยที่ยังไม่เสร็จหากเปิดโหมดซ่อนไว้
                if (task.pendingSubtasksHidden && !sub.completed) return '';

                // 🟢 คำนวณลำดับตัวเลข: นับข้ามรายการที่เสร็จแล้ว
                let currentNum = null;
                if (!sub.completed) {
                    activeSubtaskCounter++;
                    currentNum = activeSubtaskCounter;
                }

                return generateTaskHTML(sub, subIdx, { 
                    depth: depth + 1, parentIndex: index, isFiltered, showActions, 
                    isMasterView, spaceId, showSpaceBadge, spaceName,
                    isProminentHidden,
                    subtaskNumber: currentNum, // 🟢 ส่งตัวเลขลำดับไปวาดผล
                    parentId: task.createdAt || task.id || null, // for drag-drop data-parent-id
                });
            }).join('');
        }

        // Add "New Sub-task" input row if active
        if (addingSubtaskToId === task.createdAt) {
            subItems += `
                <li class="subtask-item subtask-add-row">
                    <div style="width: 18px; margin-right: 14px; opacity: 0.3;">●</div>
                    <input type="text" class="subtask-inline-input subtask-add-input" data-parent="${task.createdAt}" placeholder="New sub-task...">
                </li>`;
        }

        // เรนเดอร์คอนเทนเนอร์เสมอเพื่อให้เป็นเป้าหมายในการวาง (Drop Target) สำหรับงานหลักที่ถูกลากเข้ามา
        const subtaskListStyle = (task.subtasksHidden && task.subtasks && task.subtasks.length > 0) ? 'display: none;' : '';
        subtasksHTML = `<ul class="subtask-list" data-parent-index="${index}" data-parent-id="${task.createdAt}" style="${subtaskListStyle}">${subItems}</ul>`;
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
        return `<li class="task-item" data-index="${index}" data-type="task" ${isMasterView ? `data-space-id="${spaceId}"` : ''} style="list-style: none; width: 100%; opacity: 0.7;">
            <div class="item-main-row" style="display: flex; align-items: center; gap: 2px; padding: 2px 0; width: 100%; min-height: 28px;">
                <label class="google-task-checkbox" style="margin-right: 8px;">
                    <input type="checkbox" class="${checkboxClass}" ${checkboxDataAttrs} checked>
                    <div class="checkmark-circle">
                        <svg style="display:block; opacity:1; transform:scale(1);" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                    </div>
                </label>
                <div style="flex: 1; min-width: 0; display: block; padding: 2px 0;">
                    <div class="task-text-container" style="font-size: 13.5px; line-height: 1.6; word-break: break-word;">
                        <span class="task-date" style="${dateBadgeStyle} margin-right: 4px;">${countdown}</span>
                        <span class="task-actual-text" contenteditable="true" style="display: inline; vertical-align: middle; outline: none; ${textStyle}">${task.text}</span>
                    </div>
                </div>
                <div class="item-action-group" style="flex-shrink: 0; margin-left: auto; display: flex; align-items: center; gap: 8px;">
                    <button class="btn-icon restore-task-btn" data-index="${index}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} title="Restore Task">${svgRestore}</button>
                    <button class="btn-icon delete-task-perm-btn" data-index="${index}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} title="Delete Permanently">${svgTrashRed}</button>
                </div>
            </div>
        </li>`;
    }

    let actionButtons = '';

    const hasTags = task.tags && task.tags.length > 0;
    const tagBtnHTML = isSubtask ? generateMiniTagsBtn(task.tags, 'subtask', index, parentIndex, spaceId) : generateMiniTagsBtn(task.tags, 'task', index, null, spaceId);

    // NEW: Add specific remove button for template sandbox tasks
    let templateRemoveBtnHTML = '';
    if (spaceId === 'sandbox' && !isSubtask) {
        templateRemoveBtnHTML = `<button class="btn-icon btn-remove-temp-task" data-index="${index}" style="color:#ef4444; margin-left: 5px;">✕</button>`;
    }
    // NEW: Remove-from-block button (always visible when task is inside a block)
    if (task.blockId && !isSubtask) {
        actionButtons += `<button class="btn-icon block-btn-remove-task" data-task-id="${task.createdAt}" title="Remove from block" style="color:${task.blockColor||'var(--primary-color)'};opacity:0.75;flex-shrink:0;"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
    }

    // Actions that are always visible: Tags only if they exist, link button if it has a link
    if (hasTags) {
        actionButtons += tagBtnHTML;
    }
    if (!isSubtask && hasLink) {
        actionButtons += linkBtnHTML;
    }

    // Content of the collapsible actions (add subtask, edit, delete, link button if no link)
    let collapsibleActionsContent = ` 
            ${!hasTags ? tagBtnHTML : ''}
            ${(!hasLink || isSubtask) ? linkBtnHTML : ''}
            ${isSubtask ? `<button class="btn-icon convert-to-main-btn" data-parent-index="${parentIndex}" data-sub-index="${index}" title="Break into Main Task">${svgBreakLink}</button>` : `<button class="btn-icon add-subtask-btn" data-index="${index}" title="Add Sub-task" style="margin: 0;"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>`}
            <button class="btn-icon toggle-calendar-sync-btn" data-index="${index}" ${isSubtask ? `data-parent-index="${parentIndex}"` : ''} ${isMasterView ? `data-space-id="${spaceId}"` : ''} title="${task.calendarEventId ? 'Remove from Calendar' : 'Sync to Calendar'}" style="color: ${task.calendarEventId ? '#166534' : 'inherit'}"><svg class="svg-icon-sm"><use href="#icon-calendar"></use></svg></button>
            ${!isCompletedOrDeleted && !isActuallyDeleted ? `<button class="btn-icon ${isSubtask ? 'archive-subtask-btn' : 'archive-task-btn'}" data-index="${index}" ${isSubtask ? `data-parent-index="${parentIndex}"` : ''} ${isMasterView ? `data-space-id="${spaceId}"` : ''} title="Archive (Complete)">${svgArchive}</button>` : ''}
            ${isSubtask ? `
                <button class="btn-icon edit-subtask-btn" data-parent-index="${parentIndex}" data-sub-index="${index}" data-id="${task.id}" title="Edit Sub-task">${svgEdit}</button>
                <button class="btn-icon delete-subtask-btn" data-parent-index="${parentIndex}" data-sub-index="${index}" data-id="${task.id}" title="Delete Sub-task">${svgTrashRed}</button>
            ` : `
                <button class="btn-icon ${editBtnClass}" data-index="${index}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} style="margin: 0;">${svgEdit}</button>
                <button class="btn-icon delete-task-btn" data-index="${index}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} style="margin: 0;">${svgTrashRed}</button>
            `}
            <button class="btn-icon close-actions-btn" title="Close" style="margin-left: 4px; border-left: 1px solid var(--border-color); padding-left: 6px; color: var(--text-muted);">✕</button>
    `;

    // 🟢 NEW: Override collapsibleActionsContent for Deleted Tasks (Trash View)
    if (isActuallyDeleted) {
        const countdown = getTrashCountdownText(task, getAppSettings().autoDeleteDays);
        collapsibleActionsContent = `
            <!-- Countdown moved to front of text -->
            <button class="btn-icon restore-task-btn" data-index="${index}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} title="Restore Task">${svgRestore}</button>
            ${isSubtask ? `
                <button class="btn-icon delete-subtask-perm-btn" data-parent-index="${parentIndex}" data-sub-index="${index}" data-id="${task.id}" title="Delete Permanently">${svgTrashRed}</button>
            ` : `
                <button class="btn-icon delete-task-perm-btn" data-index="${index}" ${isMasterView ? `data-space-id="${spaceId}"` : ''} title="Delete Permanently">${svgTrashRed}</button>
            `}
        `;
    }

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
    <li class="${isSubtask ? 'subtask-item' : 'task-item'} ${draggableClass} ${prominentClass} ${focusActiveClass} ${templateClass}${task.isMirrorAvatar ? ' sp-mirror-avatar' : ''}" data-index="${index}" data-type="${itemType}" data-space-id="${spaceId || ''}" data-task-id="${task.createdAt || task.id || ''}"${isSubtask && parentId ? ` data-parent-id="${parentId}"` : ''} style="list-style: none; width: 100%; margin-bottom: 0px; border-bottom: 1px solid transparent; opacity: ${isActuallyDeleted ? '0.7' : '1'}; position: relative;">
        <div class="item-main-row" style="display: flex; align-items: center; gap: 1px; padding: 2px 0; width: 100%; min-height: 28px;">
            ${handleHTML}
            <div class="focus-trigger-container" style="display: flex; align-items: center; gap: 0px; ${(!isSubtask && isProminentHidden && !task.isProminent) ? 'display: none;' : ''}">
                ${isSubtask ? `
                    <div class="subtask-number" style="width: 18px; text-align: center; color: #b91c1c; font-weight: 800; font-size: 12px; flex-shrink: 0; margin-right: 0px; font-family: var(--app-font);">
                        ${subtaskNumber ? subtaskNumber + '.' : ''}
                    </div>
                ` : `
                    <button class="btn-icon btn-prominent-task ${task.isProminent ? 'active' : ''}" data-index="${index}" ${isSubtask ? `data-parent-index="${parentIndex}"` : ''} ${isMasterView ? `data-space-id="${spaceId}"` : ''} title="Mark as Next Up" style="margin: 0; padding: 2px; flex-shrink: 0; color: ${task.isProminent ? 'var(--primary-color)' : 'var(--text-muted)'}; display: ${isProminentHidden ? 'none' : 'inline-flex'};" data-focus-trigger="true">
                        <svg class="svg-icon-sm"><use href="#icon-flag"></use></svg>
                    </button>
                `}
            </div>

            <label class="google-task-checkbox" style="margin-right: 4px;">
                <input type="checkbox" class="${checkboxClass}" ${checkboxDataAttrs} ${isActuallyDeleted ? 'checked' : (task.completed ? 'checked' : '')}>
                <div class="checkmark-circle" style="${isActuallyDeleted ? 'background-color: #ef4444; border-color: #ef4444;' : ''}">
                    <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                </div>
            </label>

            <div style="flex: 1; min-width: 0; display: block; padding: 2px 0;">
                <div class="task-text-container" style="font-size: 13.5px; line-height: 1.6; word-break: break-word;">
                    ${calendarIcon}
                    ${dateDisplay ? `<span class="task-date" style="${dateBadgeStyle} margin-right: 4px;">${dateDisplay}</span>` : ''}
                    ${isActuallyDeleted ? `<span class="task-date" style="${dateBadgeStyle} margin-right: 4px;">${getTrashCountdownText(task, getAppSettings().autoDeleteDays)}</span>` : ''}
                    <span class="task-actual-text" contenteditable="true" style="display: inline; vertical-align: middle; outline: none; ${textStyle}">${task.text}</span>
                    ${task.isMirrorAvatar ? `<span class="sp-nav-link sp-from-link" data-sp-nav-space="${task.originalSpaceId}" data-sp-nav-task="${task.originalCreatedAt}">(มาจาก ${task.originalSpaceName || '?'})</span>` : ''}
                    ${(task.isMirrorSource && task.avatarRefs?.some(r => !r.subtaskId)) ? task.avatarRefs.filter(r => !r.subtaskId).map(r => `<span class="sp-nav-link sp-to-link" data-sp-nav-space="${r.spaceId}" data-sp-nav-task="${r.createdAt}">(ส่งไป ${r.spaceName || r.spaceId})</span>`).join('') : ''}
                    ${repeatIcon}
                    ${showSpaceBadge ? `<span class="space-tag" style="margin-left: 8px; vertical-align: middle; display: inline-flex;">${spaceName}</span>` : ''}
                </div>
            </div>

            <div class="item-action-group" style="flex-shrink: 0; margin-left: auto; display: flex; align-items: center; gap: 8px;">
                ${subtaskSpecificActionsHTML}${actionButtons}${templateRemoveBtnHTML}
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
            const isChecked = e.target.checked;
            const taskItem = e.target.closest('.subtask-item');

            // 🟢 แสดง Animation ขีดฆ่าทันทีที่คลิก (รองรับทั้งติ๊กเข้าและออก)
            if (taskItem) {
                taskItem.classList.toggle('completed-hold', isChecked);
            }

            if (space.tasks[pIdx]?.subtasks?.[sIdx]) {
                const subtask = space.tasks[pIdx].subtasks[sIdx];
                subtask.completed = isChecked;
                // 🟢 FIX: Increment syncVersion so Firebase sync detects the change
                subtask.syncVersion = (subtask.syncVersion || 0) + 1;
                subtask.lastModifiedAt = Date.now();

                // Sync subtask tick: avatar→original or original→avatars
                const parentTask = space.tasks[pIdx];
                if (parentTask?.isMirrorAvatar && !parentTask.originalSubtaskId && subtask._originalSubId) {
                  // Issue 1: Avatar subtask ticked → sync back to original
                  eventBus.emit(Events.SUBTASK_AVATAR_TICKED, {
                    avatarSpaceId: space.id,
                    avatarCreatedAt: parentTask.createdAt,
                    subtaskOrigId: subtask._originalSubId,
                    completed: isChecked,
                  });
                } else if (parentTask?.isMirrorSource && (subtask.id || subtask.createdAt)) {
                  // Direction 2: Original subtask ticked → sync to all avatar snapshots
                  eventBus.emit(Events.SUBTASK_SOURCE_TICKED, {
                    originalSpaceId: space.id,
                    originalCreatedAt: parentTask.createdAt,
                    subtaskOrigId: subtask.id || subtask.createdAt,
                    completed: isChecked,
                  });
                }

                // 🌟 Trigger Quest Loot Scanner สำหรับ Sub-task
                if (subtask.completed && window.processRewardScanner) {
                    window.processRewardScanner(subtask.text, false, { x: e.clientX, y: e.clientY }, 'task', space.id);
                }

                // Sync with Google Tasks API if enabled and subtask has a Google Task ID
                if (subtask.googleTaskId && googleApiCallbacks.isGoogleSyncEnabled() && googleApiCallbacks.getGoogleAuthToken()) {
                    googleApiCallbacks.fetchGoogleAPI(`/lists/${googleApiCallbacks.getCurrentGoogleListId()}/tasks/${subtask.googleTaskId}`, 'PATCH', { status: subtask.completed ? 'completed' : 'needsAction' });
                }
            }
            if (space.tasks[pIdx]?.subtasks?.[sIdx]) {
                space.tasks[pIdx].subtasks[sIdx].completed = isChecked;
                // 🟢 หน่วงเวลา Re-render เพื่อให้เห็นผลการขีดฆ่าเหมือนงานหลัก
                setTimeout(() => {
                    onUpdate();
                }, isChecked ? 800 : 0);
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

    // Now imported statically from SpMirrorHelper

    // 🟢 0. Handle Autocomplete during inline typing
    container.addEventListener('input', (e) => {
        if (e.target.classList.contains('task-actual-text')) {
            const space = getSpaceFn(e.target.closest('li'));
            handleTagAutocomplete(e, () => space?.tags || []);
            applySyntaxHighlighting(e.target); // 🟢 เพิ่มการไฮไลท์ขณะพิมพ์งานปกติ
        }
    });

    // Handle Enter and Escape keys
    container.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('task-actual-text')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.dataset.isSubmitting = "true"; // 🟢 บายพาสโหมด DND เพื่อให้หน้าจอยอมวาดช่องงานใหม่
                e.target.dataset.wasEnter = "true"; // 🟢 มาร์คไว้ว่าจบด้วยการกด Enter
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
            const wasEnter = e.target.dataset.wasEnter === "true";
            const isSubmitting = e.target.dataset.isSubmitting === "true";
            
            // 🟢 ล้างสถานะทันที เพื่อป้องกัน Infinite Loop เมื่อ saveData ไปกระตุ้นการเรนเดอร์ใหม่
            delete e.target.dataset.isSubmitting;
            delete e.target.dataset.wasEnter;

            const li = e.target.closest('li');
            if (!li) return;
            
            const idx = parseInt(li.dataset.index);
            const type = li.dataset.type;
            const space = getSpaceFn(li);
            if (!space) return;

            let newText = e.target.textContent.trim();
            let taskObj = null;

            if (type === 'task') {
                taskObj = space.tasks[idx];
            } else if (type === 'subtask') {
                const pIdx = parseInt(li.closest('.subtask-list').dataset.parentIndex);
                taskObj = space.tasks[pIdx]?.subtasks?.[idx];
            }

            if (taskObj) {
                // 🟢 NEW: Auto-tagging Logic (เหมือนฟังก์ชันเก่าในช่อง Add Task)
                // 1. แทนที่ทางลัด #1 ด้วยป้ายที่กำลังกรองอยู่
                const currentFilters = (getFilterTags() || []).filter(t => !['ALL', 'UNTAGGED', 'AI', 'HALF SCREEN'].includes(t.toUpperCase()));
                if (newText.includes('#1') && currentFilters.length > 0) {
                    const filterTagsString = currentFilters.map(t => '#' + t).join(' ');
                    newText = newText.replace(/#1/g, filterTagsString);
                }

                // 2. สแกนหา #ป้ายกำกับ และย้ายเข้าสู่ระบบ Tags
                const tagMatches = newText.match(/#([^\s#]+)/g);
                if (tagMatches) {
                    const extracted = tagMatches.map(t => t.substring(1)); // ตัด # ออก
                    
                    // เพิ่มเข้าในตัวงาน (Task)
                    if (!taskObj.tags) taskObj.tags = [];
                    extracted.forEach(t => {
                        if (!taskObj.tags.some(ext => ext.toLowerCase() === t.toLowerCase())) {
                            taskObj.tags.push(t);
                        }
                    });

                    // เพิ่มเข้าในรายการป้ายของ Space (ถ้าเป็นของใหม่)
                    if (space && !space.tags) space.tags = [];
                    if (space) {
                        extracted.forEach(t => {
                            if (!space.tags.some(st => st.toLowerCase() === t.toLowerCase())) {
                                space.tags.push(t);
                            }
                        });
                    }

                    // ลบแท็กออกจากเนื้อความ และถ้าข้อความว่างให้ใช้แท็กแรกเป็นชื่อแทน
                    newText = newText.replace(/#([^\s#]+)/g, '').trim();
                    if (newText === "" && extracted.length > 0) newText = extracted[0];
                }

                // 🟢 >s shortcut: convert main task to subtask of the task above
                // wasEnter required: กัน blur เพราะ click-away หรือ re-render ทำให้ trigger โดยไม่ตั้งใจ
                if (wasEnter && type === 'task' && /^(.*?)>s$/i.test(newText) && typeof callbacks.onConvertToSubtask === 'function') {
                    const cleanedText = newText.replace(/>s$/i, '').trim();
                    callbacks.onConvertToSubtask(space, idx, taskObj, cleanedText);
                    return;
                }

                // ️ ป้องกันงานหาย: ลบเฉพาะเมื่อ "ตั้งใจ" ปล่อยว่างจริงๆ (Original ก็ว่าง) 
                // หากเดิมมีข้อความอยู่แล้วจังหวะ enter มันว่าง (เพราะเอ๋อ) ให้คืนค่าเดิมแทนการลบ
                if (newText === "" && wasEnter && taskObj.text === "" && typeof callbacks.onDeleteEmptyTask === 'function') {
                    callbacks.onDeleteEmptyTask(space, idx, type, li);
                    return;
                }

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
                if (typeof callbacks.onAfterSave === 'function') callbacks.onAfterSave(space, taskObj);

                // หากจบด้วย Enter ให้เรียก Callback เฉพาะทาง
                if (wasEnter && type === 'task' && typeof callbacks.onAddMainTaskAfter === 'function') {
                    callbacks.onAddMainTaskAfter(space, idx);
                } else if (wasEnter && type === 'subtask' && typeof callbacks.onAddSubtaskAfter === 'function') {
                    callbacks.onAddSubtaskAfter(space, idx, li);
                } else if (onUpdate) {
                    onUpdate();
                }
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

/**
 * 🎨 Apply syntax highlighting to contenteditable elements (@reward and #tag)
 * @param {HTMLElement} el 
 */
export function applySyntaxHighlighting(el) {
    if (!el || !el.isContentEditable) return;

    const selection = window.getSelection();
    let isFocused = false;
    let caretOffset = 0;

    // 🟢 Fix: Only track selection if the cursor is actually inside THIS element
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (el.contains(range.commonAncestorContainer)) {
            isFocused = true;
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(el);
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            caretOffset = preCaretRange.toString().length;
        }
    }

    // 🟢 ใช้ textContent แทน innerText เพื่อลดการ Layout Reflow ทำให้ทำงานเร็วขึ้น
    const text = el.textContent;
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const highlighted = escaped
        .replace(/(@รางวัล(\d+(?:\.\d+)?)(บาท|นาที|อัน)_([^\s]+))/gi, (match, p1, p2, p3, p4) => {
            const unitChar = getUnitCharFromThai(p3);
            const shortUnit = p3 === 'บาท' ? 'บ.' : (p3 === 'นาที' ? 'น.' : 'ชิ้น');
            return `<span class="hl-reward" data-type="${unitChar}"><span class="sf-reward-syntax">@รางวัล</span>${p2}<span class="sf-reward-unit" data-short="${shortUnit}">${p3}</span><span class="sf-reward-cat">_${p4}</span></span>`;
        })
        .replace(/(@รางวัล_([^\s]+))/gi, (match, p1, p2) => {
            return `<span class="hl-reward" data-type="big"><span class="sf-reward-syntax">@รางวัล_</span>${p2}</span>`;
        })
        .replace(/(^|\s)(#[^\s#]+)/g, '$1<span class="hl-tag">$2</span>');

    if (el.innerHTML !== highlighted) {
        el.innerHTML = highlighted;

        // 🟢 Only restore if we were actually focused here
        if (isFocused) {
            const newRange = document.createRange();
            let charCount = 0;
            let nodeFound = false;

            function traverseNodes(node) {
                if (nodeFound) return;
                if (node.nodeType === Node.TEXT_NODE) {
                    const nextCharCount = charCount + node.length;
                    if (caretOffset <= nextCharCount) {
                        newRange.setStart(node, caretOffset - charCount);
                        newRange.collapse(true);
                        nodeFound = true;
                    }
                    charCount = nextCharCount;
                } else {
                    for (let i = 0; i < node.childNodes.length; i++) {
                        traverseNodes(node.childNodes[i]);
                    }
                }
            }
            traverseNodes(el);
            if (!nodeFound) {
                newRange.selectNodeContents(el);
                newRange.collapse(false);
            }
            selection.removeAllRanges();
            selection.addRange(newRange);
        }
    }
}

/**
 * 🏷️ Setup tag autocomplete dropdown for an input field
 */
export function handleTagAutocomplete(e, getTagsFn) {
    const input = e.target;
    const isContentEditable = input.isContentEditable;
    const value = isContentEditable ? input.textContent : input.value;
    
    // 🟢 เก็บฟังก์ชันดึง Tag ไว้สำหรับใช้ในกรณี Chained Autocomplete (บาท_ -> Category)
    window._lastAutocompleteGetTagsFn = getTagsFn;
    
    let cursorFallback;
    if (isContentEditable) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(input);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        cursorFallback = preCaretRange.toString().length;
    } else {
        cursorFallback = input.selectionStart;
    }
    
    const textBeforeCursor = value.substring(0, cursorFallback);
    const words = textBeforeCursor.split(/\s/);
    const lastWord = words[words.length - 1];

    // 🟢 1. จัดการ @reward Autocomplete
    if (lastWord.startsWith('@รางวัล')) {
        const rData = window.getRewardSystemData ? window.getRewardSystemData() : null;
        if (!rData) return;

        // ตรวจสอบว่ากำลังพิมพ์ส่วน Category ของ b: หรือ t: อยู่หรือไม่
        const moneyMatch = lastWord.match(/^@รางวัล[\d.]*บาท_(.*)$/i);
        const timeMatch = lastWord.match(/^@รางวัล[\d.]*นาที_(.*)$/i);
        const itemMatch = lastWord.match(/^@รางวัล[\d.]*อัน_(.*)$/i);
        const lootMatch = lastWord.match(/^@รางวัล_([^\s]*)$/i); // 🟢 เพิ่มรองรับ @รางวัล_

        // 🟢 เพิ่มระบบช่วยเลือกประเภทรางวัล (b:, t:, i:, :) หากยังพิมพ์ไม่ครบ
        if (!moneyMatch && !timeMatch && !itemMatch && !lootMatch) {
            const typeQuery = lastWord.match(/^@รางวัล([\d.]*)(.*)$/i);
            if (typeQuery) {
                const hasNumber = typeQuery[1] !== "";
                const currentPart = typeQuery[2]; // This will be like "บาท_" or "นาที_"
                const suggestions = hasNumber ? ["บาท_", "นาที_", "อัน_"] : ["บาท_", "นาที_", "อัน_", "_"]; // Suggestions for units
                const filtered = suggestions.filter(s => s.startsWith(currentPart));
                
                if (filtered.length > 0) {
                    showTagAutocompleteDropdown(input, filtered, (selected) => {
                        const before = textBeforeCursor.substring(0, textBeforeCursor.length - currentPart.length);
                        const after = value.substring(cursorFallback);
                        insertAutocompleteText(input, before, selected, after, isContentEditable);
                    }, '⚡');
                    return;
                }
            }
        }

        if (moneyMatch || timeMatch || itemMatch || lootMatch) {
            const query = (moneyMatch ? moneyMatch[1] : (timeMatch ? timeMatch[1] : (itemMatch ? itemMatch[1] : lootMatch[1]))).toLowerCase();
            const sourceCats = moneyMatch ? rData.moneyCategories : (timeMatch ? rData.timeCategories : (itemMatch ? rData.itemCategories : rData.itemCategories));
            const filtered = sourceCats.filter(c => c.toLowerCase().includes(query));

            if (filtered.length > 0) {
                showTagAutocompleteDropdown(input, filtered, (selected) => {
                    const before = textBeforeCursor.substring(0, textBeforeCursor.length - query.length);
                    const after = value.substring(cursorFallback);
                    insertAutocompleteText(input, before, selected, after, isContentEditable);
                }, moneyMatch ? '💰' : (timeMatch ? '⏳' : '🎁'));
                return;
            }
        }
    }

    // ตรวจจับ # เมื่อพิมพ์ (ต้องไม่ใช่พื้นที่ว่างเปล่าหลัง #)
    if (lastWord.startsWith('#') && lastWord.length > 0) {
        const query = lastWord.substring(1).toLowerCase();
        const allTags = getTagsFn() || [];
        const filteredTags = [...new Set(allTags)].filter(t => t.toLowerCase().includes(query));
        
        if (filteredTags.length > 0) {
            showTagAutocompleteDropdown(input, filteredTags, (selectedTag) => {
                const before = textBeforeCursor.substring(0, textBeforeCursor.length - lastWord.length);
                const after = value.substring(cursorFallback);
                insertAutocompleteText(input, before, '#' + selectedTag, after, isContentEditable);
            });
        } else {
            closeTagAutocompleteDropdown();
        }
    } else {
        closeTagAutocompleteDropdown();
    }
}

/**
 * 🛠️ Helper: แทรกข้อความ Autocomplete และจัดการเคอร์เซอร์
 */
function insertAutocompleteText(input, before, selected, after, isContentEditable) {
    // 🟢 Chained Logic: ถ้าคำที่เลือกจบด้วย _ แสดงว่ายังไม่จบงาน ไม่ต้องเคาะเว้นวรรค
    const isStepped = selected.endsWith('_');
    const suffix = isStepped ? '' : ' ';
    const newVal = before + selected + suffix + after;
    const newPos = (before + selected + suffix).length;

    if (isContentEditable) {
        input.textContent = newVal;
        input.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        
        // ค้นหา Node ข้อความเพื่อวางเคอร์เซอร์
        let charCount = 0;
        const walk = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walk.nextNode()) {
            if (charCount + node.length >= newPos) {
                range.setStart(node, newPos - charCount);
                range.collapse(true);
                break;
            }
            charCount += node.length;
        }
        sel.removeAllRanges();
        sel.addRange(range);
        applySyntaxHighlighting(input);
    } else {
        input.value = newVal;
        input.focus();
        input.setSelectionRange(newPos, newPos);
    }

    // 🟢 บังคับให้เรียก Autocomplete อีกครั้งทันทีเพื่อความต่อเนื่อง
    if (isStepped) {
        const fakeEvent = { target: input };
        setTimeout(() => {
            handleTagAutocomplete(fakeEvent, window._lastAutocompleteGetTagsFn || (() => []));
        }, 10);
    }
}

let activeDropdown = null;
let focusedTagIndex = -1;

function showTagAutocompleteDropdown(input, tags, onSelect, icon = '#') {
    closeTagAutocompleteDropdown();

    const rect = input.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const maxDropdownHeight = 250; // ตรงกับ CSS max-height
    const estimatedHeight = Math.min(tags.length * 35 + 12, maxDropdownHeight); // คำนวณความสูงโดยประมาณ
    const dropdown = document.createElement('div');
    dropdown.className = 'tag-autocomplete-dropdown';
    
    // 🟢 ป้องกันล้นขอบขวา
    let left = rect.left + window.scrollX;
    if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
    dropdown.style.left = `${Math.max(10, left)}px`;
    
    // 🟢 Smart Positioning: สลับขึ้นด้านบนหาก Popup จะหลุดขอบล่างของหน้าจอ
    let top = rect.bottom + window.scrollY + 2;
    if (rect.bottom + estimatedHeight > viewportHeight) {
        top = rect.top + window.scrollY - estimatedHeight - 2;
    }
    dropdown.style.top = `${top}px`;
    dropdown.style.width = `${rect.width}px`;
    focusedTagIndex = -1;

    tags.forEach((tag, idx) => {
        const item = document.createElement('div');
        item.className = 'tag-autocomplete-item';
        item.innerHTML = `<span style="opacity:0.7; margin-right:8px;">${icon}</span> <span>${tag}</span>`;
        item.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect(tag);
            closeTagAutocompleteDropdown();
        };
        dropdown.appendChild(item);
    });

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    // ⌨️ Keyboard Navigation Logic
    const handleKeys = (e) => {
        const items = dropdown.querySelectorAll('.tag-autocomplete-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusedTagIndex = (focusedTagIndex + 1) % items.length;
            updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusedTagIndex = (focusedTagIndex - 1 + items.length) % items.length;
            updateActiveItem(items);
        } else if (e.key === 'Enter' && focusedTagIndex >= 0) {
            e.preventDefault();
            e.stopPropagation();
            items[focusedTagIndex].click();
        } else if (e.key === 'Escape') {
            closeTagAutocompleteDropdown();
        }
    };

    const updateActiveItem = (items) => {
        items.forEach((item, i) => {
            item.classList.toggle('active', i === focusedTagIndex);
            if (i === focusedTagIndex) {
                // Scroll into view if needed
                item.scrollIntoView({ block: 'nearest' });
            }
        });
    };

    input.addEventListener('keydown', handleKeys);

    // Cleanup function
    const cleanup = () => {
        input.removeEventListener('keydown', handleKeys);
        document.removeEventListener('mousedown', clickOutside);
    };

    const clickOutside = (e) => {
        if (!dropdown.contains(e.target) && e.target !== input) {
            closeTagAutocompleteDropdown();
            cleanup();
        }
    };

    // Store cleanup on the element
    dropdown._cleanup = cleanup;
    document.addEventListener('mousedown', clickOutside);
}

function closeTagAutocompleteDropdown() {
    if (activeDropdown) {
        if (activeDropdown._cleanup) activeDropdown._cleanup();
        activeDropdown.remove();
        activeDropdown = null;
    }
}