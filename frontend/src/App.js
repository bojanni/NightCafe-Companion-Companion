import React, { useEffect, useState, useCallback } from 'react';
import './App.css';

const API = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [imports, setImports] = useState([]);
  const [stats, setStats] = useState({ total: 0, withImage: 0, withPrompt: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);

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
      (item.model || '').toLowerCase().includes(q) ||
      (item.creationId || '').toLowerCase().includes(q)
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
        <div className="stat-card" data-testid="stat-total">
          <span className="stat-num">{stats.total}</span>
          <span className="stat-label">Totaal</span>
        </div>
        <div className="stat-card" data-testid="stat-with-image">
          <span className="stat-num">{stats.withImage}</span>
          <span className="stat-label">Met afbeelding</span>
        </div>
        <div className="stat-card" data-testid="stat-with-prompt">
          <span className="stat-num">{stats.withPrompt}</span>
          <span className="stat-label">Met prompt</span>
        </div>
      </div>

      {/* Search */}
      <div className="search-bar" data-testid="search-bar">
        <div className="search-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <input
          className="search-input"
          type="text"
          placeholder="Zoek op titel, prompt, model..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="search-input"
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} data-testid="search-clear">
            &#x2715;
          </button>
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
            <h3>{search ? 'Geen resultaten gevonden' : 'Nog geen imports'}</h3>
            <p>
              {search
                ? `Geen creaties gevonden voor "${search}"`
                : 'Gebruik de browser extensie om NightCafe creaties te importeren'}
            </p>
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
                {/* Image */}
                <div className="card-image-wrap">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title || 'NightCafe creatie'}
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
                  <div className="card-overlay">
                    <span className="card-source">{item.source || 'NightCafe'}</span>
                  </div>
                </div>

                {/* Info */}
                <div className="card-body">
                  <h3 className="card-title" title={item.title}>
                    {item.title || item.creationId || 'Naamloze creatie'}
                  </h3>
                  {item.prompt && (
                    <p className="card-prompt">
                      {item.prompt.slice(0, 100)}{item.prompt.length > 100 ? '...' : ''}
                    </p>
                  )}
                  <div className="card-meta">
                    {item.model && <span className="badge badge-model">{item.model.slice(0, 20)}</span>}
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
              <h2 data-testid="detail-title">{selected.title || 'Naamloze creatie'}</h2>
              <button className="close-btn" onClick={() => setSelected(null)} data-testid="detail-close-btn">
                &#x2715;
              </button>
            </div>

            {selected.imageUrl && (
              <div className="detail-image-wrap">
                <img src={selected.imageUrl} alt={selected.title} className="detail-image" data-testid="detail-image"/>
                <a href={selected.imageUrl} target="_blank" rel="noopener noreferrer" className="image-link" data-testid="detail-image-link">
                  Origineel openen &#8599;
                </a>
              </div>
            )}

            <div className="detail-fields">
              {selected.prompt && (
                <div className="detail-field" data-testid="detail-prompt">
                  <label>Prompt</label>
                  <p>{selected.prompt}</p>
                </div>
              )}
              {selected.model && (
                <div className="detail-field" data-testid="detail-model">
                  <label>Model</label>
                  <p>{selected.model}</p>
                </div>
              )}
              {selected.creationId && (
                <div className="detail-field" data-testid="detail-creation-id">
                  <label>Creation ID</label>
                  <p className="mono">{selected.creationId}</p>
                </div>
              )}
              <div className="detail-field" data-testid="detail-url">
                <label>URL</label>
                <a href={selected.url} target="_blank" rel="noopener noreferrer" className="detail-link">
                  {selected.url}
                </a>
              </div>
              <div className="detail-field" data-testid="detail-imported-at">
                <label>Geimporteerd op</label>
                <p>{formatDate(selected.importedAt)}</p>
              </div>
              {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                <div className="detail-field" data-testid="detail-metadata">
                  <label>Metadata</label>
                  <pre className="mono small">{JSON.stringify(selected.metadata, null, 2)}</pre>
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
                  <button className="btn btn-danger" onClick={() => handleDelete(selected.id)} data-testid="confirm-delete-btn">
                    Verwijder
                  </button>
                  <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)} data-testid="cancel-delete-btn">
                    Annuleer
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-danger-ghost"
                  onClick={() => setDeleteConfirm(selected.id)}
                  data-testid="delete-btn"
                >
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
