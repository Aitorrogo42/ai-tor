// v40: one driver for the encrypted feeds' automatic refresh (To-Do tasks, Finances, Travels → Destinations; v42: Architecture photo results, which also
// sends photos still waiting to go out and is checked every 2 minutes while a sent photo waits for its result).
// It runs: when the app opens, when it comes back to the foreground (visibilitychange / pageshow / focus), and when the device comes back online.
// Each feed decides if it is due (15 min after the last attempt; sooner after a network failure, see js/feedcrypto.js autoDueIn). While the app stays
// open and visible a timer re-checks when the next one is due, so a failed attempt on a flaky phone network is retried within seconds instead of
// waiting for the next app open. Feeds run one after another (each decrypt derives a key, so no three at once). A feed with no passphrase is skipped
// without loading its code or making any request.
import * as storage from './storage.js';

const pass = (id) => { try { const c = storage.config(id).get(); return !!(c && c.passphrase); } catch { return false; } };
const shared = () => pass('feed') || pass('todo');
const FEEDS = [
  { name: 'todo', has: () => pass('todo'), load: () => import('../sections/todo/sync.js'), run: (m) => m.maybeAutoSync(), dueIn: (m) => m.autoSyncIn() },
  { name: 'finances', has: shared, load: () => import('../sections/finances/feed.js'), run: (m) => m.maybeAutoRefresh(), dueIn: (m) => m.autoRefreshIn() },
  { name: 'destinations', has: shared, load: () => import('../sections/travels/dest-feed.js'), run: (m) => m.maybeAutoRefresh(), dueIn: (m) => m.autoRefreshIn() },
  { name: 'architecture', has: shared, load: () => import('../sections/architecture/photo-feed.js'), run: (m) => m.maybeAutoRefresh(), dueIn: (m) => m.autoRefreshIn() },
];
const MIN_TIMER_MS = 5000, MAX_TIMER_MS = 15 * 60 * 1000;
let timer = 0, running = false, again = false;

async function runAll() {
  timer = 0;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;   // resumes on the next visibilitychange
  if (running) { again = true; return; }
  running = true;
  let next = Infinity;
  try {
    for (const f of FEEDS) {
      if (!f.has()) continue;
      try {
        const m = await f.load();
        await f.run(m);
        const ms = f.dueIn(m);
        if (ms != null) next = Math.min(next, ms);
      } catch (e) { console.warn(f.name + ' auto-refresh skipped', e); }
    }
  } finally { running = false; }
  if (again) { again = false; kick(0); return; }
  if (next < Infinity && !timer) timer = setTimeout(runAll, Math.min(MAX_TIMER_MS, Math.max(MIN_TIMER_MS, next + 250)));
}
/** Check the feeds after `delayMs` (debounced: a newer kick replaces a pending one). */
export function kick(delayMs = 0) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(runAll, delayMs);
}
let started = false;
export function startFeedAutoRefresh() {
  if (started) return; started = true;
  kick(0);                                                     // app open
  // back in the foreground: give a waking phone ~0.8 s to bring its network up before the first request
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(800); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) kick(800); });
  window.addEventListener('focus', () => kick(800));
  window.addEventListener('online', () => kick(500));
}
