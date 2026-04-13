// d:\Code\MyWorkona - Test\components\tabs.js

import { getSpaces, getCurrentSpaceId, saveData, getAppSettings } from '../core/storage.js';
import { openOrFocusTab, generateMiniTagsBtn, getFaviconUrl } from '../core/ui-helpers.js';

let isTabSelectionMode = false;
let selectedIndices = new Set(); // 🟢 เก็บรายการที่ติ๊กไว้ ป้องกันการหายเวลารีเฟรช UI
let lastSpaceIdForTabs = null;

// Helpers & Icons
const svgEdit = `<svg class="svg-icon-sm"><use href="#icon-edit"></use></svg>`;

export function initTabs(callbacks) {
    const { onRender } = callbacks;

    // Delete Selected Tab Button
    // (ย้าย Logic การจัดการปุ่มลบมาไว้ที่นี่)
    const btnDeleteTab = document.getElementById('btn-delete-selected-tab'); 
    if (btnDeleteTab) {
        btnDeleteTab.addEventListener('click', () => {
            const space = getSpaces().find(s => s.id === getCurrentSpaceId());
            if (!space || !space.tabs || space.tabs.length === 0) return;

            if (!isTabSelectionMode) {
                isTabSelectionMode = true;
                selectedIndices.clear();
                onRender();
            } else if (selectedIndices.size > 0) {
                if (confirm(`Delete ${selectedIndices.size} selected tabs?`)) {
                    const indices = Array.from(selectedIndices).sort((a, b) => b - a);
                    indices.forEach(idx => space.tabs.splice(idx, 1));
                    saveData();
                    isTabSelectionMode = false;
                    selectedIndices.clear();
                    onRender();
                }
            } else {
                    isTabSelectionMode = false;
                }
                onRender();
            });
    }

    // Clear Tabs
    document.getElementById('btn-clear-tabs').addEventListener('click', () => { 
        if (confirm("Clear all tabs?")) { 
            const space = getSpaces().find(s => s.id === getCurrentSpaceId());
            if(space) space.tabs = []; 
            saveData(); 
            onRender(); 
        } 
    });

    // Save Tabs (Chrome API interaction)
    document.getElementById('btn-save-tabs').addEventListener('click', () => { 
        const space = getSpaces().find(s => s.id === getCurrentSpaceId());
        if (!space) return;

        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
            // 🛠️ Extension Mode: ดึงข้อมูล Tab อัตโนมัติจาก Browser
            chrome.tabs.query({ currentWindow: true }, (tabs) => { 
                space.tabs = tabs.map(t => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl })); 
                saveData(); 
                onRender(); 
            }); 
        } else {
            // 🌐 Web Mode Fallback: ให้ผู้ใช้วางลิงก์ด้วยตนเอง (Manual Paste)
            const rawInput = prompt("💡 Web Version Workaround:\nเนื่องจาก Browser ไม่อนุญาตให้เว็บทั่วไปเข้าถึง Tab อื่นๆ ได้โดยตรงครับ\n\nโปรดวางรายชื่อ URL (ก๊อปปี้จากที่อื่นมาวาง) บรรทัดละ 1 ลิงก์เพื่อบันทึกลงใน Space นี้:");
            
            if (rawInput) {
                const lines = rawInput.split('\n').map(line => line.trim()).filter(line => line.startsWith('http'));
                const newTabs = lines.map(url => {
                    let displayTitle = url;
                    try { displayTitle = new URL(url).hostname; } catch(e) {}
                    return { title: displayTitle, url: url, favIconUrl: null };
                });

                if (newTabs.length > 0) {
                    const isOverwrite = confirm(`พบ ${newTabs.length} ลิงก์\n\nตกลง: เพื่อ 'เขียนทับ' (Overwrite) รายการเดิม\nยกเลิก: เพื่อ 'เพิ่มต่อท้าย' (Append)`);
                    space.tabs = isOverwrite ? newTabs : [...(space.tabs || []), ...newTabs];
                    saveData();
                    onRender();
                }
            }
        }
    });

    // Select All Checkbox
    document.getElementById('select-all-tabs').addEventListener('change', (e) => { 
        const space = getSpaces().find(s => s.id === getCurrentSpaceId());
        if (!space || !space.tabs) return;
        
        if (e.target.checked) {
            space.tabs.forEach((_, i) => selectedIndices.add(i));
        } else {
            selectedIndices.clear();
        }
        onRender();
    });

    // Move to Resource
    const btnMoveToRes = document.getElementById('btn-move-to-resource');
    if (btnMoveToRes) {
        btnMoveToRes.addEventListener('click', () => { 
            const space = getSpaces().find(s => s.id === getCurrentSpaceId());
            if (!space || !space.tabs || space.tabs.length === 0) return;

            if (!isTabSelectionMode) {
                isTabSelectionMode = true;
                selectedIndices.clear();
                onRender();
                return;
            }

            if (selectedIndices.size === 0) {
                isTabSelectionMode = false;
                onRender();
                return;
            }

            const indicesToMove = Array.from(selectedIndices).sort((a,b) => b - a); 
            indicesToMove.forEach(index => { 
                const tab = space.tabs[index]; 
                const newResource = {
                    ...tab,
                    tags: tab.tags && Array.isArray(tab.tags) ? [...tab.tags] : []
                };

                if (tab.url.includes('drive.google.com')) space.driveFiles.push(newResource); 
                else space.resources.push(newResource); 
                space.tabs.splice(index, 1); 
            }); 
            saveData(); 
            isTabSelectionMode = false; 
            selectedIndices.clear();
            onRender(); 
        });
    }

    // Delegate Event for Editing Tab Title (ย้ายมาจาก document listener)
    const tabList = document.getElementById('tab-list');
    if (tabList) {
        // 🟢 เพิ่ม Change Listener เพื่อดักจับการติ๊กและแสดง Animation ทันที
        tabList.addEventListener('change', (e) => {
            if (e.target.classList.contains('tab-checkbox')) {
                const cb = e.target;
                const idx = parseInt(cb.getAttribute('data-index'));
                const isChecked = cb.checked;
                const tabItem = cb.closest('.tab-item');

                if (isChecked) selectedIndices.add(idx);
                else selectedIndices.delete(idx);

                // 🟢 เพิ่ม Class เพื่อให้ Checkmark ของ Google Task Checkbox เล่น Animation
                if (tabItem) {
                    tabItem.classList.toggle('completed-hold', isChecked);
                }

                // อัปเดตสถานะปุ่มหลัก (Delete/Move) ให้แสดงตัวเลขล่าสุด
                renderTabsButtons();
            }
        });

        tabList.addEventListener('click', (e) => {
            if (e.target.closest('.google-task-checkbox')) return;

            if (e.target.closest('.edit-tab-btn')) {
                const btn = e.target.closest('.edit-tab-btn');
                const idx = parseInt(btn.getAttribute('data-index'));
                const space = getSpaces().find(s => s.id === getCurrentSpaceId());
                const newTitle = prompt("Rename Tab:", space.tabs[idx].title);
                if(newTitle) { 
                    space.tabs[idx].title = newTitle; 
                    saveData(); 
                    onRender(); 
                }
            }

            // Handle smart tab opening
            if (e.target.tagName === 'A' && e.target.href) {
                e.preventDefault();
                openOrFocusTab(e.target.href);
            }
        });
    }
}

export function renderTabs(space, searchQuery, filterTags = [], filterMode = 'OR') {
  const tabListUI = document.getElementById('tab-list');
  if(!tabListUI) return;

  // รีเซ็ตสถานะเมื่อสลับ Space
  const currentSid = getCurrentSpaceId();
  if (lastSpaceIdForTabs !== currentSid) {
      isTabSelectionMode = false;
      selectedIndices.clear();
      lastSpaceIdForTabs = currentSid;
  }
  
  renderTabsButtons();

  tabListUI.innerHTML = ''; 
  if(!space.tabs) space.tabs = [];

  space.tabs.forEach((tab, index) => { 
    if(searchQuery && !tab.title.toLowerCase().includes(searchQuery) && !tab.url.toLowerCase().includes(searchQuery)) return;
    
    // Tag Filter Logic
    if (filterTags.length > 0) {
        const itemTags = tab.tags || [];
        const itemTagsUpper = itemTags.map(t => t.toUpperCase());
        let match = false;
        
        const checkTag = (tag) => {
            if (tag === 'UNTAGGED') return itemTags.length === 0;
            return itemTagsUpper.includes(tag);
        };

        if (filterMode === 'AND') {
            match = filterTags.every(checkTag);
        } else {
            match = filterTags.some(checkTag);
        }
        if (!match) return;
    }
    
    const isSelected = selectedIndices.has(index);
    const anchor = `<a href="${tab.url}">${tab.title}</a>`;
    
    const li = document.createElement('li');
    li.setAttribute('data-index', index);
    li.setAttribute('data-type', 'tab'); 
    // 🟢 เพิ่ม task-item class เพื่อให้ checkbox แสดงผลสีและ animation ถูกต้องตาม CSS หลัก
    li.className = `tab-item task-item ${isSelected ? 'completed-hold' : ''}`;

    li.innerHTML = `
        <div class="item-main-row">
            <label class="google-task-checkbox" style="margin-right: 8px; display: ${isTabSelectionMode ? 'inline-flex' : 'none'};">
                <input type="checkbox" class="tab-checkbox" data-index="${index}" ${isSelected ? 'checked' : ''}>
                <div class="checkmark-circle">
                    <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                </div>
            </label>
            <div class="text-truncate" title="${tab.url}">
                <img src="${getFaviconUrl(tab.url, tab.favIconUrl)}" class="favicon-img">
                ${anchor}
            </div>
            <div class="item-action-group">
                ${generateMiniTagsBtn(tab.tags, 'tab', index)}
                <button class="btn-icon edit-tab-btn" data-index="${index}">${svgEdit}</button>
            </div>
        </div>
    `;
    tabListUI.appendChild(li);
  });
}

// 🟢 แยกฟังก์ชันอัปเดตปุ่มออกมาเพื่อให้เรียกใช้ได้เฉพาะจุด
function renderTabsButtons() {
  const btnDeleteTab = document.getElementById('btn-delete-selected-tab');
  const btnMoveToRes = document.getElementById('btn-move-to-resource');
  const selectAllTabs = document.getElementById('select-all-tabs');
  const space = getSpaces().find(s => s.id === getCurrentSpaceId());

  // 🟢 ปรับเปลี่ยนข้อความปุ่มให้เข้าใจง่ายขึ้น
  if (btnDeleteTab) {
      btnDeleteTab.style.display = 'inline-flex'; // เลิกซ่อน
      btnDeleteTab.innerHTML = isTabSelectionMode && selectedIndices.size > 0
          ? `<svg class="svg-icon-sm" style="margin-right:4px;"><use href="#icon-trash"></use></svg><span>Delete (${selectedIndices.size})</span>`
          : `<svg class="svg-icon-sm" style="margin-right:4px;"><use href="#icon-check-square"></use></svg><span>Select to Delete</span>`;
      btnDeleteTab.classList.toggle('active-red', isTabSelectionMode && selectedIndices.size > 0);
  }

  // ปุ่ม Move to Resource: แสดงตลอดเวลา แต่เปลี่ยนสถานะตามโหมด
  if (btnMoveToRes) {
      btnMoveToRes.style.display = 'inline-flex'; // เลิกซ่อน
      btnMoveToRes.innerHTML = isTabSelectionMode && selectedIndices.size > 0
          ? `<svg class="svg-icon-sm" style="margin-right:4px;"><use href="#icon-layers"></use></svg><span>Move (${selectedIndices.size})</span>`
          : `<svg class="svg-icon-sm" style="margin-right:4px;"><use href="#icon-check-square"></use></svg><span>Select to Move</span>`;
      btnMoveToRes.classList.toggle('active', isTabSelectionMode && selectedIndices.size > 0);
  }

  if (selectAllTabs) {
      const container = selectAllTabs.closest('.google-task-checkbox') || selectAllTabs.parentElement;
      if (container) container.style.display = isTabSelectionMode ? 'inline-flex' : 'none';
      if (space && space.tabs) {
          selectAllTabs.checked = space.tabs.length > 0 && selectedIndices.size === space.tabs.length;
      }
  }
}
