'use strict';

const DEFAULT_ENDPOINT = 'http://localhost:3000';

// State
let currentEndpoint = DEFAULT_ENDPOINT;
let isOnNightCafe = false;

// DOM refs
const endpointInput = document.getElementById('endpointUrl');
const saveUrlBtn = document.getElementById('saveUrlBtn');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const pageButtonToggle = document.getElementById('pageButtonToggle');
const importBtn = document.getElementById('importBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const statusBadge = document.getElementById('statusBadge');
const resultMsg = document.getElementById('resultMsg');
const pageIndicator = document.getElementById('pageIndicator');
const pageLabel = document.getElementById('pageLabel');
const importHint = document.getElementById('importHint');

// Init
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await checkCurrentTab();
  await testConnection(true);
});

async function loadSettings() {
  const data = await chrome.storage.sync.get(['endpointUrl', 'pageButtonEnabled']);
  currentEndpoint = data.endpointUrl || DEFAULT_ENDPOINT;
  endpointInput.value = currentEndpoint;
  pageButtonToggle.checked = data.pageButtonEnabled !== false; // default ON
}

async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('nightcafe.studio')) {
      isOnNightCafe = true;
      pageIndicator.classList.add('on-nightcafe');
      pageLabel.textContent = shortenUrl(tab.url);

      const isCreationPage = tab.url.includes('/creation/');
      importHint.textContent = isCreationPage
        ? 'Klaar om te importeren!'
        : 'Open een creatie-pagina om te importeren';
      importBtn.disabled = !isCreationPage;
    } else {
      isOnNightCafe = false;
      pageLabel.textContent = 'Niet op NightCafe';
      importHint.textContent = 'Ga naar creator.nightcafe.studio';
      importBtn.disabled = true;
    }
  } catch {
    importBtn.disabled = true;
  }
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return '/' + parts.slice(0, 2).join('/') + '...';
    return u.hostname;
  } catch {
    return url;
  }
}

// Test connection
async function testConnection(silent = false) {
  setStatus('checking', 'Controleren...');
  if (!silent) {
    testConnectionBtn.disabled = true;
    testConnectionBtn.innerHTML = '<span class="spinner"></span> Testen...';
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${currentEndpoint}/api/import/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }
    });
    clearTimeout(timeout);

    if (response.ok) {
      setStatus('connected', 'Verbonden');
      if (!silent) showMessage('Verbinding succesvol!', 'success');
    } else {
      setStatus('error', 'Fout ' + response.status);
      if (!silent) showMessage(`Endpoint reageerde met status ${response.status}`, 'error');
    }
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Timeout (5s)' : 'Geen verbinding';
    setStatus('error', msg);
    if (!silent) showMessage(`Kan ${currentEndpoint} niet bereiken`, 'error');
  } finally {
    if (!silent) {
      testConnectionBtn.disabled = false;
      testConnectionBtn.innerHTML = '<span class="btn-icon-left">&#9654;</span> Test Verbinding';
    }
  }
}

function setStatus(state, text) {
  statusDot.className = 'status-dot';
  if (state === 'connected') statusDot.classList.add('connected');
  else if (state === 'error') statusDot.classList.add('error');
  else if (state === 'checking') statusDot.classList.add('checking');
  statusText.textContent = text;
}

// Save URL
saveUrlBtn.addEventListener('click', async () => {
  const url = endpointInput.value.trim().replace(/\/$/, '');
  if (!url) return;
  currentEndpoint = url;
  await chrome.storage.sync.set({ endpointUrl: url });
  saveUrlBtn.textContent = '✓';
  setTimeout(() => { saveUrlBtn.textContent = '✓'; }, 1000);
  await testConnection(false);
});

endpointInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveUrlBtn.click();
});

// Test connection button
testConnectionBtn.addEventListener('click', () => testConnection(false));

// Toggle page button
pageButtonToggle.addEventListener('change', async () => {
  const enabled = pageButtonToggle.checked;
  await chrome.storage.sync.set({ pageButtonEnabled: enabled });

  // Notify content script in current tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('nightcafe.studio')) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'toggleButton',
        enabled
      });
    }
  } catch {
    // Tab not ready or not NightCafe
  }
});

// Import button
importBtn.addEventListener('click', async () => {
  importBtn.disabled = true;
  importBtn.innerHTML = '<span class="spinner"></span> Importeren...';
  hideMessage();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('Geen actief tabblad');

    // Ask content script to extract data
    let data;
    try {
      data = await chrome.tabs.sendMessage(tab.id, { action: 'extractData' });
    } catch {
      // Content script might not be ready – inject manually
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await new Promise(r => setTimeout(r, 500));
      data = await chrome.tabs.sendMessage(tab.id, { action: 'extractData' });
    }

    if (!data || !data.url) {
      throw new Error('Geen data gevonden op deze pagina');
    }

    // Send to local endpoint
    const endpoint = currentEndpoint || DEFAULT_ENDPOINT;
    const response = await fetch(`${endpoint}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      const result = await response.json();
      showMessage(`Geimporteerd! ID: ${result.id || 'ok'}`, 'success');
    } else {
      const err = await response.text();
      throw new Error(`Server fout: ${response.status} - ${err}`);
    }
  } catch (err) {
    showMessage(err.message || 'Import mislukt', 'error');
  } finally {
    importBtn.disabled = !isOnNightCafe;
    importBtn.innerHTML = '<span class="btn-icon-left">&#8593;</span> Importeer Nu';
  }
});

// Show/hide message
function showMessage(text, type = 'info') {
  resultMsg.textContent = text;
  resultMsg.className = `result-msg ${type}`;
}

function hideMessage() {
  resultMsg.className = 'result-msg hidden';
}
