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
            #tabs-card, #resources-card, .topbar .search-wrapper, .topbar #global-launchers-bar, .topbar #utility-group, .topbar #btn-utility-more, #schedule-mode-bar, #focus-mode-bar, #tag-bar-container { display: none !important; }
            #main-grid { grid-template-columns: 1fr !important; padding: 0 !important; gap: 0 !important; }
            #tasks-card { border-radius: 0 !important; border: none !important; width: 100% !important; overflow-x: hidden !important; }
            .card-body { padding: 10px !important; }
            
            /* 2. ปรับ Sidebar ให้เป็น Drawer เต็มหน้าจอ */
            #spacebar:not(.collapsed) { width: 85% !important; z-index: 10001; }
            
            /* 3. UI To-do แบบ Google Tasks และทำให้ Scroll ได้ */
            #tasks-card { overflow-y: auto !important; height: calc(100vh - 60px); }
            .task-item { padding: 4px 8px !important; border-bottom: 1px solid var(--border-color) !important; align-items: center !important; gap: 2px !important; }
            .task-actual-text { font-size: 13px !important; padding: 0 !important; }
            .google-task-checkbox { transform: scale(0.9); margin-right: 4px !important; flex-shrink: 0; }
            
            /* 4. ช่องกรอกงานใหม่แบบ Floating Bottom Bar (แบบ Google Tasks) - แก้ไขการซ่อน */
            .task-input-bar { 
                position: fixed; bottom: 0; left: 0; right: 0; 
                background: var(--bg-card); padding: 8px 8px 24px 8px !important; 
                box-shadow: 0 -10px 40px rgba(0,0,0,0.2); 
                z-index: 1000; border-radius: 16px 16px 0 0;
                margin: 0 !important; width: 100% !important; 
                visibility: hidden !important; /* เปลี่ยนจาก display: none เพื่อให้ JS หา Element เจอ */
                transform: translateY(100%);
                transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.2s;
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

            .sf-input-bar-header {
                grid-area: header;
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 2px;
            }

            #new-task-input {
                grid-area: input; 
                width: 100% !important;
                min-width: 0 !important; /* 🟢 แก้ไข: ป้องกันการยืดเกิน */
                padding: 12px 14px !important;
                border: 2px solid var(--primary-color) !important;
                background: var(--bg-body) !important;
                border-radius: 10px !important;
                box-sizing: border-box !important;
            }

            #btn-task-repeat, #btn-task-calendar-sync {
                display: flex !important;
                width: 44px !important; height: 44px !important;
                background: var(--bg-body) !important;
                border: 2px solid var(--border-color) !important;
                border-radius: 10px !important;
                align-items: center; justify-content: center;
                margin: 0 !important; padding: 0 !important;
            }

            #btn-task-repeat { grid-area: repeat; }
            #btn-task-calendar-sync { grid-area: calendar; }

            #btn-add-task {
                padding: 0 16px !important; /* 🟢 แก้ไข: ลด Padding เพื่อไม่ให้ข้อความล้น */
            }
            .date-wrapper {
                margin: 0 !important; /* 🟢 แก้ไข: ลบ margin-top ที่ไม่จำเป็น */
            }

            /* 5. ปุ่ม Actions ต่างๆ ให้ดูสะอาดขึ้น */
            .item-action-group { opacity: 1 !important; }
            .toggle-actions-btn { width: 28px; height: 28px; display: flex !important; align-items: center; justify-content: center; opacity: 0.4; }
            
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

            /* ซ่อนจุดลาก (Drag Handle) เพื่อลดความรกบนมือถือ */
            .task-item .drag-handle { display: none !important; }
            
            /* 🟢 แต่งปุ่ม 3 จุด (Menu) บนมือถือ */
            #btn-mobile-todo-tools {
                display: inline-flex !important;
                background: var(--hover-bg) !important;
                border-radius: 50% !important;
                width: 26px !important; height: 26px !important;
                color: var(--primary-color) !important;
                font-size: 16px !important; line-height: 1 !important;
                opacity: 1 !important;
            }

            /* 🟢 Floating Action Button (FAB) */
            .sf-mobile-fab {
                position: fixed !important; bottom: 20px !important; right: 20px !important;
                width: 56px !important; height: 56px !important; border-radius: 50% !important;
                background: var(--primary-color) !important; color: white !important;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
                display: flex !important; align-items: center; justify-content: center;
                font-size: 30px !important; z-index: 999; border: none !important;
                transition: transform 0.2s active;
            }
            .sf-mobile-fab:active { transform: scale(0.9); }
            .sf-mobile-fab.is-hidden { display: none !important; }
            
            /* แสดงปุ่มเฉพาะบนมือถือ */
            .mobile-only {
                display: inline-flex !important;
            }

            /* 🟢 ปรับเมนู Popup ให้เป็น Bottom Sheet */
            .mobile-tools-popup {
                position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important;
                width: 100% !important; max-width: none !important;
                background: var(--bg-card) !important;
                border-radius: 20px 20px 0 0 !important;
                padding: 10px 10px 30px 10px !important;
                box-shadow: 0 -10px 40px rgba(0,0,0,0.2) !important;
                display: none; flex-direction: column; z-index: 10001;
                animation: slideUp 0.3s ease-out;
            }
            .mobile-tools-popup.is-active {
                display: flex !important;
                visibility: visible !important;
                transform: translateY(0);
                animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            }
            .mobile-tools-popup .drag-handle-bar {
                width: 40px; height: 4px; background: var(--border-color); border-radius: 2px;
                margin: 0 auto 10px auto; opacity: 0.6; cursor: grab;
                flex-shrink: 0;
            }
            /* เอา padding-bottom ออกเพื่อให้ drag handle อยู่ด้านบนสุด */
            .mobile-tools-popup { padding-bottom: 10px !important; }
            .mobile-tools-popup button {
                padding: 16px !important; width: 100% !important; text-align: left !important;
                border: none !important; background: transparent !important;
                font-size: 16px !important; font-weight: 600 !important;
                display: flex !important; align-items: center !important; gap: 12px !important;
            }
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
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
