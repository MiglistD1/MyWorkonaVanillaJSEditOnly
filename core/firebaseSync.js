import { initializeApp } from "./lib/firebase-app.js";
import { getFirestore, doc, collection, setDoc, getDoc, getDocs, onSnapshot, enableIndexedDbPersistence, writeBatch, query } from "./lib/firebase-firestore.js";
import { getCurrentSpace, saveData, getSpaces, setSpaces, setOnSaveFirebaseHook, getGlobalLaunchers, setGlobalLaunchers, getLauncherTags, setLauncherTags, getAppSettings, getLocalSettings, getDeviceId } from "./storage.js";
import { isAnyEditableElementFocused } from "../features/todoManager.js";
import { showConflictModal } from "../components/modals.js";

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


const docRefConfig = doc(db, "data", "globalConfig");
const colRefWorkspaces = collection(db, "workspaces");

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
        // 🟢 ล้างสถานะ Syncing ออกจากปุ่ม Checkbox ทั้งหมดเมื่อซิงค์เสร็จสมบูรณ์
        document.querySelectorAll('.google-task-checkbox.is-syncing').forEach(el => el.classList.remove('is-syncing'));

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
        // 🟢 ล้างสถานะออกเช่นกันหากเกิด Error เพื่อให้ปุ่มกลับมาคลิกได้ปกติ
        document.querySelectorAll('.google-task-checkbox.is-syncing').forEach(el => el.classList.remove('is-syncing'));

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
 * ️ Smart Merge: ผสานข้อมูลโดยใช้ Timestamp และสถานะ Soft Delete
 * แก้ปัญหา "ข้อมูลผี" (Ghost data) โดยการยอมรับการลบหาก Timestamp ใหม่กว่า
 */
export function mergeItems(cloudArray, localArray, uniqueKey) {
    const mergedMap = new Map();
    const allItems = [...(localArray || []), ...(cloudArray || [])];

    allItems.forEach(item => {
        if (!item || item[uniqueKey] === undefined) return;
        
        const key = item[uniqueKey];
        const existing = mergedMap.get(key);

        if (!existing) {
            mergedMap.set(key, item);
        } else {
            // เปรียบเทียบเวลา: ใช้ lastUpdated หรือ deletedAt (สำหรับ Soft Delete)
            const existingTime = existing.lastUpdated || existing.deletedAt || existing.createdAt || 0;
            const incomingTime = item.lastUpdated || item.deletedAt || item.createdAt || 0;

            // หากข้อมูลใหม่มีความใหม่กว่า (ไม่ว่าจะเป็นการแก้ไขหรือการลบ) ให้ใช้ข้อมูลนั้น
            if (incomingTime > existingTime) {
                mergedMap.set(key, item);
            }
        }
    });

    return Array.from(mergedMap.values());
}

/** 🔄 Backward Compatibility: ให้โค้ดเดิมที่เรียก mergeArrays ใช้งานชื่อใหม่ได้ทันที */
export const mergeArrays = mergeItems;

export function initFirebaseSync() {
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
    onSnapshot(query(colRefWorkspaces), (snapshot) => {
        // 🛑 ตรวจสอบ Auto Sync และสถานะการพิมพ์
        if (!getLocalSettings().firebaseAutoSync || isAnyEditableElementFocused()) return;

        if (!snapshot.empty) {
            const cloudSpaces = snapshot.docs.map(d => ({ ...d.data(), id: parseInt(d.id) }));
            let localSpaces = getSpaces();
            let hasChanged = false;

            // 🛰️ ตรวจสอบการเปลี่ยนแปลงราย Workspace
            cloudSpaces.forEach(cloudSpace => {
                const localIndex = localSpaces.findIndex(s => s.id === cloudSpace.id);
                if (localIndex === -1) {
                    localSpaces.push(cloudSpace);
                    hasChanged = true;
                } else {
                    const localSpace = localSpaces[localIndex];
                    // ใช้ Timestamp ตัดสิน: ถ้าบน Cloud ใหม่กว่า ให้เขียนทับเฉพาะอันนั้น
                    if ((cloudSpace.lastUpdated || 0) > (localSpace.lastUpdated || 0)) {
                        localSpaces[localIndex] = cloudSpace;
                        hasChanged = true;
                    }
                }
            });

            if (hasChanged) {
                setSpaces(localSpaces);
                saveData(true, true); // 🟢 บันทึกแบบ Silent (isRemoteUpdate: true) เพื่อป้องกัน Loop
                if (window.renderAll) window.renderAll();
                updateSyncStatusUI('synced', 'Firebase -> WebApp');
            }
        }
    });

    // 🟢 4. Push: เมื่อมีการเปลี่ยนสถานะงาน (Add, Delete, Check, Sort)
    setOnSaveFirebaseHook(async (data) => {
        // 🟢 Check Auto Sync state before background sync (Device-specific)
        if (!getLocalSettings().firebaseAutoSync) return;

        updateSyncStatusUI('syncing');
        try {
            // 🟢 1. ใช้ writeBatch แยกบันทึกราย Workspace (แก้ปัญหา 1MB Limit)
            const batch = writeBatch(db);
            data.mySpacesData.forEach(space => {
                const sRef = doc(db, "workspaces", String(space.id));
                batch.set(sRef, space, { merge: true });
            });
            
            // 🟢 2. บันทึกข้อมูลอื่นๆ ควบคู่ไปด้วย
            await Promise.all([
                batch.commit(),
                setDoc(docRefConfig, { launchers: data.globalLaunchers, launcherTags: data.launcherTags, lastUpdated: Date.now() }, { merge: true })
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

    // 🟢 ตั้งค่าเป็น ON ทันทีที่เลือกทิศทางเสร็จ เพื่อให้ UI แสดงผลสีเขียวและบันทึกสถานะลงเครื่อง
    getLocalSettings().firebaseAutoSync = true;
    saveData(true); 

    updateSyncStatusUI('syncing', 'Checking conflicts...');
    try {
        const snapshot = await getDocs(query(colRefWorkspaces));
        const cloudSpaces = snapshot.docs.map(d => ({ ...d.data(), id: parseInt(d.id) }));

        const allIds = new Set([...localSpaces.map(s => s.id), ...cloudSpaces.map(s => s.id)]);
        let finalSpaces = [];
        let conflictsFound = [];

        // 🛰️ วนลูปตรวจสอบความขัดแย้ง "ราย Workspace"
        for (const id of allIds) {
            const local = localSpaces.find(s => s.id === id);
            const cloud = cloudSpaces.find(s => s.id === id);

            if (!local) { finalSpaces.push(cloud); continue; }
            if (!cloud) { finalSpaces.push(local); continue; }

            // กรณีมีทั้งคู่: ตรวจสอบ Timestamp
            const localTime = local.lastUpdated || 0;
            const cloudTime = cloud.lastUpdated || 0;

            // หากเวลาห่างกันเกิน 2 วินาที และข้อมูลไม่ตรงกันเป๊ะๆ ให้ถือว่าเป็น Conflict
            if (Math.abs(localTime - cloudTime) > 2000 && JSON.stringify(local) !== JSON.stringify(cloud)) {
                conflictsFound.push({ id, name: local.name, local, cloud, localTime, cloudTime });
            } else {
                // ถ้าเวลาใกล้เคียงกัน หรือข้อมูลเหมือนกัน ให้ทำ Auto-merge เงียบๆ
                finalSpaces.push(cloudTime >= localTime ? cloud : local);
            }
        }

        if (conflictsFound.length > 0) {
            // 🚨 เด้ง Modal ถามเฉพาะ Workspace ที่มีปัญหาจริงๆ เท่านั้น
            const resolveMethod = await showSyncChoiceModal(`${conflictsFound.length} Workspaces Conflict`, [
                { id: 'merge', label: 'Smart Merge', desc: 'ผสานข้อมูลตามรายไอเทม', icon: '🧬' },
                { id: 'overwrite', label: 'Overwrite', desc: `เน้นโหมด ${direction} ทั้งหมด`, icon: '📝' }
            ]);

            if (!resolveMethod) return false;

            conflictsFound.forEach(conf => {
                if (resolveMethod === 'merge') {
                    const merged = {
                        ...(conf.cloudTime >= conf.localTime ? conf.cloud : conf.local),
                        tasks: mergeItems(conf.cloud.tasks || [], conf.local.tasks || [], 'createdAt'),
                        resources: mergeItems(conf.cloud.resources, conf.local.resources, 'url'),
                        driveFiles: mergeItems(conf.cloud.driveFiles, conf.local.driveFiles, 'url'),
                        lastUpdated: Date.now()
                    };
                    finalSpaces.push(merged);
                } else {
                    finalSpaces.push(direction === 'pull' ? conf.cloud : conf.local);
                }
            });
        }

        // 🚀 บันทึกผลลัพธ์สุดท้ายกลับขึ้น Cloud (ใช้ Batch)
        setSpaces(finalSpaces);
        saveData(true, true); // 🟢 บันทึกแบบ Silent ป้องกันการ trigger ซ้ำ
        const batch = writeBatch(db);
        finalSpaces.forEach(s => {
            batch.set(doc(db, "workspaces", String(s.id)), s, { merge: true });
        });
        
        await batch.commit();
        updateSyncStatusUI('synced', direction === 'pull' ? 'Cloud Overwrite' : 'Local Push');

        if (window.renderAll) window.renderAll();
        return true;
    } catch (error) {
        console.error("Auto Sync activation flow failed:", error);
        updateSyncStatusUI('offline');
        return false;
    }
}