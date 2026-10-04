import { h, CURRENCIES, setCurrency, formatMoney } from './util.js';
import { field, confirmDialog, toast } from './ui.js';
import * as storage from './storage.js';
import { buildExport, validateImport, applyImport, MAX_IMPORT_BYTES } from './dataio.js';
import { sections } from './sections.js';

export const APP_VERSION = '2.2.0';

export async function renderSettings(root, ctx) {
  document.title = 'Settings · AI-TOR';
  const core = storage.getCore();
  const name = h('input', { type: 'text', id: 'set-name', value: core.profile.name, maxlength: '60', autocomplete: 'given-name', placeholder: 'Your name' });
  const cur = h('select', { id: 'set-currency' }, CURRENCIES.map((c) => h('option', { value: c, selected: c === core.profile.currency }, `${c} · ${formatMoney(1234, c)}`)));
  const profileMsg = h('div', { class: 'note', id: 'profile-msg', role: 'status' });

  const saveProfile = (e) => {
    e.preventDefault();
    const next = { version: storage.CORE_VERSION, profile: { name: name.value.trim(), currency: cur.value } };
    try { storage.setCore(next); setCurrency(next.profile.currency); profileMsg.textContent = 'Saved.'; toast('Profile saved'); }
    catch (err) { console.warn(err); profileMsg.textContent = 'Could not save (storage blocked or full).'; }
  };

  // ---- export
  const exportBtn = h('button', { type: 'button', class: 'btn primary', id: 'export-btn', onclick: async () => {
    const data = await buildExport();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `ai-tor-export-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Export downloaded');
  } }, '⬇ Export data (JSON)');

  // ---- import
  const importMsg = h('div', { id: 'import-msg', role: 'status', class: 'note' });
  const showErrors = (errs, warns = []) => {
    importMsg.className = 'form-err'; importMsg.replaceChildren(h('b', null, 'Import failed. Nothing was changed.'), h('ul', null, errs.slice(0, 8).map((x) => h('li', null, x))), warns.length ? h('p', { class: 'note' }, warns.join(' ')) : null);
  };
  const fileInput = h('input', { type: 'file', id: 'import-file', accept: 'application/json,.json', class: 'file-input', onchange: async () => {
    const f = fileInput.files && fileInput.files[0];
    importMsg.className = 'note'; importMsg.textContent = '';
    if (!f) return;
    try {
      if (f.size > MAX_IMPORT_BYTES) return showErrors(['File is too large (max 5 MB).']);
      let obj;
      try { obj = JSON.parse(await f.text()); } catch { return showErrors(['This file is not valid JSON.']); }
      const v = await validateImport(obj);
      if (!v.ok) return showErrors(v.errors, v.warnings);
      const ok = await confirmDialog({
        title: 'Replace all data on this device?',
        message: 'Importing overwrites everything currently stored in AI-TOR on this device (profile and all sections).',
        details: [`Profile: ${v.result.profile.name || '(no name)'} · ${v.result.profile.currency}`, ...v.lines, ...v.warnings],
        okLabel: 'Import & overwrite', danger: true });
      if (!ok) { importMsg.textContent = 'Import cancelled. Nothing was changed.'; return; }
      applyImport(v.result);
      setCurrency(v.result.profile.currency);
      importMsg.className = 'note ok'; importMsg.textContent = 'Import complete.';
      toast('Import complete');
      ctx.rerender();
    } catch (e) { console.warn(e); showErrors(['Could not import: ' + (e && e.message || e)]); }
    finally { fileInput.value = ''; }
  } });

  // ---- example data
  const exampleBtn = h('button', { type: 'button', class: 'btn ghost', id: 'settings-example', onclick: async () => {
    const mod = await sections.find((s) => s.id === 'finances').loader();
    const existing = storage.section('finances').get();
    if (existing && !(await confirmDialog({ title: 'Replace your finances with example data?', message: 'Your current finances on this device will be overwritten by FAKE example data.', okLabel: 'Replace', danger: true }))) return;
    storage.section('finances').set(mod.exampleDoc());
    toast('Fake example data loaded');
    location.hash = '#/finances';
  } }, 'Load example data (fake)');

  // ---- erase
  const eraseBtn = h('button', { type: 'button', class: 'btn danger', id: 'erase-btn', onclick: async () => {
    const ok = await confirmDialog({ title: 'Erase all data?', message: 'This permanently deletes your profile and everything you entered on this device, including saved To-Do sync settings. Export a backup first if you might want it back.', okLabel: 'Erase everything', danger: true });
    if (!ok) return;
    storage.eraseAll(); setCurrency('USD');
    toast('All data erased');
    location.hash = '#/';
    ctx.rerender();
  } }, 'Erase all data');

  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, '‹ Home')),
    h('div', { class: 'fin-head' }, h('h1', null, 'Settings')),
    h('h2', { class: 'sec' }, 'Profile'),
    h('form', { class: 'card form', id: 'profile-form', onsubmit: saveProfile },
      field('Your name', name, 'Used for the greeting on the home screen'),
      field('Display currency', cur, 'Only changes how amounts are shown. Numbers are not converted.'),
      profileMsg,
      h('div', { class: 'btnrow' }, h('button', { type: 'submit', class: 'btn primary', id: 'save-profile' }, 'Save profile'))),
    h('h2', { class: 'sec' }, 'Your data'),
    h('div', { class: 'card stackc' },
      h('p', { class: 'note' }, 'Your data lives only in this browser on this device. Export a backup to keep it safe or move it to another device.'),
      exportBtn,
      h('label', { class: 'btn ghost filebtn' }, '⬆ Import data (JSON)', fileInput),
      importMsg,
      exampleBtn,
      h('p', { class: 'note' }, 'Example data is fake numbers for previewing the app.')),
    h('h2', { class: 'sec' }, 'Danger zone'),
    h('div', { class: 'card stackc' }, eraseBtn),
    h('h2', { class: 'sec' }, 'About'),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('div', { class: 'l' }, 'AI-TOR version'), h('div', { class: 'r' }, APP_VERSION)),
      h('div', { class: 'row' }, h('div', { class: 'l' }, 'Data format'), h('div', { class: 'r' }, 'schema 4')),
      h('p', { class: 'note', style: 'margin-top:8px' }, 'No accounts, no servers, no analytics. The app makes no network requests and works offline once opened. The only exception is the optional To-Do task sync, which (once you enter a passphrase) reads one encrypted file from this same site.')));
}
