// v42: Architecture photo log UI. Camera / import button, preview sheet (location + note), pending strip, review page (approve each tag), photo log list
// and entry page. Photos: IndexedDB (photodb.js). Requests / results: photo-feed.js. Entries: the Architecture document (model.js photoLog).
// Text is always set as text (h() never uses innerHTML); every link is re-validated by model.tagLinks (Google Shopping / Grokipedia only).
import { h, pageTitle, sectionIcon } from '../../js/util.js';
import { icon } from '../../js/icons.js';
import { toast, confirmDialog, field } from '../../js/ui.js';
import { readExif } from './exif.js';
import { putPhoto, getPhoto, deletePhoto, photoURL, photoIds } from './photodb.js';
import * as feed from './photo-feed.js';
import { cleanPhotoEntry, cleanTag, sortPhotos, confWord, TAG_TYPES, PLIM, tagLinks } from './model.js';

export const FULL_EDGE = 1600, THUMB_EDGE = 320, FULL_Q = 0.82, THUMB_Q = 0.75;
const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fmtTime = (iso) => { const t = Date.parse(iso || ''); return t ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''; };
const fmtDay = (iso) => { const t = Date.parse(iso || ''); return t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''; };
const TYPE_LABEL = { material: 'Material', style: 'Style' };

// object URLs made for the current page; released on the next render
let liveURLs = [];
export function releaseURLs() { liveURLs.forEach((u) => URL.revokeObjectURL(u)); liveURLs = []; }
const keep = (u) => { if (u) liveURLs.push(u); return u; };
/** <img> that fills itself from IndexedDB ('thumb' | 'full'); shows a placeholder when the photo is not on this device. */
function storedImg(photoId, which, cls, alt, id) {
  const img = h('img', { class: cls, alt: alt || '', decoding: 'async', draggable: 'false', id: id || null });
  const box = h('span', { class: cls + '-box arc-imgbox', 'data-photo-id': photoId || '' }, img);
  photoURL(photoId, which).then((u) => {
    if (!u) { box.classList.add('missing'); box.replaceChildren(h('span', { class: 'arc-nophoto' }, icon('image'), which === 'full' ? 'Photo not on this device' : '')); return; }
    img.src = keep(u);
  });
  return box;
}
function viewer(photoId, alt) {
  photoURL(photoId, 'full').then((u) => {
    if (!u) return;
    keep(u);
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const ov = h('div', { class: 'overlay arc-viewer', id: 'arc-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo', onclick: close },
      h('img', { src: u, alt: alt || '' }),
      h('button', { type: 'button', class: 'btn ghost small arc-viewer-x', 'aria-label': 'Close photo' }, icon('close')));
    document.body.append(ov); document.addEventListener('keydown', onKey);
  });
}
function typeChip(type) {
  return h('span', { class: `arc-tchip ${type}`, 'data-type': type }, icon(type, 'ico arc-tchip-ico'), TYPE_LABEL[type]);
}
function confView(c) {
  if (c == null) return h('span', { class: 'arc-conf own' }, 'Your tag');
  const pc = Math.round(c * 100);
  return h('span', { class: 'arc-conf', 'aria-label': `${pc} percent confidence, ${confWord(c)}` },
    h('span', { class: 'arc-meter', 'aria-hidden': 'true' }, h('i', { style: `width:${pc}%` })), h('b', null, pc + '%'), ' · ' + confWord(c));
}
function linkFor(t) {
  const L = tagLinks(t.type, t.label, t.url, t.fallback);
  if (t.type === 'material') return [h('a', { class: 'btn ghost small arc-tlink', href: L.url, target: '_blank', rel: 'noopener noreferrer', 'data-link': 'shop' }, 'Shop on Google', icon('external', 'ico dst-ext'))];
  const isPage = /^https:\/\/grokipedia\.com\/page\//.test(L.url);
  return [h('a', { class: 'btn ghost small arc-tlink', href: L.url, target: '_blank', rel: 'noopener noreferrer', 'data-link': isPage ? 'grokipedia' : 'grokipedia-search' }, isPage ? 'Read on Grokipedia' : 'Search Grokipedia', icon('external', 'ico dst-ext')),
    isPage ? h('a', { class: 'arc-tlink-fb', href: L.fallback, target: '_blank', rel: 'noopener noreferrer', 'data-link': 'grokipedia-fallback' }, 'No article? Search instead') : null];
}

// ---------------------------------------------------------------- capture: action sheet -> file -> preview sheet
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back to <img> */ } }
  const url = URL.createObjectURL(file);
  const img = new Image(); img.decoding = 'async'; img.src = url;
  try { await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error('decode'); }
  img._revoke = () => URL.revokeObjectURL(url);
  return img;
}
function toJpeg(src, maxEdge, q) {
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  const s = Math.min(1, maxEdge / Math.max(w0, h0)); const w = Math.max(1, Math.round(w0 * s)), hh = Math.max(1, Math.round(h0 * s));
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, hh);
  return new Promise((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((buf) => res({ buf, w, h: hh }), rej) : rej(new Error('encode'))), 'image/jpeg', q));
}
/** File -> { full, thumb, w, h, exif } (re-encoded JPEGs: no metadata leaves the phone). */
export async function processFile(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('That file is not a photo.');
  if (file.size > 40 * 1024 * 1024) throw new Error('That photo is too large (over 40 MB).');
  const buf = await file.arrayBuffer();
  const exif = readExif(buf);
  let src;
  try { src = await decodeImage(file); } catch { throw new Error('This photo format cannot be read here. Choose a JPEG or PNG (on iPhone: Settings › Camera › Formats › Most Compatible).'); }
  try {
    const full = await toJpeg(src, FULL_EDGE, FULL_Q), thumb = await toJpeg(src, THUMB_EDGE, THUMB_Q);
    return { full: full.buf, thumb: thumb.buf, w: full.w, h: full.h, exif };
  } finally { if (src.close) src.close(); if (src._revoke) src._revoke(); }
}

/** The camera button. `onDone` runs after a photo was queued / sent. */
export function cameraButton(onDone, id = 'arc-cam') {
  return h('button', { type: 'button', class: 'btn primary arc-cam', id, onclick: () => openCapture(onDone) }, icon('camera', 'ico arc-cam-ico'), 'Analyze a photo');
}
export function openCapture(onDone) {
  const take = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'file-input', id: 'arc-file-take', onchange: () => pick(take, true) });
  const lib = h('input', { type: 'file', accept: 'image/*', class: 'file-input', id: 'arc-file-pick', onchange: () => pick(lib, false) });
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  async function pick(input, fromCamera) {
    const f = input.files && input.files[0];
    if (!f) return;
    sheetBody.replaceChildren(h('p', { class: 'note arc-working', role: 'status' }, 'Preparing the photo…'));
    try { const ph = await processFile(f); close(); openPreview(ph, fromCamera, onDone); }
    catch (e) { close(); toast(e && e.message ? e.message : 'Could not read that photo.'); }
  }
  const sheetBody = h('div', { class: 'arc-sheet-acts' },
    h('label', { class: 'btn primary filebtn', id: 'arc-take' }, icon('camera'), 'Take photo', take),
    h('label', { class: 'btn ghost filebtn', id: 'arc-pick' }, icon('image'), 'Choose from library', lib),
    h('button', { type: 'button', class: 'btn ghost', id: 'arc-cap-cancel', onclick: close }, 'Cancel'));
  const ov = h('div', { class: 'overlay arc-actionsheet', role: 'presentation', onclick: (e) => { if (e.target === ov) close(); } },
    h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Analyze a photo', id: 'arc-capture' },
      h('h2', null, 'Analyze a photo'),
      h('p', null, 'We suggest the materials and architectural styles we see. You approve each one before anything is logged.'),
      sheetBody));
  document.body.append(ov); document.addEventListener('keydown', onKey);
  ov.querySelector('#arc-take').focus?.();
}

function openPreview(ph, fromCamera, onDone) {
  const st = { loc: null, locMsg: '' };    // loc: {lat,lon,acc_m,source} | {text,source:'manual'} | null
  if (ph.exif.lat != null) st.loc = { lat: ph.exif.lat, lon: ph.exif.lon, source: 'exif' };
  const previewURL = URL.createObjectURL(new Blob([ph.full], { type: 'image/jpeg' }));
  const close = () => { ov.remove(); URL.revokeObjectURL(previewURL); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const locBox = h('div', { class: 'arc-locbox', id: 'arc-locbox' });
  const note = h('textarea', { id: 'arc-note', rows: '2', maxlength: String(PLIM.note), placeholder: 'Optional: what is it, anything to look at?' });
  const needPass = !feed.hasPassphrase();
  const pass = needPass ? h('input', { type: 'password', id: 'arc-pass', autocomplete: 'current-password', placeholder: 'Your AI-TOR passphrase', maxlength: '200' }) : null;
  const err = h('div', { class: 'form-err', id: 'arc-send-err', role: 'alert', hidden: true });
  function here() {
    if (!navigator.geolocation) { st.locMsg = 'This browser cannot share your location.'; drawLoc(); return; }
    st.locMsg = 'Finding your location…'; drawLoc();
    navigator.geolocation.getCurrentPosition((p) => {
      st.loc = { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), acc_m: Math.round(p.coords.accuracy || 0), source: 'device' }; st.locMsg = ''; drawLoc();
    }, (e) => { st.locMsg = e && e.code === 1 ? 'Location permission was declined. You can type a place instead.' : 'Could not get your location. You can type a place instead.'; drawLoc(); },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  function typed() {
    const inp = h('input', { type: 'text', id: 'arc-loc-text', maxlength: String(PLIM.place), placeholder: 'e.g. Notre-Dame, Paris', autocomplete: 'off' });
    const ok = h('button', { type: 'button', class: 'btn ghost small', id: 'arc-loc-text-ok', onclick: () => { const v = inp.value.trim(); if (v) { st.loc = { text: v, source: 'manual' }; st.locMsg = ''; drawLoc(); } } }, 'Use');
    locBox.replaceChildren(h('div', { class: 'arc-loc-row' }, inp, ok)); inp.focus();
  }
  function drawLoc() {
    const L = st.loc;
    const line = L ? (L.source === 'manual' ? L.text : `${L.source === 'exif' ? 'From the photo' : 'Your current location'} · ${L.lat.toFixed(4)}, ${L.lon.toFixed(4)}${L.acc_m ? ` (±${L.acc_m} m)` : ''}`) : 'No location';
    locBox.replaceChildren(...[
      h('div', { class: 'arc-loc-line', id: 'arc-loc-line', 'data-source': L ? L.source : 'none' }, icon('pin'), h('span', null, line)),
      L && L.source !== 'manual' ? h('p', { class: 'note' }, 'The place name is looked up during the analysis.') : null,
      st.locMsg ? h('p', { class: 'note', id: 'arc-loc-msg', role: 'status' }, st.locMsg) : null,
      h('div', { class: 'arc-loc-acts' },
        L && L.source === 'exif' ? null : h('button', { type: 'button', class: 'btn ghost small', id: 'arc-loc-here', onclick: here }, icon('pin'), 'Use my current location'),
        h('button', { type: 'button', class: 'btn ghost small', id: 'arc-loc-type', onclick: typed }, icon('edit'), 'Type a place'),
        L ? h('button', { type: 'button', class: 'btn ghost small', id: 'arc-loc-none', onclick: () => { st.loc = null; st.locMsg = ''; drawLoc(); } }, icon('close'), 'No location') : null)].filter(Boolean));   // replaceChildren(null) would print "null"
  }
  drawLoc();
  if (!st.loc && fromCamera) here();           // a photo taken just now: where you are is where it was taken
  const sendBtn = h('button', { type: 'button', class: 'btn primary', id: 'arc-send', onclick: async () => {
    err.hidden = true;
    if (needPass) {
      const errs = feed.checkPassphrase(pass.value);
      if (errs.length) { err.hidden = false; err.textContent = errs[0]; return; }
      sendBtn.disabled = true; sendBtn.textContent = 'Checking passphrase…';
      const r = await feed.refresh({ passphrase: pass.value });
      sendBtn.disabled = false; sendBtn.replaceChildren(icon('upload'), 'Send for analysis');
      if (!r.ok && r.kind !== 'http' && r.kind !== 'offline' && r.kind !== 'network' && r.kind !== 'timeout') { err.hidden = false; err.textContent = r.error; return; }
      if (!r.ok) { err.hidden = false; err.textContent = r.error + ' (Your passphrase can only be checked once the results feed is available.)'; return; }
    }
    const photoId = 'ph_' + feed.newRequestId().slice(3);
    const reqId = feed.newRequestId();
    try { await putPhoto({ id: photoId, mime: 'image/jpeg', full: ph.full, thumb: ph.thumb, w: ph.w, h: ph.h, createdAt: new Date().toISOString() }); }
    catch (e) { err.hidden = false; err.textContent = 'Could not save the photo on this device (storage full or blocked).'; return; }
    try { await import('../../js/storage.js').then((m) => m.requestPersistence()); } catch { /* best effort */ }
    if (!feed.addPending({ id: reqId, photoId, createdAt: new Date().toISOString(), takenAt: ph.exif.takenAt || null, location: st.loc, note: note.value.trim().slice(0, PLIM.note) })) {
      await deletePhoto(photoId).catch(() => {}); err.hidden = false; err.textContent = 'Too many photos are waiting already. Review or cancel one first.'; return;
    }
    close();
    toast('Encrypting and sending…');
    const r = await feed.send(reqId);
    toast(r.ok ? 'Sent. Results usually arrive in 10–25 minutes.' : r.kind === 'noinbox' || r.kind === 'offline' ? 'Saved. It is sent automatically when possible.' : (r.error || 'Saved. It is tried again soon.'));
    if (onDone) onDone(reqId);
  } }, icon('upload'), 'Send for analysis');
  const ov = h('div', { class: 'overlay arc-sheetov', role: 'presentation' },
    h('div', { class: 'dialog arc-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Send photo for analysis', id: 'arc-preview' },
      h('h2', null, 'Send for analysis'),
      h('img', { class: 'arc-preview-img', id: 'arc-preview-img', src: previewURL, alt: 'The photo you picked' }),
      h('div', { class: 'k' }, 'Location'), locBox,
      field('Note (optional)', note),
      needPass ? field('Passphrase', pass, 'The same one as your feeds. It never leaves this device; it encrypts the photo.') : null,
      h('p', { class: 'note' }, icon('lock'), 'The photo is encrypted on this phone before it leaves, and the copy we analyze is deleted right after. Your copy stays on this phone.'),
      err,
      h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn ghost', id: 'arc-prev-cancel', onclick: close }, 'Cancel'), sendBtn)));
  document.body.append(ov); document.addEventListener('keydown', onKey);
}

// ---------------------------------------------------------------- dashboard block (camera + pending strip + log card)
function pendingRow(p, redraw) {
  const r = feed.resultFor(p.id);
  let status, cls = '';
  const slow = p.status === 'sent' && Date.now() - (Date.parse(p.sentAt || '') || Date.now()) > feed.SLOW_AFTER_MS;
  if (p.status === 'ready' && r) { cls = 'ready'; status = r.status === 'failed' ? 'Could not be analyzed' : r.status === 'unclear' ? 'Ready to review (unsure)' : `Ready to review · ${pl(r.tags.length, 'suggestion', 'suggestions')}`; }
  else if (p.status === 'sent') { status = slow ? `Sent ${fmtTime(p.sentAt)} · taking longer than usual` : `Sent ${fmtTime(p.sentAt)} · results usually in 10–25 min`; }
  else if (p.status === 'failed') { cls = 'err'; status = p.lastError || 'Could not be sent'; }
  else { status = feed.isSending(p.id) ? 'Encrypting and sending…' : (p.lastError ? 'Waiting to send · ' + p.lastError : 'Waiting to send'); }
  const cancel = async () => {
    if (!(await confirmDialog({ title: 'Remove this photo?', message: 'It is removed from this device and its result (if any) is ignored.', okLabel: 'Remove', danger: true }))) return;
    feed.removePending(p.id); await deletePhoto(p.photoId).catch(() => {}); redraw();
  };
  return h('li', { class: 'arc-pend ' + cls, 'data-req': p.id, 'data-status': p.status },
    storedImg(p.photoId, 'thumb', 'arc-thumb', ''),
    h('div', { class: 'arc-pend-main' },
      h('span', { class: 'arc-pend-st' }, p.status === 'ready' ? h('span', { class: 'arc-ready' }, 'Ready') : p.status === 'sent' ? icon('clock') : null, h('span', null, status)),
      h('span', { class: 'arc-pend-acts' },
        p.status === 'ready' ? h('a', { class: 'btn primary small', href: '#/architecture/review/' + p.id, 'data-review': p.id }, 'Review') : null,
        // v42: the relay deletes an unread upload after ~3 h (e.g. sent late at night); the photo is still on the phone, so offer to send it again
        slow ? h('button', { type: 'button', class: 'btn ghost small', 'data-resend': p.id, onclick: async () => { feed.updatePending(p.id, { status: 'queued', nextTryAt: null, lastError: null }); redraw(); await feed.send(p.id); redraw(); } }, icon('refresh'), 'Send again') : null,
        p.status === 'queued' && p.lastError ? h('button', { type: 'button', class: 'btn ghost small', 'data-retry': p.id, onclick: async () => { feed.updatePending(p.id, { nextTryAt: null }); redraw(); await feed.send(p.id); redraw(); } }, icon('refresh'), 'Retry') : null,
        h('button', { type: 'button', class: 'btn ghost small', 'data-cancel': p.id, 'aria-label': 'Remove photo', onclick: cancel }, icon('trash'), p.status === 'ready' ? null : 'Remove'))));
}
/** The "Photo log" block on the Architecture dashboard. */
export function photoBlock(doc) {
  const list = h('ul', { class: 'arc-pends', id: 'arc-pending' });
  const n = (doc.photoLog || []).length;
  const draw = () => {
    if (!wrap.isConnected && wrap.dataset.mounted) { window.removeEventListener('aitor:arch-updated', draw); return; }
    const ps = feed.pending().sort((a, b) => (b.status === 'ready') - (a.status === 'ready') || String(b.createdAt).localeCompare(String(a.createdAt)));
    list.replaceChildren(...ps.map((p) => pendingRow(p, draw)));
    list.hidden = !ps.length;
    const rc = feed.readyCount();
    badge.textContent = rc ? `${rc} ready` : ''; badge.hidden = !rc;
  };
  const badge = h('span', { class: 'trv-tabbadge arc-readybadge', id: 'arc-ready-count', hidden: true });
  const wrap = h('div', { class: 'arc-photoblock', id: 'arc-photoblock' },
    h('h2', { class: 'sec' }, 'Photo log ', badge),
    h('div', { class: 'card arc-camcard' },
      cameraButton(() => draw()),
      h('p', { class: 'note' }, 'Take or import a photo. We suggest the materials and styles we see, and you approve each one before it is logged.'),
      list),
    h('a', { class: 'card arc-card', href: '#/architecture/photo-log', id: 'arc-photolog-card' },
      h('span', { class: 'arc-card-text' }, h('span', { class: 'arc-card-title' }, 'Photo log'), h('span', { class: 'arc-card-sub' }, 'Your approved photos, materials and styles')),
      h('span', { class: 'arc-card-count', 'aria-label': pl(n, 'photo', 'photos') }, h('b', { class: 'arc-n' }, String(n)), h('span', { class: 'arc-n-l' }, n === 1 ? 'photo' : 'photos')),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, icon('chevR', 'ico chev-ico'))));
  window.addEventListener('aitor:arch-updated', draw);
  queueMicrotask(() => { wrap.dataset.mounted = '1'; });
  draw();
  feed.sendQueued().catch(() => {});
  return wrap;
}

// ---------------------------------------------------------------- review page (#/architecture/review/<request id>)
export function renderReview(root, id, doc, persist) {
  document.title = 'Review photo · Architecture · AI-TOR';
  const p = feed.pendingById(id), r = feed.resultFor(id);
  root.append(h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/architecture' }, icon('chevL'), 'Architecture')));
  if (!p || !r) {
    root.append(h('div', { class: 'fin-head' }, pageTitle('architecture', 'Review photo')),
      h('div', { class: 'card', id: 'arc-rev-missing' }, h('h2', null, p ? 'Not analyzed yet' : 'Nothing to review'), h('p', { class: 'note' }, p ? 'The suggestions for this photo have not arrived yet. They usually take 10–25 minutes.' : 'This photo was already saved, discarded or removed.'),
        h('div', { class: 'btnrow' }, h('a', { class: 'btn ghost', href: '#/architecture' }, 'Back to Architecture'))));
    return;
  }
  const tags = r.tags.map(cleanTag).filter(Boolean).map((t, i) => ({ ...t, tid: 't' + (i + 1), dec: null }));   // dec: 'yes' | 'no' | null (nothing pre-approved)
  const summary = h('textarea', { id: 'arc-rev-summary', rows: '2', maxlength: String(PLIM.summary) }); summary.value = r.subject.summary || '';
  const name = h('input', { type: 'text', id: 'arc-rev-name', maxlength: String(PLIM.name), placeholder: 'Building name (if known)', autocomplete: 'off' }); name.value = r.subject.name || '';
  const pl0 = r.place || null;
  const placeName = pl0 && typeof pl0.name === 'string' ? pl0.name : (p.location && p.location.source === 'manual' ? p.location.text : '');
  const place = h('input', { type: 'text', id: 'arc-rev-place', maxlength: String(PLIM.place), placeholder: 'Where it is (optional)', autocomplete: 'off' }); place.value = placeName;
  const srcNote = pl0 && pl0.source ? { exif: "From the photo's GPS", device: "From your phone's location", manual: 'Typed by you' }[pl0.source] || '' : '';
  const tagBox = h('ul', { class: 'arc-tags', id: 'arc-rev-tags' });
  const count = h('div', { class: 'asof', id: 'arc-rev-count', role: 'status' });
  const save = h('button', { type: 'button', class: 'btn primary', id: 'arc-rev-save', onclick: () => doSave() }, icon('check'), 'Save to log');
  function tagRow(t) {
    const set = (v) => { t.dec = t.dec === v ? null : v; draw(); };
    return h('li', { class: 'arc-tag' + (t.dec === 'yes' ? ' yes' : t.dec === 'no' ? ' no' : ''), 'data-tid': t.tid, 'data-type': t.type },
      h('div', { class: 'arc-tag-head' }, typeChip(t.type), h('span', { class: 'arc-tag-label' }, t.label), confView(t.confidence)),
      t.detail ? h('p', { class: 'arc-tag-detail' }, t.detail) : null,
      h('div', { class: 'arc-tag-link note' }, t.type === 'material' ? 'Logged with a Google Shopping link' : (/\/page\//.test(t.url) ? 'Logged with its Grokipedia article' : 'Logged with a Grokipedia search (no article found)')),
      h('div', { class: 'arc-tag-acts', role: 'group', 'aria-label': 'Approve or reject ' + t.label },
        h('button', { type: 'button', class: 'btn small arc-yes' + (t.dec === 'yes' ? ' on' : ''), 'data-approve': t.tid, 'aria-pressed': String(t.dec === 'yes'), onclick: () => set('yes') }, icon('check'), 'Approve'),
        h('button', { type: 'button', class: 'btn small ghost arc-no' + (t.dec === 'no' ? ' on' : ''), 'data-reject': t.tid, 'aria-pressed': String(t.dec === 'no'), onclick: () => set('no') }, icon('close'), 'Reject')));
  }
  function draw() {
    tagBox.replaceChildren(...tags.map(tagRow));
    const yes = tags.filter((t) => t.dec === 'yes').length;
    count.textContent = tags.length ? `${yes} of ${pl(tags.length, 'tag', 'tags')} approved` : 'No suggestions: add your own tags below, or discard.';
    save.disabled = yes === 0;
  }
  // add your own tag
  const ownType = h('select', { id: 'arc-own-type', 'aria-label': 'Tag type' }, TAG_TYPES.map((t) => h('option', { value: t }, TYPE_LABEL[t])));
  const ownLabel = h('input', { type: 'text', id: 'arc-own-label', maxlength: String(PLIM.label), placeholder: 'e.g. Limestone or Gothic', autocomplete: 'off' });
  const addOwn = h('button', { type: 'button', class: 'btn ghost small', id: 'arc-own-add', onclick: () => {
    const t = cleanTag({ type: ownType.value, label: ownLabel.value, confidence: null });
    if (!t) { ownLabel.focus(); return; }
    if (tags.some((x) => x.type === t.type && x.label.toLowerCase() === t.label.toLowerCase())) { toast('That tag is already in the list'); return; }
    tags.push({ ...t, tid: 'u' + (tags.length + 1), dec: 'yes' }); ownLabel.value = ''; draw();
  } }, icon('plus'), 'Add');
  async function doSave() {
    const approved = tags.filter((t) => t.dec === 'yes').map(({ tid, dec, ...t }) => t);
    if (!approved.length) return;
    const pr = pl0 ? { ...pl0 } : null; const pn = place.value.trim();
    const placeOut = pn ? { ...(pr || { source: 'manual' }), name: pn } : null;
    const c = cleanPhotoEntry({ reqId: id, photoId: p.photoId, createdAt: p.takenAt || p.createdAt, approvedAt: new Date().toISOString(), summary: summary.value, name: name.value, note: p.note || '', place: placeOut, tags: approved });
    if (!c.ok) { toast(c.errors[0]); return; }
    doc.photoLog = doc.photoLog || []; doc.photoLog.push(c.entry);
    if (!persist()) { doc.photoLog.pop(); return; }
    feed.removePending(id);
    toast('Saved to your photo log');
    location.hash = '#/architecture/photo-log/' + c.entry.id;
  }
  const discard = h('button', { type: 'button', class: 'btn ghost', id: 'arc-rev-discard', onclick: async () => {
    if (!(await confirmDialog({ title: 'Discard this photo?', message: 'Nothing is logged and the photo is deleted from this device.', okLabel: 'Discard', danger: true }))) return;
    feed.removePending(id); await deletePhoto(p.photoId).catch(() => {});
    toast('Discarded'); location.hash = '#/architecture';
  } }, icon('trash'), 'Discard');
  root.append(
    h('div', { class: 'fin-head' }, pageTitle('architecture', 'Review photo'), h('div', { class: 'asof' }, `Analyzed ${fmtDay(r.analyzedAt)} ${fmtTime(r.analyzedAt)}`)),
    r.status !== 'ok' ? h('div', { class: 'banner', id: 'arc-rev-banner' }, h('b', null, r.status === 'failed' ? 'We could not analyze this photo. ' : 'Not sure about this one. '), r.status === 'failed' ? (r.subject.summary || '') : 'Check the suggestions carefully.') : '',   // '' not null: Node.append(null) prints "null"
    h('div', { class: 'card arc-rev-photo', onclick: () => viewer(p.photoId, 'Your photo') }, storedImg(p.photoId, 'full', 'arc-full', 'Your photo', 'arc-rev-photo')),
    h('div', { class: 'card form arc-rev-form' },
      field('Summary', summary, 'Written during the analysis. You can edit it.'),
      field('Building', name),
      field('Location', place, srcNote || null)),
    h('h2', { class: 'sec' }, 'Suggested tags'), count, tagBox,
    h('div', { class: 'card arc-own' }, h('div', { class: 'k' }, 'Add your own tag'), h('div', { class: 'arc-own-row' }, ownType, ownLabel, addOwn)),
    h('div', { class: 'btnrow arc-rev-acts' }, save, discard));
  draw();
}

// ---------------------------------------------------------------- photo log list + entry page
export function renderPhotoLog(root, doc, persist, ctx) {
  document.title = 'Photo log · Architecture · AI-TOR';
  const list = sortPhotos(doc.photoLog || []);
  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/architecture' }, icon('chevL'), 'Architecture')),
    h('div', { class: 'fin-head' }, pageTitle('architecture', 'Photo log'), h('div', { class: 'asof', id: 'arc-plog-count' }, list.length ? pl(list.length, 'photo', 'photos') : 'Nothing logged yet')),
    cameraButton(() => { location.hash = '#/architecture'; }, 'arc-cam-log'));
  if (!list.length) {
    root.append(h('div', { class: 'card empty arc-plog-empty', id: 'arc-plog-empty' },
      h('div', { class: 'arc-empty-art', 'aria-hidden': 'true' }, emptyArt()),
      h('h2', null, 'No photos yet'),
      h('p', null, 'Photograph a building you like. We suggest its materials and style, you approve what is right, and it is logged here with the photo, the place and links.')));
    return;
  }
  root.append(h('ul', { class: 'arc-plog', id: 'arc-plog' }, list.map((e) => h('li', { class: 'dst-row arc-prow', 'data-photo': e.id },
    h('a', { class: 'arc-prow-link', href: '#/architecture/photo-log/' + e.id },
      storedImg(e.photoId, 'thumb', 'arc-thumb', ''),
      h('span', { class: 'arc-prow-main' },
        h('span', { class: 'arc-name' }, e.summary || e.name || 'Photo'),
        e.place ? h('span', { class: 'arc-meta' }, icon('pin', 'ico arc-mini'), e.place.short || e.place.name) : null,
        h('span', { class: 'arc-meta' }, fmtDay(e.createdAt)),
        h('span', { class: 'arc-prow-tags' }, e.tags.slice(0, 4).map((t) => h('span', { class: `arc-tchip sm ${t.type}` }, icon(t.type, 'ico arc-tchip-ico'), t.label)), e.tags.length > 4 ? h('span', { class: 'arc-more' }, '+' + (e.tags.length - 4)) : null)),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, icon('chevR', 'ico chev-ico')))))));
}
export function renderPhotoEntry(root, id, doc, persist) {
  const e = (doc.photoLog || []).find((x) => x.id === id);
  root.append(h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/architecture/photo-log', id: 'arc-pe-back' }, icon('chevL'), 'Photo log')));
  if (!e) { root.append(h('div', { class: 'card', id: 'arc-pe-missing' }, h('h2', null, 'Not found'), h('p', { class: 'note' }, 'This photo log entry does not exist on this device.'))); return; }
  document.title = (e.summary || 'Photo') + ' · Photo log · AI-TOR';
  // coordinates when we have them, otherwise a Maps search for the typed place name
  const maps = !e.place ? null : e.place.lat != null ? `https://www.google.com/maps/search/?api=1&query=${e.place.lat},${e.place.lon}`
    : e.place.name ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.place.name) : null;
  const del = async () => {
    if (!(await confirmDialog({ title: 'Delete this photo log entry?', message: 'The entry and its photo are removed from this device.', okLabel: 'Delete', danger: true }))) return;
    doc.photoLog = doc.photoLog.filter((x) => x.id !== e.id);
    if (!persist()) return;
    await deletePhoto(e.photoId).catch(() => {});
    toast('Deleted'); location.hash = '#/architecture/photo-log';
  };
  root.append(
    h('div', { class: 'card arc-rev-photo', onclick: () => viewer(e.photoId, e.summary) }, storedImg(e.photoId, 'full', 'arc-full', e.summary || 'Photo', 'arc-pe-photo')),
    h('div', { class: 'card arc-pe-head' },
      h('h1', { class: 'arc-pe-title', id: 'arc-pe-summary' }, e.summary || 'Photo'),
      e.name ? h('div', { class: 'arc-meta', id: 'arc-pe-name' }, e.name) : null,
      e.place ? h('div', { class: 'arc-pe-place', id: 'arc-pe-place' }, icon('pin'), h('span', null, e.place.name), maps ? h('a', { class: 'arc-link', href: maps, target: '_blank', rel: 'noopener noreferrer', id: 'arc-pe-map' }, 'Map', icon('external', 'ico dst-ext')) : null) : null,
      h('div', { class: 'arc-meta', id: 'arc-pe-date' }, 'Taken ' + fmtDay(e.createdAt) + ' · logged ' + fmtDay(e.approvedAt)),
      e.note ? h('p', { class: 'arc-notes', id: 'arc-pe-note' }, e.note) : null),
    h('h2', { class: 'sec' }, 'Materials & styles'),
    h('ul', { class: 'arc-tags', id: 'arc-pe-tags' }, sortTags(e.tags).map((t) => h('li', { class: 'arc-tag', 'data-type': t.type },
      h('div', { class: 'arc-tag-head' }, typeChip(t.type), h('span', { class: 'arc-tag-label' }, t.label), confView(t.confidence)),
      t.detail ? h('p', { class: 'arc-tag-detail' }, t.detail) : null,
      h('div', { class: 'arc-tag-acts' }, linkFor(t))))),
    h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn ghost', id: 'arc-pe-del', onclick: del }, icon('trash'), 'Delete entry')));
}
const sortTags = (ts) => [...ts].sort((a, b) => (a.type !== b.type ? (a.type === 'style' ? -1 : 1) : (b.confidence ?? 2) - (a.confidence ?? 2)));

/** Photo log empty state (Graphic Designer): a camera framing a pointed arch, same straight-edged line language as the icons. */
function emptyArt() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 96'); svg.setAttribute('class', 'arc-empty-svg'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3'); svg.setAttribute('stroke-linecap', 'square'); svg.setAttribute('stroke-linejoin', 'miter');
  for (const [d, cls] of [['M10 26h22l8-12h40l8 12h22v60H10z', ''], ['M42 80V52l18-18 18 18v28', 'accent'], ['M52 80V60l8-8 8 8v20', 'accent'], ['M34 80h52', 'accent'], ['M92 34h10', '']]) {
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); if (cls) p.setAttribute('class', cls); svg.append(p);
  }
  return svg;
}

/** Remove photos from IndexedDB that no entry and no pending request uses any more (after an import, an erase of the section, a reset). */
export async function sweepOrphans(doc) {
  try {
    const used = new Set([...(doc.photoLog || []).map((e) => e.photoId), ...feed.pending().map((p) => p.photoId)]);
    for (const k of await photoIds()) if (!used.has(k)) await deletePhoto(k);
  } catch { /* ignore */ }
}
