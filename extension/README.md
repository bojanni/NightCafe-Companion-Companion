# NightCafe Studio Importer – Browser Extension

Importeer je NightCafe creaties (afbeeldingen, prompts, metadata) direct naar je lokale app via een browser extensie.

## Functionaliteiten

- **Popup menu** met:
  - Test Verbinding knop (controleert lokale endpoint)
  - Aan/Uit toggle voor de pagina-knop
  - Importeer knop (importeert huidige NightCafe pagina)
  - Configureerbare endpoint URL
- **Zwevende knop** op NightCafe pagina's (aan/uit schakelbaar)
- Werkt in de browser-context dus volledig ingelogd als gebruiker
- Stuurt data als JSON naar `localhost:3000/api/import`

## Installatie

### Vereisten
- Python 3 + Pillow (voor icon-generatie)
  ```bash
  pip install Pillow
  python generate_icons.py
  ```

### Chrome
1. Open Chrome en ga naar `chrome://extensions/`
2. Schakel **Developer mode** in (rechtsboven)
3. Klik op **Load unpacked**
4. Selecteer de map `/app/extension/`
5. De extensie verschijnt in de toolbar

### Firefox
1. Open Firefox en ga naar `about:debugging#/runtime/this-firefox`
2. Klik op **Load Temporary Add-on...**
3. Selecteer het bestand `/app/extension/manifest.json`
4. De extensie is geladen (tijdelijk, tot Firefox herstart)

> **Permanent in Firefox**: De extensie als `.zip` verpakken en via `about:addons` laden als unsigned extensie (vereist Firefox Developer Edition of `xpinstall.signatures.required = false` in `about:config`).

## Gebruik

1. Ga naar [creator.nightcafe.studio](https://creator.nightcafe.studio)
2. Open een creatie-pagina (URL: `.../creation/[id]`)
3. Klik op het extensie-icoontje in de toolbar
4. Configureer de endpoint URL (standaard: `http://localhost:3000`)
5. Klik **Test Verbinding** om de verbinding te controleren
6. Klik **Importeer Nu** om de creatie te importeren

OF gebruik de **zwevende knop** rechtsonder op de pagina.

## Data formaat (JSON naar /api/import)

```json
{
  "source": "NightCafe Studio",
  "url": "https://creator.nightcafe.studio/creation/...",
  "creationId": "abc123",
  "title": "Titel van de creatie",
  "prompt": "De prompt tekst...",
  "imageUrl": "https://images.nightcafe.studio/...",
  "model": "Flux / SDXL / DALL-E",
  "style": null,
  "metadata": {
    "author": "username",
    "dateCreated": "2024-01-01",
    "pageTitle": "Volledige paginatitel"
  },
  "extractedAt": "2024-01-01T12:00:00.000Z"
}
```

## Endpoint vereisten (jouw lokale app)

Jouw app moet de volgende endpoints implementeren:

| Method | Path | Beschrijving |
|--------|------|-------------|
| POST | `/api/import` | Ontvang een creatie-import |
| GET | `/api/import/health` | Health check voor verbindingstest |

## Mapstructuur

```
extension/
├── manifest.json       # MV3 manifest (Chrome + Firefox 128+)
├── popup.html          # Popup UI
├── popup.css           # Popup stijlen
├── popup.js            # Popup logica
├── content.js          # Content script (NightCafe pagina's)
├── content.css         # Stijlen voor zwevende knop
├── background.js       # Service worker
├── generate_icons.py   # Icoon generator script
├── icons/              # PNG iconen (gegenereerd)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Ontwikkeling

Na wijzigingen:
- **Chrome**: Klik op de refresh-knop bij de extensie in `chrome://extensions/`
- **Firefox**: Klik **Reload** in `about:debugging`

## Problemen oplossen

| Probleem | Oplossing |
|----------|-----------|
| "Geen verbinding" | Controleer of je lokale app draait op poort 3000 |
| "Geen data gevonden" | Ga naar een specifieke creatie-pagina (`.../creation/[id]`) |
| Popup toont niets | Genereer eerst de iconen met `python generate_icons.py` |
| Firefox laadt niet | Controleer of Firefox versie 128+ is |
