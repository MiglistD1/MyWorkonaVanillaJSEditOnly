// When the extension icon is clicked, open a new tab

chrome.action.onClicked.addListener(() => {
  // Open the vanilla JS dashboard.html directly
  const url = chrome.runtime.getURL('dashboard.html');
  chrome.tabs.create({ url });
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