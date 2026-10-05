// Architecture section (v24 / 2.8.0). A personal reference library in five categories: Materials, Famous Buildings, Architects, Designers, Consultants
// (Consultants carry a discipline: MEP, Structural, Security, IT, AV, Fire & Life Safety, Civil & Traffic, Facade, Lighting, Acoustics, Sustainability).
// Routes: #/architecture (dashboard with one card per category), #/architecture/<slug> (the category's list page). Local-first: one document in aitor:sec:architecture.
// The page is built only from the registry-provided ctx (store, hash, rerender); no network, no feed.
import { h, pageTitle, sectionIcon } from '../../js/util.js';
import { icon } from '../../js/icons.js';
import { toast, confirmDialog, field } from '../../js/ui.js';
import { CATEGORIES, DISCIPLINES, catBySlug, emptyDoc, isEmptyDoc, validate, summary, exampleDoc, cleanEntry, countBy, favCount, sortEntries, matches } from './model.js';

export { validate, summary, emptyDoc, exampleDoc };
export const storageId = 'architecture';

const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function render(root, ctx) {
  root.className = 'section-root fin arc';
  document.title = 'Architecture · AI-TOR';
  const store = ctx.store;
  const raw = store.get();
  let doc = emptyDoc();
  if (raw) {
    const v = validate(raw);
    if (!v.ok) {
      root.append(h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home'),
        h('div', { class: 'card error', id: 'corrupt' }, h('h2', null, 'Saved architecture data looks damaged'), h('p', { class: 'note' }, v.errors.join(' ')),
          h('p', { class: 'note' }, 'You can restore a backup from Settings > Import, or reset this section.'),
          h('div', { class: 'btnrow' }, h('a', { class: 'btn ghost', href: '#/settings' }, 'Open Settings'),
            h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog({ title: 'Reset Architecture data?', message: 'This deletes the saved architecture library on this device.', okLabel: 'Reset', danger: true })) { store.clear(); ctx.rerender(); } } }, 'Reset Architecture'))));
      return;
    }
    doc = v.doc;
  }
  const persist = () => {
    doc.updatedAt = new Date().toISOString();
    try { store.set(doc); return true; } catch (e) { console.warn(e); toast('Could not save: storage is full or blocked'); return false; }
  };
  const slug = (ctx.hash || '').replace(/^#\/architecture\/?/, '').split('/')[0];
  const cat = slug ? catBySlug(slug) : null;
  if (cat) renderCategory(root, cat, doc, persist);
  else renderHome(root, doc, persist, ctx);
}

// ---------------------------------------------------------------- dashboard
function renderHome(root, doc, persist, ctx) {
  const total = doc.entries.length;
  const favs = favCount(doc);
  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home')),
    h('div', { class: 'fin-head' }, pageTitle('architecture', 'Architecture'),
      h('div', { class: 'asof', id: 'arc-total' }, total ? `${pl(total, 'entry', 'entries')} · ${pl(favs, 'favorite', 'favorites')}` : 'Your library of materials, buildings and people')));
  if (doc.example) {
    root.append(h('div', { class: 'banner example', id: 'example-banner' }, h('b', null, 'Fake example data. '), 'These entries are made up to show how AI-TOR looks.',
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn ghost small', type: 'button', id: 'arc-clear-example', onclick: () => { ctx.store.clear(); ctx.rerender(); } }, 'Clear example & start fresh'),
        h('button', { class: 'btn ghost small', type: 'button', id: 'arc-keep-example', onclick: () => { doc.example = false; persist(); ctx.rerender(); } }, 'Keep & edit as mine'))));
  }
  if (!total) {
    root.append(h('div', { class: 'card empty', id: 'empty-state' },
      h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, sectionIcon('architecture', 56)),
      h('h2', null, 'Start your library'),
      h('p', null, 'Open a category below and add your first entry. Nothing is required: leave it empty until you have something worth saving.'),
      h('p', { class: 'note' }, icon('lock'), 'Everything stays on this device. There is no account and nothing is uploaded.'),
      h('div', { class: 'btnrow col' },
        h('button', { class: 'btn ghost', id: 'load-example', type: 'button', onclick: () => { ctx.store.set(exampleDoc()); ctx.rerender(); } }, 'Load example data'),
        h('p', { class: 'note' }, 'Example data is fake, just to preview the pages. You can erase it any time.'))));
  }
  root.append(h('h2', { class: 'sec' }, 'Categories'),
    h('div', { class: 'arc-cats' }, CATEGORIES.map((c) => {
      const n = countBy(doc, c.cat);
      return h('a', { class: 'card arc-card', href: '#/architecture/' + c.slug, 'data-cat': c.cat },
        h('span', { class: 'arc-card-text' },
          h('span', { class: 'arc-card-title' }, c.title),
          h('span', { class: 'arc-card-sub' }, c.blurb)),
        h('span', { class: 'arc-card-count', 'aria-label': pl(n, 'entry', 'entries') }, h('b', { class: 'arc-n' }, String(n)), h('span', { class: 'arc-n-l' }, n === 1 ? 'entry' : 'entries')),
        h('span', { class: 'chev', 'aria-hidden': 'true' }, icon('chevR', 'ico chev-ico')));
    })),
    h('div', { class: 'card arc-disc-card', id: 'arc-disc-note' }, h('div', { class: 'k' }, 'Consultant disciplines'),
      h('div', { class: 'arc-disc-list' }, DISCIPLINES.map((d) => h('span', { class: 'chip' }, d)))));
}

// ---------------------------------------------------------------- category page
function renderCategory(root, cat, doc, persist) {
  document.title = cat.title + ' · Architecture · AI-TOR';
  const state = { q: '', disc: 'all', favs: false, editing: null /* entry id | 'new' | null */ };
  const isCons = cat.cat === 'consultants';

  const countEl = h('div', { class: 'asof', id: 'arc-count' });
  const search = h('input', { type: 'search', class: 'trv-search arc-search', id: 'arc-search', placeholder: `Search ${cat.title.toLowerCase()}…`, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': `Search ${cat.title}`,
    oninput: () => { state.q = search.value; drawList(); } });
  const chips = h('div', { class: 'dst-chips arc-chips', id: 'arc-chips', role: 'group', 'aria-label': isCons ? 'Filter by discipline' : 'Filter' });
  const formBox = h('div', { class: 'arc-formbox', id: 'arc-formbox' });
  const listBox = h('div', { class: 'dst-listbox arc-listbox', id: 'arc-listbox' });
  const addBtn = h('button', { type: 'button', class: 'btn primary add', id: 'arc-add', onclick: () => openForm('new') }, icon('plus'), `Add ${cat.one}`);

  const mine = () => doc.entries.filter((e) => e.cat === cat.cat);

  function drawChips() {
    const all = mine();
    const bits = [];
    if (isCons) {
      bits.push(h('button', { type: 'button', class: 'dst-chip' + (state.disc === 'all' ? ' on' : ''), 'data-disc': 'all', 'aria-pressed': String(state.disc === 'all'), onclick: () => { state.disc = 'all'; drawList(); } }, 'All'));
      for (const d of DISCIPLINES) {
        const n = all.filter((e) => e.discipline === d).length;
        bits.push(h('button', { type: 'button', class: 'dst-chip' + (state.disc === d ? ' on' : ''), 'data-disc': d, 'aria-pressed': String(state.disc === d), onclick: () => { state.disc = d; drawList(); } }, d, n ? h('span', { class: 'arc-chip-n' }, String(n)) : null));
      }
    }
    bits.push(h('button', { type: 'button', class: 'dst-chip' + (state.favs ? ' on' : ''), id: 'arc-favs', 'aria-pressed': String(state.favs), onclick: () => { state.favs = !state.favs; drawList(); } }, icon('star', 'ico', { filled: state.favs }), 'Favorites'));
    chips.replaceChildren(...bits);
    chips.hidden = all.length === 0;
    searchRow.hidden = all.length === 0;
  }
  const searchRow = h('div', { class: 'arc-searchrow' }, search);

  function row(e) {
    const meta = cat.fields.filter((f) => f.key !== 'contact' && e[f.key]).map((f) => e[f.key]).join(' · ');
    let host = '';
    if (e.link) { try { host = new URL(e.link).hostname.replace(/^www\./, ''); } catch { host = e.link; } }
    return h('li', { class: 'dst-row arc-row', 'data-entry': e.id },
      h('div', { class: 'arc-main' },
        h('span', { class: 'arc-name' }, e.name),
        meta ? h('span', { class: 'arc-meta' }, meta) : null,
        e.contact ? h('span', { class: 'arc-meta arc-contact' }, e.contact) : null,
        e.notes ? h('span', { class: 'arc-notes' }, e.notes) : null,
        e.link ? h('a', { class: 'arc-link', href: e.link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open link: ' + host }, host, icon('external', 'ico dst-ext')) : null,
        h('span', { class: 'arc-acts' },
          h('button', { type: 'button', class: 'btn ghost small', 'data-edit': e.id, 'aria-label': 'Edit ' + e.name, onclick: () => openForm(e.id) }, icon('edit'), 'Edit'),
          h('button', { type: 'button', class: 'btn ghost small', 'data-del': e.id, 'aria-label': 'Delete ' + e.name, onclick: () => del(e) }, icon('close'), 'Delete'))),
      h('button', { type: 'button', class: 'dst-star arc-star' + (e.fav ? ' on' : ''), 'data-star': e.id, 'aria-pressed': String(e.fav), 'aria-label': (e.fav ? 'Remove favorite: ' : 'Favorite: ') + e.name,
        onclick: () => { e.fav = !e.fav; e.updatedAt = new Date().toISOString(); persist(); drawList(); } }, icon('star', 'ico ico-lg', { filled: e.fav })));
  }

  async function del(e) {
    if (!(await confirmDialog({ title: `Delete “${e.name}”?`, message: 'This removes the entry from this device. Export a backup first if you might want it back.', okLabel: 'Delete', danger: true }))) return;
    doc.entries = doc.entries.filter((x) => x.id !== e.id);
    persist(); toast('Deleted'); drawList();
  }

  function drawList() {
    const all = mine();
    countEl.textContent = all.length ? `${pl(all.length, cat.one, cat.many)} · ${pl(all.filter((e) => e.fav).length, 'favorite', 'favorites')}` : 'Nothing here yet';
    drawChips();
    const shown = sortEntries(all.filter((e) => (!isCons || state.disc === 'all' || e.discipline === state.disc) && (!state.favs || e.fav) && matches(e, state.q)));
    if (!all.length) {
      listBox.replaceChildren(h('div', { class: 'card empty arc-empty', id: 'arc-empty' },
        h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, sectionIcon('architecture', 48)),
        h('h2', null, `No ${cat.title.toLowerCase()} yet`),
        h('p', null, cat.empty),
        state.editing ? null : h('div', { class: 'btnrow col' }, h('button', { type: 'button', class: 'btn ghost', id: 'arc-empty-add', onclick: () => openForm('new') }, icon('plus'), `Add the first ${cat.one}`))));
    } else if (!shown.length) {
      listBox.replaceChildren(h('div', { class: 'card', id: 'arc-nomatch' }, h('p', { class: 'note' }, 'Nothing matches your search or filter.')));
    } else {
      listBox.replaceChildren(h('ul', { class: 'dst-ul arc-ul', id: 'arc-ul' }, shown.map(row)));
    }
    addBtn.hidden = !!state.editing;
  }

  function openForm(which) {
    state.editing = which;
    const editing = which === 'new' ? null : doc.entries.find((x) => x.id === which);
    const val = (k) => (editing ? editing[k] || '' : '');
    const inputs = {};
    const mkInput = (key, label, o = {}) => {
      let el;
      if (o.select) {
        el = h('select', { id: 'arc-f-' + key, name: key, 'aria-required': o.required ? 'true' : null },
          h('option', { value: '' }, o.required ? 'Choose a discipline…' : '—'), o.select.map((d) => h('option', { value: d, selected: val(key) === d }, d)));
      } else if (o.area) {
        el = h('textarea', { id: 'arc-f-' + key, name: key, rows: '4', maxlength: String(o.max), placeholder: o.ph || '' }); el.value = val(key);
      } else {
        el = h('input', { type: 'text', id: 'arc-f-' + key, name: key, maxlength: String(o.max || 120), placeholder: o.ph || '', autocomplete: 'off', 'aria-required': o.required ? 'true' : null,
          inputmode: o.inputmode || null }); el.value = val(key);
      }
      inputs[key] = el;
      return field(label + (o.required ? ' *' : ''), el);
    };
    const err = h('div', { class: 'form-err', id: 'arc-form-err', role: 'alert', hidden: true });
    const save = (ev) => {
      ev.preventDefault();
      const vals = { id: editing ? editing.id : undefined, createdAt: editing ? editing.createdAt : undefined, fav: editing ? editing.fav : false };
      for (const [k, el] of Object.entries(inputs)) vals[k] = el.value;
      const r = cleanEntry(vals, cat.cat);
      if (!r.ok) { err.hidden = false; err.replaceChildren(h('b', null, 'Could not save.'), h('ul', null, r.errors.map((m) => h('li', null, m)))); return; }
      if (editing) Object.assign(editing, r.entry); else doc.entries.push(r.entry);
      if (!persist()) return;
      toast(editing ? 'Saved' : `${cat.one[0].toUpperCase() + cat.one.slice(1)} added`);
      state.editing = null;
      // never hide what was just saved behind an old search / filter
      if (!matches(r.entry, state.q)) { state.q = ''; search.value = ''; }
      if (isCons && state.disc !== 'all' && r.entry.discipline !== state.disc) state.disc = 'all';
      if (state.favs && !r.entry.fav) state.favs = false;
      formBox.replaceChildren(); drawList();
    };
    const form = h('form', { class: 'card form arc-form', id: 'arc-form', novalidate: true, onsubmit: save },
      h('h3', null, editing ? `Edit ${cat.one}` : `Add ${cat.one}`),
      mkInput('name', 'Name', { required: true, max: 120, ph: 'Name' }),
      cat.fields.map((f) => mkInput(f.key, f.label, f)),
      mkInput('link', 'Link (optional)', { max: 400, ph: 'https://…', inputmode: 'url' }),
      mkInput('notes', 'Notes', { area: true, max: 2000, ph: 'Anything worth remembering' }),
      err,
      h('div', { class: 'btnrow' },
        h('button', { type: 'submit', class: 'btn primary', id: 'arc-save' }, 'Save'),
        h('button', { type: 'button', class: 'btn ghost', id: 'arc-cancel', onclick: () => { state.editing = null; formBox.replaceChildren(); drawList(); } }, 'Cancel')));
    formBox.replaceChildren(form);
    drawList();
    inputs.name.focus({ preventScroll: true });
    form.scrollIntoView({ block: 'nearest' });
  }

  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/architecture' }, icon('chevL'), 'Architecture')),
    h('div', { class: 'fin-head' }, pageTitle('architecture', cat.title), countEl),
    addBtn, formBox, searchRow, chips, listBox);
  drawList();
}
