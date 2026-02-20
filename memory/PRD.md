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
Local App (localhost:3000)
  └── FastAPI Backend (server.py)    ← ontvangt imports
  └── MongoDB                         ← slaat op
  └── React Frontend (App.js)        ← gallery dashboard
```

## Geïmplementeerd (Feb 2026)

### Browser Extensie (`/app/extension/`)
- **Manifest V3** – Chrome + Firefox 128+
- **Content script** (`content.js`) – injectie op alle NightCafe pagina's
  - Floating "Importeer" knop (rechtsonder, toggle aan/uit)
  - Toast notificaties (success/error)
  - Async data extractie
- **Popup** (`popup.html/js/css`) – extensie menu
  - Configureerbare endpoint URL (opgeslagen in storage)
  - Test Verbinding knop → GET `/api/import/health`
  - Toggle pagina-knop (aan/uit)
  - Importeer knop (stuurt data naar endpoint)
- **Service Worker** (`background.js`) – NC badge op toolbar

### Data Extractie (content.js)
Geëxtraheerde velden:
| Veld | Bron |
|------|------|
| `title` | `<h1>` element |
| `prompt` | "Text Prompts" label in Creation Settings |
| `revisedPrompt` | "Revised Prompt" label |
| `model` | Link naar `/model/` pagina |
| `initialResolution` | "Initial Resolution" label |
| `aspectRatio` | "Aspect Ratio" label |
| `seed` | "Seed" label |
| `isPublished` | "Unpublish" knop aanwezig → gepubliceerd |
| `imageUrl` | mdi-icon met color `#e64d6a` → nearest img |
| `allImages` | `[data-thumb-gallery]` → click & capture |
| `metadata` | samplingMethod, runtime, promptWeight, tags |

Extractie volgorde:
1. `<h1>` / meta-tags
2. TreeWalker label→value in "Creation Settings" sectie
3. DOM fallbacks
4. JSON-LD structured data

### Backend (`/app/backend/server.py`)
Endpoints:
- `GET /api/import/health` – verbindingstest
- `POST /api/import` – ontvang creatie (met duplicate-detectie op creationId)
- `GET /api/imports` – lijst alle imports (gesorteerd op datum)
- `GET /api/imports/stats/summary` – statistieken (5 velden)
- `GET /api/imports/{id}` – enkel import
- `DELETE /api/imports/{id}` – verwijder import

### React Frontend (`/app/frontend/src/`)
- Gallery dashboard met statistieken (Totaal, Met afbeelding, Met prompt, Meerdere afb., Gepubliceerd)
- Zoekfunctie (titel, prompt, model, aspectRatio)
- Detail panel (slideIn van rechts):
  - Thumbnail strip voor meerdere afbeeldingen
  - "GEPUBLICEERD" badge
  - Settings grid (Model, Resolution, Aspect Ratio, Seed, Sampling, Runtime)
  - Tags weergave
  - Verwijder met bevestiging

## Prioriteiten Backlog

### P0 (gedaan)
- [x] Extensie met popup (test, toggle, importeer)
- [x] Content script met floating knop
- [x] Data extractie (h1, prompts, model, resolution, AR, seed, published)
- [x] Gallery extractie via data-thumb-gallery
- [x] Main image via mdi #e64d6a
- [x] Backend ontvanger met alle velden
- [x] Dashboard frontend
- [x] Auto-mapping: prompt → `prompts` collectie, imageUrl → `gallery_items.image_url`, `prompt_id` koppeling
- [x] gallery_items schema matcht app-schema: title, image_url, prompt_used, prompt_id, character_id, rating, collection_id

### P1 (next steps)
- [ ] Meerdere creaties tegelijk importeren (list-pagina support)
- [ ] Exporteren naar JSON/CSV vanuit dashboard
- [ ] Extensie packagen als .zip voor permanente Firefox installatie
- [ ] Auto-sync optie (periodiek alle nieuwe creaties importeren)

### P2 (toekomst)
- [ ] Zoekopdrachten & filters (op model, datum, gepubliceerd)
- [ ] Collections/mappen in dashboard
- [ ] Afbeeldingen lokaal downloaden en opslaan
- [ ] Webhook support voor externe apps

## Installatie

### Extensie (Chrome)
1. `python /app/extension/generate_icons.py` (als icons nog niet bestaan)
2. `chrome://extensions/` → Developer mode → Load unpacked → `/app/extension/`

### Extensie (Firefox)
1. `about:debugging` → Load Temporary Add-on → `/app/extension/manifest.json`

### Lokale app (endpoint)
- Backend draait op poort 8001 (via supervisor)
- Frontend dashboard: `https://creation-gallery-1.preview.emergentagent.com`
- Extensie endpoint instelling: `http://localhost:3000` (of jouw app URL)
