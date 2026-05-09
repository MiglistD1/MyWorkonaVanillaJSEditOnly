import { getAppSettings, saveData, getCurrentSpaceId, getCurrentSpace } from '../core/storage.js';
import { buildObsidianOpenUri, openObsidianUriInBrowser } from '../core/obsidianUri.js';
import { openNoteWebappInNewTab } from '../core/noteWebapp.js';
import { openNoteWebappPickWindow } from '../core/noteWebappPickBridge.js';
import { renderQuickNoteLinkBanner } from '../core/quickNoteWebLinkUi.js';
import { noteSpaceLinkReady } from '../features/noteWebappBridge.js';

/**
 * 📝 Dashboard Quick Note — rich text ในแอป (contenteditable) เหมือน Quick Notes คอลัมน์หลัก
 */

export function initDashboardQuickNote() {
    renderDashboardQuickNote();
}

export function toggleDashboardQuickNote() {
    const settings = getAppSettings();
    if (!settings.dashboardQuickNote) {
       settings.dashboardQuickNote = { isOpen: false, isPinned: false, collapsed: false, content: "", obsidianNoteRelPath: '', x: 100, y: 100, w: 350, h: 400 };
    }
    settings.dashboardQuickNote.isOpen = !settings.dashboardQuickNote.isOpen;
    saveData();
    renderDashboardQuickNote();

    if (window.renderDefaultDashboard) window.renderDefaultDashboard();
}

function attachFloatingNoteEditor(el) {
    const toolbar = el.querySelector('.db-quick-note-toolbar');
    if (toolbar) {
        toolbar.querySelectorAll('button[data-db-note-cmd]').forEach((btn) => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const cmd = btn.getAttribute('data-db-note-cmd');
                if (cmd) document.execCommand(cmd, false, undefined);
            });
        });
    }
    const noteEl = el.querySelector('#db-workspace-note');
    if (!noteEl) return;
    const space = getCurrentSpace();
    const webLinked = noteSpaceLinkReady(space);
    const suppressed = !!(space?.quickNoteSuppressLocalEditor);
    if (!webLinked && document.activeElement !== noteEl) {
        noteEl.innerHTML = suppressed ? '' : space?.note || '';
    }
    const persist = () => {
        const sp = getCurrentSpace();
        if (!sp) return;
        sp.note = noteEl.innerHTML;
        saveData();
    };
    noteEl.addEventListener('input', persist);
    noteEl.addEventListener('blur', persist);

    const ban = el.querySelector('#db-quick-note-link-banner');
    const sp = getCurrentSpace();
    if (ban && sp) {
        renderQuickNoteLinkBanner(
            ban,
            sp,
            { pickTarget: 'dashboard', forSpaceId: sp.id },
            {
                note: noteEl,
                toolbar: el.querySelector('.db-quick-note-toolbar'),
            }
        );
    }
}

export function renderDashboardQuickNote() {
    const settings = getAppSettings();
    const state = settings.dashboardQuickNote;
    if (!state) return;

    const spaceId = getCurrentSpaceId();
    const shouldShow = state.isOpen && (state.isPinned || spaceId === 0);

    let el = document.getElementById('dashboard-floating-note');

    if (!shouldShow) {
        if (el) el.remove();
        return;
    }

    if (!el) {
        el = document.createElement('div');
        el.id = 'dashboard-floating-note';
        el.className = 'floating-note';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        document.body.appendChild(el);
    }

    el.style.left = `${state.x}px`;
    el.style.top = `${state.y}px`;
    el.style.width = `${state.w}px`;
    el.style.height = state.collapsed ? 'auto' : `${state.h}px`;

    el.innerHTML = `
        <div id="db-note-header" class="section-label" style="display:flex; justify-content:space-between; align-items:center; padding: 10px 15px; background: var(--bg-spacebar); border-bottom: 1px solid var(--border-color); cursor: grab; user-select:none; margin: -10px -10px 0 -10px; border-radius: 8px 8px 0 0;">
            <div style="font-weight: 800; font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px;">Quick Note</div>
            <div class="note-controls" style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
                <div class="db-obsidian-btn-group" style="display: flex; gap: 2px; background: rgba(139, 92, 246, 0.12); padding: 2px; border-radius: 6px; border: 1px solid rgba(139, 92, 246, 0.28); align-items: center;">
                    <button type="button" class="btn-icon" id="db-note-obsidian-open" title="เปิดใน Obsidian" style="color: #7c3aed;"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></button>
                    <button type="button" class="btn-icon" id="db-note-obsidian-path" title="ตั้ง path ไฟล์ใน vault" style="opacity: 0.85; color: #7c3aed;"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button>
                    <button type="button" class="btn-icon" id="db-note-obsidian-clear" title="ล้าง path" style="opacity: 0.75; color: #64748b;"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>
                <button type="button" class="btn-icon" id="db-note-pick" title="เลือกโน้ตจาก LLM Wiki" style="color: var(--primary-color);">📎</button>
                <button type="button" class="btn-icon" id="db-note-webapp-tab" title="เปิด LLM Wiki Manager ในแท็บใหม่" style="color: var(--primary-color);">📝</button>
                <button type="button" class="btn-icon" id="db-note-pin" title="Pin" style="color: ${state.isPinned ? 'var(--primary-color)' : 'inherit'}; opacity: ${state.isPinned ? '1' : '0.5'}"><svg class="svg-icon-sm"><use href="#icon-pin"></use></svg></button>
                <button type="button" class="btn-icon" id="db-note-collapse" title="ย่อ / ขยาย"><svg class="svg-icon-sm"><use href="#icon-chevron-${state.collapsed ? 'up' : 'down'}"></use></svg></button>
                <button type="button" class="btn-icon" id="db-note-close" style="font-size: 16px; opacity: 0.6; width: 24px; height: 24px;">✕</button>
            </div>
        </div>
        <div id="db-note-body" style="flex:1; min-height:0; display: ${state.collapsed ? 'none' : 'flex'}; flex-direction: column; background: var(--bg-card); padding: 8px; box-sizing: border-box;">
            <div id="db-quick-note-link-banner" style="flex-shrink:0;margin-bottom:8px;"></div>
            <div class="db-quick-note-toolbar" style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:6px; flex-shrink:0;">
                <button type="button" class="btn-icon" data-db-note-cmd="bold" title="Bold" style="font-weight:800;">B</button>
                <button type="button" class="btn-icon" data-db-note-cmd="italic" title="Italic" style="font-style:italic;">I</button>
                <button type="button" class="btn-icon" data-db-note-cmd="underline" title="Underline" style="text-decoration:underline;">U</button>
                <button type="button" class="btn-icon" data-db-note-cmd="insertUnorderedList" title="Bullet list">•</button>
                <button type="button" class="btn-icon" data-db-note-cmd="insertOrderedList" title="Numbered list">1.</button>
            </div>
            <div id="db-workspace-note" contenteditable="true" spellcheck="true"
                style="flex:1; min-height:200px; overflow-y:auto; padding:8px 10px; font-family:var(--note-font); font-size:var(--app-font-size); line-height:1.55; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-card); outline:none;"></div>
        </div>
    `;

    setupNoteDrag(el);
    attachFloatingNoteEditor(el);

    el.querySelector('#db-note-close').onclick = () => toggleDashboardQuickNote();

    el.querySelector('#db-note-pin').onclick = () => {
        state.isPinned = !state.isPinned;
        saveData();
        renderDashboardQuickNote();
    };

    el.querySelector('#db-note-collapse').onclick = () => {
        state.collapsed = !state.collapsed;
        saveData();
        renderDashboardQuickNote();
    };

    el.querySelector('#db-note-pick').onclick = () => {
        const sp = getCurrentSpace();
        openNoteWebappPickWindow({
            pickTarget: 'dashboard',
            forSpaceId: sp?.id ?? null,
        });
    };
    el.querySelector('#db-note-webapp-tab').onclick = () => openNoteWebappInNewTab();

    const obsPathBtn = el.querySelector('#db-note-obsidian-path');
    if (obsPathBtn) {
        obsPathBtn.onclick = () => {
            const cur = (state.obsidianNoteRelPath || '').trim();
            const next = prompt('Path ไฟล์ใน vault (เช่น 4_Notes/foo/note.md):', cur);
            if (next === null) return;
            state.obsidianNoteRelPath = next.trim();
            saveData();
        };
    }
    const obsOpenBtn = el.querySelector('#db-note-obsidian-open');
    if (obsOpenBtn) {
        obsOpenBtn.onclick = () => {
            const vault = (getAppSettings().obsidianVaultName || '').trim();
            if (!vault) {
                alert('ตั้งชื่อ Obsidian vault ใน App Settings (ปุ่ม ⚙️)');
                return;
            }
            let rel = (state.obsidianNoteRelPath || '').trim();
            if (!rel) {
                const entered = prompt('Path ไฟล์ใน vault:', '');
                if (!entered || !entered.trim()) return;
                rel = entered.trim();
                state.obsidianNoteRelPath = rel;
                saveData();
            }
            const uri = buildObsidianOpenUri(vault, rel);
            if (uri) openObsidianUriInBrowser(uri);
        };
    }
    const obsClearBtn = el.querySelector('#db-note-obsidian-clear');
    if (obsClearBtn) {
        obsClearBtn.onclick = () => {
            if (!(state.obsidianNoteRelPath || '').trim()) {
                alert('ยังไม่ได้ตั้ง path');
                return;
            }
            if (!confirm('ล้าง path สำหรับ Obsidian?')) return;
            state.obsidianNoteRelPath = '';
            saveData();
            renderDashboardQuickNote();
        };
    }
}

function setupNoteDrag(el) {
    const header = el.querySelector('#db-note-header');
    if (!header) return;

    let isDragging = false;
    let offset = { x: 0, y: 0 };

    header.onmousedown = (e) => {
        if (e.target.closest('button')) return;
        isDragging = true;
        el.classList.add('is-interacting');
        const rect = el.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;
        document.body.style.userSelect = 'none';
        el.style.transition = 'none';
    };

    const handleMove = (e) => {
        if (!isDragging) return;
        el.style.left = `${e.clientX - offset.x}px`;
        el.style.top = `${e.clientY - offset.y}px`;
    };

    const handleUp = () => {
        if (isDragging || el.classList.contains('is-interacting')) {
            isDragging = false;
            el.classList.remove('is-interacting');
            document.body.style.userSelect = '';
            el.style.transition = 'all 0.2s ease';
            const settings = getAppSettings();
            const rect = el.getBoundingClientRect();
            settings.dashboardQuickNote.x = rect.left;
            settings.dashboardQuickNote.y = rect.top;
            settings.dashboardQuickNote.w = rect.width;
            settings.dashboardQuickNote.h = rect.height;
            saveData();
        }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
}
