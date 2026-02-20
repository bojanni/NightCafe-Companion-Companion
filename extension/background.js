'use strict';

// Background service worker for NightCafe Importer

// On install: set defaults
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.sync.get(['endpointUrl', 'pageButtonEnabled']);
  if (!data.endpointUrl) {
    await chrome.storage.sync.set({ endpointUrl: 'http://localhost:3000' });
  }
  if (data.pageButtonEnabled === undefined) {
    await chrome.storage.sync.set({ pageButtonEnabled: true });
  }
  console.log('[NightCafe Importer] Extension installed/updated');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getEndpoint') {
    chrome.storage.sync.get(['endpointUrl'], (data) => {
      sendResponse({ endpoint: data.endpointUrl || 'http://localhost:3000' });
    });
    return true;
  }

  if (msg.action === 'log') {
    console.log('[NightCafe Importer]', msg.data);
    sendResponse({ ok: true });
  }

  if (msg.action === 'startBulkImport') {
    const originTabId = sender.tab?.id;
    if (!originTabId) {
      sendResponse({ ok: false, error: 'Geen tab gevonden' });
      return;
    }
    // Start async bulk import
    processBulkImport(msg.creations, originTabId);
    sendResponse({ ok: true, started: true });
    return true;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BULK IMPORT HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

async function processBulkImport(creations, originTabId) {
  const { endpointUrl } = await chrome.storage.sync.get(['endpointUrl']);
  const endpoint = (endpointUrl || 'http://localhost:3000').replace(/\/$/, '');

  for (let i = 0; i < creations.length; i++) {
    const creation = creations[i];
    const label = creation.title || creation.creationId;

    // Stuur "controleren" status
    sendProgress(originTabId, {
      current: i + 1,
      total: creations.length,
      status: 'checking',
      title: label,
      creationId: creation.creationId
    });

    // 1. Check of al geïmporteerd
    try {
      const statusRes = await fetch(
        `${endpoint}/api/import/status?creationId=${encodeURIComponent(creation.creationId)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.exists) {
          sendProgress(originTabId, {
            current: i + 1,
            total: creations.length,
            status: 'skipped',
            title: statusData.title || label,
            creationId: creation.creationId
          });
          continue;
        }
      }
    } catch (e) {
      console.log('[Bulk] Status check failed:', e.message);
    }

    // 2. Open tab, extract data, import
    sendProgress(originTabId, {
      current: i + 1,
      total: creations.length,
      status: 'importing',
      title: label,
      creationId: creation.creationId
    });

    let extractedData = null;
    let openedTabId = null;

    try {
      // Open creatie-pagina in achtergrond-tab
      const tab = await chrome.tabs.create({ url: creation.url, active: false });
      openedTabId = tab.id;

      // Wacht tot pagina geladen is
      await waitForTabLoad(tab.id, 15000);

      // Extra wachttijd voor React SPA rendering
      await sleep(2500);

      // Probeer data te extracten
      try {
        extractedData = await chrome.tabs.sendMessage(tab.id, { action: 'extractData' });
      } catch {
        // Content script niet klaar - inject handmatig
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        await sleep(1500);
        extractedData = await chrome.tabs.sendMessage(tab.id, { action: 'extractData' });
      }
    } catch (err) {
      console.log('[Bulk] Extract failed:', creation.creationId, err.message);
      sendProgress(originTabId, {
        current: i + 1,
        total: creations.length,
        status: 'error',
        title: label,
        creationId: creation.creationId,
        error: err.message
      });
    } finally {
      // Sluit de tab altijd
      if (openedTabId) {
        try { await chrome.tabs.remove(openedTabId); } catch {}
      }
    }

    // 3. Stuur data naar backend
    if (extractedData && extractedData.url) {
      try {
        const importRes = await fetch(`${endpoint}/api/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(extractedData),
          signal: AbortSignal.timeout(10000)
        });

        if (importRes.ok) {
          const result = await importRes.json();
          sendProgress(originTabId, {
            current: i + 1,
            total: creations.length,
            status: result.duplicate ? 'duplicate' : 'imported',
            title: extractedData.title || label,
            creationId: creation.creationId
          });
        } else {
          throw new Error(`HTTP ${importRes.status}`);
        }
      } catch (err) {
        sendProgress(originTabId, {
          current: i + 1,
          total: creations.length,
          status: 'error',
          title: label,
          creationId: creation.creationId,
          error: err.message
        });
      }
    }

    // Kleine pauze tussen imports om NightCafe niet te overbelasten
    if (i < creations.length - 1) await sleep(800);
  }

  // Stuur voltooiingsbericht
  try {
    await chrome.tabs.sendMessage(originTabId, {
      action: 'bulkComplete',
      total: creations.length
    });
  } catch {}
}

function sendProgress(tabId, data) {
  try {
    chrome.tabs.sendMessage(tabId, { action: 'bulkProgress', ...data });
  } catch {}
}

function waitForTabLoad(tabId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // Niet falen, probeer toch door te gaan
    }, timeoutMs);

    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Update extension icon based on current tab
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    const isNightCafe = tab.url && tab.url.includes('nightcafe.studio');
    // Could set badge text here if needed
    if (isNightCafe) {
      chrome.action.setBadgeText({ text: 'NC', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#7c3aed', tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch {
    // Tab might not exist
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isNightCafe = tab.url.includes('nightcafe.studio');
    if (isNightCafe) {
      chrome.action.setBadgeText({ text: 'NC', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#7c3aed', tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  }
});
