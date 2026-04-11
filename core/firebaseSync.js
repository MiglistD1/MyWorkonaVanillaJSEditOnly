import { initializeApp } from "./lib/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, enableIndexedDbPersistence } from "./lib/firebase-firestore.js";
import { getCurrentSpace, saveData, getSpaces, setSpaces, setOnSaveFirebaseHook, getGlobalLaunchers, setGlobalLaunchers, getLauncherTags, setLauncherTags, getAppSettings, getLocalSettings } from "./storage.js";
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
    updateSyncStatusUI('syncing', 'Syncing...');
    try {
        await setDoc(docRef, { content: content }, { merge: true });
        updateSyncStatusUI('synced', 'WebApp -> Firebase');
    } catch (error) {
        console.error("Error syncing note to Firebase:", error);
        updateSyncStatusUI('offline');
    }
}, 1000);

// UI Elements for Sync Status
export function updateSyncStatusUI(state, detail = "") {
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
    const isAutoSync = getLocalSettings().firebaseAutoSync;
    
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

        if (lastSyncEl && detail) lastSyncEl.innerText = detail;
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
        if (lastSyncEl && state === 'synced') {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = now.toLocaleDateString([], { month: 'short', day: '2-digit' });
            let msg = `Last Synced: ${dateStr}, ${timeStr}`;
            if (detail) msg += ` (${detail})`;
            lastSyncEl.innerText = msg;

            // 🟢 บันทึกประวัติการซิงค์ (เฉพาะรายการที่สำเร็จและมีรายละเอียด)
            if (detail && detail !== 'Syncing...') {
                addToSyncHistory(`${dateStr}, ${timeStr} - ${detail}`);
            }
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
 * 🟢 Helper: บันทึกประวัติการซิงค์ลงใน Storage (แยกส่วนเพื่อป้องกัน Sync Loop)
 */
async function addToSyncHistory(entry) {
    const history = await getSyncHistory();
    history.unshift(entry);
    if (history.length > 5) history.pop();
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ syncHistory: history });
    } else {
        localStorage.setItem('syncHistory', JSON.stringify(history));
    }
    renderSyncHistoryUI();
}

async function getSyncHistory() {
    return new Promise(resolve => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['syncHistory'], (res) => resolve(res.syncHistory || []));
        } else {
            try {
                resolve(JSON.parse(localStorage.getItem('syncHistory') || '[]'));
            } catch(e) { resolve([]); }
        }
    });
}

/**
 * 🟢 Helper: วาดรายการประวัติการซิงค์ใน UI
 */
export async function renderSyncHistoryUI() {
    const container = document.getElementById('sync-history-content');
    const clearBtn = document.getElementById('btn-clear-sync-history');
    if (!container) return;
    const history = await getSyncHistory();

    if (history.length === 0) {
        container.innerHTML = '<div style="text-align:center; opacity:0.5;">No history yet</div>';
        if (clearBtn) clearBtn.style.display = 'none';
    } else {
        container.innerHTML = history.map(entry => {
            let icon = '•';
            let color = 'var(--text-muted)';
            
            // 🔵 Push: WebApp -> Firebase หรือ Merged -> Firebase
            if (entry.includes('-> Firebase')) {
                icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M12 5v14M5 12l7-7 7 7"/></svg>`;
                color = '#3b82f6';
            } 
            // 🟢 Pull: Firebase -> WebApp
            else if (entry.includes('Firebase ->')) {
                icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M12 19V5M5 12l7 7 7-7"/></svg>`;
                color = '#10b981';
            }

            return `<div style="padding: 6px 0; border-bottom: 1px solid var(--border-color); width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; display: flex; align-items: center; color: ${color};">
                ${icon}
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; font-weight: 600;">${entry}</span>
            </div>`;
        }).join('');
        if (clearBtn) clearBtn.style.display = 'flex';
    }
}

/**
 * �️ Force Push current Note to Cloud
 */
export async function forcePushNote() {
    const workspaceNote = document.getElementById('workspace-note');
    if (!workspaceNote) return;
    const content = workspaceNote.innerHTML;
    
    updateSyncStatusUI('syncing');
    try {
        await setDoc(docRef, { content: content }, { merge: true });
        updateSyncStatusUI('synced', 'WebApp -> Firebase');
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
            updateSyncStatusUI('synced', 'Firebase -> WebApp');
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

    // 🟢 ระบบเปิด/ปิดประวัติการซิงค์
    const historyBtn = document.getElementById('btn-view-sync-history');
    const historyList = document.getElementById('sync-history-list');
    if (historyBtn && historyList) {
        // 🟢 ระบบล้างประวัติ
        const clearBtn = document.getElementById('btn-clear-sync-history');
        if (clearBtn) {
            clearBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm("ล้างประวัติการซิงค์ทั้งหมดหรือไม่?")) {
                    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.set({ syncHistory: [] }, () => renderSyncHistoryUI());
                    } else {
                        localStorage.setItem('syncHistory', JSON.stringify([]));
                        renderSyncHistoryUI();
                    }
                }
            };
        }

        historyBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = historyList.style.display === 'none';
            historyList.style.display = isHidden ? 'flex' : 'none';
            historyBtn.innerText = isHidden ? 'Hide History' : 'View History';
            if (isHidden) renderSyncHistoryUI();
        };
    }

    // 🎨 ปรับสีปุ่ม Push/Pull ใน Popup ให้ตรงตามสีในประวัติ
    const styleId = 'sf-sync-btn-custom-colors';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            #btn-firebase-pull { color: #10b981 !important; font-weight: 800 !important; }
            #btn-firebase-push { color: #3b82f6 !important; font-weight: 800 !important; }
        `;
        document.head.appendChild(style);
    }

    // 1. Listen: รับข้อมูลจาก Firebase มาอัปเดตหน้าจอ
    onSnapshot(docRef, (snapshot) => {
        if (!getLocalSettings().firebaseAutoSync) return;
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
                updateSyncStatusUI('synced', 'Firebase -> WebApp');
            }
        }
    });

    // 🟢 5. Listen: รับข้อมูล Shortcuts (Launchers) จาก Cloud
    onSnapshot(docRefConfig, (snapshot) => {
        if (!getLocalSettings().firebaseAutoSync) return;
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
                updateSyncStatusUI('synced', 'Firebase -> WebApp');
            }
        }
    });

    // 🟢 3. Listen: รับข้อมูล Spaces/Tasks จาก Cloud
    onSnapshot(docRefSpaces, (snapshot) => {
        // 🛑 ตรวจสอบ Auto Sync และสถานะการพิมพ์
        if (!getLocalSettings().firebaseAutoSync || isAnyEditableElementFocused()) return;

        const source = snapshot.metadata.fromCache ? "Local Cache" : "Server";
        if (snapshot.metadata.fromCache) {
            console.log(`ℹ️ Spaces data loaded from: ${source}`);
        }
        const data = snapshot.data();
        if (data && data.spaces) {
            const cloudSpaces = data.spaces;
            const localSpaces = getSpaces();
            
            // 🟢 ในโหมด Auto Sync เมื่อข้อมูลคลาวด์เปลี่ยน ให้อัปเดตลงเครื่องทันที (Passive Update)
            if (JSON.stringify(localSpaces) !== JSON.stringify(cloudSpaces)) {
                setSpaces(cloudSpaces);
                if (window.renderAll) window.renderAll();
                updateSyncStatusUI('synced', 'Firebase -> WebApp');
            }
        }
    });

    // 2. Push: เมื่อเราพิมพ์ ให้ส่งขึ้น Firebase ทันที
    workspaceNote.addEventListener('input', (e) => {
        const content = e.target.innerHTML;
        
        // 🟢 Check Auto Sync state before automatic push
        if (!getLocalSettings().firebaseAutoSync) return;

        // Only sync to cloud if the content has actually changed to avoid unnecessary writes
        if (getCurrentSpace()?.note !== content) {
            getCurrentSpace().note = content;
            saveData(); // Save Local Storage
            setDoc(docRef, { content: content }, { merge: true }); // Sync to Cloud
        }
    });

    // 🟢 4. Push: เมื่อมีการเปลี่ยนสถานะงาน (Add, Delete, Check, Sort)
    setOnSaveFirebaseHook(async (data) => {
        // 🟢 Check Auto Sync state before background sync (Device-specific)
        if (!getLocalSettings().firebaseAutoSync) return;

        updateSyncStatusUI('syncing');
        // ส่งข้อมูล Spaces ทั้งหมดขึ้นไป (รวมถึง Tasks ภายในนั้น)
        try {
            await Promise.all([
                setDoc(docRefSpaces, { spaces: data.mySpacesData }, { merge: true }),
                setDoc(docRefConfig, { launchers: data.globalLaunchers, launcherTags: data.launcherTags }, { merge: true })
            ]);
            updateSyncStatusUI('synced', 'WebApp -> Firebase');
        } catch (error) {
            console.error("Firebase Background Sync Error:", error);
            updateSyncStatusUI('offline');
        }
    });
}

/**
 * 🎨 Helper: แสดงหน้าต่างเลือกตัวเลือกแบบเรืองแสงสำหรับ Auto Sync
 */
async function showSyncChoiceModal(title, choices) {
    const modalId = 'sf-sync-reconcile-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    // 🎨 สร้าง Style ชั่วคราวสำหรับปุ่มที่ถูกเลือก
    const styleId = 'sf-sync-modal-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .sf-sync-choice-btn.selected-pull { border-color: #10b981 !important; background: rgba(16, 185, 129, 0.1) !important; transform: translateY(-1px); }
            .sf-sync-choice-btn.selected-push { border-color: #3b82f6 !important; background: rgba(59, 130, 246, 0.1) !important; transform: translateY(-1px); }
            .sf-sync-choice-btn.selected-merge { border-color: #f59e0b !important; background: rgba(245, 158, 11, 0.1) !important; transform: translateY(-1px); }
            .sf-sync-choice-btn.selected-overwrite { border-color: #ef4444 !important; background: rgba(239, 68, 68, 0.1) !important; transform: translateY(-1px); }
            
            .sf-sync-choice-btn .choice-icon { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; opacity: 0.6; transition: all 0.2s ease; }
            .sf-sync-choice-btn.selected-pull .choice-icon, .sf-sync-choice-btn.selected-push .choice-icon, .sf-sync-choice-btn.selected-merge .choice-icon { opacity: 1; transform: scale(1.1); }
            
            .sf-sync-choice-btn .choice-label-text { font-weight: 700; font-size: 12px; color: var(--text-main); }
            .sf-sync-choice-btn.selected-pull .choice-label-text { color: #059669 !important; }
            .sf-sync-choice-btn.selected-push .choice-label-text { color: #2563eb !important; }
        `;
        document.head.appendChild(style);
    }

    const modalHTML = `
        <div class="modal-overlay" id="${modalId}" style="display:flex; z-index:21000; background:rgba(0,0,0,0.4); backdrop-filter:blur(4px);">
            <div class="modal-content" style="width:280px; padding:16px; text-align:center; border-radius:14px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); background:var(--bg-card); border:1px solid var(--border-color);">
                <div style="margin-bottom:10px; display:flex; justify-content:center; color:var(--primary-color); opacity:0.8;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg></div>
                <h3 style="margin:0; font-weight:800; font-size:14px; color:var(--text-main); letter-spacing:-0.2px;">${title}</h3>
                <div id="sf-sync-choices-container" style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:16px;">
                    ${choices.map(c => `
                        <button class="sf-sync-choice-btn" data-id="${c.id}" style="display:flex; flex-direction:column; align-items:center; gap:6px; padding:10px 6px; border:1px solid var(--border-color); border-radius:10px; background:var(--bg-body); cursor:pointer; transition:all 0.2s ease; outline:none;">
                            <div class="choice-icon">${c.icon}</div>
                            <div class="choice-label-text">${c.label}</div>
                            <div style="font-size:10px; color:var(--text-muted); line-height:1.2; font-weight:500;">${c.desc}</div>
                        </button>
                    `).join('')}
                </div>
                <div style="margin-top:25px; text-align:center;">
                    <button id="btn-sync-cancel" style="background:none; border:none; color:var(--text-muted); font-size:12px; cursor:pointer; text-decoration:underline; opacity:0.6; transition:opacity 0.2s;">ยกเลิกและปิด Auto Sync</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    modal = document.getElementById(modalId);

    return new Promise((resolve) => {
        const btns = modal.querySelectorAll('.sf-sync-choice-btn');
        btns.forEach(btn => {
            btn.onclick = () => {
                const choiceId = btn.dataset.id;
                // ล้างคลาสเก่าและใส่คลาสใหม่ตามประเภทเพื่อแสดงสีที่ถูกต้อง
                btns.forEach(b => b.className = 'sf-sync-choice-btn');
                btn.classList.add(`selected-${choiceId}`);
                
                setTimeout(() => {
                    modal.remove();
                    resolve(btn.dataset.id);
                }, 500); // หน่วงเวลาให้เห็นแสง
            };
        });

        document.getElementById('btn-sync-cancel').onclick = () => {
            modal.remove();
            resolve(null);
        };
    });
}

/**
 * 🛰️ ขั้นตอนการเปิดใช้งาน Auto Sync ครั้งแรก (Manual Reconcilation Flow)
 */
export async function handleAutoSyncActivation() {
    const localSpaces = getSpaces();
    
    // 1. ให้ผู้ใช้เลือกทิศทางการซิงค์ตั้งต้นผ่าน Custom Modal
    const direction = await showSyncChoiceModal("เลือกทิศทางการซิงค์ตั้งต้น", [
        { id: 'pull', label: 'Pull', desc: 'ดึงข้อมูล Cloud มาทับเครื่อง', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7 7 7-7"/></svg>' },
        { id: 'push', label: 'Push', desc: 'ส่งข้อมูลเครื่องไปทับ Cloud', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7-7 7 7"/></svg>' }
    ]);
    
    if (!direction) return false;

    updateSyncStatusUI('syncing', 'Checking conflicts...');
    try {
        const snapshot = await getDoc(docRefSpaces);
        const cloudData = snapshot.data();
        const cloudSpaces = cloudData?.spaces || [];

        // 2. ตรวจสอบ Conflict เฉพาะ To-do และ Resources
        let hasConflict = false;
        const allIds = new Set([...localSpaces.map(s => s.id), ...cloudSpaces.map(s => s.id)]);
        
        for (const id of allIds) {
            const local = localSpaces.find(s => s.id === id);
            const cloud = cloudSpaces.find(s => s.id === id);
            if (!local || !cloud) { hasConflict = true; break; }

            const tasksMatch = JSON.stringify(local.tasks) === JSON.stringify(cloud.tasks);
            const resMatch = JSON.stringify(local.resources) === JSON.stringify(cloud.resources);
            const driveMatch = JSON.stringify(local.driveFiles) === JSON.stringify(cloud.driveFiles);

            if (!tasksMatch || !resMatch || !driveMatch) { hasConflict = true; break; }
        }

        let finalSpaces = [];
        if (hasConflict) {
            // 3. ระบบถามเรื่องการ Merge ผ่าน Custom Modal
            const resolveMethod = await showSyncChoiceModal("พบข้อมูลบางส่วนไม่ตรงกัน", [
                { id: 'merge', label: 'Merge', desc: 'ผสานข้อมูล (ปลอดภัย)', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' },
                { id: 'overwrite', label: 'Overwrite', desc: `เขียนทับตามโหมด ${direction}`, icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' }
            ]);
            
            if (resolveMethod === 'merge') {
                finalSpaces = Array.from(allIds).map(id => {
                    const local = localSpaces.find(s => s.id === id);
                    const cloud = cloudSpaces.find(s => s.id === id);
                    if (!local) return cloud;
                    if (!cloud) return local;
                    return {
                        ...cloud,
                        tasks: mergeArrays(cloud.tasks, local.tasks, 'text'),
                        resources: mergeArrays(cloud.resources, local.resources, 'url'),
                        driveFiles: mergeArrays(cloud.driveFiles, local.driveFiles, 'url')
                    };
                });
                setSpaces(finalSpaces);
                await setDoc(docRefSpaces, { spaces: finalSpaces }, { merge: true });
                updateSyncStatusUI('synced', 'Merged -> Firebase');
            } else if (resolveMethod === 'overwrite') {
                // Overwrite Logic
                if (direction === 'pull') {
                    finalSpaces = cloudSpaces;
                    setSpaces(finalSpaces);
                    updateSyncStatusUI('synced', 'Firebase -> WebApp');
                } else {
                    finalSpaces = localSpaces;
                    await setDoc(docRefSpaces, { spaces: finalSpaces }, { merge: true });
                    updateSyncStatusUI('synced', 'WebApp -> Firebase');
                }
            } else {
                return false; // User cancelled
            }
        } else {
            // กรณีข้อมูลตรงกันแล้ว แค่จัดเตรียมสถานะ
            if (direction === 'pull') {
                setSpaces(cloudSpaces);
                updateSyncStatusUI('synced', 'Firebase -> WebApp');
            } else {
                await setDoc(docRefSpaces, { spaces: localSpaces }, { merge: true });
                updateSyncStatusUI('synced', 'WebApp -> Firebase');
            }
        }

        if (window.renderAll) window.renderAll();
        return true;
    } catch (error) {
        console.error("Auto Sync activation flow failed:", error);
        updateSyncStatusUI('offline');
        return false;
    }
}