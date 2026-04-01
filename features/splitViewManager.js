// features/splitViewManager.js

window.splitViewManager = {
    isActive: false,
    currentUrl: '',
    currentSourceId: 'default', // ไว้จำว่าเปิดมาจากปุ่มไหน จะได้เซฟถูกที่
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

            /* 📱 ระบบ Responsive เมื่อ Split View ทำงาน หรือ Browser ถูกย่อ */
            /* 1. ซ่อน Sidebar เมื่อพื้นที่ฝั่งซ้ายแคบลง */
            html body.sf-compact-sidebar #sidebar-wrapper,
            html body.sf-compact-sidebar #spacebar {
                display: none !important;
            }

            /* 2. ดัน Topbar และ Workspace ให้ชิดซ้ายสุด (เนื่องจาก Sidebar หายไป) */
            html body.sf-compact-sidebar .topbar,
            html body.sf-compact-sidebar .workspace,
            html body.sf-compact-sidebar #schedule-mode-bar,
            html body.sf-compact-sidebar #focus-mode-bar {
                left: 0 !important;
                width: 100% !important;
                margin-left: 0 !important;
            }

            /* 3. ปรับโครงสร้างหลัก (Tabs, Resources, Tasks) ให้ซ้อนกันเป็นแนวตั้ง */
            html body.sf-stack-vertical #main-grid {
                display: flex !important;
                flex-direction: column !important;
                /* grid-template-columns: none !important; -- ไม่จำเป็นเมื่อใช้ display: flex */
                gap: 20px !important;
                height: auto !important;
                overflow-y: visible !important;
            }

            /* 4. ปรับขนาด Card ให้เต็มความกว้างในโหมดแนวตั้ง */
            html body.sf-stack-vertical .card {
                width: 100% !important;
                min-width: 0 !important;
            }

            /* ปรับแต่งส่วนประกอบย่อยให้เล็กลง */
            html body.sf-compact-sidebar .launcher-group-label { display: none !important; } /* ซ่อนชื่อกลุ่ม Launcher */
            html body.sf-compact-sidebar .topbar { padding: 0 10px !important; }

            /* 5. Ensure launchers-bar wraps correctly in compact mode */
            html body.sf-compact-sidebar .launchers-bar {
                flex-wrap: wrap !important;
                justify-content: flex-start !important;
                gap: 8px !important;
                padding: 8px 10px !important;
            }
            html body.sf-compact-sidebar .launcher-group {
                margin-right: 0 !important;
            }
            html body.sf-compact-sidebar .launcher-separator {
                display: none !important;
            }
            html body.sf-compact-sidebar .launcher-add-btn {
                margin-top: 0 !important;
            }

            /* แถบปรับขนาด (Resizer) เลียนแบบ Chrome */
            #panel-resizer {
                position: absolute;
                top: 0;
                left: -4px;
                width: 8px;
                height: 100%;
                cursor: ew-resize;
                background: transparent;
                z-index: 10000;
            }
            #panel-resizer:hover {
                background: rgba(26, 115, 232, 0.5); /* สีฟ้าๆ เวลานำเมาส์ไปวาง */
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
            .panel-btn:hover { background: #f1f3f4; }
            .btn-close { border: none; font-weight: bold; font-size: 16px; padding: 4px 8px;}
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

        // สร้างโครงสร้าง HTML
        const panelHTML = `
            <div id="custom-split-panel">
                <div id="panel-resizer"></div>
                
                <div id="panel-toolbar">
                    <div class="toolbar-group">
                        <button id="btn-save-panel" class="panel-btn">💾 บันทึก (Save)</button>
                        <button id="btn-refresh-50" class="panel-btn">🔄 คืนค่า 50%</button>
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
        document.getElementById('btn-save-panel').addEventListener('click', () => this.saveState());

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
        const savedWidth = localStorage.getItem('splitview_width_vw');
        
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
        document.body.style.transition = 'padding-right 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
        panel.classList.add('open');
        
        // ขยับเนื้อหาเว็บหลักให้หลบ Side Panel (เลียนแบบ Chrome)
        document.body.style.paddingRight = `${this.panelWidth}vw`;

        this.updateResponsiveLayout();

        // Dispatch resize event after transition finishes
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 300);
    },

    // 3. ฟังก์ชันปิดหน้าต่าง
    close: function() {
        if (!this.isActive) return;
        this.isActive = false;

        const panel = document.getElementById('custom-split-panel');
        const iframe = document.getElementById('panel-iframe');

        // สไลด์เก็บหน้าต่าง
        panel.classList.remove('open');
        
        // คืนพื้นที่ให้เว็บหลัก
        document.body.style.paddingRight = '0';

        // เคลียร์ iframe เพื่อคืนหน่วยความจำ (หน่วงเวลาให้ Animation สไลด์ปิดเสร็จก่อน)
        setTimeout(() => { iframe.src = ''; }, 300);

        this.updateResponsiveLayout();
        window.dispatchEvent(new Event('resize'));
    },

    // 🟢 ระบบคำนวณ Responsive Layout อัตโนมัติ
    updateResponsiveLayout: function() {
        if (!this.isActive) {
            document.body.classList.remove('sf-compact-sidebar', 'sf-stack-vertical');
            // 🔥 หลอกว่ามีการย่อหน้าต่างเพื่อให้ระบบอื่นๆ (เช่น Sortable) คำนวณขนาดใหม่
            window.dispatchEvent(new Event('resize'));
            return;
        }

        // คำนวณพื้นที่ Pixel ที่เหลือสำหรับใช้งาน App ส่วนหลัก
        const panelWidthPx = (this.panelWidth * window.innerWidth) / 100;
        const availWidthPx = window.innerWidth - panelWidthPx;

        document.body.classList.toggle('sf-compact-sidebar', availWidthPx < 950);
        document.body.classList.toggle('sf-stack-vertical', availWidthPx < 750);
        
        // 🔥 ไม้ตาย: สั่ง Dispatch Resize Event
        // วิธีนี้จะทำให้โค้ด JavaScript ของคุณที่ใช้ window.addEventListener('resize', ...) ทำงานทันที
        // แม้ว่าขนาด Browser จริงๆ จะไม่ได้เปลี่ยนก็ตาม
        window.dispatchEvent(new Event('resize'));
    },

    // 4. ฟังก์ชันรีเซ็ต 50%
    resetRatio: function() {
        this.panelWidth = 50;
        const panel = document.getElementById('custom-split-panel');
        panel.style.width = '50vw';
        
        if (this.isActive) {
            document.body.style.paddingRight = '50vw';
        }
        
        // เซฟค่าใหม่ลง LocalStorage
        localStorage.setItem('splitview_width_vw', 50);
        this.updateResponsiveLayout();
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
            isResizing = true;
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
            document.body.style.paddingRight = `${newWidthVw}vw`;
            this.updateResponsiveLayout();
            window.dispatchEvent(new Event('resize'));
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
                document.getElementById('panel-iframe').style.pointerEvents = 'auto';
                // เซฟขนาดอัตโนมัติเมื่อปล่อยเมาส์
                localStorage.setItem('splitview_width_vw', this.panelWidth);
                this.updateResponsiveLayout();
                window.dispatchEvent(new Event('resize'));
            }
        });
    }
};