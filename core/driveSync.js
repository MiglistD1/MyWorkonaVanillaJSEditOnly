/**
 * 🗂️ driveSync.js — Local Vault Sync via File System Access API
 *
 * Architecture (Obsidian-style):
 *   User picks a local folder → app reads/writes JSON files directly on disk.
 *   GDrive Desktop (or any cloud sync tool) handles cloud sync transparently.
 *   No OAuth, no REST calls, no 403 errors.
 *
 * Vault structure inside chosen folder:
 *   📁 <picked-folder>/
 *     📄 index.json      — metadata (version, lastUpdated)
 *     📄 settings.json   — app settings
 *     📄 global.json     — globalLaunchers + launcherTags + lastSpaceId
 *     📁 spaces/
 *       📄 {spaceId}.json — one file per space
 *
 * Flow:
 *   1. User clicks "Pick Folder" → setupVault() → showDirectoryPicker() → store handle in IndexedDB
 *   2. saveData() in storage.js calls driveSaveHook → markDirty()
 *   3. Auto-timer calls pushToDrive() every N minutes if dirty
 *   4. Manual "Sync Now" → pushToDrive() immediately
 */

const IDB_DB_NAME    = 'myworkona-vault';
const IDB_STORE_NAME = 'vaultHandle';
const IDB_KEY        = 'handle';
const APP_VERSION    = '1.0';

// ── Internal State ────────────────────────────────────────────────────────────
let _dirHandle    = null;   // FileSystemDirectoryHandle (user-picked folder)
let _dirtyFlag    = false;  // true = local data not yet written to vault
let _autoSyncTimer = null;
let _lastSyncedAt  = 0;
let _isSyncing     = false;
let _hasConflict   = false;
let _syncHistory   = (() => { try { return JSON.parse(localStorage.getItem('drive-sync-history') ?? '[]'); } catch { return []; } })();

// ── IndexedDB helpers (persist FileSystemDirectoryHandle) ──────────────────────

function _openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_DB_NAME, 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE_NAME);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

async function _saveHandleToIDB(handle) {
    const db = await _openIDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        tx.objectStore(IDB_STORE_NAME).put(handle, IDB_KEY);
        tx.oncomplete = resolve;
        tx.onerror    = e => reject(e.target.error);
    });
}

async function _loadHandleFromIDB() {
    try {
        const db = await _openIDB();
        return new Promise((resolve, reject) => {
            const tx  = db.transaction(IDB_STORE_NAME, 'readonly');
            const req = tx.objectStore(IDB_STORE_NAME).get(IDB_KEY);
            req.onsuccess = e => resolve(e.target.result ?? null);
            req.onerror   = e => reject(e.target.error);
        });
    } catch {
        return null;
    }
}

/** No-op: kept for API compatibility */
export function setWebToken() {}

// ── File System API helpers ─────────────────────────────────────────────────────

async function _writeJSON(dirHandle, filename, data) {
    const fh = await dirHandle.getFileHandle(filename, { create: true });
    const ws = await fh.createWritable();
    await ws.write(JSON.stringify(data, null, 2));
    await ws.close();
}

async function _readJSON(dirHandle, filename) {
    try {
        const fh   = await dirHandle.getFileHandle(filename);
        const file = await fh.getFile();
        return JSON.parse(await file.text());
    } catch {
        return null;
    }
}

async function _getOrCreateSubdir(dirHandle, name) {
    return dirHandle.getDirectoryHandle(name, { create: true });
}

// ── Permission Helper ─────────────────────────────────────────────────────────

/**
 * Ensure readwrite permission. If expired + user gesture → requestPermission().
 * If expired + no gesture → show badge/banner and return false (no crash).
 */
async function _ensurePermission(fromUserGesture = false) {
    if (!_dirHandle) return false;
    const perm = await _dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    if (fromUserGesture) {
        try {
            const newPerm = await _dirHandle.requestPermission({ mode: 'readwrite' });
            if (newPerm === 'granted') {
                _updatePermBanner(false);
                return true;
            }
        } catch { /* user dismissed dialog */ }
        _setBadge('⚠ Permission denied — pick folder again?', '#ef4444');
        return false;
    }
    // No user gesture — cannot show browser dialog, just warn
    _setBadge('🔒 Tap Sync to re-allow', '#f59e0b');
    _updatePermBanner(true);
    return false;
}

// ── Sync History Helper ───────────────────────────────────────────────────────

function _logHistory(type, status) {
    _syncHistory.unshift({ type, status, time: new Date().toISOString() });
    if (_syncHistory.length > 20) _syncHistory.length = 20;
    try { localStorage.setItem('drive-sync-history', JSON.stringify(_syncHistory)); } catch {}
}

// ── Popup UI Helpers ──────────────────────────────────────────────────────────

function _updatePermBanner(show) {
    const banner = document.getElementById('drive-permission-banner');
    if (banner) banner.style.display = show ? 'flex' : 'none';
}

function _updateConflictBanner(show, vaultTime = null) {
    const banner = document.getElementById('drive-conflict-banner');
    if (!banner) return;
    banner.style.display = show ? 'flex' : 'none';
    if (show && vaultTime) {
        const el = banner.querySelector('#drive-conflict-vault-time');
        if (el) el.textContent = new Date(vaultTime).toLocaleString();
    }
}

function _updatePopupFolderName(name) {
    const el = document.getElementById('drive-popup-folder-name');
    if (el) el.textContent = name ?? 'Not selected';
}

// ── Badge + Label UI ──────────────────────────────────────────────────────────

function _setBadge(text, color = '') {
    const badge = document.getElementById('drive-sync-badge');
    if (!badge) return;
    badge.textContent = text;
    badge.style.color = color;
}

function _setBtnState(state) {
    const btn = document.getElementById('btn-drive-sync-now-topbar');
    const dot = document.getElementById('drive-topbar-dot');
    if (!btn) return;
    btn.classList.remove('vs-syncing', 'vs-success', 'vs-error');
    if (dot) dot.classList.remove('vs-syncing', 'vs-success');
    if (state === 'syncing') {
        btn.classList.add('vs-syncing');
        if (dot) dot.classList.add('vs-syncing');
    } else if (state === 'success') {
        btn.classList.add('vs-success');
        if (dot) dot.classList.add('vs-success');
        setTimeout(() => { btn.classList.remove('vs-success'); if (dot) dot.classList.remove('vs-success'); }, 900);
    } else if (state === 'error') {
        btn.classList.add('vs-error');
        setTimeout(() => btn.classList.remove('vs-error'), 600);
    }
}

function _updateFolderLabel(name) {
    const el = document.getElementById('drive-vault-folder-name');
    if (el) el.textContent = name ?? 'Not selected';
}

// ── Vault Setup ───────────────────────────────────────────────────────────────

/**
 * Open folder picker, store handle in IndexedDB.
 * Returns the FileSystemDirectoryHandle, or undefined if cancelled.
 */
export async function setupVault() {
    // Only allow folder picking when in desktop device mode.
    const mode = localStorage.getItem('drive-device-mode') || ('showDirectoryPicker' in window ? 'desktop' : 'mobile');
    if (mode !== 'desktop') {
        if (typeof window.showToast === 'function') window.showToast('Local vault pick is Desktop-only. Switch to Desktop mode to pick a folder.');
        return;
    }
    if (!('showDirectoryPicker' in window)) {
        alert('Your browser does not support the File System Access API.\nPlease use Chrome 86+ or Edge 86+.');
        return;
    }
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'myworkona-vault' });
        _dirHandle = handle;
        await _saveHandleToIDB(handle);
        _setBadge(`📁 ${handle.name}`, '#10b981');
        _updateFolderLabel(handle.name);
        console.log('[DriveSync] Vault folder set:', handle.name);
        return handle;
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('[DriveSync] setupVault error:', err);
            _setBadge('⚠ Pick folder failed', '#ef4444');
        }
    }
}

// ── Push ──────────────────────────────────────────────────────────────────────

/**
 * Write all data to the vault folder (per-space files + index/settings/global).
 * @param {Object} data — { mySpacesData, lastSpaceId, appSettings, globalLaunchers, launcherTags }
 * @param {Object} opts — { fromUserGesture: boolean } — set true on manual button click
 */
export async function pushToDrive(data, { fromUserGesture = false } = {}) {
    if (!_dirHandle) { return false; }
    if (_isSyncing) return false;

    // ── Permission check (must happen before _isSyncing lock) ─────────────────
    if (!(await _ensurePermission(fromUserGesture))) {
        _setBtnState('error');
        return false;
    }

    _isSyncing = true;
    _setBtnState('syncing');
    _setBadge('Saving…', '#3b82f6');
    try {
        await _writeJSON(_dirHandle, 'index.json', { version: APP_VERSION, lastUpdated: new Date().toISOString() });
        if (data.appSettings) {
            await _writeJSON(_dirHandle, 'settings.json', { appSettings: data.appSettings });
        }
        await _writeJSON(_dirHandle, 'global.json', {
            lastSpaceId:     data.lastSpaceId,
            globalLaunchers: data.globalLaunchers ?? [],
            launcherTags:    data.launcherTags    ?? [],
        });
        const spacesDir = await _getOrCreateSubdir(_dirHandle, 'spaces');
        for (const space of (data.mySpacesData ?? [])) {
            if (space?.id) await _writeJSON(spacesDir, `${space.id}.json`, space);
        }
        _dirtyFlag    = false;
        _lastSyncedAt = Date.now();
        _setBtnState('success');
        _setBadge(`✓ Saved ${new Date(_lastSyncedAt).toLocaleTimeString()}`, '#10b981');
        _updatePermBanner(false);
        _logHistory('push', 'success');
        return true;
    } catch (err) {
        console.error('[DriveSync] Push error:', err);
        _setBtnState('error');
        _setBadge('⚠ Save failed', '#ef4444');
        _logHistory('push', 'error');
        return false;
    } finally {
        _isSyncing = false;
    }
}

/**
 * Force-write all data to vault (same as pushToDrive but bypasses dirty flag).
 * Use for Force Push button — always writes regardless of dirty state.
 */
export async function forcePush(data, { fromUserGesture = true } = {}) {
    if (!_dirHandle) { return false; }
    if (_isSyncing) return false;

    if (!(await _ensurePermission(fromUserGesture))) {
        _setBtnState('error');
        return false;
    }

    _isSyncing = true;
    _setBtnState('syncing');
    _setBadge('Force saving…', '#3b82f6');
    try {
        await _writeJSON(_dirHandle, 'index.json', { version: APP_VERSION, lastUpdated: new Date().toISOString() });
        if (data.appSettings) {
            await _writeJSON(_dirHandle, 'settings.json', { appSettings: data.appSettings });
        }
        await _writeJSON(_dirHandle, 'global.json', {
            lastSpaceId:     data.lastSpaceId,
            globalLaunchers: data.globalLaunchers ?? [],
            launcherTags:    data.launcherTags    ?? [],
        });
        const spacesDir = await _getOrCreateSubdir(_dirHandle, 'spaces');
        for (const space of (data.mySpacesData ?? [])) {
            if (space?.id) await _writeJSON(spacesDir, `${space.id}.json`, space);
        }
        _dirtyFlag    = false;
        _hasConflict  = false;
        _lastSyncedAt = Date.now();
        _setBtnState('success');
        _setBadge(`✓ Force saved ${new Date(_lastSyncedAt).toLocaleTimeString()}`, '#10b981');
        _updatePermBanner(false);
        _updateConflictBanner(false);
        _logHistory('forcePush', 'success');
        return true;
    } catch (err) {
        console.error('[DriveSync] Force Push error:', err);
        _setBtnState('error');
        _setBadge('⚠ Force Push failed', '#ef4444');
        _logHistory('forcePush', 'error');
        return false;
    } finally {
        _isSyncing = false;
    }
}

// ── Pull ──────────────────────────────────────────────────────────────────────

/**
 * Read all data from vault folder.
 * @param {Object} opts — { fromUserGesture: boolean }
 * @returns {Object|null} data in storage.js shape, or null on error
 *   Side-effect: sets _hasConflict = true if vault is newer than last push.
 */
export async function pullFromDrive({ fromUserGesture = false } = {}) {
    if (!_dirHandle) { console.warn('[DriveSync] No vault folder set.'); return null; }

    if (!(await _ensurePermission(fromUserGesture))) {
        return null;
    }

    _setBadge('Loading…', '#3b82f6');
    try {
        const index_   = await _readJSON(_dirHandle, 'index.json')    ?? {};
        const settings = await _readJSON(_dirHandle, 'settings.json') ?? {};
        const global_  = await _readJSON(_dirHandle, 'global.json')   ?? {};
        // Read per-space files
        const spaces = [];
        try {
            const spacesDir = await _dirHandle.getDirectoryHandle('spaces');
            for await (const [name, fh] of spacesDir.entries()) {
                if (fh.kind === 'file' && name.endsWith('.json')) {
                    try {
                        const file  = await fh.getFile();
                        const space = JSON.parse(await file.text());
                        spaces.push(space);
                    } catch { /* skip corrupt file */ }
                }
            }
        } catch { /* spaces dir may not exist yet */ }
        const data = {
            mySpacesData:    spaces,
            lastSpaceId:     global_.lastSpaceId,
            appSettings:     settings.appSettings ?? {},
            globalLaunchers: global_.globalLaunchers ?? [],
            launcherTags:    global_.launcherTags    ?? [],
        };
        // ── Conflict detection ─────────────────────────────────────────────────
        const vaultTime = index_.lastUpdated ? new Date(index_.lastUpdated).getTime() : 0;
        if (_lastSyncedAt > 0 && vaultTime > _lastSyncedAt) {
            _hasConflict = true;
            _updateConflictBanner(true, index_.lastUpdated);
            console.warn('[DriveSync] Conflict: vault is newer than last push', index_.lastUpdated);
        } else {
            _hasConflict = false;
            _updateConflictBanner(false);
        }
        _setBadge(`✓ Loaded ${new Date().toLocaleTimeString()}`, '#10b981');
        _updatePermBanner(false);
        _logHistory('pull', 'success');
        console.log('[DriveSync] Pull complete, spaces:', spaces.length);
        return data;
    } catch (err) {
        console.error('[DriveSync] Pull error:', err);
        _setBadge('⚠ Load failed', '#ef4444');
        _logHistory('pull', 'error');
        return null;
    }
}

// ── Dirty Flag ────────────────────────────────────────────────────────────────

/** Called by storage.js whenever local data changes */
export function markDirty() { _dirtyFlag = true; }
export { markDirty as driveDirty }; // alias for dashboard.js

export function isDirty()           { return _dirtyFlag; }
export function getLastSyncedAt()   { return _lastSyncedAt; }
export function getVaultFolderId()  { return _dirHandle?.name ?? null; }
export function getVaultFolderName(){ return _dirHandle?.name ?? null; }
export function getHasConflict()    { return _hasConflict; }
export function clearConflict()     { _hasConflict = false; _updateConflictBanner(false); }

/**
 * Lightweight access test — requests readwrite permission (requires user gesture).
 * Returns folder name on success, throws on failure.
 */
export async function verifyVaultAccess() {
    if (!_dirHandle) throw new Error('No vault folder selected. Pick a folder first.');
    const ok = await _ensurePermission(true);
    if (!ok) throw new Error('Permission denied for vault folder.');
    return _dirHandle.name;
}

export function getSyncHistory()    { return [..._syncHistory]; }
export function clearSyncHistory()  {
    _syncHistory = [];
    try { localStorage.removeItem('drive-sync-history'); } catch {}
}

// ── Auto Sync Timer ───────────────────────────────────────────────────────────

export function startAutoSync(intervalMinutes = 5) {
    stopAutoSync();
    const ms = intervalMinutes * 60 * 1000;
    _autoSyncTimer = setInterval(async () => {
        if (!_dirtyFlag || !_dirHandle) return;
        // Check permission before importing storage — no user gesture here,
        // so cannot request; just skip and badge if expired.
        const perm = await _dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
            _setBadge('🔒 Tap Sync to re-allow', '#f59e0b');
            _updatePermBanner(true);
            return;
        }
        const {
            getSpaces, getAppSettings, getGlobalLaunchers,
            getLauncherTags, getCurrentSpaceId
        } = await import('./storage.js');
        // permission already confirmed above, fromUserGesture irrelevant
        await pushToDrive({
            mySpacesData:    getSpaces(),
            lastSpaceId:     getCurrentSpaceId(),
            appSettings:     getAppSettings(),
            globalLaunchers: getGlobalLaunchers(),
            launcherTags:    getLauncherTags()
        }, { fromUserGesture: true }); // perm already verified, safe to pass true
    }, ms);
    console.log(`[DriveSync] Auto-sync every ${intervalMinutes} min`);
}

export function stopAutoSync() {
    if (_autoSyncTimer) { clearInterval(_autoSyncTimer); _autoSyncTimer = null; }
}

// ── Initialise ────────────────────────────────────────────────────────────────

/**
 * Call on app startup. Loads cached vault handle and restores connection (realtime mode).
 */
export async function initDriveSync() {
    try {
        const handle = await _loadHandleFromIDB();
        if (!handle) { console.log('[DriveSync] No vault handle stored yet.'); return; }
        // Stay Active: if expiry timestamp is in the future, use requestPermission()
        // so the user doesn't need to manually click Sync after refresh.
        const stayExpiry  = parseInt(localStorage.getItem('drive-stay-active-expiry') ?? '0', 10);
        const stayActive  = stayExpiry > Date.now();
        const perm = stayActive
            ? await handle.requestPermission({ mode: 'readwrite' })
            : await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
            _dirHandle = handle;
            _updateFolderLabel(handle.name);
            _updatePopupFolderName(handle.name);
            _setBadge(`📁 ${handle.name}`, '#10b981');
            _setBtnState('success');
            _updatePermBanner(false);
            console.log('[DriveSync] Vault ready (realtime mode):', handle.name);
        } else if (perm === 'prompt') {
            _dirHandle = handle;
            _updateFolderLabel(handle.name);
            _updatePopupFolderName(handle.name);
            _setBadge(`📁 ${handle.name} (tap to re-allow)`, '#f59e0b');
            _updatePermBanner(true);
        }
    } catch (err) {
        console.error('[DriveSync] initDriveSync error:', err);
    }
}


