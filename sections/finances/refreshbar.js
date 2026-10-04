// The "Refresh" bar shown on the Finances dashboard: button + spinner, "Updated <time> from feed", "as of" text, clear errors,
// and an inline passphrase prompt (the passphrase is shared with To-Do, see js/feedcrypto.js).
import { h } from '../../js/util.js';
import { toast } from '../../js/ui.js';
import { timeAgo } from '../../js/feedcrypto.js';
import * as feed from './feed.js';

function when(iso) {
  const d = new Date(iso); if (!Number.isFinite(d.getTime())) return '';
  const now = new Date(), same = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return same ? t : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + t;
}

/** doc: current finances doc (or null); rerender: redraws the finances page. Returns an element. */
export function refreshBar(doc, rerender) {
  const f = doc && doc.feed;
  const st = feed.getState();
  let busy = false, error = null, kind = null, askPass = false;
  if (st.lastError && (!st.lastRefreshAt || Date.parse(st.lastAttemptAt || '') > Date.parse(st.lastRefreshAt))) { error = st.lastError; kind = st.lastErrorKind; }
  const root = h('div', { class: 'card feedbar', id: 'feedbar' });
  // redraw the whole page when a refresh (manual, or automatic on app open) changed the numbers
  const onRefreshed = () => {
    if (!root.isConnected) { window.removeEventListener('aitor:finances-refreshed', onRefreshed); return; }
    if (location.hash === '#/finances' && rerender) rerender();
  };
  window.addEventListener('aitor:finances-refreshed', onRefreshed);

  async function run(passphrase = null) {
    busy = true; error = null; draw();
    const r = await feed.refresh({ passphrase });
    busy = false;
    if (r.ok) {
      askPass = false;
      const n = r.stats.changed;
      toast(n ? `Refreshed: ${n} change${n === 1 ? '' : 's'}` : 'Refreshed: already up to date');
      if (!root.isConnected) return;
      // the dashboard redraws itself on the refreshed event; if it did not (e.g. empty state) redraw this bar
      if (root.isConnected) { error = null; draw(); }
      return;
    }
    error = r.error; kind = r.kind;
    if (r.kind === 'nopass' || r.kind === 'passphrase') askPass = true;
    draw();
  }

  function draw() {
    const havePass = feed.hasPassphrase();
    const status = f && f.refreshedAt
      ? [h('div', { class: 'feed-upd', id: 'feed-updated' }, `Updated ${when(f.refreshedAt)} from feed`, h('span', { class: 'feed-ago' }, ` · ${timeAgo(f.refreshedAt)}`)),
         f.asOf ? h('div', { class: 'feed-asof', id: 'feed-asof' }, 'As of ' + f.asOf) : null]
      : [h('div', { class: 'feed-upd' }, havePass ? 'Not refreshed from your assistant yet' : 'Get the latest numbers from your assistant')];
    const btn = h('button', { class: 'btn primary small', id: 'refresh-btn', type: 'button', disabled: busy, 'aria-busy': busy ? 'true' : null,
      onclick: () => { if (!havePass) { askPass = true; error = null; draw(); const i = root.querySelector('#feed-pass'); if (i) i.focus(); } else run(); } },
      busy ? h('span', { class: 'spinner', id: 'refresh-spinner', 'aria-hidden': 'true' }) : h('span', { 'aria-hidden': 'true' }, '↻'), busy ? 'Refreshing…' : 'Refresh');
    const kids = [h('div', { class: 'feed-row' }, h('div', { class: 'feed-text', role: 'status' }, status), btn)];
    if (error && !busy) kids.push(h('div', { class: 'feed-err', id: 'feed-error', role: 'alert' }, error,
      f && f.refreshedAt ? h('div', { class: 'note' }, 'Still showing the numbers from ' + when(f.refreshedAt) + '.') : null));
    if (askPass && !busy) {
      const pass = h('input', { type: 'password', id: 'feed-pass', placeholder: 'Your passphrase', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: '200', 'aria-label': 'Passphrase' });
      kids.push(h('form', { class: 'feed-form', id: 'feed-form', onsubmit: (e) => {
        e.preventDefault();
        const errs = feed.checkPassphrase(pass.value);
        if (errs.length) { error = errs[0]; kind = 'nopass'; draw(); const i = root.querySelector('#feed-pass'); if (i) i.focus(); return; }
        run(pass.value);
      } },
        h('div', { class: 'note' }, havePass ? 'Enter the passphrase again. It is the same one used for To-Do.' : 'Enter your passphrase once. It stays on this device and is shared with To-Do.'),
        h('div', { class: 'feed-formrow' }, pass, h('button', { class: 'btn ghost small', id: 'feed-save', type: 'submit' }, 'Save & refresh'))));
    }
    if (f && f.notes && !busy) kids.push(h('details', { class: 'feed-notes', id: 'feed-notes' }, h('summary', null, 'Notes from your assistant'), h('p', { class: 'notes-text' }, f.notes)));
    root.replaceChildren(...kids);
  }
  draw();
  return root;
}
