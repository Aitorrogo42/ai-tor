import { h, CURRENCIES, setCurrency, formatMoney, pageTitle } from './util.js';
import { icon } from './icons.js';
import { lockup } from './brand.js';
import { field, confirmDialog, toast } from './ui.js';
import * as storage from './storage.js';
import { buildExport, validateImport, applyImport, MAX_IMPORT_BYTES } from './dataio.js';
import { sections } from './sections.js';
import { isDynamicBackground, setDynamicBackground, setBackgroundBody } from './bg.js';
import { THEMES, THEME_IDS } from './theme.js';

export const APP_VERSION = '2.17.2 (v47)';

// ---- v43: Share AI-TOR. Only the PUBLIC app link and a fixed line of text are ever shared: nothing from storage (feed topic, passphrase, name, data)
// goes into the payload. Friends who open the link start with an empty app. No network calls: Web Share API / clipboard are local browser features.
export const SHARE_URL = 'https://aitorrogo42.github.io/ai-tor/';
export const SHARE_DATA = Object.freeze({ title: 'AI-TOR', text: 'AI-TOR: my Mars-themed life organizer', url: SHARE_URL });

/** Copy the public link: async Clipboard API first, then the selectable field + execCommand('copy'). Resolves true when copied. */
export async function copyShareLink(field) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext !== false) { await navigator.clipboard.writeText(SHARE_URL); return true; }
  } catch { /* permission denied / not focused: use the fallback below */ }
  try {
    if (!field) return false;
    field.value = SHARE_URL; field.focus({ preventScroll: true }); field.select(); field.setSelectionRange(0, SHARE_URL.length);
    return !!(document.execCommand && document.execCommand('copy'));
  } catch { return false; }
}

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
  } }, icon('download'), 'Export data (JSON)');

  // ---- import
  const importMsg = h('div', { id: 'import-msg', role: 'status', class: 'note' });
  const showErrors = (errs, warns = []) => {
    importMsg.className = 'form-err'; importMsg.replaceChildren(...[h('b', null, 'Import failed. Nothing was changed.'), h('ul', null, errs.slice(0, 8).map((x) => h('li', null, x))), warns.length ? h('p', { class: 'note' }, warns.join(' ')) : null].filter(Boolean));   // v24: replaceChildren(null) used to print the word "null"
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
    const ok = await confirmDialog({ title: 'Erase all data?', message: 'This permanently deletes your profile and everything you entered on this device, including your Personal and Work to-do lists, your Architecture photo log and its photos, and the saved sync settings. Export a backup first if you might want it back.', okLabel: 'Erase everything', danger: true });
    if (!ok) return;
    storage.eraseAll(); setCurrency('USD');
    toast('All data erased');
    location.hash = '#/';
    ctx.rerender();
  } }, 'Erase all data');

  // ---- v21: dynamic sunrise background toggle (device-local, default on)
  const dyn = h('input', { type: 'checkbox', class: 'set-cb', id: 'set-dynbg', checked: isDynamicBackground(), onchange: () => { setDynamicBackground(dyn.checked); toast(dyn.checked ? 'Dynamic sunrise background on' : 'Dynamic sunrise background off'); } });

  // v38: the swatch is a tiny lit-globe picture of each body (assets/swatch-<id>.webp, 72 px, built by tools/make_theme_swatches.py; precached, ~6 KB total)
  const swatch = (id) => h('img', { class: 'sw', src: 'assets/swatch-' + id + '.webp', alt: '', width: 36, height: 36, decoding: 'async', draggable: 'false' });
  // ---- v38: theme (Mars / Earth / Moon): applies at once, saved on this device, included in exports
  const cur0 = document.documentElement.dataset.theme || 'mars';
  const picker = h('fieldset', { class: 'theme-pick', id: 'set-theme', role: 'radiogroup', 'aria-label': 'Theme' },
    h('legend', null, 'Theme'),
    THEME_IDS.map((id) => h('label', { class: 'theme-opt' + (id === cur0 ? ' on' : ''), 'data-theme-opt': id },
      h('input', { type: 'radio', name: 'theme', value: id, checked: id === cur0, onchange: async (e) => {
        if (!e.target.checked) return;
        picker.querySelectorAll('.theme-opt').forEach((l) => l.classList.toggle('on', l.dataset.themeOpt === id));
        await setBackgroundBody(id); toast(THEMES[id].label + ' theme');
      } }),
      swatch(id), h('span', { class: 'tl' }, THEMES[id].label))));

  // ---- v43: Share AI-TOR card
  const shareMsg = h('div', { class: 'note', id: 'share-msg', role: 'status', 'aria-live': 'polite', hidden: true });
  const linkField = h('input', { type: 'text', id: 'share-link', value: SHARE_URL, readonly: true, 'aria-label': 'AI-TOR link', autocomplete: 'off', spellcheck: 'false', onfocus: () => linkField.select() });
  const say = (msg, ok) => { shareMsg.className = 'note' + (ok ? ' ok' : ''); shareMsg.textContent = msg; shareMsg.hidden = !msg; };
  const doCopy = async () => {
    if (await copyShareLink(linkField)) { say('Link copied', true); toast('Link copied'); }
    else { linkField.focus({ preventScroll: true }); linkField.select(); say('Select the link above and copy it.'); }
  };
  const shareBtn = h('button', { type: 'button', class: 'btn primary', id: 'share-btn', onclick: async () => {
    say('');
    const canShare = typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(SHARE_DATA));
    if (!canShare) { await doCopy(); return; }   // no share sheet here (most desktop browsers): copy instead
    try { await navigator.share({ ...SHARE_DATA }); }
    catch (e) {
      if (e && e.name === 'AbortError') return;   // the user closed the share sheet: not an error
      await doCopy();                              // share sheet unavailable right now: fall back to copying the link
    }
  } }, icon('share'), 'Share AI-TOR');
  const copyBtn = h('button', { type: 'button', class: 'btn ghost', id: 'share-copy', onclick: doCopy }, 'Copy link');

  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home')),
    h('div', { class: 'fin-head' }, pageTitle('settings', 'Settings')),
    h('h2', { class: 'sec' }, 'Profile'),
    h('form', { class: 'card form', id: 'profile-form', onsubmit: saveProfile },
      field('Your name', name, 'Used for the greeting on the home screen'),
      field('Display currency', cur, 'Only changes how amounts are shown. Numbers are not converted.'),
      profileMsg,
      h('div', { class: 'btnrow' }, h('button', { type: 'submit', class: 'btn primary', id: 'save-profile' }, 'Save profile'))),
    h('h2', { class: 'sec' }, 'Background'),
    h('div', { class: 'card' },
      picker,
      h('p', { class: 'note theme-note', id: 'set-theme-note' }, 'Re-themes the whole app: planet, sky and colours. On the Moon the Earth rises where the Sun would. Retro redraws everything as 8-bit pixel art.'),
      h('label', { class: 'set-toggle', for: 'set-dynbg' }, dyn,
        h('span', { class: 'set-toggle-txt' }, h('span', { class: 'set-toggle-t' }, 'Dynamic sunrise background'),
          h('span', { class: 'note' }, 'On the home screen the planet moves through sunrise, day, sunset and night as you turn the wheel (one turn = one day). Inside a section the scene you opened stays still behind it. Off keeps the still planet.')))),
    h('h2', { class: 'sec' }, 'Share'),
    h('div', { class: 'card stackc', id: 'share-card' },
      h('p', { class: 'note' }, 'Share AI-TOR with friends. They get the app, not your data.'),
      shareBtn,
      linkField,
      copyBtn,
      shareMsg,
      h('p', { class: 'note', id: 'share-private' }, 'Friends start with an empty app. Your tasks, finances, photos and feeds stay private on your phone.'),
      h('p', { class: 'note', id: 'share-tip' }, 'Tip for friends: open the link in Safari, tap Share, then Add to Home Screen.')),
    h('h2', { class: 'sec' }, 'Your data'),
    h('div', { class: 'card stackc' },
      h('p', { class: 'note' }, 'Your data lives only in this browser on this device. Export a backup to keep it safe or move it to another device.'),
      exportBtn,
      h('label', { class: 'btn ghost filebtn' }, icon('upload'), 'Import data (JSON)', fileInput),
      importMsg,
      exampleBtn,
      h('p', { class: 'note' }, 'Example data is fake numbers for previewing the app.')),
    h('h2', { class: 'sec' }, 'Danger zone'),
    h('div', { class: 'card stackc' }, eraseBtn),
    h('h2', { class: 'sec' }, 'About'),
    h('div', { class: 'card' },
      h('div', { class: 'about-lockup', role: 'img', 'aria-label': 'ai-tor' }, lockup()),
      h('div', { class: 'row' }, h('div', { class: 'l' }, 'AI-TOR version'), h('div', { class: 'r' }, APP_VERSION)),
      h('div', { class: 'row' }, h('div', { class: 'l' }, 'Data format'), h('div', { class: 'r' }, 'schema 5')),
      h('p', { class: 'note', style: 'margin-top:8px' }, 'No accounts, no servers, no analytics. Your data stays on this device and the app works offline once opened. With your passphrase it reads encrypted feeds from this same site, and a photo you send for Architecture analysis leaves the phone encrypted (through the free ntfy.sh relay, which only sees scrambled data).')));
}
