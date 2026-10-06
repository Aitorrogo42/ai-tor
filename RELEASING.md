# Releasing AI-TOR

Working copy: `/workspace/ai-tor`. Published repo (GitHub Pages, https://aitorrogo42.github.io/ai-tor/): `/tmp/aitor-pub`. Tests: `/workspace/ai-tor-test-*.py`. Tools: `/workspace/tools/`.

## Fast path (a small tweak: a colour, a sun angle, a copy change)

1. Edit the files in `/workspace/ai-tor`.
2. Targeted tests: `/workspace/tools/aitor_fasttest.sh`
   - It diffs the working copy against `/tmp/aitor-pub` and runs only the suites that cover the changed files, e.g.
     `js/sections.js` / `js/sol.js` -> sections, wheel, freeze, sunrise, architecture; `js/sunrise.js` / `js/bg.js` -> sunrise, flicker, freeze, citylights;
     `css/chamfer.css` -> flat, architecture, header; `css/flat.css` / `css/app.css` -> flat, restyle, v19, header; `tools/make_city_lights.py` / `assets/city-lights*` -> citylights; `sections/game/*` -> game, header (v32 suite `ai-tor-test-game.py`); `sections/todo/*` -> todo, worklist, paste; feeds (`js/feed*.js`, `feedcrypto.js`) -> enc, finfeed, dest. Docs alone run nothing; an unmapped file runs the broad smoke suites (flat, v19).
   - `--list` shows the plan only; explicit files can be passed (`aitor_fasttest.sh js/bg.js`).
   - Up to 3 suites at a time. Each suite gets its own free port (8900+) and temp root (`AITOR_PORT`, `AITOR_ROOT`), so they do not collide with each other or with stray servers. `flicker` (frame-timing analysis) always runs alone; at most 2 of sunrise / citylights / freeze run together; if available memory drops below 3.5 GB, the runner waits and runs the rest one by one.
   - Logs and `summary.json` go to `/workspace/scratch/fasttest/<timestamp>/`.
3. Release: `/workspace/tools/aitor_release.sh --app-version 2.9.1 --slug <what-changed> --message "v28 / 2.9.1: <summary>"`
   - Steps: checks the pub repo is clean and on `main`, runs `git pull --rebase`, runs the targeted tests again (and stops if any fail; add `--skip-tests` if you just ran them), tags the current live state `v<N>-before-<slug>` and pushes that tag, bumps `sw.js` `VERSION` to `aitor-v<N+1>` and `APP_VERSION` in `js/settings.js` to `<semver> (v<N+1>)`, copies **only allowed changed files** (app html/css/js/sections/assets/icons/fonts/tools/README; never `screenshots/`, `feed/`, tests, dotfiles or anything named private/secret/passphrase), scans them for tokens / keys, commits, pushes with `git -c credential.helper='!gh auth git-credential' push origin main`, then polls the live `sw.js` until it serves the new version (about 30-60 s on Pages).
   - `--dry-run` shows the version, the tag and the file list and runs the tests without changing anything.
4. Phones pick up the new version after the app is closed and reopened once or twice.

## Full path (a feature, a new section, anything touching the wheel, navigation or storage)

1. Run everything: `/workspace/tools/aitor_fasttest.sh --full` (parallel, about half the old time; `--serial` = the old way, one suite at a time).
2. Look at the screenshots the suites write to `/workspace/ai-tor/screenshots/` (never published) and add a new suite or new checks for the feature.
3. Update the README section for the version.
4. Release with `aitor_release.sh --full-tests ...` (runs the full set before publishing).

## Notes

- Tests read the expected `sw.js` VERSION / `APP_VERSION` from the sources (`/workspace/_aitor_ver.py`), so bumping the version never requires editing tests.
- Rollback: every release is preceded by a tag on the previous live commit (`git -C /tmp/aitor-pub tag -l 'v*-before-*'`). Revert to it, bump the version again and push.
- Known stale check: `ai-tor-test-todo.py` still looks for `#sync-repo` (sync setup UI changed); treat that failure as pre-existing.
- Real-iPhone behaviour is never covered by these headless (software WebGL) tests.

Deletions (v34): an allowed app file that is tracked in the published repo but no longer exists in `/workspace/ai-tor` is listed by the release script as "files to DELETE" (also in `--dry-run`) and removed with `git rm` in the same commit.
