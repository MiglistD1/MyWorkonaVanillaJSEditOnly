// features/splitViewManager.js

window.splitViewManager = {
    isActive: false,
    currentUrl: '',
    currentSourceId: 'default', // ไว้จำว่าเปิดมาจากปุ่มไหน จะได้เซฟถูกที่
    lockState: 'none', // 'none', 'soft', 'hard'
    panelWidth: 50, // เริ่มต้นที่ 50% (50vw)

    // 1. ฟังก์ชันเริ่มต้น (สร้าง DOM อัตโนมัติเมื่อเรียกใช้ครั้งแรก)
    init: function() {
        if (document.getElementById('custom-split-panel')) return; // ถ้ามีแล้วไม่ต้องสร้างใหม่

        // สร้างสไตล์ CSS แบบฝังใน JS เพื่อให้พร้อมใช้ทันที
        const style = document.createElement('style');
        style.innerHTML = `
            /* โครงสร้างหลักของ Split Panel */
            #custom-split-panel {
                position: fixed;
                top: 0;
                right: 0;
                height: 100vh;
                width: 50vw; /* ค่าเริ่มต้น 50% */
                background: #f8f9fa;
                box-shadow: -4px 0 15px rgba(0,0,0,0.1);
                display: flex;
                flex-direction: column;
                z-index: 9999;
                transform: translateX(100%); /* ซ่อนไว้ทางขวาก่อน */
                transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            }
            #custom-split-panel.open {
                transform: translateX(0); /* เลื่อนโชว์ออกมา */
            }

            /* แถบปรับขนาด (Resizer) เลียนแบบ Chrome */
            #panel-resizer {
                position: absolute;
                top: 0;
                left: -1px;
                width: 2px;
                height: 100%;
                cursor: ew-resize;
                background: var(--border-color);
                z-index: 10000;
                transition: all 0.2s ease;
            }
            #panel-resizer:hover, #panel-resizer:active {
                width: 6px;
                left: -3px;
                background: var(--primary-color);
                box-shadow: 0 0 8px rgba(47, 128, 237, 0.4);
            }

            /* แถบ Popup / Toolbar ด้านบนสุด */
            #panel-toolbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 16px;
                background: #ffffff;
                border-bottom: 1px solid #dadce0;
                min-height: 40px;
            }
            .toolbar-group { display: flex; gap: 8px; }
            .panel-btn {
                padding: 6px 12px;
                border: 1px solid #dadce0;
                background: white;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                color: #3c4043;
                transition: all 0.2s;
            }
            .panel-btn:hover { background: var(--hover-bg); }
            .panel-btn svg { width: 14px; height: 14px; display: block; }
            
            /* Lock States Styles */
            #btn-lock-panel.lock-soft { 
                color: #10b981; 
                border-color: #10b981; 
                background: rgba(16, 185, 129, 0.05); 
            }
            #btn-lock-panel.lock-hard { 
                color: #ef4444; 
                border-color: #ef4444; 
                background: rgba(239, 68, 68, 0.05); 
            }
            
            .btn-close { border: none; font-size: 16px; padding: 4px 8px;}
            .btn-close:hover { background: #fce8e6; color: #d93025; }

            /* พื้นที่แสดงเว็บ */
            #panel-iframe {
                flex-grow: 1;
                width: 100%;
                border: none;
                background: white;
            }
        `;
        document.head.appendChild(style);

        // Minimal Icons
        const iconLock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
        const iconUnlock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
        const iconRefresh = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`;

        // สร้างโครงสร้าง HTML
        const panelHTML = `
            <div id="custom-split-panel">
                <div id="panel-resizer"></div>
                
                <div id="panel-toolbar">
                    <div class="toolbar-group">
                        <button id="btn-lock-panel" class="panel-btn" title="Toggle Lock Mode">${iconUnlock}</button>
                        <button id="btn-refresh-50" class="panel-btn" title="Reset to 50%">${iconRefresh}</button>
                    </div>
                    <button id="btn-close-panel" class="panel-btn btn-close">✕</button>
                </div>

                <iframe id="panel-iframe"></iframe>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', panelHTML);

        // ผูกเหตุการณ์ (Event Listeners) ให้ปุ่มต่างๆ
        document.getElementById('btn-close-panel').addEventListener('click', () => this.close());
        document.getElementById('btn-refresh-50').addEventListener('click', () => this.resetRatio());
        document.getElementById('btn-lock-panel').addEventListener('click', () => this.toggleLock());

        this.setupResizer();
    },

    // 2. ฟังก์ชันเปิดหน้าต่าง (รับ URL และ ID ของปุ่มเพื่อไว้ใช้ตอนเซฟ)
    open: function(url, sourceId = 'default') {
        this.init(); // ตรวจสอบและสร้าง DOM ก่อนเสมอ
        
        this.currentUrl = url;
        this.currentSourceId = sourceId;
        this.isActive = true;

        const panel = document.getElementById('custom-split-panel');
        const iframe = document.getElementById('panel-iframe');

        // ตรวจสอบว่ามีข้อมูลที่เซฟไว้ไหม
        const savedUrl = localStorage.getItem(`splitview_saved_${sourceId}`);
        
        // โหลดสถานะ Lock และขนาดเฉพาะ (ถ้ามี Hard Lock)
        const savedLock = localStorage.getItem(`splitview_lock_${sourceId}`);
        const specificWidth = localStorage.getItem(`splitview_width_${sourceId}`);
        const globalWidth = localStorage.getItem('splitview_width_vw');

        this.lockState = savedLock || 'none';
        this.updateLockButtonUI();

        const savedWidth = (this.lockState === 'hard' && specificWidth) ? specificWidth : globalWidth;

        // ถ้าเซฟความกว้างไว้ ให้ดึงมาใช้ ถ้าไม่มีให้ใช้ 50%
        if (savedWidth) {
            this.panelWidth = parseFloat(savedWidth);
            panel.style.width = `${this.panelWidth}vw`;
        } else {
            this.resetRatio(); 
        }

        // โหลด URL (ใช้ที่เซฟไว้ ถ้ามี, ถ้าไม่มีใช้ url ที่ส่งมา)
        iframe.src = savedUrl ? savedUrl : url;

        // สไลด์เปิดหน้าต่าง (และ Popup ก็จะติดมาด้วยทันที)
        panel.classList.add('open');
        
        // เพิ่ม class และตั้งค่า CSS Variable เพื่อให้ CSS จัดการ Responsive
        document.body.classList.add('custom-split-active');
        document.body.style.setProperty('--split-panel-width', this.panelWidth + 'vw');

        // 🟢 1. สั่งหด Sidebar อัตโนมัติ (ใช้คลาสมาตรฐานเพื่อให้ปุ่ม Toggle ยังทำงานได้)
        const spacebar = document.getElementById('spacebar');
        if (spacebar) spacebar.classList.add('collapsed');

        // 🟢 2. คำนวณความแคบของพื้นที่ฝั่งซ้ายทันที
        this.updateTightLayout();
    },

    // 3. ฟังก์ชันปิดหน้าต่าง
    close: function() {
        if (!this.isActive) return;
        this.isActive = false;

        const panel = document.getElementById('custom-split-panel');
        const iframe = document.getElementById('panel-iframe');

        // สไลด์เก็บหน้าต่าง
        panel.classList.remove('open');
        
        // ลบ class และ CSS Variable
        document.body.classList.remove('custom-split-active', 'split-view-tight');
        document.body.style.removeProperty('--split-panel-width');

        // 🟢 คืนค่า Sidebar (ถ้าต้องการให้กลับมาเด้งเหมือนเดิมเมื่อปิด Side View)
        const spacebar = document.getElementById('spacebar');
        if (spacebar) spacebar.classList.remove('collapsed');

        // เคลียร์ iframe เพื่อคืนหน่วยความจำ (หน่วงเวลาให้ Animation สไลด์ปิดเสร็จก่อน)
        setTimeout(() => { iframe.src = ''; }, 300);
    },

    // 4. ฟังก์ชันรีเซ็ต 50%
    resetRatio: function() {
        this.panelWidth = 50;
        const panel = document.getElementById('custom-split-panel');
        panel.style.width = '50vw';
        
        // ตั้งค่า CSS Variable
        document.body.style.setProperty('--split-panel-width', '50vw');
        
        // เซฟค่าใหม่ลง LocalStorage
        localStorage.setItem('splitview_width_vw', 50);
        this.updateTightLayout();
    },

    // 🟢 ระบบคำนวณพื้นที่ฝั่งซ้ายอัตโนมัติ
    updateTightLayout: function() {
        const panelWidthPx = (this.panelWidth * window.innerWidth) / 100;
        const leftWidthPx = window.innerWidth - panelWidthPx;
        const spacebar = document.getElementById('spacebar');
        
        // 🟢 บังคับหด Sidebar ถ้าพื้นที่เหลือน้อยกว่า 900px แม้ผู้ใช้จะเคยกางไว้
        if (leftWidthPx < 900 && spacebar && !spacebar.classList.contains('collapsed')) {
            spacebar.classList.add('collapsed');
        }

        if (leftWidthPx < 1100) {
            document.body.classList.add('split-view-tight');
        } else {
            document.body.classList.remove('split-view-tight');
        }
    },

    // 4. ฟังก์ชันสลับสถานะ Lock
    toggleLock: function() {
        if (this.lockState === 'none') {
            this.lockState = 'soft';
        } else if (this.lockState === 'soft') {
            this.lockState = 'hard';
            // เซฟค่าขนาดและสถานะลง Storage ถาวรสำหรับ ID นี้
            localStorage.setItem(`splitview_lock_${this.currentSourceId}`, 'hard');
            localStorage.setItem(`splitview_width_${this.currentSourceId}`, this.panelWidth);
        } else {
            this.lockState = 'none';
            localStorage.removeItem(`splitview_lock_${this.currentSourceId}`);
            localStorage.removeItem(`splitview_width_${this.currentSourceId}`);
        }
        this.updateLockButtonUI();
    },

    updateLockButtonUI: function() {
        const btn = document.getElementById('btn-lock-panel');
        if (!btn) return;

        const iconLock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
        const iconUnlock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;

        btn.classList.remove('lock-soft', 'lock-hard');
        
        if (this.lockState === 'soft') {
            btn.classList.add('lock-soft');
            btn.innerHTML = iconLock;
            btn.title = "Soft Lock (Green): Local resize active";
        } else if (this.lockState === 'hard') {
            btn.classList.add('lock-hard');
            btn.innerHTML = iconLock;
            btn.title = "Hard Lock (Red): Resize disabled & Saved";
        } else {
            btn.innerHTML = iconUnlock;
            btn.title = "Unlocked: Global resize active";
        }
    },

    // 5. ฟังก์ชันเซฟสถานะ
    saveState: function() {
        // เซฟ URL ปัจจุบันผูกกับปุ่มนั้นๆ
        localStorage.setItem(`splitview_saved_${this.currentSourceId}`, this.currentUrl);
        // เซฟขนาดความกว้างปัจจุบัน
        localStorage.setItem('splitview_width_vw', this.panelWidth);
        
        // เด้งแจ้งเตือนเล็กๆ
        const btn = document.getElementById('btn-save-panel');
        btn.innerText = "✅ บันทึกแล้ว!";
        setTimeout(() => { btn.innerText = "💾 บันทึก (Save)"; }, 2000);
    },

    // 6. ระบบคำนวณการลากปรับขนาดหน้าจอ (Drag to Resize)
    setupResizer: function() {
        const resizer = document.getElementById('panel-resizer');
        const panel = document.getElementById('custom-split-panel');
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            if (this.lockState === 'hard') {
                // ถ้า Hard Lock ให้สั่นปุ่ม Lock เพื่อบอกว่าปรับไม่ได้
                const lockBtn = document.getElementById('btn-lock-panel');
                lockBtn.animate([{ transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }], { duration: 100, iterations: 3 });
                return;
            }

            e.preventDefault(); // 🟢 ป้องกันการคลุมดำเวลาลาก
            isResizing = true;
            document.body.style.userSelect = 'none'; // 🟢 ปิดการเลือกข้อความชั่วคราว
            document.body.style.cursor = 'ew-resize';
            // ป้องกัน iframe ขโมยเหตุการณ์ลากเมาส์
            document.getElementById('panel-iframe').style.pointerEvents = 'none'; 
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            // คำนวณความกว้างจากตำแหน่งเมาส์ (ห่างจากขอบขวาเท่าไหร่)
            const newWidthPx = window.innerWidth - e.clientX;
            // แปลงเป็น vw (Viewport Width)
            let newWidthVw = (newWidthPx / window.innerWidth) * 100;
            
            // จำกัดขนาด (ไม่ให้เล็กกว่า 20vw และไม่เกิน 80vw เลียนแบบข้อจำกัด Chrome)
            if (newWidthVw < 20) newWidthVw = 20;
            if (newWidthVw > 80) newWidthVw = 80;

            this.panelWidth = newWidthVw;
            panel.style.width = `${newWidthVw}vw`;
            document.body.style.setProperty('--split-panel-width', newWidthVw + 'vw');

            // 🟢 อัปเดต Layout แบบ Real-time ขณะลาก
            this.updateTightLayout();
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = ''; // 🟢 คืนค่าการเลือกข้อความ
                document.body.style.cursor = 'default';
                document.getElementById('panel-iframe').style.pointerEvents = 'auto';
                // เซฟขนาดอัตโนมัติเมื่อปล่อยเมาส์
                if (this.lockState === 'none') {
                    localStorage.setItem('splitview_width_vw', this.panelWidth);
                } else {
                    // ถ้าเป็น Soft หรือ Hard Lock ให้เซฟแยก ID
                    localStorage.setItem(`splitview_width_${this.currentSourceId}`, this.panelWidth);
                }
                
                this.updateTightLayout();
            }
        });
    }
};