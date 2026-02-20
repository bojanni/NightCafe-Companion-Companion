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
});

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
