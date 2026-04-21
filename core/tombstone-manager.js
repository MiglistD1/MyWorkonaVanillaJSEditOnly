// ============================================================
// TOMBSTONE MANAGER - Ghost Data Prevention (Industry Standard)
// "งานตายแล้วต้องมีใบมรณบัตร"
// ============================================================

// 🔒 Option 2: In-Memory tracking - ป้องกันอัตโนมัติ (ไม่ต้องรอ localStorage save)
let maintenanceModeActive = false;
const recentlyDeletedInSession = new Map();

export function toggleMaintenanceMode(isActive) {
    maintenanceModeActive = isActive;
    if (!isActive) recentlyDeletedInSession.clear();
}

export function isMaintenanceModeActive() {
    return maintenanceModeActive;
}

export function addRecentlyDeleted(taskId) {
    if (taskId !== undefined && taskId !== null) {
        recentlyDeletedInSession.set(taskId, Date.now());
    }
}

export function getRecentlyDeletedIds() {
    return Object.fromEntries(recentlyDeletedInSession);
}

export function buildTombstones(localSpace) {
    const tombstones = { ...(localSpace.deletedTaskIds || {}) };
    (localSpace.tasks || []).forEach(t => {
        if (t.isDeleted && t.deletedAt) {
            const id = t.id || t.createdAt;
            if (id !== undefined) {
                tombstones[id] = Math.max(tombstones[id] || 0, t.deletedAt);
            }
        }
    });
    return tombstones;
}

export function filterGhosts(cloudTasks, tombstones) {
    if (!cloudTasks || !tombstones) return cloudTasks || [];
    
    // Merge tombstones จาก 2 แหล่ง:
    // 1. Saved tombstones (จาก Firebase/localStorage) 
    // 2. In-memory recent deletes (ยังไม่รอ save เสร็จ)
    const recentDeleted = getRecentlyDeletedIds();
    const allTombstones = { ...tombstones, ...recentDeleted };
    
    return cloudTasks.filter(task => {
        const id = task.id || task.createdAt;
        const deletedAt = allTombstones[id];
        if (!deletedAt) return true; // ไม่มีในบัญชีดำ → ผ่าน
        // Tombstone wins unconditionally.
        // NOTE: The old "taskUpdatedAt > deletedAt" bypass was removed because the push hook
        // stamps ALL tasks with lastModifiedAt=now on every push, which caused concurrent
        // pushes from other devices to bypass the tombstone and resurrect deleted tasks.
        // Tasks genuinely recreated after deletion always get a new createdAt key anyway.
        console.log(`👻 Ghost Task Blocked: ${id}`);
        return false; // ผี → เตะทิ้ง
    });
}

export function mergeTombstones(local, cloud) {
    const merged = { ...(cloud || {}) };
    Object.entries(local || {}).forEach(([id, ts]) => {
        merged[id] = Math.max(merged[id] || 0, ts);
    });
    return merged;
}

export function pruneTombstones(tombstones, maxAgeDays = 90) {
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    const pruned = {};
    Object.entries(tombstones || {}).forEach(([id, ts]) => {
        if (ts > cutoff) pruned[id] = ts;
    });
    return pruned;
}

/**
 * 🧹 Active Cleanup: ดึง task IDs ทั้งหมดจาก localStorage
 * และส่งให้ sync system filter ออก ghost tasks ที่ไม่มีใน local
 */
export function getAllLocalTaskIds(spaces) {
    const allIds = new Set();
    (spaces || []).forEach(space => {
        (space.tasks || []).forEach(task => {
            const taskId = task.id || task.createdAt;
            if (taskId !== undefined) allIds.add(taskId);
            // รวม subtask IDs ด้วย
            (task.subtasks || []).forEach(sub => {
                const subId = sub.id || sub.createdAt;
                if (subId !== undefined) allIds.add(subId);
            });
        });
    });
    return allIds;
}

/**
 * 🧹 Cleanup Mode: Mark all task IDs not in local as "delete-on-next-sync"
 * ผลลัพธ์: ghost tasks ถูกทำให้ isDeleted=true พร้อมลบออกจาก Firebase
 */
export function markGhostsForCleanup(localSpaces) {
    const localIds = getAllLocalTaskIds(localSpaces);
    // เก็บ Space IDs ที่ผู้ใช้มีจริงๆ เพื่อรัวยามตั้งค่า cleanup ไม่ให้ยุ่งเกิน scope
    const localSpaceIds = new Set((localSpaces || []).map(s => s.id));
    const result = {
        validIds: localIds,
        localSpaceIds,
        timestamp: Date.now()
    };
    return result;
}