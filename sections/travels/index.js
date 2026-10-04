// Travels section: two tabs. Visited = countries you have been to (#/travels); Destinations = places your Travel Guide proposes
// (#/travels/destinations, #/travels/destinations/<id>; see dest-ui.js). Both live in the one document aitor:sec:travels.
import { h, pageTitle } from '../../js/util.js';
import { icon } from '../../js/icons.js';
import { toast, confirmDialog } from '../../js/ui.js';
import { COUNTRIES, CONTINENTS } from './countries.js';
import { validate, summary, emptyDoc, isEmptyDoc, TOTAL, LIMITS, norm } from './model.js';
import { renderList, renderDetail, LIST_HASH } from './dest-ui.js';

export { validate, summary, emptyDoc };
export const storageId = 'travels';

export async function render(root, ctx) {
  root.className = 'section-root fin trv';
  document.title = 'Travels · AI-TOR';
  const store = ctx.store;
  const raw = store.get();
  let doc = emptyDoc();
  if (raw) {
    const v = validate(raw);
    if (!v.ok) {
      root.append(h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home'),
        h('div', { class: 'card error', id: 'corrupt' }, h('h2', null, 'Saved travels data looks damaged'), h('p', { class: 'note' }, v.errors.join(' ')),
          h('p', { class: 'note' }, 'You can restore a backup from Settings > Import, or reset this section.'),
          h('div', { class: 'btnrow' }, h('a', { class: 'btn ghost', href: '#/settings' }, 'Open Settings'),
            h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog({ title: 'Reset Travels data?', message: 'This deletes the saved travels on this device.', okLabel: 'Reset', danger: true })) { store.clear(); ctx.rerender(); } } }, 'Reset Travels'))));
      return;
    }
    doc = v.doc;
  }

  const visitedMap = () => new Map(doc.visited.map((v) => [v.code, v]));
  // Only `visited` is ours here: re-read the stored document first so destinations changed meanwhile (a background feed refresh,
  // favorites) are never overwritten by this page's older in-memory copy.
  const persist = () => {
    try {
      const cur = store.get();
      const v = cur ? validate(cur) : null;
      const fresh = v && v.ok ? v.doc : emptyDoc();
      fresh.visited = doc.visited;
      fresh.updatedAt = new Date().toISOString();
      store.set(fresh);
      doc = fresh;
      return true;
    } catch (e) { console.warn(e); toast('Could not save: storage is full or blocked'); return false; }
  };

  let query = '';
  let editing = null;            // country code whose editor is open
  const openGroups = new Set();  // continents the user expanded

  const countText = h('div', { class: 'trv-count', id: 'trv-count', role: 'status' });
  const bar = h('i');
  const progress = h('div', { class: 'bar' }, bar);
  const search = h('input', { type: 'search', id: 'trv-search', class: 'trv-search', placeholder: 'Search countries…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Search countries',
    oninput: () => { query = search.value; renderLists(); } });
  const clearSearch = h('button', { type: 'button', class: 'btn ghost small', id: 'trv-search-clear', hidden: true, onclick: () => { search.value = ''; query = ''; renderLists(); search.focus(); } }, 'Clear');
  const lists = h('div', { class: 'trv-lists', id: 'trv-lists' });

  function toggle(code, anchor) {
    const m = visitedMap();
    if (m.has(code)) {
      doc.visited = doc.visited.filter((v) => v.code !== code);
      if (editing === code) editing = null;
    } else {
      doc.visited.push({ code, years: '', note: '' });
    }
    if (persist()) renderLists(anchor);
  }

  function saveDetails(code, years, note) {
    const v = doc.visited.find((x) => x.code === code);
    if (!v) return;
    v.years = years.trim().slice(0, LIMITS.years);
    v.note = note.trim().slice(0, LIMITS.note);
    if (persist()) { editing = null; toast('Saved'); renderLists(); }
  }

  function checkRow(c, isVisited) {
    const id = 'c-' + c.code;
    const cb = h('input', { type: 'checkbox', id, class: 'trv-cb', 'data-code': c.code, checked: isVisited,
      onchange: () => toggle(c.code, cb) });
    return h('li', { class: 'trv-row' + (isVisited ? ' on' : ''), 'data-pick': c.code },
      h('label', { class: 'trv-pick', for: id }, cb,
        h('span', { class: 'flag', 'aria-hidden': 'true' }, c.flag),
        h('span', { class: 'trv-name' }, c.name)));
  }

  function visitedRow(c, v) {
    const isOpen = editing === c.code;
    const meta = [v.years, v.note].filter(Boolean).join(' · ');
    const head = h('div', { class: 'trv-vhead' },
      h('span', { class: 'flag', 'aria-hidden': 'true' }, c.flag),
      h('span', { class: 'trv-vtext' }, h('span', { class: 'trv-name' }, c.name),
        meta ? h('span', { class: 'trv-meta' }, meta) : null),
      h('button', { type: 'button', class: 'btn ghost small trv-edit', 'data-edit': c.code, 'aria-expanded': String(isOpen), 'aria-label': `Edit details for ${c.name}`,
        onclick: () => { editing = isOpen ? null : c.code; renderLists(); } }, isOpen ? 'Close' : 'Details'));
    const li = h('li', { class: 'trv-vrow', 'data-visited': c.code }, head);
    if (isOpen) {
      const years = h('input', { type: 'text', class: 'trv-years', maxlength: String(LIMITS.years), value: v.years, placeholder: 'e.g. 2019, 2022', autocomplete: 'off' });
      const note = h('textarea', { class: 'trv-note', rows: '3', maxlength: String(LIMITS.note), placeholder: 'Favorite memory, cities, tips…' });
      note.value = v.note;
      li.append(h('form', { class: 'trv-form', onsubmit: (e) => { e.preventDefault(); saveDetails(c.code, years.value, note.value); } },
        h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Year(s) visited'), years),
        h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Note'), note),
        h('div', { class: 'btnrow' },
          h('button', { type: 'submit', class: 'btn primary small trv-save' }, 'Save'),
          h('button', { type: 'button', class: 'btn danger small trv-remove', onclick: () => toggle(c.code) }, 'Remove country'))));
    }
    return li;
  }

  function renderLists(anchorEl) {
    const code = anchorEl && anchorEl.getAttribute('data-code');
    const before = anchorEl ? anchorEl.getBoundingClientRect().top : 0;
    const m = visitedMap();
    const q = norm(query);
    const n = doc.visited.length;
    countText.textContent = `${n} of ${TOTAL} countries`;
    bar.style.width = (n / TOTAL * 100).toFixed(1) + '%';
    clearSearch.hidden = !q;

    // Visited list (top): flag + name (+ years/note), in the order of the world list
    const vis = COUNTRIES.filter((c) => m.has(c.code));
    const visCard = h('section', { class: 'card trv-visited', id: 'trv-visited' },
      h('h2', { class: 'trv-h' }, 'Visited ', h('span', { class: 'trv-pill', id: 'trv-visited-count' }, `${n} of ${TOTAL} countries`)),
      vis.length
        ? h('ul', { class: 'trv-ul' }, vis.map((c) => visitedRow(c, m.get(c.code))))
        : h('p', { class: 'note', id: 'trv-none' }, 'No countries yet. Tick the ones you have been to below.'));

    // All countries grouped by continent
    const matches = (c) => !q || norm(c.name).includes(q) || norm(c.aliases).includes(q) || c.code.toLowerCase() === q;
    const groups = CONTINENTS.map((cont) => {
      const all = COUNTRIES.filter((c) => c.continent === cont);
      const shown = all.filter(matches);
      if (!shown.length) return null;
      const got = all.filter((c) => m.has(c.code)).length;
      const det = h('details', { class: 'group trv-group', 'data-continent': cont },
        h('summary', null, h('span', { class: 'trv-gname' }, cont), h('span', { class: 'trv-gcount' }, `${got}/${all.length}`)),
        h('ul', { class: 'trv-ul trv-all' }, shown.map((c) => checkRow(c, m.has(c.code)))));
      det.open = !!q || openGroups.has(cont);
      det.addEventListener('toggle', () => { if (!q) { det.open ? openGroups.add(cont) : openGroups.delete(cont); } });
      return det;
    }).filter(Boolean);

    lists.replaceChildren(
      visCard,
      h('h2', { class: 'sec' }, q ? `Search results` : 'All countries by continent'),
      ...(groups.length ? groups : [h('div', { class: 'card', id: 'trv-empty-search' }, h('p', { class: 'note' }, `No country matches “${query.trim()}”.`))]));

    if (code) { // keep the tapped row where the user's finger is, even though the Visited list above changed height
      const el = lists.querySelector(`input.trv-cb[data-code="${code}"]`);
      if (el) { window.scrollBy(0, el.getBoundingClientRect().top - before); el.focus({ preventScroll: true }); }
    }
  }

  const clearAll = h('button', { type: 'button', class: 'btn danger small', id: 'trv-clear-all', onclick: async () => {
    if (!doc.visited.length) return;
    if (!(await confirmDialog({ title: 'Clear all visited countries?', message: 'This removes every visited country, year and note from Travels on this device. Your Destinations are kept.', okLabel: 'Clear all', danger: true }))) return;
    doc.visited = []; editing = null;
    if (!(doc.destinations && doc.destinations.length)) store.clear(); else persist();
    toast('Visited countries cleared'); renderLists();
  } }, 'Clear all travels');

  const tabs = (active) => h('div', { class: 'trv-tabs', role: 'tablist', 'aria-label': 'Travels' },
    h('a', { class: 'trv-tab' + (active === 'visited' ? ' on' : ''), id: 'tab-visited', role: 'tab', 'aria-selected': String(active === 'visited'), href: '#/travels' },
      active === 'visited' ? h('span', { class: 'tab-pill', 'aria-hidden': 'true' }) : null, h('span', { class: 'tab-lbl' }, 'Visited')),
    h('a', { class: 'trv-tab' + (active === 'dest' ? ' on' : ''), id: 'tab-dest', role: 'tab', 'aria-selected': String(active === 'dest'), href: LIST_HASH },
      active === 'dest' ? h('span', { class: 'tab-pill', 'aria-hidden': 'true' }) : null,
      h('span', { class: 'tab-lbl' }, 'Destinations',
        newCount() ? h('span', { class: 'trv-tabbadge', id: 'tab-dest-new', 'aria-label': `${newCount()} new` }, String(newCount())) : null)));
  function newCount() { return (doc.destinations || []).filter((p) => !p.seen).length; }

  // ---- Destinations tab (list + detail) ----
  const m = /^#\/travels\/destinations(?:\/([^/?#]+))?\/?$/.exec(ctx.hash || '');
  if (m) {
    if (m[1]) {
      let id = ''; try { id = decodeURIComponent(m[1]); } catch { /* bad escape: not found */ }
      renderDetail(root, ctx, id);
      return;
    }
    document.title = 'Destinations · Travels · AI-TOR';
    root.append(
      h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home')),
      h('div', { class: 'fin-head' }, pageTitle('travels', 'Travels'), h('p', { class: 'asof' }, 'Places your Travel Guide suggests')),
      tabs('dest'));
    renderList(root, ctx);
    return;
  }

  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home')),
    h('div', { class: 'fin-head' }, pageTitle('travels', 'Travels'), h('p', { class: 'asof' }, 'Countries you have visited')),
    tabs('visited'),
    h('div', { class: 'card trv-top' }, countText, progress,
      h('p', { class: 'note' }, icon('lock'), 'Stored only on this device. Include it in backups via Settings > Export.')),
    h('div', { class: 'trv-searchrow' }, search, clearSearch),
    lists,
    h('div', { class: 'btnrow' }, clearAll));
  renderLists();
}
