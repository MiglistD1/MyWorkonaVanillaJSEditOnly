// features/splitViewManager.js

window.splitViewManager = {
    isActive: localStorage.getItem('splitViewActive') === 'true',
    ratio: parseFloat(localStorage.getItem('splitViewRatio')) || 0.5,

    init() {
        if (document.getElementById('custom-split-view-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'custom-split-view-overlay';
        overlay.style.display = 'none';

        overlay.innerHTML = `
            <div id="pane-left"></div>
            <div id="pane-resizer"></div>
            <div id="pane-right">
                <iframe id="split-view-iframe" frameborder="0"></iframe>
            </div>
        `;

        document.body.appendChild(overlay);
        this.setupResizer();
        this.applyRatio();

        // ถ้าสถานะเดิมเปิดอยู่ ให้แสดงผลทันที
        if (this.isActive) {
            this.applyCurrentState();
        }
    },

    setupResizer() {
        const resizer = document.getElementById('pane-resizer');
        const overlay = document.getElementById('custom-split-view-overlay');
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            overlay.classList.add('is-resizing');
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newRatio = e.clientX / window.innerWidth;
            if (newRatio > 0.15 && newRatio < 0.85) {
                this.ratio = newRatio;
                this.applyRatio();
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                overlay.classList.remove('is-resizing');
                document.body.style.cursor = '';
                localStorage.setItem('splitViewRatio', this.ratio);
            }
        });
    },

    applyRatio() {
        const left = document.getElementById('pane-left');
        const right = document.getElementById('pane-right');
        if (!left || !right) return;
        left.style.width = `${this.ratio * 100}%`;
        right.style.width = `${(1 - this.ratio) * 100}%`;
    },

    loadIntoRightPane(url) {
        const iframe = document.getElementById('split-view-iframe');
        if (iframe) iframe.src = url;
    }
};

window.splitViewManager.applyCurrentState = function() {
    const manager = window.splitViewManager;
    let overlay = document.getElementById('custom-split-view-overlay');
    // หาก overlay ยังไม่ถูกสร้าง ให้สร้างทันที
    if (!overlay) { manager.init(); overlay = document.getElementById('custom-split-view-overlay'); }
    
    const leftPane = document.getElementById('pane-left');
    const spacebar = document.getElementById('spacebar');
    const workspace = document.querySelector('.workspace');
    const iframe = document.getElementById('split-view-iframe');

    if (manager.isActive) {
        overlay.style.display = 'flex';
        if (spacebar) leftPane.appendChild(spacebar);
        if (workspace) leftPane.appendChild(workspace);
    } else {
        overlay.style.display = 'none';
        if (iframe) iframe.src = 'about:blank';
        if (spacebar) document.body.insertBefore(spacebar, overlay);
        if (workspace) document.body.insertBefore(workspace, overlay);
    }

    document.querySelectorAll('.btn-split-toggle').forEach(btn => {
        btn.classList.toggle('active', manager.isActive);
        const span = btn.querySelector('span');
        if (span) span.innerText = manager.isActive ? 'ON' : 'OFF';
    });
};

window.toggleSplitViewMode = function() {
    const manager = window.splitViewManager;
    if (!document.getElementById('custom-split-view-overlay')) manager.init();

    manager.isActive = !manager.isActive;
    localStorage.setItem('splitViewActive', manager.isActive);

    manager.applyCurrentState();
};