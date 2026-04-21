import { 
    getCurrentSpace, getCurrentSpaceId, getFilterTags, getFilterMode, getSearchQuery, 
    setFilterTags, setFilterMode, saveData, loadData,
    setCurrentSpaceId, setAppSettings, getAppSettings 
} from './storage.js';
import { applyAppSettings } from './settings-manager.js';
import { renderTabs } from '../components/tabs.js';
import { renderResources, renderDriveFiles } from '../components/resources.js';
import { renderTasks, renderQuickNotes } from '../features/todoManager.js';
import { renderTagBar } from '../components/tagBar.js';
import { renderLaunchers } from '../features/customLaunchers.js';
import { renderSidebar } from '../components/sidebar.js';
import { renderDefaultDashboard } from '../features/defaultDashboard.js';
import { renderDashboardQuickNote } from '../features/dashboardQuickNote.js';
import { renderFocusPersistentPopup } from '../features/smartFlow.js';

export function renderMainContent() {
  const spaceId = getCurrentSpaceId();
  const globalSettings = getAppSettings();
  const mainGrid = document.getElementById('main-grid');
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
    // 🟢 จัดการการย้ายปุ่ม Cloud Sync เข้า Utility Group
  const syncContainer = document.getElementById('firebase-sync-container');
  const navGroup = document.querySelector('.topbar-nav-group');
  const rewardsBtn = document.getElementById('btn-open-rewards-topbar');
  const utilityGroup = document.getElementById('utility-group');
  const actionsRow = utilityGroup?.querySelector('.utility-actions-row');

  const tagBar = document.getElementById('tag-bar-container');
  const defaultContainer = document.getElementById('default-dashboard-container');
  const sBar = document.getElementById('schedule-mode-bar');
  const fBar = document.getElementById('focus-mode-bar');
  const toggleToolsBtn = document.getElementById('toggle-tools-btn');

  // คืนค่าการแสดงผล Bar เมื่อเปลี่ยน Space
  document.querySelector('.workspace')?.classList.remove('hide-bars');

  // Update Command Center button active state
  document.querySelectorAll('.btn-cc-trigger').forEach(btn => {
      btn.style.color = (spaceId === 0) ? 'var(--primary-color)' : '';
  });

  // 🟢 ย้ายปุ่ม Cloud Sync ตามโหมดหน้าจอ
  if (isMobile && syncContainer && navGroup && rewardsBtn && syncContainer.nextElementSibling !== rewardsBtn) {
      navGroup.insertBefore(syncContainer, rewardsBtn);
  } else if (!isMobile && syncContainer && actionsRow && syncContainer.parentElement !== actionsRow) {
      actionsRow.appendChild(syncContainer);
  }

  // Handle Default Dashboard (Command Center) view
  if (spaceId === 0) {
      if (mainGrid) mainGrid.style.display = 'none';
      if (tagBar) tagBar.style.display = 'none';
      // Always hide bars and toggle button in Command Center
      if (sBar) sBar.style.display = 'none';
      if (fBar) fBar.style.display = 'none';
      if (toggleToolsBtn) toggleToolsBtn.style.display = 'none';
      if (defaultContainer) {
          defaultContainer.style.setProperty('display', isMobile ? 'flex' : 'grid', 'important');
          defaultContainer.className = 'dashboard-grid'; // CSS จะคุมเรื่อง scroll เอง
      }
      document.getElementById('current-space-title').innerText = "Command Center";
      renderDefaultDashboard();
      renderDashboardQuickNote();
      renderFocusPersistentPopup(); // 🟢 Render persistent popup in Command Center
      return;
  }

  // Show normal space content
  if (mainGrid) mainGrid.style.display = 'grid';
  if (tagBar) tagBar.style.display = 'flex';
  if (defaultContainer) defaultContainer.style.setProperty('display', 'none', 'important');
  if (toggleToolsBtn) toggleToolsBtn.style.display = 'inline-flex';

  // 🟢 Pure JS Approach: จัดการ Layout และซ่อน Container ผ่าน DOM Property
  if (isMobile) {
      // บังคับให้ Grid เหลือคอลัมน์เดียว (Tasks) ทันที
      if (mainGrid) mainGrid.style.gridTemplateColumns = '1fr';

      // สั่งปิดการแสดงผล Container หลักจาก ID (แม่นยำกว่า class)
      document.getElementById('tabs-card')?.setAttribute('style', 'display:none !important');
      document.getElementById('resources-card')?.setAttribute('style', 'display:none !important');
      if (toggleToolsBtn) toggleToolsBtn.style.display = 'none';
  } else {
      // คืนค่าการแสดงผลพื้นฐานเพื่อให้ Resources กลับมาแสดงในช่วง Tablet
      document.getElementById('resources-card')?.style.removeProperty('display');
  }

  const space = getCurrentSpace(); if (!space) return;
  document.getElementById('current-space-title').innerText = space.name;
  
  // Note: All visual properties are now applied globally via applyAppSettings()
  // called in renderAll() within contentManager.js

  // Headers
  const headers = space.headers || {};
  document.getElementById('header-tabs-text').innerText = headers.tabHeader || "Tabs";
  document.getElementById('vertical-tabs-text').innerText = headers.tabHeader || "Tabs";
  document.getElementById('header-res-text').innerText = headers.resourceHeader || "Resources";
  document.getElementById('header-tasks-text').innerText = headers.taskHeader || "Tasks & Notes";
  document.getElementById('vertical-res-text').innerText = headers.resourceHeader || "Resources";
  document.getElementById('vertical-tasks-text').innerText = headers.taskHeader || "Tasks & Notes";

  // Apply collapsed states
  const grid = document.getElementById('main-grid');
  if (grid) {
      grid.classList.toggle('tabs-collapsed', globalSettings.isTabsCollapsed);
      grid.classList.toggle('resources-collapsed', globalSettings.isResourcesCollapsed);
      grid.classList.toggle('tasks-collapsed', globalSettings.isTasksCollapsed);
  }

  const currentFilterTags = getFilterTags();
  const currentFilterMode = getFilterMode();
  const currentSearchQuery = getSearchQuery();

  // Render Modules
  renderTagBar(space, currentFilterTags, currentFilterMode, {  
    onFilterChange: (tags, mode) => { 
        setFilterTags(tags); 
        setFilterMode(mode); 
        renderMainContent(); 
    }, 
    onRenderMain: renderMainContent  
  });

  renderTabs(space, currentSearchQuery);
  renderResources(space, currentFilterTags, currentFilterMode, currentSearchQuery, renderAll);
  renderDriveFiles(space, currentFilterTags, currentFilterMode, currentSearchQuery, renderAll);
  renderTasks(space, currentFilterTags, currentFilterMode, currentSearchQuery);
  renderQuickNotes(space);
  renderDashboardQuickNote(); // 🟢 อัปเดตการแสดงผลตามสถานะ Pin เมื่อเปลี่ยน Space
  renderFocusPersistentPopup(); // 🟢 Render persistent popup when switching to a regular space

  // Show/Hide features based on space settings
  const showTools = (space.showSchedule !== false);
  if (sBar) sBar.style.display = showTools ? 'flex' : 'none';
  if (fBar) fBar.style.display = showTools ? 'flex' : 'none';
  if (toggleToolsBtn) toggleToolsBtn.classList.toggle('active', !showTools);
}

export function renderAll() {
    applyAppSettings(); 
    renderSidebar(); 
    renderMainContent();
    renderLaunchers();
    renderFocusPersistentPopup(); // 🟢 Render persistent popup when re-rendering all
}

function setupCollapsing() {
    const settings = getAppSettings();
    const grid = document.getElementById('main-grid');

    const setup = (btnId, headerId, key) => {
        const toggle = () => {
            settings[key] = !settings[key];
            grid.classList.toggle(key.replace('is', '').replace('C', '-c').toLowerCase(), settings[key]);
            saveData();
        };
        const btn = document.getElementById(btnId);
        const header = document.getElementById(headerId);
        if (btn) btn.onclick = toggle;
        if (header) header.onclick = toggle;
    };

    setup('btn-collapse-res-inline', 'resources-header-collapsed', 'isResourcesCollapsed');
    setup('btn-collapse-tasks-inline', 'tasks-header-collapsed', 'isTasksCollapsed');
}

export function initContentManager() {
    // 1. Spacebar Toggle (Renamed from Sidebar)
    const spacebar = document.getElementById('spacebar');
    const toggleBtn = document.getElementById('btn-toggle-spacebar');
    const ccBtnTopbar = document.getElementById('btn-command-center-topbar');
    
    const updateToggleBtnUI = () => {
        if (spacebar) {
            const isCollapsed = spacebar.classList.contains('collapsed');
            if (toggleBtn) toggleBtn.classList.toggle('sidebar-hidden', isCollapsed);
            if (ccBtnTopbar) ccBtnTopbar.classList.toggle('sidebar-hidden', isCollapsed);
        }
    };

    if (toggleBtn && spacebar) {
        toggleBtn.addEventListener('click', () => { 
            spacebar.classList.toggle('collapsed'); 
            updateToggleBtnUI();
        });
    }

    // ระบบซ่อน Sidebar อัตโนมัติเมื่อย่อหน้าจอ (Auto-collapse threshold: 1100px)
    let prevWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        const currentWidth = window.innerWidth;
        if (currentWidth <= 1100 && prevWidth > 1100) {
            spacebar.classList.add('collapsed');
            updateToggleBtnUI();
        } else if (currentWidth > 1100 && prevWidth <= 1100) {
            spacebar.classList.remove('collapsed');
            updateToggleBtnUI();
        }
        prevWidth = currentWidth;
    });

    // ตรวจสอบสถานะเริ่มต้นเมื่อโหลดแอป
    if (window.innerWidth <= 1100) {
        spacebar.classList.add('collapsed');
        updateToggleBtnUI();
    }

    // 2. Toggle Tools (Schedule/Focus)
    const toggleToolsBtn = document.getElementById('toggle-tools-btn');
    if (toggleToolsBtn) {
        toggleToolsBtn.addEventListener('click', () => {
            const space = getCurrentSpace();
            if (!space) return;
            const newState = !(space.showSchedule !== false);
            space.showSchedule = newState;
            space.showFocusMode = newState;
            saveData();
            renderMainContent();
        });
    }

    // 3. Global Refresh
    const globalRefreshBtn = document.getElementById('btn-global-refresh');
    if (globalRefreshBtn) {
        globalRefreshBtn.addEventListener('click', () => {
            globalRefreshBtn.style.transform = 'rotate(180deg)';
            globalRefreshBtn.style.transition = 'transform 0.3s ease';
            loadData(() => {
                renderMainContent();
                setTimeout(() => { globalRefreshBtn.style.transform = 'none'; }, 300);
            });
        });
    }

    // 4. Header Editing (Global Listener)
    document.addEventListener('click', async (e) => {
        const space = getCurrentSpace(); 
        if (!space) return;

        // Header editing logic removed
    });

    // 5. Card Collapsing
    setupCollapsing();

    // 6. ระบบ Auto-hide Schedule & Focus bars เมื่อเลื่อนหน้าจอ
    const workspace = document.querySelector('.workspace');
    const mainGrid = document.getElementById('main-grid');
    const defaultContainer = document.getElementById('default-dashboard-container');
    const topbar = document.querySelector('.topbar');

    let lastST = 0;
    const scrollHandler = (e) => {
        const target = e.target;
        const st = target.scrollTop;
        const scrollHeight = target.scrollHeight;
        const clientHeight = target.clientHeight;
        const space = getCurrentSpace();

        // 1. ป้องกันการ Flickering โดยกำหนดค่าความต่างขั้นต่ำ (Delta)
        const delta = 8; 
        if (Math.abs(st - lastST) < delta && st > 20) return;

        // 2. ตรวจสอบว่าผู้ใช้เลื่อนถึงขอบล่างสุดหรือยัง (Threshold 10px)
        // ถ้าถึงล่างสุดแล้ว เราจะไม่สั่งซ่อนบาร์ เพื่อป้องกันการเปลี่ยน Layout ที่ทำให้เกิด Loop
        const isAtBottom = st + clientHeight >= scrollHeight - 10;

        // 1. ถ้า Schedule หรือ Focus Mode ถูกเปิดใช้งาน (ON) อยู่ ห้ามซ่อน Bar
        const isScheduleActive = space?.schedule?.active;
        const isFocusActive = space?.focusTimer && space.focusTimer.mode !== 'off';

        if (isScheduleActive || isFocusActive) {
            workspace.classList.remove('hide-bars');
        } else {
            // 2. กรณีไม่ได้เปิดใช้งานจริง (เช่น กด Toggle Tools เพื่อเตรียมใช้แต่ยังไม่เริ่ม)
            // ให้ซ่อนเมื่อเลื่อนลง และแสดงกลับมาเมื่อเลื่อนขึ้น
            if (st > 100 && st > lastST && !isAtBottom) {
                workspace.classList.add('hide-bars');
            } else if (st < lastST || st < 20) {
                workspace.classList.remove('hide-bars');
            }
        }

        // ใส่คลาส scrolled ให้ Topbar เพื่อทำเอฟเฟกต์เบลอ
        if (st > 10) {
            topbar?.classList.add('scrolled');
        } else {
            topbar?.classList.remove('scrolled');
        }

        lastST = st <= 0 ? 0 : st;
    };

    if (mainGrid) mainGrid.addEventListener('scroll', scrollHandler, { passive: true });
    if (workspace) workspace.addEventListener('scroll', scrollHandler, { passive: true });
    if (defaultContainer) defaultContainer.addEventListener('scroll', scrollHandler, { passive: true });
}
