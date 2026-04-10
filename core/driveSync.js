// core/driveSync.js
import {
    getSpaces, getAppSettings, getCurrentSpaceId, getGlobalLaunchers, getLauncherTags,
    setSpaces, setAppSettings, setCurrentSpaceId, setGlobalLaunchers, setLauncherTags,
    saveData
} from './storage.js';
import { svgGoogleDrive, svgCloudOff, svgRefresh, svgSpinner, svgCloudUp, svgCloudDown, svgEdit } from './icons.js';

/**
 * 🎨 อัปเดต UI ของปุ่ม Drive Sync ให้แสดงสถานะการทำงาน
 */
export function renderDriveSyncUI(text = null, isLoading = false) {
    const btnMain = document.getElementById('btn-drive-sync');
    if (btnMain) {
        btnMain.innerHTML = `${svgCloudOff}`;
        btnMain.style.background = 'var(--bg-body)';
        btnMain.style.color = 'var(--text-muted)';
        btnMain.style.border = '1px solid var(--border-color)';
        btnMain.title = "Google Drive Sync (Disabled)";
        btnMain.onclick = () => alert("Google Drive sync is disabled in this version.");
    }
}

/**
 * 📁 Sync Path Settings Modal
 */
function showSyncPathSettings() {
    // This function is no longer needed as Drive Sync is removed.
    // Keeping it as a placeholder if any other part of the code still calls it.
    console.log("Drive sync settings are not available.");
}

/**
 * Hybrid Auth: Supports chrome.identity (Extension) or Manual Redirect (Web)
 */
async function getAuthToken(interactive = true) {
    // Google Auth is removed. Always return null.
    return Promise.resolve(null);
}

/** 🗑️ ล้าง Token ออกจากระบบและ Storage */
export async function clearAuthToken(tokenToClear, forceConsentNextTime = false) {
    // Google Auth is removed. No action needed.
    return Promise.resolve();
}

/**
 * Wrapper for Drive API calls with Error Handling
 */
async function driveApiFetch(url, options = {}, interactive = false) {
    // Drive API is removed. Always throw an error.
    throw new Error("Google Drive API is not available.");
}

/**
 * ⬆️ บังคับอัปโหลดข้อมูลปัจจุบันจาก Local ไปยัง Google Drive ทันที
 */
export async function forceUploadToDrive() {
    alert("Google Drive sync is disabled. Cannot upload data.");
    return Promise.resolve(false);
}

/**
 * 🖥️ Custom Modal for Drive Import/Download Confirmation
 */
function showDriveImportConfirmModal(driveData, mergeByDefault, onConfirm) {
    // This function is no longer needed as Drive Sync is removed.
    console.log("Drive import confirmation is not available.");
}

/**
 * ⬇️ บังคับดาวน์โหลดข้อมูลจาก Google Drive มาทับข้อมูล Local ทันที
 */
export async function forceDownloadFromDrive() {
    alert("Google Drive sync is disabled. Cannot download data.");
    return Promise.resolve(false);
}

/**
 * 📂 ค้นหาหรือสร้างโฟลเดอร์เป้าหมาย
 */
async function getOrCreateFolderId(folderName) {
    // Drive API is removed.
    return Promise.resolve(null);
}

/**
 * Search for the specific backup file on Drive
 */
async function findFileId() {
    // Drive API is removed.
    return Promise.resolve(null);
}

/**
 * Save current app data to Google Drive
 */
export async function saveToDrive(jsonData) {
    // Drive API is removed.
    console.error("Google Drive sync is disabled. Cannot save data to Drive.");
    return Promise.resolve(false);
}

/**
 * Fetch JSON content from Drive
 */
export async function loadFromDrive() {
    // Drive API is removed.
    console.error("Google Drive sync is disabled. Cannot load data from Drive.");
    return Promise.resolve(null);
}

/**
 * 🔄 ตรวจสอบข้อมูลบน Cloud แบบเงียบๆ และแจ้งเตือนหากพบข้อมูลใหม่
 * ช่วยให้ข้อมูลระหว่าง มือถือ คอม และ Extension ตรงกันเสมอ
 */
export async function autoCheckCloudUpdate() {
    // Drive API is removed. No action needed.
    console.log("Google Drive auto-check is disabled.");
}

function applyDriveData(driveData, merge = false) {
    // Drive API is removed. No action needed.
    console.log("Google Drive data application is disabled.");
}

async function syncDataAfterLogin() {
    // Drive API is removed. No action needed.
    console.log("Google Drive sync after login is disabled.");
}

document.addEventListener('DOMContentLoaded', () => {
    // Drive sync is removed, so no initialization is needed.
    renderDriveSyncUI(); // Render UI to show it's disabled
});

export { getAuthToken, findFileId, syncDataAfterLogin }; // Exporting for other modules that might still call them, but they will be no-ops.