import { getCurrentSpace, saveData } from './storage.js';

export function initDragAndDrop(callbacks) {
    const { onRender } = callbacks;

    function handleDrop(fromIndex, toIndex, type) {
        const space = getCurrentSpace();
        if (!space) return;

        const typeToArrayMap = {
            'tab': space.tabs,
            'resource': space.resources,
            'drive': space.driveFiles,
            'task': space.tasks
        };

        const arr = typeToArrayMap[type];
        if (arr) {
            const movedItem = arr.splice(fromIndex, 1)[0];
            arr.splice(toIndex, 0, movedItem);
            saveData();
            if (onRender) onRender();
        }
    }

    let dragSrcEl = null;
    let dragSrcType = null;

    document.addEventListener('dragstart', (e) => { 
        if (e.target.classList?.contains('draggable-item')) { 
            dragSrcEl = e.target; 
            dragSrcType = e.target.getAttribute('data-type'); 
            e.dataTransfer.effectAllowed = 'move'; 
            
            // 🧺 Task Basket Metadata: Ensure ID and Source Space are captured during drag
            const taskId = e.target.getAttribute('data-task-id');
            const spaceId = e.target.getAttribute('data-space-id');
            if (taskId) e.dataTransfer.setData('application/task-id', taskId);
            if (spaceId) e.dataTransfer.setData('application/source-space', spaceId);

            setTimeout(() => e.target.style.opacity = '0.4', 0); 
        } 
    });

    document.addEventListener('dragover', (e) => { 
        e.preventDefault(); 
        document.querySelectorAll('.draggable-item.drag-over').forEach(el => el.classList.remove('drag-over')); 
        const target = e.target.closest('.draggable-item'); 
        if (target && dragSrcEl && target !== dragSrcEl && target.getAttribute('data-type') === dragSrcType) { 
            target.classList.add('drag-over'); 
        }
    });

    document.addEventListener('drop', (e) => { 
        e.stopPropagation(); 
        const target = e.target.closest('.draggable-item'); 
        if (target && dragSrcEl && target !== dragSrcEl && target.getAttribute('data-type') === dragSrcType) { 
            const fromIndex = parseInt(dragSrcEl.getAttribute('data-index')); 
            const toIndex = parseInt(target.getAttribute('data-index')); 
            handleDrop(fromIndex, toIndex, dragSrcType); 
        }
    });

    document.addEventListener('dragend', () => { 
        if (dragSrcEl) { dragSrcEl.style.opacity = '1'; } 
        document.querySelectorAll('.draggable-item.drag-over').forEach(el => el.classList.remove('drag-over')); 
        dragSrcEl = null; 
        dragSrcType = null; 
    });
}
