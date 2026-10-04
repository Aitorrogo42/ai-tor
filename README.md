# AI-TOR

An installable personal-life app (PWA). Plain HTML/CSS/JS: **no build step, no CDNs, no analytics, no backend, no accounts, and no network requests of its own.** (The only possible exceptions are the optional, off-by-default encrypted feeds, which each read one encrypted file from the app's own site: [To-Do sync](#to-do-and-optional-task-sync) and the [Finances Refresh](#finances-refresh-optional-encrypted-feed).)

**Local-first:** every person who installs AI-TOR enters *their own* data. It is stored only in that device's browser storage (`localStorage`), never sent anywhere, and the app works fully offline once opened. **The app bundle contains no personal data**: only code, icons, and clearly-fake example data.

Today: **Finances** (accounts, debts, income/expenses, goals, notes, dashboard, and an optional ↻ Refresh from your assistant) and **Travels** (tick the countries you have visited out of a bundled offline list of 195, with search, per-continent counts, and optional year(s)/note per country). **To-Do** (a clear task list with a Done pile, comments per task, and an optional daily feed from your assistant). The home screen is a registry of sections, so more can be added later. Section logos live in `icons/sections/`.

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
js/feedcrypto.js             shared by the encrypted feeds: WebCrypto decrypt, same-origin fetch, ONE shared passphrase
js/ui.js, js/util.js         confirm dialog, toast, DOM + currency + date helpers
sections/todo/
  index.js (UI), model.js (schema, validation, feed parse + merge), sync.js (optional encrypted feed), todo.css
sections/travels/
  index.js, model.js, countries.js (bundled list: code, name, flag, continent), travels.css
sections/finances/
  index.js                   entry: empty state / dashboard / editor routing
  model.js                   schema v1, validation, calculations, example data
  dashboard.js, edit.js, chart.js, finances.css
  feed.js (Refresh: parse + merge + fetch), refreshbar.js (button / spinner / status / passphrase prompt)
feed/tasks.enc.json          (published copy only) the ENCRYPTED to-do feed, written by the assistant's publish script
feed/finances.enc.json       (published copy only) the ENCRYPTED finance snapshot, same format and passphrase
icons/                       192/512, maskable, apple-touch-icon, favicon (the PWA app icon)
icons/sections/              finances|travels|todo .png (512 master) and -256.png (used in the UI)
screenshots/                 fake-data screenshots only
```

## Data model & storage namespacing
`localStorage` keys (all prefixed `aitor:`):
- `aitor:core` – `{version, profile:{name, currency}}`
- `aitor:sec:<sectionId>` – that section's own document (e.g. `aitor:sec:finances`). A section only ever receives its own store (`ctx.store`), so future sections can't collide.
- `aitor:cfg:<sectionId>` – device settings of a section (`aitor:cfg:feed`: the ONE passphrase shared by the To-Do and Finances feeds, mirrored into `aitor:cfg:todo` together with the To-Do last-sync info; `aitor:cfg:finances`: last refresh attempt/error). **Never exported**, kept when you Import, wiped by *Erase all data*.

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
    "notes": "",
    "feed": { "updated": "…", "asOf": "…", "refreshedAt": "…", "notes": "…" } },
    "travels": { "version": 1, "updatedAt": "…",
      "visited": [{ "code": "FR", "years": "2019, 2022", "note": "" }] },
    "todo": { "version": 1, "updatedAt": "…", "dismissed": ["ids you deleted that came from sync"],
      "tasks": [{ "id": "m-abc123", "title": "Book flights", "due": "2026-10-20", "notes": "(sync only)",
        "source": "manual", "done": false, "doneAt": null, "createdAt": "…",
        "comments": [{ "id": "…", "text": "Check price Tuesday", "at": "…", "editedAt": "…" }] }] } } }
```
To-Do tasks are stored newest first. `source` is `manual` (you added it) or `sync` (came from the feed).
Optional extras written by Refresh: `accounts/debts/goals[].fk` (feed key: marks an item as managed by the feed; items you add yourself have none) and the top-level `feed` object (when/what the last refresh was). Older files without them import fine.
Groups: Stock/Equity, Retirement, Crypto, Cash/Bank, Property, Other, or any custom name. Net worth = assets − debts. The projection is an *illustration only*: a straight line from your net worth today to a goal's target on its date (no returns, contributions or market moves assumed).

Import rejects: non-JSON, wrong `app`, missing/newer `schema`, negative account values, bad dates/numbers, files over 5 MB. Nothing is written unless validation passes and you confirm.

## Add a section (e.g. Travel)
1. Create `sections/travel/index.js` exporting `async function render(container, ctx)` (use `ctx.store.get()/set()/clear()` for storage) and, so export/import covers it, `validate(doc) → {ok, errors, doc}` and `summary(doc, formatMoney)`. Link its CSS in `index.html`.
2. Add one entry to `js/sections.js`:
   `{ id:'travel', title:'Travel', subtitle:'…', icon:'icons/sections/travel-256.png', route:'#/travel', loader:()=>import('../sections/travel/index.js') }` (icon = square PNG; every logo is processed to the same padding and stroke weight and rendered at 56×56)
3. Add the new files to `PRECACHE` in `sw.js` and bump `VERSION` (so phones refresh).

## To-Do and optional task sync
**Using it:** type a task (optional due date) and tap *Add task*. New tasks appear at the top. Tick the circle to move a task to the collapsed **Done** pile (with the time you finished it); untick it there to bring it back. Tap a task to open it: add, edit or delete timestamped comments, edit a manual task, or delete it. A 💬 count on the row shows how many comments it has.

**Sync (optional, off by default).** Your General Assistant bot keeps your task list as `tasks.json` in a **private** repo, then publishes an **encrypted** copy next to the app at `feed/tasks.enc.json` (same origin, e.g. `https://<you>.github.io/ai-tor/feed/tasks.enc.json`). AI-TOR downloads that file, decrypts it on your device with a passphrase you type once, and merges it into your list. No account, no GitHub token.

### Feed format (`tasks.json`, the plaintext, which never goes in the public repo)
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

### Encrypted file format (`feed/tasks.enc.json`)
```json
{ "v": 1, "kdf": "PBKDF2-SHA256", "iter": 600000, "salt": "<b64, 16 bytes>", "iv": "<b64, 12 bytes>",
  "ct": "<b64 AES-GCM ciphertext of the tasks.json UTF-8 bytes, with the 16-byte tag appended>", "updated": "ISO time" }
```
Key = PBKDF2-HMAC-SHA256(passphrase as NFC-normalised UTF-8, salt, 600000 iterations) → 256 bits; AES-256-GCM, no additional data. A fresh random salt and IV are used for every encryption. The app decrypts with WebCrypto (`crypto.subtle`, so it needs HTTPS or localhost). The publisher is `/workspace/tools/aitor_encrypt_feed.py` (see `/workspace/tools/README-todo-feed.md`).

### Set it up
1. Choose a long passphrase and give it to your assistant's publishing job (environment variable `AITOR_TODO_PASSPHRASE`, never stored in the repo).
2. In AI-TOR open **To-Do → Task sync settings**, type the same passphrase and tap *Save & sync*.
The passphrase is kept in this device's `localStorage` only (not exported, not sent anywhere). *Remove sync* (or *Erase all data*) deletes it.

### Security: read this
- **The encrypted file is public.** Anyone who knows the URL can download it. Without the passphrase they only see random bytes (plus the `updated` time and the file size, which roughly reveals how long the list is).
- **Its strength is the strength of your passphrase.** Anyone can try guessing offline, without any rate limit. PBKDF2 with 600,000 iterations slows each guess but does not stop a determined attacker, so use a **long, unique passphrase** (4+ random words or 16+ characters), never a reused password.
- If you ever think it leaked, change the passphrase (the publisher re-encrypts) and note that old copies of the file stay decryptable with the old one: the old *task text* is exposed, so rotate and don't rely on it for anything very sensitive. Don't put secrets (passwords, account numbers) in task titles or notes.
- Decryption failures are reported as “Wrong passphrase” (AES-GCM authenticates the data, so a wrong passphrase or a tampered file are both rejected and never merged).

### When it syncs
- Automatically when you open the app (and when you return to it), at most once every 4 hours after a successful sync, and not more than every 30 minutes after a failed attempt.
- Any time with **↻ Sync now**. The To-Do screen shows when it last synced and a clear message if something failed (no passphrase, wrong passphrase, feed not found, bad file, offline…).
- The request is a plain same-origin `GET ./feed/tasks.enc.json` with `cache: 'no-store'`, no cookies, no referrer. The service worker never precaches it and never serves it cache-first: it is fetched network-first, and only if the network fails does it fall back to the last copy it saw (cache `aitor-feed`), so you can still re-sync from a cached copy when offline. **If sync is not set up, the app makes zero network requests.**

## Finances Refresh (optional encrypted feed)
A **↻ Refresh** button on the Finances dashboard pulls the latest snapshot your finance bot published, so you do not have to type numbers. Off by default: **with no passphrase stored the app never makes the request.**

- **Where:** one same-origin file, `./feed/finances.enc.json`, in exactly the same encrypted format as the To-Do feed (`feed/tasks.enc.json`; see [Encrypted file format](#encrypted-file-format-feedtasksencjson)), decrypted on the device with WebCrypto. Shared code: `js/feedcrypto.js`.
- **One passphrase for everything.** Finances and To-Do share it (`aitor:cfg:feed`, device only, never exported). If none is stored, tapping Refresh opens an inline prompt; it is saved only after it successfully decrypts the feed. Phones that already set the passphrase in To-Do just work. *Remove sync* in To-Do removes it for both.
- **Plaintext schema (version 1)**: see `/workspace/tools/README-finance-feed.md`. `accounts` (name, value, group, optional `id`, `source`), optional `debts`, `income_monthly`, `expenses_monthly`, `goals`, `notes`, `as_of`.
- **Merge rules.** Each feed item is matched to a local one by the remembered feed key, else by its `id`, else by name (case-insensitive); matches take the feed's value / group / source (shown as the account note); everything else in the feed is added. Items that were feed-managed and are no longer in the feed are removed. **Items you added yourself are never touched.** `debts` / `goals` missing from the feed are left alone. Income/expenses only change if the feed has them. Feed `notes` appear under "Notes from your assistant" and never overwrite your own notes. A feed with no valid accounts is rejected and nothing changes. Fake example data is replaced by the first real refresh.
- **What you see.** "Updated <time> from feed · <ago>" and "As of <text>" on the dashboard, a spinner while loading, and clear messages for: no passphrase, wrong passphrase (or tampered file), 404 / not published yet, offline, server problems, unreadable file. Your last good numbers stay on screen when a refresh fails.
- **When.** On demand with the button, and automatically when you open the app or come back to it, **at most once every 15 minutes** (each attempt counts), only if a passphrase is stored, and never while editing.
- **Caching.** The feed is never precached or served cache-first: network-first (`cache: 'no-store'`), falling back to the last copy (cache `aitor-feed`) only if the network fails.
- **Security.** The file is public but encrypted; the same passphrase protects your tasks *and* your account balances, so use a long unique one (see the To-Do security notes). Rotating it means republishing both feeds.
- **Publishing (on the assistant's side):** `/workspace/tools/aitor_publish_finance_feed.sh` (encrypt + leak check + commit only `feed/finances.enc.json`).

## Privacy notes
- CSP in `index.html` restricts everything to same-origin (`connect-src 'self'`, no third-party hosts). The optional To-Do sync and Finances Refresh each only read one same-origin file; nothing is ever sent anywhere.
- Data lives only in the browser profile on each device. The service worker caches app code only, plus the last copy of the encrypted feed as an offline fallback (it never touches cross-origin requests).
- The site can be hosted publicly: it holds no one's data. (Each visitor's data stays in their own browser.)

## Hosting
Any static HTTPS host works (Cloudflare Pages, Netlify, GitHub Pages, your own server). Since the bundle contains no personal data, no login is required to protect it. Add a login only if you want to restrict *who can install the app*.
