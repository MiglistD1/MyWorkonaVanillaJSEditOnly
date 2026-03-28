import { getFilterTags, getCurrentSpace, getAppSettings, saveData } from '../core/storage.js';
import { openOrFocusTab } from '../core/ui-helpers.js';

let manualKeepTag = null;

export function initGoogleKeep() {
    const btnOpen = document.getElementById('btn-open-keep');
    const btnTag = document.getElementById('btn-keep-tag');

    // --- Create Custom Modal for Keep Tag ---
    if (!document.getElementById('keep-tag-modal')) {
        const modalHTML = `
        <div id="keep-tag-modal" class="modal-overlay" style="display:none; z-index:1200; align-items:center; justify-content:center;">
            <div class="modal-content" style="width: 320px; background:var(--bg-card); padding:20px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.15); border:1px solid var(--border-color);">
                <h3 style="margin-top:0; margin-bottom:10px; font-size:18px; color:var(--text-main); display:flex; align-items:center; gap:8px;">
                    🏷️ Keep Filter Settings
                </h3>
                <p style="font-size:13px; color:var(--text-muted); margin-bottom:15px; line-height:1.4;">
                    Specify the Label name to open in Google Keep<br>(If unspecified, uses current Space Filter)
                </p>
                
                <div style="display:flex; gap:6px; margin-bottom:15px;">
                    <input type="text" id="keep-tag-input" class="settings-input" placeholder="Enter Label..." style="flex:1; padding:8px 12px; border:1px solid var(--border-color); border-radius:6px; background:var(--input-bg); color:var(--text-main); font-size:14px;">
                    <button id="btn-add-keep-label" style="padding:0 12px; background:var(--bg-body); border:1px solid var(--border-color); border-radius:6px; cursor:pointer; color:var(--text-main); font-size:13px; font-weight:600; white-space:nowrap;">+ Add</button>
                </div>

                <div style="margin-bottom:15px;" id="container-saved-labels">
                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">Saved Labels:</div>
                    <div id="keep-saved-labels" style="display:flex; flex-wrap:wrap; gap:6px; max-height:80px; overflow-y:auto; padding:2px;">
                        <span style="font-size:12px; color:var(--text-muted); font-style:italic;">No saved labels yet</span>
                    </div>
                </div>

                <div style="margin-bottom:20px;">
                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">Select from Space Tags:</div>
                    <div id="keep-tag-suggestions" style="display:flex; flex-wrap:wrap; gap:6px; max-height:80px; overflow-y:auto; padding:2px;"></div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <button id="btn-clear-keep-tag" style="background:transparent; border:none; color:#ef4444; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; padding:5px 8px; border-radius:4px; transition:background 0.2s;">
                        <svg style="width:14px;height:14px;margin-right:4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> 
                        Clear
                    </button>
                    <div style="display:flex; gap:8px;">
                        <button id="btn-cancel-keep-tag" style="padding:6px 12px; border:1px solid var(--border-color); background:transparent; border-radius:6px; cursor:pointer; color:var(--text-main); font-size:13px;">Cancel</button>
                        <button id="btn-save-keep-tag" style="padding:6px 16px; border:none; background:var(--primary-color); color:white; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; box-shadow:0 2px 4px rgba(0,0,0,0.1);">Save</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add Hover Effect for Clear Button via JS
        const clrBtn = document.getElementById('btn-clear-keep-tag');
        if(clrBtn) {
            clrBtn.onmouseenter = () => clrBtn.style.background = '#fee2e2';
            clrBtn.onmouseleave = () => clrBtn.style.background = 'transparent';
        }
    }
    const modal = document.getElementById('keep-tag-modal');
    const input = document.getElementById('keep-tag-input');
    
    // --- New Menu Logic ---
    const btnMenu = document.getElementById('btn-google-apps-menu');
    const popup = document.getElementById('google-apps-popup');
    const keepSideBtn = document.getElementById('keep-side-view-btn');

    if (btnMenu && popup) {
        btnMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && e.target !== btnMenu && !btnMenu.contains(e.target)) {
                popup.style.display = 'none';
            }
        });
    }

    // --- Event Delegation สำหรับปุ่มใน Master Command Center ---
    document.addEventListener('click', (e) => {
        const target = e.target;

        // 1. Toggle Side View สำหรับ Keep
        const mSideBtn = target.closest('#master-keep-side-view-btn');
        if (mSideBtn) {
            e.stopPropagation();
            mSideBtn.classList.toggle('active-side-view');
            return;
        }

        // 2. เปิดหน้าต่างตั้งค่าป้ายกำกับ
        if (target.closest('#master-btn-keep-tag')) {
            openKeepTagSettings();
            return;
        }

        // 3. เปิด Google Keep
        if (target.closest('#master-btn-open-keep')) {
            const mSideBtn = document.getElementById('master-keep-side-view-btn');
            const isSideView = mSideBtn && mSideBtn.classList.contains('active-side-view');
            openKeepWithTag(getEffectiveKeepTag(), isSideView);
        }
    });

    if (keepSideBtn) {
        keepSideBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            keepSideBtn.classList.toggle('active-side-view');
        });
    }

    if (btnOpen) {
        btnOpen.addEventListener('click', () => {
            const isSideView = keepSideBtn && keepSideBtn.classList.contains('active-side-view');
            openKeepWithTag(getEffectiveKeepTag(), isSideView);
        });
    }

    if (btnTag) {
        btnTag.addEventListener('click', openKeepTagSettings);
    }

    function openKeepTagSettings() {
        const modal = document.getElementById('keep-tag-modal');
        const input = document.getElementById('keep-tag-input');
        input.value = manualKeepTag || "";
        
        const savedContainer = document.getElementById('keep-saved-labels');
        const appSettings = getAppSettings();
        if (!appSettings.keepLabels) appSettings.keepLabels = [];
        
        const renderSaved = () => {
            savedContainer.innerHTML = '';
            if (appSettings.keepLabels.length === 0) {
                savedContainer.innerHTML = '<span style="font-size:12px; color:var(--text-muted); font-style:italic;">No saved labels yet</span>';
                return;
            }
            appSettings.keepLabels.forEach((lbl, idx) => {
                const chip = document.createElement('div');
                chip.style.cssText = "display:inline-flex; align-items:center; padding:3px 8px; border:1px solid #bae6fd; background:#f0f9ff; border-radius:12px; color:#0369a1; font-size:12px; cursor:pointer;";
                const textSpan = document.createElement('span');
                textSpan.innerText = lbl;
                textSpan.onclick = () => { input.value = lbl; input.focus(); };
                const delBtn = document.createElement('span');
                delBtn.innerHTML = '×';
                delBtn.style.cssText = "margin-left:6px; cursor:pointer; font-weight:bold; color:#0284c7; opacity:0.6;";
                delBtn.onmouseenter = () => delBtn.style.opacity = '1';
                delBtn.onmouseleave = () => delBtn.style.opacity = '0.6';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    appSettings.keepLabels.splice(idx, 1);
                    saveData();
                    renderSaved();
                };
                chip.appendChild(textSpan);
                chip.appendChild(delBtn);
                savedContainer.appendChild(chip);
            });
        };
        renderSaved();

        const btnAdd = document.getElementById('btn-add-keep-label');
        const newBtnAdd = btnAdd.cloneNode(true);
        btnAdd.parentNode.replaceChild(newBtnAdd, btnAdd);
        newBtnAdd.addEventListener('click', () => {
            const val = input.value.trim();
            if (val) {
                if (!appSettings.keepLabels.includes(val)) {
                    appSettings.keepLabels.push(val);
                    saveData();
                    renderSaved();
                }
                input.focus();
            }
        });
        
        const suggestionContainer = document.getElementById('keep-tag-suggestions');
        if (suggestionContainer) {
            suggestionContainer.innerHTML = '';
            const space = getCurrentSpace();
            if (space && space.tags && space.tags.length > 0) {
                space.tags.forEach(tag => {
                    if (tag.toUpperCase() === 'AI') return;
                    const chip = document.createElement('button');
                    chip.innerText = tag;
                    chip.style.cssText = "padding:4px 10px; border:1px solid var(--border-color); border-radius:12px; background:var(--bg-body); cursor:pointer; font-size:12px; color:var(--text-main); transition:all 0.2s;";
                    chip.onclick = () => { input.value = tag; input.focus(); };
                    suggestionContainer.appendChild(chip);
                });
            } else {
                suggestionContainer.innerHTML = '<span style="font-size:12px; color:var(--text-muted); font-style:italic; padding:4px;">No Tags in this Space</span>';
            }
        }
        modal.style.display = 'flex';
        input.focus();
    }

    function getEffectiveKeepTag() {
        const globalTags = getFilterTags();
        return manualKeepTag || ((globalTags && globalTags.length > 0) ? globalTags[0] : null);
    }

        // Modal Event Listeners
        document.getElementById('btn-save-keep-tag').onclick = () => {
            const val = input.value.trim();
            manualKeepTag = val === "" ? null : val;
            updateTagButtonState();
            modal.style.display = 'none';
        };

        document.getElementById('btn-clear-keep-tag').onclick = () => {
            manualKeepTag = null;
            updateTagButtonState();
            modal.style.display = 'none';
        };

        document.getElementById('btn-cancel-keep-tag').onclick = () => {
            modal.style.display = 'none';
        };

        // Close on click outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
}

export function updateKeepTagButtonState() {
    const btns = [document.getElementById('btn-keep-tag'), document.getElementById('master-btn-keep-tag')];
    btns.forEach(btn => {
        if (!btn) return;
        if (manualKeepTag) {
            btn.classList.add('active');
            btn.title = `Keep Filter: #${manualKeepTag}`;
        } else {
            btn.classList.remove('active');
            btn.title = "Keep Filter Settings";
        }
    });
}

export function openKeepWithTag(tag, isSideView) {
    let targetUrl = 'https://keep.google.com/';
    
    if (tag) {
        // Filter by Label instead of search text using #label/
        // encodeURIComponent handles spaces and special characters correctly
        const encodedTag = encodeURIComponent(tag);
        targetUrl += `#label/${encodedTag}`;
    }

    if (isSideView && chrome.sidePanel) {
        chrome.sidePanel.setOptions({ path: targetUrl, enabled: true });
        chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    } else {
        openOrFocusTab(targetUrl);
    }
}
