// Travels → Destinations screens. Routes: #/travels/destinations (list) and #/travels/destinations/<id> (detail).
// Every piece of feed text goes in through textContent (the h() helper); links are created only for https:// URLs (safeUrl).
import { h, sectionIcon } from '../../js/util.js';
import { icon } from '../../js/icons.js';
import { toast } from '../../js/ui.js';
import { timeAgo } from '../../js/feedcrypto.js';
import { COUNTRIES, isoLabel } from './countries.js';
import { norm } from './model.js';
import { KINDS, KIND_LABEL, LIMITS, safeUrl, sortPlaces, matchCountry, isNewPlace, countNew } from './dest-model.js';
import * as feed from './dest-feed.js';

export const LIST_HASH = '#/travels/destinations';
const state = { query: '', kind: 'all', favs: false };   // list filters survive going into a place and back

function when(iso) {
  const d = new Date(iso); if (!Number.isFinite(d.getTime())) return '';
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + t;
}
function day(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
const kindChip = (k) => h('span', { class: 'dst-kind dst-kind-' + k }, KIND_LABEL[k] || 'Other');
const extLink = (url, label, cls) => {
  const u = safeUrl(url);
  return u ? h('a', { class: cls || 'dst-link', href: u, target: '_blank', rel: 'noopener noreferrer' }, label, icon('external', 'ico dst-ext')) : null;
};

// ---------- Refresh bar ("Updated <time> · N places") ----------
function refreshBar(rerender) {
  const st = feed.getState();
  let busy = false, error = null, askPass = false;
  if (st.lastError && (!st.lastRefreshAt || Date.parse(st.lastAttemptAt || '') > Date.parse(st.lastRefreshAt))) error = st.lastError;
  const root = h('div', { class: 'card feedbar', id: 'dst-bar' });
  const onRefreshed = () => {
    if (!root.isConnected) { window.removeEventListener('aitor:destinations-refreshed', onRefreshed); return; }
    if (!busy) { const s2 = feed.getState(); if (!s2.lastError) error = null; draw(); }   // v40: a background refresh also updates "Updated <time> · N places"
    if (location.hash === LIST_HASH && rerender) rerender();
  };
  window.addEventListener('aitor:destinations-refreshed', onRefreshed);

  async function run(passphrase = null) {
    busy = true; error = null; draw();
    const r = await feed.refresh({ passphrase });
    busy = false;
    if (r.ok) {
      askPass = false;
      const s = r.stats, n = s.added + s.updated + s.removed;
      toast(n ? `Refreshed: ${s.added} new, ${s.updated} updated` : 'Refreshed: already up to date');
      if (root.isConnected) { error = null; draw(); if (rerender) rerender(); }
      return;
    }
    error = r.error;
    if (r.kind === 'nopass' || r.kind === 'passphrase') askPass = true;
    draw();
  }

  function draw() {
    const havePass = feed.hasPassphrase();
    const cur = feed.readDoc();
    const n = cur.doc.destinations.length;
    const s = feed.getState();
    const status = s.lastRefreshAt
      ? h('div', { class: 'feed-upd', id: 'dst-updated' }, `Updated ${when(s.lastRefreshAt)} · ${n} place${n === 1 ? '' : 's'}`, h('span', { class: 'feed-ago' }, ` · ${timeAgo(s.lastRefreshAt)}`))
      : h('div', { class: 'feed-upd', id: 'dst-updated' }, havePass ? `Not refreshed yet · ${n} place${n === 1 ? '' : 's'}` : 'Get your Travel Guide’s latest proposals');
    const btn = h('button', { class: 'btn primary small', id: 'dst-refresh-btn', type: 'button', disabled: busy, 'aria-busy': busy ? 'true' : null,
      onclick: () => { if (!havePass) { askPass = true; error = null; draw(); const i = root.querySelector('#dst-pass'); if (i) i.focus(); } else run(); } },
      busy ? h('span', { class: 'spinner', id: 'dst-spinner', 'aria-hidden': 'true' }) : icon('refresh'), busy ? 'Refreshing…' : 'Refresh');
    const kids = [h('div', { class: 'feed-row' }, h('div', { class: 'feed-text', role: 'status' }, status), btn)];
    if (error && !busy) kids.push(h('div', { class: 'feed-err', id: 'dst-error', role: 'alert' }, error,
      s.lastRefreshAt ? h('div', { class: 'note' }, 'Still showing the places from ' + when(s.lastRefreshAt) + '.') : null));
    if (askPass && !busy) {
      const pass = h('input', { type: 'password', id: 'dst-pass', placeholder: 'Your passphrase', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: '200', 'aria-label': 'Passphrase' });
      kids.push(h('form', { class: 'feed-form', id: 'dst-form', onsubmit: (e) => {
        e.preventDefault();
        const errs = feed.checkPassphrase(pass.value);
        if (errs.length) { error = errs[0]; draw(); const i = root.querySelector('#dst-pass'); if (i) i.focus(); return; }
        run(pass.value);
      } },
        h('div', { class: 'note' }, havePass ? 'Enter the passphrase again. It is the same one used for To-Do and Finances.' : 'Enter your passphrase once. It stays on this device and is shared with To-Do and Finances.'),
        h('div', { class: 'feed-formrow' }, pass, h('button', { class: 'btn ghost small', id: 'dst-save', type: 'submit' }, 'Save & refresh'))));
    }
    root.replaceChildren(...kids);
  }
  draw();
  return root;
}

/** v40: number of NEW places for the tab badge (the same rule as the list). */
export function newPlaceCount() { const d = feed.readDoc(); return d.ok ? countNew(d.doc.destinations, feed.visitBoundary()) : 0; }

/** Keep the "N new" badge on the Destinations tab in step with the list (the tab bar is drawn once per page). */
export function syncTabBadge(n) {
  const tab = document.getElementById('tab-dest');
  if (!tab) return;
  let b = tab.querySelector('.trv-tabbadge');
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = h('span', { class: 'trv-tabbadge', id: 'tab-dest-new' }); (tab.querySelector('.tab-lbl') || tab).append(b); }
  b.textContent = String(n); b.setAttribute('aria-label', `${n} new`);
}

// ---------- List ----------
export function renderList(container, ctx) {
  const rerender = () => draw();
  const boundary = feed.visitBoundary();   // frozen for this visit (see dest-feed.js)
  let newIds = new Set();
  const bar = refreshBar(rerender);
  const listBox = h('div', { class: 'dst-listbox', id: 'dst-listbox' });

  const search = h('input', { type: 'search', class: 'trv-search', id: 'dst-search', placeholder: 'Search destinations…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Search destinations',
    oninput: () => { state.query = search.value; drawList(); } });
  search.value = state.query;
  const chips = h('div', { class: 'dst-chips', id: 'dst-chips', role: 'group', 'aria-label': 'Filter by kind' });

  function toggleFav(id) {
    feed.mutate((doc) => { const p = doc.destinations.find((x) => x.id === id); if (p) p.favorite = !p.favorite; });
    drawList();
  }

  function row(p) {
    const meta = [p.region, p.best_window ? 'Best: ' + p.best_window : ''].filter(Boolean).join(' · ');
    const isNew = newIds.has(p.id);
    return h('li', { class: 'dst-row' + (isNew ? ' is-new' : ''), 'data-place': p.id },
      h('a', { class: 'dst-main', href: LIST_HASH + '/' + encodeURIComponent(p.id) },
        h('span', { class: 'dst-line1' }, h('span', { class: 'dst-name' }, p.name), isNew ? h('span', { class: 'dst-new', 'aria-label': 'New' }, 'NEW') : null),
        h('span', { class: 'dst-line2' }, kindChip(p.kind), meta ? h('span', { class: 'dst-region' }, meta) : null),
        p.summary ? h('span', { class: 'dst-sum' }, p.summary) : null),
      h('button', { type: 'button', class: 'dst-star' + (p.favorite ? ' on' : ''), 'data-star': p.id, 'aria-pressed': String(p.favorite), 'aria-label': (p.favorite ? 'Remove favorite: ' : 'Favorite: ') + p.name,
        onclick: () => toggleFav(p.id) }, icon('star', 'ico ico-lg', { filled: p.favorite })));
  }

  function drawList() {
    const doc = feed.readDoc();
    if (!doc.ok) {
      listBox.replaceChildren(h('div', { class: 'card error', id: 'dst-damaged' }, h('p', { class: 'note' }, 'Saved travels data looks damaged. Restore a backup from Settings > Import, or reset Travels.')));
      return;
    }
    const all = sortPlaces(doc.doc.destinations);
    newIds = new Set(all.filter((p) => isNewPlace(p, boundary, all)).map((p) => p.id));   // v40: NEW = arrived since your last visit (and not opened)
    syncTabBadge(newIds.size);
    if (document.visibilityState !== 'hidden') feed.markListSeen();
    const present = KINDS.concat(['other']).filter((k) => all.some((p) => p.kind === k));
    if (state.kind !== 'all' && !present.includes(state.kind)) state.kind = 'all';
    chips.replaceChildren(
      ...[['all', 'All'], ...present.map((k) => [k, (KIND_LABEL[k] || k)])].map(([k, label]) =>
        h('button', { type: 'button', class: 'dst-chip' + (state.kind === k ? ' on' : ''), 'data-kind': k, 'aria-pressed': String(state.kind === k), onclick: () => { state.kind = k; drawList(); } }, label)),
      h('button', { type: 'button', class: 'dst-chip' + (state.favs ? ' on' : ''), id: 'dst-favs', 'aria-pressed': String(state.favs), onclick: () => { state.favs = !state.favs; drawList(); } }, icon('star'), 'Favorites'));
    chips.hidden = all.length === 0;
    search.parentElement && (search.parentElement.hidden = all.length === 0);

    const q = norm(state.query);
    const shown = all.filter((p) => (state.kind === 'all' || p.kind === state.kind) && (!state.favs || p.favorite)
      && (!q || norm([p.name, p.region, p.summary, KIND_LABEL[p.kind], ...p.things_to_do.map((t) => t.title)].join(' ')).includes(q)));
    if (!all.length) {
      listBox.replaceChildren(h('div', { class: 'card dst-empty', id: 'dst-empty' }, h('h2', null, 'No destinations yet'),
        h('p', { class: 'note' }, 'Places your Travel Guide proposes will show up here. Tap Refresh to check for new ones; the app also checks when you open it.')));
    } else if (!shown.length) {
      listBox.replaceChildren(h('div', { class: 'card', id: 'dst-nomatch' }, h('p', { class: 'note' }, 'No destination matches your search or filter.')));
    } else {
      const fresh = newIds.size;
      listBox.replaceChildren(
        h('p', { class: 'dst-count', id: 'dst-count' }, `${shown.length} of ${all.length} destination${all.length === 1 ? '' : 's'}`, fresh ? ` · ${fresh} new` : ''),
        h('ul', { class: 'dst-ul', id: 'dst-ul' }, shown.map(row)));
    }
  }
  function draw() { drawList(); }

  container.append(bar, h('div', { class: 'trv-searchrow' }, search), chips, listBox);
  drawList();
}

// ---------- Detail ----------
export function renderDetail(container, ctx, id) {
  const cur = feed.readDoc();
  const back = h('a', { class: 'back', href: LIST_HASH, id: 'dst-back' }, icon('chevL'), 'Destinations');
  const place = cur.ok && cur.doc.destinations.find((p) => p.id === id);
  if (!place) {
    container.append(h('div', { class: 'topbar' }, back),
      h('div', { class: 'card', id: 'dst-missing' }, h('h2', null, 'Destination not found'), h('p', { class: 'note' }, 'It may have been removed from your Travel Guide’s list. Go back and refresh.')));
    return;
  }
  document.title = place.name + ' · AI-TOR';
  if (!place.seen) feed.mutate((doc) => { const p = doc.destinations.find((x) => x.id === id); if (p) p.seen = true; });

  const visitedNow = () => feed.readDoc().doc.visited;
  const country = matchCountry(place, COUNTRIES, norm);
  const section = (title, body, cls) => h('section', { class: 'card dst-sec ' + (cls || '') }, h('h2', { class: 'dst-h' }, title), body);

  const star = h('button', { type: 'button', class: 'btn ghost small dst-favbtn', id: 'dst-fav', 'aria-pressed': String(place.favorite), onclick: () => {
    feed.mutate((doc) => { const p = doc.destinations.find((x) => x.id === id); if (p) { p.favorite = !p.favorite; place.favorite = p.favorite; } });
    star.setAttribute('aria-pressed', String(place.favorite)); star.replaceChildren(icon('star', 'ico', { filled: place.favorite }), 'Favorite');
  } }, icon('star', 'ico', { filled: place.favorite }), 'Favorite');

  const head = h('div', { class: 'card dst-head' },
    h('div', { class: 'dst-head-top' }, h('h1', { class: 'dst-title', id: 'dst-title' }, place.name), star),
    h('div', { class: 'dst-line2' }, kindChip(place.kind), place.region ? h('span', { class: 'dst-region' }, place.region) : null),
    place.summary ? h('p', { class: 'dst-summary', id: 'dst-summary' }, place.summary) : null,
    h('dl', { class: 'dst-facts' },
      place.best_window ? h('div', null, h('dt', null, 'Best time'), h('dd', { id: 'dst-window' }, place.best_window)) : null,
      place.recommended_on ? h('div', null, h('dt', null, 'Recommended on'), h('dd', { id: 'dst-recon' }, day(place.recommended_on))) : null));

  const parts = [h('div', { class: 'topbar' }, back), head];

  if (place.kind === 'country' && country) {
    const box = h('div', { class: 'card dst-visit', id: 'dst-visit' });
    const drawVisit = () => {
      const isV = visitedNow().some((v) => v.code === country.code);
      box.replaceChildren(h('span', { class: 'iso', 'aria-hidden': 'true' }, isoLabel(country)),
        h('span', { class: 'dst-visit-t' }, isV ? `${country.name} is on your Visited list` : `Been to ${country.name}?`),
        isV ? h('a', { class: 'btn ghost small', href: '#/travels' }, 'View') : h('button', { type: 'button', class: 'btn primary small', id: 'dst-markvisited', onclick: () => {
          if (feed.mutate((doc) => { if (!doc.visited.some((v) => v.code === country.code)) doc.visited.push({ code: country.code, years: '', note: '' }); })) { toast(`${country.name} added to Visited`); drawVisit(); }
          else toast('Could not save');
        } }, 'Mark as visited'));
    };
    drawVisit(); parts.push(box);
  }

  if (place.things_to_do.length) {
    parts.push(section('Things to do', h('ol', { class: 'dst-todos', id: 'dst-todos' }, place.things_to_do.map((t) =>
      h('li', { class: 'dst-todo' }, h('div', { class: 'dst-todo-t' }, t.title), t.details ? h('p', { class: 'dst-todo-d' }, t.details) : null, t.url ? extLink(t.url, 'Open link') : null)))));
  }
  if (place.logistics.length) parts.push(section('Logistics', h('ul', { class: 'dst-bul', id: 'dst-logistics' }, place.logistics.map((l) => h('li', null, l)))));
  if (place.downsides.length) parts.push(section('Honest downsides', h('ul', { class: 'dst-bul warn', id: 'dst-downsides' }, place.downsides.map((l) => h('li', null, l))), 'dst-down'));
  if (place.links.length) parts.push(section('Links', h('ul', { class: 'dst-links', id: 'dst-links' }, place.links.map((l) => h('li', null, extLink(l.url, l.label))))));

  const note = h('textarea', { id: 'dst-note', class: 'trv-note', rows: '4', maxlength: String(LIMITS.note), placeholder: 'Your own thoughts: who to take, dates, ideas…', 'aria-label': 'Your note' });
  note.value = place.note || '';
  let saved = place.note || '';
  const saveNote = () => {
    const v = note.value.trim().slice(0, LIMITS.note);
    if (v === saved) return;
    if (feed.mutate((doc) => { const p = doc.destinations.find((x) => x.id === id); if (p) p.note = v; })) { saved = v; place.note = v; toast('Note saved'); } else toast('Could not save the note');
  };
  note.addEventListener('change', saveNote);
  parts.push(section('Your note', h('div', null, note, h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn ghost small', id: 'dst-savenote', onclick: saveNote }, 'Save note'))), 'dst-notes'));
  container.append(...parts);
}
