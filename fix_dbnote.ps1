$f = "d:\Code\MyWorkona - Test\features\dashboardQuickNote.js"
$l = Get-Content -LiteralPath $f -Encoding UTF8

# ---- New toolbar (replaces lines 76-101, 0-indexed 75-100) ----
$newToolbar = @'
                <div class="note-toolbar" style="padding: 6px 10px; border-bottom: 1px dashed var(--border-color); background: rgba(0,0,0,0.02);">
                    <button class="btn-icon" id="db-note-undo" title="Undo"><svg class="svg-icon-sm"><use href="#icon-undo"></use></svg></button>
                    <span class="note-toolbar-sep">|</span>
                    <button class="btn-icon" id="db-note-bold" title="Bold"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg></button>
                    <button class="btn-icon" id="db-note-italic" title="Italic"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg></button>
                    <button class="btn-icon" id="db-note-underline" title="Underline"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 6 6h0a6 6 0 0 0 6-6V4"></path><line x1="4" y1="20" x2="20" y2="20"></line></svg></button>
                    <span class="note-toolbar-sep">|</span>
                    <button class="btn-icon" id="db-note-bullet-list" title="Bulleted List (or type '* ')"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
                    <button class="btn-icon" id="db-note-checkbox" title="Insert Checkbox (or type '[] ')"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg></button>
                    <span class="note-toolbar-sep">|</span>
                    <div class="note-more-actions-wrapper">
                        <button class="btn-icon note-more-actions-btn" id="db-note-more-actions" title="More Formatting">&#xB7;&#xB7;&#xB7;</button>
                        <div class="note-more-popup" id="db-note-more-popup">
                            <div class="note-popup-row">
                                <button class="btn-icon" id="db-note-strikethrough" title="Strikethrough"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"></path><path d="M2 12h20"></path><path d="M6 14h12"></path></svg></button>
                                <button class="btn-icon" id="db-note-numbered-list" title="Numbered List"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1.1.9-2 2-2s2 .9 2 2c0 1.1-.9 2-2 2z"></path></svg></button>
                                <button class="btn-icon" id="db-note-hr" title="Horizontal Rule"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                                <button class="btn-icon" id="db-note-reset-format" title="Clear Format"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path><line x1="17" y1="12" x2="17" y2="18"></line><line x1="13" y1="12" x2="13" y2="18"></line><line x1="9" y1="12" x2="9" y2="18"></line><line x1="5" y1="12" x2="5" y2="18"></line></svg></button>
                            </div>
                            <div class="note-popup-sep"></div>
                            <div class="note-popup-row">
                                <select id="db-note-font-size" style="padding:2px;border-radius:4px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-main);font-size:11px;outline:none;cursor:pointer;flex:1;" data-cmd="fontSize">
                                    <option value="3">Normal</option>
                                    <option value="4">Large</option>
                                    <option value="5">Heading</option>
                                </select>
                            </div>
                            <div class="note-popup-row">
                                ${(settings.quickColors || ["#ff4d4f", "#4a86e8", "#52c41a"]).map((color, i) => `
                                    <input type="color" class="custom-color-slot db-note-color-slot" data-index="${i}" value="${color}" style="width:18px; height:18px;">
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
'@

# ---- New handlers (insert before closing } of renderDashboardQuickNote) ----
$newHandlers = @'

    const DB_CHECKBOX_HTML = '<label class="google-task-checkbox" contenteditable="false" style="display:inline-flex; align-items:center; margin-right:8px; vertical-align:middle;"><input type="checkbox"> <div class="checkmark-circle"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div></label>&nbsp;';

    const bindCmd = (id, cmd, val = null) => {
        const btn = el.querySelector('#' + id);
        if (btn) btn.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand(cmd, false, val); if (editor) { state.content = editor.innerHTML; saveData(); } });
    };
    bindCmd('db-note-bold', 'bold');
    bindCmd('db-note-italic', 'italic');
    bindCmd('db-note-underline', 'underline');
    bindCmd('db-note-strikethrough', 'strikeThrough');
    bindCmd('db-note-bullet-list', 'insertUnorderedList');
    bindCmd('db-note-numbered-list', 'insertOrderedList');
    bindCmd('db-note-hr', 'insertHorizontalRule');
    bindCmd('db-note-reset-format', 'removeFormat');

    const dbBtnCheckbox = el.querySelector('#db-note-checkbox');
    if (dbBtnCheckbox) {
        dbBtnCheckbox.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.execCommand('insertParagraph');
            document.execCommand('insertHTML', false, DB_CHECKBOX_HTML);
            if (editor) { state.content = editor.innerHTML; saveData(); }
        });
    }

    const dbBtnMore = el.querySelector('#db-note-more-actions');
    const dbMorePopup = el.querySelector('#db-note-more-popup');
    if (dbBtnMore && dbMorePopup) {
        dbBtnMore.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); dbMorePopup.classList.toggle('is-open'); });
        document.addEventListener('click', (e) => { if (!e.target.closest('.note-more-actions-wrapper')) dbMorePopup.classList.remove('is-open'); }, true);
    }

    if (editor) {
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
                state.content = editor.innerHTML; saveData();
            }
        });
        editor.addEventListener('input', () => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            if (node.nodeType !== 3) return;
            const text = node.textContent;
            const offset = range.startOffset;
            if (offset >= 2 && text.slice(0, 2) === '* ') {
                const del = document.createRange();
                del.setStart(node, 0); del.setEnd(node, 2);
                sel.removeAllRanges(); sel.addRange(del);
                document.execCommand('delete', false, null);
                document.execCommand('insertUnorderedList', false, null);
                state.content = editor.innerHTML; saveData(); return;
            }
            if (offset >= 3 && text.slice(0, 3) === '[] ') {
                const del = document.createRange();
                del.setStart(node, 0); del.setEnd(node, 3);
                sel.removeAllRanges(); sel.addRange(del);
                document.execCommand('delete', false, null);
                document.execCommand('insertHTML', false, DB_CHECKBOX_HTML);
                state.content = editor.innerHTML; saveData();
            }
        });
        editor.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox' && e.target.closest('.google-task-checkbox')) {
                if (e.target.checked) { e.target.setAttribute('checked', 'checked'); }
                else { e.target.removeAttribute('checked'); }
                state.content = editor.innerHTML; saveData();
            }
        });
    }
'@

$tLines = ($newToolbar -split "`r?`n")
$hLines = ($newHandlers -split "`r?`n")
if ($tLines[-1] -eq '') { $tLines = $tLines[0..($tLines.Length - 2)] }
if ($hLines[-1] -eq '') { $hLines = $hLines[0..($hLines.Length - 2)] }

# Step 1: replace toolbar lines 76-101 (0-indexed 75-100 = 26 lines)
$step1 = $l[0..74] + $tLines + $l[101..($l.Length - 1)]

# Step 2: find closing `}` of renderDashboardQuickNote
# Originally at line 217 (0-indexed 216). After step1: offset = 75 + tLines.Length + (216-101)
$closingIdx = 75 + $tLines.Length + 115
Write-Host "Closing brace at index $closingIdx`: '$($step1[$closingIdx])'"

$result = $step1[0..($closingIdx - 1)] + $hLines + $step1[$closingIdx..($step1.Length - 1)]
$result | Set-Content -LiteralPath $f -Encoding UTF8
Write-Host "Done. New line count: $($result.Length)"
