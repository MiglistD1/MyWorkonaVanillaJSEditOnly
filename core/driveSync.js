// core/driveSync.js
import {
    getSpaces, getAppSettings, getCurrentSpaceId, getGlobalLaunchers, getLauncherTags,
    setSpaces, setAppSettings, setCurrentSpaceId, setGlobalLaunchers, setLauncherTags,
    saveData
} from './storage.js';

// 🔴 [วาง Client ID ตัวใหม่ของคุณที่นี่]
const CLIENT_ID = '586837492075-e2cf86u76n2c9dil0equ98trbraqnngh.apps.googleusercontent.com';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'myworkona_todos.json';
const REDIRECT_URI = window.location.origin + window.location.pathname;

let accessToken = null;

/**
 * Hybrid Auth: Supports chrome.identity (Extension) or Manual Redirect (Web)
 */
async function getAuthToken(interactive = true) {
    if (accessToken) return accessToken;

    // 1. Check for Chrome Extension Identity API
    if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getAuthToken) {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    resolve(null);
                } else {
                    accessToken = token;
                    resolve(token);
                }
            });
        });
    }

    // 2. Check for Token in URL Hash (Web Redirect Callback)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const tokenFromHash = hashParams.get('access_token');
    if (tokenFromHash) {
        accessToken = tokenFromHash;
        window.history.replaceState(null, null, window.location.pathname); // Clean URL
        return accessToken;
    }

    // 3. Trigger Web Redirect if interactive
    if (interactive) {
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(SCOPES)}&prompt=select_account%20consent`;
        window.location.href = authUrl;
    }

    return null;
}

/**
 * Wrapper for Drive API calls with Error Handling
 */
async function driveApiFetch(url, options = {}, interactive = false) {
    const token = await getAuthToken(interactive);
    if (!token) throw new Error("No Access Token");

    const headers = {
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 401 || response.status === 403) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`Authentication Error (${response.status}):`, errorData);
            
            // ล้าง Token ทั้งในตัวแปรและใน Cache ของ Chrome ทันทีที่เจอ 401/403
            const oldToken = accessToken || token;
            accessToken = null; 
            if (typeof chrome !== 'undefined' && chrome.identity) {
                await new Promise(resolve => chrome.identity.removeCachedAuthToken({ token: oldToken }, resolve));
            }

            if (response.status === 403) {
                alert("⚠️ สิทธิ์การเข้าถึงถูกปฏิเสธ (403):\n1. โปรดตรวจสอบว่าได้ติ๊กถูกที่ช่อง 'See, create, and delete its own configuration data' ในหน้าต่าง Google\n2. ตรวจสอบว่าเปิดใช้งาน 'Google Drive API' ใน Cloud Console แล้ว\n\nระบบจะล้างการล็อกอินเดิมเพื่อให้คุณกด Sync และเลือกสิทธิ์ใหม่อีกครั้ง");
            }
            
            throw new Error("Access Forbidden or Unauthorized");
        }

        return response;
    } catch (e) {
        console.error("Drive API Fetch Error:", e);
        throw e;
    }
}

/**
 * Search for the specific backup file on Drive
 */
async function findFileId() {
    const token = await getAuthToken(false);
    if (!token) return null;

    try {
        const query = encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`);
        // เรียก findFileId แบบ interactive = true เฉพาะเมื่อจำเป็นจริงๆ 
        // แต่ในที่นี้ใช้ false เพราะปกติถูกเรียกต่อจาก getAuthToken(true) ใน save/load อยู่แล้ว
        const response = await driveApiFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, { method: 'GET' }, false);
        if (!response.ok) return null;
        const result = await response.json();
        return result.files && result.files.length > 0 ? result.files[0].id : null;
    } catch (e) {
        return null; 
    }
}

/**
 * Save current app data to Google Drive
 */
export async function saveToDrive(jsonData) {
    try {
        const token = await getAuthToken(true);
        if (!token) return false;

        const fileId = await findFileId();
        const body = JSON.stringify(jsonData);

        if (fileId) {
            const response = await driveApiFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: body
            });
            return response.ok;
        } else {
            const metadata = { name: FILE_NAME, mimeType: 'application/json' };
            const boundary = '-------314159265358979323846';
            const delimiter = "\r\n--" + boundary + "\r\n";
            const close_delim = "\r\n--" + boundary + "--";

            const multipartBody = delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                body +
                close_delim;

            const response = await driveApiFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: multipartBody
            });
            return response.ok;
        }
    } catch (e) {
        console.error("saveToDrive Failed:", e);
        return false;
    }
}

/**
 * Fetch JSON content from Drive
 */
export async function loadFromDrive() {
    try {
        const token = await getAuthToken(true);
        if (!token) return null;

        const fileId = await findFileId();
        if (!fileId) return null;

        const response = await driveApiFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {}, false);
        return response.ok ? await response.json() : null;
    } catch (e) {
        console.error("loadFromDrive Failed:", e);
        return null;
    }
}

async function syncDataAfterLogin() {
    const driveData = await loadFromDrive();
    if (driveData) {
        if (confirm("Sync Found: Restore data from Google Drive? This will overwrite local data.")) {
            if (driveData.mySpacesData) setSpaces(driveData.mySpacesData);
            if (driveData.appSettings) setAppSettings(driveData.appSettings);
            if (driveData.lastSpaceId !== undefined) setCurrentSpaceId(driveData.lastSpaceId);
            if (driveData.globalLaunchers) setGlobalLaunchers(driveData.globalLaunchers);
            if (driveData.launcherTags) setLauncherTags(driveData.launcherTags);

            saveData(true);
            alert("Sync Complete! Reloading...");
            location.reload();
        }
    } else {
        const localData = {
            mySpacesData: getSpaces(),
            appSettings: getAppSettings(),
            lastSpaceId: getCurrentSpaceId(),
            globalLaunchers: getGlobalLaunchers(),
            launcherTags: getLauncherTags()
        };
        const success = await saveToDrive(localData);
        if (success) alert("No cloud backup found. A new one has been created from your current data.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Silent auth check on load
    getAuthToken(false).then(token => {
        if (token) console.log("Drive connected.");
    });

    const syncBtn = document.getElementById('btn-drive-sync');
    if (syncBtn) {
        syncBtn.onclick = async () => {
            const token = await getAuthToken(true);
            if (token) syncDataAfterLogin();
        }
    }
});

// 🌏 บันทึกฟังก์ชันไว้ที่ window เพื่อให้โมดูลอื่นเรียกใช้งานได้ง่าย (เช่น Todo Manager)
window.saveToDrive = saveToDrive;
window.getAuthToken = getAuthToken;

export { getAuthToken, findFileId, syncDataAfterLogin };