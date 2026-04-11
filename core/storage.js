let firebaseSaveHook = null;
export const setOnSaveFirebaseHook = (cb) => { firebaseSaveHook = cb; };

let spaces = [];
let currentSpaceId = 1;
let sharedSpaceId = null;

// --- Runtime State (Filters & Search) ---
let globalLaunchers = [];
let launcherTags = [];
let currentFilterTags = [];
let currentFilterMode = 'OR';
let currentSearchQuery = "";

// --- Runtime State (UI/Modals) ---
let editingItemState = { type: null, index: null, parentIndex: null };

// --- App Settings ---
let appSettings = {
  title: "My Workspace 2.0", icon: "🚀", color: "#4a86e8",
  bgBody: "#f4f4f0",
  bgSpacebar: "#ebebe6",
  bgCard: "#ffffff",
  textMain: "#111111",
  fontSize: 15,
  spacebarTextColor: "#555555",
  spacebarFontSize: 13,
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  noteFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  isTabsCollapsed: false, 
  isResourcesCollapsed: false, showTaskActions: false,
  isTasksCollapsed: false,
  isDarkMode: false, quickColors: ["#ff4d4f", "#4a86e8", "#52c41a"],
  quickNoteState: { float: false, collapsed: false, x: 100, y: 100, w: 350, h: 400 },
  habitState: { open: false, x: 400, y: 80 },
  dashboardQuickNote: { 
    isOpen: false, 
    isPinned: false,
    mode: 'local', 
    content: "", 
    keepUrl: "", 
    x: 100, 
    y: 100, 
    w: 350, 
    h: 400 
  },
  hideCompletedHabits: false,
  showHabitActions: false,
  taskSectionOrder: 'todo-first', // 'todo-first' or 'note-first'
  quickNoteLocation: 'tasks', // 'tasks' or 'tabs'
  folderIcons: {},
  folderThemes: {}, // Stores { folderName: { color, fontSize } }
  lockedFolders: [], // Stores folder names that should stay expanded on refresh
  exportSubfolder: "MyBackups",
  autoExportDays: 0,
  autoExportTime: "00:00",
  exportTarget: "computer", // 'computer' or 'mobile'
  autoDeleteDays: 30, // ค่าเริ่มต้น 30 วัน
  lastExportTimestamp: 0,
  focusPopupState: {
    isOpen: false,
    isMinimized: false,
    x: 100,
    y: 100,
    w: 250,
    h: 150,
    collapsed: false
  },
  lastUpdated: 0, // 🟢 เก็บเวลาล่าสุดที่มีการแก้ไขข้อมูล
  focusedTask: null // 🟢 { spaceId, createdAt } เก็บงานที่กำลังโฟกัสอยู่เพียงหนึ่งเดียว
};

// 🏠 Device-Specific Settings (ไม่ซิงค์ข้ามเครื่อง, ไม่อยู่ในไฟล์ Backup)
let localSettings = {
    firebaseAutoSync: false,
    autoSyncSessionExpiry: 0
};

// URL Params Logic
if (typeof window !== 'undefined') {
  const p = new URLSearchParams(window.location.search);
  const v = p.get('spaceId');
  const n = v ? parseInt(v, 10) : NaN;
  if (!Number.isNaN(n)) sharedSpaceId = n;
}

// --- Hybrid Storage Helpers ---
/**
 * Saves a key-value pair (or multiple pairs if data is an object) to either chrome.storage.local or localStorage.
 * @param {string|object} key The key to store the data under, or an object of key-value pairs.
 * @param {*} [value] The data to store if `key` is a string.
 * @returns {Promise<void>} A promise that resolves when the data is saved.
 */
export async function saveDataItem(key, value) {
  const dataToSave = typeof key === 'object' ? key : { [key]: value };
  return new Promise(resolve => {
    // 1. บันทึกลง localStorage เสมอเพื่อความปลอดภัย (Redundancy) สำหรับ Web App/PWA
    for (const k in dataToSave) {
      localStorage.setItem(k, JSON.stringify(dataToSave[k]));
    }

    // 2. บันทึกลง chrome.storage.local หากใช้งานผ่าน Extension
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(dataToSave, resolve);
    } else {
      resolve();
    }
  });
}

/**
 * Loads data for a given key (or multiple keys) from either chrome.storage.local or localStorage.
 * @param {string|string[]} keys The key(s) to retrieve the data for.
 * @returns {Promise<object>} A promise that resolves with an object containing the retrieved data.
 */
export async function loadDataItem(keys) {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, resolve); // result will be an object {key: value, ...}
    } else {
      const result = {};
      const keysArray = Array.isArray(keys) ? keys : [keys];
      keysArray.forEach(key => {
        const value = localStorage.getItem(key);
        try { result[key] = JSON.parse(value); }
        catch (e) { result[key] = value; } // Return as-is if not valid JSON
      });
      resolve(result);
    }
  });
}

// --- Getters ---
export const getSpaces = () => spaces;
export const getCurrentSpaceId = () => currentSpaceId;
export const getAppSettings = () => appSettings;
export const getLocalSettings = () => localSettings; // 🟢 Getter ใหม่
export const getGlobalLaunchers = () => globalLaunchers;

export const getLauncherTags = () => launcherTags;
export const getFilterTags = () => currentFilterTags; 

// 🟢 ปรับปรุงให้คืนค่า Filter Mode แยกตาม Space
export const getFilterMode = () => {
    const space = getCurrentSpace();
    if (space) return space.currentFilterMode || 'OR';
    return appSettings.masterFilterMode || 'OR'; // สำหรับ Command Center
};

export const getSearchQuery = () => currentSearchQuery;
export const getEditingItemState = () => editingItemState;

// --- Setters ---
export function setSpaces(newSpaces) { spaces = newSpaces; }
export function setCurrentSpaceId(id) { currentSpaceId = id; }
export function setAppSettings(newSettings) { appSettings = newSettings; }
export function setGlobalLaunchers(launchers) { globalLaunchers = launchers; }
export function setLauncherTags(tags) { launcherTags = tags; }

export function setFilterTags(tags) { currentFilterTags = tags; }
// 🟢 ปรับปรุงให้บันทึก Filter Mode แยกตาม Space
export function setFilterMode(mode) { 
    const space = getCurrentSpace();
    if (space) space.currentFilterMode = mode;
    else appSettings.masterFilterMode = mode;
    currentFilterMode = mode; 
}
export function setSearchQuery(query) { currentSearchQuery = query; }
export function setEditingItemState(type, index, parentIndex = null) { 
    editingItemState = { type, index, parentIndex }; 
}

// --- Core Functions ---
let saveTimeout;
export function saveData(immediate = false) { 
    // Debounce: Wait 500ms, if called again, cancel the old one (reduces frequent saves when typing notes)
    if (saveTimeout) clearTimeout(saveTimeout);
    const performSave = async () => {
        // ⏱️ อัปเดต Timestamp ทุกครั้งก่อนบันทึกจริง เพื่อระบุว่าข้อมูลก้อนนี้คือเวอร์ชันล่าสุด
        appSettings.lastUpdated = Date.now();
        const data = { 
            'mySpacesData': spaces,     // 🟢 ซิงค์รายการ Space ทั้งหมด (รวมที่สร้างใหม่)
            'lastSpaceId': currentSpaceId, // 🟢 ซิงค์ตำแหน่ง Space ล่าสุดที่เปิด
            'appSettings': appSettings,   // 🟢 รวมสถานะการพับโฟลเดอร์ (collapsedFolders)
            'globalLaunchers': globalLaunchers, 
            'launcherTags': launcherTags 
        };
        
        // 🏠 บันทึก Local Settings แยกต่างหาก (ไม่ส่งเข้า Firebase Hook)
        await saveDataItem('myLocalDeviceSettings', localSettings);

        // 🟢 เรียกใช้ Firebase Hook ถ้ามีการลงทะเบียนไว้
        if (firebaseSaveHook) firebaseSaveHook(data);
        
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            saveDataItem(data); 
        } else {
            // Fallback for Web/Mobile (localStorage)
            Object.keys(data).forEach(key => {
                saveDataItem(key, data[key]);
            });
        }
    };

    if (immediate) performSave();
    else saveTimeout = setTimeout(performSave, 200);
}
 
export async function loadData(onLoadComplete) {
  const keys = ['mySpacesData', 'lastSpaceId', 'appSettings', 'globalLaunchers', 'launcherTags', 'myLocalDeviceSettings'];
  const loadedData = await loadDataItem(keys);
 
  const processResult = (res) => {
    // 🏠 โหลดข้อมูลเฉพาะเครื่อง
    if (res && res.myLocalDeviceSettings) {
        localSettings = { ...localSettings, ...res.myLocalDeviceSettings };
    }

    // Add check for res to prevent undefined
    if (res && res.mySpacesData && res.mySpacesData.length > 0) {
      spaces = res.mySpacesData;
      currentSpaceId = (res.lastSpaceId !== undefined) ? res.lastSpaceId : spaces[0].id;
    } else {
      spaces = [{ id: 1, name: "My First Space", iconType: "emoji", icon: "📄", tabs: [], resources: [], driveFiles: [], note: "", tasks: [], tags: [] }];
    }
 
    if (sharedSpaceId !== null && (sharedSpaceId === 0 || spaces.some((s) => s.id === sharedSpaceId))) {
      currentSpaceId = sharedSpaceId;
    }
    
    if (res && res.appSettings) { 
        // Merge default settings to ensure new keys exist
        if(!res.appSettings.quickNoteState) res.appSettings.quickNoteState = { float: false, collapsed: false, x: 100, y: 100, w: 350, h: 400 };
        if(!res.appSettings.habitState) res.appSettings.habitState = { open: false, x: 400, y: 80 };
        if(!res.appSettings.dashboardQuickNote) {
            res.appSettings.dashboardQuickNote = { isOpen: false, isPinned: false, mode: 'local', content: "", keepUrl: "", x: 100, y: 100, w: 350, h: 400 };
        } else if (res.appSettings.dashboardQuickNote.isPinned === undefined) {
            res.appSettings.dashboardQuickNote.isPinned = false;
        }
        if(!res.appSettings.focusPopupState) res.appSettings.focusPopupState = { isOpen: false, isMinimized: false, x: 100, y: 100, w: 250, h: 150, collapsed: false };
        appSettings = { ...appSettings, ...res.appSettings }; 
    }
    
    if(!appSettings.quickColors) appSettings.quickColors = ["#ff4d4f", "#4a86e8", "#52c41a"];
 
    if (res && res.globalLaunchers) { globalLaunchers = res.globalLaunchers; }
    if (res && res.launcherTags) { launcherTags = res.launcherTags; }
 
    // Migration for users who have launcher tags but not the central list
    if ((!launcherTags || launcherTags.length === 0) && globalLaunchers.length > 0) {
        const existingTags = new Set(globalLaunchers.map(l => l.tag).filter(t => t));
        launcherTags = Array.from(existingTags);
    }
 
    if (onLoadComplete) onLoadComplete();
  };
 
  processResult(loadedData);
}

/**
 * ลบรายการที่อยู่ในถังขยะเกินระยะเวลาที่กำหนดแบบถาวร
 */
export function performAutoCleanup() {
    const settings = getAppSettings();
    const currentSettingsDays = settings.autoDeleteDays || 0;
    if (currentSettingsDays <= 0) return false;

    const now = Date.now();
    let hasChanged = false;

    const isExpired = (item) => {
        if (!item.isDeleted) return false;
        // ใช้ expiryAt ที่ถูก Lock ไว้ตอนลบ หรือ fallback เป็น Setting ปัจจุบันสำหรับของเก่า
        const expiryAt = item.expiryAt || (item.deletedAt ? (item.deletedAt + (currentSettingsDays * 24 * 60 * 60 * 1000)) : 0);
        return expiryAt > 0 && now > expiryAt;
    };

    // 1. ลบ Spaces
    const prevSpacesLen = spaces.length;
    spaces = spaces.filter(s => !isExpired(s));
    if (spaces.length !== prevSpacesLen) hasChanged = true;

    // 2. ลบ Resources, Drive Files และ Tasks ในแต่ละ Space
    spaces.forEach(space => {
        ['resources', 'driveFiles', 'tasks'].forEach(key => {
            if (space[key]) {
                const before = space[key].length;
                space[key] = space[key].filter(item => !isExpired(item));
                if (space[key].length !== before) hasChanged = true;
            }
        });
    });

    if (hasChanged) saveData();
    return hasChanged;
}

export function getShortDate(d = new Date()) { 
    const m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const yearBE = d.getFullYear() + 543;
    return `${String(d.getDate()).padStart(2, '0')} ${m[d.getMonth()]} ${String(yearBE).slice(-2)}`;
}

export function getCurrentSpace() {
    return spaces.find(s => s.id === currentSpaceId);
}

// Helper function to convert unit char to Thai unit
export function getThaiUnit(unitChar) {
    if (unitChar === 'b') return 'บาท';
    if (unitChar === 't') return 'นาที';
    if (unitChar === 'i') return 'อัน';
    return '';
}

// Helper function to convert Thai unit to unit char
export function getUnitCharFromThai(thaiUnit) {
    if (thaiUnit === 'บาท') return 'b';
    if (thaiUnit === 'นาที') return 't';
    if (thaiUnit === 'อัน') return 'i';
    return '';
}
