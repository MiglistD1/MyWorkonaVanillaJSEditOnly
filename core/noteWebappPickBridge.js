/**
 * รับการเลือกโน้ตจาก LLM Wiki (/notes/embed/pick) แล้วใส่เนื้อหาใน Quick Note + path Obsidian
 */
import { getAppSettings, getSpaces, getCurrentSpaceId, saveData } from './storage.js';
import {
    buildNoteWebappPickUrl,
    isAllowedNoteWebappOrigin,
    NOTE_WEBAPP_PICK_MSG,
} from '../features/noteWebappBridge.js';

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** แปลง markdown (ตัวที่ LLM Wiki ส่งมา ไม่มี frontmatter) → HTML สำหรับ contenteditable */
export function markdownToQuickNoteHtml(md) {
    const t = (md ?? '').toString();
    return `<div class="quick-note-md-import" style="white-space:pre-wrap;font-family:inherit;line-height:1.5;">${escapeHtml(t)}</div>`;
}

/** path สัมพันธ์ vault แบบเดา — ถ้าโครงสร้างจริงต่างให้แก้ใน “ตั้ง path” */
export function guessObsidianRelPath(folder, slug) {
    const s = (slug || '').trim() || 'note';
    const f = (folder || '').trim().replace(/^\/+|\/+$/g, '');
    return f ? `${f}/${s}.md` : `${s}.md`;
}

function getCommandCenterNoteSpace() {
    const allSpaces = getSpaces().filter((s) => !s.isArchived);
    const pickId =
        (typeof window !== 'undefined' && window.masterTodoListState?.selectedQuickAddSpaceId) ??
        allSpaces[0]?.id;
    if (pickId == null) return null;
    return getSpaces().find((s) => s.id === pickId) || null;
}

/** Space ที่จะรับโน้ตจาก pick — ตาม forSpaceId / Command Center / space ปัจจุบัน */
export function resolveSpaceForNotePick(payload) {
    const rawId = payload.forSpaceId;
    if (rawId != null && rawId !== '' && Number.isFinite(Number(rawId))) {
        const id = Number(rawId);
        return getSpaces().find((s) => s.id === id) || null;
    }
    const sid = getCurrentSpaceId();
    if (sid === 0) return getCommandCenterNoteSpace();
    return getSpaces().find((s) => s.id === sid) || null;
}

/** forSpaceId ที่จะส่งไปหน้า pick เวลาเปิดหน้าต่างเลือกโน้ต */
export function resolveDefaultPickForSpaceId() {
    const sid = getCurrentSpaceId();
    if (sid === 0) {
        const allSpaces = getSpaces().filter((s) => !s.isArchived);
        return (
            window.masterTodoListState?.selectedQuickAddSpaceId ??
            allSpaces[0]?.id ??
            null
        );
    }
    return sid;
}

/**
 * เปิดหน้าต่าง LLM Wiki โหมดเลือกโน้ต
 * @param {{ pickTarget?: 'dashboard' | 'space', forSpaceId?: number | null }} opts
 */
export function openNoteWebappPickWindow(opts = {}) {
    const app = getAppSettings();
    const base = (app.noteWebappUrl || '').trim() || 'http://localhost:5173';
    const pickTarget = opts.pickTarget || 'space';
    const forSpaceId =
        opts.forSpaceId !== undefined ? opts.forSpaceId : resolveDefaultPickForSpaceId();
    const extId =
        typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : '';
    const url = buildNoteWebappPickUrl(
        base,
        window.location.origin,
        pickTarget,
        forSpaceId,
        extId || undefined,
    );
    // ห้ามใส่ noopener — ถ้ามี opener หน้า pick จะ postMessage กลับ; ถ้าไม่มี (Side Panel) ใช้ extensionId + sendMessage แทน
    window.open(url, 'noteWebappPick', 'width=720,height=700');
}

function stripMetaAndApplyPickPayload(raw) {
    if (!raw || raw.type !== NOTE_WEBAPP_PICK_MSG) return;
    const ts = raw._ts;
    if (ts && Date.now() - Number(ts) > 120000) return;
    const { _ts, ...rest } = raw;
    applyPickPayload(rest);
}

function applyPickPayload(payload) {
    const space = resolveSpaceForNotePick(payload);
    if (!space) {
        alert('ไม่พบ Space สำหรับผูกโน้ต — มี space ในระบบหรือยัง?');
        return;
    }

    const rel =
        (payload.noteFile && String(payload.noteFile).trim()) ||
        guessObsidianRelPath(payload.folder, payload.slug);
    space.note = markdownToQuickNoteHtml(payload.markdown);
    space.obsidianNoteRelPath = rel;
    delete space.quickNoteSuppressLocalEditor;
    space.noteWebappLink = {
        slug: payload.slug,
        folder: payload.folder || undefined,
        title: (payload.title || payload.slug || '').trim(),
        linkedAt: Date.now(),
        noteFile: payload.noteFile || undefined,
    };

    const app = getAppSettings();
    app.quickNoteObsidianRelPath = rel;

    if (payload.pickTarget === 'dashboard') {
        if (!app.dashboardQuickNote) {
            app.dashboardQuickNote = {
                isOpen: false,
                isPinned: false,
                collapsed: false,
                content: '',
                obsidianNoteRelPath: '',
                x: 100,
                y: 100,
                w: 350,
                h: 400,
            };
        }
        app.dashboardQuickNote.obsidianNoteRelPath = rel;
    }

    saveData(true);

    if (typeof window !== 'undefined' && typeof window.renderAll === 'function') {
        window.renderAll();
    }
}

let installed = false;

export function installNoteWebappPickListener() {
    if (typeof window === 'undefined' || installed) return;
    installed = true;

    window.addEventListener('message', (ev) => {
        const d = ev.data;
        if (!d || d.type !== NOTE_WEBAPP_PICK_MSG) return;

        const app = getAppSettings();
        const base = app.noteWebappUrl || app.noteWebappBaseUrl || '';
        if (!isAllowedNoteWebappOrigin(ev.origin, base)) return;

        applyPickPayload(d);
    });

    // หน้า pick บน localhost ส่งผลผ่าน chrome.runtime.sendMessage เมื่อไม่มี opener (เช่น เปิดจาก Side Panel)
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const consume = () => {
            chrome.storage.local.get('pendingNoteWebappPick', (r) => {
                const v = r.pendingNoteWebappPick;
                if (!v || v.type !== NOTE_WEBAPP_PICK_MSG) return;
                chrome.storage.local.remove('pendingNoteWebappPick', () => {
                    stripMetaAndApplyPickPayload(v);
                });
            });
        };
        consume();
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            const ch = changes.pendingNoteWebappPick;
            if (!ch?.newValue || ch.newValue.type !== NOTE_WEBAPP_PICK_MSG) return;
            chrome.storage.local.remove('pendingNoteWebappPick', () => {
                stripMetaAndApplyPickPayload(ch.newValue);
            });
        });
    }
}
