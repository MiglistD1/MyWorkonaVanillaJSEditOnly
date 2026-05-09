/**
 * Quick Note + LLM Wiki: เลือกโน้ต (📎) → แสดงชื่อที่ผูก → เปิดแท็บ/หน้าต่าง localhost (ไม่ฝัง iframe)
 */
import { getAppSettings, getSpaces, saveData } from './storage.js';
import { openNoteWebappPickWindow } from './noteWebappPickBridge.js';
import { buildNoteWebappFullNoteUrl, noteSpaceLinkReady } from '../features/noteWebappBridge.js';
import {
    openOrFocusDetachedNoteWindow,
    syncDetachedNoteWindowUrl,
    getDetachedBoundsLockState,
    lockDetachedNoteWindowBounds,
    unlockDetachedNoteWindowBounds,
    minimizeDetachedNoteWindow,
    closeDetachedNoteWindow,
} from './noteWebappDetachedWindow.js';

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** URL โน้ตแบบแท็บเต็ม #/note/… */
function linkedNoteFullUrl(space) {
    const base = (getAppSettings().noteWebappUrl || '').trim() || 'http://localhost:5173';
    return buildNoteWebappFullNoteUrl(base, space?.noteWebappLink);
}

function openLinkedNoteNewTab(space) {
    if (!noteSpaceLinkReady(space)) return;
    const url = linkedNoteFullUrl(space);
    window.open(url, '_blank', 'noopener,noreferrer');
}

/** อัปเดตสี/ปุ่มแถวล็อกหน้าต่างโน้ตตามค่าใน storage */
function refreshQnDetachedLockUi(bannerEl) {
    if (!bannerEl) return;
    void getDetachedBoundsLockState().then(({ locked }) => {
        const row = bannerEl.querySelector('.qn-detached-bounds-row');
        const lockBtn = bannerEl.querySelector('.qn-btn-lock-bounds');
        const unlockBtn = bannerEl.querySelector('.qn-btn-unlock-bounds');
        const status = bannerEl.querySelector('.qn-detached-lock-status');
        if (!row || !lockBtn || !unlockBtn) return;

        if (locked) {
            row.style.background = 'rgba(234, 179, 8, 0.14)';
            row.style.borderColor = 'rgba(180, 83, 9, 0.45)';
            lockBtn.classList.remove('btn-outline');
            lockBtn.classList.add('btn-primary');
            unlockBtn.disabled = false;
            unlockBtn.style.opacity = '1';
        } else {
            row.style.background = 'transparent';
            row.style.borderColor = 'transparent';
            lockBtn.classList.add('btn-outline');
            lockBtn.classList.remove('btn-primary');
            unlockBtn.disabled = true;
            unlockBtn.style.opacity = '0.5';
        }
        if (status) {
            status.textContent = locked ? 'ล็อกขนาด/ตำแหน่ง · ใช้งานอยู่' : '';
            status.hidden = !locked;
        }
    });
}

function removeLegacyEmbedFallback(noteEl, toolbar) {
    const p = noteEl?.parentElement || toolbar?.parentElement;
    if (!p) return;
    p.querySelectorAll('.qn-extension-embed-fallback').forEach((el) => el.remove());
}

/** เมื่อผูกโน้ตแล้ว หรือหลังเลิกผูก (รอเลือกโน้ตใหม่): ซ่อน rich editor */
export function syncQuickNoteLinkedEditors(noteEl, toolbar, space) {
    removeLegacyEmbedFallback(noteEl, toolbar);
    const linked = noteSpaceLinkReady(space);
    const hideLocal = linked || !!space?.quickNoteSuppressLocalEditor;
    if (hideLocal) {
        if (noteEl) {
            noteEl.style.display = 'none';
            noteEl.setAttribute('aria-hidden', 'true');
        }
        if (toolbar) {
            toolbar.style.display = 'none';
            toolbar.setAttribute('aria-hidden', 'true');
        }
    } else {
        if (noteEl) {
            noteEl.style.display = '';
            noteEl.removeAttribute('aria-hidden');
        }
        if (toolbar) {
            toolbar.style.display = '';
            toolbar.removeAttribute('aria-hidden');
        }
    }
}

/** ล็อกตัวแก้ไข: quickNoteLockUnlinked เมื่อยังไม่ผูก — ซ่อน/ล็อกเมื่อผูกหรือหลังเลิกผูก (รอ 📎) */
export function applyQuickNoteEditorsLock(noteEl, toolbar, space) {
    if (!noteEl) return;
    const lock = !!getAppSettings().quickNoteLockUnlinked;
    const linked = noteSpaceLinkReady(space);
    const suppressed = !!space?.quickNoteSuppressLocalEditor;
    const editable = !linked && !suppressed && !lock;
    noteEl.contentEditable = editable ? 'true' : 'false';
    noteEl.classList.toggle('quick-note-locked', !editable);
    noteEl.setAttribute('aria-readonly', editable ? 'false' : 'true');
    if (toolbar) {
        toolbar.querySelectorAll('button').forEach((b) => {
            b.disabled = !editable;
        });
    }
}

function unlinkSpace(spaceId) {
    if (
        !confirm(
            'เลิกผูกกับ LLM Wiki?\n' +
                'ข้อความ Quick Note ในแอปนี้จะถูกล้าง และจะไม่มีกล่องพิมพ์จนกว่าจะเลือกโน้ตใหม่ (📎)'
        )
    ) {
        return;
    }
    const sp = getSpaces().find((s) => s.id === spaceId);
    if (!sp) return;
    delete sp.noteWebappLink;
    sp.note = '';
    sp.quickNoteSuppressLocalEditor = true;
    saveData(true);
    void closeDetachedNoteWindow();
    window.renderAll?.();
}

/**
 * @param {{ note: HTMLElement | null, toolbar: HTMLElement | null }} editors
 */
export function renderQuickNoteLinkBanner(bannerEl, space, pickOpts, editors) {
    if (!bannerEl || !space) return;

    const noteEl = editors?.note || null;
    const toolbar = editors?.toolbar || null;
    syncQuickNoteLinkedEditors(noteEl, toolbar, space);
    applyQuickNoteEditorsLock(noteEl, toolbar, space);

    const link = space.noteWebappLink;
    const lockOn = !!getAppSettings().quickNoteLockUnlinked;

    if (noteSpaceLinkReady(space)) {
        const folderPart = link.folder ? `${esc(link.folder)}/` : '';
        bannerEl.innerHTML = `
            <div class="qn-web-banner qn-web-banner--linked" style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:8px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.35);font-size:12px;">
                <span style="min-width:0;">
                    <span style="font-weight:700;color:var(--text-main);">โน้ตที่เชื่อม:</span>
                    <strong style="margin-left:6px;">${esc(link.title || link.slug)}</strong>
                    <span style="opacity:.8;font-weight:500;"> · ${folderPart}${esc(link.slug)}</span>
                    <span style="display:block;opacity:.65;font-size:11px;margin-top:6px;line-height:1.45;">
                        แก้เนื้อหาใน LLM Wiki — <strong>แท็บใหม่</strong> เปิดแบบเต็ม UI · <strong>หน้าต่างโน้ต</strong> โหมด embed ~ครึ่งจอ — เลือกโน้ตอื่นหรือเปิดหน้าแรกแอปใช้ปุ่ม <strong>📎 / 📝</strong> บนหัว Quick Note · จัดขนาดแล้วกด <strong>ล็อก</strong> เพื่อจำตำแหน่งครั้งถัดไป
                    </span>
                </span>
                <span style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
                <span style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-items:center;">
                    <button type="button" class="btn btn-primary qn-btn-open-tab" style="font-size:11px;padding:4px 10px;" title="เปิดโน้ตในแท็บใหม่ของหน้าต่างเบราว์เซอร์นี้">แท็บใหม่</button>
                    <button type="button" class="btn btn-outline qn-btn-open-win" style="font-size:11px;padding:4px 10px;" title="เปิดหรือโฟกัสหน้าต่างโน้ต (embed) — ใช้หน้าต่างเดิมถ้ายังไม่ปิด">หน้าต่างโน้ต (~ครึ่งจอ)</button>
                    <button type="button" class="btn btn-outline qn-btn-unlink" style="font-size:11px;padding:4px 10px;color:#b91c1c;border-color:#fecaca;">เลิกผูก</button>
                </span>
                <span class="qn-detached-bounds-row" style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-items:center;width:100%;box-sizing:border-box;border:1px solid transparent;border-radius:6px;padding:6px 8px;transition:background .15s ease,border-color .15s ease;">
                    <span class="qn-detached-lock-status" hidden style="flex:1 1 120px;font-size:10px;font-weight:600;color:#a16207;letter-spacing:.02em;min-width:0;line-height:1.35;margin-right:auto;text-align:left;" aria-live="polite"></span>
                    <button type="button" class="btn btn-outline qn-btn-lock-bounds" style="font-size:11px;padding:4px 10px;" title="จำขนาดและตำแหน่งหน้าต่างโน้ตสำหรับครั้งต่อไป">ล็อกขนาด/ตำแหน่ง</button>
                    <button type="button" class="btn btn-outline qn-btn-unlock-bounds" style="font-size:11px;padding:4px 10px;" title="ใช้ขนาดเริ่มต้นเมื่อเปิดครั้งถัดไป">ปลดล็อก</button>
                    <button type="button" class="btn btn-outline qn-btn-min-detached" style="font-size:11px;padding:4px 10px;" title="ย่อหน้าต่างโน้ต (taskbar)">ย่อหน้าต่างโน้ต</button>
                    <button type="button" class="btn btn-outline qn-btn-close-detached" style="font-size:11px;padding:4px 10px;color:#b91c1c;border-color:#fecaca;" title="ปิดหน้าต่างโน้ต">ปิดหน้าต่างโน้ต</button>
                </span>
                </span>
            </div>`;
        bannerEl.querySelector('.qn-btn-open-tab')?.addEventListener('click', () => openLinkedNoteNewTab(space));
        bannerEl.querySelector('.qn-btn-open-win')?.addEventListener('click', () => {
            void openOrFocusDetachedNoteWindow(space);
        });
        bannerEl.querySelector('.qn-btn-lock-bounds')?.addEventListener('click', () => {
            void lockDetachedNoteWindowBounds().then(() => refreshQnDetachedLockUi(bannerEl));
        });
        bannerEl.querySelector('.qn-btn-unlock-bounds')?.addEventListener('click', () => {
            void unlockDetachedNoteWindowBounds().then(() => refreshQnDetachedLockUi(bannerEl));
        });
        bannerEl.querySelector('.qn-btn-min-detached')?.addEventListener('click', () => {
            void minimizeDetachedNoteWindow();
        });
        bannerEl.querySelector('.qn-btn-close-detached')?.addEventListener('click', () => {
            void closeDetachedNoteWindow();
        });
        bannerEl.querySelector('.qn-btn-unlink')?.addEventListener('click', () => unlinkSpace(space.id));
        refreshQnDetachedLockUi(bannerEl);
        void syncDetachedNoteWindowUrl(space);
    } else {
        const suppressed = !!space.quickNoteSuppressLocalEditor;
        const msg = suppressed
            ? 'เลิกผูกแล้ว — แก้โน้ตใน LLM Wiki เท่านั้น เลือกโน้ต (📎) เพื่อผูกใหม่ (ไม่มีกล่องพิมพ์ในแอป)'
            : lockOn
              ? 'ยังไม่ผูกโน้ต LLM Wiki — พิมพ์ด้านล่างไม่ได้จนกว่าจะเลือกโน้ต (📎)'
              : 'ยังไม่ผูกโน้ต LLM Wiki — พิมพ์ด้านล่างได้ หรือเลือกโน้ตเพื่อเปิดในแอป';
        const bg = suppressed ? 'rgba(59,130,246,0.08)' : lockOn ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)';
        const bd = suppressed ? 'rgba(59,130,246,0.28)' : lockOn ? 'rgba(239,68,68,0.28)' : 'rgba(245,158,11,0.28)';
        bannerEl.innerHTML = `
            <div class="qn-web-banner qn-web-banner--local" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 10px;border-radius:8px;background:${bg};border:1px solid ${bd};font-size:12px;">
                <span style="min-width:0;">${msg}</span>
                <button type="button" class="btn btn-primary qn-btn-banner-pick" style="font-size:11px;padding:2px 10px;">เลือกโน้ต 📎</button>
            </div>`;
        bannerEl.querySelector('.qn-btn-banner-pick')?.addEventListener('click', () =>
            openNoteWebappPickWindow({
                pickTarget: pickOpts.pickTarget || 'space',
                forSpaceId: pickOpts.forSpaceId == null ? undefined : pickOpts.forSpaceId,
            })
        );
    }
}
