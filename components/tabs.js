// d:\Code\MyWorkona - Test\components\tabs.js

import { getSpaces, getCurrentSpaceId, saveData, getAppSettings } from '../core/storage.js';
import { openOrFocusTab, generateMiniTagsBtn, getFaviconUrl } from '../core/ui-helpers.js';

let isTabDeleteMode = false;

// Helpers & Icons
const svgEdit = `<svg class="svg-icon-sm"><use href="#icon-edit"></use></svg>`;

export function initTabs(callbacks) {
    const { onRender } = callbacks;

    // Delete Selected Tab Button
    // (ย้าย Logic การจัดการปุ่มลบมาไว้ที่นี่)
    const btnDeleteTab = document.getElementById('btn-delete-selected-tab'); 
    if (btnDeleteTab) {
        btnDeleteTab.addEventListener('click', () => {
            if (!isTabDeleteMode) { 
                isTabDeleteMode = true; 
                // ถ้าต้องการให้ UI เปลี่ยนแปลงเมื่อเข้าโหมดลบ (เช่น แสดง checkbox) ให้เรียก render
                onRender(); 
            } else {
                const space = getSpaces().find(s => s.id === getCurrentSpaceId());
                const checkedBoxes = document.querySelectorAll('.tab-checkbox:checked');
                if (checkedBoxes.length > 0) {
                    if (confirm("Delete selected tabs?")) {
                        // เรียงลำดับจากมากไปน้อยเพื่อไม่ให้ index เพี้ยนเวลาลบ
                        const indices = Array.from(checkedBoxes).map(cb => parseInt(cb.getAttribute("data-index"))).sort((a,b)=>b-a);
                        indices.forEach(idx => space.tabs.splice(idx, 1));
                        saveData();
                    }
                }
                isTabDeleteMode = false; 
                onRender();
            }
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
        document.querySelectorAll('.tab-checkbox').forEach(cb => cb.checked = e.target.checked); 
    });

    // Move to Resource
    document.getElementById('btn-move-to-resource').addEventListener('click', () => { 
        const checkedBoxes = document.querySelectorAll('.tab-checkbox:checked'); 
        if (checkedBoxes.length === 0) return; 
        const space = getSpaces().find(s => s.id === getCurrentSpaceId()); 
        const indicesToMove = Array.from(checkedBoxes).map(cb => parseInt(cb.getAttribute('data-index'))).sort((a,b) => b - a); 
        indicesToMove.forEach(index => { 
            const tab = space.tabs[index]; 
            
            // Create a new object to ensure tags are copied and independent
            const newResource = {
                ...tab,
                tags: tab.tags && Array.isArray(tab.tags) ? [...tab.tags] : []
            };

            if (tab.url.includes('drive.google.com')) space.driveFiles.push(newResource); 
            else space.resources.push(newResource); 
            space.tabs.splice(index, 1); 
        }); 
        saveData(); 
        onRender(); 
    });

    // Delegate Event for Editing Tab Title (ย้ายมาจาก document listener)
    const tabList = document.getElementById('tab-list');
    if (tabList) {
        tabList.addEventListener('click', (e) => {
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
  
  tabListUI.innerHTML = ''; 
  if(!space.tabs) space.tabs = [];

  space.tabs.forEach((tab, index) => { 
    if(searchQuery && !tab.title.toLowerCase().includes(searchQuery) && !tab.url.toLowerCase().includes(searchQuery)) return;
    
    // Tag Filter Logic
    if (filterTags.length > 0) {
        const itemTags = tab.tags || [];
        const itemTagsUpper = itemTags.map(t => t.toUpperCase());
        let match = false;
        
        // Helper to check individual tag match (handles UNTAGGED)
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
    
    // สร้าง href เพื่อให้คลิกเปิดลิงก์ได้จริง
    const anchor = `<a href="${tab.url}">${tab.title}</a>`;
    
    const li = document.createElement('li');
    li.setAttribute('data-index', index);
    li.setAttribute('data-type', 'tab'); 
    li.className = 'tab-item';

    li.innerHTML = `
        <div class="item-main-row">
            <label class="google-task-checkbox">
                <input type="checkbox" class="tab-checkbox" data-index="${index}">
                <div class="checkmark-circle">
                    <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
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
