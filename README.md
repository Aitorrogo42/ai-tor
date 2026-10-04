# AI-TOR

An installable personal-life app (PWA). Plain HTML/CSS/JS: **no build step, no CDNs, no analytics, no backend, no accounts, no external requests.**

**Local-first:** every person who installs AI-TOR enters *their own* data. It is stored only in that device's browser storage (`localStorage`), never sent anywhere, and the app works fully offline once opened. **The app bundle contains no personal data**: only code, icons, and clearly-fake example data.

Today: **Finances** (accounts, debts, income/expenses, goals, notes, dashboard) and **Travels** (tick the countries you have visited out of a bundled offline list of 195, with search, per-continent counts, and optional year(s)/note per country). The home screen is a registry of sections, so more can be added later.

## Using it
1. Open the hosted URL, add to home screen (iPhone: Share → *Add to Home Screen*; Android: ⋮ → *Install app*).
2. Home → ⚙️ **Settings**: set your name and display currency (USD default; display only, nothing is converted).
3. Home → **Finances** → **Add your finances** (or **Load example data**, which is fake numbers for previewing).
4. Back up with **Settings → Export data**. Restore on any device with **Import data** (validates the file and asks before overwriting). **Erase all data** wipes everything on the device.

Clearing site data / uninstalling removes your data, so export a backup now and then.

## Run locally
```
cd ai-tor && python3 -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765/
```
(Service workers/installation need HTTPS or localhost; `file://` won't work.)

## Structure
```
index.html, manifest.webmanifest, sw.js
css/app.css                  shell + form/dialog styles (dark theme)
js/app.js                    hash router, home screen (greeting, ⚙️)
js/sections.js               SECTION REGISTRY (id, title, icon, route, loader)
js/storage.js                namespaced localStorage (core + one key per section)
js/dataio.js                 export / validate / import of the whole app
js/settings.js               Settings screen
js/ui.js, js/util.js         confirm dialog, toast, DOM + currency + date helpers
sections/travels/
  index.js, model.js, countries.js (bundled list: code, name, flag, continent), travels.css
sections/finances/
  index.js                   entry: empty state / dashboard / editor routing
  model.js                   schema v1, validation, calculations, example data
  dashboard.js, edit.js, chart.js, finances.css
icons/                       192/512, maskable, apple-touch-icon, favicon
screenshots/                 fake-data screenshots only
```

## Data model & storage namespacing
`localStorage` keys (all prefixed `aitor:`):
- `aitor:core` – `{version, profile:{name, currency}}`
- `aitor:sec:<sectionId>` – that section's own document (e.g. `aitor:sec:finances`). A section only ever receives its own store (`ctx.store`), so future sections can't collide.

**Export file** (`schema` 2; schema 1 files, e.g. finances only, still import. Every section is optional):
```json
{ "app": "ai-tor", "schema": 2, "exportedAt": "…",
  "profile": { "name": "…", "currency": "USD" },
  "sections": { "finances": {
    "version": 1, "example": false, "updatedAt": "…",
    "accounts": [{ "id": "…", "name": "…", "value": 0, "group": "Stock/Equity", "note": "" }],
    "monthlyIncome": null, "monthlyExpenses": null,
    "debts": [{ "id": "…", "name": "…", "amount": 0, "note": "" }],
    "goals": [{ "id": "…", "name": "…", "target": 0, "date": "YYYY-MM-DD" }],
    "notes": "" },
    "travels": { "version": 1, "updatedAt": "…",
      "visited": [{ "code": "FR", "years": "2019, 2022", "note": "" }] } } }
```
Groups: Stock/Equity, Retirement, Crypto, Cash/Bank, Property, Other, or any custom name. Net worth = assets − debts. The projection is an *illustration only*: a straight line from your net worth today to a goal's target on its date (no returns, contributions or market moves assumed).

Import rejects: non-JSON, wrong `app`, missing/newer `schema`, negative account values, bad dates/numbers, files over 5 MB. Nothing is written unless validation passes and you confirm.

## Add a section (e.g. Travel)
1. Create `sections/travel/index.js` exporting `async function render(container, ctx)` (use `ctx.store.get()/set()/clear()` for storage) and, so export/import covers it, `validate(doc) → {ok, errors, doc}` and `summary(doc, formatMoney)`. Link its CSS in `index.html`.
2. Add one entry to `js/sections.js`:
   `{ id:'travel', title:'Travel', subtitle:'…', icon:'✈️', route:'#/travel', loader:()=>import('../sections/travel/index.js') }`
3. Add the new files to `PRECACHE` in `sw.js` and bump `VERSION` (so phones refresh).

## Privacy notes
- CSP in `index.html` restricts everything to same-origin; no network calls are made by the app.
- Data lives only in the browser profile on each device. The service worker caches app code only.
- The site can be hosted publicly: it holds no one's data. (Each visitor's data stays in their own browser.)

## Hosting
Any static HTTPS host works (Cloudflare Pages, Netlify, GitHub Pages, your own server). Since the bundle contains no personal data, no login is required to protect it. Add a login only if you want to restrict *who can install the app*.
