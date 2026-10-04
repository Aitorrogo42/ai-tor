# AI-TOR

An installable personal-life app (PWA). Plain HTML/CSS/JS: **no build step, no CDNs, no analytics, no backend, no accounts, and no network requests of its own.** (The only possible exception is the optional, off-by-default To-Do task sync, which reads one file from `api.github.com`; see [To-Do sync](#to-do-and-optional-task-sync).)

**Local-first:** every person who installs AI-TOR enters *their own* data. It is stored only in that device's browser storage (`localStorage`), never sent anywhere, and the app works fully offline once opened. **The app bundle contains no personal data**: only code, icons, and clearly-fake example data.

Today: **Finances** (accounts, debts, income/expenses, goals, notes, dashboard) and **Travels** (tick the countries you have visited out of a bundled offline list of 195, with search, per-continent counts, and optional year(s)/note per country). **To-Do** (a clear task list with a Done pile, comments per task, and an optional daily feed from your assistant). The home screen is a registry of sections, so more can be added later. Section logos live in `icons/sections/`.

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
sections/todo/
  index.js (UI), model.js (schema, validation, feed parse + merge), sync.js (optional GitHub feed), todo.css
sections/travels/
  index.js, model.js, countries.js (bundled list: code, name, flag, continent), travels.css
sections/finances/
  index.js                   entry: empty state / dashboard / editor routing
  model.js                   schema v1, validation, calculations, example data
  dashboard.js, edit.js, chart.js, finances.css
icons/                       192/512, maskable, apple-touch-icon, favicon (the PWA app icon)
icons/sections/              finances|travels|todo .png (512 master) and -256.png (used in the UI)
screenshots/                 fake-data screenshots only
```

## Data model & storage namespacing
`localStorage` keys (all prefixed `aitor:`):
- `aitor:core` – `{version, profile:{name, currency}}`
- `aitor:sec:<sectionId>` – that section's own document (e.g. `aitor:sec:finances`). A section only ever receives its own store (`ctx.store`), so future sections can't collide.
- `aitor:cfg:<sectionId>` – device settings of a section (today only `aitor:cfg:todo`: sync repo, path, token, last-sync info). **Never exported**, kept when you Import, wiped by *Erase all data*.

**Export file** (`schema` 3; schema 1 and 2 files still import. Every section is optional):
```json
{ "app": "ai-tor", "schema": 3, "exportedAt": "…",
  "profile": { "name": "…", "currency": "USD" },
  "sections": { "finances": {
    "version": 1, "example": false, "updatedAt": "…",
    "accounts": [{ "id": "…", "name": "…", "value": 0, "group": "Stock/Equity", "note": "" }],
    "monthlyIncome": null, "monthlyExpenses": null,
    "debts": [{ "id": "…", "name": "…", "amount": 0, "note": "" }],
    "goals": [{ "id": "…", "name": "…", "target": 0, "date": "YYYY-MM-DD" }],
    "notes": "" },
    "travels": { "version": 1, "updatedAt": "…",
      "visited": [{ "code": "FR", "years": "2019, 2022", "note": "" }] },
    "todo": { "version": 1, "updatedAt": "…", "dismissed": ["ids you deleted that came from sync"],
      "tasks": [{ "id": "m-abc123", "title": "Book flights", "due": "2026-10-20", "notes": "(sync only)",
        "source": "manual", "done": false, "doneAt": null, "createdAt": "…",
        "comments": [{ "id": "…", "text": "Check price Tuesday", "at": "…", "editedAt": "…" }] }] } } }
```
To-Do tasks are stored newest first. `source` is `manual` (you added it) or `sync` (came from the feed).
Groups: Stock/Equity, Retirement, Crypto, Cash/Bank, Property, Other, or any custom name. Net worth = assets − debts. The projection is an *illustration only*: a straight line from your net worth today to a goal's target on its date (no returns, contributions or market moves assumed).

Import rejects: non-JSON, wrong `app`, missing/newer `schema`, negative account values, bad dates/numbers, files over 5 MB. Nothing is written unless validation passes and you confirm.

## Add a section (e.g. Travel)
1. Create `sections/travel/index.js` exporting `async function render(container, ctx)` (use `ctx.store.get()/set()/clear()` for storage) and, so export/import covers it, `validate(doc) → {ok, errors, doc}` and `summary(doc, formatMoney)`. Link its CSS in `index.html`.
2. Add one entry to `js/sections.js`:
   `{ id:'travel', title:'Travel', subtitle:'…', icon:'icons/sections/travel-256.png', route:'#/travel', loader:()=>import('../sections/travel/index.js') }` (icon = square PNG; every logo is processed to the same padding and stroke weight and rendered at 56×56)
3. Add the new files to `PRECACHE` in `sw.js` and bump `VERSION` (so phones refresh).

## To-Do and optional task sync
**Using it:** type a task (optional due date) and tap *Add task*. New tasks appear at the top. Tick the circle to move a task to the collapsed **Done** pile (with the time you finished it); untick it there to bring it back. Tap a task to open it: add, edit or delete timestamped comments, edit a manual task, or delete it. A 💬 count on the row shows how many comments it has.

**Sync (optional, off by default).** Your General Assistant bot can publish a daily task list as a JSON file in a **private** GitHub repo. AI-TOR reads that one file and merges it into your list.

### Feed format (`tasks.json`)
```json
{ "version": 1, "updated": "2026-10-04T06:00:00Z",
  "tasks": [
    { "id": "2026-10-04-dentist", "title": "Call the dentist", "due": "2026-10-06", "notes": "Ask about Friday" },
    { "id": "water-bill-oct", "title": "Pay water bill" },
    { "id": "old-task-id", "title": "Old task", "removed": true }
  ] }
```
- `version` must be `1`. `updated` is optional (shown in the sync settings).
- Each task needs a **stable** `id` (text, ≤100 chars, the same id every day for the same task) and a `title` (≤200 chars). `due` (`YYYY-MM-DD`), `notes` (≤1000 chars) and `removed` are optional. Invalid entries are skipped and counted, not fatal. Max 1000 tasks, max file size 1 MB.

### Merge rules (by task id)
- **New id** → added as an **open** task at the top (feed order kept).
- **Known id** → only `title`, `due` and `notes` follow the feed. **Done state, done time and your comments are never overwritten.**
- **Missing from the feed** → the task stays. Nothing is removed just because it disappeared.
- **`"removed": true`** → an open synced task is deleted; one you already completed stays in Done.
- A synced task you delete yourself is remembered and will not come back on the next sync.
- Manual tasks are never touched by sync.

### Set it up
1. On GitHub create a **private** repository (for example `ai-tor-tasks`) and have your assistant bot commit `tasks.json` to it each day in the format above.
2. GitHub → *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*. Resource owner: you. **Repository access: Only select repositories → your tasks repo.** Permissions: **Repository permissions → Contents: Read-only** (nothing else). Pick an expiry (e.g. 1 year) and copy the token (starts with `github_pat_`).
3. In AI-TOR open **To-Do → Task sync settings**, enter `owner/name`, the file path (default `tasks.json`) and the token, then *Save & sync*.
The token is read-only and limited to that one repo, but anyone with access to your unlocked phone/browser profile could read it from local storage. Revoke it on GitHub if the device is lost. *Remove sync* (or *Erase all data*) deletes it from the device.

### When it syncs
- Automatically when you open the app (and when you return to it), at most once every 4 hours after a successful sync, and not more than every 30 minutes after a failed attempt.
- Any time with **↻ Sync now**. The To-Do screen shows when it last synced and a clear message if something failed (wrong token, repo or file not found, offline, bad file…).
- The request is `GET https://api.github.com/repos/{repo}/contents/{path}` with `Accept: application/vnd.github.raw`, `Authorization: Bearer <token>`, `cache: 'no-store'`, no cookies, no referrer. **If sync is not configured, the app makes zero network requests.**

## Privacy notes
- CSP in `index.html` restricts everything to same-origin, with exactly one extra allowance: `connect-src 'self' https://api.github.com`, used only by the optional To-Do sync above. Nothing else is contacted, and nothing is ever sent to any server other than GitHub's read-only file API.
- Data lives only in the browser profile on each device. The service worker caches app code only (it never touches cross-origin requests such as the sync call).
- The site can be hosted publicly: it holds no one's data. (Each visitor's data stays in their own browser.)

## Hosting
Any static HTTPS host works (Cloudflare Pages, Netlify, GitHub Pages, your own server). Since the bundle contains no personal data, no login is required to protect it. Add a login only if you want to restrict *who can install the app*.
