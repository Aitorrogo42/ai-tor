// Finances section entry point. Routes: #/finances (dashboard) and #/finances/edit (add/edit data).
import { h, sectionIcon } from '../../js/util.js';
import { toast, confirmDialog } from '../../js/ui.js';
import { emptyDoc, isEmptyDoc, validate, exampleDoc, summary } from './model.js';
import { renderDashboard } from './dashboard.js';
import { renderEdit } from './edit.js';

export { validate, summary, emptyDoc, exampleDoc };
export const storageId = 'finances';
let pendingForm = null; // set by the empty-state button so the edit page opens with the account form

function emptyState(root, ctx) {
  document.title = 'Finances · AI-TOR';
  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, '‹ Home')),
    h('div', { class: 'fin-head' }, h('h1', { class: 'with-ico' }, sectionIcon('finances'), 'Finances')),
    h('div', { class: 'card empty', id: 'empty-state' },
      h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, '💰'),
      h('h2', null, 'Your finances, your device'),
      h('p', null, 'Add your accounts, debts, goals, and (optionally) income and expenses to see your net worth and a dashboard.'),
      h('p', { class: 'note' }, '🔒 Everything stays on this device. There is no account and nothing is uploaded.'),
      h('div', { class: 'btnrow col' },
        h('a', { class: 'btn primary big', id: 'add-finances', href: '#/finances/edit', onclick: () => { pendingForm = { kind: 'account', id: null }; } }, 'Add your finances'),
        h('button', { class: 'btn ghost', id: 'load-example', type: 'button', onclick: () => ctx.loadExample() }, 'Load example data'),
        h('p', { class: 'note' }, 'Example data is fake numbers, just to preview the dashboard. You can erase it any time.'))));
}

export async function render(root, ctx) {
  root.className = 'section-root fin';
  const store = ctx.store;
  const raw = store.get();
  let doc = emptyDoc();
  if (raw) {
    const v = validate(raw);
    if (!v.ok) {
      root.append(h('a', { class: 'back', href: '#/' }, '‹ Home'),
        h('div', { class: 'card error', id: 'corrupt' }, h('h2', null, 'Saved finances data looks damaged'), h('p', { class: 'note' }, v.errors.join(' ')),
          h('p', { class: 'note' }, 'You can restore a backup from Settings → Import, or reset this section.'),
          h('div', { class: 'btnrow' }, h('a', { class: 'btn ghost', href: '#/settings' }, 'Open Settings'),
            h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog({ title: 'Reset Finances data?', message: 'This deletes the saved finances on this device.', okLabel: 'Reset', danger: true })) { store.clear(); ctx.rerender(); } } }, 'Reset Finances'))));
      return;
    }
    doc = v.doc;
  }
  const api = {
    openForm: pendingForm,
    save(d) {
      d.updatedAt = new Date().toISOString();
      try { store.set(d); toast('Saved'); } catch (e) { console.warn(e); toast('Could not save: storage is full or blocked'); }
    },
    loadExample: async () => {
      if (!isEmptyDoc(doc) && !(await confirmDialog({ title: 'Replace your finances with example data?', message: 'Your current finances on this device will be overwritten by fake example data.', okLabel: 'Replace', danger: true }))) return;
      store.set(exampleDoc()); ctx.rerender();
    },
    clearExample: () => { store.clear(); ctx.rerender(); },
    keepExample: () => { doc.example = false; store.set(doc); ctx.rerender(); },
  };
  pendingForm = null;
  const editing = ctx.hash === '#/finances/edit';
  if (editing) {
    // keep a stable reference so edits made on `doc` persist across redraws
    renderEdit(root, doc, api);
  } else if (isEmptyDoc(doc)) emptyState(root, api);
  else renderDashboard(root, doc, api);
}
