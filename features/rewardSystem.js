import { initializeApp } from "../core/lib/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "../core/lib/firebase-firestore.js";
import { svgTrashRed, svgPencil } from '../core/icons.js';
import { getSpaces, saveData, getThaiUnit, getUnitCharFromThai } from '../core/storage.js';
import { saveFlow, flowState, getFlowItems } from './smartFlow.js';

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
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const docRefRewards = doc(db, "data", "myrewards");

let rewardData = {
    lootList: [],
    collectedList: [], // 🟢 เก็บรายการที่สะสม/ถอนเสร็จแล้ว
    globalTaskCompletionCount: 0,
    habitCount: 0, // 🟢 ตัวนับสำหรับ Habit
    flowCount: 0,  // 🟢 ตัวนับสำหรับ Smart Flow
    epicMissions: [],
    comboRules: [
        { id: 1, source: 'task', spaceId: null, target: 5, withinDays: null, rewardName: "Task Master Bonus", type: 'money', category: 'Bonus', value: 5 }
    ],
    isSyncEnabled: false, // 🟢 เปิด/ปิด Google Sync
    targetListId: '@default', // 🟢 List ID ของ Google Tasks
    walletTaskIds: { money: {}, time: {}, item: {} }, // 🟢 เก็บ mapping ID ระหว่างหมวดหมู่กับ Google Task
    lastSyncTimestamp: 0, // 🟢 เวลาล่าสุดที่ซิงค์สำเร็จ
    lastSyncAmounts: { money: {}, time: {}, item: {} }, // 🟢 เก็บยอดล่าสุดที่ซิงค์สำเร็จเพื่อเช็ค Conflict
    completionLogs: { task: [], habit: [], flow: [] }, // 🟢 เก็บประวัติเวลาที่ทำสำเร็จ: { t: timestamp, s: spaceId }
    wallets: { money: {}, time: {}, item: {} }, // 🟢 เพิ่มกระเป๋าเก็บไอเทม
    lastWithdrawals: { money: {}, time: {}, item: {} }, // 🟢 เพิ่มประวัติถอนไอเทม
    moneyCategories: ["Freestyle", "Work", "Bonus"],
    timeCategories: ["Gaming", "Reading", "Relax"],
    itemCategories: ["Coffee", "Snack", "Game Time"], // 🟢 เพิ่มหมวดหมู่ไอเทมเริ่มต้น
    missionCategories: ["Project Alpha", "Learning", "Personal"], // 🟢 เพิ่มหมวดหมู่ภารกิจ
    pos: { x: 100, y: 100 }, // เก็บตำแหน่งหน้าต่าง
    isLocked: false, // สถานะการล็อคการลาก
    isMoneyListCollapsed: false, // สถานะพับรายการเงิน
    isTimeListCollapsed: false,   // สถานะพับรายการเวลา
    collapsedMissionCategories: [], // 🟢 เก็บรายชื่อหมวดหมู่ภารกิจที่ถูกพับอยู่
    isSyncToolsVisible: false, // 🟢 สถานะซ่อน/แสดงปุ่ม T และ W
    isCollectedListCollapsed: true // 🟢 สถานะซ่อน/แสดงประวัติการถอน (ซ่อนเสมอตอนเริ่ม)
};

async function loadRewardData() {
    let res;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        res = await chrome.storage.local.get(['questRewardData']);
    } else {
        const data = localStorage.getItem('questRewardData');
        res = { questRewardData: data ? JSON.parse(data) : null };
    }

    if (res && res.questRewardData) {
        const saved = res.questRewardData; // 🟢 FIX: ประกาศตัวแปร saved เพื่อแก้ ReferenceError
        // ปรับปรุงการโหลดข้อมูล: ป้องกันการเขียนทับด้วยค่าว่าง
        rewardData = { 
            ...rewardData, 
            ...saved,
            wallets: {
                ...rewardData.wallets,
                ...(saved.wallets || {})
            },
            completionLogs: {
                task: Array.isArray(saved.completionLogs?.task) ? saved.completionLogs.task : [],
                habit: Array.isArray(saved.completionLogs?.habit) ? saved.completionLogs.habit : [],
                flow: Array.isArray(saved.completionLogs?.flow) ? saved.completionLogs.flow : []
            },
            lastWithdrawals: {
                ...rewardData.lastWithdrawals,
                ...(saved.lastWithdrawals || {})
            },
            // ป้องกันการเขียนทับด้วยค่าว่างหรือข้อมูลที่ไม่ใช่ Array
            moneyCategories: (Array.isArray(saved.moneyCategories) && saved.moneyCategories.length > 0) 
                ? saved.moneyCategories : rewardData.moneyCategories,
            timeCategories: (Array.isArray(saved.timeCategories) && saved.timeCategories.length > 0) 
                ? saved.timeCategories : rewardData.timeCategories,
            itemCategories: (Array.isArray(saved.itemCategories) && saved.itemCategories.length > 0) 
                ? saved.itemCategories : rewardData.itemCategories,
            missionCategories: (Array.isArray(saved.missionCategories) && saved.missionCategories.length > 0) 
                ? saved.missionCategories : rewardData.missionCategories,
            isSyncEnabled: saved.isSyncEnabled || false,
            targetListId: saved.targetListId || '@default',
            walletTaskIds: saved.walletTaskIds || { money: {}, time: {}, item: {} },
            lastSyncTimestamp: saved.lastSyncTimestamp || 0,
            lastSyncAmounts: saved.lastSyncAmounts || { money: {}, time: {}, item: {} },
            collapsedMissionCategories: Array.isArray(saved.collapsedMissionCategories) ? saved.collapsedMissionCategories : [],
            isSyncToolsVisible: saved.isSyncToolsVisible || false,
            isCollectedListCollapsed: true // 🟢 บังคับให้เป็นซ่อนเสมอทุกครั้งที่โหลด/รีเฟรช
        };
    }
}

async function saveRewardData() {
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            await chrome.storage.local.set({ 'questRewardData': rewardData });
        } else {
            localStorage.setItem('questRewardData', JSON.stringify(rewardData));
        }
        // 🟢 ซิงค์ข้อมูลรางวัลไปยัง Firestore แบบ Real-time
        await setDoc(docRefRewards, rewardData, { merge: true });
        saveData();
    } catch (e) {
        console.error("Failed to save reward data", e);
    }
}

/**
 * 🔄 ระบบซิงค์กระเป๋าเงิน (Wallets) กับ Google Tasks แบบไป-กลับ
 */
let isSyncInProgress = false; // 🟢 ป้องกันการรันซิงค์ซ้อนกัน (Race Condition)
async function syncLootWithGoogleTasks() {
}

/**
 * 🔄 ปุ่ม T: บังคับซิงค์ข้อมูลจาก Google Tasks มาลงที่ Web App (Local = Google)
 */
async function forceSyncFromGoogle() {
}

/**
 * 🔄 ปุ่ม W: บังคับส่งข้อมูลจาก Web App ไปทับใน Google Tasks (Google = Local)
 */
async function forceSyncToGoogle() {
}

export function initRewardSystem() {
    loadRewardData();

    // 🟢 ระบบ Real-time Listener สำหรับข้อมูลรางวัล
    onSnapshot(docRefRewards, (snapshot) => {
        const data = snapshot.data();
        if (data) {
            // ตรวจสอบความแตกต่างเพื่อป้องกัน Infinite Loop
            if (JSON.stringify(rewardData) !== JSON.stringify(data)) {
                // อัปเดตข้อมูลรางวัลในตัวแปรหลัก
                Object.assign(rewardData, data);
                
                // หากหน้าต่างรางวัลเปิดอยู่ ให้สั่งวาดเนื้อหาใหม่ทันที
                const modal = document.getElementById('reward-modal');
                if (modal && modal.style.display === 'flex') {
                    renderRewardContent();
                }
            }
        }
    });

    // 🟢 1. ส่งออกข้อมูลเพื่อให้ระบบ Autocomplete ใน ui-helpers.js ดึงไปใช้แสดง Popup
    window.getRewardSystemData = () => rewardData;

    /**
     * 📢 แสดงหน้าต่างแจ้งเตือนรางวัลแบบ Toast มุมขวาล่าง
     */
    function showRewardToast(text, icon = '✨') {
        let container = document.getElementById('sf-reward-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'sf-reward-toast-container';
            container.style.cssText = `
                position: fixed; bottom: 20px; right: 20px;
                display: flex; flex-direction: column; gap: 10px;
                z-index: 100000; pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.style.cssText = `
            background: var(--bg-card); border: 1px solid var(--border-color);
            border-left: 4px solid #f59e0b; padding: 12px 20px;
            border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            color: var(--text-main); font-size: 13px; font-weight: 700;
            display: flex; align-items: center; gap: 12px;
            pointer-events: auto; animation: toastSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        `;

        toast.innerHTML = `<span style="font-size: 18px;">${icon}</span> <span>${text}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastFadeOut 0.4s forwards';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    /**
     * � Universal Scanner: Parses task text for reward tags
     * @param {string} taskText - The task description to scan
     * @param {boolean} isTab2Mission - Whether this comes from an Epic Mission
     * @param {Object} coords - {x, y} coordinates for animation
     * @param {string} source - 'task', 'habit', or 'flow'
     * @param {number} spaceId - ID of the space where task was completed
     */
    window.processRewardScanner = (taskText, isTab2Mission = false, coords = null, source = 'task', spaceId = null, meta = {}) => {
        if (!taskText) return; // ถ้าไม่มีข้อความงาน ให้หยุดทำงาน
        
        let found = false;
        const now = Date.now();
        
        // 🟢 อัปเดตตัวนับตามประเภท
        if (source === 'habit') rewardData.habitCount = (rewardData.habitCount || 0) + 1;
        else if (source === 'flow') rewardData.flowCount = (rewardData.flowCount || 0) + 1;
        else rewardData.globalTaskCompletionCount++;

        // 🟢 บันทึกเวลาที่ทำสำเร็จลงใน Log
        if (!rewardData.completionLogs[source]) rewardData.completionLogs[source] = [];
        rewardData.completionLogs[source].push({ 
            t: now, 
            s: spaceId, 
            id: meta.id || null, 
            tags: Array.isArray(meta.tags) ? [...meta.tags] : [] 
        });

        const currentCount = (source === 'habit') ? rewardData.habitCount : (source === 'flow' ? rewardData.flowCount : rewardData.globalTaskCompletionCount);

        // 🟢 1. Money Scanner: รองรับรางวัลหลายรายการ (ใช้ matchAll)
        const moneyMatches = taskText.matchAll(/@รางวัล([\d.]+)บาท_([^\s]+)/gi);
        for (const match of moneyMatches) {
            const amount = parseFloat(match[1]);
            const cat = match[2];
            const matchedCat = rewardData.moneyCategories.find(c => c.toLowerCase() === cat.toLowerCase());
            if (matchedCat) {
                if (!rewardData.wallets.money) rewardData.wallets.money = {};
                rewardData.wallets.money[matchedCat] = (rewardData.wallets.money[matchedCat] || 0) + amount;
                if (coords) triggerLootDropAnimation(`💰 +${amount}บาท`, coords.x, coords.y, isTab2Mission);
                else showRewardToast(`ได้รับ ${amount} บาท (${matchedCat})`, '💰');
                found = true;
            }
        }

        // 🟢 2. Time Scanner: รองรับรางวัลหลายรายการ (ใช้ matchAll)
        const timeMatches = taskText.matchAll(/@รางวัล([\d.]+)นาที_([^\s]+)/gi);
        for (const match of timeMatches) {
            const amount = parseFloat(match[1]);
            const cat = match[2];
            const matchedCat = rewardData.timeCategories.find(c => c.toLowerCase() === cat.toLowerCase());
            if (matchedCat) {
                if (!rewardData.wallets.time) rewardData.wallets.time = {};
                rewardData.wallets.time[matchedCat] = (rewardData.wallets.time[matchedCat] || 0) + amount;
                if (coords) triggerLootDropAnimation(`⏳ +${amount}นาที`, coords.x, coords.y, isTab2Mission);
                else showRewardToast(`ได้รับ ${amount} นาที (${matchedCat})`, '⏳');
                found = true;
            }
        }

        // 🟢 3. Item Wallet Scanner: รองรับรางวัลหลายรายการ (ใช้ matchAll)
        const itemWalletMatches = taskText.matchAll(/@รางวัล([\d.]+)อัน_([^\s]+)/gi);
        for (const match of itemWalletMatches) {
            const amount = parseFloat(match[1]);
            const cat = match[2].replace(/_/g, ' ');
            const matchedCat = rewardData.itemCategories.find(c => c.toLowerCase() === cat.toLowerCase());
            if (matchedCat) {
                if (!rewardData.wallets.item) rewardData.wallets.item = {};
                rewardData.wallets.item[matchedCat] = (rewardData.wallets.item[matchedCat] || 0) + amount;
                if (coords) triggerLootDropAnimation(`🎁 +${amount} ${matchedCat}`, coords.x, coords.y, isTab2Mission);
                else showRewardToast(`ได้รับ ${matchedCat} x${amount}`, '🎁');
                found = true;
            }
        }

        // 🟢 4. Big Item Scanner: รองรับรางวัลหลายรายการ (ใช้ matchAll)
        const bigItemMatches = taskText.matchAll(/@รางวัล_([^\s]+)/gi);
        for (const match of bigItemMatches) {
            if (!isTab2Mission) continue; // 🟢 จำกัดให้ Big Reward รับมาจาก Epic Mission เท่านั้น
            const itemName = match[1].replace(/_/g, ' ');
            rewardData.lootList.unshift({
                id: Date.now() + Math.random(),
                name: itemName,
                date: new Date().toLocaleDateString(),
                isSpecial: isTab2Mission
            });
            if (coords) triggerLootDropAnimation(`🎁 ${itemName}`, coords.x, coords.y, isTab2Mission);
            else showRewardToast(`ได้รับไอเทมใหม่: ${itemName}`, '🏆');
            found = true;
        }

        // 4. Combo Rules Check
        rewardData.comboRules.forEach(rule => {
            const isSpaceMatch = (rule.spaceId === null || parseInt(rule.spaceId) === parseInt(spaceId));
            if (rule.source !== source || !isSpaceMatch) return;

            // 🟢 Detailed Flow Filter Check: ตรวจสอบความละเอียดของ Step
            if (source === 'flow') {
                if (rule.flowFilterType === 'tag' && (!meta.tags || !meta.tags.map(t => t.toUpperCase()).includes(rule.flowFilterValue?.toUpperCase()))) return;
                if (rule.flowFilterType === 'id' && meta.id !== rule.flowFilterValue) return;
            }

            let isTriggered = false;
            let countToTarget = 0;

            if (rule.withinDays > 0) {
                // 🟢 กรณีมีเงื่อนไข "ภายใน X วัน"
                const windowMs = rule.withinDays * 24 * 60 * 60 * 1000;
                const relevantLogs = rewardData.completionLogs[source].filter(log => {
                    const isTimeMatch = (now - log.t) <= windowMs;
                    const isSpaceLogMatch = (rule.spaceId === null || parseInt(log.s) === parseInt(rule.spaceId));
                    
                    let isMetaMatch = true;
                    if (source === 'flow') {
                        if (rule.flowFilterType === 'tag') isMetaMatch = log.tags?.map(t => t.toUpperCase()).includes(rule.flowFilterValue?.toUpperCase());
                        else if (rule.flowFilterType === 'id') isMetaMatch = log.id === rule.flowFilterValue;
                    }
                    
                    return isTimeMatch && isSpaceLogMatch && isMetaMatch;
                });
                // ถ้าจำนวนในหน้าต่างเวลาหารเป้าหมายลงตัวพอดี (เพิ่งครบเซ็ตใหม่)
                countToTarget = relevantLogs.length;
            } else {
                // 🟢 กรณีสะสมไปเรื่อยๆ (แบบเดิม)
                const relevantLogs = rewardData.completionLogs[source].filter(log => {
                    const isSpaceLogMatch = (rule.spaceId === null || parseInt(log.s) === parseInt(rule.spaceId));
                    let isMetaMatch = true;
                    if (source === 'flow') {
                        if (rule.flowFilterType === 'tag') isMetaMatch = log.tags?.map(t => t.toUpperCase()).includes(rule.flowFilterValue?.toUpperCase());
                        else if (rule.flowFilterType === 'id') isMetaMatch = log.id === rule.flowFilterValue;
                    }
                    return isSpaceLogMatch && isMetaMatch;
                });
                countToTarget = relevantLogs.length;
            }

            if (countToTarget > 0 && countToTarget % rule.target === 0) isTriggered = true;

            if (isTriggered) {
                let rewardDesc = "";
                if (rule.type === 'money' || rule.type === 'time' || rule.type === 'item') {
                    const targetCat = rule.category || (rule.type === 'money' ? 'Bonus' : (rule.type === 'time' ? 'Relax' : 'Loot'));
                    if (!rewardData.wallets[rule.type]) rewardData.wallets[rule.type] = {};
                    rewardData.wallets[rule.type][targetCat] = (rewardData.wallets[rule.type][targetCat] || 0) + rule.value;
                    rewardDesc = `+${rule.value}${rule.type === 'money' ? 'บาท' : (rule.type === 'time' ? 'นาที' : 'อัน')} (${targetCat})`;
                } else {
                    rewardDesc = rule.rewardName;
                }

                // 🟢 ย้ายจาก Big Reward ไปรวมใน Withdrawal List (Wallets) โดยการไม่เพิ่มลงใน lootList
                if (coords) triggerLootDropAnimation(`🔥 COMBO! ${rewardDesc}`, coords.x, coords.y - 20, true);
                else showRewardToast(`⚡ COMBO: ${rule.rewardName}! ${rewardDesc}`, '🔥');
                found = true;
            }
        });

        if (found || true) {
            saveRewardData();
            if (found && !coords) playChaChingSound(); // เล่นเสียงเฉพาะตอนซิงค์เบื้องหลังและได้รับรางวัลจริง
            
            // 🟢 2. Real-time update: หากหน้าต่างรางวัลเปิดอยู่ ให้สั่ง Render ใหม่ทันที
            const modal = document.getElementById('reward-modal');
            if (modal && modal.style.display === 'flex') {
                triggerRefreshSpin();
                renderRewardContent();
            }
        }
    };

    /**
     * 🔄 เพิ่มอนิเมชั่นหมุนให้กับปุ่ม Refresh เพื่อแสดงการอัปเดตข้อมูลแบบ Real-time
     */
    function triggerRefreshSpin() {
        const btn = document.getElementById('btn-refresh-reward-modal');
        if (!btn) return;
        const svg = btn.querySelector('svg');
        if (svg) {
            svg.classList.add('spin');
            setTimeout(() => svg.classList.remove('spin'), 800); 
        }
    }

    /**
     * 🎨 สร้างอนิเมชั่น Loot ลอยขึ้น
     */
    function triggerLootDropAnimation(text, x, y, isSpecial) {
        const el = document.createElement('div');
        el.className = 'loot-drop-item';
        if (isSpecial) el.style.color = '#f59e0b'; // สีทองสำหรับ Big Reward
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.innerText = text;
        
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1500); // ลบ Element เมื่อจบอนิเมชั่น
    }

    // UI Global Listeners
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-master-open-rewards') || e.target.closest('#btn-open-rewards-topbar')) {
            openRewardModal();
        }
        if (e.target.closest('#btn-master-open-combo')) {
            e.stopPropagation();
            showSavedCombosQuickPopup(e.target.closest('#btn-master-open-combo'));
        }
        if (e.target.id === 'btn-close-reward-modal') {
            document.getElementById('reward-modal').style.display = 'none';
        }
        if (e.target.closest('#btn-refresh-reward-modal')) {
            triggerRefreshSpin();
            renderRewardContent();
        }
        if (e.target.closest('#btn-lock-reward-modal')) {
            rewardData.isLocked = !rewardData.isLocked;
            saveRewardData();
            updateLockUI();
        }
    });

    updateLockUI();
}

/**
 * 🎨 อัปเดตข้อความสถานะ Google Sync ใน UI
 */
function updateSyncStatusUI(text, isError = false) {
    const statusEl = document.getElementById('sf-loot-sync-status');
    if (!statusEl) return;
    statusEl.innerText = text;
    statusEl.style.color = isError ? '#ef4444' : 'var(--text-muted)';
}

/**
 * ⏱️ แปลง Timestamp เป็น "X mins ago"
 */
function getTimeAgo(timestamp) {
    if (!timestamp) return "Never Synced";
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.round(diffMs / (1000 * 60));
    if (diffMins === 0) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    const diffHours = Math.round(diffMins / 60);
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
}

function updateLockUI() {
    const btn = document.getElementById('btn-lock-reward-modal');
    if (!btn) return;
    btn.innerHTML = `<svg class="svg-icon-sm"><use href="#icon-${rewardData.isLocked ? 'lock-minimal' : 'unlock-minimal'}"></use></svg>`;
    btn.style.color = rewardData.isLocked ? '#ef4444' : 'inherit';
    btn.style.opacity = rewardData.isLocked ? '1' : '0.6';
}

export function openRewardModal() {
    const modal = document.getElementById('reward-modal');
    renderRewardContent();
    modal.style.display = 'flex';
}

function renderRewardContent() {
    const container = document.getElementById('reward-modal-body');
    if (!container) return;

    const activeTab = container.dataset.activeTab || '1';

    container.innerHTML = `
        <div class="reward-tabs">
            <button class="reward-tab-btn ${activeTab === '1' ? 'active' : ''}" data-tab="1">Inventory & Loot</button>
            <button class="reward-tab-btn ${activeTab === '2' ? 'active' : ''}" data-tab="2">Epic Missions & Rules</button>
        </div>
        
        <div class="reward-pane" style="display: ${activeTab === '1' ? 'block' : 'none'}">
            <div style="margin-bottom: 25px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <label class="section-label" style="margin:0;">💰 Money Withdrawal List</label>
                    <button class="btn-icon" id="btn-toggle-money-list" title="Toggle List">
                        <svg class="svg-icon-sm" style="transform: ${rewardData.isMoneyListCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; transition: transform 0.2s;"><use href="#icon-chevron-down"></use></svg>
                    </button>
                </div>
                <ul class="task-list" id="sf-withdrawal-money-list" style="margin-top:0; display: ${rewardData.isMoneyListCollapsed ? 'none' : 'block'};"></ul>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:25px; margin-bottom:12px;">
                    <label class="section-label" style="margin:0;">⏳ Time Withdrawal List</label>
                    <button class="btn-icon" id="btn-toggle-time-list" title="Toggle List">
                        <svg class="svg-icon-sm" style="transform: ${rewardData.isTimeListCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; transition: transform 0.2s;"><use href="#icon-chevron-down"></use></svg>
                    </button>
                </div>
                <ul class="task-list" id="sf-withdrawal-time-list" style="margin-top:0; display: ${rewardData.isTimeListCollapsed ? 'none' : 'block'};"></ul>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:25px; margin-bottom:12px;">
                    <label class="section-label" style="margin:0;">🎁 Item Withdrawal List</label>
                </div>
                <ul class="task-list" id="sf-withdrawal-item-list" style="margin-top:0;"></ul>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <label class="section-label" style="margin:0;">🏆 Big Reward</label>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-outline" id="btn-open-combo-rules" style="font-size:11px; padding:2px 8px;">⚡ Combo</button>
                    <button class="btn btn-outline" id="btn-open-categories" style="font-size:11px; padding:2px 8px;">🏷️ Categories</button>
                </div>
            </div>

            <ul class="loot-list" id="sf-big-reward-list" style="margin-top:12px; margin-bottom: 25px;">
                ${rewardData.lootList.length === 0 ? '<li style="text-align:center; opacity:0.4; padding:30px; font-size:13px; list-style:none;">No pending rewards.</li>' : ''}
                ${rewardData.lootList.map(item => `
                    <li class="loot-item ${item.isSpecial ? 'special-loot-glow' : ''}">
                        <label class="google-task-checkbox" style="margin-right:12px;">
                            <input type="checkbox" class="sf-claim-loot-check" data-id="${item.id}">
                            <div class="checkmark-circle">
                                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                            </div>
                        </label>
                        <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
                            <span style="font-weight:700; font-size:14px; color:var(--text-main);">${item.name}</span>
                            <span style="font-size:10px; color:var(--text-muted);">Collected on ${item.date}</span>
                        </div>
                        <button class="btn-icon delete-loot-btn" data-id="${item.id}" title="Remove Loot">${svgTrashRed}</button>
                    </li>
                `).join('')}
            </ul>

            <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid var(--border-color); padding-top: 20px; margin-bottom: 12px;">
                <label class="section-label" style="margin:0;">✅ Collected History</label>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button class="btn btn-outline" id="btn-clear-collected" style="font-size:11px; padding:2px 8px;">Clear All</button>
                    <button class="btn-icon" id="btn-toggle-collected-list" title="Toggle List">
                        <svg class="svg-icon-sm" style="transform: ${rewardData.isCollectedListCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; transition: transform 0.2s;"><use href="#icon-chevron-down"></use></svg>
                    </button>
                </div>
            </div>
            <ul class="loot-list" id="sf-collected-list" style="display: ${rewardData.isCollectedListCollapsed ? 'none' : 'block'};">
                ${rewardData.collectedList.length === 0 ? '<li style="text-align:center; opacity:0.3; padding:20px; font-size:12px; list-style:none;">No history yet.</li>' : ''}
                ${rewardData.collectedList.slice(0, 20).map(item => `
                    <li class="loot-item" style="opacity: 0.7; padding: 8px 16px;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <span style="font-weight:600; font-size:13px; color:var(--text-muted); text-decoration: line-through;">${item.name}</span>
                            <span style="font-size:9px; color:var(--text-muted);">Finished: ${item.collectedAt || item.date}</span>
                        </div>
                        <button class="btn-icon delete-collected-btn" data-id="${item.id}" title="Remove Permanently">${svgTrashRed}</button>
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="reward-pane" style="display: ${activeTab === '2' ? 'block' : 'none'}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <label class="section-label" style="margin:0;">Epic Missions</label>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-outline" id="btn-open-add-mission-category" style="font-size:11px; padding:4px 12px;">➕ New Category</button>
                    <button class="btn btn-primary" id="btn-open-create-mission" style="font-size:11px; padding:4px 12px;">➕ Create Mission</button>
                </div>
            </div>

            <div id="epic-missions-list">
                ${(() => {
                    // 🟢 วนลูปตามหมวดหมู่ที่มีทั้งหมด (แม้จะไม่มีภารกิจ)
                    return rewardData.missionCategories.map(cat => {
                        const missions = rewardData.epicMissions.filter(m => (m.category || "Uncategorized") === cat);
                        const isCollapsed = rewardData.collapsedMissionCategories.includes(cat);

                        return `
                        <div class="mission-category-group" style="margin-bottom:20px;">
                            <div style="font-size:10px; font-weight:800; color:var(--primary-color); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px; display:flex; align-items:center; gap:8px; cursor:pointer;" class="mission-cat-header">
                                <div class="ms-toggle-cat-btn" data-cat="${cat}" style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
                                    <svg class="svg-icon-sm" style="transform: ${isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; transition: transform 0.2s;"><use href="#icon-chevron-down"></use></svg>
                                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📁 ${cat} (${missions.length})</span>
                                </div>
                                <div class="mission-cat-actions" style="display:flex; gap:4px; opacity:0.3; transition:opacity 0.2s;">
                                    <button class="btn-icon ms-edit-cat-btn" data-cat="${cat}" title="Rename Category" style="padding:2px;">${svgPencil}</button>
                                    <button class="btn-icon ms-delete-cat-btn" data-cat="${cat}" title="Delete Category" style="color:#ef4444; padding:2px;">${svgTrashRed}</button>
                                </div>
                                <div style="width:20px; height:1px; background:var(--primary-color); opacity:0.1;"></div>
                            </div>
                            
                            <div class="mission-list-wrapper" style="display: ${isCollapsed ? 'none' : 'block'};">
                                ${missions.length === 0 ? '<div style="font-size:11px; color:var(--text-muted); opacity:0.5; padding:10px 25px; border:1px dashed var(--border-color); border-radius:8px; margin-bottom:8px;">No missions in this category</div>' : ''}
                                ${missions.map(m => `
                                    <div class="loot-item special-loot-glow" style="margin-bottom:8px; padding:12px 15px;">
                                        <div style="flex:1; min-width:0;">
                                            <div style="font-weight:700; font-size:14px;">${m.name}</div>
                                            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">🏆 Reward: <span style="color:var(--primary-color); font-weight:700;">${m.reward}</span></div>
                                        </div>
                                        <div style="display:flex; flex-direction:column; gap:4px; margin-left:15px;">
                                            <button class="btn btn-primary claim-mission-btn" data-id="${m.id}" style="padding:4px 10px; font-size:10px; border-radius:6px;">Claim</button>
                                        </div>
                                        <button class="btn-icon delete-mission-btn" data-id="${m.id}" style="margin-left:10px; opacity:0.3;">${svgTrashRed}</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        `;
                    }).join('');
                })()}
            </div>
        </div>
    `;

    // 🟢 วาดรายการถอนเงิน/เวลา
    renderWithdrawalLists();

    // --- Floating & Draggable Setup ---
    const modalContent = document.querySelector('.reward-modal-content');
    if (modalContent) {
        // 🟢 ตรวจสอบตำแหน่งให้อยู่ใน Viewport เสมอ (ป้องกันหน้าต่างหายเมื่อย่อ Browser)
        const safeX = Math.max(10, Math.min(window.innerWidth - 430, rewardData.pos.x));
        const safeY = Math.max(10, Math.min(window.innerHeight - 400, rewardData.pos.y));
        
        modalContent.style.left = `${safeX}px`;
        modalContent.style.top = `${safeY}px`;
        setupRewardDrag(modalContent);
    }
    // Re-bind UI Event Listeners
    container.querySelectorAll('.reward-tab-btn').forEach(btn => {
        btn.onclick = () => { container.dataset.activeTab = btn.dataset.tab; renderRewardContent(); };
    });

    // --- Withdrawal List Toggles ---
    const toggleMoneyBtn = document.getElementById('btn-toggle-money-list');
    if (toggleMoneyBtn) {
        toggleMoneyBtn.onclick = () => { rewardData.isMoneyListCollapsed = !rewardData.isMoneyListCollapsed; saveRewardData().then(renderRewardContent); };
    }

    const toggleTimeBtn = document.getElementById('btn-toggle-time-list');
    if (toggleTimeBtn) {
        toggleTimeBtn.onclick = () => { rewardData.isTimeListCollapsed = !rewardData.isTimeListCollapsed; saveRewardData().then(renderRewardContent); };
    }

    const toggleCollectedBtn = document.getElementById('btn-toggle-collected-list');
    if (toggleCollectedBtn) {
        toggleCollectedBtn.onclick = () => { rewardData.isCollectedListCollapsed = !rewardData.isCollectedListCollapsed; saveRewardData().then(renderRewardContent); };
    }

    // --- Combo Rules Trigger ---
    const openComboBtn = document.getElementById('btn-open-combo-rules');
    if (openComboBtn) {
        openComboBtn.onclick = (e) => {
            e.stopPropagation();
            showComboRulesPopup(openComboBtn);
        };
    }

    // --- Categories Popup Trigger ---
    const openCatBtn = document.getElementById('btn-open-categories');
    if (openCatBtn) {
        openCatBtn.onclick = (e) => {
            e.stopPropagation();
            showCategoriesPopup(openCatBtn);
        };
    }

    // --- Big Reward Collection Logic ---
    container.querySelectorAll('.sf-claim-loot-check').forEach(cb => {
        cb.onchange = (e) => {
            if (e.target.checked) {
                const id = parseFloat(cb.dataset.id);
                const itemIdx = rewardData.lootList.findIndex(l => l.id === id);
                if (itemIdx > -1) {
                    const item = rewardData.lootList.splice(itemIdx, 1)[0];
                    
                    // 🟢 อัปเดตสถานะใน Google Tasks ทันที (ถ้าซิงค์อยู่)
                    if (item.googleTaskId && rewardData.isSyncEnabled) {
                        fetchGoogleAPI(`/lists/${rewardData.targetListId}/tasks/${item.googleTaskId}`, 'PATCH', { status: 'completed' });
                    }

                    item.collectedAt = new Date().toLocaleTimeString() + " (" + new Date().toLocaleDateString() + ")";
                    rewardData.collectedList.unshift(item);
                    
                    const rect = cb.getBoundingClientRect();
                    triggerMoneyRain(rect.left + rect.width / 2, rect.top + rect.height / 2);
                    
                    saveRewardData().then(renderRewardContent);
                }
            }
        };
    });

    container.querySelectorAll('.delete-loot-btn').forEach(btn => {
        btn.onclick = () => { 
            const id = parseFloat(btn.dataset.id);
            const item = rewardData.lootList.find(l => l.id === id);
            // 🟢 ลบงานใน Google ทันที
            if (item && item.googleTaskId && rewardData.isSyncEnabled) {
                fetchGoogleAPI(`/lists/${rewardData.targetListId}/tasks/${item.googleTaskId}`, 'DELETE');
            }
            rewardData.lootList = rewardData.lootList.filter(l => l.id !== id); 
            saveRewardData().then(renderRewardContent); 
        };
    });

    container.querySelectorAll('.delete-collected-btn').forEach(btn => {
        btn.onclick = () => { rewardData.collectedList = rewardData.collectedList.filter(l => l.id !== parseFloat(btn.dataset.id)); saveRewardData().then(renderRewardContent); };
    });

    // --- Clear All Collected Button ---
    const clearCollectedBtn = document.getElementById('btn-clear-collected');
    if (clearCollectedBtn) {
        clearCollectedBtn.onclick = () => {
            if (confirm("Are you sure you want to clear all collected rewards history? This action cannot be undone.")) {
                rewardData.collectedList = [];
                saveRewardData().then(renderRewardContent);
            }
        };
    }

    // --- Epic Mission Controls ---
    const openCreateMissionBtn = document.getElementById('btn-open-create-mission');
    if (openCreateMissionBtn) {
        openCreateMissionBtn.onclick = (e) => {
            e.stopPropagation();
            showCreateMissionPopup(openCreateMissionBtn);
        };
    }

    const openAddCatBtn = document.getElementById('btn-open-add-mission-category');
    if (openAddCatBtn) {
        openAddCatBtn.onclick = (e) => {
            e.stopPropagation();
            showAddMissionCategoryQuickPopup(openAddCatBtn);
        };
    }

    container.querySelectorAll('.ms-toggle-cat-btn').forEach(btn => {
        btn.onclick = () => {
            const cat = btn.dataset.cat;
            if (!rewardData.collapsedMissionCategories) rewardData.collapsedMissionCategories = [];
            const idx = rewardData.collapsedMissionCategories.indexOf(cat);
            if (idx > -1) rewardData.collapsedMissionCategories.splice(idx, 1);
            else rewardData.collapsedMissionCategories.push(cat);
            
            saveRewardData().then(renderRewardContent);
        };
    });

    container.querySelectorAll('.ms-edit-cat-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const oldCat = btn.dataset.cat;
            const newCat = prompt("Rename Mission Category:", oldCat);
            if (newCat && newCat.trim() !== "" && newCat !== oldCat) {
                const val = newCat.trim();
                // 1. อัปเดตในรายการหมวดหมู่
                const idx = rewardData.missionCategories.indexOf(oldCat);
                if (idx > -1) rewardData.missionCategories[idx] = val;
                // 2. อัปเดตภารกิจทั้งหมดที่สังกัดหมวดหมู่นี้
                rewardData.epicMissions.forEach(m => { if (m.category === oldCat) m.category = val; });
                // 3. อัปเดตสถานะพับหมวดหมู่
                if (rewardData.collapsedMissionCategories.includes(oldCat)) {
                    rewardData.collapsedMissionCategories = rewardData.collapsedMissionCategories.map(c => c === oldCat ? val : c);
                }
                saveRewardData().then(renderRewardContent);
            }
        };
    });

    container.querySelectorAll('.ms-delete-cat-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const cat = btn.dataset.cat;
            if (confirm(`Delete category "${cat}"? Missions in this category will be moved to "General".`)) {
                rewardData.missionCategories = rewardData.missionCategories.filter(c => c !== cat);
                // ตรวจสอบให้แน่ใจว่ามีหมวดหมู่ General รองรับ
                if (!rewardData.missionCategories.includes("General")) rewardData.missionCategories.unshift("General");
                // ย้ายภารกิจไปยัง General
                rewardData.epicMissions.forEach(m => { if (m.category === cat) m.category = "General"; });
                saveRewardData().then(renderRewardContent);
            }
        };
    });

    container.querySelectorAll('.delete-mission-btn').forEach(btn => {
        btn.onclick = () => {
            const id = parseFloat(btn.dataset.id);
            if (confirm("Delete this mission?")) {
                rewardData.epicMissions = rewardData.epicMissions.filter(m => m.id !== id);
                saveRewardData().then(renderRewardContent);
            }
        };
    });
    
    container.querySelectorAll('.claim-mission-btn').forEach(btn => {
        btn.onclick = () => {
            const id = parseFloat(btn.dataset.id);
            const idx = rewardData.epicMissions.findIndex(m => m.id === id);
            const mission = rewardData.epicMissions[idx];
            if (!mission) return;

            // 🟢 นำภารกิจออกก่อนเพื่อให้ saveRewardData ใน scanner เก็บค่าที่ถูกต้องและลดการทำงานซ้ำซ้อน
            rewardData.epicMissions.splice(idx, 1);
            
            // 🟢 เรียก Scanner โดยใช้แท็ก @รางวัล_ เพื่อให้เข้าเงื่อนไข Big Reward จาก Epic Mission
            window.processRewardScanner(`@รางวัล_${mission.reward.replace(/\s+/g, '_')}`, true);
            
            renderRewardContent();
        };
    });
}

/**
 * 📂 Popup สำหรับเพิ่มหมวดหมู่ภารกิจแบบรวดเร็ว
 */
function showAddMissionCategoryQuickPopup(anchorEl) {
    const existing = document.getElementById('sf-add-mission-cat-quick-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'sf-add-mission-cat-quick-popup';
    popup.className = 'sf-sub-popup';
    popup.style.width = '200px';
    popup.style.visibility = 'hidden';

    popup.innerHTML = `
        <div style="font-weight:800; font-size:12px; margin-bottom:10px;">📂 New Category</div>
        <input type="text" id="ms-quick-cat-input" class="settings-input" placeholder="Project Name..." style="padding:6px; font-size:13px; margin-bottom:10px;">
        <button class="btn btn-primary" id="btn-confirm-quick-cat" style="width:100%; justify-content:center; font-size:12px;">Add Category</button>
    `;

    document.body.appendChild(popup);
    
    const input = popup.querySelector('#ms-quick-cat-input');
    input.focus();

    const rect = anchorEl.getBoundingClientRect();
    const popupHeight = popup.offsetHeight;
    let top = rect.bottom + 8;
    
    // 🟢 Prevent top overflow and clamp within viewport
    if (top + popupHeight > window.innerHeight - 10) top = rect.top - popupHeight - 8;
    top = Math.max(10, Math.min(top, window.innerHeight - popupHeight - 10));
    
    popup.style.top = `${top}px`;
    popup.style.left = `${Math.max(10, rect.left - 50)}px`;
    popup.style.visibility = 'visible';

    const handleAdd = () => {
        const val = input.value.trim();
        if (val && !rewardData.missionCategories.includes(val)) {
            rewardData.missionCategories.push(val);
            saveRewardData().then(() => { popup.remove(); renderRewardContent(); });
        } else { popup.remove(); }
    };

    popup.querySelector('#btn-confirm-quick-cat').onclick = handleAdd;
    input.onkeydown = (e) => { if (e.key === 'Enter') handleAdd(); };
    setTimeout(() => { document.addEventListener('click', (e) => { if(!popup.contains(e.target)) popup.remove(); }, {once: true}); }, 0);
}

/**
 * 🏆 Popup สำหรับสร้าง Epic Mission ใหม่
 */
function showCreateMissionPopup(anchorEl) {
    const existing = document.getElementById('sf-create-mission-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'sf-create-mission-popup';
    popup.className = 'sf-sub-popup';
    popup.style.width = '300px';
    
    let selectedCat = rewardData.missionCategories[0] || "General";

    popup.innerHTML = `
        <div style="font-weight:800; font-size:13px; margin-bottom:12px;">🏆 New Epic Mission</div>
        <div class="settings-group">
            <label style="font-size:10px; opacity:0.7;">Mission Name:</label>
            <input type="text" id="ms-new-name" class="settings-input" placeholder="e.g. Finish Project Alpha">
        </div>
        <div class="settings-group">
            <label style="font-size:10px; opacity:0.7;">Loot Reward:</label>
            <input type="text" id="ms-new-reward" class="settings-input" placeholder="e.g. New Keyboard">
        </div>
        <div class="settings-group">
            <label style="font-size:10px; opacity:0.7;">Category:</label>
            <select id="ms-new-cat" class="settings-input" style="font-size:11px; padding:4px;">
                ${rewardData.missionCategories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
        </div>
        <button class="btn btn-primary" id="btn-confirm-create-mission" style="width:100%; justify-content:center; padding:8px;">Create Mission</button>
    `;

    document.body.appendChild(popup);
    
    // Positioning logic (Simplified)
    const rect = anchorEl.getBoundingClientRect();
    const popupWidth = 300;
    const popupHeight = popup.offsetHeight || 280; 

    let top = rect.bottom + 8;
    if (top + popupHeight > window.innerHeight - 10) top = rect.top - popupHeight - 8;
    top = Math.max(10, Math.min(top, window.innerHeight - popupHeight - 10));

    let left = rect.left - 150;
    if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - 10;

    popup.style.top = `${top}px`;
    popup.style.left = `${Math.max(10, left)}px`;

    popup.querySelector('#btn-confirm-create-mission').onclick = () => {
        const name = popup.querySelector('#ms-new-name').value.trim();
        const reward = popup.querySelector('#ms-new-reward').value.trim();
        const category = popup.querySelector('#ms-new-cat').value;

        if (name && reward) {
            rewardData.epicMissions.push({ id: Date.now(), name, reward, category });
            saveRewardData().then(() => { popup.remove(); renderRewardContent(); });
        }
    };

    setTimeout(() => {
        const close = (e) => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 0);
}

/**
 * ⚡ Quick View Popup for Active Combo Rules
 */
function showSavedCombosQuickPopup(anchorEl) {
    const existing = document.getElementById('reward-combo-quick-view');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'reward-combo-quick-view';
    popup.className = 'sf-sub-popup';
    popup.style.width = '280px';
    popup.style.visibility = 'hidden';

    const sources = {
        task: { label: 'Tasks', icon: '📋' },
        habit: { label: 'Habits', icon: '✨' },
        flow: { label: 'Smart Flow', icon: '🚀' }
    };

    let contentHtml = `
        <div style="font-weight:800; font-size:12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
            <span>⚡ Active Combos</span>
            <button class="btn-icon" id="btn-manage-combos-link" title="Manage Rules" style="padding:2px;">
                <svg class="svg-icon-sm"><use href="#icon-settings"></use></svg>
            </button>
        </div>
    `;

    if (rewardData.comboRules.length === 0) {
        contentHtml += '<div style="text-align:center; opacity:0.5; padding:20px; font-size:11px;">No active combo rules.</div>';
    } else {
        Object.keys(sources).forEach(srcKey => {
            const rules = rewardData.comboRules.filter(r => r.source === srcKey);
            if (rules.length > 0) {
                contentHtml += `<div style="font-size:10px; font-weight:800; color:var(--primary-color); text-transform:uppercase; margin:10px 0 6px 0; display:flex; align-items:center; gap:6px;">${sources[srcKey].icon} ${sources[srcKey].label}</div>`;
                contentHtml += rules.map(rule => `
                    <div class="loot-item" style="padding:8px 12px; margin-bottom:4px; border-radius:8px; background:var(--bg-body); border:none; display:block !important;">
                        <div style="font-size:11px; font-weight:800; color:var(--text-main);">${rule.rewardName}</div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
                            Every ${rule.target} → ${rule.value}${getThaiUnit(rule.type === 'money' ? 'b' : (rule.type === 'time' ? 't' : 'i'))} [${rule.category}]
                        </div>
                    </div>
                `).join('');
            }
        });
    }

    popup.innerHTML = contentHtml;
    document.body.appendChild(popup);

    const rect = anchorEl.getBoundingClientRect();
    const popupHeight = popup.offsetHeight;
    let top = rect.bottom + 8;
    if (top + popupHeight > window.innerHeight - 10) top = rect.top - popupHeight - 8;
    top = Math.max(10, Math.min(top, window.innerHeight - popupHeight - 10));
    
    popup.style.top = `${top}px`;
    popup.style.left = `${Math.max(10, Math.min(window.innerWidth - 290, rect.left - 120))}px`;
    popup.style.visibility = 'visible';

    popup.querySelector('#btn-manage-combos-link').onclick = (e) => {
        e.stopPropagation();
        popup.remove();
        showComboRulesPopup(anchorEl);
    };
}

/**
 * ⚡ Render Combo Rules Popup
 */
function showComboRulesPopup(anchorEl) {
    const existing = document.getElementById('reward-combo-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'reward-combo-popup';
    popup.className = 'sf-sub-popup';
    popup.style.width = '320px';
    popup.style.visibility = 'hidden'; // ซ่อนไว้ก่อนเพื่อวัดขนาดจริงใน DOM

    let selectedCategory = ""; // เก็บหมวดหมู่ที่จิ้มเลือก
    const allSpaces = getSpaces().filter(s => !s.isArchived && !s.isDeleted);
    const getCategoryOptions = (type) => {
        if (type === 'money') return rewardData.moneyCategories || [];
        if (type === 'time') return rewardData.timeCategories || [];
        if (type === 'item') return rewardData.itemCategories || [];
        return [];
    };

    popup.innerHTML = `
        <div style="font-weight:800; font-size:12px; margin-bottom:12px;">⚡ Combo Rules</div>

        <div id="combo-form-area" class="mission-form" style="padding:12px; margin-bottom:15px; background:var(--bg-body);">
            <div style="font-size:11px; font-weight:700; margin-bottom:12px;">Create New Rule</div>

            <!-- 1. Rule Name at Top -->
            <label style="font-size:10px; opacity:0.7;">Rule Name:</label>
            <input type="text" id="combo-name" class="settings-input" style="padding:4px; font-size:11px; margin-bottom:12px;" placeholder="e.g. Work Master">

            <!-- 2. Completion Logic -->
            <label style="font-size:10px; opacity:0.7;">When I complete:</label>
            <div style="display:grid; grid-template-columns: 1fr 1.5fr; gap:6px; margin-bottom:8px;">
                <input type="number" id="combo-target" class="settings-input" style="padding:4px;" placeholder="Count (ex: 5)">
                <div style="display:flex; align-items:center; gap:4px;">
                    <span style="font-size:10px; opacity:0.7;">Within:</span>
                    <input type="number" id="combo-within-days" class="settings-input" style="padding:4px; width:50px;" placeholder="∞">
                    <span style="font-size:10px; opacity:0.7;">d</span>
                </div>
            </div>
            <div style="margin-bottom:12px;">
                <select id="combo-source" class="settings-input" style="padding:4px; font-size:11px;">
                    <option value="task">Tasks</option>
                    <option value="habit">Habits</option>
                    <option value="flow">Flow Steps</option>
                </select>
            </div>

            <!-- 🟢 Flow Detailed Filter -->
            <div id="combo-flow-filter-wrapper" style="display:none; margin-bottom:12px;">
                <label style="font-size:10px; opacity:0.7;">Flow Condition:</label>
                <select id="combo-flow-filter-type" class="settings-input" style="padding:4px; font-size:11px; margin-bottom:8px;">
                    <option value="all">Any Flow Step</option>
                    <option value="tag">Steps with specific Tag</option>
                    <option value="id">A Specific Step</option>
                </select>
                <div id="combo-flow-filter-value-container"></div>
            </div>

            <!-- 3. Space Filter (Above Apply to:) -->
            <div id="combo-space-wrapper" style="margin-bottom:12px;">
                <label style="font-size:10px; opacity:0.7;">From Space:</label>
                <select id="combo-space-id" class="settings-input" style="padding:4px; font-size:11px;">
                    <option value="all">All Spaces</option>
                    ${allSpaces.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                </select>
            </div>

            <!-- 4. Reward Logic (Apply to:) -->
            <label style="font-size:10px; opacity:0.7; font-weight:700;">Apply to:</label>
            <div style="display:grid; grid-template-columns: 1fr 1.5fr; gap:6px; margin-top:5px; margin-bottom:10px;">
                <input type="number" id="combo-val" class="settings-input" style="padding:4px;" placeholder="Value">
                <select id="combo-reward-type" class="settings-input" style="padding:4px; font-size:11px;">
                    <option value="money">Money (บาท)</option>
                    <option value="time">Time (นาที)</option>
                    <option value="item">Item (อัน)</option>
                </select>
            </div>

            <div id="combo-category-wrapper" style="margin-bottom:15px;">
                <label style="font-size:10px; opacity:0.7;">Target Category (Click to select):</label>
                <div id="combo-category-pills" style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px; padding:8px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-card); min-height:30px;"></div>
            </div>

            <div style="display:flex; gap:8px;">
                <button class="btn btn-primary" id="btn-add-combo-rule" style="flex:1; justify-content:center; padding:6px; font-size:11px;">Create Rule</button>
                <button class="btn btn-outline" id="btn-cancel-combo-edit" style="display:none; justify-content:center; padding:6px; font-size:11px; color:#ef4444;">Cancel</button>
            </div>
        </div>

        <div id="combo-rules-list-container" style="max-height:150px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;"></div>

        <div id="combo-stats-footer" style="margin-top:15px; padding-top:10px; border-top:1px solid var(--border-color); font-size:10px; color:var(--text-muted);"></div>
    `;

    // 🟢 Encapsulate rendering logic to refresh without re-creating the popup
    const renderRulesList = () => {
        const listContainer = popup.querySelector('#combo-rules-list-container');
        const footer = popup.querySelector('#combo-stats-footer');
        
        listContainer.innerHTML = rewardData.comboRules.map(rule => `
            <div class="loot-item" style="padding:8px; margin:0; border-radius:8px;">
                <div style="flex:1;">
                    <div style="font-size:11px; font-weight:800;">${rule.rewardName}</div>
                    <div style="font-size:10px; color:var(--text-muted);">
                        Every ${rule.target} ${rule.source}s ${rule.withinDays ? `in ${rule.withinDays}d` : ''} ${rule.spaceId ? '(Space)' : '(Global)'} 
                        ${rule.source === 'flow' && rule.flowFilterType !== 'all' ? `<br><span style="color:var(--primary-color); font-weight:700;">Filter: ${rule.flowFilterType === 'tag' ? '#' + rule.flowFilterValue : 'Specific Step'}</span>` : ''}
                        → ${rule.value}${getThaiUnit(rule.type === 'money' ? 'b' : (rule.type === 'time' ? 't' : 'i'))} [${rule.category || 'Default'}]
                    </div>
                </div>
                <div style="display:flex; gap:4px;">
                    <button class="btn-icon edit-combo-btn" data-id="${rule.id}" style="color:var(--primary-color); transform:scale(0.8);">${svgPencil}</button>
                    <button class="btn-icon del-combo-btn" data-id="${rule.id}" style="color:red; transform:scale(0.8);">${svgTrashRed}</button>
                </div>
            </div>
        `).join('');
        
        footer.innerHTML = `📊 Current Stats: Tasks: ${rewardData.globalTaskCompletionCount} | Habits: ${rewardData.habitCount || 0} | Flow: ${rewardData.flowCount || 0}`;
    };

    document.body.appendChild(popup);

    // Smart Positioning Logic
    const rect = anchorEl.getBoundingClientRect();
    const updatePos = () => {
        const popupHeight = popup.offsetHeight;
        const vh = window.innerHeight;
        let top = rect.bottom + 8;
        
        if (top + popupHeight > vh - 10) top = rect.top - popupHeight - 8;
        // 🟢 Clamp top to prevent overflow
        top = Math.max(10, Math.min(top, vh - popupHeight - 10));

        popup.style.top = `${top}px`;
        popup.style.left = `${Math.max(10, Math.min(window.innerWidth - 330, rect.left - 200))}px`;
        popup.style.visibility = 'visible';
    };

    // Category Selection Logic
    const sourceSelect = popup.querySelector('#combo-source');
    const flowFilterWrapper = popup.querySelector('#combo-flow-filter-wrapper');
    const flowFilterTypeSelect = popup.querySelector('#combo-flow-filter-type');
    const flowFilterValueContainer = popup.querySelector('#combo-flow-filter-value-container');
    const spaceWrapper = popup.querySelector('#combo-space-wrapper');
    const rewardTypeSelect = popup.querySelector('#combo-reward-type');
    const pillsContainer = popup.querySelector('#combo-category-pills');

    const renderFlowValueInput = (type) => {
        flowFilterValueContainer.innerHTML = '';
        if (type === 'all') return;

        const select = document.createElement('select');
        select.className = 'settings-input';
        select.style.cssText = 'padding:4px; font-size:11px;';
        select.id = 'combo-flow-filter-value';

        if (type === 'tag') {
            const tags = flowState.managedTags || [];
            select.innerHTML = tags.map(t => `<option value="${t}">${t}</option>`).join('') || '<option value="">No tags found</option>';
        } else if (type === 'id') {
            const items = getFlowItems();
            select.innerHTML = items.map(item => `<option value="${item.id}">${item.title}</option>`).join('') || '<option value="">No steps found</option>';
        }
        flowFilterValueContainer.appendChild(select);
    };

    const renderCategoryPills = (type) => {
        const cats = getCategoryOptions(type);
        if (!selectedCategory || !cats.includes(selectedCategory)) {
            selectedCategory = cats.length > 0 ? cats[0] : "";
        }
        pillsContainer.innerHTML = cats.map(c => `
            <div class="tag-pill ${selectedCategory === c ? 'active' : ''}" style="font-size:10px; padding:2px 8px; cursor:pointer;" data-cat="${c}">${c}</div>
        `).join('') || '<span style="font-size:10px; opacity:0.5;">No categories defined</span>';

        pillsContainer.querySelectorAll('.tag-pill').forEach(p => {
            p.onclick = () => { selectedCategory = p.dataset.cat; renderCategoryPills(type); };
        });
        updatePos(); // Re-measure height as pills might wrap
    };

    const updateFields = () => {
        const isFlow = sourceSelect.value === 'flow';
        flowFilterWrapper.style.display = isFlow ? 'block' : 'none';
        if (isFlow) renderFlowValueInput(flowFilterTypeSelect.value);
        
        renderCategoryPills(rewardTypeSelect.value);
    };

    sourceSelect.onchange = updateFields;
    flowFilterTypeSelect.onchange = (e) => renderFlowValueInput(e.target.value);

    rewardTypeSelect.onchange = updateFields;
    updateFields();
    renderRulesList();

    // 🟢 Improved Refresh: Reset form and update list instead of re-opening popup
    const softRefresh = () => {
        popup.querySelector('#combo-name').value = '';
        popup.querySelector('#combo-target').value = '';
        popup.querySelector('#combo-within-days').value = '';
        addBtn.innerText = "Create Rule";
        delete addBtn.dataset.editId;
        cancelEditBtn.style.display = 'none';
        renderRulesList();
        updatePos();
    };

    const addBtn = popup.querySelector('#btn-add-combo-rule');
    const cancelEditBtn = popup.querySelector('#btn-cancel-combo-edit');

    addBtn.onclick = () => {
        const name = popup.querySelector('#combo-name').value.trim() || "Combo Reward";
        const target = parseInt(popup.querySelector('#combo-target').value);
        const withinDays = parseInt(popup.querySelector('#combo-within-days').value) || null;
        const source = sourceSelect.value;
        const isFlow = source === 'flow';
        const flowFilterType = isFlow ? flowFilterTypeSelect.value : 'all';
        const flowFilterValue = isFlow ? popup.querySelector('#combo-flow-filter-value')?.value : null;
        const spaceIdVal = popup.querySelector('#combo-space-id').value;
        const spaceId = spaceIdVal === 'all' ? null : parseInt(spaceIdVal);
        const val = parseFloat(popup.querySelector('#combo-val').value) || 0;
        const type = rewardTypeSelect.value;
        const category = selectedCategory || (getCategoryOptions(type)[0] || "Default");
        const editId = addBtn.dataset.editId;

        if (target > 0) {
            if (editId) {
                // 🟢 กรณีแก้ไข: หาตำแหน่งเดิมและอัปเดตข้อมูล
                const idx = rewardData.comboRules.findIndex(r => r.id === parseFloat(editId));
                if (idx > -1) {
                    rewardData.comboRules[idx] = { 
                        ...rewardData.comboRules[idx], 
                        source, spaceId, target, withinDays, type, category, value: val, rewardName: name,
                        flowFilterType, flowFilterValue
                    };
                }
            } else {
                // 🟢 กรณีสร้างใหม่
                rewardData.comboRules.push({ 
                    id: Date.now(), 
                    source, 
                    spaceId, 
                    target, 
                    withinDays,
                    type, 
                    category,
                    flowFilterType,
                    flowFilterValue,
                    value: val, 
                    rewardName: name 
                });
            }
            saveRewardData().then(softRefresh);
        }
    };

    cancelEditBtn.onclick = softRefresh;

    popup.onclick = (e) => {
        const delBtn = e.target.closest('.del-combo-btn');
        const editBtn = e.target.closest('.edit-combo-btn');
        
        if (editBtn) {
            // 🟢 เมื่อกดแก้ไข: ดึงข้อมูลกฎมาใส่ในฟอร์ม
            const id = parseFloat(editBtn.dataset.id);
            const rule = rewardData.comboRules.find(r => r.id === id);
            if (rule) {
                popup.querySelector('#combo-name').value = rule.rewardName;
                popup.querySelector('#combo-target').value = rule.target;
                popup.querySelector('#combo-within-days').value = rule.withinDays || "";
                popup.querySelector('#combo-source').value = rule.source;
                popup.querySelector('#combo-space-id').value = rule.spaceId === null ? 'all' : rule.spaceId;
                popup.querySelector('#combo-val').value = rule.value;
                popup.querySelector('#combo-reward-type').value = rule.type;
                selectedCategory = rule.category;
                
                if (rule.source === 'flow') {
                    flowFilterTypeSelect.value = rule.flowFilterType || 'all';
                    renderFlowValueInput(flowFilterTypeSelect.value);
                    const valEl = popup.querySelector('#combo-flow-filter-value');
                    if (valEl) valEl.value = rule.flowFilterValue || "";
                }
                
                addBtn.innerText = "Update Rule";
                addBtn.dataset.editId = id;
                cancelEditBtn.style.display = 'inline-flex';
                
                updateFields(); // รีเฟรช Category Pills ตามประเภทรางวัลที่เลือก
            }
        } else if (delBtn) {
            const id = parseFloat(delBtn.dataset.id);
            rewardData.comboRules = rewardData.comboRules.filter(r => r.id !== id);
            saveRewardData().then(renderRulesList);
        }
    };

    setTimeout(() => {
        const close = (ev) => { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 0);
}

/**
 * 🏷️ Render Categories Popup
 */
function showCategoriesPopup(anchorEl) {
    const existing = document.getElementById('reward-categories-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'reward-categories-popup';
    popup.className = 'sf-sub-popup';
    popup.style.width = '280px';
    popup.style.visibility = 'hidden';

    popup.innerHTML = `
        <div style="font-weight:800; font-size:12px; margin-bottom:12px;">🏷️ Manage Categories</div>
        
        <div class="settings-group">
            <label style="font-size:10px; opacity:0.7;">Money Categories (บาท) (Ex: @รางวัล10บาท_Work)</label>
            <div style="display:flex; gap:5px; margin-bottom:8px;">
                <input type="text" id="pop-money-input" class="settings-input" style="padding:4px; font-size:11px;" placeholder="New...">
                <button class="btn btn-primary" id="pop-add-money" style="padding:2px 8px; font-size:10px;">Add</button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${rewardData.moneyCategories.map(cat => `<span class="tag-pill" style="font-size:10px; padding:2px 6px;">${cat} <span class="pop-del-cat" data-type="money" data-val="${cat}" style="cursor:pointer; margin-left:4px; color:red;">×</span></span>`).join('')}
            </div>
        </div>

        <div class="settings-group" style="margin-top:15px;">
            <label style="font-size:10px; opacity:0.7;">Item Categories (อัน) (Ex: @รางวัล1อัน_Coffee)</label>
            <div style="display:flex; gap:5px; margin-bottom:8px;">
                <input type="text" id="pop-item-input" class="settings-input" style="padding:4px; font-size:11px;" placeholder="New...">
                <button class="btn btn-primary" id="pop-add-item" style="padding:2px 8px; font-size:10px;">Add</button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${(rewardData.itemCategories || []).map(cat => `<span class="tag-pill" style="font-size:10px; padding:2px 6px;">${cat} <span class="pop-del-cat" data-type="item" data-val="${cat}" style="cursor:pointer; margin-left:4px; color:red;">×</span></span>`).join('')}
            </div>
        </div>

        <div class="settings-group" style="margin-top:15px;">
            <label style="font-size:10px; opacity:0.7;">Mission Categories (Ex: Project Alpha)</label>
            <div style="display:flex; gap:5px; margin-bottom:8px;">
                <input type="text" id="pop-mission-input" class="settings-input" style="padding:4px; font-size:11px;" placeholder="New Project...">
                <button class="btn btn-primary" id="pop-add-mission-cat" style="padding:2px 8px; font-size:10px;">Add</button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${(rewardData.missionCategories || []).map(cat => `<span class="tag-pill" style="font-size:10px; padding:2px 6px;">${cat} <span class="pop-del-cat" data-type="mission" data-val="${cat}" style="cursor:pointer; margin-left:4px; color:red;">×</span></span>`).join('')}
            </div>
        </div>

        <div class="settings-group" style="margin-top:15px;">
            <label style="font-size:10px; opacity:0.7;">Time Categories (นาที) (Ex: @รางวัล15นาที_Gaming)</label>
            <div style="display:flex; gap:5px; margin-bottom:8px;">
                <input type="text" id="pop-time-input" class="settings-input" style="padding:4px; font-size:11px;" placeholder="New...">
                <button class="btn btn-primary" id="pop-add-time" style="padding:2px 8px; font-size:10px;">Add</button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${rewardData.timeCategories.map(cat => `<span class="tag-pill" style="font-size:10px; padding:2px 6px;">${cat} <span class="pop-del-cat" data-type="time" data-val="${cat}" style="cursor:pointer; margin-left:4px; color:red;">×</span></span>`).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // 🟢 Smart Positioning Logic (สำหรับหน้า Categories)
    const rect = anchorEl.getBoundingClientRect();
    const popupWidth = 280;
    const popupHeight = popup.offsetHeight;
    const vh = window.innerHeight;

    let top = rect.bottom + 8;
    let left = rect.left - 150;

    if (top + popupHeight > vh - 10) top = rect.top - popupHeight - 8;
    // 🟢 Prevent top overflow
    top = Math.max(10, Math.min(top, vh - popupHeight - 10));

    if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - 20;
    if (left < 10) left = 10;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
    popup.style.visibility = 'visible';

    // Logic: Add/Delete Categories
    const refreshPopup = () => { popup.remove(); showCategoriesPopup(anchorEl); };

    popup.querySelector('#pop-add-money').onclick = () => {
        const val = popup.querySelector('#pop-money-input').value.trim();
        if (val && !rewardData.moneyCategories.includes(val)) { rewardData.moneyCategories.push(val); saveRewardData().then(refreshPopup); }
    };
    popup.querySelector('#pop-add-item').onclick = () => {
        const val = popup.querySelector('#pop-item-input').value.trim();
        if (val && !rewardData.itemCategories.includes(val)) { rewardData.itemCategories.push(val); saveRewardData().then(refreshPopup); }
    };
    popup.querySelector('#pop-add-mission-cat').onclick = () => {
        const val = popup.querySelector('#pop-mission-input').value.trim();
        if (val && !rewardData.missionCategories.includes(val)) { rewardData.missionCategories.push(val); saveRewardData().then(refreshPopup); }
    };
    popup.querySelector('#pop-add-time').onclick = () => {
        const val = popup.querySelector('#pop-time-input').value.trim();
        if (val && !rewardData.timeCategories.includes(val)) { rewardData.timeCategories.push(val); saveRewardData().then(refreshPopup); }
    };

    popup.onclick = (e) => {
        if (e.target.classList.contains('pop-del-cat')) {
            const { type, val } = e.target.dataset;
            if (type === 'money') rewardData.moneyCategories = rewardData.moneyCategories.filter(c => c !== val);
            else if (type === 'item') rewardData.itemCategories = rewardData.itemCategories.filter(c => c !== val);
            else if (type === 'mission') rewardData.missionCategories = rewardData.missionCategories.filter(c => c !== val);
            else rewardData.timeCategories = rewardData.timeCategories.filter(c => c !== val);
            saveRewardData().then(refreshPopup);
        }
    };

    // Close on outside click
    setTimeout(() => {
        const close = (ev) => { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 0);
}

/**
 * 🖐️ Drag Logic for Quest Loot System
 */
function setupRewardDrag(el) {
    const header = el.querySelector('h3').parentElement;
    if (!header) return;

    let isDragging = false;
    let offset = { x: 0, y: 0 };

    header.onmousedown = (e) => {
        if (e.target.closest('button')) return;
        if (rewardData.isLocked) return; // ห้ามลากถ้าล็อคอยู่
        isDragging = true;
        el.classList.add('is-interacting');
        const rect = el.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;
        document.body.style.userSelect = 'none';
    };

    const handleMove = (e) => {
        if (!isDragging) return;
        const newX = e.clientX - offset.x;
        const newY = e.clientY - offset.y;
        el.style.left = `${newX}px`;
        el.style.top = `${newY}px`;
        rewardData.pos.x = newX;
        rewardData.pos.y = newY;
    };

    const handleUp = () => {
        if (isDragging) {
            isDragging = false;
            el.classList.remove('is-interacting');
            document.body.style.userSelect = '';
            saveRewardData();
        }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
}

/**
 * 🏦 เรนเดอร์รายการเบิกถอนเงินรายหมวดหมู่ (To-do List Style)
 */
function renderWithdrawalLists() {
    const moneyList = document.getElementById('sf-withdrawal-money-list');
    const timeList = document.getElementById('sf-withdrawal-time-list');
    const itemList = document.getElementById('sf-withdrawal-item-list');
    if (!moneyList || !timeList || !itemList) return;

    const renderRow = (cat, type) => {
        const amount = (rewardData.wallets[type]?.[cat] || 0);
        const lastTime = rewardData.lastWithdrawals[type][cat] || "Never";
        const unit = type === 'money' ? 'บาท' : (type === 'time' ? 'นาที' : 'อัน');
        const icon = type === 'money' ? '💰' : (type === 'time' ? '⏳' : '🎁');

        const li = document.createElement('li');
        li.className = 'task-item';
        // ใช้สไตล์เดียวกับรายการงานปกติเพื่อให้ดู Clean
        li.style.cssText = 'padding: 8px 12px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 10px; background: var(--bg-card); border-radius: 8px; margin-bottom: 4px; border: 1px solid var(--border-color);';
        
        li.innerHTML = `
            <label class="google-task-checkbox">
                <input type="checkbox" class="sf-withdraw-check" data-cat="${cat}" data-type="${type}" ${amount <= 0 ? 'disabled' : ''}>
                <div class="checkmark-circle">
                    <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                </div>
            </label>
            <div style="flex:1; min-width:0;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:800; font-size:14px; color: ${amount > 0 ? 'var(--primary-color)' : 'var(--text-muted)'};">
                        ${icon} ${amount.toFixed(2)}${unit}
                    </span>
                    <span style="font-size:12px; font-weight:600; color:var(--text-main);">${cat}</span>
                </div>
                <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">Last Withdrawal: ${lastTime}</div>
            </div>
        `;

        // Logic การถอนเงิน
        const checkbox = li.querySelector('.sf-withdraw-check');
        checkbox.onchange = (e) => {
            if (e.target.checked) {
                e.target.checked = false; // คืนค่าเพื่อให้ติ๊กใหม่ได้ภายหลัง
                // 🟢 เปิด Popup ถามจำนวนที่ต้องการถอน
                showWithdrawalDialog(cat, type, amount, (withdrawVal) => {
                    executeWithdrawal(cat, type, withdrawVal, icon, unit, e.target);
                });
            }
        };

        return li;
    };

    moneyList.innerHTML = '';
    rewardData.moneyCategories.forEach(cat => moneyList.appendChild(renderRow(cat, 'money')));

    timeList.innerHTML = '';
    rewardData.timeCategories.forEach(cat => timeList.appendChild(renderRow(cat, 'time')));

    itemList.innerHTML = '';
    rewardData.itemCategories.forEach(cat => itemList.appendChild(renderRow(cat, 'item')));
}

/**
 * 🏦 ฟังก์ชันแสดงหน้าต่างถามจำนวนเงินที่จะถอน
 */
function showWithdrawalDialog(cat, type, currentTotal, callback) {
    const existing = document.getElementById('sf-withdraw-dialog');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'sf-withdraw-dialog';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.zIndex = '20000';
    modal.style.background = 'rgba(0,0,0,0.2)'; // พื้นหลังใสๆ ไม่เบลอตามธีมเดิม
    modal.style.pointerEvents = 'auto';

    const unit = type === 'money' ? 'b' : (type === 'time' ? 'm' : 'x');

    modal.innerHTML = `
        <div class="modal-content" style="width: 300px; text-align: center; padding: 25px;">
            <h3 style="margin-top:0; font-size: 16px; font-weight: 800;">💰 Withdrawal</h3>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 15px;">
                Available in <b>${cat}</b>:<br>
                <span style="font-size: 18px; color: var(--primary-color); font-weight: 800;">${currentTotal.toFixed(2)}${unit}</span>
            </p>
            <div class="settings-group">
                <label style="font-size: 10px; opacity: 0.7;">Enter Amount to Withdraw:</label>
                <input type="number" id="withdraw-amount-input" class="settings-input" 
                    value="${currentTotal}" min="0.01" max="${currentTotal}" step="0.01"
                    style="text-align: center; font-size: 20px; font-weight: 800; border-color: var(--primary-color);">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px;">
                <button class="btn btn-outline" id="btn-withdraw-cancel">Cancel</button>
                <button class="btn btn-primary" id="btn-withdraw-confirm" style="justify-content: center;">Confirm</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const input = modal.querySelector('#withdraw-amount-input');
    input.focus();
    input.select();

    const close = () => modal.remove();
    modal.querySelector('#btn-withdraw-cancel').onclick = close;
    modal.querySelector('#btn-withdraw-confirm').onclick = () => {
        const val = parseFloat(input.value);
        if (val > 0 && val <= currentTotal) {
            callback(val);
            close();
        } else {
            input.style.borderColor = '#ef4444';
            input.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }], { duration: 100, iterations: 3 });
        }
    };

    // Enter to confirm
    input.onkeydown = (e) => { if (e.key === 'Enter') modal.querySelector('#btn-withdraw-confirm').click(); };
}

/**
 * ⚙️ ประมวลผลการถอนเงินจริง
 */
function executeWithdrawal(cat, type, withdrawVal, icon, unit, targetEl) {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0') + " (" + now.toLocaleDateString() + ")";
    
    // 1. อัปเดตยอดคงเหลือ (ลบเฉพาะที่ถอน)
    rewardData.wallets[type][cat] = (rewardData.wallets[type][cat] || 0) - withdrawVal;
    
    // ป้องกันค่าติดลบจากเลขนัยสำคัญ
    if (rewardData.wallets[type][cat] < 0.001) rewardData.wallets[type][cat] = 0;

    rewardData.lastWithdrawals[type][cat] = timeStr;

    // 2. เอฟเฟกต์เงินปลิว
    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        triggerMoneyRain(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    // เล่นเสียง Cha-ching!
    playChaChingSound();

    // 3. บันทึกเข้าประวัติ
    rewardData.collectedList.unshift({
        id: Date.now(),
        name: `${icon} Withdrawn: ${withdrawVal.toFixed(2)}${unit} (${cat})`,
        date: new Date().toLocaleDateString(),
        collectedAt: timeStr,
        isSpecial: false
    });

    // 4. บันทึกและรีเฟรชหน้าจอ
    saveRewardData().then(() => {
        const li = targetEl?.closest('.task-item');
        if (li) {
            li.style.background = 'rgba(47, 128, 237, 0.1)';
            setTimeout(renderRewardContent, 400);
        }
    });
}

/**
 * 🎵 สร้างเสียง "Cha-ching!" (เสียงเหรียญกังวาน) โดยใช้ Web Audio API
 */
function playChaChingSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const playCoinNode = (freq, startTime, duration, vol) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'triangle'; // ใช้ Triangle wave เพื่อให้เสียงมีความเป็น metallic
            osc.frequency.setValueAtTime(freq, startTime);
            
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        // เสียง Cha-ching ประกอบด้วย 2 โน้ตสั้นๆ ต่อเนื่องกัน (โน้ตสูง -> สูงกว่า)
        playCoinNode(987.77, ctx.currentTime, 0.1, 0.1);      // B5
        playCoinNode(1318.51, ctx.currentTime + 0.08, 0.4, 0.1); // E6
    } catch (e) {
        console.error("Audio playback failed", e);
    }
}

/**
 * 🎊 เอฟเฟกต์ "เงินปลิว" กระจายออกมาเมื่อถอนเงินสำเร็จ
 */
function triggerMoneyRain(originX, originY) {
    const symbols = ['💰', '💵', '🪙', '✨'];
    const particleCount = 20;

    for (let i = 0; i < particleCount; i++) {
        const el = document.createElement('div');
        el.innerText = symbols[Math.floor(Math.random() * symbols.length)];
        el.style.cssText = `
            position: fixed;
            left: ${originX}px;
            top: ${originY}px;
            font-size: ${Math.random() * 10 + 15}px;
            z-index: 30000;
            pointer-events: none;
            user-select: none;
        `;
        document.body.appendChild(el);

        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 150 + 80;
        const destX = Math.cos(angle) * velocity;
        const destY = Math.sin(angle) * velocity - 120; // ให้แรงส่งพุ่งขึ้นด้านบนเป็นหลัก

        const animation = el.animate([
            { transform: 'translate(0, 0) rotate(0deg) scale(1)', opacity: 1 },
            { transform: `translate(${destX}px, ${destY}px) rotate(${Math.random() * 1000}deg) scale(0.5)`, opacity: 0 }
        ], {
            duration: 1200 + Math.random() * 600,
            easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)'
        });

        animation.onfinish = () => el.remove();
    }
}
