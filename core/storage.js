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
let editingItemState = { type: null, index: null };

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
  folderIcons: {},
  folderThemes: {}, // Stores { folderName: { color, fontSize } }
  lockedFolders: [], // Stores folder names that should stay expanded on refresh
  exportSubfolder: "MyBackups",
  autoExportDays: 0,
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
  focusedTask: null // 🟢 { spaceId, createdAt } เก็บงานที่กำลังโฟกัสอยู่เพียงหนึ่งเดียว
};

// URL Params Logic
if (typeof window !== 'undefined') {
  const p = new URLSearchParams(window.location.search);
  const v = p.get('spaceId');
  const n = v ? parseInt(v, 10) : NaN;
  if (!Number.isNaN(n)) sharedSpaceId = n;
}

// --- Getters ---
export const getSpaces = () => spaces;
export const getCurrentSpaceId = () => currentSpaceId;
export const getAppSettings = () => appSettings;
export const getGlobalLaunchers = () => globalLaunchers;

export const getLauncherTags = () => launcherTags;
export const getFilterTags = () => currentFilterTags;
export const getFilterMode = () => currentFilterMode;
export const getSearchQuery = () => currentSearchQuery;
export const getEditingItemState = () => editingItemState;

// --- Setters ---
export function setSpaces(newSpaces) { spaces = newSpaces; }
export function setCurrentSpaceId(id) { currentSpaceId = id; }
export function setAppSettings(newSettings) { appSettings = newSettings; }
export function setGlobalLaunchers(launchers) { globalLaunchers = launchers; }
export function setLauncherTags(tags) { launcherTags = tags; }

export function setFilterTags(tags) { currentFilterTags = tags; }
export function setFilterMode(mode) { currentFilterMode = mode; }
export function setSearchQuery(query) { currentSearchQuery = query; }
export function setEditingItemState(type, index) { editingItemState = { type, index }; }

// --- Core Functions ---
let saveTimeout;
export function saveData(immediate = false) { 
    // Debounce: Wait 500ms, if called again, cancel the old one (reduces frequent saves when typing notes)
    if (saveTimeout) clearTimeout(saveTimeout);
    const performSave = () => {
        chrome.storage.local.set({ 'mySpacesData': spaces, 'lastSpaceId': currentSpaceId, 'appSettings': appSettings, 'globalLaunchers': globalLaunchers, 'launcherTags': launcherTags }); 
    };

    if (immediate) performSave();
    else saveTimeout = setTimeout(performSave, 200);
}

export function loadData(onLoadComplete) {
  chrome.storage.local.get(['mySpacesData', 'lastSpaceId', 'appSettings', 'globalLaunchers', 'launcherTags'], function(res) {
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
  });
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
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}

export function getCurrentSpace() {
    return spaces.find(s => s.id === currentSpaceId);
}
