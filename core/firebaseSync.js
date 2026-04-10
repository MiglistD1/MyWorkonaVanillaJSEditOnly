import { initializeApp } from "./lib/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, enableIndexedDbPersistence } from "./lib/firebase-firestore.js";
import { getCurrentSpace, saveData, getSpaces, setSpaces, setOnSaveFirebaseHook, getGlobalLaunchers, setGlobalLaunchers, getLauncherTags, setLauncherTags, getAppSettings } from "./storage.js";
import { isAnyEditableElementFocused } from "../features/todoManager.js";

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyCVX63Zj9RIJmHEfVCN5g3uP8dojeXniPg",
    authDomain: "myworkona-realtime.firebaseapp.com",
    projectId: "myworkona-realtime",
    storageBucket: "myworkona-realtime.firebasestorage.app",
    messagingSenderId: "659357151725",
    appId: "1:659357151725:web:024039ffc44a290f98b7e4"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Multiple tabs open, offline mode works in one tab only.');
    } else if (err.code == 'unimplemented') {
        console.warn('Browser does not support offline mode.');
    }
});

const docRef = doc(db, "data", "mynotes");
const docRefSpaces = doc(db, "data", "myspaces");
const docRefConfig = doc(db, "data", "globalConfig");

/**
 * ⏱️ Reusable debounce function to delay execution
 */
function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(null, args), delay);
    };
}

/**
 * 🛰️ Debounced function for syncing Note content to Firebase
 */
const debouncedNoteSync = debounce(async (content) => {
    updateSyncStatusUI('syncing');
    try {
        await setDoc(docRef, { content: content }, { merge: true });
        updateSyncStatusUI('synced');
    } catch (error) {
        console.error("Error syncing note to Firebase:", error);
        updateSyncStatusUI('offline');
    }
}, 1000);

// UI Elements for Sync Status
export function updateSyncStatusUI(state) {
    const syncedIcon = document.getElementById('sync-icon-synced');
    const syncingIcon = document.getElementById('sync-icon-syncing');
    const offlineIcon = document.getElementById('sync-icon-offline');
    const triggerBtn = document.getElementById('btn-firebase-sync-trigger');
    const lastSyncEl = document.getElementById('firebase-last-sync-time');
    
    if (!syncedIcon || !syncingIcon || !offlineIcon || !triggerBtn) return;

    // 🟢 กำหนดสถานะการแสดงผล (Default เป็น Synced หากไม่ได้ส่งค่ามา)
    const displayState = state || 'synced';

    syncedIcon.style.display = (displayState === 'synced') ? 'block' : 'none';
    syncingIcon.style.display = (displayState === 'syncing') ? 'block' : 'none';
    offlineIcon.style.display = (displayState === 'offline') ? 'block' : 'none';

    // 🛰️ Update Trigger Button (Cloud Icon) effect
    const cloudSvg = triggerBtn.querySelector('svg');
    const isAutoSync = getAppSettings().firebaseAutoSync;
    
    // เพิ่ม Transition เพื่อความนุ่มนวล
    triggerBtn.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    triggerBtn.style.borderStyle = 'solid';

    if (displayState === 'syncing') {
        cloudSvg.classList.add('spin');
        const color = '#f59e0b';
        triggerBtn.style.color = color;
        triggerBtn.style.borderColor = color;
        triggerBtn.style.borderWidth = '2px';
        triggerBtn.style.boxShadow = `0 0 10px rgba(245, 158, 11, 0.4)`;
    } else if (displayState === 'synced') {
        cloudSvg.classList.remove('spin');
        if (isAutoSync) {
            const color = '#10b981';
            triggerBtn.style.color = color;
            triggerBtn.style.borderColor = color;
            triggerBtn.style.borderWidth = '2px';
            triggerBtn.style.boxShadow = `0 0 12px rgba(16, 185, 129, 0.5)`;
        } else {
            const color = '#9ca3af';
            triggerBtn.style.color = color;
            triggerBtn.style.borderColor = color;
            triggerBtn.style.borderWidth = '1px';
            triggerBtn.style.boxShadow = 'none';
        }
        
        // ⏱️ Update Last Synced Timestamp
        if (lastSyncEl && state) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = now.toLocaleDateString([], { day: '2-digit', month: 'short' });
            lastSyncEl.innerText = `Last Synced: ${dateStr}, ${timeStr}`;
        }
    } else if (displayState === 'offline') {
        cloudSvg.classList.remove('spin');
        const color = '#ef4444';
        triggerBtn.style.color = color;
        triggerBtn.style.borderColor = color;
        triggerBtn.style.borderWidth = '2px';
        triggerBtn.style.boxShadow = `0 0 12px rgba(239, 68, 68, 0.5)`;
    }
}

/**
 * 🛰️ Force Push current Note to Cloud
 */
export async function forcePushNote() {
    const workspaceNote = document.getElementById('workspace-note');
    if (!workspaceNote) return;
    const content = workspaceNote.innerHTML;
    
    updateSyncStatusUI('syncing');
    try {
        await setDoc(docRef, { content: content }, { merge: true });
        updateSyncStatusUI('synced');
    } catch (error) {
        console.error("Force Push failed:", error);
        updateSyncStatusUI('offline');
    }
}

/**
 * 🛰️ Force Pull current Note from Cloud
 */
export async function forcePullNote() {
    const workspaceNote = document.getElementById('workspace-note');
    if (!workspaceNote) return;
    
    updateSyncStatusUI('syncing');
    try {
        const snapshot = await getDoc(docRef);
        const data = snapshot.data();
        if (data && data.content !== undefined) {
            workspaceNote.innerHTML = data.content;
            const space = getCurrentSpace();
            if (space) space.note = data.content;
            saveData(true);
            updateSyncStatusUI('synced');
        }
    } catch (error) {
        console.error("Force Pull failed:", error);
        updateSyncStatusUI('offline');
    }
}

/**
 * 🟢 Helper: Merge two arrays of objects based on a unique key, prioritizing cloud data.
 */
export function mergeArrays(cloudArray, localArray, uniqueKey) {
    const mergedMap = new Map();

    // Start with local data
    (localArray || []).forEach(item => {
        if (item && item[uniqueKey] !== undefined) {
            mergedMap.set(item[uniqueKey], item);
        }
    });

    // Overwrite/Add with cloud data (prioritize cloud version)
    (cloudArray || []).forEach(item => {
        if (item && item[uniqueKey] !== undefined) {
            mergedMap.set(item[uniqueKey], item);
        }
    });

    return Array.from(mergedMap.values());
}

/**
 * � เริ่มต้นระบบ Real-time Sync สำหรับ Note
 */
export function initFirebaseSync() {
    const workspaceNote = document.getElementById('workspace-note');
    if (!workspaceNote) return;

    // 1. Listen: รับข้อมูลจาก Firebase มาอัปเดตหน้าจอ
    onSnapshot(docRef, (snapshot) => {
        const source = snapshot.metadata.fromCache ? "Local Cache" : "Server";
        if (snapshot.metadata.fromCache) {
            console.log(`ℹ️ Notes data loaded from: ${source}`);
        }
        const data = snapshot.data();
        if (data && data.content !== undefined) {
            // ตรวจสอบเพื่อป้องกัน Infinite Loop และ Cursor กระโดด
            if (workspaceNote.innerHTML !== data.content) {
                workspaceNote.innerHTML = data.content;
                const space = getCurrentSpace();
                if (space) space.note = data.content;
                updateSyncStatusUI('synced');
            }
        }
    });

    // 🟢 5. Listen: รับข้อมูล Shortcuts (Launchers) จาก Cloud
    onSnapshot(docRefConfig, (snapshot) => {
        const source = snapshot.metadata.fromCache ? "Local Cache" : "Server";
        if (snapshot.metadata.fromCache) {
            console.log(`ℹ️ Config data loaded from: ${source}`);
        }
        const data = snapshot.data();
        if (data) {
            let needsRender = false;
            if (data.launchers && JSON.stringify(getGlobalLaunchers()) !== JSON.stringify(data.launchers)) {
                setGlobalLaunchers(data.launchers);
                needsRender = true;
            }
            if (data.launcherTags && JSON.stringify(getLauncherTags()) !== JSON.stringify(data.launcherTags)) {
                setLauncherTags(data.launcherTags);
                needsRender = true;
            }
            
            if (needsRender && window.renderAll) {
                window.renderAll();
                updateSyncStatusUI('synced');
            }
        }
    });

    // 🟢 3. Listen: รับข้อมูล Spaces/Tasks จาก Cloud
    onSnapshot(docRefSpaces, (snapshot) => {
        // ป้องกันการทับข้อมูลขณะผู้ใช้กำลังพิมพ์งานหรือชื่อ Space
        if (isAnyEditableElementFocused()) return;

        const source = snapshot.metadata.fromCache ? "Local Cache" : "Server";
        if (snapshot.metadata.fromCache) {
            console.log(`ℹ️ Spaces data loaded from: ${source}`);
        }
        const data = snapshot.data();
        if (data && data.spaces) {
            const cloudSpaces = data.spaces;
            const localSpaces = getSpaces();
            const rawDiff = JSON.stringify(localSpaces) !== JSON.stringify(cloudSpaces);

            if (rawDiff) {
                // 🟢 ตรวจสอบ Conflict เฉพาะใน Tasks และ Resources (รวมถึง Drive Files)
                const hasConflict = cloudSpaces.some(cloudSpace => {
                    const localSpace = localSpaces.find(s => s.id === cloudSpace.id);
                    if (!localSpace) return false; 

                    const tasksDiff = JSON.stringify(cloudSpace.tasks) !== JSON.stringify(localSpace.tasks);
                    const resDiff = JSON.stringify(cloudSpace.resources) !== JSON.stringify(localSpace.resources);
                    const driveDiff = JSON.stringify(cloudSpace.driveFiles) !== JSON.stringify(localSpace.driveFiles);

                    return tasksDiff || resDiff || driveDiff;
                });

                if (hasConflict) {
                    if (confirm("พบข้อมูล [To-do / Resources] บนคลาวด์ไม่ตรงกับในเครื่อง คุณต้องการรวมข้อมูล (Merge) หรือไม่?")) {
                        const mergedSpaces = cloudSpaces.map(cloudSpace => {
                            const localSpace = localSpaces.find(s => s.id === cloudSpace.id);
                            if (!localSpace) return cloudSpace;

                            return {
                                ...cloudSpace,
                                tasks: mergeArrays(cloudSpace.tasks, localSpace.tasks, 'text'),
                                resources: mergeArrays(cloudSpace.resources, localSpace.resources, 'url'),
                                driveFiles: mergeArrays(cloudSpace.driveFiles, localSpace.driveFiles, 'url')
                            };
                        });
                        setSpaces(mergedSpaces);
                        if (window.renderAll) window.renderAll();
                        setDoc(docRefSpaces, { spaces: mergedSpaces }, { merge: true });
                        updateSyncStatusUI('synced');
                    }
                } else {
                    setSpaces(cloudSpaces);
                    if (window.renderAll) window.renderAll();
                    updateSyncStatusUI('synced');
                }
            }
        }
    });

    // 2. Push: เมื่อเราพิมพ์ ให้ส่งขึ้น Firebase ทันที
    workspaceNote.addEventListener('input', (e) => {
        const content = e.target.innerHTML;
        
        // 🟢 Check Auto Sync state before automatic push
        if (!getAppSettings().firebaseAutoSync) return;

        // Only sync to cloud if the content has actually changed to avoid unnecessary writes
        if (getCurrentSpace()?.note !== content) {
            getCurrentSpace().note = content;
            saveData(); // Save Local Storage
            setDoc(docRef, { content: content }, { merge: true }); // Sync to Cloud
        }
    });

    // 🟢 4. Push: เมื่อมีการเปลี่ยนสถานะงาน (Add, Delete, Check, Sort)
    setOnSaveFirebaseHook(async (data) => {
        // 🟢 Check Auto Sync state before background sync
        if (!getAppSettings().firebaseAutoSync) return;

        updateSyncStatusUI('syncing');
        // ส่งข้อมูล Spaces ทั้งหมดขึ้นไป (รวมถึง Tasks ภายในนั้น)
        try {
            await Promise.all([
                setDoc(docRefSpaces, { spaces: data.mySpacesData }, { merge: true }),
                setDoc(docRefConfig, { launchers: data.globalLaunchers, launcherTags: data.launcherTags }, { merge: true })
            ]);
            updateSyncStatusUI('synced');
        } catch (error) {
            console.error("Firebase Background Sync Error:", error);
            updateSyncStatusUI('offline');
        }
    });
}