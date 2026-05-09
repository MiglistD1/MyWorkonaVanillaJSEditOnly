/**
 * Floating picker: เลือกลิงก์จาก Resources ของ space (ใช้กับ @link บน to-do)
 */
import { getSpaces } from '../core/storage.js';
import { getFaviconUrl } from '../core/ui-helpers.js';

let _activeClose = null;

/**
 * @param {Object} options
 * @param {number} options.spaceId
 * @param {DOMRect|null} [options.anchorRect]
 * @param {function(Object): void} options.onSelect - (resource) => void
 * @param {function(): void} [options.onCancel]
 */
export function showResourceLinkPicker({ spaceId, anchorRect, onSelect, onCancel } = {}) {
    if (_activeClose) {
        _activeClose();
        _activeClose = null;
    }

    const space = getSpaces().find(s => s.id === spaceId);
    const items = (space?.resources || []).filter(
        r =>
            r &&
            !r.isDeleted &&
            !r.isArchived &&
            !r.isResourceBlockHeader &&
            r.url &&
            !String(r.url).startsWith('resblock://')
    );

    const wrap = document.createElement('div');
    wrap.id = 'resource-link-picker-overlay';
    wrap.style.cssText =
        'position:fixed;inset:0;z-index:10002;background:rgba(0,0,0,0.2);display:flex;align-items:flex-start;justify-content:center;padding:24px;box-sizing:border-box;';

    const box = document.createElement('div');
    box.style.cssText =
        'background:var(--bg-card,#fff);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);max-width:min(400px,100vw);width:100%;max-height:min(70vh,480px);display:flex;flex-direction:column;overflow:hidden;font-family:var(--app-font,-apple-system,sans-serif);';

    if (anchorRect) {
        const left = Math.min(
            Math.max(8, anchorRect.right - 400),
            window.innerWidth - 408
        );
        const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 200);
        box.style.marginTop = `${Math.max(8, top - 24)}px`;
        box.style.marginLeft = 'auto';
        box.style.marginRight = 'auto';
        wrap.style.alignItems = 'flex-start';
        wrap.style.paddingTop = '0';
    }

    const title = document.createElement('div');
    title.style.cssText =
        'padding:12px 14px;font-weight:800;font-size:13px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;gap:8px;';
    const titleLabel = document.createElement('span');
    titleLabel.textContent = '🔗 Link from Resources';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-icon';
    closeBtn.title = 'Close';
    closeBtn.style.padding = '4px';
    closeBtn.textContent = '✕';
    title.appendChild(titleLabel);
    title.appendChild(closeBtn);

    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Search…';
    search.setAttribute('aria-label', 'Search resources');
    search.style.cssText =
        'margin:10px 14px;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;font-size:13px;background:var(--bg-body);color:var(--text-main);outline:none;';

    const list = document.createElement('div');
    list.style.cssText = 'overflow-y:auto;flex:1;padding:4px 8px 12px;';

    function renderList(filterq) {
        list.innerHTML = '';
        const q = (filterq || '').trim().toLowerCase();
        const filtered = q
            ? items.filter(
                  r =>
                      String(r.title || '')
                          .toLowerCase()
                          .includes(q) || String(r.url || '').toLowerCase().includes(q)
              )
            : items;

        if (filtered.length === 0) {
            list.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">No links match.</div>`;
            return;
        }

        filtered.forEach(r => {
            const row = document.createElement('button');
            row.type = 'button';
            row.style.cssText =
                'display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 10px;border:none;background:transparent;border-radius:8px;cursor:pointer;color:var(--text-main);font-size:13px;';
            const img = document.createElement('img');
            img.src = getFaviconUrl(r.url, r.favIconUrl);
            img.alt = '';
            img.width = 18;
            img.height = 18;
            img.style.cssText = 'border-radius:3px;flex-shrink:0;';
            const span = document.createElement('span');
            span.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            span.textContent = r.title || r.url;
            row.appendChild(img);
            row.appendChild(span);
            row.addEventListener('mouseenter', () => {
                row.style.background = 'var(--hover-bg)';
            });
            row.addEventListener('mouseleave', () => {
                row.style.background = 'transparent';
            });
            row.addEventListener('click', () => {
                cleanup();
                if (onSelect) onSelect(r);
            });
            list.appendChild(row);
        });
    }

    function cleanup() {
        wrap.remove();
        document.removeEventListener('keydown', onKey, true);
        if (_activeClose === cleanup) _activeClose = null;
        document.body.style.overflow = '';
    }

    function onKey(ke) {
        if (ke.key === 'Escape') {
            ke.preventDefault();
            cleanup();
            if (onCancel) onCancel();
        }
    }

    search.addEventListener('input', () => renderList(search.value));

    wrap.addEventListener('click', ev => {
        if (ev.target === wrap) {
            cleanup();
            if (onCancel) onCancel();
        }
    });

    closeBtn.addEventListener('click', () => {
        cleanup();
        if (onCancel) onCancel();
    });

    box.appendChild(title);
    box.appendChild(search);
    box.appendChild(list);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey, true);
    _activeClose = cleanup;

    renderList('');
    setTimeout(() => search.focus(), 50);
}
