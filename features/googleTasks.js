// features/googleTasks.js
import { saveData, getSpaces, getCurrentSpaceId, loadData, setCurrentSpaceId, getCurrentSpace } from '../core/storage.js';
import { googleTasksIcon } from '../core/icons.js';

let googleAuthToken = null;
let currentGoogleListId = '@default';
let isGoogleSyncEnabled = true;
let cachedGoogleLists = null; // Cache to populate UI without redundant API calls
let onRenderRef = null;

// Function to save auth token
function setGoogleAuthToken(token) {
    googleAuthToken = token;
    chrome.storage.local.set({ 'googleAuthToken': token });
}

// Function to save current Google List ID
function setCurrentGoogleListId(listId) {
    currentGoogleListId = listId;
    chrome.storage.local.set({ 'savedGoogleTasksListId': listId });
}

// Function to save sync enabled state
function setIsGoogleSyncEnabled(enabled) {
    isGoogleSyncEnabled = enabled;
    chrome.storage.local.set({ 'isGoogleSyncEnabled': enabled });
}

/**
 * 🎵 สร้างเสียงคลิกเบาๆ เพื่อเป็น Feedback การเปลี่ยนสถานะ
 */
function playClickSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
}

export function initGoogleTasks(callbacks) {
    const { onRender } = callbacks;
    onRenderRef = onRender;

    // Load persistent state from storage
    chrome.storage.local.get(['savedGoogleTasksListId', 'googleAuthToken', 'isGoogleSyncEnabled'], (res) => {
        if (res.savedGoogleTasksListId) {
            currentGoogleListId = res.savedGoogleTasksListId;
        }
        if (res.googleAuthToken) {
            googleAuthToken = res.googleAuthToken;
        }
        if (typeof res.isGoogleSyncEnabled !== 'undefined') {
            isGoogleSyncEnabled = res.isGoogleSyncEnabled;
        }

        // Initial UI update based on loaded state
        if (googleAuthToken) {
            updateLoginUI();
            updateToggleIcon();
            fetchGoogleLists(); // โหลดรายการ List
            syncAllGoogleTasks(); // ซิงค์ทันทีเมื่อโหลดข้อมูลเสร็จ
        }
    });

    document.addEventListener('click', (e) => {
        // --- Space Specific List Toggle ---
        const btnToggleSpecific = e.target.closest('#btn-toggle-specific-list');
        if (btnToggleSpecific) {
            const space = getCurrentSpace();
            if (space) {
                space.isSpecificListEnabled = !space.isSpecificListEnabled;
                // หากปิดการใช้งาน ให้เคลียร์ ID เฉพาะของ Space ทิ้งเพื่อให้กลับไปใช้ Global
                if (!space.isSpecificListEnabled) {
                    delete space.googleTaskListId;
                }
                saveData(true); // 🟢 บันทึกทันทีเพื่อป้องกันข้อมูลเด้งกลับตอน Sync
                updateGoogleTaskUI(space);
                playClickSound(); // 🔊 เล่นเสียงเมื่อกดปุ่มสลับโหมด
            }
        }

        // 3. ปุ่ม Toggle (เปิด/ปิดการซิงค์)
        const toggleBtn = e.target.closest('#btn-sync-toggle') || e.target.closest('#btn-master-sync-toggle');
        if (toggleBtn) {
            toggleGoogleSync();
            updateToggleIcon(); // จะอัปเดตทุกปุ่มที่มี class btn-sync-toggle
            if (isGoogleSyncEnabled) syncAllGoogleTasks();
            else onRender(); // สั่ง Render ใหม่เพื่ออัปเดต UI
        }

        // 1. ปุ่ม Login
        if (e.target.closest('#connect-google-btn') || e.target.closest('#master-connect-google-btn')) {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError) return;
                setGoogleAuthToken(token);
                updateLoginUI();
                fetchGoogleLists();
            });
        }
    });

    // 4. ตรวจสอบ Token เงียบๆ (Silent Auth) - to refresh token or initial load if not in storage
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
            setGoogleAuthToken(token);
            updateLoginUI();
            updateToggleIcon();
            fetchGoogleLists();
            syncAllGoogleTasks();
        } else {
            // If silent auth fails, clear token from storage
            setGoogleAuthToken(null);
            updateLoginUI(); // Update UI to logged out state
        }
    });

    // 5. Automatic Periodic Sync (Pull from Google every 1 minute) - REMOVED
    // This is replaced by chrome.alarms in background.js for better background process management.
}

export function toggleGoogleSync() {
    setIsGoogleSyncEnabled(!isGoogleSyncEnabled); // ใช้ Setter เพื่อบันทึกลง Storage ด้วย
    return isGoogleSyncEnabled;
}

export async function fetchGoogleAPI(endpoint, method = 'GET', body = null) {
    if (!googleAuthToken) return null;
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${googleAuthToken}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);
    const url = endpoint.startsWith('http') ? endpoint : `https://tasks.googleapis.com/tasks/v1${endpoint}`;
    try {
        const res = await fetch(url, options);
        if (!res.ok) return null; // จัดการ Error กรณี Token หมดอายุ หรือหาข้อมูลไม่เจอ
        return method !== 'DELETE' ? await res.json() : true;
    } catch (e) { return null; }
}

/**
 * Creates a new task in Google Tasks.
 * To create a subtask, the parent ID must be passed as a query parameter.
 * @param {string} listId - The ID of the task list.
 * @param {Object} taskData - The task resource body.
 * @param {string|null} parentGoogleTaskId - Optional ID of the parent task for nesting.
 */
export async function createGoogleTask(listId, taskData, parentGoogleTaskId = null) {
    let url = `/lists/${listId}/tasks`;
    if (parentGoogleTaskId) {
        url += `?parent=${parentGoogleTaskId}`;
    }
    return await fetchGoogleAPI(url, 'POST', taskData);
}

export async function fetchGoogleLists() {
    // If we don't have a cache, fetch from API
    if (!cachedGoogleLists) {
        const data = await fetchGoogleAPI('/users/@me/lists');
        if (data && data.items) {
            cachedGoogleLists = data.items;
        }
    }

    if (cachedGoogleLists) {
        const space = getCurrentSpace();
        const effectiveListId = (space && space.isSpecificListEnabled && space.googleTaskListId) ? space.googleTaskListId : currentGoogleListId;

        const selectors = ['google-task-list-select', 'google-task-list-select-master'];
        selectors.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            select.innerHTML = cachedGoogleLists.map(list => 
                `<option value="${list.id}" ${list.id === effectiveListId ? 'selected' : ''}>${list.title}</option>`
            ).join('');
            
            // Show the container if it's the main settings one
            const controls = document.getElementById('google-task-controls');
            if (controls && id === 'google-task-list-select') controls.style.display = 'flex';
            if (id === 'google-task-list-select-master') select.style.display = 'inline-block';

            select.onchange = (e) => {
                const newListId = e.target.value;
                const curSpace = getCurrentSpace();
                if (curSpace && curSpace.isSpecificListEnabled) {
                    curSpace.googleTaskListId = newListId;
                } else {
                    setCurrentGoogleListId(newListId);
                }
                saveData(true); // 🟢 บันทึกทันทีเพื่อให้สถานะ Lock (สีแดง) ติดทันทีและป้องกันข้อมูลกระโดดกลับ
                syncAllGoogleTasks();
                if (onRenderRef) onRenderRef();
                playClickSound(); // 🔊 เล่นเสียงเมื่อเลือกรายการสำเร็จ (Lock สำเร็จ)
            };
        });
        if (space) updateGoogleTaskUI(space);
    }
}

/**
 * อัปเดตสถานะปุ่มและค่าใน Select ตามการตั้งค่าของ Space ปัจจุบัน
 */
export function updateGoogleTaskUI(space) {
    const btn = document.getElementById('btn-toggle-specific-list');
    const select = document.getElementById('google-task-list-select');
    if (!space || !btn || !select) return;

    const isEnabled = !!space.isSpecificListEnabled;
    const isChosen = !!space.googleTaskListId;

    // 🟢 แสดงสีแดงเมื่อ Lock สำเร็จ (มี ID เฉพาะ) และสีเขียวเมื่อเพิ่งเปิด (ยังไม่ได้เลือกรายการใหม่)
    btn.classList.toggle('active', isEnabled && isChosen);
    btn.classList.toggle('ready', isEnabled && !isChosen);
    btn.title = isEnabled ? (isChosen ? "Space-Specific List: Locked" : "Ready to Lock: Please select a list below") : "Global List Mode";

    const listIdToSet = isEnabled ? (space.googleTaskListId || currentGoogleListId) : currentGoogleListId;
    if (select.value !== listIdToSet) select.value = listIdToSet;
    select.disabled = false; // 🔓 ปลดล็อคให้เปลี่ยนรายการได้ตามต้องการ
}

export async function syncAllGoogleTasks() {
    // Notify UI that sync has started
    chrome.runtime.sendMessage({ type: 'GOOGLE_TASKS_SYNC_START' }).catch(() => {});

    let hasChanged = false; // ประกาศไว้ที่ระดับบนสุดของฟังก์ชันเพื่อให้ทุกส่วนเข้าถึงได้

    // 🟢 แก้ไขบัค Revert: ถ้าทำงานอยู่ในหน้าเว็บ (UI) ให้ใช้ข้อมูลในแรม ไม่ต้องโหลดจาก Disk
    // เพื่อป้องกันข้อมูลที่เพิ่งเปลี่ยนถูกข้อมูลเก่าใน Disk เขียนทับระหว่างจังหวะบันทึก
    if (typeof window === 'undefined') {
        await new Promise(resolve => loadData(resolve));
    }

    const res = await chrome.storage.local.get(['googleAuthToken', 'savedGoogleTasksListId', 'isGoogleSyncEnabled']);
    
    googleAuthToken = res.googleAuthToken; // อัปเดต Token ใน Module
    const listId = res.savedGoogleTasksListId || '@default';
    const syncEnabled = typeof res.isGoogleSyncEnabled !== 'undefined' ? res.isGoogleSyncEnabled : true;

    if (!googleAuthToken || !syncEnabled) {
        chrome.runtime.sendMessage({ type: 'GOOGLE_TASKS_SYNC_COMPLETE' }).catch(() => {});
        return;
    }

    const allSpaces = getSpaces();
    // รวบรวม List IDs ทั้งหมดที่ต้องซิงค์ (Global + ราย Space ที่ตั้งไว้)
    const listIdsToSync = new Set([listId]);
    allSpaces.forEach(s => {
        if (s.isSpecificListEnabled && s.googleTaskListId) {
            listIdsToSync.add(s.googleTaskListId);
        }
    });

    const localTaskIds = new Set();

    for (const syncListId of listIdsToSync) {
        const data = await fetchGoogleAPI(`/lists/${syncListId}/tasks?showCompleted=true&showHidden=true`);
        if (!data || !data.items) continue;

        const googleMap = {};
        data.items.forEach(gt => googleMap[gt.id] = gt);
        
        // --- ขั้นตอนที่ 1: ตรวจสอบงานใน Local เทียบกับ Google ---
        const processLocalTasks = (tasks, currentSpace) => {
            // ตรวจสอบว่า Space นี้กำลังใช้ List ที่กำลังซิงค์อยู่หรือไม่
            const effectiveListForSpace = currentSpace.isSpecificListEnabled ? (currentSpace.googleTaskListId || listId) : listId;
            if (effectiveListForSpace !== syncListId) return;

            for (let i = tasks.length - 1; i >= 0; i--) {
                const t = tasks[i];
                if (!t) continue; // Ensure task is not null or undefined
                if (t.googleTaskId) {
                    localTaskIds.add(t.googleTaskId);
                    const gt = googleMap[t.googleTaskId];

                    if (gt) {
                        // ซิงค์สถานะการเสร็จงาน
                        const isDone = gt.status === 'completed';
                        if (t.completed !== isDone) {
                            t.completed = isDone;
                            t.isDeleted = false; // If Google says it's completed/uncompleted, it's not in local trash
                            t.completedAt = isDone ? (t.completedAt || Date.now()) : null;
                            if (isDone) t.isProminent = false;
                            hasChanged = true;

                            // Cascading Completion: If main task is completed on Google, complete subtasks locally and on Google
                            if (isDone && t.subtasks && t.subtasks.length > 0) {
                                t.subtasks.forEach(sub => {
                                    if (!sub || sub.completed) return;
                                    sub.completed = true;
                                    // Auto-Complete Subtasks in Google Tasks backend if synced
                                    sub.isDeleted = false; // Also ensure subtasks are not marked as deleted
                                    if (sub.googleTaskId && syncEnabled && googleAuthToken) {
                                        fetchGoogleAPI(`/lists/${syncListId}/tasks/${sub.googleTaskId}`, 'PATCH', { status: 'completed' });
                                    }
                                });
                            }
                        }

                        // ซิงค์ชื่อ (โดยการลบ Suffix พื้นที่ออก)
                        let cleanTitleFromGoogle = gt.title;
                        const spaceSuffix = ` (S: ${currentSpace.name})`;
                        if (cleanTitleFromGoogle.endsWith(spaceSuffix)) {
                            cleanTitleFromGoogle = cleanTitleFromGoogle.substring(0, cleanTitleFromGoogle.length - spaceSuffix.length).trim();
                        }
                        if (t.text !== cleanTitleFromGoogle) {
                            t.text = cleanTitleFromGoogle;
                            hasChanged = true;
                        }
                    } else {
                        // งานใน Google หายไป -> ลบในแอปด้วย
                        tasks.splice(i, 1);
                        hasChanged = true;
                        continue;
                    }
                }
                if (t.subtasks) processLocalTasks(t.subtasks, currentSpace);
            }
        };

        allSpaces.forEach(space => { 
            if (space.tasks) processLocalTasks(space.tasks, space); 
        });

        // --- ขั้นตอนที่ 2: ตรวจสอบงานใหม่จาก Google ที่ยังไม่มีในแอป ---
        for (const gId in googleMap) {
            if (!localTaskIds.has(gId)) {
                const gt = googleMap[gId];
                if (gt.status === 'completed' && !gt.title) continue; // ข้ามงานที่เสร็จแล้วและไม่มีชื่อ

                const match = gt.title.match(/\(S: (.+?)\)$/);
                let targetSpace = null;
                let cleanTitle = gt.title;

                if (match) {
                    targetSpace = allSpaces.find(s => s.name === match[1]);
                    cleanTitle = gt.title.substring(0, gt.title.length - match[0].length).trim();
                }

                if (!targetSpace) {
                    targetSpace = allSpaces.find(s => {
                        const sListId = s.isSpecificListEnabled ? (s.googleTaskListId || listId) : listId;
                        return sListId === syncListId;
                    });
                }

                if (targetSpace) {
                    if (!targetSpace.tasks) targetSpace.tasks = [];
                    targetSpace.tasks.push({
                        text: cleanTitle,
                        completed: gt.status === 'completed',
                        isDeleted: false, // Newly added tasks from Google are never deleted
                        dueDate: gt.due ? formatDate(gt.due) : null,
                        createdAt: Date.now(),
                        googleTaskId: gt.id,
                        isProminent: false,
                        tags: [],
                        subtasks: []
                    });
                    hasChanged = true;
                }
            }
        }
    }

    if (hasChanged) {
        saveData();
    }
    // แจ้งเตือน UI ว่าซิงค์เสร็จสิ้น
    chrome.runtime.sendMessage({ type: 'GOOGLE_TASKS_SYNC_COMPLETE' }).catch(() => {});

    // 🟢 NEW: Call onRenderRef directly after sync completes to ensure UI update
    if (onRenderRef) {
        onRenderRef();
    }
}

function updateLoginUI() {
    const btn = document.getElementById('connect-google-btn');
    if (btn) {
        // Show active state with Check icon
        // Use Google Icon but Green background
        btn.innerHTML = `<svg style="width:20px;height:20px;"><use href="#icon-google-minimal"></use></svg>`;
        btn.title = "Connected";
        
        // Style for connected state (Green Circle)
        btn.style.background = '#34a853';
        btn.style.color = '#ffffff';
    }

    const masterBtn = document.getElementById('master-connect-google-btn');
    if (masterBtn) {
        masterBtn.innerHTML = `<svg style="width:20px;height:20px;"><use href="#icon-google-minimal"></use></svg>`;
        masterBtn.title = "Connected";
        masterBtn.style.background = '#34a853';
        masterBtn.style.color = '#ffffff';
    }
}

function updateToggleIcon() {
    const btns = document.querySelectorAll('.btn-sync-toggle');
    const computerIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="12" y1="17" x2="12" y2="21"></line><line x1="8" y1="21" x2="16" y2="21"></line></svg>`;

    btns.forEach(btn => {
        if(isGoogleSyncEnabled) { 
            btn.innerHTML = googleTasksIcon;
            btn.classList.add('active'); 
        } else { 
            btn.innerHTML = computerIcon;
            btn.classList.remove('active'); 
        }
    });
}

// Helper function to format date to YYYY-MM-DD
const formatDate = (dateString) => {
    if (!dateString) return null;
    try {
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return null;
    }
};

export const getGoogleAuthToken = () => googleAuthToken;
export const getCurrentGoogleListId = () => currentGoogleListId;
export const getIsGoogleSyncEnabled = () => isGoogleSyncEnabled; // เปลี่ยนชื่อเพื่อหลีกเลี่ยงความขัดแย้ง
export const getGoogleStatus = () => ({ googleAuthToken, isGoogleSyncEnabled, currentGoogleListId }); // เก็บไว้เพื่อความเข้ากันได้ย้อนหลังหากโมดูลอื่นใช้

/**
 * 🎯 ฟังก์ชันหา List ID ที่ถูกต้องสำหรับ Space (ใช้ทั้ง Global และ Specific)
 */
export function getTargetListId(space) {
    if (space && space.isSpecificListEnabled && space.googleTaskListId) {
        return space.googleTaskListId;
    }
    return currentGoogleListId;
}