/**
 * หน้าต่างโน้ต note-webapp แยก — chrome.windows (โหลด URL ได้สม่ำเสมอกว่า window.open)
 * ใช้ #/embed/note/… โฟกัสเนื้อหาโน้ต
 */
import { getAppSettings } from './storage.js';
import { buildNoteWebappEmbedNoteUrl, noteSpaceLinkReady } from '../features/noteWebappBridge.js';

const K_WIN = 'qnDetachedNoteWindowId';
const K_TAB = 'qnDetachedNoteTabId';
const K_BOUNDS = 'qnDetachedBoundsLock';

let listenerInstalled = false;

function storageGet(keys) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            resolve({});
            return;
        }
        chrome.storage.local.get(keys, resolve);
    });
}

function storageSet(obj) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            resolve();
            return;
        }
        chrome.storage.local.set(obj, resolve);
    });
}

function storageRemove(keys) {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            resolve();
            return;
        }
        chrome.storage.local.remove(keys, resolve);
    });
}

function defaultBounds() {
    const aw = typeof screen !== 'undefined' ? screen.availWidth : 1200;
    const ah = typeof screen !== 'undefined' ? screen.availHeight : 800;
    const al = typeof screen !== 'undefined' ? screen.availLeft : 0;
    const at = typeof screen !== 'undefined' ? screen.availTop : 0;
    const ww = Math.max(420, Math.round(aw / 2));
    return {
        left: Math.round(al + aw - ww),
        top: at,
        width: ww,
        height: ah,
    };
}

function embedUrlForSpace(space) {
    const base = (getAppSettings().noteWebappUrl || '').trim();
    return buildNoteWebappEmbedNoteUrl(base, space?.noteWebappLink);
}

export function initDetachedNoteWindowListener() {
    if (listenerInstalled || typeof chrome === 'undefined' || !chrome.windows?.onRemoved) return;
    listenerInstalled = true;
    chrome.windows.onRemoved.addListener((winId) => {
        storageGet([K_WIN]).then((r) => {
            if (r[K_WIN] === winId) {
                storageRemove([K_WIN, K_TAB]);
            }
        });
    });
}

/**
 * เปิดหรือโฟกัสหน้าต่างโน้ต — อัปเดต URL ถ้ามีอยู่แล้ว
 */
export async function openOrFocusDetachedNoteWindow(space) {
    initDetachedNoteWindowListener();
    if (!noteSpaceLinkReady(space)) return;

    const url = embedUrlForSpace(space);

    if (typeof chrome === 'undefined' || !chrome.windows?.create) {
        const b = defaultBounds();
        const feat = `popup=yes,width=${b.width},height=${b.height},left=${b.left},top=${b.top},menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes`;
        window.open(url, 'nwDetachedNote', feat)?.focus();
        return;
    }

    const st = await storageGet([K_WIN, K_TAB, K_BOUNDS]);
    let bounds = defaultBounds();
    const lock = st[K_BOUNDS];
    if (lock?.locked && Number.isFinite(lock.width) && lock.width > 200) {
        bounds = {
            left: lock.left ?? bounds.left,
            top: lock.top ?? bounds.top,
            width: lock.width,
            height: lock.height ?? bounds.height,
        };
    }

    if (st[K_WIN] != null) {
        try {
            const win = await chrome.windows.get(st[K_WIN], { populate: true });
            const tab = win.tabs?.[0];
            if (tab?.id != null) {
                await chrome.tabs.update(tab.id, { url });
                await chrome.windows.update(st[K_WIN], { focused: true });
                await storageSet({ [K_TAB]: tab.id });
                return;
            }
        } catch {
            await storageRemove([K_WIN, K_TAB]);
        }
    }

    const win = await chrome.windows.create({
        url,
        type: 'popup',
        focused: true,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
    });
    const tabId = win.tabs?.[0]?.id ?? null;
    await storageSet({ [K_WIN]: win.id, [K_TAB]: tabId });
}

/** เมื่อสลับโน้ตที่ผูก — อัปเดตแท็บในหน้าต่างที่เปิดค้างไว้ */
export async function syncDetachedNoteWindowUrl(space) {
    if (!noteSpaceLinkReady(space) || typeof chrome === 'undefined' || !chrome.tabs?.update) return;
    const url = embedUrlForSpace(space);
    const st = await storageGet([K_TAB, K_WIN]);
    const tabId = st[K_TAB];
    if (tabId == null) return;
    try {
        await chrome.tabs.update(tabId, { url });
    } catch {
        await storageRemove([K_WIN, K_TAB]);
    }
}

/** บันทึกตำแหน่ง/ขนาดหน้าต่างโน้ตที่เปิดอยู่ */
/** สำหรับ UI — แสดงว่าจำขนาด/ตำแหน่งหน้าต่างโน้ตไว้หรือไม่ */
export async function getDetachedBoundsLockState() {
    const st = await storageGet([K_BOUNDS]);
    return { locked: !!st[K_BOUNDS]?.locked };
}

export async function lockDetachedNoteWindowBounds() {
    if (typeof chrome === 'undefined' || !chrome.windows?.get) {
        window.alert('ใช้ได้ใน extension เท่านั้น');
        return;
    }
    const st = await storageGet([K_WIN]);
    if (st[K_WIN] == null) {
        window.alert('ยังไม่มีหน้าต่างโน้ต — กด \"หน้าต่างโน้ต\" ก่อน จัดขนาด แล้วค่อยกดล็อก');
        return;
    }
    try {
        const win = await chrome.windows.get(st[K_WIN]);
        await storageSet({
            [K_BOUNDS]: {
                locked: true,
                left: win.left,
                top: win.top,
                width: win.width,
                height: win.height,
            },
        });
    } catch {
        window.alert('ไม่พบหน้าต่างโน้ต');
        await storageRemove([K_WIN, K_TAB]);
    }
}

export async function unlockDetachedNoteWindowBounds() {
    await storageSet({ [K_BOUNDS]: { locked: false } });
}

export async function minimizeDetachedNoteWindow() {
    if (typeof chrome === 'undefined' || !chrome.windows?.update) return;
    const st = await storageGet([K_WIN]);
    if (st[K_WIN] == null) return;
    try {
        await chrome.windows.update(st[K_WIN], { state: 'minimized' });
    } catch {
        /* ignore */
    }
}

export async function closeDetachedNoteWindow() {
    if (typeof chrome === 'undefined' || !chrome.windows?.remove) return;
    const st = await storageGet([K_WIN]);
    if (st[K_WIN] == null) return;
    try {
        await chrome.windows.remove(st[K_WIN]);
    } catch {
        /* ignore */
    }
    await storageRemove([K_WIN, K_TAB]);
}
