import { 
    getAppSettings, getSpaces, getCurrentSpaceId, 
    setSpaces, setAppSettings, setCurrentSpaceId, 
    saveData, getShortDate,
    getLocalSettings, setLocalSettings
} from './storage.js';
import { syncAllNoteWebappIframes } from './noteWebapp.js';

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
        /* 🟢 Global Modal Fix: ป้องกันล้นจอทั้ง Desktop และ Mobile */
        .modal-content {
            max-height: 90vh !important;
            overflow-y: auto !important;
            scrollbar-width: thin;
            box-sizing: border-box !important;
        }

        /*  LAPTOP/DESKTOP UI: Single Line Layout */
        .task-input-bar {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 5px !important; /* ลดระยะห่างหลักลง 50% */
            padding: 1px 12px !important;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            margin-bottom: 15px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .sf-input-bar-header { display: none !important; } /* ซ่อนหัวข้อบน Laptop */
        #new-task-input { flex: 1 !important; height: 30px !important; border: none !important; background: transparent !important; }
         .sf-input-tools-row { display: flex !important; align-items: center !important; gap: 4px !important; flex-shrink: 0 !important; } /* ลดระยะห่างระหว่างปุ่มลง 50% */
        
        /* ขนาดปุ่มมาตรฐานบน Laptop */
        .sf-input-tools-row .date-wrapper { 
            min-width: 77px !important; /* ลดขนาดลง 30% จาก 110px */
            height: 32px !important; 
        }
        .sf-input-tools-row .btn-icon { 
            width: 32px !important; 
            height: 32px !important; 
            box-sizing: border-box !important; /* ป้องกันปุ่มขยายเมื่อขอบหนาขึ้น */
            display: flex !important;
            align-items: center;
            justify-content: center;
        }
        .sf-input-tools-row #btn-add-task { 
            height: 32px !important; 
            padding: 0 10px !important; /* ลดขนาดลงประมาณ 30% จาก 15px */
        }
        @media (max-width: 768px) {
            /* 🟢 Modal must be on top of New Task bar (which is 100,000) */
            .modal-overlay {
                z-index: 110000 !important;
            }
            /*  MOBILE UI: Keep Popup Layout */
            #tabs-card, #resources-card, .topbar .search-wrapper, .topbar #global-launchers-bar, .topbar #utility-group, 
            .topbar #btn-utility-more, #schedule-mode-bar, #focus-mode-bar, #tag-bar-container, #btn-todo-templates { display: none !important; }
            #main-grid { grid-template-columns: 1fr !important; padding: 0 !important; gap: 0 !important; }
            #tasks-card { border-radius: 0 !important; border: none !important; width: 100% !important; overflow-x: hidden !important; }
            .card-body { padding: 10px !important; }
            
            #tasks-card, #resources-card { overflow-y: visible !important; height: auto !important; }

            /* บังคับกลับเป็น Popup สำหรับมือถือ */
            .task-input-bar {
                position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important;
                width: 100% !important; z-index: 100000 !important;
                flex-direction: column !important; gap: 16px !important;
                padding: 20px 20px 45px 20px !important;
                border-radius: 24px 24px 0 0 !important;
                box-shadow: 0 -10px 50px rgba(0,0,0,0.3) !important;
                display: none !important; /* ซ่อนไว้รอ is-active */
                transform: translateY(100%);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .task-input-bar.is-active { display: flex !important; transform: translateY(0); }
            
            /* แสดงหัวข้อและปุ่มปิดเฉพาะบนมือถือ */
            .sf-input-bar-header { 
                display: flex !important; 
                justify-content: space-between !important; 
                align-items: center !important;
                width: 100% !important;
            }

            /* ปรับช่องพิมพ์งานบนมือถือให้เต็มบรรทัดและมีขอบ */
            #new-task-input {
                width: 100% !important; height: 50px !important;
                padding: 0 16px !important; border: 2px solid var(--primary-color) !important;
                border-radius: 12px !important; background: var(--bg-body) !important;
            }

            /* จัดระเบียบแถวเครื่องมือบนมือถือ (ตามสัดส่วนที่คุณเคยสั่ง) */
            .sf-input-tools-row { width: 100% !important; gap: 8px !important; }
            .sf-input-tools-row .date-wrapper { flex: 1 !important; height: 44px !important; }
            #btn-task-repeat, #btn-task-calendar-sync { 
                flex: 1.3 !important; 
                height: 44px !important; 
                box-sizing: border-box !important; /* 🟢 สำคัญ: ป้องกันเส้นขอบหนาแล้วปุ่มขยายขนาด */
            }
            .sf-input-tools-row #btn-add-task { flex: 1 !important; height: 44px !important; }

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

            /* 🟢 REWRITTEN MOBILE INPUT BAR - 3 ROWS LAYOUT */
            .task-input-bar {
                position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important;
                width: 100% !important; z-index: 100000 !important;
                background: var(--bg-card) !important;
                padding: 20px 20px 45px 20px !important;
                border-radius: 24px 24px 0 0 !important;
                box-shadow: 0 -10px 50px rgba(0,0,0,0.3) !important;
                box-sizing: border-box !important;
                display: none !important; /* ซ่อนไว้ก่อนจนกว่าจะกด + */
                flex-direction: column !important;
                gap: 16px !important;
                transform: translateY(100%);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .task-input-bar.is-active { 
                display: flex !important; 
                transform: translateY(0); 
                visibility: visible !important; 
                pointer-events: auto !important; 
            }

            /* บรรทัดที่ 1: Header (ชื่อกลุ่มอยู่ซ้าย ปุ่มปิดอยู่ขวาสุด) */
            .sf-input-bar-header {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                width: 100% !important;
            }
            .sf-input-bar-header span { font-weight: 900; font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
            .sf-btn-close-input { background: none !important; border: none !important; font-size: 24px !important; color: var(--text-main) !important; cursor: pointer !important; padding: 5px !important; opacity: 0.6; }

            /* บรรทัดที่ 2: ช่องพิมพ์งาน (ยาวเต็มบรรทัด) */
            #new-task-input {
                width: 100% !important;
                height: 50px !important;
                padding: 0 16px !important;
                border: 2px solid var(--primary-color) !important;
                border-radius: 12px !important;
                background: var(--bg-body) !important;
                font-size: 16px !important;
                box-sizing: border-box !important;
                margin: 0 !important;
            }

            /* บรรทัดที่ 3: เครื่องมือ (จัดกึ่งกลางแถว) */
            .sf-input-tools-row {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 8px !important;
                width: 100% !important;
            }
            .sf-input-tools-row .date-wrapper {
                flex: 1 !important; /* ลดขนาดลงประมาณ 30% จาก 1.5 */
                height: 44px !important;
                background: var(--bg-body) !important;
                border: 1px solid var(--border-color) !important;
                border-radius: 10px !important;
                display: flex !important; align-items: center; justify-content: center;
                margin: 0 !important; padding: 0 10px !important;
            }
            #btn-task-repeat, #btn-task-calendar-sync {
                flex: 1.3 !important; /* เพิ่มขนาดขึ้น 30% และให้เท่ากันทั้ง 2 ปุ่ม */
                height: 44px !important;
                background: var(--bg-body);
                border: 1px solid var(--border-color);
                border-radius: 10px !important;
                display: flex !important; align-items: center; justify-content: center;
                padding: 0 !important; margin: 0 !important; opacity: 1 !important;
            }
            .sf-input-tools-row #btn-add-task {
                flex: 1 !important; /* ลดขนาดลงประมาณ 20% จาก 1.2 */
                height: 44px !important;
                background: var(--primary-color);
                color: white !important;
                border: none !important;
                border-radius: 10px !important;
                font-weight: 800 !important;
                font-size: 14px !important;
                display: flex !important; align-items: center; justify-content: center;
                margin: 0 !important;
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
                font-size: 24px !important; z-index: 9997 !important; border: none !important;
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
                cursor: pointer !important;
                touch-action: manipulation !important;
                -webkit-user-select: none !important;
                user-select: none !important;
            }
            .sf-mobile-fab:active { transform: scale(0.9); }
            .sf-mobile-fab.is-hidden { display: none !important; pointer-events: none !important; }
            
            /* แสดงปุ่มเฉพาะบนมือถือ */
            .mobile-only {
                display: inline-flex !important;
            }

            /* 🟢 ปรับตำแหน่ง Modal บนมือถือให้เหมาะสม */
            .modal-content {
                width: 90% !important;
                max-width: 400px !important;
                max-height: 85vh !important;
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
            .task-item, .smart-flow-item { border-bottom: 1px solid rgba(0,0,0,0.05) !important; }
            .group-title { width: 100% !important; display: block !important; margin-bottom: 8px !important; white-space: normal !important; font-size: 15px !important; font-weight: 800 !important; color: var(--primary-color) !important; }
            .task-group-summary { height: auto !important; padding: 12px 15px !important; border-bottom: 2px solid var(--border-color) !important; background: rgba(0,0,0,0.02) !important; margin-bottom: 10px !important; }
            .btn-master-space-sort { margin-left: 0 !important; }

            /* 🟢 Smart Flow Compact UI (Mobile) */
            .smart-flow-item { 
                padding: 6px 8px !important; 
                gap: 4px !important; 
                min-height: 40px !important;
            }
            .smart-flow-number { min-width: 18px !important; margin: 0 !important; font-size: 11px !important; opacity: 0.6; }
            .smart-flow-item .drag-handle { width: 20px !important; display: flex !important; opacity: 0.4 !important; }
            .smart-flow-action-btn { transform: scale(0.85) !important; margin: 0 -2px !important; }
            .smart-flow-content { padding-left: 2px !important; gap: 1px !important; flex: 1 !important; min-width: 0 !important; }
            .smart-flow-title { font-size: 13.5px !important; }
            .smart-flow-desc { font-size: 10px !important; opacity: 0.7; }
        }
    `;
}
function _initDriveVaultUI() {
    // If the GDrive Vault settings section was removed from markup,
    // skip initializing Drive Vault UI to avoid errors.
    if (!document.getElementById('gdrive-vault-section')) return;
    const ls = getLocalSettings();

    const chkEnabled  = document.getElementById('chk-drive-sync-enabled');
    const intervalSel = document.getElementById('drive-sync-interval');

    if (chkEnabled)  chkEnabled.checked = !!ls.driveSyncEnabled;
    if (intervalSel && ls.driveAutoSyncMinutes) intervalSel.value = String(ls.driveAutoSyncMinutes);

    // Enable toggle
    if (chkEnabled) {
        chkEnabled.addEventListener('change', () => {
            setLocalSettings({ driveSyncEnabled: chkEnabled.checked });
        });
    }

    // Interval change → restart auto-sync timer
    if (intervalSel) {
        intervalSel.addEventListener('change', () => {
            const mins = parseInt(intervalSel.value, 10);
            setLocalSettings({ driveAutoSyncMinutes: mins });
            if (window.driveStartAutoSync) window.driveStartAutoSync(mins);
        });
    }

    // Pick Folder button
    const btnSetup = document.getElementById('btn-drive-setup-vault');
    if (btnSetup) {
        btnSetup.addEventListener('click', async () => {
            btnSetup.disabled = true;
            btnSetup.textContent = 'Picking…';
            try {
                if (window.driveSetupVault) {
                    const handle = await window.driveSetupVault();
                    if (handle) {
                        setLocalSettings({ driveSyncEnabled: true });
                        if (chkEnabled) chkEnabled.checked = true;
                    }
                }
            } catch (err) {
                const badge = document.getElementById('drive-sync-badge');
                if (badge) { badge.textContent = '⚠ Setup failed'; badge.style.color = '#ef4444'; }
                console.error('[Settings] Drive setup error:', err);
            }
            btnSetup.disabled = false;
            btnSetup.textContent = 'Pick Folder';
        });
    }

    // Sync Now button
    const btnSync = document.getElementById('btn-drive-sync-now');
    if (btnSync) {
        btnSync.addEventListener('click', async () => {
            btnSync.disabled = true;
            btnSync.textContent = 'Syncing…';
            try {
                if (window.drivePushNow) await window.drivePushNow();
            } catch (err) {
                console.error('[Settings] Drive sync error:', err);
            }
            btnSync.disabled = false;
            btnSync.textContent = 'Sync Now';
        });
    }

    syncAllNoteWebappIframes();
}
export function initSettingsManager(callbacks) {
    const { onRenderAll } = callbacks;

    // ── GDrive Vault UI ─────────────────────────────────────────────────────
    _initDriveVaultUI();

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
