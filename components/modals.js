import { getSpaces, setSpaces, saveData, getCurrentSpace, setCurrentSpaceId, getAppSettings, setEditingItemState, getEditingItemState, getGlobalLaunchers, setGlobalLaunchers, getLauncherTags, setLauncherTags } from '../core/storage.js';
import { applyAppSettings } from '../core/settings-manager.js';
import { renderLaunchers } from '../features/customLaunchers.js';
import { renderDefaultDashboard } from '../features/defaultDashboard.js'; // Import renderDefaultDashboard
import { getFaviconUrl } from '../core/ui-helpers.js';
import { svgPencil, svgTrashRed } from '../core/icons.js';

// --- 🔴 New Customize Space Modal Logic ---
export function setupSpaceModals(onRender) {
    const modal = document.getElementById('customize-space-modal');
    let editingSpaceId = null;

    // Elements
    const nameInput = document.getElementById('cust-space-name');
    const folderInput = document.getElementById('cust-space-folder');
    const folderSuggestions = document.getElementById('cust-folder-suggestions');
    const iconInput = document.getElementById('cust-space-icon-input');
    const iconPreview = document.getElementById('cust-space-icon-preview');
    const colorInput = document.getElementById('cust-space-color');
    const iconFileInput = document.getElementById('cust-space-icon-file');
    const bgSpacebarInput = document.getElementById('cust-bg-spacebar');
    const bgWorkspaceInput = document.getElementById('cust-bg-workspace');
    const bgCardInput = document.getElementById('cust-bg-card');
    const textMainInput = document.getElementById('cust-text-main');
    const fontFamilyInput = document.getElementById('cust-font-family');
    const fontSizeInput = document.getElementById('cust-font-size');
    const spacebarTextColorInput = document.getElementById('cust-spacebar-text-color');
    const spacebarFontSizeInput = document.getElementById('cust-spacebar-font-size');
    
    const resetAppearanceBtn = document.getElementById('btn-reset-appearance');
    const resetTypographyBtn = document.getElementById('btn-reset-typography');
    const resetHeadersBtn = document.getElementById('btn-reset-headers');

    const headerTabs = document.getElementById('cust-header-tabs');
    const headerRes = document.getElementById('cust-header-res');
    const headerTasks = document.getElementById('cust-header-tasks');
    
    const btnSave = document.getElementById('btn-save-cust-modal');

    // Helper: Update Preview
    const updatePreview = () => {
        const val = iconInput.value || "📁";
        if (val.startsWith('http') || val.startsWith('data:image')) {
            iconPreview.innerHTML = `<img src="${val}" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">`;
        } else {
            iconPreview.innerText = val;
        }
    };
    iconInput.addEventListener('input', updatePreview);

    // Helper: Render folder tags for selection
    const renderFolderSuggestions = () => {
        if (!folderSuggestions) return;
        const allSpaces = getSpaces();
        const existingFolders = [...new Set(allSpaces.map(s => s.folder).filter(f => f && f !== 'General'))].sort();
        
        folderSuggestions.innerHTML = '';
        existingFolders.forEach(folder => {
            const pill = document.createElement('div');
            pill.className = 'tag-pill';
            pill.style.cssText = 'font-size:10px; padding:2px 8px; cursor:pointer; height:auto; line-height:1.2;';
            pill.innerText = folder;
            pill.onclick = () => {
                folderInput.value = folder;
                saveSpaceData();
            };
            folderSuggestions.appendChild(pill);
        });
    };

    // Helper: Auto-Save Changes
    const saveSpaceData = () => {
        if (!editingSpaceId) return;
        const space = getSpaces().find(s => s.id === editingSpaceId);
        if (!space) return;

        // Update Name (only if not empty to prevent blank names during typing)
        if (nameInput.value.trim()) space.name = nameInput.value.trim();
        space.folder = folderInput.value.trim() || null;

        space.icon = iconInput.value || "📁";
        
        // --- Save Theme Colors ---
        space.theme = {
            primary: colorInput.value,
            bgSpacebar: bgSpacebarInput.value,
            bgWorkspace: bgWorkspaceInput.value,
            bgCard: bgCardInput.value,
            textMain: textMainInput.value,
            fontFamily: fontFamilyInput.value,
            fontSize: fontSizeInput.value,
            spacebarTextColor: spacebarTextColorInput.value,
            spacebarFontSize: spacebarFontSizeInput.value
        };

        space.headers = {
            tabHeader: headerTabs.value.trim(),
            resourceHeader: headerRes.value.trim(),
            taskHeader: headerTasks.value.trim()
        };

        saveData();
        onRender(); // Update UI immediately
    };

    // Bind Auto-Save to Inputs
    const inputs = [
        nameInput, folderInput, iconInput, colorInput, 
        bgSpacebarInput, bgWorkspaceInput, bgCardInput, textMainInput, 
        fontFamilyInput, fontSizeInput, spacebarTextColorInput, spacebarFontSizeInput,
        headerTabs, headerRes, headerTasks
    ];
    inputs.forEach(el => {
        el.addEventListener('input', saveSpaceData);
        el.addEventListener('change', saveSpaceData);
    });
    
    // Handle Icon Upload
    iconPreview.addEventListener('click', () => iconFileInput.click());
    iconFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { 
            iconInput.value = ev.target.result; 
            updatePreview(); 
            saveSpaceData(); // Save icon immediately
        };
        reader.readAsDataURL(file);
    });

    // 1. Open Function (Exported to window)
    window.openCustomizeSpaceModal = (id, prefillFolderName = null) => {
        modal.style.display = 'flex';
        renderFolderSuggestions();
        if (id) {
            // Edit Existing Space
            editingSpaceId = id;
            const space = getSpaces().find(s => s.id === id);
            if (!space) return;
            
            nameInput.value = space.name;
            folderInput.value = space.folder || "";

            iconInput.value = space.icon || "📁";
            btnSave.innerText = "Done"; // Change button text

            // --- Load Theme Colors ---
            // Migrate old themeColor if it exists
            if (space.themeColor && !space.theme) {
                space.theme = { primary: space.themeColor };
                delete space.themeColor;
            }

            const globalSettings = getAppSettings();
            const defaultColors = globalSettings.isDarkMode ? { body: '#191919', spacebar: '#202020', card: '#252525', text: '#eeeeee', textMuted: '#aaaaaa' } : { body: '#f4f4f0', spacebar: '#ebebe6', card: '#ffffff', text: '#111111', textMuted: '#555555' };
            colorInput.value = space.theme?.primary || globalSettings.color;
            // Fallback to legacy 'bgSidebar' if 'bgSpacebar' doesn't exist
            bgSpacebarInput.value = space.theme?.bgSpacebar || space.theme?.bgSidebar || defaultColors.spacebar;
            bgWorkspaceInput.value = space.theme?.bgWorkspace || space.theme?.bgBody || defaultColors.body;
            bgCardInput.value = space.theme?.bgCard || defaultColors.card;
            textMainInput.value = space.theme?.textMain || defaultColors.text;
            fontFamilyInput.value = space.theme?.fontFamily || "";
            fontSizeInput.value = space.theme?.fontSize || 15;
            spacebarTextColorInput.value = space.theme?.spacebarTextColor || space.theme?.sidebarTextColor || defaultColors.textMuted;
            spacebarFontSizeInput.value = space.theme?.spacebarFontSize || space.theme?.sidebarFontSize || 13;

            const h = space.headers || {};
            headerTabs.value = h.tabHeader || "";
            headerRes.value = h.resourceHeader || "";
            headerTasks.value = h.taskHeader || "";
        } else {
            // Create New Space
            const spaces = getSpaces();
            const newId = spaces.length ? Math.max(...spaces.map(s => s.id)) + 1 : 1;
            
            // Create immediate space object
            const newSpace = { id: newId, name: "New Space", folder: null, isArchived: false, tabs: [], resources: [], driveFiles: [], note: "", tasks: [], tags: [], icon: "📁" };
            spaces.push(newSpace);
            setCurrentSpaceId(newId);
            editingSpaceId = newId;
            
            // Set Defaults in Inputs
            nameInput.value = "New Space";
            folderInput.value = (prefillFolderName === 'General') ? "" : (prefillFolderName || "");
            iconInput.value = "📁";
            btnSave.innerText = "Create";
            
            const globalSettings = getAppSettings();
            const defaultColors = globalSettings.isDarkMode ? { body: '#191919', spacebar: '#202020', card: '#252525', text: '#eeeeee', textMuted: '#aaaaaa' } : { body: '#f4f4f0', spacebar: '#ebebe6', card: '#ffffff', text: '#111111', textMuted: '#555555' };
            colorInput.value = globalSettings.color;
            bgSpacebarInput.value = defaultColors.spacebar;
            bgWorkspaceInput.value = defaultColors.body;
            bgCardInput.value = defaultColors.card;
            textMainInput.value = defaultColors.text;
            fontFamilyInput.value = "";
            fontSizeInput.value = 15;
            spacebarTextColorInput.value = defaultColors.textMuted;
            spacebarFontSizeInput.value = 13;

            headerTabs.value = ""; headerRes.value = ""; headerTasks.value = "";
            
            // Save initial defaults to the new space and render
            saveSpaceData();
            
            // Select name for easy editing
            setTimeout(() => nameInput.select(), 100);
        }
        updatePreview();
    };

    // 2. Actions
    document.getElementById('btn-close-cust-modal').onclick = () => modal.style.display = 'none';
    
    resetAppearanceBtn.onclick = () => {
        const globalSettings = getAppSettings();
        const defaultColors = globalSettings.isDarkMode ? { body: '#191919', spacebar: '#202020', card: '#252525', text: '#eeeeee', textMuted: '#aaaaaa' } : { body: '#f4f4f0', spacebar: '#ebebe6', card: '#ffffff', text: '#111111', textMuted: '#555555' };
        
        colorInput.value = globalSettings.color;
        bgSpacebarInput.value = defaultColors.spacebar;
        bgWorkspaceInput.value = defaultColors.body;
        bgCardInput.value = defaultColors.card;
        textMainInput.value = defaultColors.text;
        spacebarTextColorInput.value = defaultColors.textMuted;
        saveSpaceData(); // Auto-save reset
    };

    resetTypographyBtn.onclick = () => {
        fontFamilyInput.value = "";
        fontSizeInput.value = 15;
        spacebarFontSizeInput.value = 13;
        saveSpaceData(); // Auto-save reset
    };

    resetHeadersBtn.onclick = () => {
        headerTabs.value = "";
        headerRes.value = "";
        headerTasks.value = "";
        saveSpaceData(); // Auto-save reset
    };

    btnSave.onclick = () => {
        const name = nameInput.value.trim();
        if (!name) return alert("Space name cannot be empty");
        
        // Final save just in case (though input event handles it)
        saveSpaceData();
        modal.style.display = 'none';
    };

    // Connect Add Button in Sidebar
    const btnAdd = document.getElementById('btn-add-space');
    if(btnAdd) btnAdd.onclick = () => window.openCustomizeSpaceModal(null);
}


// --- Launcher Modal Logic ---
let editingLauncherId = null;
let tempLauncherIcon = null;

export function setupLauncherModal() {
    const modal = document.getElementById('launcher-modal');
    const typeInput = document.getElementById('launcher-type');
    const nameInput = document.getElementById('launcher-name-input');
    const tagInput = document.getElementById('launcher-tag-input');
    const btnAddTag = document.getElementById('btn-add-new-tag');
    const btnRandomTagColor = document.getElementById('btn-random-tag-color');
    const tagColorInput = document.getElementById('launcher-tag-color');
    const tagSuggestions = document.getElementById('launcher-tag-suggestions');
    const urlInput = document.getElementById('launcher-url-input');
    const sideViewInput = document.getElementById('launcher-side-view');
    const webSplitInput = document.getElementById('launcher-web-split');
    const webNewWindowInput = document.getElementById('launcher-web-new-window');
    const webPosWrapper = document.getElementById('wrapper-web-pos-selection');
    const localPosWrapper = document.getElementById('wrapper-local-pos-selection');
    const splitWindowsInput = document.getElementById('launcher-split-windows');
    const webOptGroup = document.getElementById('group-launcher-web-opt');
    const localOptGroup = document.getElementById('group-launcher-local-opt');
    const previewBox = document.getElementById('launcher-preview-box');
    const colorPicker = document.getElementById('launcher-color-picker');
    const fileInput = document.getElementById('launcher-icon-file');
    const deleteBtn = document.getElementById('btn-delete-launcher');
    const visibilityAllRadio = document.querySelector('input[name="launcherVisibility"][value="all"]');
    const visibilitySpecificRadio = document.querySelector('input[name="launcherVisibility"][value="specific"]');
    const spaceSelectionContainer = document.getElementById('launcher-space-selection-container');


    // Toggle UI based on Type
    typeInput.addEventListener('change', () => {
        if (typeInput.value === 'local') {
            webOptGroup.style.setProperty('display', 'none', 'important');
            localOptGroup.style.display = 'flex';
            urlInput.placeholder = "C:\\Program Files\\App.exe";
        } else {
            webOptGroup.style.setProperty('display', 'flex', 'important');
            localOptGroup.style.display = 'none';
            urlInput.placeholder = "https://example.com";
        }
    });

    const updateWebNewWindowUI = () => {
        const wrapper = document.getElementById('wrapper-web-new-window');
        if (webSplitInput.checked) {
            wrapper.style.opacity = '1';
            wrapper.style.pointerEvents = 'auto';
            if (webNewWindowInput.checked) {
                webPosWrapper.style.display = 'flex';
            } else {
                webPosWrapper.style.display = 'none';
            }
        } else {
            webNewWindowInput.checked = false;
            wrapper.style.opacity = '0.5';
            wrapper.style.pointerEvents = 'none';
            webPosWrapper.style.display = 'none';
        }
    };

    const updateLocalPosUI = () => {
        if (splitWindowsInput.checked) {
            localPosWrapper.style.display = 'flex';
        } else {
            localPosWrapper.style.display = 'none';
        }
    };

    // Toggle New Window visibility and handle mutual exclusivity between Side Panel and Half Screen
    if (webSplitInput && webNewWindowInput && sideViewInput) {
        webSplitInput.addEventListener('change', () => {
            if (webSplitInput.checked) {
                sideViewInput.checked = false;
            }
            updateWebNewWindowUI();
        });

        webNewWindowInput.addEventListener('change', updateWebNewWindowUI);

        sideViewInput.addEventListener('change', () => {
            if (sideViewInput.checked) {
                webSplitInput.checked = false;
                updateWebNewWindowUI();
            }
        });
    }

    if (splitWindowsInput) {
        splitWindowsInput.addEventListener('change', updateLocalPosUI);
    }

    // Visibility radio button logic
    if (visibilityAllRadio && visibilitySpecificRadio && spaceSelectionContainer) {
        visibilityAllRadio.addEventListener('change', () => {
            if (visibilityAllRadio.checked) {
                spaceSelectionContainer.style.display = 'none';
            }
        });
        visibilitySpecificRadio.addEventListener('change', () => {
            if (visibilitySpecificRadio.checked) {
                spaceSelectionContainer.style.display = 'block';
            }
        });
    }
    // Update suggestions immediately when picking a tag color or typing name
    tagColorInput.addEventListener('input', () => renderSuggestions());
    tagInput.addEventListener('input', () => renderSuggestions());

    // Random Color Button Logic
    if (btnRandomTagColor) {
        btnRandomTagColor.onclick = () => {
            tagColorInput.value = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
            tagColorInput.dispatchEvent(new Event('input'));
        };
    }

    // Render Tag Suggestions
    const renderSuggestions = () => {
        const launchers = getGlobalLaunchers(); // Keep for auto-picking color
        const tags = getLauncherTags() || [];
        
        tagSuggestions.innerHTML = '';
        if (tags.length === 0) {
            tagSuggestions.innerHTML = '<span style="font-size:11px; color:var(--text-muted); font-style:italic;">No saved tags</span>';
            return;
        }

        tags.forEach(tag => {
            // Find existing color for this tag
            const match = launchers.find(l => l.tag === tag && l.tagColor);
            const isEditing = tag === tagInput.value.trim();
            
            let bg, fg, border, isMatch;
            // Priority 1: Current Input (Real-time preview)
            if (isEditing && tagColorInput.value) {
                bg = 'var(--hover-bg)'; fg = tagColorInput.value; border = tagColorInput.value; isMatch = true;
            } else if (match) {
                bg = 'var(--hover-bg)'; fg = match.tagColor; border = match.tagColor; isMatch = true;
            } else {
                bg = 'var(--hover-bg)'; fg = 'var(--text-muted)'; border = 'var(--border-color)'; isMatch = false;
            }

            const badge = document.createElement('div');
            badge.style.cssText = `display:inline-flex; align-items:center; background:${bg}; padding:2px 6px 2px 10px; border-radius:12px; font-size:11px; border:1px solid ${border}; color:${fg}; cursor:pointer; font-weight:600;`;
            
            const span = document.createElement('span');
            span.innerText = tag;
            span.onclick = () => {
                tagInput.value = tag;
                // Auto-pick color from existing group
                if (match) tagColorInput.value = match.tagColor;
            };

            // Delete Button
            const btnDel = document.createElement('span');
            btnDel.innerHTML = svgTrashRed;
            btnDel.style.cssText = "margin-left:2px; opacity:0.8; display:flex; transform:scale(0.8);";
            btnDel.onclick = (e) => {
                e.stopPropagation();
                if(confirm(`Delete tag "${tag}" from all shortcuts?`)) {
                    // Remove from all launchers
                    launchers.forEach(l => { if(l.tag === tag) l.tag = ""; });
                    // Remove from central list
                    setLauncherTags(getLauncherTags().filter(t => t !== tag));

                    saveData();
                    renderLaunchers();
                    renderSuggestions();
                    if (tagInput.value === tag) tagInput.value = "";
                }
            };

            badge.appendChild(span);
            badge.appendChild(btnDel);
            tagSuggestions.appendChild(badge);
        });
    };

    // Add New Tag Button Logic
    if (btnAddTag) {
        btnAddTag.onclick = () => {
            const newTag = tagInput.value.trim();
            const newColor = tagColorInput.value;

            if (newTag) {
                const allTags = getLauncherTags();
                // Case-insensitive check
                const existingTagIndex = allTags.findIndex(t => t.toLowerCase() === newTag.toLowerCase());
                
                if (existingTagIndex === -1) {
                    allTags.push(newTag);
                    setLauncherTags(allTags);
                } else {
                    // Update existing tag color in all launchers
                    const realTagName = allTags[existingTagIndex];
                    let launchers = getGlobalLaunchers();
                    launchers.forEach(l => { if (l.tag === realTagName) l.tagColor = newColor; });
                    setGlobalLaunchers(launchers);
                }
                saveData(); // Save the new tag list
                renderSuggestions(); // Re-render the suggestions to show the new tag
            }
            tagInput.focus();
        };
    }

    // Export Open Function
    window.openLauncherModal = (id) => {
        editingLauncherId = id;
        tempLauncherIcon = null;
        modal.style.display = 'flex';

        // Populate space visibility options
        if (spaceSelectionContainer) {
            spaceSelectionContainer.innerHTML = '';
            const allSpaces = getSpaces();
            allSpaces.forEach(space => {
                const label = document.createElement('label');
                label.style.cssText = 'display: block; padding: 4px 8px; cursor: pointer; border-radius: 4px;';
                label.innerHTML = `
                    <label class="google-task-checkbox">
                        <input type="checkbox" class="launcher-space-checkbox" value="${space.id}">
                        <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div>
                    </label> ${space.name}`;
                spaceSelectionContainer.appendChild(label);
            });
        }

        if (id) {
            const launchers = getGlobalLaunchers();
            const item = launchers.find(l => l.id === id);
            if (item) {
                typeInput.value = item.type || 'web';
                nameInput.value = item.name || "";
                if (tagInput) tagInput.value = item.tag || "";
                if (tagColorInput) tagColorInput.value = item.tagColor || "#555555";
                urlInput.value = item.url;
                if (sideViewInput) sideViewInput.checked = item.isSideView || false;
                if (webSplitInput) webSplitInput.checked = item.isWebSplit || false;
                if (webNewWindowInput) webNewWindowInput.checked = item.isWebNewWindow || false;
                if (item.webNewWindowPos === 'left') {
                    document.querySelector('input[name="launcher-web-pos"][value="left"]').checked = true;
                } else {
                    document.querySelector('input[name="launcher-web-pos"][value="right"]').checked = true;
                }
                if (splitWindowsInput) splitWindowsInput.checked = item.isSplitWindows || false;
                colorPicker.value = item.bgColor || '#ffffff';
                tempLauncherIcon = item.iconData;
                updateLauncherPreview();
                deleteBtn.style.display = 'block';

                // Set visibility state
                if (item.visibleInSpaces && item.visibleInSpaces.length > 0) {
                    visibilitySpecificRadio.checked = true;
                    spaceSelectionContainer.style.display = 'block';
                    item.visibleInSpaces.forEach(spaceId => {
                        const checkbox = spaceSelectionContainer.querySelector(`input[value="${spaceId}"]`);
                        if (checkbox) checkbox.checked = true;
                    });
                } else {
                    visibilityAllRadio.checked = true;
                    spaceSelectionContainer.style.display = 'none';
                }
            }
        } else {
            typeInput.value = 'web';
            nameInput.value = "";
            if (tagInput) tagInput.value = "";
            if (tagColorInput) tagColorInput.value = "#555555";
            urlInput.value = "";
            if (sideViewInput) sideViewInput.checked = false;
            if (webSplitInput) webSplitInput.checked = false;
            if (webNewWindowInput) webNewWindowInput.checked = false;
            document.querySelector('input[name="launcher-web-pos"][value="right"]').checked = true;
            if (splitWindowsInput) splitWindowsInput.checked = false;
            document.querySelector('input[name="launcher-local-pos"][value="right"]').checked = true;
            colorPicker.value = "#ffffff";
            tempLauncherIcon = null;
            updateLauncherPreview();
            deleteBtn.style.display = 'none';
            // Reset visibility for new item
            visibilityAllRadio.checked = true;
            spaceSelectionContainer.style.display = 'none';
        }

        // Trigger type change to set correct UI state
        typeInput.dispatchEvent(new Event('change'));
        renderSuggestions(); // Load suggestions

        // If no icon is set, but a URL exists, fetch the favicon on open.
        const currentUrl = urlInput.value.trim();
        if (!tempLauncherIcon && currentUrl) {
            tempLauncherIcon = getFaviconUrl(currentUrl);
            updateLauncherPreview();
        }
    };

    function updateLauncherPreview() {
        previewBox.style.background = colorPicker.value;
        if (tempLauncherIcon) {
            previewBox.innerHTML = `<img src="${tempLauncherIcon}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">`;
        } else {
            previewBox.innerHTML = `<svg style="width:20px;height:20px;color:var(--text-muted);"><use href="#icon-link"></use></svg>`;
        }
    }

    // Events
    previewBox.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { tempLauncherIcon = ev.target.result; updateLauncherPreview(); };
        reader.readAsDataURL(file);
    };
    colorPicker.oninput = updateLauncherPreview;
    document.getElementById('btn-reset-launcher-icon').onclick = () => {
        tempLauncherIcon = null;
        const url = urlInput.value.trim();
        if (url) {
            tempLauncherIcon = getFaviconUrl(url);
        }
        updateLauncherPreview();
    };
    document.getElementById('btn-close-launcher').onclick = () => modal.style.display = 'none';

    // When URL field loses focus, if there's no icon, fetch it.
    urlInput.addEventListener('blur', () => {
        const url = urlInput.value.trim();
        if (url && !tempLauncherIcon) {
            tempLauncherIcon = getFaviconUrl(url);
            updateLauncherPreview();
        }
    });

    document.getElementById('btn-save-launcher').onclick = () => {
        let launchers = getGlobalLaunchers();

        // Get visibility data
        let visibleInSpaces = [];
        if (visibilitySpecificRadio.checked) {
            document.querySelectorAll('#launcher-space-selection-container .launcher-space-checkbox:checked').forEach(cb => {
                visibleInSpaces.push(parseInt(cb.value));
            });
        }
        if (editingLauncherId) {
            const item = launchers.find(l => l.id === editingLauncherId);
            if (item) { 
                item.type = typeInput.value;
                item.name = nameInput.value.trim(); 
                item.tag = tagInput ? tagInput.value.trim() : "";
                item.tagColor = tagColorInput ? tagColorInput.value : "#555555";
                item.url = urlInput.value; 
                item.isSideView = sideViewInput ? sideViewInput.checked : false;
                item.isWebSplit = webSplitInput ? webSplitInput.checked : false;
                item.isWebNewWindow = webNewWindowInput ? webNewWindowInput.checked : false;
                item.webNewWindowPos = document.querySelector('input[name="launcher-web-pos"]:checked').value;
                item.isSplitWindows = splitWindowsInput ? splitWindowsInput.checked : false;
                item.localAppPos = document.querySelector('input[name="launcher-local-pos"]:checked').value;
                item.iconData = tempLauncherIcon; 
                item.bgColor = colorPicker.value;
                item.visibleInSpaces = visibleInSpaces;
            }
        } else {
            launchers.push({ 
                id: Date.now(), 
                type: typeInput.value,
                name: nameInput.value.trim(), 
                tag: tagInput ? tagInput.value.trim() : "",
                tagColor: tagColorInput ? tagColorInput.value : "#555555",
                url: urlInput.value, iconData: tempLauncherIcon,
                isSideView: sideViewInput ? sideViewInput.checked : false,
                isWebSplit: webSplitInput ? webSplitInput.checked : false,
                isWebNewWindow: webNewWindowInput ? webNewWindowInput.checked : false,
                webNewWindowPos: document.querySelector('input[name="launcher-web-pos"]:checked').value,
                isSplitWindows: splitWindowsInput ? splitWindowsInput.checked : false,
                localAppPos: document.querySelector('input[name="launcher-local-pos"]:checked').value,
                bgColor: colorPicker.value,
                visibleInSpaces: visibleInSpaces
            });
        }
        setGlobalLaunchers(launchers);
        saveData();
        renderLaunchers();
        modal.style.display = 'none';
    };

    deleteBtn.onclick = () => {
        if(confirm("Delete this shortcut?")) {
            setGlobalLaunchers(getGlobalLaunchers().filter(l => l.id !== editingLauncherId));
            saveData();
            renderLaunchers();
            modal.style.display = 'none';
        }
    };
}

// Helper export to make it available to the module
export const openLauncherModal = (id) => window.openLauncherModal(id);

// --- จัดการ Tag Modal (Opening) ---
export function setupTagModal(onRender) {
    // 1. Handle Closing
    const closeBtn = document.getElementById('btn-close-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => { 
            document.getElementById('tag-modal').style.display = 'none'; 
        });
    }

    const saveBtn = document.getElementById('btn-save-item-tags');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const { type, index } = getEditingItemState();
            const space = getCurrentSpace();
            if (!space || type === null || index === null) return;

            let item = null;
            if (type === 'resource') item = space.resources[index];
            else if (type === 'drive') item = space.driveFiles[index];
            else if (type === 'task') item = space.tasks[index];
            else if (type === 'tab') item = space.tabs[index];

            if (item) {
                const selectedTags = [];
                document.querySelectorAll('#modal-tag-list-container .modal-checkbox-item:checked').forEach(cb => {
                    selectedTags.push(cb.value);
                });
                item.tags = selectedTags;
                saveData();
                if (window._isModalOpenedFromCommandCenter) {
                    setCurrentSpaceId(0); // Reset to Command Center
                    renderDefaultDashboard();
                } else {
                    onRender(); // Original render for regular spaces
                }
            }
            document.getElementById('tag-modal').style.display = 'none';
        });
    }

    // 2. Event Delegation for Opening Modal
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-edit-tags');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            handleMiniTagClick(btn, onRender); // No need to pass fromCommandCenter here, flag is set in defaultDashboard.js
        }
    });
}

export function handleMiniTagClick(btn, onRender) {
    const type = btn.getAttribute('data-type');
    const index = parseInt(btn.getAttribute('data-index'));
    const space = getCurrentSpace();

    if (!space) return;

    let item;
    if (type === 'resource') item = space.resources[index];
    else if (type === 'drive') item = space.driveFiles[index];
    else if (type === 'task') item = space.tasks[index];
    else if (type === 'tab') item = space.tabs[index];

    if (!item) return;
    if (!item.tags) item.tags = [];

    // Set shared state for searchManager to use when saving
    setEditingItemState(type, index);

    const defaultTags = ["AI", "Half screen"];
    const customTags = space.tags ? space.tags.filter(t => !defaultTags.includes(t)) : [];
    
    let html = '';

    // --- ส่วนที่ 1: Default Tags ---
    html += `
        <div class="tag-selection-section">
            <span class="tag-selection-label">Standard Tags</span>
            <div class="tag-selection-list">
                ${defaultTags.map(tag => {
                    const isChecked = item.tags.map(t => t.toUpperCase()).includes(tag.toUpperCase()) ? "checked" : "";
                    return `
                        <label class="tag-select-row" for="tag-checkbox-${tag.replace(/\s/g, '-')}-${index}" style="display:flex; align-items:center; gap:10px;">
                            <label class="google-task-checkbox">
                                <input type="checkbox" class="modal-checkbox-item" value="${tag}" ${isChecked}>
                                <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div>
                            </label>
                            <span>${tag === 'AI' ? '🤖 AI' : '💻 Half screen'}</span>
                            <span class="tag-type-badge">System</span>
                        </label>`;
                }).join('')}
            </div>
        </div>`;

    // --- ส่วนที่ 2: Custom Tags ---
    if (customTags.length > 0) {
        html += `
            <div class="tag-selection-section">
                <span class="tag-selection-label">Your Tags</span>
                <div class="tag-selection-list">
                    ${customTags.map(tag => {
                        const isChecked = item.tags.map(t => t.toUpperCase()).includes(tag.toUpperCase()) ? "checked" : "";
                        return `
                            <label class="tag-select-row" for="tag-checkbox-${tag.replace(/\s/g, '-')}-${index}" style="display:flex; align-items:center; gap:10px;">
                                <label class="google-task-checkbox">
                                    <input type="checkbox" class="modal-checkbox-item" value="${tag}" ${isChecked}>
                                    <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div>
                                </label>
                                <span>${tag}</span>
                            </label>`;
                    }).join('')}
                </div>
            </div>`;
    }

    const container = document.getElementById("modal-tag-list-container");
    if (container) {
        container.innerHTML = html;
        const tagModal = document.getElementById("tag-modal");
        if (tagModal) tagModal.style.display = "flex";
    } else {
        const currentTagsStr = item.tags.join(', ');
        const newTagsStr = prompt(`Manage tags for this item (comma separated)\nEx: Work, Urgent, Read`, currentTagsStr);
        if (newTagsStr !== null) {
            const newTagsArray = newTagsStr.split(',').map(t => t.trim()).filter(t => t !== "");
            item.tags = newTagsArray;
                if (window._isModalOpenedFromCommandCenter) {
                    setCurrentSpaceId(0);
                    renderDefaultDashboard();
                }
            saveData();
            onRender();
        }
    }
}

// --- จัดการ Settings Modal ---
export function setupSettingsModal(onRender) {
    function updateSettingPreview(val) {
        const preview = document.getElementById('setting-icon-preview');
        if (val.startsWith('http') || val.startsWith('data:image')) {
            preview.innerHTML = `<img src="${val}" style="width:100%; height:100%; object-fit:cover;">`;
            preview.style.background = 'transparent';
        } else {
            preview.innerText = val || "🚀";
            preview.style.background = 'var(--bg-body)';
        }
    }

    document.getElementById('btn-open-settings').addEventListener('click', () => { 
        const appSettings = getAppSettings();
        document.getElementById('setting-title').value = appSettings.title; 
        const currentIcon = appSettings.icon || "🚀";
        document.getElementById('setting-icon').value = currentIcon; 
        updateSettingPreview(currentIcon);
        document.getElementById('setting-auto-delete-days').value = appSettings.autoDeleteDays || 30;
        document.getElementById('setting-color').value = appSettings.color; 
        document.getElementById('setting-app-font').value = appSettings.font;
        document.getElementById('settings-modal').style.display = 'flex'; 
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => { document.getElementById('settings-modal').style.display = 'none'; });
    
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        const appSettings = getAppSettings();
        appSettings.title = document.getElementById('setting-title').value;
        appSettings.icon = document.getElementById('setting-icon').value;
        appSettings.color = document.getElementById('setting-color').value;
        appSettings.font = document.getElementById('setting-app-font').value;
        appSettings.autoDeleteDays = parseInt(document.getElementById('setting-auto-delete-days').value) || 30;
        document.getElementById('settings-modal').style.display = 'none';
        saveData();
        applyAppSettings();
    });
    
    // Icon Inputs
    document.querySelectorAll('.emoji-pick').forEach(btn => btn.addEventListener('click', (e) => { 
        document.getElementById('setting-icon').value = e.target.innerText; 
        updateSettingPreview(e.target.innerText); 
    }));
    document.getElementById('setting-icon').addEventListener('input', (e) => updateSettingPreview(e.target.value));
    document.getElementById('btn-trigger-icon-upload').addEventListener('click', () => document.getElementById('setting-icon-file').click());
    document.getElementById('setting-icon-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target.result;
            document.getElementById('setting-icon').value = base64;
            updateSettingPreview(base64);
        };
        reader.readAsDataURL(file);
    });
}

// --- แก้ไข Resource / Drive / Task ---
export function setupItemModals(onRender) {
    const modal = document.getElementById('modal-edit-res');
    const iconPreview = document.getElementById('edit-res-icon-preview');
    const iconFile = document.getElementById('edit-res-icon-file');
    const urlInput = document.getElementById('edit-res-url');
    const btnFetch = document.getElementById('btn-fetch-favicon');
    let tempIconData = null;

    const updatePreview = () => {
        const url = urlInput.value.trim();
        const displayUrl = getFaviconUrl(url, tempIconData);
        iconPreview.innerHTML = `<img src="${displayUrl}" style="width:100%; height:100%; object-fit:cover;">`;
    };

    // Handle Icon Upload
    iconPreview.onclick = () => iconFile.click();
    iconFile.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            tempIconData = ev.target.result;
            updatePreview();
        };
        reader.readAsDataURL(file);
    };

    // Handle Fetch Favicon
    btnFetch.onclick = () => {
        tempIconData = null; // Reset to automatic favicon
        updatePreview();
    };

    urlInput.addEventListener('input', updatePreview);

    // Close on click outside
    modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
    };

    window.editResource = (type, index) => {
        const space = getCurrentSpace();
        let item = null;

        if (index === -1) {
            // โหมดเพิ่มใหม่ (Add New Local Program)
            item = { 
                title: "", 
                url: "", 
                tags: ["Half screen"], 
                isSideView: true // เปิด sideview ไว้เลยเพราะเป็น Local Program
            };
        } else {
            if (type === 'resource') item = space.resources[index];
            else if (type === 'drive') item = space.driveFiles[index];
            else if (type === 'todo' || type === 'habit') item = space.tasks[index];
        }

        if (!item) return;

        tempIconData = item.favIconUrl || null;
        updatePreview();

        document.getElementById('edit-res-type').value = type;
        document.getElementById('edit-res-index').value = index;
        document.getElementById('edit-res-title').value = item.title || item.text || "";
        
        const urlInput = document.getElementById('edit-res-url');
        const urlContainer = document.getElementById('edit-res-url-container');

        urlContainer.style.display = (type === 'todo' || type === 'habit') ? 'none' : 'block';
        urlInput.value = item.url || "";

        urlInput.placeholder = "https://... or D:\\Path\\To\\App.exe";

        document.getElementById('edit-res-tags').value = (item.tags || []).join(', ');
        modal.style.display = 'flex';
    };

    const saveResBtn = document.getElementById('modal-edit-res-save');
    if (saveResBtn) {
        saveResBtn.onclick = () => {
            const type = document.getElementById('edit-res-type').value;
            const index = parseInt(document.getElementById('edit-res-index').value);
            const title = document.getElementById('edit-res-title').value.trim();
            const url = document.getElementById('edit-res-url').value.trim();
            const tagsRaw = document.getElementById('edit-res-tags').value;

            const space = getCurrentSpace();
            let item = null;

            if (index === -1) {
                // สร้าง Object ใหม่แล้ว Push เข้า Array
                const newItem = {
                    title: title,
                    url: url,
                    favIconUrl: tempIconData,
                    tags: tagsRaw.split(',').map(t => t.trim()).filter(t => t !== ""),
                    isSideView: true
                };
                if (type === 'resource') space.resources.push(newItem);
            } else {
                if (type === 'resource') item = space.resources[index];
                else if (type === 'drive') item = space.driveFiles[index];
                else if (type === 'todo' || type === 'habit') item = space.tasks[index];
                
                if (item) {
                    if (type === 'todo' || type === 'habit') item.text = title;
                    else { item.title = title; item.url = url; }
                    item.favIconUrl = tempIconData;
                    item.tags = tagsRaw.split(',').map(t => t.trim()).filter(t => t !== "");
                }
            }
            
            saveData();
            onRender();
            modal.style.display = 'none';
        };
    }
}
