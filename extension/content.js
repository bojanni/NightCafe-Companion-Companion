'use strict';

// Avoid double injection
if (window.__ncImporterLoaded) {
  // Already loaded – just update state
} else {
  window.__ncImporterLoaded = true;

  let floatingBtn = null;
  let toastEl = null;
  let buttonEnabled = true;

  // Load initial toggle state
  chrome.storage.sync.get(['pageButtonEnabled'], (data) => {
    buttonEnabled = data.pageButtonEnabled !== false;
    if (buttonEnabled) injectButton();
  });

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'toggleButton') {
      buttonEnabled = msg.enabled;
      if (buttonEnabled) {
        injectButton();
      } else {
        removeButton();
      }
      sendResponse({ ok: true });
    }

    if (msg.action === 'extractData') {
      const data = extractCreationData();
      sendResponse(data);
    }

    return true; // async
  });

  // ─── Extract page data ────────────────────────────────────────────────────────

  function extractCreationData() {
    const data = {
      source: 'NightCafe Studio',
      url: window.location.href,
      creationId: null,
      title: null,
      prompt: null,
      imageUrl: null,
      model: null,
      style: null,
      metadata: {},
      extractedAt: new Date().toISOString()
    };

    // Creation ID from URL
    const urlMatch = window.location.pathname.match(/\/creation\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) data.creationId = urlMatch[1];

    // ── Meta tags (most reliable) ──
    const og = (prop) => document.querySelector(`meta[property="${prop}"]`)?.content || null;
    const tw = (name) => document.querySelector(`meta[name="${name}"]`)?.content || null;

    data.imageUrl = og('og:image') || tw('twitter:image') || null;
    data.title = (og('og:title') || tw('twitter:title') || document.title || '')
      .replace(/\s*[|\-]\s*NightCafe.*$/i, '').trim() || null;
    data.prompt = og('og:description') || tw('twitter:description') || null;

    // ── JSON-LD structured data ──
    document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
      try {
        const ld = JSON.parse(el.textContent);
        data.imageUrl = data.imageUrl || ld.image || ld.thumbnail?.url || null;
        data.prompt = data.prompt || ld.description || null;
        data.title = data.title || ld.name || null;
        if (ld.author?.name) data.metadata.author = ld.author.name;
        if (ld.dateCreated) data.metadata.dateCreated = ld.dateCreated;
      } catch { /* skip */ }
    });

    // ── DOM fallbacks for prompt ──
    if (!data.prompt) {
      const promptSelectors = [
        '[data-testid*="prompt"]',
        '[class*="prompt" i]',
        '[class*="Prompt"]',
        '[class*="description" i]',
        'p[class*="text" i]',
        '[class*="creation-info" i] p',
        'article p',
        'main p'
      ];
      for (const sel of promptSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const text = el.textContent.trim();
          if (text.length > 15 && text.length < 2000) {
            data.prompt = text;
            break;
          }
        }
        if (data.prompt) break;
      }
    }

    // ── Find main image if not from meta ──
    if (!data.imageUrl) {
      const candidates = Array.from(document.querySelectorAll('img'));
      const main = candidates
        .filter(img =>
          img.src &&
          (img.src.includes('nightcafe') ||
           img.src.includes('cdn') ||
           img.src.includes('storage')) &&
          img.naturalWidth >= 200
        )
        .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))[0];
      if (main) data.imageUrl = main.src;
    }

    // ── Model / style info ──
    const modelSelectors = [
      '[class*="model" i]',
      '[class*="algorithm" i]',
      '[data-testid*="model"]'
    ];
    for (const sel of modelSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        data.model = el.textContent.trim();
        break;
      }
    }

    // ── Page metadata ──
    data.metadata.pageTitle = document.title;
    data.metadata.userAgent = navigator.userAgent.split(' ').slice(-2).join(' ');

    return data;
  }

  // ─── Floating button ─────────────────────────────────────────────────────────

  function injectButton() {
    if (floatingBtn) return;

    floatingBtn = document.createElement('button');
    floatingBtn.id = 'nc-importer-btn';
    floatingBtn.setAttribute('data-testid', 'nc-floating-import-btn');
    floatingBtn.title = 'NightCafe Importer – Importeer deze creatie';
    floatingBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <span>Importeer</span>
    `;

    floatingBtn.addEventListener('click', handleFloatingImport);
    document.body.appendChild(floatingBtn);
  }

  function removeButton() {
    if (floatingBtn) {
      floatingBtn.remove();
      floatingBtn = null;
    }
  }

  async function handleFloatingImport() {
    const data = extractCreationData();

    if (!data.creationId && !data.imageUrl) {
      showToast('Geen creatie-data gevonden op deze pagina', 'error');
      return;
    }

    floatingBtn.classList.add('loading');
    floatingBtn.innerHTML = `
      <span class="nc-spinner"></span>
      <span>Bezig...</span>
    `;

    try {
      const storageData = await chrome.storage.sync.get(['endpointUrl']);
      const endpoint = (storageData.endpointUrl || 'http://localhost:3000').replace(/\/$/, '');

      const response = await fetch(`${endpoint}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        showToast('Creatie geimporteerd!', 'success');
      } else {
        throw new Error(`Status ${response.status}`);
      }
    } catch (err) {
      showToast('Import mislukt: ' + err.message, 'error');
    } finally {
      floatingBtn.classList.remove('loading');
      floatingBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span>Importeer</span>
      `;
    }
  }

  // ─── Toast notification ───────────────────────────────────────────────────────

  function showToast(message, type = 'info') {
    if (toastEl) toastEl.remove();

    toastEl = document.createElement('div');
    toastEl.id = 'nc-importer-toast';
    toastEl.className = `nc-toast nc-toast-${type}`;
    toastEl.textContent = message;
    document.body.appendChild(toastEl);

    // Animate in
    requestAnimationFrame(() => {
      toastEl.classList.add('nc-toast-show');
    });

    // Auto-dismiss
    setTimeout(() => {
      toastEl.classList.remove('nc-toast-show');
      setTimeout(() => { if (toastEl) { toastEl.remove(); toastEl = null; } }, 400);
    }, 3500);
  }
}
