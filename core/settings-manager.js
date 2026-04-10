import { 
    getAppSettings, getSpaces, getCurrentSpaceId, 
    setSpaces, setAppSettings, setCurrentSpaceId, 
    saveData, getShortDate 
} from './storage.js';

export function applyAppSettings() {
    const appSettings = getAppSettings();
    document.documentElement.style.setProperty('--primary-color', appSettings.color);
    document.documentElement.style.setProperty('--bg-body', appSettings.bgBody || "#f4f4f0");
    document.documentElement.style.setProperty('--bg-spacebar', appSettings.bgSpacebar || "#ebebe6");
    document.documentElement.style.setProperty('--bg-card', appSettings.bgCard || "#ffffff");
    document.documentElement.style.setProperty('--text-main', appSettings.textMain || "#111111");
    document.documentElement.style.setProperty('--app-font-size', (appSettings.fontSize || 15) + 'px');
    document.documentElement.style.setProperty('--spacebar-text-color', appSettings.spacebarTextColor || "#555555");
    document.documentElement.style.setProperty('--spacebar-font-size', (appSettings.spacebarFontSize || 13) + 'px');
    
    document.documentElement.style.setProperty('--app-font', appSettings.font);
    document.documentElement.style.setProperty('--note-font', appSettings.noteFont || appSettings.font);
    const titleEl = document.getElementById('display-app-title');
    if (titleEl) titleEl.innerText = appSettings.title;
    
    const iconVal = appSettings.icon || "🚀";
    const iconBox = document.getElementById('display-app-icon');
    if (iconBox) {
        if (iconVal.startsWith('http') || iconVal.startsWith('data:image')) {
            iconBox.innerHTML = `<img src="${iconVal}" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;
            iconBox.style.background = "transparent";
        } else {
            iconBox.innerText = iconVal;
            iconBox.style.background = "var(--primary-color)";
        }
    }

    // --- Update Browser Favicon ---
    let favicon = document.querySelector("link[rel~='icon']");
    if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
    }
    if (iconVal.startsWith('http') || iconVal.startsWith('data:image')) {
        favicon.href = iconVal;
    } else {
        // Generate SVG Favicon for Emoji
        favicon.href = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${iconVal}</text></svg>`;
    }
  
    const grid = document.getElementById('main-grid');
    if (grid) {
        grid.classList.toggle('tabs-collapsed', !!appSettings.isTabsCollapsed);
        grid.classList.toggle('resources-collapsed', !!appSettings.isResourcesCollapsed);
        grid.classList.toggle('tasks-collapsed', !!appSettings.isTasksCollapsed);
    }
    
    const toggleDarkBtn = document.getElementById('btn-toggle-darkmode');
    if (appSettings.isDarkMode) { 
        document.body.classList.add('dark-mode'); 
        if(toggleDarkBtn) toggleDarkBtn.innerText = '🌙'; 
    } else { 
        document.body.classList.remove('dark-mode'); 
        if(toggleDarkBtn) toggleDarkBtn.innerText = '☀️'; 
    }

    // --- Mobile Optimization CSS Injection ---
    let mobileStyle = document.getElementById('mobile-optimized-css');
    if (!mobileStyle) {
        mobileStyle = document.createElement('style');
        mobileStyle.id = 'mobile-optimized-css';
        document.head.appendChild(mobileStyle);
    }
    mobileStyle.innerHTML = `
        @media (max-width: 768px) {
            /* 1. ซ่อนส่วนที่ไม่เกี่ยวข้องกับ To-do */
            #tabs-card, #resources-card, .topbar .search-wrapper, .topbar #global-launchers-bar, .topbar #utility-group, 
            .topbar #btn-utility-more, #schedule-mode-bar, #focus-mode-bar, #tag-bar-container { display: none !important; }
            #main-grid { grid-template-columns: 1fr !important; padding: 0 !important; gap: 0 !important; }
            #tasks-card { border-radius: 0 !important; border: none !important; width: 100% !important; overflow-x: hidden !important; }
            .card-body { padding: 10px !important; }
            
            /* 3. UI To-do แบบ Google Tasks และทำให้ Scroll ได้ */
            #tasks-card { overflow-y: auto !important; height: calc(100vh - 60px); }
            .task-item { padding: 4px 8px !important; border-bottom: 1px solid var(--border-color) !important; align-items: flex-start !important; gap: 2px !important; }
            .task-date { font-size: 9px !important; padding: 1px 5px !important; }
            .task-actual-text { font-size: 13px !important; padding: 0 !important; }
            .google-task-checkbox { transform: scale(0.9); margin-right: 8px !important; flex-shrink: 0; }
            
            /* 🟢 จัดวาง Topbar ใหม่: ชื่อ Space อยู่บน, ปุ่มทั้ง 4 (CC, Sidebar, Rewards, Drive) อยู่แถวเดียวกันด้านล่าง */
            .topbar {
                flex-wrap: wrap !important;
                padding: 12px 16px !important;
                height: auto !important;
                gap: 0 !important;
                justify-content: center !important;
            }
            .workspace-title {
                width: 100% !important;
                order: 1 !important;
                margin: 0 0 12px 0 !important;
                font-size: 18px !important;
                padding: 0 !important;
                flex: none !important;
                text-align: center !important;
            }
            .topbar-nav-group {
                order: 2 !important;
                display: flex !important;
                flex-direction: row !important;
                margin-right: 0 !important;
                gap: 8px !important;
                width: auto !important;
                align-items: center !important;
            }
            .topbar-nav-group .btn-icon {
                width: 30px !important; height: 30px !important;
                padding: 0 !important; 
                opacity: 1 !important;
                background: var(--bg-card) !important;
                border: 1px solid var(--border-color) !important;
                border-radius: 8px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                overflow: hidden !important;
                flex-shrink: 0 !important;
            }
            .topbar-nav-group .svg-icon-lg, #btn-drive-sync svg { width: 15px !important; height: 15px !important; }
            .topbar-divider { display: none !important; }
            #drive-sync-container, .drive-sync-wrapper { order: 3 !important; margin: 0 !important; display: flex !important; width: 30px !important; height: 30px !important; }
            #drive-sync-container { margin-left: 8px !important; }
            #btn-drive-sync span { display: none !important; } /* ซ่อนข้อความ Connected เหลือแค่ไอคอน */

            /* 🟢 ปรับแต่ง Firebase Sync เมื่ออยู่ในกลุ่ม Navigation มือถือ */
            #firebase-sync-container { margin-right: 0 !important; }
            #btn-firebase-sync-trigger { width: 30px !important; height: 30px !important; }

            /* 🟢 เมื่อเปิด Sidebar: ดัน Topbar ขึ้นมาข้างบนสุด และย้ายปุ่มไปกองที่ขอบซ้าย */
            #spacebar:not(.collapsed) ~ .workspace .topbar {
                z-index: 11000 !important;
                background: transparent !important;
                backdrop-filter: none !important;
                border: none !important;
                box-shadow: none !important;
            }
            #spacebar:not(.collapsed) ~ .workspace .topbar-nav-group {
                position: fixed !important;
                right: 15px !important;
                left: auto !important;
                top: 70px !important;
                flex-direction: column !important;
                background: var(--bg-card) !important;
                padding: 10px 6px !important;
                border-radius: 12px !important;
                box-shadow: 0 8px 30px rgba(0,0,0,0.3) !important;
                border: 1px solid var(--border-color) !important;
                gap: 12px !important;
                animation: sf-slide-in-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            #spacebar:not(.collapsed) ~ .workspace #drive-sync-container {
                position: fixed !important;
                right: 15px !important;
                left: auto !important;
                top: 202px !important;
                background: var(--bg-card) !important;
                padding: 6px !important;
                border-radius: 12px !important;
                box-shadow: 0 8px 30px rgba(0,0,0,0.3) !important;
                border: 1px solid var(--border-color) !important;
                margin: 0 !important;
                display: flex !important;
                animation: sf-slide-in-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            #spacebar:not(.collapsed) ~ .workspace .workspace-title { opacity: 0 !important; pointer-events: none; } /* ซ่อนชื่อ Space เพื่อความคลีน */

            /* 🟢 Done Confirmation Popup: ย้ายไปขอบซ้ายแทนเพื่อหลบกลุ่มปุ่ม Nav */
            .sf-post-confirm-popup {
                left: 15px !important;
                right: auto !important;
                top: 75px !important;
                transform: none !important;
                width: 140px !important;
            }

            @keyframes sf-slide-in-right { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

            /* 4. ช่องกรอกงานใหม่แบบ Floating Bottom Bar (แบบ Google Tasks) */
            .task-input-bar {
                position: fixed; bottom: 0; left: 0; right: 0; 
                background: var(--bg-card); padding: 8px 8px 24px 8px !important; 
                box-shadow: 0 -10px 40px rgba(0,0,0,0.2); 
                z-index: 1000; border-radius: 20px 20px 0 0;
                margin: 0 !important; width: 100% !important; 
                visibility: hidden !important; 
                transform: translateY(100%);
                transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.2s;
                display: grid !important;
                grid-template-columns: 1fr 44px 44px !important;
                grid-template-areas: 
                    "header header header"
                    "input repeat calendar"
                    "date add add"
                    "list list list" !important;
                gap: 10px 10px !important;
                box-sizing: border-box !important;
            }
            .task-input-bar.is-active { visibility: visible !important; transform: translateY(0) !important; }
            
            #new-task-input { 
                grid-area: input; 
                width: 100% !important;
                min-width: 0 !important; /* 🟢 แก้ไข: ป้องกันการยืดเกิน */
                font-size: 16px !important;
                padding: 10px 14px !important;
                border: 1.5px solid var(--border-color) !important;
                background: var(--bg-body) !important;
                height: auto !important;
                border-radius: 12px !important;
                box-sizing: border-box !important; /* 🟢 แก้ไข: ป้องกัน Padding ดัน Element */
                box-shadow: inset 0 1px 2px rgba(0,0,0,0.05) !important;
            }

            #btn-task-repeat, #btn-task-calendar-sync {
                display: flex !important;
                align-items: center; 
                justify-content: center;
                width: 44px !important; 
                height: 44px !important;
                background: var(--bg-body) !important;
                border: 1.5px solid var(--border-color) !important;
                border-radius: 12px !important;
                padding: 0 !important;
                margin: 0 !important;
            }

            #btn-task-repeat { grid-area: repeat; }
            #btn-task-calendar-sync { 
                grid-area: calendar; 
                color: #4285f4; /* Google Blue */
            }

            .date-wrapper { 
                grid-area: date; 
                border: 1px solid var(--border-color) !important;
                border-radius: 10px !important;
                padding: 0 12px !important;
                margin: 0 !important;
                background: var(--bg-body) !important;
                display: flex !important;
                align-items: center !important;
                height: 42px !important;
            }
            .task-date-input { width: 100% !important; font-size: 14px !important; border:none !important; }
            
            #btn-add-task { 
                grid-area: add; 
                height: 42px !important;
                padding: 0 16px !important; /* 🟢 แก้ไข: ลด Padding เพื่อไม่ให้ข้อความล้น */
                border-radius: 10px !important;
                font-weight: 800 !important;
                font-size: 14px !important;
            }

            .sf-input-bar-header {
                grid-area: header;
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
            }
            
            #google-task-controls { 
                grid-area: list; 
                width: 100% !important;
                margin: 4px 0 0 0 !important;
                padding: 10px 15px !important;
                background: var(--bg-body) !important;
                border-radius: 12px !important;
                border: 1px solid var(--border-color) !important;
                box-sizing: border-box !important;
                display: none; /* Controlled by JS flex */
                align-items: center !important;
                justify-content: space-between !important;
            }
            #google-task-list-select {
                flex: 1 !important;
                max-width: none !important;
                text-align: right !important;
                font-size: 13px !important;
            }
            #btn-sync-toggle { display: none !important; }

            /* 🟢 Drive Sync Menu: ปรับให้ไม่ล้นจอ */
            .drive-sync-menu {
                max-height: 80vh !important;
                overflow-y: auto !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
            }


            /* 5. ปรับส่วน Badge และปุ่มคำสั่ง (Actions) ให้แบ่งบรรทัดแนวตั้งเพื่อไม่ให้ดันข้อความ */
            .item-action-group { 
                display: flex !important;
                flex-direction: row !important; /* จัดเรียงป้ายต่างๆ กลับเป็นบรรทัดเดียวกัน */
                align-items: center !important;   /* จัดกึ่งกลางแนวตั้ง */
                gap: 4px !important;               /* ระยะห่างระหว่างป้าย */
                margin-left: 8px !important;
                flex-shrink: 0 !important;
                opacity: 1 !important;
                justify-content: center !important;
            }
            .toggle-actions-btn { width: 24px; height: 24px; display: flex !important; align-items: center; justify-content: center; opacity: 0.4; margin: 0 !important; }           
            /* 6. ส่วนหัว Header */
            .card-header { padding: 12px 16px !important; border-bottom: none !important; }
            #header-tasks-text { font-size: 18px !important; font-weight: 800 !important; }
            
            /* พื้นที่ว่างด้านล่างกันโดนบัง */
            #task-list { padding-bottom: 80px !important; }
            
            /* จัดการปุ่ม Drive Sync ให้เห็นชัด */
            .drive-sync-wrapper { margin-right: 10px; }

            /* ป้ายกำกับ (Tags) บนมือถือ */
            .btn-edit-tags { 
                background: var(--hover-bg) !important; 
                border-radius: 12px !important; 
                padding: 4px 10px !important; 
                font-size: 12px !important;
            }

            /* 🟢 ปรับปุ่ม Tag ให้เป็นวงกลมมินิมอล (+) */
            .btn-edit-tags { 
                width: 18px !important; height: 18px !important; 
                border-radius: 50% !important; padding: 0 !important; 
                min-width: 18px !important;
                font-size: 11px !important; justify-content: center !important;
                background: var(--hover-bg) !important; border: 1px solid var(--border-color) !important;
            }
            .btn-edit-tags svg { display: none; } /* ซ่อนไอคอนแท็กบนมือถือเพื่อความคลีน */
            
            #btn-mobile-todo-tools { display: inline-flex !important; }

            /* ซ่อนจุดลาก (Drag Handle) เพื่อลดความรกบนมือถือ */
            .task-item .drag-handle { display: none !important; }
            
            /* 🟢 แต่งปุ่ม 3 จุด (Menu) บนมือถือ */
            #btn-mobile-todo-tools {
                display: inline-flex !important;
                background: var(--hover-bg) !important;
                border-radius: 50% !important;
                width: 24px !important; height: 24px !important;
                color: var(--primary-color) !important;
                font-size: 14px !important; line-height: 1 !important;
                opacity: 1 !important;
            }

            /* 🟢 Floating Action Button (FAB) */
            .sf-mobile-fab {
                position: fixed !important; bottom: 20px !important; right: 20px !important;
                width: 44px !important; height: 44px !important; border-radius: 50% !important;
                background: var(--primary-color) !important; color: white !important;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
                display: flex !important; align-items: center; justify-content: center;
                font-size: 24px !important; z-index: 999; border: none !important;
                transition: transform 0.2s active;
            }
            .sf-mobile-fab:active { transform: scale(0.9); }
            .sf-mobile-fab.is-hidden { visibility: hidden !important; pointer-events: none !important; }
            
            /* แสดงปุ่มเฉพาะบนมือถือ */
            .mobile-only {
                display: inline-flex !important;
            }

            /* 🟢 บังคับให้ Modal ไม่ล้นจอ และสามารถเลื่อนดูได้บนมือถือ */
            .modal-content, #settings-modal .modal-content, #smart-flow-settings-modal .modal-content, .reward-modal-content {
                width: 90% !important;
                max-width: 400px !important;
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                margin: 0 !important;
                max-height: 85vh !important;
                overflow-y: auto !important;
                box-sizing: border-box !important;
            }

            /* 🟢 ปรับเมนู Popup ให้เป็น Bottom Sheet */
            .mobile-tools-popup {
                position: fixed !important; 
                bottom: 20px !important; 
                left: 12px !important; 
                right: 12px !important;
                width: auto !important; 
                max-width: none !important;
                background: var(--bg-card) !important;
                border-radius: 28px !important;
                padding: 12px 12px 16px 12px !important;
                box-shadow: 0 -10px 40px rgba(0,0,0,0.2) !important;
                border: 1px solid var(--border-color) !important;
                display: none; flex-direction: column; z-index: 10001;
                animation: slideUp 0.3s ease-out;
            }
            .mobile-tools-popup button {
                padding: 12px !important; 
                width: 100% !important; 
                border: none !important; 
                background: transparent !important;
                margin: 0 !important;
                border-radius: 14px !important;
                font-size: 14px !important; 
                font-weight: 700 !important;
                display: flex !important; 
                align-items: center !important; 
                justify-content: flex-start !important;
                color: var(--text-main) !important;
            }
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

            /* 🟢 Command Center Specific Adjustments for Mobile */
            #default-dashboard-container {
                padding: 10px !important; /* เพิ่ม Padding รอบด้าน */
                overflow-y: auto !important; /* ทำให้ Scroll ได้ในแนวตั้ง */
                height: calc(100vh - 60px) !important; /* ปรับความสูงให้พอดีกับหน้าจอ (หัก Topbar ออก) */
                box-sizing: border-box !important; /* รวม Padding ในการคำนวณความสูง */
                display: flex !important; /* ใช้ Flexbox เพื่อจัดเรียง Widget */
                flex-direction: column !important; /* เรียง Widget ลงมาในแนวตั้ง */
                overflow-x: hidden !important; /* ป้องกันการล้นแนวนอน */
            }

            #cc-widget-grid {
                display: flex !important; /* ใช้ Flexbox สำหรับ Widget ภายใน Grid */
                flex-direction: column !important; /* เรียง Widget ลงมาในแนวตั้ง */
                gap: 15px !important; /* ระยะห่างระหว่าง Widget */
                width: 100% !important; 
                max-width: 100% !important;
                flex: 1 !important; /* ให้ขยายและหดได้ตามพื้นที่ */
                box-sizing: border-box !important;
            }

            .widget-card {
                width: 100% !important; /* ให้ Card ใช้ความกว้างเต็ม */
                margin: 0 !important; /* ลบ Margin ภายนอกที่ไม่จำเป็น */
                box-sizing: border-box !important; /* รวม Padding/Border ในการคำนวณความกว้าง */
                display: flex !important; /* ใช้ Flexbox สำหรับเนื้อหาภายใน Card */
                flex-direction: column !important; /* เรียง Header และ Body ลงมาในแนวตั้ง */
                min-height: 0; /* อนุญาตให้ Card หดได้ */
                overflow-x: hidden !important;
            }

            .widget-card .card-body {
                overflow-y: auto !important; /* ทำให้เนื้อหาภายใน Card Body Scroll ได้ */
                overflow-x: hidden !important;
                flex: 1 !important; /* ให้ Card Body ใช้พื้นที่ที่เหลือและ Scroll ได้ */
                min-height: 0; /* สำคัญสำหรับ Flex Item ที่มี Overflow */
                padding: 10px !important; /* ตรวจสอบให้แน่ใจว่ามี Padding สำหรับพื้นที่ Scroll */
            }

            /* ปรับปรุงแถบ Minimized สำหรับมือถือ */
            #cc-minimized-row {
                padding: 10px !important;
                flex-wrap: wrap !important;
                justify-content: center !important;
                gap: 8px !important;
            }
            #cc-minimized-row .btn-lock-widgets,
            #cc-minimized-row .btn-dashboard-note-toggle,
            #cc-minimized-row .reward-system-btn-group {
                margin: 0 !important; /* ลบ Margin ส่วนเกิน */
            }

            /* 🟢 ป้องกันข้อความล้นใน Command Center บนมือถือ */
            .smart-flow-title, .smart-flow-desc, .task-actual-text {
                word-break: break-word !important;
                white-space: normal !important;
            }
            .group-title { min-width: 0 !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        }
    `;
}

export function initSettingsManager(callbacks) {
    const { onRenderAll } = callbacks;

    // Export Backup
    const btnExport = document.getElementById('btn-export-backup');
    if (btnExport) {
        btnExport.addEventListener('click', () => { 
            const data = { 
                mySpacesData: getSpaces(), 
                appSettings: getAppSettings(), 
                lastSpaceId: getCurrentSpaceId() 
            };
            const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
            const a = document.createElement('a'); 
            a.href = URL.createObjectURL(blob); 
            a.download = `MyWorkspace_${getShortDate().replace(/\//g, '-')}.json`; 
            a.click(); 
        });
    }

    // Trigger Import
    const btnTriggerImport = document.getElementById('btn-trigger-import');
    if (btnTriggerImport) {
        btnTriggerImport.addEventListener('click', () => { 
            const fileInput = document.getElementById('btn-import-backup');
            if (fileInput) fileInput.click(); 
        });
    }

    // Import Backup
    const btnImport = document.getElementById('btn-import-backup');
    if (btnImport) {
        btnImport.addEventListener('change', (e) => { 
            const r = new FileReader(); 
            r.onload = (ev) => { 
                try { 
                    const d = JSON.parse(ev.target.result); 
                    if(d.mySpacesData && d.appSettings) { 
                        setSpaces(d.mySpacesData); 
                        setAppSettings(d.appSettings); 
                        setCurrentSpaceId(d.lastSpaceId || getSpaces()[0].id); 
                        saveData(); 
                        applyAppSettings(); 
                        if(onRenderAll) onRenderAll(); 
                        alert("Restore successful!"); 
                        const modal = document.getElementById('settings-modal');
                        if (modal) modal.style.display = 'none'; 
                    } 
                } catch(err) { 
                    alert("Invalid file"); 
                } 
            }; 
            if(e.target.files[0]) r.readAsText(e.target.files[0]); 
        });
    }
    
    // Toggle Dark Mode
    const btnToggleDark = document.getElementById('btn-toggle-darkmode');
    if (btnToggleDark) {
        btnToggleDark.addEventListener('click', () => { 
            const settings = getAppSettings(); 
            settings.isDarkMode = !settings.isDarkMode; 
            saveData(); 
            applyAppSettings(); 
        });
    }
}
