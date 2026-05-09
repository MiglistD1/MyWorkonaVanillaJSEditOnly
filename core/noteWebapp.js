import { getAppSettings } from './storage.js';

/** URL ของ note-webapp (Vite dev ปกติที่ 5173) — ตั้งใน App Settings */
export function getNoteWebappUrl() {
    return (getAppSettings().noteWebappUrl || '').trim();
}

/** Origin ของ note webapp — ใช้เทียบแท็บ/ลิงก์ (openOrFocusTab ฯลฯ) */
export function getNoteWebappOrigin() {
    try {
        let u = getNoteWebappUrl();
        if (!u) u = 'http://localhost:5173';
        if (!u.includes('://')) u = `http://${u}`;
        return new URL(u).origin;
    } catch {
        return null;
    }
}

/** URL เต็มสำหรับ iframe / เปิดแท็บ */
export function resolveNoteWebappUrl() {
    let u = getNoteWebappUrl();
    if (!u) u = 'http://localhost:5173';
    try {
        const raw = u.includes('://') ? u : `http://${u}`;
        return new URL(raw).href;
    } catch {
        return 'http://localhost:5173/';
    }
}

const NOTE_WEBAPP_IFRAME_IDS = ['note-webapp-iframe'];

/** อัปเดต src iframe note-webapp ทุกจุดเมื่อ Settings เปลี่ยน URL */
export function syncAllNoteWebappIframes() {
    const url = resolveNoteWebappUrl();
    for (const id of NOTE_WEBAPP_IFRAME_IDS) {
        const iframe = document.getElementById(id);
        if (!iframe || iframe.tagName !== 'IFRAME') continue;
        if (iframe.dataset.embedSrc !== url) {
            iframe.src = url;
            iframe.dataset.embedSrc = url;
        }
    }
}

export function openNoteWebappInNewTab() {
    let u = getNoteWebappUrl();
    if (!u) u = 'http://localhost:5173';
    try {
        const url = u.includes('://') ? u : `http://${u}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
        alert('URL Note webapp ไม่ถูกต้อง — ตั้งใน App Settings');
    }
}
