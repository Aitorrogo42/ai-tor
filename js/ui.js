import { h } from './util.js';

/** In-page confirm dialog (works in installed PWAs). Resolves true/false. */
export function confirmDialog({ title, message, details, okLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const done = (v) => { overlay.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    const cancel = h('button', { type: 'button', class: 'btn ghost', 'data-act': 'cancel', onclick: () => done(false) }, cancelLabel);
    const ok = h('button', { type: 'button', class: 'btn ' + (danger ? 'danger' : 'primary'), 'data-act': 'confirm', onclick: () => done(true) }, okLabel);
    const overlay = h('div', { class: 'overlay', role: 'presentation', onclick: (e) => { if (e.target === overlay) done(false); } },
      h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', null, title),
        message ? h('p', null, message) : null,
        details && details.length ? h('ul', { class: 'dlg-details' }, details.map((d) => h('li', null, d))) : null,
        h('div', { class: 'dlg-actions' }, cancel, ok)));
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    cancel.focus();
  });
}

export function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

/** Labeled field wrapper. */
export const field = (label, input, hint) =>
  h('label', { class: 'fld' }, h('span', { class: 'fl' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
