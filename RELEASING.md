# Releasing AI-TOR

Working copy: `/workspace/ai-tor`. Published repo (GitHub Pages, https://aitorrogo42.github.io/ai-tor/): `/home/box/aitor-private/aitor-pub`. Tests: `/workspace/ai-tor-test-*.py`. Tools: `/workspace/tools/`.

## Fast path (a small tweak: a colour, a sun angle, a copy change)

1. Edit the files in `/workspace/ai-tor`.
2. Targeted tests: `/workspace/tools/aitor_fasttest.sh`
   - It diffs the working copy against `/home/box/aitor-private/aitor-pub` and runs only the suites that cover the changed files, e.g.
     `js/sections.js` / `js/sol.js` -> sections, wheel, freeze, sunrise, architecture; `js/sunrise.js` / `js/bg.js` -> sunrise, flicker, freeze, citylights;
     `css/chamfer.css` -> flat, architecture, header; `css/flat.css` / `css/app.css` -> flat, restyle, v19, header; `tools/make_city_lights.py` / `assets/city-lights*` -> citylights; `sections/game/*` -> game, header (v32 suite `ai-tor-test-game.py`); `sections/todo/*` -> todo, worklist, paste; feeds (`js/feed*.js`, `feedcrypto.js`) -> enc, finfeed, dest. Docs alone run nothing; an unmapped file runs the broad smoke suites (flat, v19).
   - `--list` shows the plan only; explicit files can be passed (`aitor_fasttest.sh js/bg.js`).
   - Up to 3 suites at a time. Each suite gets its own free port and temp root (`AITOR_PORT`, `AITOR_ROOT`), so they do not collide with each other or with stray servers:
     - ports: 8900-9099, probed starting at a per-run offset (`pid * 37 % 200`), so two runner invocations at once (e.g. two agents) do not grab the same ports first;
     - temp roots: `/tmp/aitor-ft/<stamp>-<pid>/<suite>`, one folder per run; at the end a run deletes only its own folder (before v35 every run shared `/tmp/aitor-ft/<suite>` and wiped all of `/tmp/aitor-ft`, which crashed suites of any other run still going).
   - Suite order (v35): `flicker` (frame-timing analysis) starts FIRST with only light DOM / data "companion" suites next to it (enc, paste, worklist, todo, finfeed, dest, splash, header, game); the heavy WebGL / animation suites (flat, freeze, architecture, sections, sunrise, v19, restyle, citylights, wheel) wait until flicker has finished and then run longest first. At most 2 of sunrise / citylights / freeze run together; if available memory drops below 3.5 GB, the runner waits and runs the rest one by one.
   - `--no-companions` = the old order: flicker strictly alone, at the very end (use it if flicker ever flaps next to its companions; costs about 1-2 min on a full run).
   - Logs and `summary.json` go to `/workspace/scratch/fasttest/<timestamp>/`.
3. Release: `/workspace/tools/aitor_release.sh --app-version 2.9.1 --slug <what-changed> --message "v28 / 2.9.1: <summary>"`
   - Steps: checks the pub repo is clean and on `main`, runs `git pull --rebase`, runs the targeted tests again (and stops if any fail; add `--skip-tests` if you just ran them), tags the current live state `v<N>-before-<slug>` and pushes that tag, bumps `sw.js` `VERSION` to `aitor-v<N+1>` and `APP_VERSION` in `js/settings.js` to `<semver> (v<N+1>)`, copies **only allowed changed files** (app html/css/js/sections/assets/icons/fonts/tools/README; never `screenshots/`, `feed/`, tests, dotfiles or anything named private/secret/passphrase), scans them for tokens / keys, commits, pushes with `git -c credential.helper='!gh auth git-credential' push origin main`, then polls the live `sw.js` until it serves the new version (about 30-60 s on Pages).
   - `--dry-run` shows the version, the tag and the file list and runs the tests without changing anything.
4. Phones pick up the new version after the app is closed and reopened once or twice.

## Full path (a feature, a new section, anything touching the wheel, navigation or storage)

1. Run everything: `/workspace/tools/aitor_fasttest.sh --full` (3 jobs; about 10.5-12 min on the shared box in Oct 2026, vs 12.8-13.7 min before the v35 scheduling; `--serial` = one suite at a time, `--no-companions` = flicker alone at the end, `--jobs N`).
2. Look at the screenshots the suites write to `/workspace/ai-tor/screenshots/` (never published) and add a new suite or new checks for the feature.
3. Update the README section for the version.
4. Release with `aitor_release.sh --full-tests ...` (runs the full set before publishing).

## Notes

- Tests read the expected `sw.js` VERSION / `APP_VERSION` from the sources (`/workspace/_aitor_ver.py`), so bumping the version never requires editing tests.
- Rollback: every release is preceded by a tag on the previous live commit (`git -C /home/box/aitor-private/aitor-pub tag -l 'v*-before-*'`). Revert to it, bump the version again and push.
- Waits in the suites are state-based, through the shared helper `/workspace/_aitor_wait.py` (test code only): `wheel_settle(pg)` (dial stopped on a snap angle, no drag, no paint for 150 ms), `sun_settle(pg)` (eased sun angle on its target for 2 polls), `fades_done(pg, selector)` (no finite CSS transition / animation running on those elements), `settled(pg)` (both). Use these instead of fixed `wait_for_timeout` sleeps for anything animated: fixed sleeps were the main source of flakes under parallel load (the page can drop to 2-6 frames/s with software WebGL).
- The wheel, sections, sunrise and freeze suites run on the REAL wheel registry (v35; `/workspace/_aitor_reg.py` reads `wheelEntries()` from the app and has an independent Python copy of the `js/sol.js` anchor rule). Adding a section therefore needs no test edit, but the expected sun angles follow its `sunAngle` pin. The old stripped 4-entry copy (`_arch_strip.py`) is retired.
- Two runner invocations at the same time are safe now (own ports, own temp folders), but they share 8 CPU cores: timings and the timing-sensitive suites (flicker, freeze, sunrise) suffer, so prefer one full run at a time.
- Real-iPhone behaviour is never covered by these headless (software WebGL) tests.

Deletions (v34): an allowed app file that is tracked in the published repo but no longer exists in `/workspace/ai-tor` is listed by the release script as "files to DELETE" (also in `--dry-run`) and removed with `git rm` in the same commit.
- Mars weather (v37): every suite answers the NASA weather URL with a FIXTURE (`/workspace/_aitor_wx.py`, installed via `_aitor_ver.py` or an explicit import), so tests never hit the network. The "only same-origin requests" checks ignore that one documented request (`is_wx`). Set `AITOR_WX_LIVE=1` to let the real request through. Suite `marswx` covers the weather line.
