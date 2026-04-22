/**
 * driveSyncOAuth.js — Google Drive REST API Vault Sync (Mobile / non-desktop mode)
 *
 * ── Setup (one-time) ───────────────────────────────────────────────────────────
 *  1. Go to https://console.cloud.google.com/
 *  2. Create a project → enable "Google Drive API"
 *  3. APIs & Services → Credentials → Create → OAuth 2.0 Client ID → Web application
 *  4. Authorized JavaScript origins: add your domain (e.g. https://miglistd1.github.io)
 *  5. Copy the Client ID and paste it below
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const GDRIVE_CLIENT_ID = '586837492075-e2cf86u76n2c9dil0equ98trbraqnngh.apps.googleusercontent.com';

const GDRIVE_SCOPE      = 'https://www.googleapis.com/auth/drive';
const GDRIVE_API        = 'https://www.googleapis.com/drive/v3';
const GDRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME       = 'application/vnd.google-apps.folder';

const LS_TOKEN        = 'gdrive-oauth-token';
const LS_TOKEN_EXPIRY = 'gdrive-oauth-expiry';
const LS_FOLDER_ID    = 'gdrive-vault-folder-id';
const LS_FOLDER_NAME  = 'gdrive-vault-folder-name';
const LS_LAST_SYNC    = 'gdrive-last-sync-at';

let _token      = null;
let _folderId   = null;
let _folderName = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initGDriveOAuth() {
    console.log('[GDrive] 🔵 Initializing GDrive OAuth...');
    const saved  = localStorage.getItem(LS_TOKEN);
    const expiry = parseInt(localStorage.getItem(LS_TOKEN_EXPIRY) || '0', 10);
    const isValid = saved && expiry > Date.now();
    console.log('[GDrive] Saved token:', saved ? '✅ found' : '❌ not found', '| Expiry valid:', isValid ? '✅ yes' : '❌ no');
    if (isValid) _token = saved;
    _folderId   = localStorage.getItem(LS_FOLDER_ID)   || null;
    _folderName = localStorage.getItem(LS_FOLDER_NAME) || null;
    console.log('[GDrive] Folder:', _folderName || '(none selected)', '|', _folderId || '');
}

export function isGDriveConnected() {
    const expiry = parseInt(localStorage.getItem(LS_TOKEN_EXPIRY) || '0', 10);
    const connected = !!_token && expiry > Date.now();
    return connected;
}

export function getGDriveFolderName() { return _folderName; }
export function getGDriveFolderId()   { return _folderId; }
export function getGDriveLastSyncAt() { return parseInt(localStorage.getItem(LS_LAST_SYNC) || '0', 10); }

/**
 * Lightweight connection test — calls /about?fields=user.
 * Does NOT push or pull any data. Returns the user's display name.
 */
export async function verifyGDriveConnection() {
    const data = await _api('/about?fields=user');
    return data?.user?.displayName ?? 'Connected';
}

export function disconnectGDrive() {
    _token = null;
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_TOKEN_EXPIRY);
    // Intentionally keep folder selection so user doesn't re-pick after token refresh
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

function _loadGIS() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
        if (document.getElementById('gis-script')) { resolve(); return; }
        const s   = document.createElement('script');
        s.id      = 'gis-script';
        s.src     = 'https://accounts.google.com/gsi/client';
        s.onload  = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

export async function connectGDrive() {
    console.log('[GDrive] 🔵 connectGDrive called');
    if (!GDRIVE_CLIENT_ID) {
        console.error('[GDrive] ❌ CLIENT_ID is empty!');
        throw new Error('GDRIVE_CLIENT_ID not configured in core/driveSyncOAuth.js');
    }
    console.log('[GDrive] ✅ CLIENT_ID found:', GDRIVE_CLIENT_ID.substring(0, 30) + '...');
    
    try {
        console.log('[GDrive] 🔵 Loading GIS script...');
        await _loadGIS();
        console.log('[GDrive] ✅ GIS script loaded');
    } catch (err) {
        console.error('[GDrive] ❌ Failed to load GIS:', err);
        throw new Error('Failed to load Google Identity Services');
    }

    return new Promise((resolve, reject) => {
        console.log('[GDrive] 🔵 Checking window.google...');
        if (!window.google?.accounts?.oauth2) {
            console.error('[GDrive] ❌ window.google.accounts.oauth2 not available');
            reject(new Error('Google Identity Services not properly loaded'));
            return;
        }
        console.log('[GDrive] ✅ window.google.accounts.oauth2 available');

        try {
            console.log('[GDrive] 🔵 Initializing token client...');
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: GDRIVE_CLIENT_ID,
                scope:     GDRIVE_SCOPE,
                callback:  (resp) => {
                    console.log('[GDrive] 🔵 OAuth callback triggered');
                    console.log('[GDrive] Response keys:', Object.keys(resp));
                    if (resp.error) {
                        console.error('[GDrive] ❌ OAuth error:', resp.error, '|', resp.error_description);
                        reject(new Error(resp.error_description || resp.error));
                        return;
                    }
                    if (!resp.access_token) {
                        console.error('[GDrive] ❌ No access_token in response');
                        reject(new Error('No access token received'));
                        return;
                    }
                    _token = resp.access_token;
                    const expiry = Date.now() + (resp.expires_in * 1000) - 60_000;
                    localStorage.setItem(LS_TOKEN,        _token);
                    localStorage.setItem(LS_TOKEN_EXPIRY, String(expiry));
                    console.log('[GDrive] ✅ Token saved! Expires:', new Date(expiry).toLocaleString());
                    resolve(_token);
                },
            });
            console.log('[GDrive] ✅ Token client initialized');
            console.log('[GDrive] 🔵 Requesting access token (opening popup)...');
            client.requestAccessToken({ prompt: '' });
            
            // Detect if user cancelled or popup was blocked
            const timeoutId = setTimeout(() => {
                if (!_token) {
                    console.warn('[GDrive] ⚠️ Timeout: Popup may have been cancelled or blocked');
                    reject(new Error('OAuth popup cancelled or blocked. Check browser popup blocker.'));
                }
            }, 60_000);
        } catch (err) {
            console.error('[GDrive] ❌ Exception in connectGDrive:', err);
            reject(err);
        }
    });
}

async function _ensureToken() {
    const expiry = parseInt(localStorage.getItem(LS_TOKEN_EXPIRY) || '0', 10);
    if (_token && expiry > Date.now()) return _token;
    // Silent refresh — works if user already granted consent before
    try { await connectGDrive(); return _token; }
    catch { throw new Error('Google Drive session expired. Please reconnect.'); }
}

// ── API Helpers ───────────────────────────────────────────────────────────────

async function _deleteFile(fileId) {
    const token = await _ensureToken();
    const res = await fetch(`${GDRIVE_API}/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204 && res.status !== 404) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error?.message || `Drive API delete ${res.status}`);
    }
}

async function _api(path, opts = {}) {
    const token = await _ensureToken();
    const res = await fetch(`${GDRIVE_API}${path}`, {
        cache: 'no-store',
        ...opts,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type':  'application/json',
            ...(opts.headers || {}),
        },
    });
    if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error?.message || `Drive API ${res.status}`);
    }
    return res.json();
}

async function _upload(metadata, jsonBody, existingFileId = null) {
    const token    = await _ensureToken();
    const method   = existingFileId ? 'PATCH' : 'POST';
    const url      = existingFileId
        ? `${GDRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=multipart`
        : `${GDRIVE_UPLOAD_API}/files?uploadType=multipart`;
    const boundary = 'mybnd' + Date.now();
    const body = [
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonBody}\r\n`,
        `--${boundary}--`,
    ].join('');
    const res = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type':  `multipart/related; boundary=${boundary}`,
        },
        body,
    });
    if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error?.message || `Drive upload ${res.status}`);
    }
    return res.json();
}

async function _readFile(fileId) {
    const token = await _ensureToken();
    const res   = await fetch(`${GDRIVE_API}/files/${fileId}?alt=media`, {
        cache: 'no-store',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Drive read ${res.status}`);
    return res.json();
}

async function _findFile(name, parentId) {
    const q    = `name='${name}' and '${parentId}' in parents and trashed=false`;
    const data = await _api(`/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`);
    return data.files?.[0] ?? null;
}

// ── Folder Management ─────────────────────────────────────────────────────────

export async function listDriveFolders() {
    const q    = `mimeType='${FOLDER_MIME}' and trashed=false`;
    const data = await _api(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=50`);
    return data.files || [];
}

export async function searchFolderByName(name) {
    if (!name?.trim()) throw new Error('Folder name required');
    const q    = `mimeType='${FOLDER_MIME}' and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
    const data = await _api(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`);
    return data.files || [];
}

export async function searchFolderByLink(link) {
    if (!link?.trim()) throw new Error('Link required');
    let folderId = null;
    const patterns = [
        /\/folders\/([a-zA-Z0-9_-]+)/,
        /[?&]id=([a-zA-Z0-9_-]+)/,
        /\/d\/([a-zA-Z0-9_-]+)/,
    ];
    for (const p of patterns) {
        const m = link.match(p);
        if (m) { folderId = m[1]; break; }
    }
    if (!folderId) throw new Error('Could not extract folder ID from link');
    console.log('[GDrive] Folder ID from link:', folderId);
    try {
        const data = await _api(`/files/${folderId}?fields=id,name,mimeType`);
        if (data.mimeType !== FOLDER_MIME) throw new Error('Link does not point to a folder');
        return [data];
    } catch (err) {
        throw new Error('Folder not accessible or link invalid: ' + err.message);
    }
}

export function selectDriveFolder(id, name) {
    _folderId   = id;
    _folderName = name;
    localStorage.setItem(LS_FOLDER_ID,   id);
    localStorage.setItem(LS_FOLDER_NAME, name);
}

export async function createDriveFolder(name) {
    const res = await _api('/files', {
        method: 'POST',
        body:   JSON.stringify({ name, mimeType: FOLDER_MIME }),
    });
    selectDriveFolder(res.id, res.name);
    return res;
}

// ── Push ──────────────────────────────────────────────────────────────────────

export async function pushToGDrive(data) {
    if (!_folderId) throw new Error('No vault folder selected');

    const index = { version: '1.0', lastUpdated: Date.now() };
    const files  = {
        'index.json':    JSON.stringify(index),
        'settings.json': JSON.stringify(data.appSettings   || {}),
        'global.json':   JSON.stringify({
            globalLaunchers: data.globalLaunchers || [],
            launcherTags:    data.launcherTags    || [],
            lastSpaceId:     data.lastSpaceId,
        }),
    };
    for (const space of (data.mySpacesData || [])) {
        files[`space_${space.id}.json`] = JSON.stringify(space);
    }

    for (const [name, body] of Object.entries(files)) {
        const existing = await _findFile(name, _folderId);
        const metadata = existing ? {} : { name, parents: [_folderId] };
        await _upload(metadata, body, existing?.id);
    }

    // Delete stale space_*.json files in Drive that no longer exist locally
    const currentSpaceIds = new Set((data.mySpacesData || []).map(s => String(s.id)));
    const q    = `'${_folderId}' in parents and trashed=false`;
    const list = await _api(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=100`);
    for (const f of (list.files || [])) {
        if (f.name.startsWith('space_') && f.name.endsWith('.json')) {
            const spaceId = f.name.slice(6, -5);
            if (!currentSpaceIds.has(spaceId)) await _deleteFile(f.id);
        }
    }

    localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
    return true;
}

// ── Pull ──────────────────────────────────────────────────────────────────────

export async function pullFromGDrive() {
    if (!_folderId) throw new Error('No vault folder selected');

    const q    = `'${_folderId}' in parents and trashed=false`;
    const list = await _api(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=100`);
    const files = list.files || [];

    if (files.length === 0) {
        throw new Error('No files found in Drive folder — folder may be empty or not yet synced');
    }

    const result = {
        appSettings:    {},
        globalLaunchers: [],
        launcherTags:   [],
        lastSpaceId:    null,
        mySpacesData:   [],
    };

    for (const f of files) {
        try {
            if (f.name === 'settings.json') {
                result.appSettings = await _readFile(f.id);
            } else if (f.name === 'global.json') {
                const g = await _readFile(f.id);
                result.globalLaunchers = g.globalLaunchers || [];
                result.launcherTags    = g.launcherTags    || [];
                result.lastSpaceId     = g.lastSpaceId     ?? null;
            } else if (f.name.startsWith('space_') && f.name.endsWith('.json')) {
                const space = await _readFile(f.id);
                if (space) result.mySpacesData.push(space);
            }
        } catch (e) {
            console.warn(`[GDrive] Skipping unreadable file "${f.name}" (${f.id}):`, e.message);
        }
    }

    localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
    return result;
}
