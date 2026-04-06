// features/googleTasks.js
import { saveData, getSpaces, getCurrentSpaceId, loadData, setCurrentSpaceId, getCurrentSpace, getAppSettings } from '../core/storage.js';
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

        // Deep Sync & Remove Duplicates
        if (e.target.closest('#btn-deep-sync-duplicates')) {
            deepSyncAndRemoveDuplicates();
        }

        // 🟢 เพิ่มตัวดักจับคลิกสำหรับปุ่ม Reset All sync IDs
        if (e.target.closest('#btn-reset-all-sync-ids')) {
            resetAllSyncIds();
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
        // If sync is disabled, no changes are expected, so no need to send completion message
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
                    const gt = googleMap[t.googleTaskId];

                    if (gt) {
                        // ซิงค์สถานะการเสร็จงาน
                        const isDone = gt.status === 'completed';
                        if (t.completed !== isDone) {
                            // 🟢 หากงานเพิ่งเสร็จสมบูรณ์จาก Google Tasks ให้เรียกเครื่องสแกนรางวัล
                            if (isDone && !t.completed && window.processRewardScanner) {
                                window.processRewardScanner(t.text, false, null, 'task', currentSpace.id);
                            }

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

                        // 🟢 ซิงค์วันที่ (Sync Due Date) หากมีการแก้ไขใน Google Task
                        const gDue = gt.due ? formatDate(gt.due) : null;
                        if (t.dueDate !== gDue) {
                            t.dueDate = gDue;
                            hasChanged = true;
                        }
                    } else {
                        // 🔴 งานใน Google หายไป -> ย้ายลงถังขยะในแอป (แทนการลบถาวร) เพื่อให้สอดคล้องกับพฤติกรรมใน Web App
                        t.isDeleted = true;
                        t.deletedAt = Date.now();
                        const settings = (typeof getAppSettings === 'function') ? getAppSettings() : { autoDeleteDays: 30 };
                        const days = settings.autoDeleteDays || 30;
                        t.expiryAt = t.deletedAt + (days * 24 * 60 * 60 * 1000);
                        t.googleTaskId = null; // ตัดการเชื่อมต่อ
                        t.completed = false; // ปรับสถานะเพื่อให้กู้คืนได้ง่าย

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
    }

    if (hasChanged) {
        saveData(true); // 🟢 ใช้โหมดบันทึกทันที (Immediate) เพื่อป้องกันหน้าจอดึงข้อมูลเก่าไปวาดใหม่ก่อนเซฟเสร็จ
    }
    
    if (hasChanged) { // 🟢 แจ้งเตือนและเรียก onRenderRef เฉพาะเมื่อมีข้อมูลเปลี่ยนแปลงจริง
        chrome.runtime.sendMessage({ type: 'GOOGLE_TASKS_SYNC_COMPLETE' }).catch(() => {});
        if (onRenderRef) {
            onRenderRef();
            console.log("UI re-rendered due to Google Tasks sync changes.");
        }
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
/** 🎯 ฟังก์ชันหา List ID ที่ถูกต้องสำหรับ Space (ใช้ทั้ง Global และ Specific) */
export const getCurrentGoogleListId = (space) => {
    if (space && space.isSpecificListEnabled && space.googleTaskListId) {
        return space.googleTaskListId;
    }
    return currentGoogleListId;
}

/**
 * 🛠️ Deep Sync: Scans Google Tasks for duplicates and removes them.
 * Prioritizes tasks linked to local items.
 */
export async function deepSyncAndRemoveDuplicates() {
    if (!confirm("⚠️ Deep Sync & Remove Duplicates?\n\nThis will scan all your Google Task lists linked to this app, identify duplicate tasks (based on title), and delete all but one instance of each duplicate. Tasks linked to your local app data will be prioritized. This action cannot be undone.")) return;

    const status = getGoogleStatus();
    if (!status.googleAuthToken) {
        alert("Please connect to Google Tasks first.");
        return;
    }

    const allSpaces = getSpaces();
    const listIdsToSync = new Set([status.currentGoogleListId]);
    allSpaces.forEach(s => {
        if (s.isSpecificListEnabled && s.googleTaskListId) {
            listIdsToSync.add(s.googleTaskListId);
        }
    });

    let totalDeleted = 0;
    let errors = 0;

    for (const listId of listIdsToSync) {
        try {
            const data = await fetchGoogleAPI(`/lists/${listId}/tasks?showCompleted=false&showHidden=false`);
            if (!data || !data.items) continue;

            const tasksInList = data.items;
            const duplicatesMap = new Map(); // Map<normalizedTitle, GoogleTask[]>

            tasksInList.forEach(task => {
                const normalizedTitle = task.title.toLowerCase().trim();
                if (!duplicatesMap.has(normalizedTitle)) {
                    duplicatesMap.set(normalizedTitle, []);
                }
                duplicatesMap.get(normalizedTitle).push(task);
            });

            for (const [title, tasks] of duplicatesMap.entries()) {
                if (tasks.length <= 1) continue; // Not a duplicate

                console.log(`Found duplicates for "${title}":`, tasks.map(t => t.id));

                let tasksToKeep = [];
                let tasksToDelete = [];

                // Prioritize tasks linked to local data
                let linkedTasks = [];
                tasks.forEach(gTask => {
                    let isLinkedLocally = false;
                    allSpaces.some(space => {
                        const checkTasks = (localTasks) => {
                            return localTasks.some(lTask => {
                                if (lTask.googleTaskId === gTask.id) {
                                    isLinkedLocally = true;
                                    return true;
                                }
                                if (lTask.subtasks) return checkTasks(lTask.subtasks);
                                return false;
                            });
                        };
                        return checkTasks(space.tasks || []);
                    });
                    if (isLinkedLocally) linkedTasks.push(gTask);
                    else tasksToDelete.push(gTask); // Initially mark unlinked as candidates for deletion
                });

                if (linkedTasks.length > 0) tasksToKeep.push(linkedTasks[0]); // Keep the first linked task
                else tasksToKeep.push(tasks.sort((a, b) => (a.updated ? new Date(a.updated).getTime() : 0) - (b.updated ? new Date(b.updated).getTime() : 0) || a.id.localeCompare(b.id))[0]); // Keep oldest if no local link
                
                tasksToDelete = tasksToDelete.concat(tasks.filter(t => !tasksToKeep.includes(t)));

                for (const taskToDelete of tasksToDelete) {
                    try {
                        await fetchGoogleAPI(`/lists/${listId}/tasks/${taskToDelete.id}`, 'DELETE');
                        totalDeleted++;
                    } catch (deleteError) {
                        console.error(`Failed to delete Google Task ${taskToDelete.id} from list ${listId}:`, deleteError);
                        errors++;
                    }
                }
            }
        } catch (listError) {
            console.error(`Failed to fetch tasks for list ${listId}:`, listError);
            errors++;
        }
    }

    if (totalDeleted > 0) {
        alert(`Deep Sync complete. ${totalDeleted} duplicate tasks deleted from Google Tasks. ${errors} errors encountered.`);
        await syncAllGoogleTasks(); // Trigger a full sync to update local state after deletions
    } else {
        alert(`Deep Sync complete. No duplicate tasks found. ${errors} errors encountered.`);
    }
}

/**
 * 🔌 Reset All Sync IDs: ล้าง googleTaskId ออกจากทุกงานในทุก Space
 * เพื่อตัดการเชื่อมต่อและเริ่มซิงค์ใหม่สำหรับงานที่เจอปัญหา
 */
export async function resetAllSyncIds() {
    if (!confirm("⚠️ Reset All Sync IDs?\n\nการดำเนินการนี้จะตัดการเชื่อมต่อระหว่างงานในแอปกับ Google Tasks ทั้งหมด (แต่จะไม่ลบงานทิ้ง) เหมาะสำหรับใช้แก้ปัญหาเวลาข้อมูลไม่ตรงกันหรือหาคู่ซิงค์ไม่เจอ\n\nต้องการดำเนินการต่อหรือไม่?")) return;

    const allSpaces = getSpaces();
    let count = 0;

    const processList = (tasks) => {
        tasks.forEach(t => {
            if (t && t.googleTaskId) {
                t.googleTaskId = null;
                count++;
            }
            if (t && t.subtasks) processList(t.subtasks);
        });
    };

    allSpaces.forEach(space => {
        if (space.tasks) processList(space.tasks);
    });

    saveData(true);
    alert(`ดำเนินการรีเซ็ตเรียบร้อย ตัดการเชื่อมต่อทั้งหมด ${count} รายการ`);
    if (onRenderRef) onRenderRef();
}
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