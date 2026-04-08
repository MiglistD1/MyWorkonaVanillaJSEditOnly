// core/driveSync.js
import {
    getSpaces, getAppSettings, getCurrentSpaceId, getGlobalLaunchers, getLauncherTags,
    setSpaces, setAppSettings, setCurrentSpaceId, setGlobalLaunchers, setLauncherTags,
    saveData
} from './storage.js';

// 🔴 [PLACE YOUR NEW CLIENT ID HERE]
const CLIENT_ID = '586837492075-e2cf86u76n2c9dil0equ98trbraqnngh.apps.googleusercontent.com';

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events';
const FILE_NAME = 'myworkona_todos.json';
const REDIRECT_URI = location.href.split('#')[0].split('?')[0];
console.log("👉 ก๊อปปี้ URL นี้ไปใส่ใน Google Cloud Console (Authorized redirect URIs):", REDIRECT_URI);

/** ⏱️ จัดรูปแบบเวลาสำหรับ Log (เช่น 14:30 (5/4)) */
function formatLogTime(ts) {
    if (!ts) return "Never";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " (" + d.getDate() + "/" + (d.getMonth() + 1) + ")";
}

let accessToken = localStorage.getItem('google_access_token');
import { svgGoogleDrive, svgCloudOff, svgRefresh, svgSpinner, svgCloudUp, svgCloudDown, svgEdit } from './icons.js';

/**
 * 🎨 อัปเดต UI ของปุ่ม Drive Sync ให้แสดงสถานะการทำงาน
 */
export function renderDriveSyncUI(text = null, isLoading = false) {
    const btnMain = document.getElementById('btn-drive-sync');
    if (!btnMain) return;
    
    // สร้าง Wrapper เพื่อใส่ Dropdown ถ้ายังไม่มี
    let wrapper = btnMain.parentElement.closest('.drive-sync-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'drive-sync-wrapper';
        wrapper.style.position = 'relative';
        const driveSyncContainer = document.getElementById('drive-sync-container');
        if (driveSyncContainer) driveSyncContainer.appendChild(wrapper);
        wrapper.appendChild(btnMain);
    }

    // สร้าง Dropdown Menu
    let menu = wrapper.querySelector('.drive-sync-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.className = 'drive-sync-menu dropdown-menu';
        menu.style.cssText = `display:none; position:absolute; top:115%; right:0; width:140px; padding:4px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,0.12); z-index:1000; flex-direction:column; gap:1px;`;
        wrapper.appendChild(menu);
    }

    if (isLoading) {
        btnMain.innerHTML = `${svgSpinner}`;
        btnMain.disabled = true;
    } else {
        const isMobile = window.innerWidth <= 768;
        btnMain.disabled = false;
        if (!isMobile) {
            btnMain.style.padding = '4px 8px';
            btnMain.style.borderRadius = '20px';
            btnMain.style.height = '30px';
            btnMain.style.minWidth = 'auto';
        }
        
        if (accessToken) {
            btnMain.innerHTML = `${svgGoogleDrive} <span style="font-size:10px; font-weight:800; margin-left:4px;">Connected</span>`;
            btnMain.style.background = 'rgba(52, 168, 83, 0.1)';
            btnMain.style.color = '#34a853';
            btnMain.style.border = '1px solid #34a853';
        } else {
            btnMain.innerHTML = `${svgCloudOff}`;
            btnMain.style.background = 'var(--bg-body)';
            btnMain.style.color = 'var(--text-muted)';
            btnMain.style.border = '1px solid var(--border-color)';
        }

        const settings = getAppSettings();
        const lastUp = formatLogTime(settings.lastDriveUpload);
        const lastDown = formatLogTime(settings.lastDriveDownload);

        // ใส่เนื้อหาใน Menu
        menu.innerHTML = `
            <div style="padding: 4px 8px; font-size: 9px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Connection</div>
            <button class="menu-item" id="ds-btn-auth" style="display:flex; align-items:center; gap:8px; padding:6px 8px; border:none; background:transparent; cursor:pointer; font-size:11px; font-weight:600; color:var(--text-main); border-radius:6px; width:100%;">
                ${accessToken ? '🟢 Connected' : '⚪ Connect Drive'}
            </button>
            <div style="height:1px; background:var(--border-color); opacity: 0.5; margin: 3px 4px;"></div>
            <div style="padding: 4px 8px; font-size: 9px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Sync Actions</div>
            <button class="menu-item" id="ds-btn-upload" style="display:flex; align-items:center; gap:8px; padding:6px 8px; border:none; background:transparent; cursor:pointer; font-size:11px; color:var(--text-main); border-radius:6px; width:100%;">
                ${svgCloudUp} Overwrite (Up)
            </button>
            <button class="menu-item" id="ds-btn-download" style="display:flex; align-items:center; gap:8px; padding:6px 8px; border:none; background:transparent; cursor:pointer; font-size:11px; color:var(--text-main); border-radius:6px; width:100%;">
                ${svgCloudDown} Import (Down)
            </button>
            <div style="height:1px; background:var(--border-color); opacity: 0.5; margin: 3px 4px;"></div>
            <button class="menu-item" id="ds-btn-settings" style="display:flex; align-items:center; gap:8px; padding:6px 8px; border:none; background:transparent; cursor:pointer; font-size:11px; color:var(--text-muted); border-radius:6px; width:100%;">
                <svg class="svg-icon-xs" style="width:13px;height:13px;opacity:0.6;"><use href="#icon-settings"></use></svg> Path Settings
            </button>
            <div style="height:1px; background:var(--border-color); opacity: 0.5; margin: 3px 4px;"></div>
            <div style="padding: 4px 8px; font-size: 9px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Sync History</div>
            <div style="padding: 2px 8px; font-size: 10px; color: var(--text-muted); line-height: 1.4;">
                Uploaded: ${lastUp}<br>
                Imported: ${lastDown}
            </div>
        `;

        // Bind Events ใน Menu
        menu.querySelector('#ds-btn-auth').onclick = async () => {
            menu.style.display = 'none';
            if (!accessToken) {
                renderDriveSyncUI("Connecting...", true);
                const token = await getAuthToken(true);
                if (token) syncDataAfterLogin();
            }
        };
        menu.querySelector('#ds-btn-upload').onclick = () => { menu.style.display = 'none'; forceUploadToDrive(); };
        menu.querySelector('#ds-btn-download').onclick = () => { menu.style.display = 'none'; forceDownloadFromDrive(); };
        menu.querySelector('#ds-btn-settings').onclick = () => { menu.style.display = 'none'; showSyncPathSettings(); };

        // Toggle Menu
        btnMain.onclick = (e) => {
            e.stopPropagation();
            const isHidden = menu.style.display === 'none';
            // ปิด Dropdown อื่นๆ ก่อน
            document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
            menu.style.display = isHidden ? 'flex' : 'none';
        };
    }

    // ปิดเมนูเมื่อคลิกที่อื่น
    if (!window._driveSyncBound) {
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) menu.style.display = 'none';
        });
        window._driveSyncBound = true;
    }
}

/**
 * 📁 Sync Path Settings Modal
 */
function showSyncPathSettings() {
    const settings = getAppSettings();
    const folder = settings.driveSyncFolderName || 'MyWorkona_Backups';
    const file = settings.driveSyncFileName || 'myworkona_todos.json';

    const modalId = 'ds-path-settings-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    const html = `
        <div class="modal-overlay" id="${modalId}" style="display:flex; z-index:11000; background:rgba(0,0,0,0.2);">
            <div class="modal-content" style="width:280px; padding:20px; border-radius:12px;">
                <h3 style="margin-top:0; font-size:15px; font-weight:800;">📁 Drive Sync Settings</h3>
                <div class="settings-group" style="margin-top:15px;">
                    <label style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">Folder Name</label>
                    <input type="text" id="ds-folder-input" class="settings-input" value="${folder}" placeholder="Root if empty" style="font-size:13px; margin-top:4px;">
                </div>
                <div class="settings-group" style="margin-top:12px;">
                    <label style="font-size:10px; font-weight:800; color:var(--text-muted); text-transform:uppercase;">JSON Filename</label>
                    <input type="text" id="ds-file-input" class="settings-input" value="${file}" style="font-size:13px; margin-top:4px;">
                </div>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
                    <button class="btn btn-outline" id="ds-btn-cancel-path" style="font-size:11px; padding:4px 12px;">Cancel</button>
                    <button class="btn btn-primary" id="ds-btn-save-path" style="font-size:11px; padding:4px 12px;">Save Changes</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('ds-btn-cancel-path').onclick = () => document.getElementById(modalId).remove();

    document.getElementById('ds-btn-save-path').onclick = () => {
        settings.driveSyncFolderName = document.getElementById('ds-folder-input').value.trim();
        settings.driveSyncFileName = document.getElementById('ds-file-input').value.trim() || 'myworkona_todos.json';
        saveData(true);
        document.getElementById(modalId).remove();
    };
}

/**
 * Hybrid Auth: Supports chrome.identity (Extension) or Manual Redirect (Web)
 */
async function getAuthToken(interactive = true) {
    // 1. Check for Chrome Extension Identity API
    if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getAuthToken) {
        return new Promise((resolve) => {
            // ปล่อยให้ Chrome Identity จัดการ Cache และ Refresh Token เองเพื่อป้องกัน Token หมดอายุ
            chrome.identity.getAuthToken({ interactive }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    resolve(null);
                } else {
                    accessToken = token;
                    localStorage.setItem('google_access_token', token);
                    resolve(token);
                }
            });
        });
    }

    if (accessToken) return accessToken;

    // 2. Check for Token in URL Hash (Web Redirect Callback)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const tokenFromHash = hashParams.get('access_token');
    if (tokenFromHash) {
        accessToken = tokenFromHash;
        localStorage.setItem('google_access_token', tokenFromHash);
        window.history.replaceState(null, null, window.location.pathname); // Clean URL
        return accessToken;
    }

    // 3. Trigger Web Redirect if interactive
    if (interactive) {
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(SCOPES)}&prompt=select_account`;
        window.location.href = authUrl;
    }

    return null;
}

/** 🗑️ ล้าง Token ออกจากระบบและ Storage */
export async function clearAuthToken(tokenToClear) {
    accessToken = null;
    localStorage.removeItem('google_access_token');
    if (typeof chrome !== 'undefined' && chrome.identity) {
        return new Promise(resolve => chrome.identity.removeCachedAuthToken({ token: tokenToClear }, resolve));
    }
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
            await clearAuthToken(accessToken || token);

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
 * ⬆️ บังคับอัปโหลดข้อมูลปัจจุบันจาก Local ไปยัง Google Drive ทันที
 */
export async function forceUploadToDrive() {
    if (!confirm("⚠️ บังคับอัปโหลด (Force Upload) ขึ้น Google Drive\n\nการดำเนินการนี้จะส่งข้อมูลจากเครื่องนี้ไป \"เขียนทับ\" ข้อมูลสำรองเดิมบน Google Drive\n\nคุณต้องการดำเนินการต่อหรือไม่?")) return;

    renderDriveSyncUI("Uploading...", true);
    try {
        const localData = {
            mySpacesData: getSpaces(),
            appSettings: getAppSettings(),
            lastSpaceId: getCurrentSpaceId(),
            globalLaunchers: getGlobalLaunchers(),
            launcherTags: getLauncherTags()
        };
        const success = await saveToDrive(localData);
        if (success) {
            alert("✅ ข้อมูลถูกอัปโหลดขึ้น Google Drive เรียบร้อยแล้ว!");
            // อัปเดต timestamp ใน local เพื่อให้ตรงกับที่เพิ่งอัปโหลด
            getAppSettings().lastUpdated = Date.now();
            getAppSettings().lastDriveUpload = Date.now();
            saveData(true); // บันทึก timestamp ที่แก้ไข
        } else {
            alert("❌ อัปโหลดล้มเหลว! โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ตและสิทธิ์การเข้าถึง Google Drive");
        }
    } catch (e) {
        console.error("Force upload failed:", e);
        alert("❌ เกิดข้อผิดพลาดในการอัปโหลด! โปรดตรวจสอบ Console");
    } finally {
        renderDriveSyncUI();
    }
}

/**
 * ⬇️ บังคับดาวน์โหลดข้อมูลจาก Google Drive มาทับข้อมูล Local ทันที
 */
export async function forceDownloadFromDrive() {
    if (!confirm("⚠️ บังคับดาวน์โหลด (Force Download) จาก Google Drive\n\nการดำเนินการนี้จะนำข้อมูลจาก Google Drive มา \"เขียนทับ\" ข้อมูลทั้งหมดในเครื่องปัจจุบันนี้\n\nคุณต้องการดำเนินการต่อหรือไม่?")) return;

    renderDriveSyncUI("Downloading...", true);
    try {
        const driveData = await loadFromDrive();
        if (driveData) {
            applyDriveData(driveData);
            // applyDriveData จะ reload หน้าเอง
        } else {
            alert("❌ ไม่พบข้อมูลบน Google Drive หรือการดาวน์โหลดล้มเหลว!");
        }
    } catch (e) {
        console.error("Force download failed:", e);
        alert("❌ เกิดข้อผิดพลาดในการดาวน์โหลด! โปรดตรวจสอบ Console");
    } finally {
        renderDriveSyncUI();
    }
}

/**
 * 📂 ค้นหาหรือสร้างโฟลเดอร์เป้าหมาย
 */
async function getOrCreateFolderId(folderName) {
    if (!folderName) return null;
    try {
        const query = encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const res = await driveApiFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, { method: 'GET' }, false);
        const data = await res.json();
        if (data.files && data.files.length > 0) return data.files[0].id;

        // สร้างใหม่หากไม่พบ (หมายเหตุ: สิทธิ์ drive.file จะมองเห็นเฉพาะโฟลเดอร์ที่แอปนี้สร้างขึ้น)
        const createRes = await driveApiFetch(`https://www.googleapis.com/drive/v3/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' })
        }, false);
        const folder = await createRes.json();
        return folder.id;
    } catch (e) { return null; }
}

/**
 * Search for the specific backup file on Drive
 */
async function findFileId() {
    const token = await getAuthToken(false);
    if (!token) return null;

    const settings = getAppSettings();
    const fileName = settings.driveSyncFileName || FILE_NAME;
    const folderName = settings.driveSyncFolderName;

    try {
        let queryStr = `name = '${fileName}' and trashed = false`;
        
        // หากมีการระบุโฟลเดอร์ ให้ค้นหาภายใต้โฟลเดอร์นั้น
        if (folderName) {
            const folderId = await getOrCreateFolderId(folderName);
            if (folderId) queryStr += ` and '${folderId}' in parents`;
        }

        const response = await driveApiFetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryStr)}&fields=files(id)`, 
            { method: 'GET' }, 
            false
        );
        if (!response || !response.ok) return null;
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
        
        const settings = getAppSettings();
        const fileId = await findFileId();
        const fileName = settings.driveSyncFileName || FILE_NAME;
        const body = JSON.stringify(jsonData);

        if (fileId) {
            const response = await driveApiFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: body
            });
            return response.ok;
        } else {
            const folderId = await getOrCreateFolderId(settings.driveSyncFolderName);
            const metadata = { name: fileName, mimeType: 'application/json' };
            if (folderId) metadata.parents = [folderId];

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

/**
 * 🔄 ตรวจสอบข้อมูลบน Cloud แบบเงียบๆ และแจ้งเตือนหากพบข้อมูลใหม่
 * ช่วยให้ข้อมูลระหว่าง มือถือ คอม และ Extension ตรงกันเสมอ
 */
export async function autoCheckCloudUpdate() {
    const token = await getAuthToken(false); // เช็คแบบเงียบๆ ไม่เด้งหน้า Login
    if (!token) return;

    const driveData = await loadFromDrive();
    if (driveData) {
        const cloudTime = driveData.appSettings?.lastUpdated || 0;
        const localTime = getAppSettings().lastUpdated || 0;

        if (cloudTime > localTime) {
            // ☁️ ข้อมูลบน Cloud ใหม่กว่า -> ถามเพื่อโหลดลงเครื่อง
            const cloudDate = new Date(cloudTime).toLocaleString();
            if (confirm(`☁️ Cloud Sync: พบข้อมูลเวอร์ชันใหม่กว่าบน Google Drive\n(เวลาที่บันทึกบน Cloud: ${cloudDate})\n\nคุณต้องการ "ดาวน์โหลด" ข้อมูลจาก Google Drive ลงมาทับข้อมูลในเครื่องนี้หรือไม่?\n\n⚠️ คำเตือน: ข้อมูลปัจจุบันในเครื่องนี้จะถูกลบและแทนที่ด้วยข้อมูลจาก Cloud ทั้งหมด`)) {
                applyDriveData(driveData);
            }
        } else if (localTime > cloudTime) {
            // 💻 ข้อมูลในเครื่อง (Extension) ใหม่กว่า -> อัปโหลดขึ้น Cloud ทันทีเพื่ออัปเดตไฟล์บน Drive
            console.log("☁️ Local data is newer. Syncing to Google Drive...");
            const localData = {
                mySpacesData: getSpaces(),
                appSettings: getAppSettings(),
                lastSpaceId: getCurrentSpaceId(),
                globalLaunchers: getGlobalLaunchers(),
                launcherTags: getLauncherTags()
            };
            const success = await saveToDrive(localData);
            if (success) {
                getAppSettings().lastDriveUpload = Date.now();
                saveData(true);
            }
        }
        renderDriveSyncUI();
    }
}

function applyDriveData(driveData) {
    if (driveData.mySpacesData) setSpaces(driveData.mySpacesData);
    if (driveData.appSettings) setAppSettings(driveData.appSettings);
    if (driveData.lastSpaceId !== undefined) setCurrentSpaceId(driveData.lastSpaceId);
    if (driveData.globalLaunchers) setGlobalLaunchers(driveData.globalLaunchers);
    if (driveData.launcherTags) setLauncherTags(driveData.launcherTags);

    getAppSettings().lastDriveDownload = Date.now();
    saveData(true);
    alert("Sync Complete! Reloading...");
    location.reload();
}

async function syncDataAfterLogin() {
    const driveData = await loadFromDrive();
    if (driveData) {
        if (confirm("☁️ ตรวจพบไฟล์สำรองข้อมูลบน Google Drive\nคุณต้องการ \"ดาวน์โหลด\" ข้อมูลจาก Cloud มาเขียนทับข้อมูลในเครื่องนี้หรือไม่?\n\n⚠️ ข้อมูลเดิมที่อยู่ในเครื่องนี้จะถูกแทนที่ด้วยข้อมูลจาก Google Drive ทั้งหมด")) {
            applyDriveData(driveData);
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
        if (success) {
            getAppSettings().lastDriveUpload = Date.now();
            saveData(true);
            alert("No cloud backup found. A new one has been created from your current data.");
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 🟢 เมื่อเปิดแอป ให้พยายามตรวจสอบข้อมูลจาก Cloud ทันที
    getAuthToken(false).then(token => {
        if (token) autoCheckCloudUpdate();
        renderDriveSyncUI();
    });
    // logic ย้ายไปอยู่ใน renderDriveSyncUI แล้ว
});

// 🌏 บันทึกฟังก์ชันไว้ที่ window เพื่อให้โมดูลอื่นเรียกใช้งานได้ง่าย (เช่น Todo Manager)
window.saveToDrive = saveToDrive;
window.getAuthToken = getAuthToken;

export { getAuthToken, findFileId, syncDataAfterLogin };