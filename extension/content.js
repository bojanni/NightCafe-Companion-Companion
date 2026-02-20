'use strict';

// Avoid double injection
if (window.__ncImporterLoaded) {
  // Already loaded - just re-init state
} else {
  window.__ncImporterLoaded = true;

  let floatingBtn = null;
  let toastEl = null;

  // Load initial toggle state and check status on page load
  chrome.storage.sync.get(['pageButtonEnabled'], (data) => {
    if (data.pageButtonEnabled !== false) {
      if (isListPage()) {
        injectBulkButton();
      } else {
        injectButton();
        scheduleStatusCheck();
      }
    }
  });

  // SPA navigatie detectie (NightCafe is een React SPA)
  setupSPANavigation();

  // ─── Message handler (async) ────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'toggleButton') {
      if (msg.enabled) {
        injectButton();
        scheduleStatusCheck();
      } else {
        removeButton();
      }
      sendResponse({ ok: true });
      return true;
    }
    if (msg.action === 'extractData') {
      extractCreationData()
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
    }
    if (msg.action === 'markImported') {
      // Popup meldt dat import succesvol was → update floating button
      setButtonImported(msg.importedAt);
      sendResponse({ ok: true });
      return true;
    }
  });

  // ─── SPA navigatie ───────────────────────────────────────────────────────────
  function setupSPANavigation() {
    const orig = history.pushState.bind(history);
    history.pushState = function (...args) {
      orig(...args);
      setTimeout(onNavigated, 900);
    };
    window.addEventListener('popstate', () => setTimeout(onNavigated, 900));
  }

  function onNavigated() {
    removeButton();
    chrome.storage.sync.get(['pageButtonEnabled'], (data) => {
      if (data.pageButtonEnabled !== false) {
        injectButton();
        scheduleStatusCheck();
      }
    });
  }

  // ─── Status check (floating button badge) ───────────────────────────────────
  function scheduleStatusCheck() {
    const creationId = extractCreationId();
    if (!creationId) return;
    // Small delay to let the button render first
    setTimeout(() => checkImportStatus(creationId), 600);
  }

  async function checkImportStatus(creationId) {
    if (!floatingBtn) return;
    try {
      const { endpointUrl } = await chrome.storage.sync.get(['endpointUrl']);
      const endpoint = (endpointUrl || 'http://localhost:3000').replace(/\/$/, '');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `${endpoint}/api/import/status?creationId=${encodeURIComponent(creationId)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) return;
      const data = await res.json();
      if (data.exists) {
        setButtonImported(data.importedAt);
      }
    } catch { /* endpoint niet beschikbaar – stil falen */ }
  }

  function setButtonImported(importedAt) {
    if (!floatingBtn) return;
    floatingBtn.classList.add('imported');
    const dateStr = importedAt
      ? new Date(importedAt).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })
      : '';
    floatingBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span>Al geïmporteerd${dateStr ? ' · ' + dateStr : ''}</span>`;
    floatingBtn.title = 'Al geïmporteerd – klik om opnieuw te importeren';
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DATA EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════════════

  async function extractCreationData() {
    const data = {
      source: 'NightCafe Studio',
      url: window.location.href,
      creationId: extractCreationId(),
      title: null,
      creationType: null,      // 'image' | 'video'
      prompt: null,            // Text Prompts (afbeelding)
      videoPrompt: null,       // Video Prompt (video)
      revisedPrompt: null,
      imageUrl: null,
      allImages: [],
      startImageUrl: null,     // Start Image (input afbeelding bij video/img2img)
      model: null,
      initialResolution: null,
      aspectRatio: null,
      seed: null,
      isPublished: false,
      metadata: {},
      extractedAt: new Date().toISOString()
    };

    // ── 1. Title from h1 ──────────────────────────────────────────────────────
    const h1 = document.querySelector('h1');
    if (h1) data.title = h1.textContent.trim();

    // Meta tag fallbacks
    const og = (p) => document.querySelector(`meta[property="${p}"]`)?.content || null;
    const tw = (n) => document.querySelector(`meta[name="${n}"]`)?.content || null;

    if (!data.title) {
      data.title = (og('og:title') || tw('twitter:title') || document.title || '')
        .replace(/\s*[|\-—]\s*NightCafe.*$/i, '').trim() || null;
    }

    // ── 2. Find Creation Settings section ────────────────────────────────────
    const settingsCtx = getCreationSettingsContainer();

    // ── 3. Detect creation type (image vs video) ──────────────────────────────
    const hasVideoPromptLabel = !!findLabelTextNode('Video Prompt', settingsCtx);
    data.creationType = hasVideoPromptLabel ? 'video' : 'image';

    // ── 4. Expand "Show full prompt" if present (async click) ─────────────────
    await clickShowFullPrompt(settingsCtx);

    // ── 5. Text Prompts (afbeelding) ─────────────────────────────────────────
    const rawTextPrompt = extractField('Text Prompts', settingsCtx)
      || extractField('Prompt', settingsCtx)
      || null;

    if (rawTextPrompt && /has hidden the prompt/i.test(rawTextPrompt)) {
      data.metadata.promptHidden = true;
    } else {
      data.prompt = rawTextPrompt;
    }

    // ── 6. Video Prompt ───────────────────────────────────────────────────────
    data.videoPrompt =
      extractField('Video Prompt', settingsCtx) ||
      extractField('Video prompt', settingsCtx) ||
      extractFieldFuzzy('video prompt', settingsCtx) ||
      null;

    // Voor video: zet videoPrompt ook als hoofd-prompt als er geen textPrompt is
    if (!data.prompt && data.videoPrompt) {
      data.prompt = data.videoPrompt;
    }

    // Fallback meta tags
    if (!data.prompt) {
      data.prompt = og('og:description') || tw('twitter:description') || null;
    }

    // ── 7. Revised Prompt ─────────────────────────────────────────────────────
    data.revisedPrompt =
      extractField('Revised Prompt', settingsCtx) ||
      extractField('Revised prompt', settingsCtx) ||
      extractField('DALL-E Revised Prompt', settingsCtx) ||
      extractField('Revised Text Prompt', settingsCtx) ||
      extractFieldFuzzy('revised', settingsCtx) ||
      null;

    // ── 8. Start Image – werkt voor zowel afbeelding als video ───────────────
    // NightCafe gebruikt meerdere labels afhankelijk van het model/type
    data.startImageUrl =
      extractImageAfterLabel('Start Image', settingsCtx) ||
      extractImageAfterLabel('Start image', settingsCtx) ||
      extractImageAfterLabel('Init Image', settingsCtx) ||
      extractImageAfterLabel('Initial Image', settingsCtx) ||
      extractImageAfterLabel('Source Image', settingsCtx) ||
      extractImageAfterLabel('Reference Image', settingsCtx) ||
      extractImageAfterLabel('Input Image', settingsCtx) ||
      extractImageAfterLabel('Img2Img Image', settingsCtx) ||
      extractImageAfterLabel('Style Image', settingsCtx) ||
      extractImageAfterLabelFuzzy('start', settingsCtx) ||
      null;

    // ── 9. Model ──────────────────────────────────────────────────────────────
    data.model = extractModelName(settingsCtx);

    // ── 10. Initial Resolution ────────────────────────────────────────────────
    data.initialResolution = extractField('Initial Resolution', settingsCtx);

    // ── 11. Aspect Ratio ──────────────────────────────────────────────────────
    data.aspectRatio = extractField('Aspect Ratio', settingsCtx);

    // ── 12. Seed ──────────────────────────────────────────────────────────────
    data.seed = extractField('Seed', settingsCtx);

    // ── 13. Extra metadata ────────────────────────────────────────────────────
    const samplingMethod = extractField('Sampling method', settingsCtx)
      || extractField('Sampling Method', settingsCtx);
    const runtime = extractField('Runtime', settingsCtx);
    const promptWeight = extractField('Overall Prompt Weight', settingsCtx);
    const refinerWeight = extractField('Refiner Weight', settingsCtx);
    const duration = extractField('Duration', settingsCtx)
      || extractField('Video Duration', settingsCtx);
    if (samplingMethod) data.metadata.samplingMethod = samplingMethod;
    if (runtime) data.metadata.runtime = runtime;
    if (promptWeight) data.metadata.overallPromptWeight = promptWeight;
    if (refinerWeight) data.metadata.refinerWeight = refinerWeight;
    if (duration) data.metadata.duration = duration;

    // ── 14. Published state ───────────────────────────────────────────────────
    data.isPublished = extractPublishedState();

    // ── 15. Main image (mdi icon #e64d6a marks it) ────────────────────────────
    data.imageUrl = findMainImage()
      || og('og:image') || tw('twitter:image') || null;

    // ── 16. Gallery images (data-thumb-gallery) ───────────────────────────────
    data.allImages = await extractGalleryImages();

    if (data.imageUrl && !data.allImages.includes(data.imageUrl)) {
      data.allImages.unshift(data.imageUrl);
    }
    if (!data.imageUrl && data.allImages.length > 0) {
      data.imageUrl = data.allImages[0];
    }

    // ── 17. JSON-LD structured data ───────────────────────────────────────────
    document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
      try {
        const ld = JSON.parse(el.textContent);
        if (!data.imageUrl) data.imageUrl = ld.image || ld.thumbnail?.url;
        if (!data.prompt) data.prompt = ld.description;
        if (!data.title) data.title = ld.name;
        if (ld.author?.name) data.metadata.author = ld.author.name;
        if (ld.dateCreated) data.metadata.dateCreated = ld.dateCreated;
        if (ld.datePublished) data.metadata.datePublished = ld.datePublished;
      } catch { /* ignore */ }
    });

    // ── 18. Tags ──────────────────────────────────────────────────────────────
    const tagLinks = document.querySelectorAll('a[href*="/tag/"]');
    if (tagLinks.length > 0) {
      data.metadata.tags = [...tagLinks].map(a => a.textContent.trim()).filter(Boolean);
    }

    return data;
  }

  // ─── Creation ID from URL ─────────────────────────────────────────────────────
  function extractCreationId() {
    const m = window.location.pathname.match(/\/creation\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  // ─── Find "Creation Settings" container ──────────────────────────────────────
  function getCreationSettingsContainer() {
    const headings = document.querySelectorAll('h2, h3, h4, h5, h6');
    for (const h of headings) {
      if (h.textContent.trim() === 'Creation Settings') {
        // Walk up to find a meaningful container
        let el = h.parentElement;
        for (let i = 0; i < 5 && el; i++) {
          if (el.tagName === 'SECTION' || el.tagName === 'ARTICLE'
              || (el.className && el.className.length > 3)) {
            return el;
          }
          el = el.parentElement;
        }
        return h.parentElement || document.body;
      }
    }
    return document.body;
  }

  // ─── Helper: find the text node for a label (for existence check) ─────────────
  function findLabelTextNode(labelText, container) {
    const ctx = container || document.body;
    const walker = document.createTreeWalker(ctx, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() === labelText) return node;
    }
    return null;
  }

  // ─── Click "Show full prompt" to expand truncated text ───────────────────────
  async function clickShowFullPrompt(container) {
    const ctx = container || document.body;
    const allEls = ctx.querySelectorAll('button, a, span, [role="button"]');
    for (const el of allEls) {
      const t = el.textContent.trim().toLowerCase();
      if (t === 'show full prompt' || t === 'show full' || t === 'toon volledige prompt') {
        el.click();
        await new Promise(r => setTimeout(r, 700));
        return;
      }
    }
  }

  // ─── Extract image src after a label ─────────────────────────────────────────
  // Finds the <img> element that appears directly after a given label text.
  function extractImageAfterLabel(labelText, container) {
    const ctx = container || document.body;
    const walker = document.createTreeWalker(ctx, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      if (node.textContent.trim() !== labelText) continue;
      const labelEl = node.parentElement;
      if (labelEl.textContent.trim().length > labelText.length + 4) continue;

      const candidates = [
        labelEl.nextElementSibling,
        labelEl.parentElement?.nextElementSibling,
        labelEl.parentElement?.parentElement?.nextElementSibling,
        labelEl.parentElement?.parentElement?.parentElement?.nextElementSibling
      ];

      for (const cand of candidates) {
        if (!cand) continue;
        if (cand.tagName === 'IMG' && cand.src) return toFullSizeUrl(cand.src);
        const img = cand.querySelector('img');
        if (img && img.src && img.src.startsWith('http')) return toFullSizeUrl(img.src);
        const bgUrl = getBgImageUrl(cand);
        if (bgUrl) return toFullSizeUrl(bgUrl);
      }
    }
    return null;
  }

  // Fuzzy variant – zoekt op een trefwoord in de label tekst
  function extractImageAfterLabelFuzzy(keyword, container) {
    const ctx = container || document.body;
    const kw = keyword.toLowerCase();
    const walker = document.createTreeWalker(ctx, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      if (!t.toLowerCase().includes(kw) || t.length > 50) continue;
      const labelEl = node.parentElement;
      if (labelEl.textContent.trim().length > 60) continue;

      const candidates = [
        labelEl.nextElementSibling,
        labelEl.parentElement?.nextElementSibling,
        labelEl.parentElement?.parentElement?.nextElementSibling
      ];
      for (const cand of candidates) {
        if (!cand) continue;
        if (cand.tagName === 'IMG' && cand.src) return toFullSizeUrl(cand.src);
        const img = cand.querySelector('img');
        if (img && img.src && img.src.startsWith('http')) return toFullSizeUrl(img.src);
        const bgUrl = getBgImageUrl(cand);
        if (bgUrl) return toFullSizeUrl(bgUrl);
      }
    }
    return null;
  }

  // ─── Generic label → value extractor ─────────────────────────────────────────  //
  // NightCafe structure (from live page):
  //   <heading>Text Prompts</heading>
  //   <div>the actual prompt text</div>
  //
  // We find the text node matching the label, then look for
  // the value in sibling/parent-sibling elements.
  function extractField(labelText, container) {
    const ctx = container || document.body;
    const walker = document.createTreeWalker(ctx, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      const nodeText = node.textContent.trim();
      if (nodeText !== labelText) continue;

      const labelEl = node.parentElement;

      // Skip if the element itself contains lots more text (it's a value, not a label)
      if (labelEl.textContent.trim().length > labelText.length + 4) continue;

      // Candidates: next sibling → parent's next sibling → grandparent's next sibling
      const candidates = [
        labelEl.nextElementSibling,
        labelEl.parentElement?.nextElementSibling,
        labelEl.parentElement?.parentElement?.nextElementSibling,
        labelEl.parentElement?.parentElement?.parentElement?.nextElementSibling
      ];

      for (const cand of candidates) {
        if (!cand) continue;
        const val = cand.textContent.trim();
        if (!val || val === labelText || val.length > 2000) continue;

        // If it contains an anchor link to /model/, prefer that link text
        const modelLink = cand.querySelector('a[href*="/model/"]');
        if (modelLink) return modelLink.textContent.trim();

        // Return the value if it looks like a real value (not another label)
        if (val.length > 0 && val.length < 1500) return val;
      }
    }
    return null;
  }

  // ─── Fuzzy label extractor (case-insensitive substring match) ────────────────
  // Used as fallback when exact label match fails.
  // Finds any label element whose text includes `keyword` (case-insensitive),
  // then returns the adjacent value element text.
  function extractFieldFuzzy(keyword, container) {
    const ctx = container || document.body;
    const kw = keyword.toLowerCase();
    const walker = document.createTreeWalker(ctx, NodeFilter.SHOW_TEXT);
    let node;

    while ((node = walker.nextNode())) {
      const nodeText = node.textContent.trim().toLowerCase();
      // Must contain keyword and be short enough to be a label (not a paragraph)
      if (!nodeText.includes(kw) || node.textContent.trim().length > 60) continue;

      const labelEl = node.parentElement;
      if (labelEl.textContent.trim().length > 80) continue; // skip containers

      const candidates = [
        labelEl.nextElementSibling,
        labelEl.parentElement?.nextElementSibling,
        labelEl.parentElement?.parentElement?.nextElementSibling
      ];

      for (const cand of candidates) {
        if (!cand) continue;
        const val = cand.textContent.trim();
        // Value must be substantial text (not just another label)
        if (val && val.length > 10 && val.length < 2000 && !val.toLowerCase().includes(kw)) {
          return val;
        }
      }
    }
    return null;
  }

  // ─── Model name ───────────────────────────────────────────────────────────────
  function extractModelName(container) {
    const ctx = container || document.body;

    // Best: direct link to /model/ page
    const modelLinks = ctx.querySelectorAll('a[href*="/model/"]');
    if (modelLinks.length > 0) {
      const text = modelLinks[0].textContent.trim();
      if (text) return text;
      const href = modelLinks[0].getAttribute('href');
      return href.split('/model/')[1]?.replace(/-/g, ' ') || null;
    }

    // Fallback: generic field extractor
    const raw = extractField('Model', ctx);
    if (!raw) return null;

    // The raw value might include "CKPT / XL\nJuggernaut XL v7" etc.
    // Return the last meaningful line
    const lines = raw.split(/\n|\r/)
      .map(l => l.trim())
      .filter(l => l && l.length > 1 && !/^\d+[KM+]+$/.test(l));
    return lines[lines.length - 1] || raw;
  }

  // ─── Published state ──────────────────────────────────────────────────────────
  // "Unpublish" button/link is visible ⟹ the creation IS published
  function extractPublishedState() {
    const allInteractive = document.querySelectorAll('button, a, [role="button"]');
    for (const el of allInteractive) {
      const t = el.textContent.trim().toLowerCase();
      if (t === 'unpublish' || t === 'unpublish creation') return true;
    }
    return false;
  }

  // ─── Main image: find via mdi icon with color #e64d6a ─────────────────────────
  // #e64d6a → rgb(230, 77, 106)
  function findMainImage() {
    const TARGET = 'rgb(230, 77, 106)';

    // Vuetify / Material Design icon selectors
    const iconEls = document.querySelectorAll(
      'i[class*="mdi"], span[class*="mdi"], .v-icon, [class*="v-icon"]'
    );

    for (const icon of iconEls) {
      const computed = window.getComputedStyle(icon);
      const inlineStyle = icon.getAttribute('style') || '';
      const colorMatch =
        computed.color === TARGET ||
        inlineStyle.includes('#e64d6a') ||
        inlineStyle.includes('e64d6a') ||
        inlineStyle.includes('230, 77, 106');

      if (!colorMatch) continue;

      // Walk up the tree to find a nearby <img>
      let ancestor = icon.parentElement;
      for (let depth = 0; depth < 10 && ancestor; depth++) {
        const img = ancestor.querySelector('img');
        if (img && img.src && img.src.includes('nightcafe')) {
          return toFullSizeUrl(img.src);
        }
        // Also check CSS background-image
        const bgUrl = getBgImageUrl(ancestor);
        if (bgUrl && bgUrl.includes('nightcafe')) return toFullSizeUrl(bgUrl);
        ancestor = ancestor.parentElement;
      }
    }

    // Fallback: largest NightCafe image on the page
    return getLargestNightCafeImageUrl();
  }

  // ─── Gallery images via data-thumb-gallery ────────────────────────────────────
  async function extractGalleryImages() {
    const images = [];

    // Find gallery container(s)
    const galleries = document.querySelectorAll(
      '[data-thumb-gallery], [class*="thumb-gallery"], [class*="thumbGallery"], [class*="ThumbGallery"]'
    );

    for (const gallery of galleries) {
      // Collect thumbnail <img> elements
      const thumbImgs = gallery.querySelectorAll('img');

      if (thumbImgs.length > 0) {
        for (const img of thumbImgs) {
          const src = img.src || img.dataset.src || img.dataset.lazySrc || '';
          if (src && src.includes('nightcafe')) {
            const full = toFullSizeUrl(src);
            if (!images.includes(full)) images.push(full);
          }
        }
      } else {
        // Thumbnails might use CSS background-image
        const divThumbs = gallery.querySelectorAll('[style*="background"]');
        for (const div of divThumbs) {
          const url = getBgImageUrl(div);
          if (url && url.includes('nightcafe')) {
            const full = toFullSizeUrl(url);
            if (!images.includes(full)) images.push(full);
          }
        }
      }
    }

    // If we found gallery thumbnails, also try clicking to get the display-area version
    if (galleries.length > 0 && images.length > 1) {
      const clickImages = await clickGalleryThumbs(galleries[0]);
      for (const url of clickImages) {
        if (!images.includes(url)) images.push(url);
      }
    }

    // No gallery found – collect all visible NightCafe images
    if (images.length === 0) {
      const allImgs = document.querySelectorAll('img');
      for (const img of allImgs) {
        if (!img.src || !img.src.includes('nightcafe')) continue;
        if (img.naturalWidth < 50 || img.naturalHeight < 50) continue; // skip icons/avatars
        const full = toFullSizeUrl(img.src);
        if (!images.includes(full)) images.push(full);
      }
    }

    return images.slice(0, 30);
  }

  // ─── Click gallery thumbnails and capture high-res display image ──────────────
  async function clickGalleryThumbs(gallery) {
    const results = [];
    const mainImg = getLargestNightCafeImageElement();
    if (!mainImg) return results;

    const thumbs = [...gallery.querySelectorAll('img, [role="button"], [class*="thumb"]')].slice(0, 10);
    if (thumbs.length <= 1) return results;

    for (const thumb of thumbs) {
      const prevSrc = mainImg.src;
      thumb.click();

      // Wait up to 1.5s for the main image src to change
      await new Promise(resolve => {
        let ms = 0;
        const poll = setInterval(() => {
          ms += 80;
          if (mainImg.src !== prevSrc || ms >= 800) {
            clearInterval(poll);
            setTimeout(resolve, 100); // extra render buffer
          }
        }, 80);
      });

      const newSrc = mainImg.src;
      if (newSrc && newSrc !== prevSrc) {
        const full = toFullSizeUrl(newSrc);
        if (!results.includes(full)) results.push(full);
      }
    }
    return results;
  }

  // ─── URL helpers ──────────────────────────────────────────────────────────────

  // Convert NightCafe CDN thumbnail URL to full-size:
  // ?tr=w-200,c-at_max  →  ?tr=w-4096,c-at_max
  function toFullSizeUrl(url) {
    if (!url) return url;
    // Replace existing tr params with high-res
    if (url.includes('?tr=')) return url.replace(/\?tr=[^#\s]*/, '?tr=w-4096,c-at_max');
    // Remove /tr:xxx/ path transforms
    if (url.includes('/tr:')) return url.replace(/\/tr:[^/]+/, '');
    return url;
  }

  function getBgImageUrl(el) {
    const s = window.getComputedStyle(el).backgroundImage;
    if (s && s !== 'none') {
      const m = s.match(/url\(["']?([^"')]+)["']?\)/);
      if (m) return m[1];
    }
    const inline = el.getAttribute('style') || '';
    const m = inline.match(/background(?:-image)?:\s*url\(["']?([^"')]+)["']?\)/);
    return m ? m[1] : null;
  }

  function getLargestNightCafeImageUrl() {
    const el = getLargestNightCafeImageElement();
    return el ? toFullSizeUrl(el.src) : null;
  }

  function getLargestNightCafeImageElement() {
    return [...document.querySelectorAll('img')]
      .filter(img => img.src && img.src.includes('nightcafe') && img.naturalWidth > 100)
      .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))[0] || null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FLOATING BUTTON
  // ═══════════════════════════════════════════════════════════════════════════════

  function injectButton() {
    if (floatingBtn) return;
    floatingBtn = document.createElement('button');
    floatingBtn.id = 'nc-importer-btn';
    floatingBtn.setAttribute('data-testid', 'nc-floating-import-btn');
    floatingBtn.title = 'NightCafe Importer – Importeer deze creatie';
    setButtonIdle();
    floatingBtn.addEventListener('click', handleFloatingImport);
    document.body.appendChild(floatingBtn);
  }

  function removeButton() {
    if (floatingBtn) { floatingBtn.remove(); floatingBtn = null; }
  }

  function setButtonIdle() {
    floatingBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2.5"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <span>Importeer</span>`;
  }

  async function handleFloatingImport() {
    if (!floatingBtn) return;
    floatingBtn.disabled = true;
    floatingBtn.classList.add('loading');
    floatingBtn.innerHTML = `<span class="nc-spinner"></span><span>Bezig...</span>`;

    try {
      const data = await extractCreationData();
      if (!data.creationId && !data.imageUrl) {
        showToast('Geen creatie gevonden op deze pagina', 'error');
        return;
      }

      const { endpointUrl } = await chrome.storage.sync.get(['endpointUrl']);
      const endpoint = (endpointUrl || 'http://localhost:3000').replace(/\/$/, '');

      const res = await fetch(`${endpoint}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        const result = await res.json();
        showToast(result.duplicate ? 'Al eerder geïmporteerd' : 'Geïmporteerd!', 'success');
        setButtonImported(new Date().toISOString());
      } else {
        throw new Error(`Status ${res.status}`);
      }
    } catch (err) {
      showToast('Fout: ' + err.message, 'error');
    } finally {
      if (floatingBtn) {
        floatingBtn.disabled = false;
        floatingBtn.classList.remove('loading');
        setButtonIdle();
      }
    }
  }

  // ─── Toast ────────────────────────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.id = 'nc-importer-toast';
    toastEl.className = `nc-toast nc-toast-${type}`;
    toastEl.textContent = message;
    document.body.appendChild(toastEl);
    requestAnimationFrame(() => toastEl.classList.add('nc-toast-show'));
    setTimeout(() => {
      toastEl?.classList.remove('nc-toast-show');
      setTimeout(() => { toastEl?.remove(); toastEl = null; }, 400);
    }, 3500);
  }

} // end guard
