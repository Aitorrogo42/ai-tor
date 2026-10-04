# AI-TOR

An installable personal-life app (PWA). Plain HTML/CSS/JS: **no build step, no CDNs, no analytics, no backend, no accounts, and no network requests of its own.** (The only possible exceptions are the optional, off-by-default encrypted feeds, which each read one encrypted file from the app's own site: [To-Do sync](#to-do-and-optional-task-sync) and the [Finances Refresh](#finances-refresh-optional-encrypted-feed) and the [Travels Destinations feed](#travels-destinations-optional-encrypted-feed).)

**Local-first:** every person who installs AI-TOR enters *their own* data. It is stored only in that device's browser storage (`localStorage`), never sent anywhere, and the app works fully offline once opened. **The app bundle contains no personal data**: only code, icons, and clearly-fake example data.

Today: **Finances** (accounts, debts, income/expenses, goals, notes, dashboard, and an optional ↻ Refresh from your assistant) and **Travels** with two tabs: **Visited** (tick the countries you have visited out of a bundled offline list of 195, with search, per-continent counts, and optional year(s)/note per country) and **Destinations** (places your Travel Guide bot proposes, from an optional encrypted feed). **To-Do** (a clear task list with a Done pile, comments per task, and an optional daily feed from your assistant). The home screen is a registry of sections, so more can be added later. Section logos live in `icons/sections/`.

## Look & feel (v14 brand mark on v13: Mars photo + crimson palette + League Spartan, on the v12 Liquid Glass / v11 Raycast look)
- **Theme / palette (v13).** Near-black with a maroon sky (`--bg #0a0305`, `--sky-top #0a0305`, `--sky-mid #2a0810`), glass panels (`#0c0d0f`/`#111214`, 1px hairlines, inner highlight), text `#cdcece` / muted `#adaeaf`. The accent palette was sampled from the reference Mars photo (crimson limb `#d7423b`-`#e57461`, maroon shadows `#260707`-`#5a0f0f`, hue about 4-8 degrees, i.e. red, not orange): **`--mars #d93a2d`** (accent), **`--ember #ff5238`** (bright accent, links, rim; AA on the panels), **`--rim #ff4a2e`**, **`--blood #8f1a1c`**, **`--rust #5a0f0f`** (deep), primary button `--btn-top #cf2f27` to `--btn-bot #a51c1a` (white text >= 4.5:1), focus ring `--focus #ff6a52`. Semantic colours stay distinct from the accent: gain `--green #3ddc84`, loss `--red #ff6fb5` (a pink, about 30 degrees of hue away from the crimson accent; amounts also keep their minus sign), warning `--amber #f2c14e`. Everything lives in `:root` of `css/app.css` (accent, glows, button gradient, semantic colours, easing, tracking tokens `--track-label/-title/-brand`); change a variable and every section follows. Per-section glow positions/hues (all crimson variants) are in `css/motion.css` (`html[data-sec=...]`). Chart/accent hexes in `sections/finances/{model,chart,dashboard}.js` follow the same palette.
- **Font (v13).** One family everywhere: **League Spartan** (variable, weights 200-700, SIL OFL 1.1, `fonts/OFL-LeagueSpartan.txt`), self-hosted as `fonts/league-spartan-latin.woff2` + `-latin-ext.woff2` (about 40 KB together, precached; no runtime request to any font host). It was chosen by measuring the "MARS" lettering of the reference photo against 13 geometric sans fonts (`tools/font_match.py`: letter-by-letter shape overlap at the best weight; League Spartan matched all four letters, e.g. glyph width/height M .81 / A .78 / R .61 / S .61 vs the photo's .78 / .75 / .61 / .64; Montserrat's M and A are far wider, see `screenshots/128-font-compare-MARS-vs-candidates.png`). Because its x-height is small the stylesheet sets `font-size-adjust:.46` (Safari 16.4+/Chrome 127+; elsewhere the text is just slightly smaller). Body text is weight 400 with +0.012em tracking; titles 400-500 with .04-.07em; the wordmark and all small caps labels are uppercase with .14-.28em tracking; emphasis is 600 at most. JetBrains Mono and Inter were removed (numbers use League Spartan's own figures; there are no monospace needs). Re-subset with `pyftsubset` if you ever add glyphs.
- **Background.** Fixed layer behind the app: a dark-red sky gradient (`--sky-top` -> `--sky-mid`), three crimson glow blobs drifting on CSS transform animations (compositor only), a ~70-particle star/ember-dust canvas (30 fps, DPR <= 2, dust tinted red) and the Mars photo (below). Glow centre and hue shift per section and animate during transitions. Pauses when the page is hidden; `prefers-reduced-motion` gives a static gradient, one still frame of stars and a still rim glow. It is `pointer-events:none` and `contain:strict`. Glass blur (`backdrop-filter`) is only used on a few small surfaces (home cards, tab bar, dialogs, toast) so scrolling stays cheap on iPhone.
- **Brand mark + lockup (v14).** The app's logo is the user's mark: two mirror-image triangles split by a thin vertical gap (`ai-tor-design/user-logo.svg`, the single source of truth, a 1024-box vector drawn by the Graphic Designer from the user's low-res image; best-fit IoU 0.98 vs the source, see `ai-tor-design/user-logo-iou.json`, `tools/verify_user_logo.py`). `tools/make_logo_icons.py` crops it to its bounding box, writes `js/brand.js` (inline SVG, `fill=currentColor`, 560x516 viewBox) and builds the whole icon set (`icons/icon-192|512`, `maskable-192|512` with the mark inside the 80 % safe circle, `apple-touch-icon` 180 opaque, `favicon-32.png`, `favicon.svg`): white mark with a crimson halo and rim glow on `--bg`/`--sky-mid`, plus a thin Mars-limb arc at the bottom (the mark's shape is never altered). Home header = mark (28 px) + `AI-TOR` wordmark (League Spartan 600, 19 px, +0.34em, uppercase); the greeting, tagline and loading splash use the same uppercase tracked style; the Settings About card repeats the lockup. The old "Horizon A" glyph and the `.logo` tile are gone. The `--rim` crimson glow (`--rim-a/b/c` at the end of `css/glass.css`) is used the same way on the mark, active tab pill, primary buttons, focus rings and pressed cards. Regenerate: `python3 tools/make_logo_icons.py` (needs playwright + Chrome); brand board: `python3 tools/make_brand_board.py`. iOS caches home-screen icons: to see the new one, remove the app from the home screen and add it again (export a backup in Settings first, because a re-added PWA can start with empty local data).
- **Transitions.** Home → section: the tapped card, its icon and its title morph into the page header (shared elements) while the old page recedes, the glow sweeps to the new section and the content staggers up; back reverses it. Opening a destination / the edit page slides in (push), going back slides out (pop); Visited ⇄ Destinations slides the content and glides the pill indicator. Uses the **View Transitions API** (iOS 18+ Safari, Chrome) and falls back to Web Animations (WAAPI) with a FLIP icon morph elsewhere. About 350–500 ms, transform/opacity only. Reduced motion → a short crossfade. In-place re-renders (save, refresh, sync) never replay transitions.
- **Micro-interactions.** Pressed-state scale + Mars glow, a spotlight that follows the finger on home cards, count-up of the Finances headline numbers when the page is entered (skipped for reduced motion; the text is always exact when it ends), toasts that slide in and out.
- **Liquid Glass (v12).** `css/glass.css` (loaded last). Home cards are the clearest surface: `backdrop-filter: blur(16px) saturate(1.8) brightness(1.14)` (+ `-webkit-` prefix), a light tint (alpha ≤ .4, plus a soft dark gradient behind the text), a corner sheen + diagonal glare band, inset top/left specular lines, a 1 px gradient rim ring (`::after`, mask-composite), a warm inner bounce, soft outer shadow and 26 px radius. Page chrome (section header, Visited/Destinations tab bar, sticky search strip, settings gear) is the same material with more dark tint (alpha .38) so text stays AA. Chips, buttons and content cards get a light version (rim + specular, **no blur**; lists stay near-opaque). Press = the glass squishes (`scale(.965,.945)`, brighter rim, Mars inner glow) and springs back with an overshoot. The tab pill is a translucent glass lens (it is a shared view-transition element, so it has no backdrop-filter). Only 4 elements blur on home, 1-4 in sections. While a card is the shared element of a view transition its blur is switched off and it uses a slightly denser tint; the blur returns when the transition ends. **Chromium only:** `js/glass.js` adds an SVG `feDisplacementMap` lens (generated canvas map, `backdrop-filter:url(#lg-bend)`) that bends the backdrop near the card edges; Safari/iOS ignore it and keep the plain blur look. Browsers without `backdrop-filter` get a denser tint.
- **Mars photo (v13).** `assets/mars-photo.webp` (2058x1155, about 80 KB) is the user's reference photo with the words "MARS"/"RED PLANET" removed, upscaled and grained. It is generated by `tools/make_mars_photo.py` (python3, numpy/scipy/Pillow; source `ai-tor-design/mars-photo-source.jpg` 588x330): the lettering is found by its deviation from a median-filtered copy, dilated, and in-painted by solving Laplace's equation over the hole (smooth haze continues from the surroundings) with grain re-synthesised from the neighbouring sky; the cleaned source is kept as `ai-tor-design/mars-photo-clean.png`; then a light de-noise, 3.5x Lanczos, mild unsharp, film grain, WebP q90. In the app it is a plain `<img>` (`.mars-photo`, CSS only) anchored to the bottom: displayed height `max(46vh, 56.1vw)` (its limb sits at 33.6 % of the height, centred) so on a phone the arc spans the whole width and rises about 25 vh above the bottom edge, on wide/landscape screens the whole photo fits the width. A mask fades its top into the sky gradient, so the join is invisible. A blurred red radial gradient on the limb (`.mars-glow`) breathes (opacity only, 9 s); `.mars-par` moves a few px with scroll/tilt (compositor transform). In sections the planet dips 9 vh and `.mars-dim` darkens it (66 %) so text stays AA (measured by `ai-tor-test-photo.py` over the bare background: the brightest 1 % still gives >= 4.5:1 for `#f6f6f7`). Reduced motion: static; hidden page: animation paused. The old procedural planet (`assets/mars-cap.webp`, `tools/make_mars_texture.py`) was removed.
- **Accessibility.** AA contrast for text (also measured over the glass and over the bare photo by `ai-tor-test-photo.py`: ≥ 4.5:1) and the primary button (white on `#cf2f27`→`#a51c1a`), visible focus rings, ≥ 44 px tap targets, safe-area insets, `overscroll-behavior:none`.

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
css/app.css                  design tokens (:root: crimson Mars palette, font, tracking, surfaces, radii, easing) + shell, buttons, forms, dialogs, toast
css/motion.css               dynamic background, Mars photo layer, page-transition (View Transitions) rules, staggered entrances, tab pill
css/glass.css                Liquid Glass material (home cards, page chrome, chips, buttons, toast) + press squish
js/glass.js                  Chromium-only SVG refraction layer for the glass (no-op elsewhere)
assets/mars-photo.webp       the Mars photo, text removed (made by tools/make_mars_photo.py)
tools/make_mars_photo.py     builds the photo asset from the reference (needs numpy, scipy, Pillow); tools/font_match.py ranks fonts against the MARS lettering
js/app.js                    hash router (animated navigations vs in-place re-renders), home screen (time-of-day greeting, ⚙)
js/nav.js                    page transitions: View Transitions API + WAAPI fallback, shared-element morphs, reduced-motion handling
js/bg.js                     background: starfield/ember-dust canvas, scroll/tilt parallax, per-section glow, pause when hidden
js/sections.js               SECTION REGISTRY (id, title, icon, route, loader)
js/storage.js                namespaced localStorage (core + one key per section)
js/dataio.js                 export / validate / import of the whole app
js/settings.js               Settings screen
js/feedcrypto.js             shared by the encrypted feeds: WebCrypto decrypt, same-origin fetch, ONE shared passphrase
js/ui.js, js/util.js         confirm dialog, toast, DOM + currency + date helpers
sections/todo/
  index.js (UI), model.js (schema, validation, feed parse + merge), sync.js (optional encrypted feed), todo.css
sections/travels/
  index.js (tabs + Visited), model.js (document v2), countries.js (bundled list: code, name, flag, continent), travels.css
  dest-model.js (place schema, sanitizing, https-only links, merge), dest-feed.js (fetch + decrypt + merge, auto-refresh), dest-ui.js (list + detail + refresh bar)
sections/finances/
  index.js                   entry: empty state / dashboard / editor routing
  model.js                   schema v1, validation, calculations, example data
  dashboard.js, edit.js, chart.js, finances.css
  feed.js (Refresh: parse + merge + fetch), refreshbar.js (button / spinner / status / passphrase prompt)
feed/tasks.enc.json          (published copy only) the ENCRYPTED to-do feed, written by the assistant's publish script
feed/finances.enc.json       (published copy only) the ENCRYPTED finance snapshot, same format and passphrase
feed/destinations.enc.json   (published copy only) the ENCRYPTED Travel Guide proposals, same format and passphrase
fonts/                       self-hosted League Spartan (variable 200-700), latin + latin-ext woff2, with its SIL OFL licence
icons/                       192/512, maskable, apple-touch-icon, favicon-32 + favicon.svg (the PWA app icon, generated by tools/make_logo_icons.py)
js/brand.js                  GENERATED inline-SVG brand mark (from ai-tor-design/user-logo.svg)
icons/sections/              finances|travels|todo .png (512 master) and -256.png (used in the UI)
screenshots/                 fake-data screenshots only
```

## Data model & storage namespacing
`localStorage` keys (all prefixed `aitor:`):
- `aitor:core` – `{version, profile:{name, currency}}`
- `aitor:sec:<sectionId>` – that section's own document (e.g. `aitor:sec:finances`). A section only ever receives its own store (`ctx.store`), so future sections can't collide.
- `aitor:cfg:<sectionId>` – device settings of a section (`aitor:cfg:feed`: the ONE passphrase shared by the To-Do and Finances feeds, mirrored into `aitor:cfg:todo` together with the To-Do last-sync info; `aitor:cfg:finances`: last refresh attempt/error). **Never exported**, kept when you Import, wiped by *Erase all data*.

**Export file** (`schema` 4; schema 1, 2 and 3 files still import. Every section is optional):
```json
{ "app": "ai-tor", "schema": 4, "exportedAt": "…",
  "profile": { "name": "…", "currency": "USD" },
  "sections": { "finances": {
    "version": 1, "example": false, "updatedAt": "…",
    "accounts": [{ "id": "…", "name": "…", "value": 0, "group": "Stock/Equity", "note": "" }],
    "monthlyIncome": null, "monthlyExpenses": null,
    "debts": [{ "id": "…", "name": "…", "amount": 0, "note": "" }],
    "goals": [{ "id": "…", "name": "…", "target": 0, "date": "YYYY-MM-DD" }],
    "notes": "",
    "feed": { "updated": "…", "asOf": "…", "refreshedAt": "…", "notes": "…" } },
    "travels": { "version": 2, "updatedAt": "…",
      "visited": [{ "code": "FR", "years": "2019, 2022", "note": "" }],
      "destinations": [{ "id": "example-place", "name": "…", "kind": "city", "region": "…", "summary": "…", "recommended_on": "2026-10-04",
        "best_window": "…", "things_to_do": [{ "title": "…", "details": "…", "url": "https://…" }], "logistics": ["…"], "downsides": ["…"],
        "links": [{ "label": "…", "url": "https://…" }], "favorite": false, "note": "", "seen": true, "arrivedAt": "…" }] },
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

## Travels Destinations (optional encrypted feed)
**Travels → Destinations** lists places your Travel Guide bot proposes (countries, states, cities, activities, museums), newest recommendation first. Each row shows the name, a kind chip, the region, a one-line summary, a **NEW** badge until you open it, and a ★ to favorite. Search, filter by kind, or show only favorites. Tap a place for its detail page: summary, best time, **Things to do** (with tappable links that open in a new tab), logistics, honest downsides, links, the recommendation date, a favorite toggle, your own note, and for a country in the bundled list a **Mark as visited** shortcut. Off by default: **with no passphrase stored the app never makes the request.**

- **Where:** one same-origin file, `./feed/destinations.enc.json`, same encrypted format and **same shared passphrase** as To-Do and Finances (`js/feedcrypto.js`). If none is stored, tapping Refresh opens an inline prompt; it is saved only after it successfully decrypts the feed.
- **Plaintext schema (version 1)** and the publishing tools: `/workspace/tools/README-destinations-feed.md`.
- **Merge rules (by place `id`).** Feed fields overwrite; your favorite, note and seen state are never overwritten (the feed's `favorite` only applies when a place first arrives). Places that disappear from the feed stay; only `"removed": true` deletes one. An empty feed changes nothing and shows “No destinations yet” when there are none.
- **Safety.** All feed text is shown with `textContent` (no HTML is ever interpreted). A URL becomes a link only if it is a plain `https://` URL; anything else (`javascript:`, `data:`, `http:`…) is dropped. Links open with `target="_blank" rel="noopener noreferrer"`.
- **When.** On demand with ↻ Refresh, and automatically when you open the app or come back to it, **at most once every 15 minutes** (every attempt counts), only with a stored passphrase. Clear messages for: no passphrase, wrong passphrase, 404 / not published yet, offline, server problems, unreadable file; your last places stay on screen.
- **Storage.** Places and your own state live in the Travels document (`aitor:sec:travels`, `destinations`), so they are included in Export/Import and wiped by *Erase all data*. Last refresh info is a device setting (`aitor:cfg:destinations`, never exported). “Clear all travels” on the Visited tab clears only visited countries.
- **Caching.** Network-first, never precached; last copy kept in cache `aitor-feed` only as an offline fallback.

## Privacy notes
- CSP in `index.html` restricts everything to same-origin (`connect-src 'self'`, no third-party hosts). The optional To-Do sync and Finances Refresh each only read one same-origin file; nothing is ever sent anywhere.
- Data lives only in the browser profile on each device. The service worker caches app code only, plus the last copy of the encrypted feed as an offline fallback (it never touches cross-origin requests).
- The site can be hosted publicly: it holds no one's data. (Each visitor's data stays in their own browser.)

## Hosting
Any static HTTPS host works (Cloudflare Pages, Netlify, GitHub Pages, your own server). Since the bundle contains no personal data, no login is required to protect it. Add a login only if you want to restrict *who can install the app*.

**Restore points (git tags in the published repo):** `v10-before-raycast` (opaque dark panels, before the Raycast look) and `v11-raycast-mars` (Raycast look + Mars accent, before Liquid Glass / Mars-rise) and `v12-liquid-glass` (Liquid Glass + procedural Mars, Inter, orange-red accent; before the Mars photo / crimson palette / League Spartan). To go back: check out the tag and push it as `main` (ask the assistant).
