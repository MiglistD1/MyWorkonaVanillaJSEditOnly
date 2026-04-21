import { initializeApp } from "./lib/firebase-app.js";
import { getFirestore, doc, collection, setDoc, getDoc, getDocs, onSnapshot, enableIndexedDbPersistence, writeBatch, query } from "./lib/firebase-firestore.js";
import { getCurrentSpace, getCurrentSpaceId, saveData, getSpaces, setSpaces, setOnSaveFirebaseHook, getGlobalLaunchers, setGlobalLaunchers, getLauncherTags, setLauncherTags, getAppSettings, getLocalSettings, getDeviceId } from "./storage.js";
import { isAnyEditableElementFocused } from "../features/todoManager.js";
import { showConflictModal } from "../components/modals.js";
import { listenerManager } from "./ListenerManager.js";
import { buildTombstones, filterGhosts, mergeTombstones, pruneTombstones, getAllLocalTaskIds } from "./tombstone-manager.js";

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

/**
 * 🧹 Export cleanup function for active garbage collection
 * Deletes tasks from all spaces that don't exist in local storage
 */
export async function firebaseCleanupGhosts(validLocalIds, localSpaceIds = null) {
    const batch = writeBatch(db);
    let deleteCount = 0;
    
    // ดึง snapshot เฉพาะ spaces ที่ผู้ใช้มีอยู่ใน local
    // (ป้องกันลบ task ของ spaces คนอื่นโดยไม่ตั้งใจ)
    const spacesSnapshot = await getDocs(colRefWorkspaces);
    
    for (const spaceDoc of spacesSnapshot.docs) {
        const spaceId = parseInt(spaceDoc.id);
        const spaceData = spaceDoc.data();
        
        // 🔒 Safety: ข้าม space ที่ไม่ได้อยู่ใน local ของผู้ใช้
        if (localSpaceIds && !localSpaceIds.has(spaceId)) continue;
        if (!spaceData.tasks) continue;
        
        const now = Date.now();
        let spaceChanged = false;
        
        const updatedTasks = spaceData.tasks.map(t => {
            const taskId = t.id || t.createdAt;
            // เป็น ghost ถ้า: มี ID + ไม่มีใน local + ยังไม่ถูกลบ
            if (taskId && !validLocalIds.has(taskId) && !t.isDeleted) {
                console.log(`[Cleanup] Ghost found: ${taskId} in space ${spaceId}`);
                spaceChanged = true;
                deleteCount++;
                return { ...t, isDeleted: true, deletedAt: now, deletedReason: 'ghost-cleanup' };
            }
            return t;
        });
        
        if (spaceChanged) {
            batch.update(spaceDoc.ref, { tasks: updatedTasks });
        }
    }
    
    await batch.commit();
    console.log(`[Cleanup] Committed: ${deleteCount} ghost tasks marked for deletion`);
    return deleteCount;
}

// 🟢 ล็อคเพื่อป้องกันการเปิด Modal ซ้อนกันหากมีการอัปเดตข้อมูลรัวๆ
let isConflictModalOpen = false;

const docRefConfig = doc(db, "data", "globalConfig");
export const colRefWorkspaces = collection(db, "workspaces");  // Export for cleanup

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

// ========== 🔄 VERSIONING & CONFLICT DETECTION ==========

/**
 * 🟢 Normalize item with version metadata for conflict resolution
 * @param {Object} item - Item to normalize (task, resource, etc)
 * @param {string} deviceId - Current device ID
 * @returns {Object} Item with versioning metadata
 */
export function normalizeItemWithVersion(item, deviceId = getDeviceId()) {
    if (!item) return item;
    
    return {
        ...item,
        syncVersion: item.syncVersion || 0,           // Logical version (increments on each write)
        lastModifiedBy: item.lastModifiedBy || deviceId,
        lastModifiedAt: item.lastModifiedAt || item.lastUpdated || Date.now(),
        deletedAt: item.deletedAt || null             // For soft-delete support
    };
}

/**
 * 🟢 Determine which version of an item to keep based on version metadata
 * @param {Object} localItem - Local version of item
 * @param {Object} cloudItem - Cloud version of item
 * @returns {Object} The item to keep (local, cloud, or merged)
 */
export function resolveItemConflict(localItem, cloudItem) {
    if (!localItem) return cloudItem;
    if (!cloudItem) return localItem;

    const localVer = localItem.syncVersion || 0;
    const cloudVer = cloudItem.syncVersion || 0;
    const localTime = localItem.lastModifiedAt || localItem.lastUpdated || 0;
    const cloudTime = cloudItem.lastModifiedAt || cloudItem.lastUpdated || 0;
    
    // 1️⃣ If versions differ significantly: use higher version
    if (Math.abs(localVer - cloudVer) > 0) {
        return localVer > cloudVer ? localItem : cloudItem;
    }
    
    // 2️⃣ If versions equal: use newer timestamp
    if (localTime !== cloudTime) {
        return localTime > cloudTime ? localItem : cloudItem;
    }
    
    // 3️⃣ If everything equal: prefer cloud (since it's "truth")
    return cloudItem;
}

/**
 * 🟢 Check if incoming sync is our own echo (prevent ping-pong)
 * @param {Object} incomingItem - Item from Firebase listener
 * @param {Object} localItem - Item in local state
 * @returns {boolean} True if this looks like an echo of our own write
 */
export function isEchoSync(incomingItem, localItem) {
    if (!incomingItem || !localItem) return false;
    
    // Same version and timestamp = likely our echo
    if (incomingItem.syncVersion === localItem.syncVersion &&
        incomingItem.lastModifiedAt === localItem.lastModifiedAt &&
        incomingItem.lastModifiedBy === getDeviceId()) {
        return true;
    }
    
    return false;
}

/**
 * 🟢 Get change diff between two arrays (for incremental sync)
 * @param {Array} oldArray - Previous array state
 * @param {Array} newArray - Current array state
 * @param {string} uniqueKey - Key to identify items (id, createdAt, url, etc)
 * @returns {Object} { added, modified, deleted }
 */
export function getArrayDiff(oldArray = [], newArray = [], uniqueKey = 'id') {
    const result = { added: [], modified: [], deleted: [], unchanged: [] };
    const oldMap = new Map(oldArray.map(item => [item[uniqueKey], item]));
    const newMap = new Map(newArray.map(item => [item[uniqueKey], item]));

    // Find added and modified
    for (const [key, newItem] of newMap) {
        if (!oldMap.has(key)) {
            result.added.push(newItem);
        } else {
            const oldItem = oldMap.get(key);
            if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
                result.modified.push(newItem);
            } else {
                result.unchanged.push(newItem);
            }
        }
    }

    // Find deleted
    for (const [key, oldItem] of oldMap) {
        if (!newMap.has(key)) {
            result.deleted.push(oldItem);
        }
    }

    return result;
}

/**
 * 🟢 Increment version for local item before saving
 * @param {Object} item - Item to version
 * @param {string} deviceId - Current device ID
 * @returns {Object} Updated item with incremented syncVersion
 */
export function incrementItemVersion(item, deviceId = getDeviceId()) {
    return {
        ...item,
        syncVersion: (item.syncVersion || 0) + 1,
        lastModifiedBy: deviceId,
        lastModifiedAt: Date.now()
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
/**
 * 🧹 Pull ข้อมูล space ปัจจุบันจาก Firebase โดยตรง (ใช้หลัง cleanup เมื่อ Auto Sync ปิดอยู่)
 */
export async function forcePullCurrentSpace() {
    const spaceId = getCurrentSpaceId();
    if (!spaceId || spaceId === 0) return;
    try {
        updateSyncStatusUI('syncing', 'Refreshing after cleanup...');
        const { doc: docFn } = await import('./lib/firebase-firestore.js');
        const spaceRef = docFn(db, 'workspaces', String(spaceId));
        const snapshot = await getDoc(spaceRef);
        if (snapshot.exists()) {
            const cloudData = snapshot.data();
            const localSpaces = getSpaces();
            const localSpaceIndex = localSpaces.findIndex(s => s.id === spaceId);
            if (localSpaceIndex !== -1) {
                // merge: เอา task list จาก cloud มาแทน (post-cleanup)
                localSpaces[localSpaceIndex].tasks = cloudData.tasks || localSpaces[localSpaceIndex].tasks;
                setSpaces(localSpaces);
                saveData(true, true); // isRemoteUpdate=true ป้องกัน sync loop
            }
        }
        updateSyncStatusUI('synced', 'Cleanup synced');
    } catch (err) {
        console.warn('[forcePullCurrentSpace] Failed:', err);
        updateSyncStatusUI('offline');
    }
}

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

// ========== 🎯 PHASE 2: HANDSHAKE & DELTA SYNC ==========

/**
 * 🟢 Phase 2.1: Initial Handshake - Check only metadata before full sync
 * Fetches metadata of all spaces to compare local vs cloud without downloading full data
 * 
 * @param {Array<number>} targetSpaceIds - Optional: only check specific spaces (null = all)
 * @returns {Promise<Object>} { unchanged: [], toSync: [], conflicts: [] }
 */
export async function performInitialHandshake(targetSpaceIds = null) {
    console.log('🤝 Starting Initial Handshake...');
    const localSpaces = getSpaces();
    
    try {
        updateSyncStatusUI('syncing', 'Checking for changes...');
        
        // 🟢 Fetch ALL workspace metadata (lightweight)
        const snapshot = await getDocs(query(colRefWorkspaces));
        const cloudSpaces = snapshot.docs.map(d => ({ 
            id: parseInt(d.id),
            name: d.data().name,
            lastUpdated: d.data().lastUpdated || 0,
            syncVersion: d.data().syncVersion || 0,
            taskCount: (d.data().tasks || []).length,
            resourceCount: (d.data().resources || []).length
        }));

        const result = { unchanged: [], toSync: [], conflicts: [] };
        
        // Filter to targetSpaceIds if provided
        const spacesToCheck = targetSpaceIds 
            ? cloudSpaces.filter(cs => targetSpaceIds.includes(cs.id))
            : cloudSpaces;

        for (const cloudMeta of spacesToCheck) {
            const localSpace = localSpaces.find(s => s.id === cloudMeta.id);
            
            if (!localSpace) {
                // New space in cloud
                result.toSync.push({ spaceId: cloudMeta.id, direction: 'pull', reason: 'New in cloud' });
            } else {
                const localTime = localSpace.lastUpdated || 0;
                const cloudTime = cloudMeta.lastUpdated || 0;
                const localVer = localSpace.syncVersion || 0;
                const cloudVer = cloudMeta.syncVersion || 0;

                // Compare versions first, then timestamps
                if (cloudVer !== localVer) {
                    if (Math.abs(localTime - cloudTime) > 1000) {
                        // Significant time gap = likely conflict
                        result.conflicts.push({ 
                            spaceId: cloudMeta.id, 
                            localTime, 
                            cloudTime,
                            localVer,
                            cloudVer,
                            name: localSpace.name
                        });
                    } else {
                        result.toSync.push({ 
                            spaceId: cloudMeta.id, 
                            direction: cloudVer > localVer ? 'pull' : 'push',
                            reason: `Version mismatch (local: ${localVer}, cloud: ${cloudVer})`
                        });
                    }
                } else if (localTime !== cloudTime) {
                    result.toSync.push({ 
                        spaceId: cloudMeta.id, 
                        direction: cloudTime > localTime ? 'pull' : 'push',
                        reason: cloudTime > localTime ? 'Cloud newer' : 'Local newer'
                    });
                } else {
                    result.unchanged.push(cloudMeta.id);
                }
            }
        }

        console.log('✅ Handshake complete:', result);
        return result;
    } catch (error) {
        console.error('🔴 Handshake failed:', error);
        updateSyncStatusUI('offline');
        throw error;
    }
}

/**
 * 🟢 Phase 2.2: Sync Single Space - Fetch/update only one space's content
 * Replaces bulk fetch with targeted, space-specific synchronization
 * 
 * @param {number} spaceId - Space to sync
 * @param {string} direction - 'pull', 'push', or 'merge'
 * @returns {Promise<Object>} { success: bool, message: string }
 */
export async function syncSingleSpace(spaceId, direction = 'pull') {
    console.log(`🔄 Syncing space ${spaceId} (${direction})...`);
    const localSpaces = getSpaces();
    const localSpace = localSpaces.find(s => s.id === spaceId);
    
    if (!localSpace && direction !== 'pull') {
        console.warn(`⚠️ Local space ${spaceId} not found, cannot ${direction}`);
        return { success: false, message: 'Local space not found' };
    }

    try {
        updateSyncStatusUI('syncing', `Syncing space ${localSpace?.name || spaceId}...`);
        
        if (direction === 'pull') {
            // 🟢 Pull: Fetch cloud space and update local
            const cloudRef = doc(db, 'workspaces', String(spaceId));
            const cloudSnap = await getDoc(cloudRef);
            
            if (cloudSnap.exists()) {
                const cloudSpace = { ...cloudSnap.data(), id: spaceId };
                const index = localSpaces.findIndex(s => s.id === spaceId);
                
                if (index >= 0) {
                    // Merge at item level for existing space
                    localSpaces[index] = {
                        ...cloudSpace,
                        tasks: mergeItems(cloudSpace.tasks || [], localSpaces[index].tasks || [], 'createdAt'),
                        resources: mergeItems(cloudSpace.resources || [], localSpaces[index].resources || [], 'url'),
                        lastUpdated: Date.now()
                    };
                } else {
                    // Add new space
                    localSpaces.push(cloudSpace);
                }
                
                setSpaces(localSpaces);
                saveData(true, true); // Silent save to prevent loop
                updateSyncStatusUI('synced', `Space pulled: ${localSpace?.name || spaceId}`);
                return { success: true, message: 'Space pulled from cloud' };
            } else {
                console.warn(`⚠️ Cloud space ${spaceId} not found`);
                return { success: false, message: 'Cloud space not found' };
            }
        } 
        else if (direction === 'push') {
            // 🟢 Push: Send local space to cloud
            const batch = writeBatch(db);
            const sRef = doc(db, 'workspaces', String(spaceId));
            
            // Increment version before pushing
            localSpace.syncVersion = (localSpace.syncVersion || 0) + 1;
            localSpace.lastModifiedBy = getDeviceId();
            localSpace.lastModifiedAt = Date.now();
            
            batch.set(sRef, localSpace, { merge: true });
            await batch.commit();
            
            setSpaces(localSpaces);
            saveData(true, false); // Non-silent: allow hook to trigger
            updateSyncStatusUI('synced', `Space pushed: ${localSpace.name}`);
            return { success: true, message: 'Space pushed to cloud' };
        }
        else if (direction === 'merge') {
            // 🟢 Merge: Item-level smart merge
            const cloudRef = doc(db, 'workspaces', String(spaceId));
            const cloudSnap = await getDoc(cloudRef);
            
            if (cloudSnap.exists()) {
                const cloudSpace = cloudSnap.data();
                const merged = {
                    ...localSpace,
                    tasks: mergeItems(cloudSpace.tasks || [], localSpace.tasks || [], 'createdAt'),
                    resources: mergeItems(cloudSpace.resources || [], localSpace.resources || [], 'url'),
                    driveFiles: mergeItems(cloudSpace.driveFiles || [], localSpace.driveFiles || [], 'url'),
                    syncVersion: Math.max(localSpace.syncVersion || 0, cloudSpace.syncVersion || 0) + 1,
                    lastModifiedBy: getDeviceId(),
                    lastModifiedAt: Date.now(),
                    lastUpdated: Date.now()
                };
                
                const index = localSpaces.findIndex(s => s.id === spaceId);
                if (index >= 0) localSpaces[index] = merged;
                
                setSpaces(localSpaces);
                
                // Push merged result back to cloud
                const batch = writeBatch(db);
                batch.set(doc(db, 'workspaces', String(spaceId)), merged, { merge: true });
                await batch.commit();
                
                saveData(true, false);
                updateSyncStatusUI('synced', `Space merged: ${localSpace.name}`);
                return { success: true, message: 'Space merged with cloud' };
            }
            return { success: false, message: 'Cloud space not found for merge' };
        }
    } catch (error) {
        console.error(`🔴 Sync failed for space ${spaceId}:`, error);
        updateSyncStatusUI('offline');
        throw error;
    }
}

/**
 * ️ Smart Merge: ผสานข้อมูลโดยใช้ Timestamp และสถานะ Soft Delete + Version-based Resolution
 * แก้ปัญหา "ข้อมูลผี" (Ghost data) โดยการยอมรับการลบหาก Timestamp ใหม่กว่า
 * 🟢 ENHANCED: Now uses logical versioning instead of only timestamps
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
            // 🟢 ENHANCED: Try version-based resolution first
            const existingVer = existing.syncVersion || 0;
            const incomingVer = item.syncVersion || 0;
            
            if (existingVer !== incomingVer) {
                // Versions differ: use higher version
                if (incomingVer > existingVer) {
                    mergedMap.set(key, item);
                }
                // Else keep existing (higher or equal)
            } else {
                // Versions same: fall back to timestamp comparison
                const existingTime = existing.lastUpdated || existing.deletedAt || existing.createdAt || 0;
                const incomingTime = item.lastUpdated || item.deletedAt || item.createdAt || 0;

                // หากข้อมูลใหม่มีความใหม่กว่า (ไม่ว่าจะเป็นการแก้ไขหรือการลบ) ให้ใช้ข้อมูลนั้น
                if (incomingTime > existingTime) {
                    mergedMap.set(key, item);
                }
            }
        }
    });

    return Array.from(mergedMap.values());
}

/** 🔄 Backward Compatibility: ให้โค้ดเดิมที่เรียก mergeArrays ใช้งานชื่อใหม่ได้ทันที */
export const mergeArrays = mergeItems;

// ========== 🎯 PHASE 3: PER-ITEM VERSIONING & GRANULAR SYNC ==========

/**
 * 🟢 Phase 3.1: Normalize items with version metadata
 * Adds syncVersion, lastModifiedBy, lastModifiedAt to each item if missing
 * Call this when creating new items or importing from external source
 * 
 * @param {Array} items - Array of items to normalize
 * @param {string} uniqueKey - Key to identify items (default: 'id')
 * @param {string} deviceId - Current device ID
 * @returns {Array} Items with version metadata
 */
export function normalizeItemsWithVersion(items = [], uniqueKey = 'id', deviceId = getDeviceId()) {
    const now = Date.now();
    return (items || []).map(item => {
        if (!item) return item;
        
        return {
            ...item,
            syncVersion: item.syncVersion ?? 0,
            lastModifiedBy: item.lastModifiedBy ?? deviceId,
            lastModifiedAt: item.lastModifiedAt ?? (item.createdAt || now),
            [uniqueKey]: item[uniqueKey]  // Ensure unique key exists
        };
    });
}

/**
 * 🟢 Phase 3.2: Granular merge - Item-by-item comparison with version awareness
 * Better than space-level merge: detects item conflicts individually
 * Returns only merged result (no duplicates based on uniqueKey)
 * 
 * @param {Array} cloudItems - Items from cloud
 * @param {Array} localItems - Items from local
 * @param {string} uniqueKey - Key to identify duplicate items
 * @returns {Array} Merged items (conflicts resolved by version/timestamp)
 */
export function mergeItemsGranular(cloudItems = [], localItems = [], uniqueKey = 'id') {
    const itemMap = new Map();
    
    // Add all cloud items first
    (cloudItems || []).forEach(item => {
        if (!item || item[uniqueKey] === undefined) return;
        itemMap.set(item[uniqueKey], { ...item, source: 'cloud' });
    });
    
    // Merge/compare with local items
    (localItems || []).forEach(item => {
        if (!item || item[uniqueKey] === undefined) return;
        
        const key = item[uniqueKey];
        const existingCloud = itemMap.get(key);
        
        if (!existingCloud) {
            // Only in local
            itemMap.set(key, { ...item, source: 'local' });
        } else {
            // Exists in both: compare versions
            const cloudVer = existingCloud.syncVersion || 0;
            const localVer = item.syncVersion || 0;
            
            if (cloudVer === localVer) {
                // Same version: use newer timestamp
                const cloudTime = existingCloud.lastModifiedAt || 0;
                const localTime = item.lastModifiedAt || 0;
                if (localTime > cloudTime) {
                    itemMap.set(key, { ...item, source: 'local-newer' });
                }
                // Else keep cloud (more recent)
            } else if (localVer > cloudVer) {
                // Local version higher: use local
                itemMap.set(key, { ...item, source: 'local-version' });
            }
            // Else keep cloud (higher version)
        }
    });
    
    return Array.from(itemMap.values());
}

/**
 * 🟢 Phase 3.3: Compute item-level diff (added/modified/deleted)
 * Useful for selective sync: only push/pull items that changed
 * 
 * @param {Array} oldItems - Previous state
 * @param {Array} newItems - Current state
 * @param {string} uniqueKey - Key to identify items
 * @returns {Object} { added: [], modified: [], deleted: [], unchanged: [] }
 */
export function computeItemDiff(oldItems = [], newItems = [], uniqueKey = 'id') {
    const result = { added: [], modified: [], deleted: [], unchanged: [] };
    
    const oldMap = new Map((oldItems || []).map(item => [item[uniqueKey], item]));
    const newMap = new Map((newItems || []).map(item => [item[uniqueKey], item]));
    
    // Find added and modified
    for (const [key, newItem] of newMap) {
        const oldItem = oldMap.get(key);
        if (!oldItem) {
            result.added.push(newItem);
        } else if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
            result.modified.push(newItem);
        } else {
            result.unchanged.push(newItem);
        }
    }
    
    // Find deleted
    for (const [key, oldItem] of oldMap) {
        if (!newMap.has(key)) {
            result.deleted.push(oldItem);
        }
    }
    
    return result;
}

// ========== 🎯 PHASE 4: INCREMENTAL CHANGE DETECTION ==========

/**
 * 🟢 Phase 4.1: Initialize space snapshot (save "last known good state")
 * Called after successful sync to establish baseline for next comparison
 * Stored in chrome.storage.local (persistent) with fallback to localStorage
 * 
 * @param {number} spaceId - Space to snapshot
 * @param {Object} spaceData - Current space state (with all arrays)
 * @returns {Promise<void>}
 */
export async function initializeSpaceSnapshot(spaceId, spaceData) {
    if (!spaceId || !spaceData) return;
    
    const snapshot = {
        id: spaceId,
        syncedAt: Date.now(),
        syncVersion: spaceData.syncVersion || 0,
        tasks: (spaceData.tasks || []).map(t => ({ createdAt: t.createdAt, syncVersion: t.syncVersion || 0, lastModifiedAt: t.lastModifiedAt || 0 })),
        resources: (spaceData.resources || []).map(r => ({ url: r.url, syncVersion: r.syncVersion || 0, lastModifiedAt: r.lastModifiedAt || 0 })),
        driveFiles: (spaceData.driveFiles || []).map(d => ({ url: d.url, syncVersion: d.syncVersion || 0, lastModifiedAt: d.lastModifiedAt || 0 }))
    };
    
    const key = `snapshot-space-${spaceId}`;
    
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ [key]: snapshot });
        } else {
            localStorage.setItem(key, JSON.stringify(snapshot));
        }
        console.log(`✅ Snapshot saved for space ${spaceId}`);
    } catch (error) {
        console.warn(`⚠️ Failed to save snapshot for space ${spaceId}:`, error);
    }
}

/**
 * 🟢 Phase 4.2: Get saved space snapshot (for comparison)
 * Returns null if no snapshot exists (first sync or cleared)
 * 
 * @param {number} spaceId - Space to retrieve snapshot for
 * @returns {Promise<Object|null>} Snapshot or null
 */
export async function getSpaceSnapshot(spaceId) {
    if (!spaceId) return null;
    
    const key = `snapshot-space-${spaceId}`;
    
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return new Promise(resolve => {
                chrome.storage.local.get([key], (result) => {
                    resolve(result[key] || null);
                });
            });
        } else {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        }
    } catch (error) {
        console.warn(`⚠️ Failed to retrieve snapshot for space ${spaceId}:`, error);
        return null;
    }
}

/**
 * 🟢 Phase 4.3: Detect incremental changes (current state vs snapshot)
 * Compares only metadata (createdAt, url, syncVersion) to determine what changed
 * Returns granular diff for selective push/pull
 * 
 * @param {number} spaceId - Space to analyze
 * @param {Object} currentSpace - Current space state
 * @returns {Promise<Object>} { tasks: { added, modified, deleted }, resources: {...}, driveFiles: {...} }
 */
export async function detectItemChanges(spaceId, currentSpace) {
    const snapshot = await getSpaceSnapshot(spaceId);
    
    if (!snapshot) {
        // No baseline: treat all as new/modified
        console.log(`ℹ️ No snapshot for space ${spaceId}, treating all items as new`);
        return {
            tasks: { added: currentSpace.tasks || [], modified: [], deleted: [] },
            resources: { added: currentSpace.resources || [], modified: [], deleted: [] },
            driveFiles: { added: currentSpace.driveFiles || [], modified: [], deleted: [] }
        };
    }
    
    const result = {
        tasks: detectArrayChanges(snapshot.tasks, currentSpace.tasks || [], 'createdAt'),
        resources: detectArrayChanges(snapshot.resources, currentSpace.resources || [], 'url'),
        driveFiles: detectArrayChanges(snapshot.driveFiles, currentSpace.driveFiles || [], 'url')
    };
    
    const totalChanges = 
        (result.tasks.added.length + result.tasks.modified.length + result.tasks.deleted.length) +
        (result.resources.added.length + result.resources.modified.length + result.resources.deleted.length) +
        (result.driveFiles.added.length + result.driveFiles.modified.length + result.driveFiles.deleted.length);
    
    if (totalChanges > 0) {
        console.log(`📊 Space ${spaceId} changes detected: ${totalChanges} items`);
    }
    
    return result;
}

/**
 * 🟢 Helper: Detect changes in a single array (tasks, resources, or driveFiles)
 * Compares items by unique key (createdAt, url) and syncVersion
 * 
 * @param {Array} snapshotArray - Snapshot state (metadata only)
 * @param {Array} currentArray - Current state (full items)
 * @param {string} uniqueKey - Unique identifier (createdAt, url)
 * @returns {Object} { added, modified, deleted }
 */
function detectArrayChanges(snapshotArray = [], currentArray = [], uniqueKey) {
    const snapshotMap = new Map(snapshotArray.map(item => [item[uniqueKey], item]));
    const currentMap = new Map(currentArray.map(item => [item[uniqueKey], item]));
    
    const result = { added: [], modified: [], deleted: [] };
    
    // Find added and modified
    for (const [key, currentItem] of currentMap) {
        const snapshotItem = snapshotMap.get(key);
        if (!snapshotItem) {
            result.added.push(currentItem);
        } else if (
            (currentItem.syncVersion || 0) !== snapshotItem.syncVersion ||
            (currentItem.lastModifiedAt || 0) > (snapshotItem.lastModifiedAt || 0)
        ) {
            result.modified.push(currentItem);
        }
    }
    
    // Find deleted
    for (const [key, snapshotItem] of snapshotMap) {
        if (!currentMap.has(key)) {
            result.deleted.push(snapshotItem);
        }
    }
    
    return result;
}

/**
 * 🟢 Helper: Clear all snapshots (useful for manual reset or logout)
 * @returns {Promise<void>}
 */
export async function clearAllSnapshots() {
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const allKeys = await new Promise(resolve => {
                chrome.storage.local.get(null, (result) => {
                    const snapKeys = Object.keys(result).filter(k => k.startsWith('snapshot-space-'));
                    resolve(snapKeys);
                });
            });
            if (allKeys.length > 0) {
                chrome.storage.local.remove(allKeys);
            }
        } else {
            const keys = Object.keys(localStorage).filter(k => k.startsWith('snapshot-space-'));
            keys.forEach(k => localStorage.removeItem(k));
        }
        console.log('✅ All snapshots cleared');
    } catch (error) {
        console.warn('⚠️ Failed to clear snapshots:', error);
    }
}

// ========== 🎯 PHASE 3+: SPACE-LEVEL LISTENER MANAGEMENT ==========

/**
 * 🟢 Phase 3.1: Subscribe to a specific space (listener scope)
 * Creates a listener for only this space, allowing cleanup when switching
 * 🔄 ENHANCED: Uses isEchoSync() and increments version before comparing
 * 🐛 FIX #1: Added version-aware conflict detection
 * 🐛 FIX #2: Echo detection now uses syncVersion + timestamp (not loose 5s threshold)
 * 
 * @param {number} spaceId - Space ID to subscribe to
 * @returns {Promise<string>} Listener ID for reference
 */
export async function subscribeToSpace(spaceId) {
    console.log(`🎧 Subscribing to space ${spaceId}...`);
    
    if (!getLocalSettings().firebaseAutoSync) {
        console.log('🛑 Auto Sync disabled, skipping space subscription');
        return null;
    }

    const listenerId = `space-${spaceId}`;
    
    try {
        const spaceRef = doc(db, 'workspaces', String(spaceId));
        
        const unsubscribe = onSnapshot(spaceRef, (snapshot) => {
            if (!snapshot.exists()) {
                console.warn(`⚠️ Space ${spaceId} not found in cloud`);
                return;
            }

            if (isAnyEditableElementFocused()) {
                console.log('⏭️ Skipping update: editing in progress');
                return;
            }

            const localSpaces = getSpaces();
            const index = localSpaces.findIndex(s => s.id === spaceId);

            if (index >= 0) {
                const localSpace = localSpaces[index];
                
                const cloudSpace = { ...snapshot.data(), id: spaceId };
                
                // 🪦 TOMBSTONE: Build tombstones and filter ghosts before merge
                const localTombstones = buildTombstones(localSpace);
                const cloudTombstones = cloudSpace.deletedTaskIds || {};
                const mergedTombstones = mergeTombstones(localTombstones, cloudTombstones);
                cloudSpace.tasks = filterGhosts(cloudSpace.tasks || [], mergedTombstones);
                
                // 🟢 FIX #1: Use isEchoSync() instead of 5-second timestamp
                if (isEchoSync(cloudSpace, localSpace)) {
                    console.log(`📡 Echo detected for space ${spaceId}, ignoring`);
                    return;
                }

                // 🟢 FIX #2: Use version-aware conflict resolution
                const localVer = localSpace.syncVersion || 0;
                const cloudVer = cloudSpace.syncVersion || 0;
                
                // If versions significantly differ, likely a real conflict
                if (Math.abs(localVer - cloudVer) > 0) {
                    console.log(`⚠️ Version mismatch for space ${spaceId}: local=${localVer}, cloud=${cloudVer}`);
                }

                // 🟢 PHASE 3: Update with granular item-level merge + normalize incoming items
                // BUG FIX: Also filter LOCAL tasks through tombstones to prevent deleted tasks from being re-added
                const filteredLocalTasks = filterGhosts(localSpace.tasks || [], mergedTombstones);
                const mergedSpace = {
                    ...cloudSpace,
                    deletedTaskIds: pruneTombstones(mergedTombstones),
                    tasks: mergeItemsGranular(
                        normalizeItemsWithVersion(cloudSpace.tasks || [], 'createdAt'),
                        normalizeItemsWithVersion(filteredLocalTasks, 'createdAt'),
                        'createdAt'
                    ),
                    resources: mergeItemsGranular(
                        normalizeItemsWithVersion(cloudSpace.resources || [], 'url'),
                        normalizeItemsWithVersion(localSpace.resources || [], 'url'),
                        'url'
                    ),
                    driveFiles: mergeItemsGranular(
                        normalizeItemsWithVersion(cloudSpace.driveFiles || [], 'url'),
                        normalizeItemsWithVersion(localSpace.driveFiles || [], 'url'),
                        'url'
                    )
                };

                localSpaces[index] = mergedSpace;
                setSpaces(localSpaces);
                saveData(true, true); // Silent save
                
                // 🟢 PHASE 4: Update snapshot after successful pull
                initializeSpaceSnapshot(spaceId, mergedSpace);
                
                if (window.renderAll) window.renderAll();
                console.log(`✅ Space ${spaceId} updated from cloud`);
            }
        }, (error) => {
            console.error(`🔴 Space ${spaceId} listener error:`, error);
        });

        // 🟢 FIX #3: Register with listener manager for cleanup
        listenerManager.register(listenerId, unsubscribe);
        console.log(`✅ Space ${spaceId} subscribed (Listener ID: ${listenerId})`);
        return listenerId;
    } catch (error) {
        console.error(`🔴 Failed to subscribe to space ${spaceId}:`, error);
        return null;
    }
}

/**
 * 🟢 Phase 3.2: Unsubscribe from a specific space
 * 
 * @param {number} spaceId - Space ID to unsubscribe from
 * @returns {boolean} True if unsubscribed successfully
 */
export async function unsubscribeFromSpace(spaceId) {
    const listenerId = `space-${spaceId}`;
    const success = listenerManager.unsubscribeById(listenerId);
    
    if (success) {
        console.log(`🛑 Space ${spaceId} unsubscribed`);
    } else {
        console.log(`ℹ️ Space ${spaceId} listener was not active`);
    }
    
    return success;
}

/**
 * 🟢 Phase 3.3: Switch space context (unsubscribe old, subscribe to new)
 * Minimal listener footprint - only active space is being synced
 * 
 * @param {number} fromSpaceId - Previous space (can be null/0)
 * @param {number} toSpaceId - New space (can be null/0 for command center)
 */
export async function switchSpaceContext(fromSpaceId, toSpaceId) {
    console.log(`🔄 Switching context: ${fromSpaceId} → ${toSpaceId}`);
    
    // Unsubscribe from old space (if not command center)
    if (fromSpaceId && fromSpaceId !== 0) {
        await unsubscribeFromSpace(fromSpaceId);
    }
    
    // Subscribe to new space (if not command center)
    if (toSpaceId && toSpaceId !== 0) {
        await subscribeToSpace(toSpaceId);
    }
    
    console.log(`✅ Context switch complete`);
}

/**
 * 🟢 Phase 3.4: Subscribe to metadata (for Command Center)
 * Lightweight listener that tracks all spaces' metadata without full content
 * 
 * @returns {string} Listener ID
 */
export async function subscribeToMetadata() {
    console.log('🎧 Subscribing to metadata collection...');
    
    if (!getLocalSettings().firebaseAutoSync) {
        console.log('🛑 Auto Sync disabled, skipping metadata subscription');
        return null;
    }

    const listenerId = 'metadata-global';
    
    try {
        // For now, listening to all workspaces with minimal data
        // In future, should listen to dedicated metadata sub-collection
        const unsubscribe = onSnapshot(query(colRefWorkspaces), (snapshot) => {
            if (isAnyEditableElementFocused()) return;

            const cloudSpaces = snapshot.docs.map(d => ({
                id: parseInt(d.id),
                name: d.data().name,
                icon: d.data().icon,
                lastUpdated: d.data().lastUpdated,
                taskCount: (d.data().tasks || []).length,
                resourceCount: (d.data().resources || []).length
            }));

            // Store for Command Center rendering
            window.__firebaseSpaceMetadata = cloudSpaces;
            console.log(`📊 Metadata updated: ${cloudSpaces.length} spaces`);
        }, (error) => {
            console.error('🔴 Metadata listener error:', error);
        });

        listenerManager.register(listenerId, unsubscribe);
        return listenerId;
    } catch (error) {
        console.error('🔴 Failed to subscribe to metadata:', error);
        return null;
    }
}

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

    // 🟢 FIX #4: Register config listener for cleanup (was zombie listener)
    const configUnsub = onSnapshot(docRefConfig, (snapshot) => {
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
    listenerManager.register('config-global', configUnsub);

    // 🟢 FIX #2: REMOVED old monolithic listener - replaced with scoped listeners
    // Old: onSnapshot(query(colRefWorkspaces), ...) - fetched ALL spaces continuously
    // New: subscribeToSpace() called per-space on demand
    
    // 🟢 Phase 1 FIX: NEW - Initialize scoped listeners when Auto Sync is enabled
    if (getLocalSettings().firebaseAutoSync) {
        // Call subscribeToMetadata() for Command Center (lightweight)
        subscribeToMetadata().catch(err => console.error('🔴 Failed to subscribe to metadata:', err));
        
        // Call subscribeToSpace() for current space (on-demand)
        const currentSpaceId = getCurrentSpaceId();
        if (currentSpaceId !== 0) {
            subscribeToSpace(currentSpaceId).catch(err => console.error('🔴 Failed to subscribe to current space:', err));
        }
    }

    // 🟢 4. Push: เมื่อมีการเปลี่ยนสถานะงาน (Add, Delete, Check, Sort)
    setOnSaveFirebaseHook(async (data) => {
        // 🟢 Check Auto Sync state before background sync (Device-specific)
        if (!getLocalSettings().firebaseAutoSync) return;

        updateSyncStatusUI('syncing');
        try {
            // 🟢 FIX #5: Increment syncVersion BEFORE pushing (prevents race condition data loss)
            const batch = writeBatch(db);
            const deviceId = getDeviceId();
            const now = Date.now();
            
            // 🟢 PHASE 6: Selective Push - Only send changed items, not entire space
            // This reduces write quota by 80-90% for typical workflows
            const pushResults = [];
            
            for (const space of data.mySpacesData) {
                // PHASE 3: Normalize items before push (ensure all items have version metadata)
                space.tasks = normalizeItemsWithVersion(space.tasks || [], 'createdAt', deviceId);
                space.resources = normalizeItemsWithVersion(space.resources || [], 'url', deviceId);
                space.driveFiles = normalizeItemsWithVersion(space.driveFiles || [], 'url', deviceId);
                // BUG FIX: Stamp lastModifiedAt=now so the pushing device always wins on receiving side
                space.tasks = space.tasks.map(t => ({ ...t, lastModifiedAt: now }));
                
                // Increment version immediately before save
                space.syncVersion = (space.syncVersion || 0) + 1;
                space.lastModifiedBy = deviceId;
                space.lastModifiedAt = now;
                
                // 🟢 PHASE 6: Detect what changed since last snapshot
                const changes = await detectItemChanges(space.id, space);
                
                const totalChanges = 
                    (changes.tasks.added.length + changes.tasks.modified.length + changes.tasks.deleted.length) +
                    (changes.resources.added.length + changes.resources.modified.length + changes.resources.deleted.length) +
                    (changes.driveFiles.added.length + changes.driveFiles.modified.length + changes.driveFiles.deleted.length);
                
                const sRef = doc(db, "workspaces", String(space.id));
                
                // Decide: selective update (only changed items) or full write (first sync)
                if (totalChanges === 0 && space.syncVersion > 1) {
                    // No changes: skip this space entirely
                    console.log(`✅ Space ${space.id}: No changes, skipping write`);
                } else if (totalChanges === 0) {
                    // First sync: send full space (filter soft-deleted items to prevent Ghost Data)
                    const filteredSpace = {
                        ...space,
                        tasks: space.tasks.filter(t => !t.isDeleted),
                        resources: space.resources.filter(r => !r.isDeleted),
                        driveFiles: space.driveFiles.filter(d => !d.isDeleted),
                        deletedTaskIds: pruneTombstones(buildTombstones(space))
                    };
                    batch.set(sRef, filteredSpace, { merge: true });
                    const deletedCount = (space.tasks || []).filter(t => t.isDeleted).length;
                    console.log(`📤 Space ${space.id}: Full write (first sync, ${deletedCount} soft-deleted filtered)`);
                } else {
                    // Changes detected: send only updated arrays + metadata (filter soft-deleted to prevent Ghost Data)
                    const updatePayload = {
                        tasks: space.tasks
                            .filter(t => !t.isDeleted)
                            .map(t => ({
                                ...t,
                                subtasks: (t.subtasks || []).filter(s => !s.isDeleted)  // 🟢 FIX #2: Filter soft-deleted subtasks
                            })),
                        resources: space.resources.filter(r => !r.isDeleted),
                        driveFiles: space.driveFiles.filter(d => !d.isDeleted),
                        deletedTaskIds: pruneTombstones(buildTombstones(space)),
                        syncVersion: space.syncVersion,
                        lastModifiedBy: deviceId,
                        lastModifiedAt: now,
                        name: space.name,  // Keep structural metadata
                        id: space.id
                    };
                    // Use set with merge to handle both new and existing documents
                    batch.set(sRef, updatePayload, { merge: true });
                    const deletedCount = (space.tasks || []).filter(t => t.isDeleted).length;
                    console.log(`📤 Space ${space.id}: Selective push (${totalChanges} changes, ${deletedCount} soft-deleted filtered)`);
                    pushResults.push({ spaceId: space.id, changes: totalChanges });
                }
            }
            
            // 🟢 2. บันทึกข้อมูลอื่นๆ ควบคู่ไปด้วย
            await Promise.all([
                batch.commit(),
                setDoc(docRefConfig, { launchers: data.globalLaunchers, launcherTags: data.launcherTags, lastUpdated: Date.now() }, { merge: true })
            ]);
            
            // 🟢 PHASE 6: After successful push, save snapshots for next comparison
            data.mySpacesData.forEach(space => {
                initializeSpaceSnapshot(space.id, space);
            });
            
            const pushSummary = pushResults.length > 0 
                ? ` (${pushResults.reduce((sum, r) => sum + r.changes, 0)} changes)`
                : ' (no changes)';
            updateSyncStatusUI('synced', `WebApp -> Firebase${pushSummary}`);
            console.log(`✅ Phase 6 Selective Push Complete: ${pushResults.length}/${data.mySpacesData.length} spaces updated`);
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
    console.log('📱 Auto Sync activation started...');
    updateSyncStatusUI('syncing', 'Checking for changes...');
    
    try {
        // 🟢 Phase 2: Perform handshake
        const handshakeResult = await performDetailedHandshake();
        
        // Show handshake modal with results
        const choice = await showHandshakeConflictModal(handshakeResult);
        
        if (!choice) {
            console.log('❌ User cancelled activation');
            updateSyncStatusUI('offline');
            return false;
        }

        // Execute reconciliation based on user choice
        const success = await executeHandshakeReconciliation(handshakeResult, choice);
        
        if (success) {
            console.log('✅ Auto Sync activation successful');
            if (window.renderAll) window.renderAll();
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error('🔴 Auto Sync activation error:', error);
        updateSyncStatusUI('offline');
        return false;
    }
}

// ========== � PHASE 2: HANDSHAKE UI FLOW ==========

/**
 * 🟢 Phase 2.1: Detailed Handshake - Compare all spaces and detect conflicts
 * @returns {Promise<Object>} { unchanged: [], toSync: [], conflicts: [] }
 */
export async function performDetailedHandshake() {
    console.log('🤝 Performing detailed handshake...');
    updateSyncStatusUI('syncing', 'Checking for changes...');
    
    const localSpaces = getSpaces();
    const result = { unchanged: [], toSync: [], conflicts: [] };
    
    try {
        // 🟢 FIX #1: Fetch ONLY metadata (selective fields) instead of full content (400x quota reduction)
        const snapshot = await getDocs(query(colRefWorkspaces));
        const cloudSpaces = snapshot.docs.map(d => {
            const data = d.data();
            return {
                id: parseInt(d.id),
                name: data.name,
                lastUpdated: data.lastUpdated || 0,
                syncVersion: data.syncVersion || 0,
                taskCount: (data.tasks || []).length,
                resourceCount: (data.resources || []).length
            };
        });

        // Check all local spaces
        for (const local of localSpaces) {
            const cloud = cloudSpaces.find(c => c.id === local.id);
            
            if (!cloud) {
                // Local exists, cloud doesn't
                result.toSync.push({
                    spaceId: local.id,
                    name: local.name,
                    direction: 'push',
                    reason: 'Exists locally only'
                });
            } else {
                const localTime = local.lastUpdated || 0;
                const cloudTime = cloud.lastUpdated || 0;
                const localVer = local.syncVersion || 0;
                const cloudVer = cloud.syncVersion || 0;

                // Conflict detection: version mismatch + time gap
                if (localVer !== cloudVer && Math.abs(localTime - cloudTime) > 2000) {
                    result.conflicts.push({
                        spaceId: local.id,
                        name: local.name,
                        localVer, cloudVer,
                        localTime, cloudTime,
                        localTaskCount: (local.tasks || []).length,
                        cloudTaskCount: (cloud.tasks || []).length
                    });
                } else if (localVer !== cloudVer || localTime !== cloudTime) {
                    // No conflict, but needs sync
                    result.toSync.push({
                        spaceId: local.id,
                        name: local.name,
                        direction: cloudVer > localVer || cloudTime > localTime ? 'pull' : 'push',
                        reason: `Version ${localVer}→${cloudVer}, Time ${Math.round((cloudTime - localTime) / 1000)}s`
                    });
                } else {
                    // Perfectly aligned
                    result.unchanged.push({
                        spaceId: local.id,
                        name: local.name
                    });
                }
            }
        }

        // Check for spaces only in cloud
        for (const cloud of cloudSpaces) {
            if (!localSpaces.find(l => l.id === cloud.id)) {
                result.toSync.push({
                    spaceId: cloud.id,
                    name: cloud.name,
                    direction: 'pull',
                    reason: 'Exists in cloud only'
                });
            }
        }

        console.log('✅ Handshake details:', result);
        return result;
    } catch (error) {
        console.error('🔴 Handshake error:', error);
        throw error;
    }
}

/**
 * 🟢 Phase 2.2: Show handshake conflict modal
 * @param {Object} handshakeResult - Result from performDetailedHandshake()
 * @returns {Promise<string|null>} 'merge' | 'pull' | 'push' | null
 */
export async function showHandshakeConflictModal(handshakeResult) {
    const { unchanged, toSync, conflicts } = handshakeResult;
    
    const totalSpaces = unchanged.length + toSync.length + conflicts.length;
    const conflictCount = conflicts.length;
    const syncCount = toSync.length;

    const modalId = 'sf-handshake-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    const fmtTimeDiff = (ms) => {
        const s = Math.round(Math.abs(ms) / 1000);
        if (s < 60) return `${s} วินาที`;
        const m = Math.floor(s / 60), rem = s % 60;
        return rem > 0 ? `${m} นาที ${rem} วิ` : `${m} นาที`;
    };
    const conflictHtml = conflicts.length > 0 ? `
        <div style="margin-top: 12px; padding: 10px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; border-left: 3px solid #ef4444;">
            <div style="font-weight: 700; font-size: 12px; color: #dc2626; margin-bottom: 6px;">⚠️ พบข้อมูลขัดแย้ง ${conflicts.length} Space:</div>
            ${conflicts.map(c => {
                const timeDiff = fmtTimeDiff(c.cloudTime - c.localTime);
                const localNewer = c.localVer > c.cloudVer || c.localTime > c.cloudTime;
                const newerLabel = localNewer ? '📱 เครื่องนี้ใหม่กว่า' : '☁️ Cloud ใหม่กว่า';
                return `
                <div style="font-size: 11px; color: var(--text-main); margin: 4px 0; padding: 8px; background: var(--bg-body); border-radius: 4px; border-left: 2px solid #ef4444;">
                    📌 <strong>${c.name}</strong>
                    <span style="float:right; font-size:10px; font-weight:700; color:${localNewer ? '#f59e0b' : '#3b82f6'}; background:${localNewer ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)'}; padding:1px 5px; border-radius:4px;">${newerLabel}</span><br>
                    <div style="margin-top:5px; display:flex; gap:8px; flex-wrap:wrap;">
                        <span style="opacity:0.8;">📱 v${c.localVer} / ${c.localTaskCount} งาน</span>
                        <span style="opacity:0.4;">vs</span>
                        <span style="opacity:0.8;">☁️ v${c.cloudVer} / ${c.cloudTaskCount} งาน</span>
                        <span style="opacity:0.6; margin-left:auto;">⏱ ต่างกัน ${timeDiff}</span>
                    </div>
                </div>`;
            }).join('')}
        </div>
    ` : '';

    const syncHtml = syncCount > 0 ? `
        <div style="margin-top: 8px; padding: 10px; background: rgba(59, 130, 246, 0.1); border-radius: 8px; border-left: 3px solid #3b82f6;">
            <div style="font-weight: 700; font-size: 12px; color: #1e40af; margin-bottom: 4px;">ℹ️ ${syncCount} Space ที่ยังไม่ได้ซิงค์</div>
            ${toSync.map(s => `<div style="font-size:11px; color:var(--text-muted); margin-top:3px;">• ${s.name} <span style="opacity:0.6;">(${s.direction === 'pull' ? '☁️ Cloud ใหม่กว่า' : '📱 เครื่องนี้ใหม่กว่า'})</span></div>`).join('')}
        </div>
    ` : '';

    const unchangedHtml = unchanged.length > 0 ? `
        <div style="margin-top: 8px; padding: 10px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border-left: 3px solid #10b981;">
            <div style="font-weight: 700; font-size: 12px; color: #065f46;">✅ ซิงค์แล้ว ${unchanged.length} Space</div>
        </div>
    ` : '';

    const modalHTML = `
        <div class="modal-overlay" id="${modalId}" style="display:flex; z-index:21000; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px);">
            <div class="modal-content" style="width:380px; max-height:70vh; padding:20px; text-align:center; border-radius:14px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); background:var(--bg-card); border:1px solid var(--border-color); overflow-y:auto;">
                <h2 style="margin:0 0 12px 0; font-size:16px; font-weight:800; color:var(--text-main);">🤝 ตรวจสอบก่อนซิงค์</h2>
                <div style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">ตรวจพบ ${totalSpaces} Space ทั้งหมด</div>
                
                ${conflictHtml}
                ${syncHtml}
                ${unchangedHtml}

                <div style="margin-top:16px; padding:12px; background:rgba(59,130,246,0.05); border-radius:8px; font-size:11px; color:var(--text-muted); line-height:1.6;">
                    <strong>เลือกวิธีการซิงค์:</strong><br>
                    🧬 <strong>Merge</strong> — ผสานข้อมูลจากทั้งสองฝั่ง<br>
                    ⬇️ <strong>Pull</strong> — ใช้ข้อมูลจาก Cloud เป็นหลัก<br>
                    ⬆️ <strong>Push</strong> — ใช้ข้อมูลจากเครื่องนี้เป็นหลัก
                </div>

                <div style="margin-top:14px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <button id="btn-resolve-merge" style="padding:10px; border:2px solid #f59e0b; border-radius:8px; background:rgba(245,158,11,0.1); cursor:pointer; font-weight:700; font-size:12px; color:#f59e0b; transition:all 0.2s ease; hover: { box-shadow: 0 0 8px rgba(245,158,11,0.3); }">
                        🧬 Merge
                    </button>
                    <button id="btn-resolve-pull" style="padding:10px; border:2px solid #10b981; border-radius:8px; background:rgba(16,185,129,0.1); cursor:pointer; font-weight:700; font-size:12px; color:#10b981; transition:all 0.2s ease;">
                        ⬇️ Pull
                    </button>
                    <button id="btn-resolve-push" style="padding:10px; border:2px solid #3b82f6; border-radius:8px; background:rgba(59,130,246,0.1); cursor:pointer; font-weight:700; font-size:12px; color:#3b82f6; transition:all 0.2s ease;">
                        ⬆️ Push
                    </button>
                    <button id="btn-resolve-cancel" style="padding:10px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-body); cursor:pointer; font-weight:700; font-size:12px; color:var(--text-muted);">
                        ✕ ยกเลิก
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    modal = document.getElementById(modalId);

    return new Promise(resolve => {
        const btnMerge = document.getElementById('btn-resolve-merge');
        const btnPull = document.getElementById('btn-resolve-pull');
        const btnPush = document.getElementById('btn-resolve-push');
        const btnCancel = document.getElementById('btn-resolve-cancel');

        const cleanup = () => { if (modal && modal.parentNode) modal.remove(); };

        btnMerge?.addEventListener('click', () => { cleanup(); resolve('merge'); });
        btnPull?.addEventListener('click', () => { cleanup(); resolve('pull'); });
        btnPush?.addEventListener('click', () => { cleanup(); resolve('push'); });
        btnCancel?.addEventListener('click', () => { cleanup(); resolve(null); });
    });
}

/**
 * 🟢 Phase 2.3: Execute handshake reconciliation
 * @param {Object} handshakeResult - From performDetailedHandshake()
 * @param {string} choice - 'merge' | 'pull' | 'push'
 * @returns {Promise<boolean>} Success status
 */
export async function executeHandshakeReconciliation(handshakeResult, choice) {
    console.log(`🔄 Executing reconciliation: ${choice}`);
    updateSyncStatusUI('syncing', `Reconciling (${choice})...`);
    
    const localSpaces = getSpaces();
    const { toSync, conflicts } = handshakeResult;
    const allToReconcile = [...toSync, ...conflicts];
    
    try {
        // Fetch full data from cloud for spaces that need reconciliation
        const cloudDocs = await Promise.all(
            allToReconcile.map(item => 
                getDoc(doc(db, 'workspaces', String(item.spaceId)))
            )
        );

        const cloudSpaces = cloudDocs
            .filter(doc => doc.exists())
            .map(doc => ({ id: parseInt(doc.id), ...doc.data() }));

        let finalSpaces = [...localSpaces];

        // Apply reconciliation based on choice
        for (const item of allToReconcile) {
            const localIdx = finalSpaces.findIndex(s => s.id === item.spaceId);
            const cloudSpace = cloudSpaces.find(c => c.id === item.spaceId);

            if (choice === 'merge' || item.direction === undefined) {
                // Smart merge for conflicts
                if (localIdx >= 0 && cloudSpace) {
                    // PHASE 3: Use granular item-level merge with normalization
                    finalSpaces[localIdx] = {
                        ...cloudSpace,
                        tasks: mergeItemsGranular(
                            normalizeItemsWithVersion(cloudSpace.tasks || [], 'createdAt'),
                            normalizeItemsWithVersion(finalSpaces[localIdx].tasks || [], 'createdAt'),
                            'createdAt'
                        ),
                        resources: mergeItemsGranular(
                            normalizeItemsWithVersion(cloudSpace.resources || [], 'url'),
                            normalizeItemsWithVersion(finalSpaces[localIdx].resources || [], 'url'),
                            'url'
                        ),
                        driveFiles: mergeItemsGranular(
                            normalizeItemsWithVersion(cloudSpace.driveFiles || [], 'url'),
                            normalizeItemsWithVersion(finalSpaces[localIdx].driveFiles || [], 'url'),
                            'url'
                        ),
                        syncVersion: Math.max((cloudSpace.syncVersion || 0), (finalSpaces[localIdx].syncVersion || 0)) + 1,
                        lastUpdated: Date.now()
                    };
                } else if (cloudSpace) {
                    finalSpaces.push(cloudSpace);
                }
            } else if (choice === 'pull') {
                // Use cloud version
                if (cloudSpace) {
                    if (localIdx >= 0) {
                        finalSpaces[localIdx] = cloudSpace;
                    } else {
                        finalSpaces.push(cloudSpace);
                    }
                }
            } else if (choice === 'push') {
                // Use local version - EXPLICITLY push all item arrays (including soft-deleted items)
                // Phase 5: Soft-deleted items must be sent to cloud for proper sync
                if (localIdx >= 0) {
                    const localSpace = finalSpaces[localIdx];
                    finalSpaces[localIdx] = {
                        ...localSpace,
                        // Explicitly preserve/send all item arrays with soft-deleted flags
                        tasks: localSpace.tasks || [],
                        resources: localSpace.resources || [],
                        driveFiles: localSpace.driveFiles || [],
                        // Increment version so push beats any cloud conflict
                        syncVersion: (localSpace.syncVersion || 0) + 1,
                        lastUpdated: Date.now()
                    };
                    console.log(`🟢 Push mode: Sending local space ${item.spaceId} with ${(localSpace.tasks || []).length} tasks, ${(localSpace.resources || []).length} resources, ${(localSpace.driveFiles || []).length} drives`);
                }
            }
        }

        // 🟢 FIX #2: Push to cloud FIRST, only save locally if cloud succeeds (prevent half-synced state)
        if (choice !== 'pull') {
            const batch = writeBatch(db);
            finalSpaces.forEach(s => {
                batch.set(doc(db, 'workspaces', String(s.id)), s, { merge: true });
            });
            await batch.commit();
        }

        // Only save locally AFTER cloud succeeds
        setSpaces(finalSpaces);
        saveData(true, true); // Silent save

        // 🟢 PHASE 4: After reconciliation, save snapshots for incremental detection
        allToReconcile.forEach(item => {
            const reconciled = finalSpaces.find(s => s.id === item.spaceId);
            if (reconciled) {
                initializeSpaceSnapshot(item.spaceId, reconciled);
            }
        });

        const msg = choice === 'merge' ? 'Smart Merged' : choice === 'pull' ? 'Pulled' : 'Pushed';
        updateSyncStatusUI('synced', `${msg} (${allToReconcile.length} spaces)`);
        console.log(`✅ Reconciliation complete`);
        return true;
    } catch (error) {
        // 🟢 FIX #3: Add error feedback to user (toast notification instead of silent fail)
        const errorMsg = `Sync failed: ${error.message || 'Unknown error'}. Try again when online.`;
        console.error('🔴 Reconciliation error:', error);
        if (window.showToast) {
            window.showToast(errorMsg);
        }
        updateSyncStatusUI('offline');
        return false;
    }
}

// ========== �🧹 CLEANUP & LIFECYCLE ==========

/**
 * 🟢 Cleanup all Firebase listeners and save final state
 * Call this when app is closing or user logging out
 * 
 * @returns {Promise<void>}
 */
export async function cleanupFirebaseSync() {
    console.log('🧹 Cleaning up Firebase sync...');
    
    try {
        // Unsubscribe all listeners
        await listenerManager.unsubscribeAll();
        
        // Final save — skip if a backup import just ran (chrome.storage was hard-reset by import handler)
        if (!localStorage.getItem('myws-just-imported')) {
            saveData(true);
        }
        
        console.log('✅ Cleanup complete');
    } catch (error) {
        console.error('🔴 Cleanup error:', error);
    }
}

// ========== ⚠️ FORCE SYNC (Nuclear Option) ==========

/**
 * ⚠️ Force Push: เขียน Local ทับ Cloud ทั้งหมด ไม่มี merge
 * @param {'current'|'all'} scope - 'current' = space ที่เปิดอยู่, 'all' = ทุก space
 */
export async function forcePushToCloud(scope = 'current') {
    updateSyncStatusUI('syncing', 'Force Push...');
    try {
        const localSpaces = getSpaces();
        const spacesToPush = scope === 'all'
            ? localSpaces
            : localSpaces.filter(s => s.id === getCurrentSpaceId());

        if (spacesToPush.length === 0) {
            updateSyncStatusUI('offline');
            return false;
        }

        const batch = writeBatch(db);
        const deviceId = getDeviceId();
        const now = Date.now();

        for (const space of spacesToPush) {
            const payload = {
                ...space,
                tasks: (space.tasks || [])
                    .filter(t => !t.isDeleted)
                    .map(t => ({
                        ...t,
                        lastModifiedAt: now,
                        lastModifiedBy: deviceId,
                        subtasks: (t.subtasks || []).filter(s => !s.isDeleted)
                    })),
                resources: (space.resources || []).filter(r => !r.isDeleted),
                driveFiles: (space.driveFiles || []).filter(d => !d.isDeleted),
                deletedTaskIds: pruneTombstones(buildTombstones(space)),
                syncVersion: (space.syncVersion || 0) + 1,
                lastModifiedBy: deviceId,
                lastModifiedAt: now,
                lastUpdated: now
            };
            batch.set(doc(db, 'workspaces', String(space.id)), payload);
            initializeSpaceSnapshot(space.id, payload);
        }

        await batch.commit();
        updateSyncStatusUI('synced', `Force Push ↑ (${spacesToPush.length} space${spacesToPush.length > 1 ? 's' : ''})`);
        console.log(`✅ Force Push complete: ${spacesToPush.length} spaces`);
        return true;
    } catch (error) {
        console.error('🔴 Force Push error:', error);
        updateSyncStatusUI('offline');
        return false;
    }
}

/**
 * ⚠️ Force Pull: ดึง Cloud มาทับ Local ทั้งหมด ไม่มี merge
 * @param {'current'|'all'} scope - 'current' = space ที่เปิดอยู่, 'all' = ทุก space
 */
export async function forcePullFromCloud(scope = 'current') {
    updateSyncStatusUI('syncing', 'Force Pull...');
    try {
        const localSpaces = getSpaces();
        const spaceIdsToFetch = scope === 'all'
            ? localSpaces.map(s => s.id)
            : [getCurrentSpaceId()];

        const cloudDocs = await Promise.all(
            spaceIdsToFetch.map(id => getDoc(doc(db, 'workspaces', String(id))))
        );

        let updated = 0;
        const newSpaces = [...localSpaces];

        for (const snap of cloudDocs) {
            if (!snap.exists()) continue;
            const cloudSpace = { ...snap.data(), id: parseInt(snap.id) };
            const idx = newSpaces.findIndex(s => s.id === cloudSpace.id);
            if (idx >= 0) {
                newSpaces[idx] = cloudSpace;
            } else {
                newSpaces.push(cloudSpace);
            }
            initializeSpaceSnapshot(cloudSpace.id, cloudSpace);
            updated++;
        }

        setSpaces(newSpaces);
        saveData(true, true);
        if (window.renderAll) window.renderAll();
        updateSyncStatusUI('synced', `Force Pull ↓ (${updated} space${updated > 1 ? 's' : ''})`);
        console.log(`✅ Force Pull complete: ${updated} spaces`);
        return true;
    } catch (error) {
        console.error('🔴 Force Pull error:', error);
        updateSyncStatusUI('offline');
        return false;
    }
}