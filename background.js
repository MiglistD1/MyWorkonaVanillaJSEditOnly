// When the extension icon is clicked, open a new tab
import { syncAllGoogleTasks } from './features/googleTasks.js';

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

// Create a periodic alarm for Google Tasks sync
chrome.alarms.create('google-tasks-sync-alarm', {
  periodInMinutes: 5
});

// Create a periodic alarm for auto-export
chrome.alarms.create('auto-export', {
  periodInMinutes: 60
});

// Listen for the alarm and trigger Google Tasks sync
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'google-tasks-sync-alarm') {
    syncAllGoogleTasks();
  }

  if (alarm.name === 'auto-export') {
    chrome.storage.local.get(['appSettings'], (res) => {
      const settings = res.appSettings;
      if (settings && settings.autoExportDays > 0) {
        const now = Date.now();
        const lastExport = settings.lastExportTimestamp || 0;
        const interval = settings.autoExportDays * 24 * 60 * 60 * 1000;

        if (now - lastExport >= interval) {
          chrome.storage.local.get(null, (allData) => {
            const jsonStr = JSON.stringify(allData, null, 2);
            const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
            const d = new Date(now);
            const timestamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
            const filename = (settings.exportSubfolder || 'MyBackups') + '/MyWorkspace_AutoBackup_' + timestamp + '.json';
            
            chrome.downloads.download({ url: dataUrl, filename }, () => {
              settings.lastExportTimestamp = now;
              chrome.storage.local.set({ appSettings: settings });
            });
          });
        }
      }
    });
  }
});