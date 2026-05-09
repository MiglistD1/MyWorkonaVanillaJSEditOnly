/**
 * เดิมเชื่อม Google Keep — ตอนนี้เปิด Note webapp (React) แทน ตั้ง URL ใน App Settings
 */
import { openNoteWebappInNewTab } from '../core/noteWebapp.js';

export function initGoogleKeep() {
    const btnOpen = document.getElementById('btn-open-keep');
    if (btnOpen) {
        btnOpen.addEventListener('click', (e) => {
            e.stopPropagation();
            openNoteWebappInNewTab();
        });
    }

    document.addEventListener('click', (e) => {
        if (e.target.closest('#master-btn-open-keep')) {
            e.stopPropagation();
            openNoteWebappInNewTab();
        }
    });
}

/** เดิมใช้อัปเดตปุ่ม Keep label — คง export ไว้ให้โค้ดเก่าเรียกได้ */
export function updateKeepTagButtonState() {
    /* no-op */
}

/** เดิมเปิด Keep พร้อม tag — ตอนนี้เปิดแค่ Note webapp */
export function openKeepWithTag(_tag, _isSideView) {
    openNoteWebappInNewTab();
}
