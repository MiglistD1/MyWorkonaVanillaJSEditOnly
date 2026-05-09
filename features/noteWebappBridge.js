/**
 * ผสาน MyWorkona กับ LLM Wiki Manager — เส้นทาง /notes, /notes/embed, /notes/embed/pick
 */
import { getAppSettings } from '../core/storage.js';

/** Space ผูกโน้ตพร้อมใช้ — ต้องมี noteFile จาก vault */
export function noteSpaceLinkReady(space) {
  const link = space?.noteWebappLink;
  if (!link) return false;
  return Boolean(link.noteFile?.trim());
}

export const NOTE_WEBAPP_PICK_MSG = 'NOTE_WEBAPP_PICK';

/** iframe ส่งความสูงเนื้อหาให้ parent ปรับความสูง */
export const NOTE_WEBAPP_EMBED_HEIGHT_MSG = 'NOTE_WEBAPP_EMBED_HEIGHT';

/**
 * ลงทะเบียนครั้งเดียว: รับ postMessage จาก iframe แล้วตั้ง height ของ iframe ฝังทุกจุด
 */
export function installNoteWebappEmbedHeightListener() {
  if (typeof window === 'undefined' || window.__nwEmbedHeightListenerInstalled) return;
  window.__nwEmbedHeightListenerInstalled = true;

  window.addEventListener('message', (ev) => {
    if (!ev.data || ev.data.type !== NOTE_WEBAPP_EMBED_HEIGHT_MSG) return;
    const settings = getAppSettings();
    if (!isAllowedNoteWebappOrigin(ev.origin, settings.noteWebappUrl || settings.noteWebappBaseUrl)) return;

    const raw = Number(ev.data.height);
    if (!Number.isFinite(raw) || raw < 80) return;
    const capped = Math.min(Math.round(raw), 20000);

    const apply = (iframe) => {
      if (!iframe || iframe.contentWindow !== ev.source) return false;
      iframe.style.height = `${capped}px`;
      iframe.style.minHeight = `${capped}px`;
      iframe.style.maxHeight = 'none';
      return true;
    };

    document.querySelectorAll('iframe.note-webapp-embed-iframe').forEach((el) => {
      apply(el);
    });
  });
}

export function normalizeNoteWebappBaseUrl(url) {
  const d = 'http://localhost:5173';
  if (!url || typeof url !== 'string') return d;
  const t = url.trim().replace(/\/$/, '');
  return t || d;
}

/**
 * URL โหมด embed (หน้าต่างย่อย / iframe)
 * @param {{ slug?: string, folder?: string, noteFile?: string } | null | undefined} link
 */
export function buildNoteWebappEmbedNoteUrl(base, link) {
  const b = normalizeNoteWebappBaseUrl(base);
  const nf = link?.noteFile?.trim();
  if (!nf) return `${b}/notes`;
  return `${b}/notes/embed?noteFile=${encodeURIComponent(nf)}`;
}

/**
 * เปิดในแท็บเต็ม
 * @param {{ slug?: string, folder?: string, noteFile?: string } | null | undefined} link
 */
export function buildNoteWebappFullNoteUrl(base, link) {
  const b = normalizeNoteWebappBaseUrl(base);
  const nf = link?.noteFile?.trim();
  if (!nf) return `${b}/notes`;
  return `${b}/notes?noteFile=${encodeURIComponent(nf)}`;
}

/** @deprecated ใช้ buildNoteWebappEmbedNoteUrl — ชื่อเดิมที่ iframe ใช้ */
export function buildNoteWebappEditorUrl(base, link) {
  return buildNoteWebappEmbedNoteUrl(base, link);
}

/**
 * @param {string} [parentOrigin] window.location.origin ของหน้า extension
 * @param {'dashboard'|'space'} [pickTarget]
 * @param {number} [forSpaceId] เมื่อเปิดจาก Master peek — ผูกโน้ตกับ Space นี้โดยไม่ต้องสลับ current space
 * @param {string} [extensionId] chrome.runtime.id — ส่งผลกลับผ่าน sendMessage เมื่อไม่มี opener
 */
export function buildNoteWebappPickUrl(base, parentOrigin, pickTarget, forSpaceId, extensionId) {
  const b = normalizeNoteWebappBaseUrl(base);
  const q = new URLSearchParams();
  if (parentOrigin) q.set('parentOrigin', parentOrigin);
  if (pickTarget) q.set('pickTarget', pickTarget);
  if (forSpaceId != null && forSpaceId !== '') q.set('forSpaceId', String(forSpaceId));
  if (extensionId) q.set('extensionId', extensionId);
  const qs = q.toString();
  return `${b}/notes/embed/pick${qs ? `?${qs}` : ''}`;
}

/** ตรวจว่า postMessage มาจาก origin ของแท็บ LLM Wiki ที่ตั้งค่าไว้ */
export function isAllowedNoteWebappOrigin(evOrigin, configuredBase) {
  try {
    const cfg = new URL(normalizeNoteWebappBaseUrl(configuredBase));
    if (evOrigin === cfg.origin) return true;
    if (cfg.hostname === 'localhost' || cfg.hostname === '127.0.0.1') {
      const u = new URL(evOrigin);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    }
    return false;
  } catch {
    return false;
  }
}
