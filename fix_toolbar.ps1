$newToolbar = @'
            <div class="note-toolbar">
              <button type="button" class="btn-icon" id="btn-undo-note" title="Undo"><svg class="svg-icon-sm"><use href="#icon-undo"></use></svg></button>
              <span class="note-toolbar-sep">|</span>
              <button class="btn-icon" id="btn-note-bold" title="Bold"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg></button>
              <button class="btn-icon" id="btn-note-italic" title="Italic"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"></line><line x1="14" y1="20" x2="5" y2="20"></line><line x1="15" y1="4" x2="9" y2="20"></line></svg></button>
              <button class="btn-icon" id="btn-note-underline" title="Underline"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 6 6h0a6 6 0 0 0 6-6V4"></path><line x1="4" y1="20" x2="20" y2="20"></line></svg></button>
              <span class="note-toolbar-sep">|</span>
              <button class="btn-icon" id="btn-note-bullet-list" title="Bulleted List (or type '* ')"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button>
              <button class="btn-icon" id="btn-note-checkbox" title="Insert Checkbox (or type '[] ')"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg></button>
              <span class="note-toolbar-sep">|</span>
              <div class="note-more-actions-wrapper">
                <button class="btn-icon note-more-actions-btn" id="btn-note-more-actions" title="More Formatting">&#xB7;&#xB7;&#xB7;</button>
                <div class="note-more-popup" id="note-more-popup">
                  <div class="note-popup-row">
                    <button class="btn-icon" id="btn-note-strikethrough" title="Strikethrough"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"></path><path d="M2 12h20"></path><path d="M6 14h12"></path></svg></button>
                    <button class="btn-icon" id="btn-note-numbered-list" title="Numbered List"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1.1.9-2 2-2s2 .9 2 2c0 1.1-.9 2-2 2z"></path></svg></button>
                    <button class="btn-icon" id="btn-note-hr" title="Horizontal Rule"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                    <button class="btn-icon" id="btn-note-reset-format" title="Clear Format"><svg class="svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path><line x1="17" y1="12" x2="17" y2="18"></line><line x1="13" y1="12" x2="13" y2="18"></line><line x1="9" y1="12" x2="9" y2="18"></line><line x1="5" y1="12" x2="5" y2="18"></line></svg></button>
                  </div>
                  <div class="note-popup-sep"></div>
                  <div class="note-popup-row">
                    <select data-cmd="fontSize" style="padding:2px;border-radius:4px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-main);font-size:11px;outline:none;cursor:pointer;flex:1;"><option value="3">Normal</option><option value="4">Large</option><option value="5">Heading</option></select>
                  </div>
                  <div class="note-popup-row">
                    <input type="color" class="custom-color-slot" id="quick-color-1">
                    <input type="color" class="custom-color-slot" id="quick-color-2">
                    <input type="color" class="custom-color-slot" id="quick-color-3">
                  </div>
                </div>
              </div>
            </div>
'@

$newLines = $newToolbar -split "`r?`n"
# Remove trailing empty line from here-string
if ($newLines[-1] -eq '') { $newLines = $newLines[0..($newLines.Length - 2)] }

# --- features/dashboard.html: replace lines 384-437 (0-indexed 383-436) ---
$f1 = "d:\Code\MyWorkona - Test\features\dashboard.html"
$l1 = Get-Content -LiteralPath $f1 -Encoding UTF8
($l1[0..382] + $newLines + $l1[437..($l1.Length - 1)]) | Set-Content -LiteralPath $f1 -Encoding UTF8
Write-Host "features/dashboard.html done. Lines: $($(Get-Content -LiteralPath $f1 -Encoding UTF8).Count)"

# --- dashboard.html: replace lines 438-491 (0-indexed 437-490) ---
$f2 = "d:\Code\MyWorkona - Test\dashboard.html"
$l2 = Get-Content -LiteralPath $f2 -Encoding UTF8
($l2[0..436] + $newLines + $l2[491..($l2.Length - 1)]) | Set-Content -LiteralPath $f2 -Encoding UTF8
Write-Host "dashboard.html done. Lines: $($(Get-Content -LiteralPath $f2 -Encoding UTF8).Count)"
