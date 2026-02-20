'use strict';

const DEFAULT_ENDPOINT = 'http://localhost:3000';

// State
let currentEndpoint = DEFAULT_ENDPOINT;
let isOnNightCafe = false;
let currentCreationId = null;

// DOM refs
const endpointInput = document.getElementById('endpointUrl');
const saveUrlBtn = document.getElementById('saveUrlBtn');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const pageButtonToggle = document.getElementById('pageButtonToggle');
const importBtn = document.getElementById('importBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const resultMsg = document.getElementById('resultMsg');
const pageIndicator = document.getElementById('pageIndicator');
const pageLabel = document.getElementById('pageLabel');
const importHint = document.getElementById('importHint');
const alreadyImportedBadge = document.getElementById('alreadyImportedBadge');
const alreadyImportedDate = document.getElementById('alreadyImportedDate');

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
  pageButtonToggle.checked = data.pageButtonEnabled !== false;
}

async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('nightcafe.studio')) {
      isOnNightCafe = true;
      pageIndicator.classList.add('on-nightcafe');
      pageLabel.textContent = shortenUrl(tab.url);

      const creationMatch = tab.url.match(/\/creation\/([a-zA-Z0-9_-]+)/);
      const isCreationPage = !!creationMatch;
      currentCreationId = creationMatch ? creationMatch[1] : null;

      // Check of het een lijst-pagina is
      const isListPage = !isCreationPage && (
        /^\/(u\/|my-creations|explore|feed)/i.test(new URL(tab.url).pathname)
      );

      if (isListPage) {
        importHint.textContent = 'Lijst-pagina gedetecteerd';
        importBtn.disabled = false;
        importBtn.innerHTML = '<span class="btn-icon-left">&#8595;&#8595;</span> Importeer Alles';
        importBtn.dataset.mode = 'bulk';

        // Vraag aantal creaties op
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCreationLinks' });
          if (response?.links?.length > 0) {
            importHint.textContent = `${response.links.length} creaties gevonden`;
          }
        } catch {}
      } else if (isCreationPage) {
        importHint.textContent = 'Klaar om te importeren!';
        importBtn.disabled = false;
        importBtn.dataset.mode = 'single';

        if (currentCreationId) {
          checkCreationStatus(currentCreationId);
        }
      } else {
        importHint.textContent = 'Open een creatie-pagina om te importeren';
        importBtn.disabled = true;
      }
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

// ─── Import status check ──────────────────────────────────────────────────────
async function checkCreationStatus(creationId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `${currentEndpoint}/api/import/status?creationId=${encodeURIComponent(creationId)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return;
    const data = await res.json();
    updateImportStatusBadge(data);
  } catch {
    // Silently fail – endpoint might not be available
  }
}

function updateImportStatusBadge(statusData) {
  if (statusData.exists) {
    const dateStr = statusData.importedAt
      ? new Date(statusData.importedAt).toLocaleDateString('nl-NL', {
          day: '2-digit', month: 'short', year: 'numeric'
        })
      : '';
    alreadyImportedDate.textContent = dateStr ? `op ${dateStr}` : '';
    alreadyImportedBadge.classList.remove('hidden');
    // Change button to "Opnieuw importeren"
    importBtn.innerHTML = '<span class="btn-icon-left">&#8635;</span> Opnieuw importeren';
  } else {
    alreadyImportedBadge.classList.add('hidden');
    importBtn.innerHTML = '<span class="btn-icon-left">&#8593;</span> Importeer Nu';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shortenUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return '/' + parts.slice(0, 2).join('/') + '...';
    return u.hostname;
  } catch { return url; }
}

// ─── Test connection ──────────────────────────────────────────────────────────
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
      signal: controller.signal
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

// ─── Save URL ─────────────────────────────────────────────────────────────────
saveUrlBtn.addEventListener('click', async () => {
  const url = endpointInput.value.trim().replace(/\/$/, '');
  if (!url) return;
  currentEndpoint = url;
  await chrome.storage.sync.set({ endpointUrl: url });
  saveUrlBtn.textContent = '✓';
  setTimeout(() => { saveUrlBtn.textContent = '✓'; }, 1000);
  await testConnection(false);
  if (currentCreationId) checkCreationStatus(currentCreationId);
});

endpointInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveUrlBtn.click();
});

// ─── Test connection button ───────────────────────────────────────────────────
testConnectionBtn.addEventListener('click', () => testConnection(false));

// ─── Toggle page button ───────────────────────────────────────────────────────
pageButtonToggle.addEventListener('change', async () => {
  const enabled = pageButtonToggle.checked;
  await chrome.storage.sync.set({ pageButtonEnabled: enabled });
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('nightcafe.studio')) {
      await chrome.tabs.sendMessage(tab.id, { action: 'toggleButton', enabled });
    }
  } catch { /* tab not ready */ }
});

// ─── Import button ────────────────────────────────────────────────────────────
importBtn.addEventListener('click', async () => {
  importBtn.disabled = true;
  importBtn.innerHTML = '<span class="spinner"></span> Afbeeldingen ophalen...';
  hideMessage();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('Geen actief tabblad');

    let data;
    try {
      data = await chrome.tabs.sendMessage(tab.id, { action: 'extractData' });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await new Promise(r => setTimeout(r, 500));
      data = await chrome.tabs.sendMessage(tab.id, { action: 'extractData' });
    }

    if (!data || !data.url) throw new Error('Geen data gevonden op deze pagina');

    const response = await fetch(`${currentEndpoint}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      const result = await response.json();
      const msg = result.duplicate
        ? 'Al geïmporteerd (opnieuw verstuurd)'
        : `Geïmporteerd! (${result.id?.slice(0, 8)}...)`;
      showMessage(msg, 'success');

      // Update badge to "al geïmporteerd"
      updateImportStatusBadge({ exists: true, importedAt: new Date().toISOString() });
      // Notify content script to update floating button
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'markImported', importedAt: new Date().toISOString() });
      } catch { /* ignore */ }
    } else {
      const err = await response.text();
      throw new Error(`Server fout: ${response.status} - ${err}`);
    }
  } catch (err) {
    showMessage(err.message || 'Import mislukt', 'error');
  } finally {
    importBtn.disabled = !isOnNightCafe;
    importBtn.innerHTML = '<span class="btn-icon-left">&#8635;</span> Opnieuw importeren';
  }
});

// ─── Message helpers ──────────────────────────────────────────────────────────
function showMessage(text, type = 'info') {
  resultMsg.textContent = text;
  resultMsg.className = `result-msg ${type}`;
}

function hideMessage() {
  resultMsg.className = 'result-msg hidden';
}
