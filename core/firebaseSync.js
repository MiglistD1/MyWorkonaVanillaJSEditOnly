import { initializeApp } from "./lib/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, enableIndexedDbPersistence } from "./lib/firebase-firestore.js";
import { getCurrentSpace, saveData, getSpaces, setSpaces, setOnSaveFirebaseHook, getGlobalLaunchers, setGlobalLaunchers, getLauncherTags, setLauncherTags } from "./storage.js";
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
function updateSyncStatusUI(state) {
    const syncedIcon = document.getElementById('sync-icon-synced');
    const syncingIcon = document.getElementById('sync-icon-syncing');
    const offlineIcon = document.getElementById('sync-icon-offline');
    const triggerBtn = document.getElementById('btn-firebase-sync-trigger');
    const lastSyncEl = document.getElementById('firebase-last-sync-time');
    
    if (!syncedIcon || !syncingIcon || !offlineIcon || !triggerBtn) return;

    syncedIcon.style.display = (state === 'synced') ? 'block' : 'none';
    syncingIcon.style.display = (state === 'syncing') ? 'block' : 'none';
    offlineIcon.style.display = (state === 'offline') ? 'block' : 'none';

    // 🛰️ Update Trigger Button (Cloud Icon) effect
    const cloudSvg = triggerBtn.querySelector('svg');
    if (state === 'syncing') {
        cloudSvg.classList.add('spin');
        triggerBtn.style.color = '#f59e0b'; // สีส้มขณะกำลังทำงาน
    } else if (state === 'synced') {
        cloudSvg.classList.remove('spin');
        triggerBtn.style.color = '#10b981'; // สีเขียวเมื่อสำเร็จ
        
        // ⏱️ Update Last Synced Timestamp
        if (lastSyncEl) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = now.toLocaleDateString([], { day: '2-digit', month: 'short' });
            lastSyncEl.innerText = `Last Synced: ${dateStr}, ${timeStr}`;
        }
    } else if (state === 'offline') {
        cloudSvg.classList.remove('spin');
        triggerBtn.style.color = '#ef4444'; // สีแดงเมื่อออฟไลน์
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
 * 🚀 เริ่มต้นระบบ Real-time Sync สำหรับ Note
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
            const localSpaces = getSpaces();
            // ตรวจสอบความแตกต่างของข้อมูลเพื่อป้องกัน Infinite Loop
            if (JSON.stringify(localSpaces) !== JSON.stringify(data.spaces)) {
                setSpaces(data.spaces);
                // เรียกใช้ฟังก์ชันวาดหน้าจอใหม่จาก Global (นิยามใน dashboard.js)
                if (window.renderAll) window.renderAll();
                updateSyncStatusUI('synced');
            }
        }
    });

    // 2. Push: เมื่อเราพิมพ์ ให้ส่งขึ้น Firebase ทันที
    workspaceNote.addEventListener('input', (e) => {
        const content = e.target.innerHTML;
        // Only sync to cloud if the content has actually changed to avoid unnecessary writes
        if (getCurrentSpace()?.note !== content) {
            getCurrentSpace().note = content;
            saveData(); // Save Local Storage
            setDoc(docRef, { content: content }, { merge: true }); // Sync to Cloud
        }
    });

    // 🟢 4. Push: เมื่อมีการเปลี่ยนสถานะงาน (Add, Delete, Check, Sort)
    setOnSaveFirebaseHook(async (data) => {
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