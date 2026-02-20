import React, { useEffect, useState, useCallback, useRef } from 'react';
import './App.css';

const API = process.env.REACT_APP_BACKEND_URL;

// ─── Export helpers ───────────────────────────────────────────────────────────
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAsJSON(data) {
  const content = JSON.stringify(data, null, 2);
  const ts = new Date().toISOString().slice(0, 10);
  downloadFile(content, `nightcafe-imports-${ts}.json`, 'application/json');
}

function exportAsCSV(data) {
  const CSV_COLS = [
    'id', 'creationId', 'title', 'prompt', 'revisedPrompt',
    'model', 'initialResolution', 'aspectRatio', 'seed',
    'isPublished', 'imageUrl', 'allImagesCount',
    'samplingMethod', 'runtime', 'promptWeight', 'tags',
    'url', 'importedAt', 'extractedAt'
  ];

  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const rows = [CSV_COLS.join(',')];
  for (const item of data) {
    const row = [
      item.id,
      item.creationId,
      item.title,
      item.prompt,
      item.revisedPrompt,
      item.model,
      item.initialResolution,
      item.aspectRatio,
      item.seed,
      item.isPublished ? 'ja' : 'nee',
      item.imageUrl,
      (item.allImages || []).length,
      item.metadata?.samplingMethod,
      item.metadata?.runtime,
      item.metadata?.overallPromptWeight,
      (item.metadata?.tags || []).join(' | '),
      item.url,
      item.importedAt,
      item.extractedAt
    ].map(escape);
    rows.push(row.join(','));
  }

  const ts = new Date().toISOString().slice(0, 10);
  downloadFile(rows.join('\n'), `nightcafe-imports-${ts}.csv`, 'text/csv;charset=utf-8;');
}

function App() {
  const [imports, setImports] = useState([]);
  const [stats, setStats] = useState({ total: 0, withImage: 0, withPrompt: 0, withMultipleImages: 0, published: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeImage, setActiveImage] = useState(null); // for gallery carousel

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    try {
      const [importsRes, statsRes] = await Promise.all([
        fetch(`${API}/api/imports`),
        fetch(`${API}/api/imports/stats/summary`)
      ]);
      const importsData = await importsRes.json();
      const statsData = await statsRes.json();
      setImports(Array.isArray(importsData) ? importsData : []);
      setStats(statsData);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // When a creation is selected, reset active image
  useEffect(() => {
    if (selected) setActiveImage(selected.imageUrl || null);
  }, [selected]);

  const handleDelete = async (id) => {
    try {
      await fetch(`${API}/api/imports/${id}`, { method: 'DELETE' });
      setImports(prev => prev.filter(i => i.id !== id));
      setDeleteConfirm(null);
      if (selected?.id === id) setSelected(null);
      showToast('Import verwijderd');
    } catch {
      showToast('Verwijderen mislukt', 'error');
    }
  };

  const filtered = imports.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.title || '').toLowerCase().includes(q) ||
      (item.prompt || '').toLowerCase().includes(q) ||
      (item.revisedPrompt || '').toLowerCase().includes(q) ||
      (item.model || '').toLowerCase().includes(q) ||
      (item.creationId || '').toLowerCase().includes(q) ||
      (item.aspectRatio || '').toLowerCase().includes(q)
    );
  });

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('nl-NL', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  };

  const allGalleryImages = (item) => {
    if (!item) return [];
    const imgs = item.allImages?.length > 0 ? item.allImages : (item.imageUrl ? [item.imageUrl] : []);
    return [...new Set(imgs)]; // deduplicate
  };

  return (
    <div className="app" data-testid="app-container">

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`} data-testid="toast-message">
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="app-header" data-testid="app-header">
        <div className="header-brand">
          <div className="brand-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div>
            <h1 className="brand-title">NightCafe Studio</h1>
            <p className="brand-sub">Data Bridge &amp; Import Dashboard</p>
          </div>
        </div>
        <button className="refresh-btn" onClick={fetchData} title="Vernieuwen" data-testid="refresh-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </header>

      {/* Stats bar */}
      <div className="stats-bar" data-testid="stats-bar">
        {[
          { key: 'total', label: 'Totaal', value: stats.total },
          { key: 'withImage', label: 'Met afbeelding', value: stats.withImage },
          { key: 'withPrompt', label: 'Met prompt', value: stats.withPrompt },
          { key: 'withMultipleImages', label: 'Meerdere afb.', value: stats.withMultipleImages },
          { key: 'published', label: 'Gepubliceerd', value: stats.published },
        ].map(s => (
          <div className="stat-card" key={s.key} data-testid={`stat-${s.key}`}>
            <span className="stat-num">{s.value ?? 0}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="search-bar" data-testid="search-bar">
        <svg className="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="search-input"
          type="text"
          placeholder="Zoek op titel, prompt, model, aspect ratio..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="search-input"
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} data-testid="search-clear">&#x2715;</button>
        )}
      </div>

      {/* Main content */}
      <main className="main-content">
        {loading ? (
          <div className="empty-state" data-testid="loading-state">
            <div className="spinner-large"></div>
            <p>Imports laden...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" data-testid="empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </div>
            <h3>{search ? 'Geen resultaten' : 'Nog geen imports'}</h3>
            <p>{search ? `Geen creaties gevonden voor "${search}"` : 'Gebruik de browser extensie om NightCafe creaties te importeren'}</p>
          </div>
        ) : (
          <div className="gallery-grid" data-testid="gallery-grid">
            {filtered.map(item => (
              <article
                key={item.id}
                className={`creation-card ${selected?.id === item.id ? 'selected' : ''}`}
                onClick={() => setSelected(selected?.id === item.id ? null : item)}
                data-testid={`creation-card-${item.id}`}
              >
                <div className="card-image-wrap">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title || 'NightCafe'}
                      className="card-image"
                      loading="lazy"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="card-image-placeholder">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </div>
                  )}
                  <div className="card-badges">
                    {item.isPublished && <span className="badge-pub" title="Gepubliceerd">&#9679;</span>}
                    {(item.allImages?.length || 0) > 1 && (
                      <span className="badge-count">{item.allImages.length}</span>
                    )}
                  </div>
                </div>
                <div className="card-body">
                  <h3 className="card-title" title={item.title}>
                    {item.title || item.creationId || 'Naamloze creatie'}
                  </h3>
                  {item.prompt && (
                    <p className="card-prompt">{item.prompt.slice(0, 90)}{item.prompt.length > 90 ? '...' : ''}</p>
                  )}
                  <div className="card-meta">
                    {item.model && <span className="badge badge-model">{item.model.slice(0, 22)}</span>}
                    {item.aspectRatio && <span className="badge badge-ratio">{item.aspectRatio}</span>}
                    <span className="card-date">{formatDate(item.importedAt)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Detail panel */}
      {selected && (
        <div className="detail-overlay" onClick={() => setSelected(null)} data-testid="detail-overlay">
          <div className="detail-panel" onClick={e => e.stopPropagation()} data-testid="detail-panel">

            <div className="detail-header">
              <div className="detail-title-row">
                <h2 data-testid="detail-title">{selected.title || 'Naamloze creatie'}</h2>
                {selected.isPublished && (
                  <span className="pub-badge" data-testid="detail-published-badge">Gepubliceerd</span>
                )}
              </div>
              <button className="close-btn" onClick={() => setSelected(null)} data-testid="detail-close-btn">&#x2715;</button>
            </div>

            {/* Main image display */}
            {activeImage && (
              <div className="detail-image-wrap">
                <img
                  src={activeImage}
                  alt={selected.title}
                  className="detail-image"
                  data-testid="detail-image"
                  onError={e => { e.target.style.display = 'none'; }}
                />
                <a href={activeImage} target="_blank" rel="noopener noreferrer" className="image-link" data-testid="detail-image-link">
                  Origineel &#8599;
                </a>
              </div>
            )}

            {/* Thumbnail gallery strip */}
            {allGalleryImages(selected).length > 1 && (
              <div className="thumb-strip" data-testid="detail-thumb-strip">
                {allGalleryImages(selected).map((imgUrl, idx) => (
                  <button
                    key={idx}
                    className={`thumb-item ${activeImage === imgUrl ? 'active' : ''}`}
                    onClick={() => setActiveImage(imgUrl)}
                    data-testid={`thumb-item-${idx}`}
                    title={`Afbeelding ${idx + 1}`}
                  >
                    <img
                      src={imgUrl}
                      alt={`Thumbnail ${idx + 1}`}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  </button>
                ))}
              </div>
            )}

            <div className="detail-fields">

              {/* Prompts */}
              {selected.prompt && (
                <div className="detail-field" data-testid="detail-prompt">
                  <label>Text Prompt</label>
                  <p>{selected.prompt}</p>
                </div>
              )}
              {selected.metadata?.promptHidden && (
                <div className="detail-field">
                  <label>Text Prompt</label>
                  <p className="muted-text">Verborgen door de auteur</p>
                </div>
              )}
              {selected.revisedPrompt && (
                <div className="detail-field" data-testid="detail-revised-prompt">
                  <label>Revised Prompt</label>
                  <p>{selected.revisedPrompt}</p>
                </div>
              )}

              {/* Creation settings grid */}
              <div className="settings-grid">
                {selected.model && (
                  <div className="setting-item" data-testid="detail-model">
                    <label>Model</label>
                    <span>{selected.model}</span>
                  </div>
                )}
                {selected.initialResolution && (
                  <div className="setting-item" data-testid="detail-resolution">
                    <label>Initial Resolution</label>
                    <span>{selected.initialResolution}</span>
                  </div>
                )}
                {selected.aspectRatio && (
                  <div className="setting-item" data-testid="detail-aspect-ratio">
                    <label>Aspect Ratio</label>
                    <span>{selected.aspectRatio}</span>
                  </div>
                )}
                {selected.seed && (
                  <div className="setting-item" data-testid="detail-seed">
                    <label>Seed</label>
                    <span className="mono-small">{selected.seed}</span>
                  </div>
                )}
                {selected.metadata?.samplingMethod && (
                  <div className="setting-item" data-testid="detail-sampling">
                    <label>Sampling Method</label>
                    <span>{selected.metadata.samplingMethod}</span>
                  </div>
                )}
                {selected.metadata?.runtime && (
                  <div className="setting-item" data-testid="detail-runtime">
                    <label>Runtime</label>
                    <span>{selected.metadata.runtime}</span>
                  </div>
                )}
                {selected.metadata?.overallPromptWeight && (
                  <div className="setting-item" data-testid="detail-prompt-weight">
                    <label>Prompt Weight</label>
                    <span>{selected.metadata.overallPromptWeight}</span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {selected.metadata?.tags?.length > 0 && (
                <div className="detail-field" data-testid="detail-tags">
                  <label>Tags</label>
                  <div className="tags-row">
                    {selected.metadata.tags.map(tag => (
                      <span key={tag} className="tag-pill">{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Source URL */}
              <div className="detail-field" data-testid="detail-url">
                <label>NightCafe URL</label>
                <a href={selected.url} target="_blank" rel="noopener noreferrer" className="detail-link">
                  {selected.url}
                </a>
              </div>

              {/* Creation ID */}
              {selected.creationId && (
                <div className="detail-field" data-testid="detail-creation-id">
                  <label>Creation ID</label>
                  <span className="mono-small">{selected.creationId}</span>
                </div>
              )}

              {/* Import time */}
              <div className="detail-field" data-testid="detail-imported-at">
                <label>Geimporteerd op</label>
                <p>{formatDate(selected.importedAt)}</p>
              </div>

              {/* Images count */}
              {(selected.allImages?.length || 0) > 1 && (
                <div className="detail-field" data-testid="detail-images-count">
                  <label>Afbeeldingen</label>
                  <p>{selected.allImages.length} varianten geimporteerd</p>
                </div>
              )}

            </div>

            <div className="detail-actions">
              <a href={selected.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline" data-testid="detail-open-btn">
                Openen op NightCafe &#8599;
              </a>
              {deleteConfirm === selected.id ? (
                <div className="delete-confirm">
                  <span>Zeker weten?</span>
                  <button className="btn btn-danger" onClick={() => handleDelete(selected.id)} data-testid="confirm-delete-btn">Verwijder</button>
                  <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} data-testid="cancel-delete-btn">Annuleer</button>
                </div>
              ) : (
                <button className="btn btn-danger-ghost" onClick={() => setDeleteConfirm(selected.id)} data-testid="delete-btn">
                  Verwijder
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
