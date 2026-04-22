export const GDRIVE_CLIENT_ID = '586837492075-e2cf86u76n2c9dil0equ98trbraqnngh.apps.googleusercontent.com';

const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const GDRIVE_API = 'https://www.googleapis.com/drive/v3';
const GDRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const APP_VERSION = '1.0';
const SPACES_DIR_NAME = 'spaces';

const LS_TOKEN = 'gdrive-oauth-token';
const LS_TOKEN_EXPIRY = 'gdrive-oauth-expiry';
const LS_FOLDER_ID = 'gdrive-vault-folder-id';
const LS_FOLDER_NAME = 'gdrive-vault-folder-name';
const LS_LAST_SYNC = 'gdrive-last-sync-at';

let _token = null;
let _folderId = null;
let _folderName = null;

export function initGDriveOAuth() {
    console.log('[GDrive] Initializing GDrive OAuth...');
    const saved = localStorage.getItem(LS_TOKEN);
    const expiry = parseInt(localStorage.getItem(LS_TOKEN_EXPIRY) || '0', 10);
    const isValid = saved && expiry > Date.now();
    if (isValid) _token = saved;
    _folderId = localStorage.getItem(LS_FOLDER_ID) || null;
    _folderName = localStorage.getItem(LS_FOLDER_NAME) || null;
    console.log('[GDrive] Folder:', _folderName || '(none selected)', '|', _folderId || '');
}

export function isGDriveConnected() {
    const expiry = parseInt(localStorage.getItem(LS_TOKEN_EXPIRY) || '0', 10);
    return !!_token && expiry > Date.now();
}

export function getGDriveFolderName() { return _folderName; }
export function getGDriveFolderId() { return _folderId; }
export function getGDriveLastSyncAt() { return parseInt(localStorage.getItem(LS_LAST_SYNC) || '0', 10); }

export async function verifyGDriveConnection() {
    const data = await _api('/about?fields=user');
    return data?.user?.displayName ?? 'Connected';
}

export function disconnectGDrive() {
    _token = null;
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_TOKEN_EXPIRY);
}

function _loadGIS() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
        if (document.getElementById('gis-script')) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.id = 'gis-script';
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

export async function connectGDrive() {
    if (!GDRIVE_CLIENT_ID) {
        throw new Error('GDRIVE_CLIENT_ID not configured in core/driveSyncOAuth.js');
    }

    await _loadGIS().catch(() => {
        throw new Error('Failed to load Google Identity Services');
    });

    return new Promise((resolve, reject) => {
        if (!window.google?.accounts?.oauth2) {
            reject(new Error('Google Identity Services not properly loaded'));
            return;
        }

        let settled = false;
        const finishReject = (error) => {
            if (settled) return;
            settled = true;
            reject(error);
        };
        const finishResolve = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        try {
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: GDRIVE_CLIENT_ID,
                scope: GDRIVE_SCOPE,
                callback: (resp) => {
                    if (resp.error) {
                        finishReject(new Error(resp.error_description || resp.error));
                        return;
                    }
                    if (!resp.access_token) {
                        finishReject(new Error('No access token received'));
                        return;
                    }
                    _token = resp.access_token;
                    const expiry = Date.now() + (resp.expires_in * 1000) - 60_000;
                    localStorage.setItem(LS_TOKEN, _token);
                    localStorage.setItem(LS_TOKEN_EXPIRY, String(expiry));
                    finishResolve(_token);
                },
            });
            client.requestAccessToken({ prompt: '' });
            setTimeout(() => {
                if (!_token) {
                    finishReject(new Error('OAuth popup cancelled or blocked. Check browser popup blocker.'));
                }
            }, 60_000);
        } catch (err) {
            finishReject(err);
        }
    });
}

async function _ensureToken() {
    const expiry = parseInt(localStorage.getItem(LS_TOKEN_EXPIRY) || '0', 10);
    if (_token && expiry > Date.now()) return _token;
    try {
        await connectGDrive();
        return _token;
    } catch {
        throw new Error('Google Drive session expired. Please reconnect.');
    }
}

async function _api(path, opts = {}) {
    const token = await _ensureToken();
    const res = await fetch(`${GDRIVE_API}${path}`, {
        cache: 'no-store',
        ...opts,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(opts.headers || {}),
        },
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error?.message || `Drive API ${res.status}`);
    }
    return res.json();
}

async function _deleteFile(fileId) {
    const token = await _ensureToken();
    const res = await fetch(`${GDRIVE_API}/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204 && res.status !== 404) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error?.message || `Drive API delete ${res.status}`);
    }
}

async function _upload(metadata, jsonBody, existingFileId = null) {
    const token = await _ensureToken();
    const method = existingFileId ? 'PATCH' : 'POST';
    const url = existingFileId
        ? `${GDRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=multipart`
        : `${GDRIVE_UPLOAD_API}/files?uploadType=multipart`;
    const boundary = `myworkona-${Date.now()}`;
    const body = [
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonBody}\r\n`,
        `--${boundary}--`,
    ].join('');

    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error?.message || `Drive upload ${res.status}`);
    }
    return res.json();
}

async function _readFile(fileId) {
    const token = await _ensureToken();
    const res = await fetch(`${GDRIVE_API}/files/${fileId}?alt=media`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Drive read ${res.status}`);
    return res.json();
}

function _escapeDriveQueryValue(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function _sortNewestFirst(files = []) {
    return [...files].sort((a, b) => {
        const aTime = new Date(a.modifiedTime || a.createdTime || 0).getTime();
        const bTime = new Date(b.modifiedTime || b.createdTime || 0).getTime();
        return bTime - aTime;
    });
}

async function _listFiles(parentId, extraQuery = '', pageSize = 100) {
    const qParts = [`'${parentId}' in parents`, 'trashed=false'];
    if (extraQuery) qParts.push(extraQuery);
    const q = qParts.join(' and ');
    const data = await _api(
        `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,createdTime,parents)&orderBy=modifiedTime desc&pageSize=${pageSize}`
    );
    return data.files || [];
}

async function _findFilesByName(name, parentId, extraQuery = '') {
    const fileName = _escapeDriveQueryValue(name);
    const extra = [`name='${fileName}'`, extraQuery].filter(Boolean).join(' and ');
    return _listFiles(parentId, extra, 20);
}

async function _findLatestFile(name, parentId, extraQuery = '') {
    const files = await _findFilesByName(name, parentId, extraQuery);
    return _sortNewestFirst(files)[0] ?? null;
}

async function _ensureChildFolder(name, parentId) {
    const existing = await _findLatestFile(name, parentId, `mimeType='${FOLDER_MIME}'`);
    if (existing) return existing;
    return _api('/files', {
        method: 'POST',
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
}

async function _deleteAllExcept(files, keepId = null) {
    for (const file of files) {
        if (file?.id && file.id !== keepId) {
            await _deleteFile(file.id);
        }
    }
}

async function _upsertJsonFile(parentId, name, payload) {
    const existing = _sortNewestFirst(await _findFilesByName(name, parentId));
    const target = existing[0] ?? null;
    const metadata = target ? {} : { name, parents: [parentId] };
    const saved = await _upload(metadata, JSON.stringify(payload), target?.id);
    await _deleteAllExcept(existing.slice(1), saved?.id || target?.id || null);
    return saved;
}

export async function listDriveFolders() {
    const q = `mimeType='${FOLDER_MIME}' and trashed=false`;
    const data = await _api(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=50`);
    return data.files || [];
}

export async function searchFolderByName(name) {
    if (!name?.trim()) throw new Error('Folder name required');
    const q = `mimeType='${FOLDER_MIME}' and name='${_escapeDriveQueryValue(name)}' and trashed=false`;
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
    for (const pattern of patterns) {
        const match = link.match(pattern);
        if (match) {
            folderId = match[1];
            break;
        }
    }
    if (!folderId) throw new Error('Could not extract folder ID from link');

    try {
        const data = await _api(`/files/${folderId}?fields=id,name,mimeType`);
        if (data.mimeType !== FOLDER_MIME) throw new Error('Link does not point to a folder');
        return [data];
    } catch (err) {
        throw new Error(`Folder not accessible or link invalid: ${err.message}`);
    }
}

export function selectDriveFolder(id, name) {
    _folderId = id;
    _folderName = name;
    localStorage.setItem(LS_FOLDER_ID, id);
    localStorage.setItem(LS_FOLDER_NAME, name);
}

export async function createDriveFolder(name) {
    const res = await _api('/files', {
        method: 'POST',
        body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
    });
    selectDriveFolder(res.id, res.name);
    return res;
}

export async function pushToGDrive(data) {
    if (!_folderId) throw new Error('No vault folder selected');

    const spacesDir = await _ensureChildFolder(SPACES_DIR_NAME, _folderId);

    await _upsertJsonFile(_folderId, 'index.json', {
        version: APP_VERSION,
        lastUpdated: new Date().toISOString(),
    });
    await _upsertJsonFile(_folderId, 'settings.json', {
        appSettings: data.appSettings || {},
    });
    await _upsertJsonFile(_folderId, 'global.json', {
        globalLaunchers: data.globalLaunchers || [],
        launcherTags: data.launcherTags || [],
        lastSpaceId: data.lastSpaceId ?? null,
    });

    const currentSpaceIds = new Set();
    for (const space of (data.mySpacesData || [])) {
        if (!space?.id) continue;
        currentSpaceIds.add(String(space.id));
        await _upsertJsonFile(spacesDir.id, `${space.id}.json`, space);
    }

    const currentSpaceFiles = await _listFiles(spacesDir.id);
    for (const file of currentSpaceFiles) {
        if (!file.name.endsWith('.json')) continue;
        const spaceId = file.name.slice(0, -5);
        if (!currentSpaceIds.has(spaceId)) {
            await _deleteFile(file.id);
        }
    }

    const rootFiles = await _listFiles(_folderId);
    for (const file of rootFiles) {
        if (file.name.startsWith('space_') && file.name.endsWith('.json')) {
            await _deleteFile(file.id);
        }
    }

    localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
    return true;
}

export async function pullFromGDrive() {
    if (!_folderId) throw new Error('No vault folder selected');

    const rootFiles = await _listFiles(_folderId);
    if (rootFiles.length === 0) {
        throw new Error('No files found in Drive folder - folder may be empty or not yet synced');
    }

    const result = {
        appSettings: {},
        globalLaunchers: [],
        launcherTags: [],
        lastSpaceId: null,
        mySpacesData: [],
    };

    const latestRootByName = new Map();
    for (const file of _sortNewestFirst(rootFiles)) {
        if (!latestRootByName.has(file.name)) latestRootByName.set(file.name, file);
    }

    const settingsFile = latestRootByName.get('settings.json');
    if (settingsFile) {
        try {
            const settings = await _readFile(settingsFile.id);
            result.appSettings = settings?.appSettings ?? settings ?? {};
        } catch (err) {
            console.warn(`[GDrive] Skipping unreadable file "${settingsFile.name}" (${settingsFile.id}):`, err.message);
        }
    }

    const globalFile = latestRootByName.get('global.json');
    if (globalFile) {
        try {
            const globalData = await _readFile(globalFile.id);
            result.globalLaunchers = globalData?.globalLaunchers || [];
            result.launcherTags = globalData?.launcherTags || [];
            result.lastSpaceId = globalData?.lastSpaceId ?? null;
        } catch (err) {
            console.warn(`[GDrive] Skipping unreadable file "${globalFile.name}" (${globalFile.id}):`, err.message);
        }
    }

    const chosenSpaceFiles = new Map();
    const spacesFolders = rootFiles.filter((file) => file.mimeType === FOLDER_MIME && file.name === SPACES_DIR_NAME);
    for (const folder of _sortNewestFirst(spacesFolders)) {
        try {
            const childFiles = await _listFiles(folder.id);
            for (const child of _sortNewestFirst(childFiles)) {
                if (!child.name.endsWith('.json')) continue;
                if (!chosenSpaceFiles.has(child.name)) chosenSpaceFiles.set(child.name, child);
            }
        } catch (err) {
            console.warn(`[GDrive] Cannot read folder "${folder.name}" (${folder.id}):`, err.message);
        }
    }

    for (const file of _sortNewestFirst(rootFiles)) {
        if (!file.name.startsWith('space_') || !file.name.endsWith('.json')) continue;
        const normalizedName = file.name.slice(6);
        if (!chosenSpaceFiles.has(normalizedName)) chosenSpaceFiles.set(normalizedName, file);
    }

    for (const file of chosenSpaceFiles.values()) {
        try {
            const space = await _readFile(file.id);
            if (space) result.mySpacesData.push(space);
        } catch (err) {
            console.warn(`[GDrive] Skipping unreadable file "${file.name}" (${file.id}):`, err.message);
        }
    }

    if (
        result.mySpacesData.length === 0 &&
        !settingsFile &&
        !globalFile &&
        spacesFolders.length === 0
    ) {
        throw new Error('Drive folder does not contain a compatible vault structure yet');
    }

    localStorage.setItem(LS_LAST_SYNC, String(Date.now()));
    return result;
}
