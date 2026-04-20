/**
 * 🔗 SpController — @sp Avatar (Mirror) Task System
 *
 * Data model:
 *   Avatar task:   { isMirrorAvatar: true, originalSpaceId, originalCreatedAt }
 *   Original task: { isMirrorSource: true, avatarRefs: [{ spaceId, createdAt }] }
 *
 * Completion rules:
 *   Tick Avatar  → Original moves to Trash, Avatar vanishes silently
 *   Tick Original → All Avatars vanish silently
 */

import Alpine from '../alpine.csp.esm.js';
import { eventBus, Events } from '../core/EventBus.js';
import { getSpaces, saveData, getAppSettings } from '../core/storage.js';
import { stateManager } from '../core/StateManager.js';
import Sortable from '../sortable.esm.js';

let _spPickerOpenFn = null; // bridge: set by Alpine init(), called by window event listener

export class SpController {
  constructor() {
    this._initialized = false;
    this._render = () => {};
    this._syncing = false;
    this._pendingOpen = null;
    this._subtaskMirrorCache = {}; // { "spaceId|subtaskId": true } for duplicate detection
  }

  /**
   * @param {Function} renderCallback - called after data mutations to refresh UI
   */
  init(renderCallback) {
    if (this._initialized) return;
    this._initialized = true;
    if (renderCallback) this._render = renderCallback;

    Alpine.data('spPickerData', () => this._makeAlpineData());
    Alpine.start();

    eventBus.on(Events.OPEN_SP_PICKER, (data) => {
      if (_spPickerOpenFn) {
        _spPickerOpenFn(data.targetSpaceId, data?.anchorRect || null);
      } else {
        this._pendingOpen = {
          targetSpaceId: data?.targetSpaceId,
          anchorRect: data?.anchorRect || null
        };
      }
    });

    eventBus.on(Events.SUBTASK_AVATAR_TICKED, ({ avatarSpaceId, avatarCreatedAt, subtaskOrigId, completed }) => {
      const spaces = getSpaces();
      const avatarSpace = spaces.find(s => s.id === avatarSpaceId);
      const avatar = avatarSpace?.tasks?.find(t => t.createdAt === avatarCreatedAt);
      if (!avatar?.originalSpaceId) return;
      const originalSpace = spaces.find(s => s.id === avatar.originalSpaceId);
      const originalTask = originalSpace?.tasks?.find(t => t.createdAt === avatar.originalCreatedAt);
      if (!originalTask) return;
      const origSub = originalTask.subtasks?.find(s => (s.id || s.createdAt) === subtaskOrigId);
      if (origSub) {
        origSub.completed = completed;
        if (completed) origSub.completedAt = Date.now();
        // Also sync to other maintask avatars that have this subtask in snapshot
        (originalTask.avatarRefs || []).forEach(ref => {
          if (ref.spaceId === avatarSpaceId && ref.createdAt === avatarCreatedAt) return; // skip self
          if (ref.subtaskId) return; // skip standalone subtask avatars
          const otherAvatarSpace = getSpaces().find(s => s.id === ref.spaceId);
          const otherAvatar = otherAvatarSpace?.tasks?.find(t => t.createdAt === ref.createdAt);
          const otherSub = otherAvatar?.subtasks?.find(s => s._originalSubId === subtaskOrigId);
          if (otherSub) otherSub.completed = completed;
        });
        saveData(true);
        this._render(); // Re-render all spaces immediately (stateManager.update won't work after in-place mutation)
        console.log(`[SpController] Subtask synced back: "${origSub.text}" → completed=${completed}`);
      }
    });

    // Direction 2: Original subtask ticked → sync completed state to all avatar snapshots
    eventBus.on(Events.SUBTASK_SOURCE_TICKED, ({ originalSpaceId, originalCreatedAt, subtaskOrigId, completed }) => {
      const spaces = getSpaces();
      const originalSpace = spaces.find(s => s.id === originalSpaceId);
      const originalTask = originalSpace?.tasks?.find(t => t.createdAt === originalCreatedAt);
      if (!originalTask) return;
      // Update all maintask avatars' subtask snapshots
      (originalTask.avatarRefs || []).forEach(ref => {
        if (ref.subtaskId) return; // skip standalone subtask avatars
        const avatarSpace = spaces.find(s => s.id === ref.spaceId);
        const avatar = avatarSpace?.tasks?.find(t => t.createdAt === ref.createdAt);
        const avSub = avatar?.subtasks?.find(s => s._originalSubId === subtaskOrigId);
        if (avSub) avSub.completed = completed;
      });
      saveData(true);
      this._render();
    });

    console.log('[SpController] Initialized');
  }

  // ─── Alpine Picker Data Factory ──────────────────────────────────────────

  _makeAlpineData() {
    const ctrl = this;
    return {
      isOpen: false,
      step: 1,
      targetSpaceId: null,
      selectedFolder: null,
      selectedSpaceId: null,
      searchQuery: '',
      anchorRect: null,

      get folders() {
        void this.isOpen; // reactive dep — refreshes every time modal opens/closes
        void this.targetSpaceId;
        const seen = new Set();
        getSpaces()
          .filter(s => !s.isArchived && !s.isDeleted && s.id !== this.targetSpaceId)
          .forEach(s => seen.add(s.folder || ''));
        return Array.from(seen).sort((a, b) => this.compareFolders(a, b));
      },

      get spacesInFolder() {
        return getSpaces().filter(s =>
          (s.folder || '') === (this.selectedFolder || '') &&
          !s.isArchived &&
          !s.isDeleted &&
          s.id !== this.targetSpaceId
        ).sort((a, b) => this.compareSpaces(a, b));
      },

      get tasksInSpace() {
        if (!this.selectedSpaceId) return [];
        const space = getSpaces().find(s => s.id === this.selectedSpaceId);
        if (!space?.tasks) return [];
        const q = this.searchQuery.toLowerCase();
        const result = [];
        const todayMs = new Date().setHours(0, 0, 0, 0);
        for (const task of space.tasks) {
          if (task.isDeleted) continue;        // Trash
          if (task.isMirrorAvatar) continue;   // Mirror avatar
          if (task.completed) continue;        // Completed / Archived / Completed Recurring
          // 🐛 Bug Fix: ซ่อน future-dated repeat clones (มี dueDate > วันนี้ + isRepeating)
          if (task.repeatConfig?.isRepeating && task.dueDate) {
            const dueDateMs = new Date(task.dueDate).setHours(0, 0, 0, 0);
            if (dueDateMs > todayMs) continue;
          }
          if (q && !task.text.toLowerCase().includes(q)) continue;
          result.push({ text: task.text, createdAt: task.createdAt, subtaskId: null, isSubtask: false, parentText: null });
          if (task.subtasks) {
            for (const sub of task.subtasks) {
              if (sub.completed || sub.isDeleted) continue;
              if (q && !sub.text.toLowerCase().includes(q)) continue;
              result.push({ text: sub.text, createdAt: task.createdAt, subtaskId: sub.id, isSubtask: true, parentText: task.text });
            }
          }
        }
        return result;
      },

      init() {
        const self = this;
        _spPickerOpenFn = (targetSpaceId, anchorRect = null) => self.open(targetSpaceId, anchorRect);
        if (ctrl._pendingOpen !== null) {
          self.open(ctrl._pendingOpen.targetSpaceId, ctrl._pendingOpen.anchorRect || null);
          ctrl._pendingOpen = null;
        }
      },

      open(targetSpaceId, anchorRect = null) {
        this.isOpen = true;
        this.step = 1;
        this.targetSpaceId = targetSpaceId;
        this.selectedFolder = null;
        this.selectedSpaceId = null;
        this.searchQuery = '';
        this.anchorRect = anchorRect;
      },

      close() {
        this.isOpen = false;
        this.anchorRect = null;
      },

      selectFolder(folder) {
        this.selectedFolder = folder;
        this.step = 2;
      },

      selectSpace(spaceId) {
        this.selectedSpaceId = spaceId;
        this.step = 3;
        this.searchQuery = '';
      },

      selectTask(createdAt, subtaskId) {
        ctrl.createMirrorTask(createdAt, this.selectedSpaceId, this.targetSpaceId, subtaskId || null);
        this.close();
      },

      back() {
        if (this.step === 3) { this.step = 2; this.searchQuery = ''; }
        else if (this.step === 2) { this.step = 1; }
      },

      folderLabel(folder) {
        return folder === '' ? 'General' : folder;
      },

      folderPrefix(folder) {
        const name = folder === '' ? 'General' : folder;
        const p = getAppSettings().folderPrefixes?.[name];
        return p ? `(${p}) ` : '';
      },

      folderPrefixColor(folder) {
        const name = folder === '' ? 'General' : folder;
        return getAppSettings().folderPrefixColors?.[name] || '';
      },

      compareFolders(a, b) {
        const aName = a === '' ? 'General' : a;
        const bName = b === '' ? 'General' : b;
        const settings = getAppSettings();
        const aPrefix = String(settings.folderPrefixes?.[aName] || '').trim();
        const bPrefix = String(settings.folderPrefixes?.[bName] || '').trim();

        const aHas = aPrefix.length > 0;
        const bHas = bPrefix.length > 0;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;

        if (aHas && bHas) {
          const aNumMatch = aPrefix.match(/^\d+/);
          const bNumMatch = bPrefix.match(/^\d+/);
          const aNum = aNumMatch ? parseInt(aNumMatch[0], 10) : Number.POSITIVE_INFINITY;
          const bNum = bNumMatch ? parseInt(bNumMatch[0], 10) : Number.POSITIVE_INFINITY;
          if (aNum !== bNum) return aNum - bNum;

          const byPrefixText = aPrefix.localeCompare(bPrefix, undefined, { numeric: true, sensitivity: 'base' });
          if (byPrefixText !== 0) return byPrefixText;
        }

        return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
      },

      compareSpaces(a, b) {
        const parsedA = this.parseSpaceOrder(a?.name || '');
        const parsedB = this.parseSpaceOrder(b?.name || '');

        if (parsedA.hasOrder && !parsedB.hasOrder) return -1;
        if (!parsedA.hasOrder && parsedB.hasOrder) return 1;

        if (parsedA.hasOrder && parsedB.hasOrder) {
          if (parsedA.number !== parsedB.number) return parsedA.number - parsedB.number;
          if (parsedA.letter !== parsedB.letter) return parsedA.letter.localeCompare(parsedB.letter, undefined, { sensitivity: 'base' });
          const restCmp = parsedA.rest.localeCompare(parsedB.rest, undefined, { numeric: true, sensitivity: 'base' });
          if (restCmp !== 0) return restCmp;
        }

        return (a?.name || '').localeCompare((b?.name || ''), undefined, { numeric: true, sensitivity: 'base' });
      },

      parseSpaceOrder(name) {
        const raw = String(name || '').trim();
        const m = raw.match(/^(\d+)([A-Za-z]?)(?:\s+|[-_.])?(.*)$/);
        if (!m) {
          return { hasOrder: false, number: Number.POSITIVE_INFINITY, letter: '', rest: raw };
        }
        return {
          hasOrder: true,
          number: parseInt(m[1], 10),
          letter: (m[2] || '').toUpperCase(),
          rest: (m[3] || '').trim()
        };
      },

      cardStyle() {
        const base = 'position:relative;z-index:1;background:var(--bg-card,#fff);border:1px solid var(--border-color,#e5e7eb);border-radius:14px;padding:16px;box-shadow:0 -4px 24px rgba(0,0,0,0.12);width:100%;max-width:420px;max-height:60vh;overflow-y:auto;font-family:var(--app-font,-apple-system,sans-serif);box-sizing:border-box;';

        const isMobile = window.innerWidth <= 768;
        if (isMobile || !this.anchorRect) {
          return base;
        }

        const margin = 12;
        const desiredWidth = 420;
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        let left = this.anchorRect.left;
        const maxLeft = viewportW - desiredWidth - margin;
        if (left > maxLeft) left = maxLeft;
        if (left < margin) left = margin;

        const estimatedHeight = Math.min(520, Math.floor(viewportH * 0.72));
        let top = this.anchorRect.bottom + 8;
        if (top + estimatedHeight > viewportH - margin) {
          top = Math.max(margin, this.anchorRect.top - estimatedHeight - 8);
        }

        const maxHeight = Math.max(240, viewportH - top - margin);
        return `position:fixed;left:${left}px;top:${top}px;z-index:10001;background:var(--bg-card,#fff);border:1px solid var(--border-color,#e5e7eb);border-radius:14px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,0.18);width:min(420px,calc(100vw - 24px));max-height:${maxHeight}px;overflow-y:auto;font-family:var(--app-font,-apple-system,sans-serif);box-sizing:border-box;`;
      },

      spaceLabel(space) {
        return space.name || `Space ${space.id}`;
      }
    };
  }

  // ─── Core Methods ─────────────────────────────────────────────────────────

  /**
   * 🔗 Core Mirroring Engine: Create an Avatar/Mirror Task
   * Refactored to serve as the unified entry point for both '@sp' and Task Basket.
   */
  createMirrorTask(taskId, sourceSpaceId, targetSpaceId, subtaskId = null) {
    const originalCreatedAt = taskId;
    const originalSpaceId = sourceSpaceId;
    const spaces = getSpaces(); // Fetch latest SSOT reference
    const originalSpace = spaces.find(s => s.id === originalSpaceId);
    const targetSpace = spaces.find(s => s.id === targetSpaceId);

    if (!originalSpace || !targetSpace) {
      console.error('[SpController] Invalid space IDs', { originalSpaceId, targetSpaceId });
      return;
    }

    const originalTask = (originalSpace.tasks || []).find(
      t => t.createdAt === originalCreatedAt
    );
    if (!originalTask) {
      console.error('[SpController] Original task not found', originalCreatedAt);
      return;
    }

    if (originalTask.isMirrorAvatar) {
      console.warn('[SpController] Cannot create avatar of an avatar');
      return;
    }

    // Duplicate check: same source already linked to same target space
    const alreadyLinked = (originalTask.avatarRefs || []).some(
      ref => ref.spaceId === targetSpaceId && (ref.subtaskId || null) === (subtaskId || null)
    );
    // Also check cache if it's a subtask source
    const cacheKey = subtaskId ? `${targetSpaceId}|${subtaskId}` : null;
    const inCacheDuplicate = cacheKey && this._subtaskMirrorCache[cacheKey];
    
    if (alreadyLinked || inCacheDuplicate) {
      console.warn('[SpController] Avatar already exists in target space');
      this._showDuplicateHint(targetSpace.name || `Space ${targetSpaceId}`);
      return;
    }

    // If subtask source, pull data from the subtask
    let sourceObj = originalTask;
    if (subtaskId) {
      sourceObj = originalTask.subtasks?.find(s => s.id === subtaskId);
      if (!sourceObj) { console.error('[SpController] Subtask not found', subtaskId); return; }
      // Check cache: ID-based duplicate detection for subtasks
      const cacheLookup = `${targetSpaceId}|${subtaskId}`;
      if (this._subtaskMirrorCache[cacheLookup]) {
        console.warn('[SpController] Subtask already mirrored to target space');
        this._showDuplicateHint(targetSpace.name || `Space ${targetSpaceId}`);
        return;
      }
    }

    const avatarCreatedAt = Date.now();

    // 📋 ถ้าเป็น maintask → copy subtasks ทั้งหมดมาด้วย (snapshot ณ เวลา sync)
    // ถ้าเป็น subtask → ไม่มี subtasks, แต่ใส่ "(sub) " นำหน้าชื่อ
    const avatarText = subtaskId ? `(sub) ${sourceObj.text}` : sourceObj.text;
    const avatarSubtasks = subtaskId ? [] : (originalTask.subtasks || [])
      .filter(sub => {
        // Skip subtasks that already have a standalone mirror in the target space
        // Check both avatarRefs AND cache for comprehensive duplicate prevention
        const hasAvatarRef = (sub.avatarRefs || []).some(r => r.spaceId === targetSpaceId);
        const cacheLookupKey = `${targetSpaceId}|${sub.id}`;
        const inCache = this._subtaskMirrorCache[cacheLookupKey];
        return !(hasAvatarRef || inCache);
      })
      .map(sub => ({
        id: Date.now() + Math.random(), // unique id ใหม่ เพื่อไม่ชนกับต้นฉบับ
        _originalSubId: sub.id || sub.createdAt, // for sync-back (Issue 1)
        text: sub.text,
        completed: sub.completed || false,
        tags: [...(sub.tags || [])],
        dueDate: sub.dueDate || null,
      }));

    const avatarTask = {
      id: String(avatarCreatedAt),
      text: avatarText,
      completed: false,
      tags: [...(sourceObj.tags || originalTask.tags || [])],
      dueDate: sourceObj.dueDate || originalTask.dueDate || null,
      linkData: sourceObj.linkData ? { ...sourceObj.linkData } : undefined,
      createdAt: avatarCreatedAt,
      googleTaskId: null,
      isProminent: false,
      subtasks: avatarSubtasks,
      isMirrorAvatar: true,
      originalSpaceId,
      originalSpaceName: originalSpace.name,
      originalCreatedAt,
      originalSubtaskId: subtaskId || undefined,
    };

    if (!targetSpace.tasks) targetSpace.tasks = [];
    targetSpace.tasks.push(avatarTask);

    // Store ref on parent task (for sync/vanish operations)
    originalTask.isMirrorSource = true;
    if (!originalTask.avatarRefs) originalTask.avatarRefs = [];
    originalTask.avatarRefs.push({ spaceId: targetSpaceId, spaceName: targetSpace.name, createdAt: avatarCreatedAt, subtaskId: subtaskId || undefined });

    // Also store on subtask itself (for UI badge display)
    if (subtaskId && sourceObj) {
      sourceObj.isMirrorSource = true;
      if (!sourceObj.avatarRefs) sourceObj.avatarRefs = [];
      sourceObj.avatarRefs.push({ spaceId: targetSpaceId, spaceName: targetSpace.name, createdAt: avatarCreatedAt });
      // Cache this subtask ID for duplicate detection
      this._subtaskMirrorCache[`${targetSpaceId}|${subtaskId}`] = true;
    }

    // Cache maintask subtask IDs if creating a maintask avatar
    if (!subtaskId && avatarSubtasks.length > 0) {
      avatarSubtasks.forEach(avSub => {
        if (avSub._originalSubId) {
          this._subtaskMirrorCache[`${targetSpaceId}|${avSub._originalSubId}`] = true;
        }
      });
    }

    saveData(true);
    eventBus.emit(Events.MIRROR_TASK_SYNC, {
      action: 'avatar_linked',
      originalSpaceId, originalCreatedAt, targetSpaceId, avatarCreatedAt,
      timestamp: Date.now()
    });

    // Refresh local UI
    this._render();
    console.log(`[SpController] Avatar linked: "${originalTask.text}" → Space ${targetSpaceId} (cache size: ${Object.keys(this._subtaskMirrorCache).length})`);

  }

  /** 🧺 Initialize UI Logic: Draggable, Resizable, and Sortable */
  initBasketUI() {
    const modal = document.getElementById('task-basket-modal');
    const panel = document.getElementById('basket-panel');
    const header = document.getElementById('basket-header');
    const list = document.getElementById('basket-content-list');

    const applyState = () => {
      const settings = stateManager.getState('basketSettings') || { x: 100, y: 100, w: 320, h: 450 };
      panel.style.left = `${settings.x}px`;
      panel.style.top = `${settings.y}px`;
      panel.style.width = `${settings.w}px`;
      panel.style.height = `${settings.h}px`;
    };

    const saveSettings = () => {
      stateManager.update('basketSettings', {
        x: parseInt(panel.style.left), y: parseInt(panel.style.top),
        w: parseInt(panel.style.width), h: parseInt(panel.style.height)
      });
    };

    // 1. Draggable Logic
    let isDragging = false, offset = { x: 0, y: 0 };
    header.onmousedown = (e) => {
      if (e.target.closest('button')) return;
      isDragging = true;
      offset.x = e.clientX - panel.offsetLeft;
      offset.y = e.clientY - panel.offsetTop;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    const onMove = (e) => {
      if (!isDragging) return;
      const x = Math.max(0, Math.min(e.clientX - offset.x, window.innerWidth - panel.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - offset.y, window.innerHeight - panel.offsetHeight));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    };
    const onUp = () => { isDragging = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); saveSettings(); };

    // 2. Resizable Persistence
    new ResizeObserver(() => { if (modal.style.display !== 'none') saveSettings(); }).observe(panel);

    // 3. Sortable Integration
    Sortable.create(list, {
      group: 'nested-tasks', // Matches the masterTodoList group
      animation: 150,
      onAdd: (evt) => {
        const spaceId = parseInt(evt.item.dataset.spaceId);
        const taskId = parseFloat(evt.item.dataset.taskId);   // createdAt ของ item นี้
        const isSub = evt.item.classList.contains('subtask-item');

        // Read data-parent-id stamped at render time (closest() fails after Sortable moves item)
        let resolvedId = taskId;
        let subtaskId = null;
        if (isSub) {
          const parentTaskId = parseFloat(evt.item.dataset.parentId);
          if (!isNaN(parentTaskId)) {
            resolvedId = parentTaskId;
            subtaskId = taskId;
          } else {
            evt.item.remove();
            return console.error('[SpBasket] Cannot find parent task for subtask', taskId);
          }
        }

        evt.item.remove(); // Clean up dropped element immediately

        // 🟢 Fix: Robust ID capture to prevent 'Original task not found'
        if (isNaN(spaceId) || isNaN(resolvedId)) return console.error('[SpBasket] Missing drop metadata', { spaceId, resolvedId });

        const basketItems = stateManager.getState('basketItems') || [];
        if (!basketItems.some(i => i.id === resolvedId && i.subtaskId === subtaskId)) {
          basketItems.push({ id: resolvedId, sourceSpace: spaceId, subtaskId });
          stateManager.update('basketItems', basketItems);
          this.renderBasketContents();
        }
      }
    });

    // 4. UI Actions
    document.getElementById('btn-close-basket-modal').onclick = () => modal.style.display = 'none';
    document.getElementById('btn-reset-basket').onclick = () => {
        stateManager.update('basketSettings', { x: 100, y: 100, w: 320, h: 450 });
        applyState();
    };
    document.getElementById('btn-clear-basket').onclick = () => { stateManager.update('basketItems', []); this.renderBasketContents(); };
    document.getElementById('btn-confirm-basket-sync').onclick = async () => {
        const items = stateManager.getState('basketItems');
        const targetSpaceId = parseInt(modal.dataset.spaceId);
        if (!items.length) return;
        await this.syncBasket(items, targetSpaceId);
        stateManager.update('basketItems', []);
        modal.style.display = 'none';
        if (window.renderDefaultDashboard) window.renderDefaultDashboard();
    };

    eventBus.on(Events.OPEN_BASKET_MODAL, (data) => {
        modal.dataset.spaceId = data.spaceId;
        const space = getSpaces().find(s => s.id === data.spaceId);
        document.getElementById('basket-space-name').innerText = space?.name || 'Selected Space';
        applyState();
        this.renderBasketContents();
        modal.style.display = 'block';
    });
  }

  renderBasketContents() {
    const list = document.getElementById('basket-content-list');
    const items = stateManager.getState('basketItems') || [];
    const allSpaces = getSpaces();
    if (!items.length) { list.innerHTML = `<div style="margin:auto; text-align:center; opacity:0.3; font-size:11px;">Drop tasks here to bundle.</div>`; return; }
    list.innerHTML = items.map((item, idx) => {
      const sourceSpace = allSpaces.find(s => s.id === item.sourceSpace);
      const parentTask = sourceSpace?.tasks?.find(t => t.createdAt === item.id);
      // ถ้าเป็น subtask ให้หาชื่อ subtask จาก parentTask
      let displayText = parentTask?.text || 'Task';
      let subLabel = '';
      if (item.subtaskId) {
        const sub = parentTask?.subtasks?.find(s => s.id === item.subtaskId || s.createdAt === item.subtaskId);
        displayText = sub ? `(sub) ${sub.text}` : displayText;
        subLabel = `<span style="font-size:9px; color:var(--primary-color); font-weight:800; margin-right:4px;">[subtask]</span>`;
      } else if (parentTask?.subtasks?.length) {
        subLabel = `<span style="font-size:9px; opacity:0.5; margin-right:4px;">+${parentTask.subtasks.length} sub</span>`;
      }
      return `<div class="basket-item-avatar">
        <div style="flex:1; min-width:0;">
            <div style="font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${subLabel}${displayText}</div>
            <div style="font-size:9px; opacity:0.6;">from ${sourceSpace?.name || '?'}</div>
        </div>
        <button class="btn-icon remove-avatar-btn" data-index="${idx}">✕</button>
      </div>`;
    }).join('');
    list.querySelectorAll('.remove-avatar-btn').forEach(btn => {
        btn.onclick = () => {
            const basketItems = stateManager.getState('basketItems');
            basketItems.splice(parseInt(btn.dataset.index), 1);
            stateManager.update('basketItems', basketItems);
            this.renderBasketContents();
        };
    });
  }

  /** 🧺 Batch process the entire basket */
  async syncBasket(items, targetSpaceId) {
      console.log(`[SpController] Batch processing ${items.length} items to Space ${targetSpaceId}`);
      for (const item of items) {
          // 🔗 Logic Fix: Call createMirrorTask to ensure bidirectional linking (Mirror behavior)
          // instead of moving the original task.
          this.createMirrorTask(item.id, item.sourceSpace, targetSpaceId, item.subtaskId);
      }

      // 🟢 Batch State Refresh: Update StateManager to notify UI across all source/target spaces
      stateManager.update('spaces', getSpaces(), { immediate: true });
  }

  /**
   * Tick on Avatar: complete original (→ Trash) + splice avatar silently
   */
  completeAvatarAndVanish(avatarSpaceId, avatarCreatedAt) {
    const spaces = getSpaces();
    const avatarSpace = spaces.find(s => s.id === avatarSpaceId);
    if (!avatarSpace?.tasks) return;

    const avatarIdx = avatarSpace.tasks.findIndex(t => t.createdAt === avatarCreatedAt);
    if (avatarIdx === -1) return;

    const avatar = avatarSpace.tasks[avatarIdx];
    const originalSpace = spaces.find(s => s.id === avatar.originalSpaceId);

    if (originalSpace?.tasks) {
      const originalTask = originalSpace.tasks.find(
        t => t.createdAt === avatar.originalCreatedAt
      );
      if (originalTask && !originalTask.isDeleted) {
        if (avatar.originalSubtaskId) {
          // === Issue 2 fix: Subtask avatar → tick original subtask only, don't delete maintask ===
          const origSub = originalTask.subtasks?.find(
            s => (s.id || s.createdAt) === avatar.originalSubtaskId
          );
          if (origSub) {
            origSub.completed = true;
            origSub.completedAt = Date.now();
            if (origSub.avatarRefs) {
              origSub.avatarRefs = origSub.avatarRefs.filter(
                ref => !(ref.spaceId === avatarSpaceId && ref.createdAt === avatarCreatedAt)
              );
              if (!origSub.avatarRefs.length) { origSub.isMirrorSource = false; delete origSub.avatarRefs; }
            }
          }
          if (originalTask.avatarRefs) {
            originalTask.avatarRefs = originalTask.avatarRefs.filter(
              ref => !(ref.spaceId === avatarSpaceId && ref.createdAt === avatarCreatedAt)
            );
            if (!originalTask.avatarRefs.length) { originalTask.isMirrorSource = false; delete originalTask.avatarRefs; }
          }
        } else {
          // === Maintask avatar: existing behavior — send original to trash ===
          const settings = getAppSettings();
          if (
            settings.focusedTask &&
            settings.focusedTask.spaceId === originalSpace.id &&
            settings.focusedTask.createdAt === originalTask.createdAt
          ) {
            settings.focusedTask = null;
          }
          const now = Date.now();
          const days = settings.autoDeleteDays || 30;
          originalTask.isDeleted = true;
          originalTask.deletedAt = now;
          originalTask.expiryAt = now + days * 24 * 60 * 60 * 1000;
          originalTask.completed = false;
          originalTask.isProminent = false;
          if (originalTask.subtasks) {
            originalTask.subtasks.forEach(sub => {
              sub.isDeleted = true;
              sub.deletedAt = now;
              sub.expiryAt = originalTask.expiryAt;
              sub.completed = false;
            });
          }
          if (originalTask.avatarRefs) {
            originalTask.avatarRefs = originalTask.avatarRefs.filter(
              ref => !(ref.spaceId === avatarSpaceId && ref.createdAt === avatarCreatedAt)
            );
            if (originalTask.avatarRefs.length === 0) {
              originalTask.isMirrorSource = false;
              delete originalTask.avatarRefs;
            }
          }
        }
      }
    }

    avatarSpace.tasks.splice(avatarIdx, 1);
    console.log(`[SpController] Avatar vanished from Space ${avatarSpaceId}`);
  }

  /**
   * Tick on Original: sync field updates to avatars; if deleted/completed → vanish all
   * @param {boolean} forceVanish - pass true when called at completion time (before isDeleted is set)
   */
  syncOriginalToAvatars(originalSpaceId, originalCreatedAt, forceVanish = false) {
    const spaces = getSpaces();
    const originalSpace = spaces.find(s => s.id === originalSpaceId);
    if (!originalSpace?.tasks) return;

    const originalTask = originalSpace.tasks.find(t => t.createdAt === originalCreatedAt);
    if (!originalTask?.avatarRefs?.length) return;

    if (forceVanish || originalTask.isDeleted || originalTask.completed) {
      const refs = [...originalTask.avatarRefs];
      refs.forEach(ref => {
        const avatarSpace = spaces.find(s => s.id === ref.spaceId);
        if (!avatarSpace?.tasks) return;
        const idx = avatarSpace.tasks.findIndex(t => t.createdAt === ref.createdAt);
        if (idx !== -1) {
          avatarSpace.tasks.splice(idx, 1);
          console.log(`[SpController] Avatar vanished from Space ${ref.spaceId} (original deleted)`);
        }
      });
      originalTask.avatarRefs = [];
      originalTask.isMirrorSource = false;
      delete originalTask.avatarRefs;
      return;
    }

    originalTask.avatarRefs.forEach(ref => {
      const avatarSpace = spaces.find(s => s.id === ref.spaceId);
      if (!avatarSpace?.tasks) return;
      const avatar = avatarSpace.tasks.find(t => t.createdAt === ref.createdAt);
      if (!avatar) return;
      // Sync from the appropriate source (subtask or main task)
      let src = originalTask;
      if (ref.subtaskId) src = originalTask.subtasks?.find(s => s.id === ref.subtaskId) || originalTask;
      avatar.text = src.text;
      avatar.tags = [...(src.tags || originalTask.tags || [])];
      avatar.dueDate = src.dueDate || null;
      if (src.linkData) avatar.linkData = { ...src.linkData }; else delete avatar.linkData;
      // Sync subtask completed states using _originalSubId mapping
      if (!ref.subtaskId && avatar.subtasks?.length && originalTask.subtasks?.length) {
        avatar.subtasks.forEach(avSub => {
          if (!avSub._originalSubId) return;
          const origSub = originalTask.subtasks.find(s => (s.id || s.createdAt) === avSub._originalSubId);
          if (origSub) avSub.completed = origSub.completed;
        });
      }
    });
  }

  _showDuplicateHint(spaceName) {
    const existing = document.getElementById('sp-dup-hint');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'sp-dup-hint';
    el.textContent = `🔗 มี Mirror ใน "${spaceName}" แล้ว`;
    el.style.cssText = [
      'position:fixed', 'bottom:80px', 'left:50%',
      'transform:translateX(-50%) translateY(8px)',
      'background:var(--primary-color,#2f80ed)', 'color:#fff',
      'padding:8px 18px', 'border-radius:20px',
      'font-size:13px', 'font-weight:500',
      'box-shadow:0 4px 16px rgba(0,0,0,0.22)',
      'z-index:99999', 'pointer-events:none',
      'opacity:0', 'transition:opacity 0.2s ease, transform 0.2s ease',
    ].join(';');
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(8px)';
      setTimeout(() => el.remove(), 250);
    }, 2000);
  }

  /**
   * Avatar name changed: push text ONLY back to original (and other same-source avatars).
   * Settings (date/tags/link) are one-way (original → avatar) and NOT synced back.
   */
  syncAvatarToOriginal(avatarSpaceId, avatarCreatedAt) {
    if (this._syncing) return;
    this._syncing = true;
    try {
      const spaces = getSpaces();
      const avatarSpace = spaces.find(s => s.id === avatarSpaceId);
      const avatar = avatarSpace?.tasks?.find(t => t.createdAt === avatarCreatedAt);
      if (!avatar?.isMirrorAvatar) return;

      const originalSpace = spaces.find(s => s.id === avatar.originalSpaceId);
      if (!originalSpace?.tasks) return;

      const parentTask = originalSpace.tasks.find(t => t.createdAt === avatar.originalCreatedAt);
      if (!parentTask) return;

      // Find the exact target (subtask or main task)
      let target = parentTask;
      if (avatar.originalSubtaskId) {
        target = parentTask.subtasks?.find(s => s.id === avatar.originalSubtaskId) || parentTask;
      }

      // Two-way: text only
      target.text = avatar.text;

      // Propagate text to other avatars of the SAME source (same subtaskId only)
      (parentTask.avatarRefs || []).forEach(ref => {
        if (ref.createdAt === avatarCreatedAt) return; // skip self
        if ((ref.subtaskId || null) !== (avatar.originalSubtaskId || null)) return; // skip different source type
        const otherSpace = spaces.find(s => s.id === ref.spaceId);
        const other = otherSpace?.tasks?.find(t => t.createdAt === ref.createdAt);
        if (!other) return;
        other.text = avatar.text; // text only
      });

      console.log(`[SpController] Avatar→Original text synced for "${avatar.text}"`);
    } finally {
      this._syncing = false;
    }
  }

  /**
   * Avatar manually deleted: remove ref from original, keep avatar as normal task
   */
  unlinkAvatar(avatarSpaceId, avatarCreatedAt) {
    const spaces = getSpaces();
    const avatarSpace = spaces.find(s => s.id === avatarSpaceId);
    const avatar = avatarSpace?.tasks?.find(t => t.createdAt === avatarCreatedAt);
    if (!avatar?.isMirrorAvatar) return;

    const originalSpace = spaces.find(s => s.id === avatar.originalSpaceId);
    if (originalSpace?.tasks) {
      const parentTask = originalSpace.tasks.find(t => t.createdAt === avatar.originalCreatedAt);
      if (parentTask?.avatarRefs) {
        parentTask.avatarRefs = parentTask.avatarRefs.filter(
          r => !(r.spaceId === avatarSpaceId && r.createdAt === avatarCreatedAt)
        );
        if (parentTask.avatarRefs.length === 0) {
          parentTask.isMirrorSource = false;
          delete parentTask.avatarRefs;
        }
      }
    }

    // Also clean up the subtask's own avatarRefs if applicable
    if (avatar.originalSubtaskId && originalSpace?.tasks) {
      const pTask = originalSpace.tasks.find(t => t.createdAt === avatar.originalCreatedAt);
      const subtask = pTask?.subtasks?.find(s => s.id === avatar.originalSubtaskId);
      if (subtask?.avatarRefs) {
        subtask.avatarRefs = subtask.avatarRefs.filter(
          r => !(r.spaceId === avatarSpaceId && r.createdAt === avatarCreatedAt)
        );
        if (subtask.avatarRefs.length === 0) {
          subtask.isMirrorSource = false;
          delete subtask.avatarRefs;
        }
      }
    }

    delete avatar.isMirrorAvatar;
    delete avatar.originalSpaceId;
    delete avatar.originalSpaceName;
    delete avatar.originalCreatedAt;
    delete avatar.originalSubtaskId;
    console.log(`[SpController] Avatar unlinked from Space ${avatarSpaceId}`);
  }

  /**
   * Unlink sync AND delete the avatar task (from right-click "เลิก Sync").
   * Handles orphan case: if the avatar no longer exists, cleans the ref on the original.
   */
  unlinkAndDeleteAvatar(avatarSpaceId, avatarCreatedAt) {
    const spaces = getSpaces();
    const avatarSpace = spaces.find(s => s.id === avatarSpaceId);
    const avatar = avatarSpace?.tasks?.find(t => t.createdAt === avatarCreatedAt);

    if (avatar?.isMirrorAvatar) {
      // --- Live avatar: clean refs on original, then delete avatar ---
      const originalSpace = spaces.find(s => s.id === avatar.originalSpaceId);
      if (originalSpace?.tasks) {
        const parentTask = originalSpace.tasks.find(t => t.createdAt === avatar.originalCreatedAt);
        if (parentTask?.avatarRefs) {
          parentTask.avatarRefs = parentTask.avatarRefs.filter(
            r => !(r.spaceId === avatarSpaceId && r.createdAt === avatarCreatedAt)
          );
          if (parentTask.avatarRefs.length === 0) {
            parentTask.isMirrorSource = false;
            delete parentTask.avatarRefs;
          }
        }
        // Clean subtask refs if applicable
        if (avatar.originalSubtaskId) {
          const subtask = parentTask?.subtasks?.find(s => s.id === avatar.originalSubtaskId);
          if (subtask?.avatarRefs) {
            subtask.avatarRefs = subtask.avatarRefs.filter(
              r => !(r.spaceId === avatarSpaceId && r.createdAt === avatarCreatedAt)
            );
            if (subtask.avatarRefs.length === 0) {
              subtask.isMirrorSource = false;
              delete subtask.avatarRefs;
            }
          }
        }
      }
      // Delete the avatar task
      if (avatarSpace?.tasks) {
        avatarSpace.tasks = avatarSpace.tasks.filter(t => t.createdAt !== avatarCreatedAt);
      }
      console.log(`[SpController] Avatar deleted & unlinked from Space ${avatarSpaceId}`);
    } else {
      // --- Orphan ref: avatar is gone, scan all originals to clean the dangling ref ---
      spaces.forEach(space => {
        if (!space.tasks) return;
        space.tasks.forEach(task => {
          if (!task.isMirrorSource || !task.avatarRefs) return;
          const before = task.avatarRefs.length;
          task.avatarRefs = task.avatarRefs.filter(
            r => !(r.spaceId === avatarSpaceId && r.createdAt === avatarCreatedAt)
          );
          if (task.avatarRefs.length === 0) {
            task.isMirrorSource = false;
            delete task.avatarRefs;
          }
          if (task.avatarRefs.length !== before) {
            // Also clean subtasks
            (task.subtasks || []).forEach(sub => {
              if (!sub.avatarRefs) return;
              sub.avatarRefs = sub.avatarRefs.filter(
                r => !(r.spaceId === avatarSpaceId && r.createdAt === avatarCreatedAt)
              );
              if (sub.avatarRefs.length === 0) {
                sub.isMirrorSource = false;
                delete sub.avatarRefs;
              }
            });
          }
        });
      });
      console.log(`[SpController] Orphan ref removed (Space ${avatarSpaceId}, task ${avatarCreatedAt})`);
    }

    saveData(true);
    this._render();
  }

  /**
   * Call when a space is deleted to remove all orphan avatars pointing to it
   */
  cleanupOrphanAvatars(deletedSpaceId) {
    getSpaces().forEach(space => {
      if (!space.tasks) return;
      const before = space.tasks.length;
      space.tasks = space.tasks.filter(
        t => !(t.isMirrorAvatar && t.originalSpaceId === deletedSpaceId)
      );
      if (space.tasks.length !== before) {
        console.log(`[SpController] Cleaned orphan avatars in Space ${space.id}`);
      }
    });
  }

}

export const spController = new SpController();

export function initSpMirrorFeature(renderCallback) {
  spController.init(renderCallback);
}
