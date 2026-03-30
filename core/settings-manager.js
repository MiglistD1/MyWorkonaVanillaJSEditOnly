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
