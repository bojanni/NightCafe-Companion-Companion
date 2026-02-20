# PRD – NightCafe Studio Importer

## Probleem
Een browser extensie die op NightCafe.studio draait en in de browser-context (ingelogd als gebruiker) data extraheert en doorstuurt naar een lokale endpoint (`localhost:3000/api/import`). Hiermee wordt het auth-probleem omzeild.

## Architectuur
```
Browser (NightCafe.studio)
  └── Extension (content.js)         ← injectie, bulk knop, auto-scroll
        ↕ chrome.runtime.onMessage
  └── Extension Popup (popup.js)     ← test, toggle, importeer, bulk
        ↕ fetch POST /api/import
  └── Background (background.js)     ← bulk import tab management
Local App (localhost:3000)
  └── FastAPI Backend (server.py)    ← imports, downloads, gallery
  └── MongoDB                         ← prompts + gallery_items collecties
  └── React Frontend (App.js)        ← dashboard met download support
  └── /backend/downloads/             ← lokaal opgeslagen afbeeldingen
```

## Database Schema (matcht db-init.js)

### prompts: id, user_id, title, content, notes, rating, is_favorite, is_template, created_at, updated_at, model, category, revised_prompt, seed(int), aspect_ratio, use_custom_aspect_ratio, gallery_item_id, use_count, last_used_at, suggested_model

### gallery_items: id, user_id, title, image_url, prompt_used, model_used, notes, is_favorite, aspect_ratio, use_custom_aspect_ratio, start_image, created_at, updated_at, prompt_id, rating, model, local_path, metadata(JSONB), width, height, character_id, collection_id, media_type, video_url, video_local_path, thumbnail_url, duration_seconds, storage_mode

### NightCafe metadata JSONB: source, source_url, nightcafe_creation_id, all_images, is_published, video_prompt, revised_prompt, initial_resolution, sampling_method, runtime, extracted_at, tags, local_images

## Voltooid (Feb 2026)
- [x] Browser extensie (MV3, Chrome + Firefox 128+)
- [x] Content script met floating knop + toast
- [x] Popup met test verbinding, toggle, importeer
- [x] Data extractie (alle NightCafe velden)
- [x] Published status detectie + "Gepubliceerd" tekst-badge
- [x] "Al geïmporteerd" status check
- [x] Bulk Import (lijst-pagina) met auto-scroll voor infinite scroll
- [x] Background script tab management voor volledige extractie
- [x] Voortgangsoverlay met stats en logboek
- [x] Popup bulk import modus
- [x] Database schema afgestemd op db-init.js
- [x] Lokaal downloaden en opslaan van afbeeldingen
- [x] Download per item + bulk download
- [x] Static file serving voor lokale bestanden
- [x] Storage status badges (Alleen URL / Lokaal + URL)
- [x] JSON/CSV export
- [x] Dashboard met statistieken, zoeken, detail panel

## API Endpoints
- POST /api/import – importeer creatie
- GET /api/import/status?creationId=X – check import status
- GET /api/import/health – verbindingstest
- GET /api/gallery-items – lijst items
- GET /api/gallery-items/{id} – detail met _prompt
- GET /api/gallery-items/stats/summary – statistieken
- DELETE /api/gallery-items/{id} – verwijder
- POST /api/gallery-items/{id}/download – download afbeeldingen lokaal
- GET /api/gallery-items/download/stats – download statistieken
- GET /api/downloads/{id}/{file} – serve lokale bestanden
- GET /api/prompts – lijst prompts
- GET /api/export/json, /api/export/csv – export

## Backlog

### P1
- [ ] Extensie packagen als .zip
- [ ] Auto-sync optie

### P2
- [ ] Zoekopdrachten & filters (model, datum, gepubliceerd)
- [ ] Collections/mappen in dashboard
- [ ] Webhook support voor externe apps
