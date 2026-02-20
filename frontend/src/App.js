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
    'id', 'title', 'prompt_used', 'model', 'aspect_ratio',
    'media_type', 'start_image', 'image_url', 'allImagesCount',
    'nightcafe_creation_id', 'source_url', 'created_at',
    'is_published', 'rating', 'is_favorite'
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
      item.title,
      item.prompt_used,
      item.model,
      item.aspect_ratio,
      item.media_type,
      item.start_image,
      item.image_url,
      (item.metadata?.all_images || []).length,
      item.metadata?.nightcafe_creation_id,
      item.metadata?.source_url,
      item.created_at,
      item.metadata?.is_published ? 'ja' : 'nee',
      item.rating,
      item.is_favorite ? 'ja' : 'nee'
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
  const [activeImage, setActiveImage] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [downloading, setDownloading] = useState(null); // item_id of 'all'
  const [dlStats, setDlStats] = useState({ total: 0, local: 0, pending: 0 });
  const exportRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = useCallback(async () => {
    try {
      const [importsRes, statsRes, dlStatsRes] = await Promise.all([
        fetch(`${API}/api/gallery-items`),
        fetch(`${API}/api/gallery-items/stats/summary`),
        fetch(`${API}/api/gallery-items/download/stats`)
      ]);
      const importsData = await importsRes.json();
      const statsData = await statsRes.json();
      const dlStatsData = await dlStatsRes.json();
      setImports(Array.isArray(importsData) ? importsData : []);
      setStats(statsData);
      setDlStats(dlStatsData);
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

  // When a creation is selected, fetch full detail (incl. _prompt) and reset active image
  useEffect(() => {
    if (!selected) return;
    setActiveImage(selected.image_url || null);
    // Fetch full detail with linked prompt data
    fetch(`${API}/api/gallery-items/${selected.id}`)
      .then(r => r.json())
      .then(full => {
        setSelected(prev => prev?.id === full.id ? full : prev);
        setActiveImage(full.image_url || null);
      })
      .catch(() => {});
  }, [selected?.id]); // eslint-disable-line

  const handleDelete = async (id) => {
    try {
      await fetch(`${API}/api/gallery-items/${id}`, { method: 'DELETE' });
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
      (item.prompt_used || '').toLowerCase().includes(q) ||
      (item._prompt?.revised_prompt || '').toLowerCase().includes(q) ||
      (item.metadata?.video_prompt || '').toLowerCase().includes(q) ||
      (item.metadata?.nightcafe_creation_id || '').toLowerCase().includes(q) ||
      (item.aspect_ratio || '').toLowerCase().includes(q)
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
    const allImgs = item.metadata?.all_images;
    const imgs = allImgs?.length > 0 ? allImgs : (item.image_url ? [item.image_url] : []);
    return [...new Set(imgs)];
  };

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleExport = (format) => {
    const data = filtered.length > 0 ? filtered : imports;
    if (data.length === 0) { showToast('Geen data om te exporteren', 'error'); return; }
    if (format === 'json') {
      exportAsJSON(data);
      showToast(`${data.length} imports geëxporteerd als JSON`);
    } else {
      exportAsCSV(data);
      showToast(`${data.length} imports geëxporteerd als CSV`);
    }
    setExportOpen(false);
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
        <div className="header-actions">
          {/* Export dropdown */}
          <div className="export-dropdown" ref={exportRef}>
            <button
              className="btn-export"
              onClick={() => setExportOpen(o => !o)}
              disabled={imports.length === 0}
              data-testid="export-dropdown-btn"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Exporteer
              {search && filtered.length < imports.length && (
                <span className="export-count">{filtered.length}</span>
              )}
              <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {exportOpen && (
              <div className="export-menu" data-testid="export-menu">
                <button
                  className="export-option"
                  onClick={() => handleExport('json')}
                  data-testid="export-json-btn"
                >
                  <span className="export-format">JSON</span>
                  <span className="export-desc">Volledig formaat</span>
                </button>
                <button
                  className="export-option"
                  onClick={() => handleExport('csv')}
                  data-testid="export-csv-btn"
                >
                  <span className="export-format">CSV</span>
                  <span className="export-desc">Excel-compatibel</span>
                </button>
              </div>
            )}
          </div>

          <button className="refresh-btn" onClick={fetchData} title="Vernieuwen" data-testid="refresh-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
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
                  {item.image_url ? (
                    <img
                      src={item.image_url}
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
                    {item.metadata?.is_published && <span className="badge-published">Gepubliceerd</span>}
                    {item.media_type === 'video' && <span className="badge-video">VIDEO</span>}
                    {(item.metadata?.all_images?.length || 0) > 1 && (
                      <span className="badge-count">{item.metadata.all_images.length}</span>
                    )}
                  </div>
                </div>
                <div className="card-body">
                  <h3 className="card-title" title={item.title}>
                    {item.title || item.metadata?.nightcafe_creation_id || 'Naamloze creatie'}
                  </h3>
                  {item.prompt_used && (
                    <p className="card-prompt">{item.prompt_used.slice(0, 90)}{item.prompt_used.length > 90 ? '...' : ''}</p>
                  )}
                  <div className="card-meta">
                    {item.aspect_ratio && <span className="badge badge-ratio">{item.aspect_ratio}</span>}
                    <span className="card-date">{formatDate(item.created_at)}</span>
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
                {selected.metadata?.is_published && (
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

              {/* Type badge */}
              {selected.media_type === 'video' && (
                <div className="type-badge-row" data-testid="detail-creation-type">
                  <span className="type-badge type-video">VIDEO</span>
                </div>
              )}

              {/* Prompt ID koppeling */}
              {selected.prompt_id && (
                <div className="prompt-id-row" data-testid="detail-prompt-id-row">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  <span>prompt_id: <code>{selected.prompt_id.slice(0, 16)}…</code></span>
                </div>
              )}

              {/* Text Prompt */}
              {selected.prompt_used && selected.media_type !== 'video' && (
                <div className="detail-field" data-testid="detail-prompt">
                  <label>Text Prompt</label>
                  <p>{selected.prompt_used}</p>
                </div>
              )}
              {selected.metadata?.promptHidden && (
                <div className="detail-field">
                  <label>Text Prompt</label>
                  <p className="muted-text">Verborgen door de auteur</p>
                </div>
              )}
              {/* Video Prompt */}
              {selected.metadata?.video_prompt && (
                <div className="detail-field" data-testid="detail-video-prompt">
                  <label>Video Prompt</label>
                  <p>{selected.metadata.video_prompt}</p>
                </div>
              )}
              {selected.media_type === 'video' && !selected.metadata?.video_prompt && selected.prompt_used && (
                <div className="detail-field" data-testid="detail-prompt">
                  <label>Prompt</label>
                  <p>{selected.prompt_used}</p>
                </div>
              )}
              {/* Revised Prompt */}
              {selected._prompt?.revised_prompt && (
                <div className="detail-field" data-testid="detail-revised-prompt">
                  <label>Revised Prompt</label>
                  <p>{selected._prompt.revised_prompt}</p>
                </div>
              )}

              {/* Start Image */}
              {selected.start_image && (
                <div className="detail-field" data-testid="detail-start-image">
                  <label>Start Image</label>
                  <div className="start-image-wrap">
                    <img src={selected.start_image} alt="Start Image" className="start-image"
                         onError={e => { e.target.style.display='none'; }}/>
                    <a href={selected.start_image} target="_blank" rel="noopener noreferrer"
                       className="start-image-link" data-testid="detail-start-image-link">Origineel &#8599;</a>
                  </div>
                </div>
              )}

              {/* Settings grid – velden uit de prompts tabel */}
              <div className="settings-grid">
                {(selected._prompt?.model || selected.model) && (
                  <div className="setting-item" data-testid="detail-model">
                    <label>Model</label>
                    <span>{selected._prompt?.model || selected.model}</span>
                  </div>
                )}
                {selected.metadata?.initial_resolution && (
                  <div className="setting-item" data-testid="detail-resolution">
                    <label>Initial Resolution</label>
                    <span>{selected.metadata.initial_resolution}</span>
                  </div>
                )}
                {(selected._prompt?.aspect_ratio || selected.aspect_ratio) && (
                  <div className="setting-item" data-testid="detail-aspect-ratio">
                    <label>Aspect Ratio</label>
                    <span>{selected._prompt?.aspect_ratio || selected.aspect_ratio}</span>
                  </div>
                )}
                {(selected._prompt?.seed != null) && (
                  <div className="setting-item" data-testid="detail-seed">
                    <label>Seed</label>
                    <span className="mono-small">{selected._prompt.seed}</span>
                  </div>
                )}
                {selected.metadata?.sampling_method && (
                  <div className="setting-item" data-testid="detail-sampling">
                    <label>Sampling Method</label>
                    <span>{selected.metadata.sampling_method}</span>
                  </div>
                )}
                {selected.metadata?.runtime && (
                  <div className="setting-item" data-testid="detail-runtime">
                    <label>Runtime</label>
                    <span>{selected.metadata.runtime}</span>
                  </div>
                )}
                {selected.metadata?.duration && (
                  <div className="setting-item" data-testid="detail-duration">
                    <label>Duratie</label>
                    <span>{selected.metadata.duration}</span>
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

              {/* App-schema velden */}
              <div className="settings-grid">
                <div className="setting-item" data-testid="detail-character-id">
                  <label>character_id</label>
                  <span className="muted-text">{selected.character_id || '—'}</span>
                </div>
                <div className="setting-item" data-testid="detail-rating">
                  <label>rating</label>
                  <span className="muted-text">{selected.rating ?? '—'}</span>
                </div>
                <div className="setting-item" data-testid="detail-collection-id">
                  <label>collection_id</label>
                  <span className="muted-text">{selected.collection_id || '—'}</span>
                </div>
              </div>

              {/* Source */}
              <div className="detail-field" data-testid="detail-url">
                <label>NightCafe URL</label>
                <a href={selected.metadata?.source_url} target="_blank" rel="noopener noreferrer" className="detail-link">
                  {selected.metadata?.source_url}
                </a>
              </div>
              {selected.metadata?.nightcafe_creation_id && (
                <div className="detail-field" data-testid="detail-creation-id">
                  <label>Creation ID</label>
                  <span className="mono-small">{selected.metadata.nightcafe_creation_id}</span>
                </div>
              )}
              <div className="detail-field" data-testid="detail-imported-at">
                <label>Geïmporteerd op</label>
                <p>{formatDate(selected.created_at)}</p>
              </div>
              {(selected.metadata?.all_images?.length || 0) > 1 && (
                <div className="detail-field" data-testid="detail-images-count">
                  <label>Afbeeldingen</label>
                  <p>{selected.metadata.all_images.length} varianten</p>
                </div>
              )}

            </div>

            <div className="detail-actions">
              <a href={selected.metadata?.source_url} target="_blank" rel="noopener noreferrer" className="btn btn-outline" data-testid="detail-open-btn">
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
