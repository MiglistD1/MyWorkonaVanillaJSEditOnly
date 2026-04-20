// ============================================================
// MAINTENANCE BUTTON - "Edit Safe Zone"
// Option 1: Manual Gate — ผู้ใช้กด lock ก่อน bulk edit แล้วปล่อย
// ============================================================

import {
    toggleMaintenanceMode,
    isMaintenanceModeActive,
    addRecentlyDeleted,
    markGhostsForCleanup
} from "./tombstone-manager.js";

// ----- State -----
let _button = null;
let _isBusy = false; // ป้องกัน double-click ขณะ transition

// ----- Button States -----
const STATES = {
    normal: {
        label: "🧹 ล้างความสะอาด Ghost Data",
        title: "กดเพื่อลบ task ที่ติดค้างใน Cloud — งานที่ไม่มีใน app ของคุณ",
        color: "#10b981",         // green
        hoverColor: "#059669",
        textColor: "#ffffff",
        border: "1.5px solid #10b981"
    },
    cleaning: {
        label: "🔄 กำลังล้างความสะอาด...",
        title: "กำลังตรวจสอบและลบ ghost tasks จาก Cloud...",
        color: "#f59e0b",         // amber
        hoverColor: "#d97706",
        textColor: "#ffffff",
        border: "1.5px solid #f59e0b"
    },
    success: {
        label: "✅ สะอาดแล้ว!",
        title: "Ghost data ถูกลบสำเร็จ",
        color: "#3b82f6",         // blue
        hoverColor: "#2563eb",
        textColor: "#ffffff",
        border: "1.5px solid #3b82f6"
    },
    error: {
        label: "❌ ล้มเหลว",
        title: "เกิดข้อผิดพลาดในการล้างความสะอาด",
        color: "#ef4444",         // red
        hoverColor: "#dc2626",
        textColor: "#ffffff",
        border: "1.5px solid #ef4444"
    }
};

// ----- Apply visual state to button -----
function applyState(btn, stateName) {
    const s = STATES[stateName];
    btn.textContent = s.label;
    btn.title = s.title;
    btn.dataset.state = stateName;
    btn.style.background = s.color;
    btn.style.border = s.border;
    btn.style.color = s.textColor;
    btn.style.opacity = (stateName === "activating" || stateName === "saving") ? "0.85" : "1";
    btn.style.cursor = (stateName === "activating" || stateName === "saving") ? "not-allowed" : "pointer";
    // Hover effect via CSS class
    btn.dataset.hoverColor = s.hoverColor;
}

// ----- Create the button DOM element -----
export function createMaintenanceButton() {
    const btn = document.createElement("button");
    btn.id = "btn-edit-safe-zone";
    btn.style.cssText = `
        font-size: 11px;
        font-weight: 700;
        padding: 5px 10px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s ease, opacity 0.2s ease, transform 0.1s ease;
        white-space: nowrap;
        letter-spacing: 0.2px;
    `;

    applyState(btn, "normal");

    // Hover effect
    btn.addEventListener("mouseenter", () => {
        if (!_isBusy) btn.style.background = btn.dataset.hoverColor;
    });
    btn.addEventListener("mouseleave", () => {
        const s = STATES[btn.dataset.state];
        if (s) btn.style.background = s.color;
    });

    // Click handler — ACTIVE CLEANUP MODE
    btn.addEventListener("click", async () => {
        if (_isBusy) return;
        
        _isBusy = true;
        applyState(btn, "cleaning");
        btn.style.transform = "scale(1.03)";

        try {
            // 1. ดึง local spaces
            const { getSpaces } = await import("./storage.js");
            const localSpaces = getSpaces();
            
            // 2. ทำ mark ghosts เพื่อล้าง
            const cleanupData = markGhostsForCleanup(localSpaces);
            console.log("[CleanupMode] Found local tasks:", cleanupData.validIds.size);
            
            // 3. เรียก cleanup ผ่าน Firebase sync system
            if (typeof window._performGhostCleanup === "function") {
                await window._performGhostCleanup(cleanupData);
            }
            
            // 4. บันทึกข้อมูลและรีฟเรชเพื่อตรวจสอบผล
            if (typeof window.saveData === "function") {
                await window.saveData();
            }
            
            applyState(btn, "success");
            await sleep(2000);
            
            // 5. กลับเป็น normal state
            applyState(btn, "normal");
            btn.style.transform = "scale(1)";
            _isBusy = false;
            
        } catch (error) {
            console.error("[CleanupMode] Error:", error);
            applyState(btn, "error");
            await sleep(2000);
            applyState(btn, "normal");
            btn.style.transform = "scale(1)";
            _isBusy = false;
        }
    });

    _button = btn;
    return btn;
}

// ----- Initialize cleanup system -----
export function initMaintenanceTracking() {
    // 🧹 Setup cleanup method ที่จะถูกเรียกจาก button
    window._performGhostCleanup = async (cleanupData) => {
        // โยน error กลับจริงๆ เพื่อให้ปุ่มแสดง error state ได้ถูกต้อง
        const { firebaseCleanupGhosts, forcePullCurrentSpace } = await import("./firebaseSync.js");
        const count = await firebaseCleanupGhosts(cleanupData.validIds, cleanupData.localSpaceIds);
        console.log(`[Cleanup] Ghost cleanup completed: ${count} ghosts removed`);

        // ถ้า Auto Sync ปิดอยู่ → pull เฉพาะ space ปัจจุบันเพื่อสะท้อนผลกลับมา
        const { getLocalSettings } = await import("./storage.js");
        if (!getLocalSettings().firebaseAutoSync) {
            await forcePullCurrentSpace();
        }
    };
    
    console.log("[MaintenanceTracking] Cleanup system initialized");
}

// ----- Helper -----
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
