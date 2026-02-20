# PRD – NightCafe Studio Importer

## Probleem
Een browser extensie die op NightCafe.studio draait en in de browser-context (ingelogd als gebruiker) data extraheert en doorstuurt naar een lokale endpoint (`localhost:3000/api/import`). Hiermee wordt het auth-probleem omzeild omdat de extensie toegang heeft tot de geauthenticeerde pagina.

## Architectuur

```
Browser (NightCafe.studio)
  └── Extension (content.js)         ← injectie in NightCafe pagina
        ↕ chrome.runtime.onMessage
  └── Extension Popup (popup.js)     ← test, toggle, importeer
        ↕ fetch POST /api/import
  └── Background (background.js)     ← bulk import tab management
Local App (localhost:3000)
  └── FastAPI Backend (server.py)    ← ontvangt imports
  └── MongoDB                         ← slaat op
  └── React Frontend (App.js)        ← gallery dashboard
```

## Database Schema (matcht db-init.js)

### prompts collectie
| Veld | Type | Default |
|------|------|---------|
| id | UUID | auto |
| user_id | UUID | null |
| title | TEXT | null |
| content | TEXT | null (prompt tekst) |
| notes | TEXT | null |
| rating | NUMERIC(3,1) | 0 |
| is_favorite | BOOLEAN | false |
| is_template | BOOLEAN | false |
| created_at | TIMESTAMP | now() |
| updated_at | TIMESTAMP | now() |
| model | TEXT | null |
| category | TEXT | null |
| revised_prompt | TEXT | null |
| seed | INTEGER | null |
| aspect_ratio | TEXT | null |
| use_custom_aspect_ratio | BOOLEAN | false |
| gallery_item_id | UUID | null |
| use_count | INTEGER | 0 |
| last_used_at | TIMESTAMP | null |
| suggested_model | TEXT | null |

### gallery_items collectie
| Veld | Type | Default |
|------|------|---------|
| id | UUID | auto |
| user_id | UUID | null |
| title | TEXT | null |
| image_url | TEXT | null |
| prompt_used | TEXT | null |
| model_used | TEXT | null |
| notes | TEXT | null |
| is_favorite | BOOLEAN | false |
| aspect_ratio | TEXT | null |
| use_custom_aspect_ratio | BOOLEAN | false |
| start_image | TEXT | null |
| created_at | TIMESTAMP | now() |
| updated_at | TIMESTAMP | now() |
| prompt_id | UUID | null |
| rating | NUMERIC(3,1) | 0 |
| model | TEXT | null |
| local_path | TEXT | null |
| metadata | JSONB | {} |
| width | INTEGER | null |
| height | INTEGER | null |
| character_id | UUID | null |
| collection_id | UUID | null |
| media_type | TEXT | 'image' |
| video_url | TEXT | null |
| video_local_path | TEXT | null |
| thumbnail_url | TEXT | null |
| duration_seconds | INTEGER | null |
| storage_mode | TEXT | 'url' |

### NightCafe data in metadata JSONB
- source, source_url, nightcafe_creation_id
- all_images, is_published, video_prompt, revised_prompt
- initial_resolution, sampling_method, runtime, extracted_at, tags

## Voltooid (Feb 2026)

### Browser Extensie
- [x] Manifest V3 – Chrome + Firefox 128+
- [x] Content script met floating knop + toast
- [x] Popup met test verbinding, toggle, importeer
- [x] Published status detectie via "Unpublish" knop
- [x] "Al geïmporteerd" status check
- [x] **Bulk Import (lijst-pagina support)**
  - Automatische detectie van profiel/lijst-pagina's
  - "Importeer Alles" knop met aantal creaties
  - Background script opent elke creatie in achtergrond-tab
  - Volledige data extractie per creatie
  - Duplicate check (overslaat al geïmporteerde items)
  - Real-time voortgangsoverlay met stats en logboek
  - Popup bulk import modus

### Data Extractie
- [x] Title, prompt, revised prompt, video prompt, start image
- [x] Model, initial resolution, aspect ratio, seed
- [x] Published state, gallery images, metadata

### Backend
- [x] POST /api/import – ontvang en sla op (duplicate detectie)
- [x] GET /api/import/status – check import status
- [x] GET /api/import/health – verbindingstest
- [x] GET /api/gallery-items – lijst items
- [x] GET /api/gallery-items/{id} – detail met _prompt
- [x] GET /api/gallery-items/stats/summary – statistieken
- [x] DELETE /api/gallery-items/{id} – verwijder item + prompt
- [x] GET /api/prompts – lijst prompts

### Frontend Dashboard
- [x] Gallery met statistieken
- [x] Zoekfunctie
- [x] Detail panel met alle velden
- [x] "Gepubliceerd" tekst-badge
- [x] Export JSON/CSV
- [x] Verwijder met bevestiging

### Schema Update
- [x] Database schema afgestemd op db-init.js
- [x] Veldnamen hernoemd (text→content, start_image_url→start_image, etc.)
- [x] NightCafe-specifieke data in metadata JSONB
- [x] Frontend gesynchroniseerd

## Backlog

### P1
- [ ] Extensie packagen als .zip voor permanente Firefox installatie
- [ ] Auto-sync optie (periodiek nieuwe creaties importeren)

### P2
- [ ] Zoekopdrachten & filters (op model, datum, gepubliceerd)
- [ ] Collections/mappen in dashboard
- [ ] Afbeeldingen lokaal downloaden en opslaan
- [ ] Webhook support voor externe apps
