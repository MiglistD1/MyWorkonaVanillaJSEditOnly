// When the extension icon is clicked, open a new tab

chrome.action.onClicked.addListener(() => {
  // Open the vanilla JS dashboard.html directly
  const url = chrome.runtime.getURL('dashboard.html');
  chrome.tabs.create({ url });
});

/** หน้า pick บน localhost ส่งผลเลือกโน้ตเมื่อไม่มี window.opener (เช่น เปิดจาก Side Panel) — เก็บแล้วให้ dashboard ดึง */
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'NOTE_WEBAPP_PICK') {
    return;
  }
  const payload = { ...message, _ts: Date.now() };
  chrome.storage.local.set({ pendingNoteWebappPick: payload }, () => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ ok: true });
  });
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.startsWith('https://myworkona.test/open')) {
    try {
      const url = new URL(changeInfo.url);
      const spaceId = url.searchParams.get('spaceId');
      if (spaceId) {
        // Update the link to point to dashboard.html
        const extensionUrl = chrome.runtime.getURL('dashboard.html') + `?spaceId=${spaceId}`;
        chrome.tabs.create({ url: extensionUrl });
        chrome.tabs.remove(tabId);
      }
    } catch (e) {
      console.error("Error handling space URL", e);
    }
  }
});