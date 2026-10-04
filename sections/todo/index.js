// To-Do section. Route: #/todo
// Two parallel lists, "Personal" and "Work" (tabs at the top, same look and function). Open tasks on top (newest first), a collapsed
// "Done" pile below. Tap a task to see/add comments. Personal = everything typed in before + the assistant's encrypted feed; Work = typed
// in by hand, local only, never touched by sync. The selected tab is remembered in a device setting (aitor:cfg:todo-ui).
import { h, pageTitle, fmtDate, todayISO, uid } from '../../js/util.js';
import { icon, sectionGlyph } from '../../js/icons.js';
import { toast, confirmDialog } from '../../js/ui.js';
import * as storage from '../../js/storage.js';
import { validate, summary, emptyDoc, isEmptyDoc, newTask, openTasks, doneTasks, inList, listOf, LISTS, LIST_LABEL, LIMITS } from './model.js';
import * as sync from './sync.js';
import { parsePaste, MAX_TASKS } from './paste.js';

export { validate, summary, emptyDoc };
export const storageId = 'todo';

const fmtWhen = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export async function render(root, ctx) {
  root.className = 'section-root fin todo';
  document.title = 'To-Do · AI-TOR';
  const store = ctx.store;
  const raw = store.get();
  if (raw) {
    const v = validate(raw);
    if (!v.ok) {
      root.append(h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home'),
        h('div', { class: 'card error', id: 'corrupt' }, h('h2', null, 'Saved To-Do data looks damaged'), h('p', { class: 'note' }, v.errors.join(' ')),
          h('p', { class: 'note' }, 'You can restore a backup from Settings > Import, or reset this section.'),
          h('div', { class: 'btnrow' }, h('a', { class: 'btn ghost', href: '#/settings' }, 'Open Settings'),
            h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog({ title: 'Reset To-Do data?', message: 'This deletes all saved tasks on this device (Personal and Work).', okLabel: 'Reset', danger: true })) { store.clear(); ctx.rerender(); } } }, 'Reset To-Do'))));
      return;
    }
  }

  // The stored document is the single source of truth: every change re-reads it, edits it and saves it.
  const load = () => { const r = store.get(); return r ? validate(r).doc : emptyDoc(); };
  function mutate(fn) {
    const doc = load();
    fn(doc);
    doc.updatedAt = new Date().toISOString();
    try { store.set(doc); } catch (e) { console.warn(e); toast('Could not save: storage is full or blocked'); return false; }
    draw();
    return true;
  }

  const expanded = new Set();       // task ids whose detail is open
  const drafts = new Map();         // task id -> unsent comment text
  let editingComment = null;        // `${taskId}:${commentId}`
  let editingTask = null;
  const doneOpen = { personal: false, work: false };
  const uiCfg = storage.config('todo-ui');
  let list = 'personal';
  try { const u = uiCfg.get(); if (u && LISTS.includes(u.list)) list = u.list; } catch { /* default */ }
  const setList = (l) => {
    if (l === list) return;
    list = l; editingTask = null; editingComment = null;
    try { uiCfg.set({ list }); } catch { /* remembering the tab is best effort */ }
    addTitle.value = ''; addDueInput.value = ''; addDue = '';
    pasteTa.value = ''; paste = { mode: 'edit', items: [], info: null };
    draw();
  };
  let addDue = '';
  let syncOpen = false;
  let syncMsg = null;               // { cls, text } result of the last manual sync
  let busy = false;

  const head = h('div', { class: 'fin-head' });
  const addTitle = h('input', { type: 'text', id: 'todo-title', class: 'todo-add-input', maxlength: String(LIMITS.title), placeholder: 'Add a task…', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'New task' });
  const addDueInput = h('input', { type: 'date', id: 'todo-due', class: 'todo-due-input', 'aria-label': 'Due date (optional)', oninput: () => { addDue = addDueInput.value; } });
  const addForm = h('form', { class: 'card todo-add', id: 'todo-add-form', onsubmit: (e) => {
    e.preventDefault();
    const title = addTitle.value.trim();
    if (!title) { addTitle.focus(); return; }
    if (inList(load(), list).length >= LIMITS.tasks) { toast('Too many tasks. Clear some finished ones first.'); return; }
    const due = addDueInput.value || '';
    const target = list;
    if (mutate((d) => { d.tasks.unshift(newTask({ title, due, list: target })); })) { addTitle.value = ''; addDueInput.value = ''; addDue = ''; addTitle.focus(); }
  } },
    addTitle,
    h('div', { class: 'todo-add-row' },
      h('label', { class: 'todo-due-wrap' }, h('span', { class: 'fl' }, 'Due'), addDueInput, h('span', { class: 'hint' }, 'optional')),
      h('button', { type: 'submit', class: 'btn primary big', id: 'todo-add-btn' }, 'Add task')));

  // ------------------------------------------------------------ "Paste a list" (v20)
  // A collapsed row under the add-task form. Paste bullets / numbered lines / messy notes, tap "Add tasks": the text is cleaned and split
  // (sections/todo/paste.js), a short preview lists the tasks (each can be removed with an x), and "Add N tasks" puts them at the top of the
  // CURRENT list (Work or Personal) in paste order. One task is added straight away. Nothing is kept anywhere except the normal To-Do document.
  let paste = { mode: 'edit', items: [], info: null };   // mode: 'edit' | 'preview'
  const pasteTa = h('textarea', { id: 'todo-paste-text', class: 'todo-paste-ta', rows: '8', placeholder: '- first task\n- second task\n- third task', 'aria-label': 'Paste a list of tasks', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: '20000' });
  const pasteBody = h('div', { class: 'todo-paste-body' });
  const pastePanel = h('details', { class: 'group todo-paste', id: 'todo-paste' },
    h('summary', { id: 'todo-paste-summary' }, h('span', { class: 'trv-gname' }, [icon('plus'), 'Paste a list']), h('span', { class: 'trv-gcount' }, icon('chevD'))), pasteBody);
  const openTitles = () => openTasks(load(), list).map((t) => t.title);
  const room = () => Math.max(0, LIMITS.tasks - inList(load(), list).length);
  function commitPaste(titles) {
    const target = list, now = new Date().toISOString(), cur = new Set(load().tasks.map((t) => t.id));
    const fresh = titles.map((title, i) => { let id; do { id = (target === 'work' ? 'w-' : 'm-') + uid() + i.toString(36); } while (cur.has(id)); cur.add(id); return newTask({ title, list: target, id }, now); });
    if (mutate((d) => { d.tasks = [...fresh, ...d.tasks]; })) {
      pasteTa.value = ''; paste = { mode: 'edit', items: [], info: null };
      drawPaste(); pastePanel.open = false;
      toast(`${fresh.length} task${fresh.length === 1 ? '' : 's'} added to ${LIST_LABEL[target]}`);
    }
  }
  function submitPaste() {
    const r = parsePaste(pasteTa.value, openTitles(), room());
    if (!r.tasks.length) {
      paste.info = { cls: 'err', text: pasteTa.value.trim() ? (r.existing || r.duplicates ? 'Nothing new: those tasks are already in this list.' : 'No tasks found in that text.') : 'Paste some text first.' };
      drawPaste(); pasteTa.focus(); return;
    }
    if (r.tasks.length === 1 && !r.capped) { commitPaste(r.tasks); return; }
    paste = { mode: 'preview', items: r.tasks, info: r };
    drawPaste();
  }
  function noteFor(r) {
    if (!r) return '';
    const bits = [];
    if (r.duplicates) bits.push(`${r.duplicates} repeated`);
    if (r.existing) bits.push(`${r.existing} already in ${LIST_LABEL[list]}`);
    if (r.capped) bits.push(`${r.capped} over the limit of ${MAX_TASKS} per paste`);
    if (r.truncated) bits.push(`${r.truncated} shortened to 200 characters`);
    return bits.length ? 'Skipped: ' + bits.join(', ') + '.' : '';
  }
  function drawPaste(fromDraw) {
    if (fromDraw && paste.mode === 'edit' && document.activeElement === pasteTa) return;   // never steal focus while typing
    pastePanel.querySelector('.trv-gname').replaceChildren(icon('plus'), 'Paste a list');
    if (paste.mode === 'preview') {
      const n = paste.items.length;
      pasteBody.replaceChildren(
        h('p', { class: 'todo-paste-count', id: 'todo-paste-count', role: 'status' }, `${n} task${n === 1 ? '' : 's'} found for ${LIST_LABEL[list]}`),
        h('ul', { class: 'todo-paste-list', id: 'todo-paste-list' }, paste.items.map((t, i) =>
          h('li', { class: 'todo-paste-item', 'data-i': String(i) },
            h('span', { class: 'todo-paste-t' }, t),
            h('button', { type: 'button', class: 'todo-paste-x', 'aria-label': 'Remove: ' + t, onclick: () => { paste.items.splice(i, 1); if (!paste.items.length) { paste = { mode: 'edit', items: [], info: { cls: 'err', text: 'All tasks removed.' } }; } drawPaste(); } }, icon('close'))))),
        ...(noteFor(paste.info) ? [h('p', { class: 'note', id: 'todo-paste-skip' }, noteFor(paste.info))] : []),
        h('div', { class: 'btnrow' },
          h('button', { type: 'button', class: 'btn primary small', id: 'todo-paste-confirm', onclick: () => commitPaste(paste.items.slice()) }, `Add ${n} task${n === 1 ? '' : 's'}`),
          h('button', { type: 'button', class: 'btn ghost small', id: 'todo-paste-back', onclick: () => { paste.mode = 'edit'; paste.info = null; drawPaste(); pasteTa.focus(); } }, 'Edit text')));
    } else {
      const msg = paste.info && paste.info.text;
      pasteBody.replaceChildren(
        pasteTa,
        h('p', { class: 'note todo-paste-hint' + (msg ? ' err' : ''), id: 'todo-paste-msg', role: 'status' }, msg || 'One task per line. Bullets, numbers and checkboxes are cleaned up for you.'),
        h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn primary small', id: 'todo-paste-btn', onclick: submitPaste }, 'Add tasks')));
    }
  }

  const tabsEl = h('div', { class: 'trv-tabs todo-tabs', id: 'todo-tabs', role: 'tablist', 'aria-label': 'To-Do lists' });
  const syncBar = h('div', { class: 'todo-syncbar', id: 'todo-syncbar' });
  const syncPanel = h('details', { class: 'group todo-sync', id: 'todo-sync-panel' });
  syncPanel.addEventListener('toggle', () => { syncOpen = syncPanel.open; });
  const lists = h('div', { class: 'todo-lists', id: 'todo-lists' });
  const footNote = h('p', { class: 'note center', id: 'todo-foot' });

  // ------------------------------------------------------------ rows
  function dueChip(t) {
    if (!t.due) return null;
    const today = todayISO();
    const cls = t.done ? '' : (t.due < today ? ' overdue' : t.due === today ? ' today' : '');
    const label = t.done ? fmtDate(t.due) : (t.due < today ? 'Overdue · ' : t.due === today ? 'Today · ' : '') + fmtDate(t.due);
    return h('span', { class: 'todo-chip due' + cls }, icon('calendar'), label);
  }

  function commentBlock(t) {
    const wrap = h('div', { class: 'todo-comments' });
    if (t.notes) wrap.append(h('p', { class: 'todo-notes' }, t.notes));
    if (t.comments.length) {
      wrap.append(h('ul', { class: 'todo-clist' }, t.comments.map((c) => {
        const key = `${t.id}:${c.id}`;
        if (editingComment === key) {
          const ta = h('textarea', { class: 'todo-ctext', rows: '3', maxlength: String(LIMITS.comment), 'aria-label': 'Edit comment' }); ta.value = c.text;
          return h('li', { class: 'todo-comment editing', 'data-comment': c.id },
            ta,
            h('div', { class: 'btnrow' },
              h('button', { type: 'button', class: 'btn primary small c-save', onclick: () => {
                const text = ta.value.trim(); if (!text) { toast('A comment cannot be empty'); return; }
                editingComment = null; mutate((d) => { const cm = d.tasks.find((x) => x.id === t.id)?.comments.find((x) => x.id === c.id); if (cm) { cm.text = text; cm.editedAt = new Date().toISOString(); } });
              } }, 'Save'),
              h('button', { type: 'button', class: 'btn ghost small', onclick: () => { editingComment = null; draw(); } }, 'Cancel')));
        }
        return h('li', { class: 'todo-comment', 'data-comment': c.id },
          h('div', { class: 'todo-ctext-view' }, c.text),
          h('div', { class: 'todo-cmeta' },
            h('span', null, fmtWhen(c.at) + (c.editedAt ? ' · edited' : '')),
            h('span', { class: 'todo-cact' },
              h('button', { type: 'button', class: 'linkbtn c-edit', onclick: () => { editingComment = key; draw(); } }, 'Edit'),
              h('button', { type: 'button', class: 'linkbtn danger-txt c-del', onclick: () => mutate((d) => { const tt = d.tasks.find((x) => x.id === t.id); if (tt) tt.comments = tt.comments.filter((x) => x.id !== c.id); }) }, 'Delete'))));
      })));
    }
    const ta = h('textarea', { class: 'todo-ctext new-comment', rows: '2', maxlength: String(LIMITS.comment), placeholder: 'Add a comment…', 'aria-label': 'New comment', oninput: () => drafts.set(t.id, ta.value) });
    ta.value = drafts.get(t.id) || '';
    const send = () => {
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      if (t.comments.length >= LIMITS.comments) { toast('Too many comments on this task'); return; }
      drafts.delete(t.id);
      mutate((d) => { d.tasks.find((x) => x.id === t.id)?.comments.push({ id: uid(), text, at: new Date().toISOString() }); });
    };
    wrap.append(h('div', { class: 'todo-cnew' }, ta, h('button', { type: 'button', class: 'btn primary small c-add', onclick: send }, 'Add comment')));
    return wrap;
  }

  function editBlock(t) {
    const title = h('input', { type: 'text', class: 'e-title', maxlength: String(LIMITS.title), value: t.title, 'aria-label': 'Task title' });
    const due = h('input', { type: 'date', class: 'e-due', value: t.due || '', 'aria-label': 'Due date' });
    return h('form', { class: 'todo-edit', onsubmit: (e) => {
      e.preventDefault();
      const nt = title.value.trim(); if (!nt) { title.focus(); return; }
      editingTask = null;
      mutate((d) => { const x = d.tasks.find((y) => y.id === t.id); if (x) { x.title = nt; if (due.value) x.due = due.value; else delete x.due; } });
    } }, title, due, h('div', { class: 'btnrow' },
      h('button', { type: 'submit', class: 'btn primary small' }, 'Save'),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => { editingTask = null; draw(); } }, 'Cancel')));
  }

  function row(t) {
    const isOpen = expanded.has(t.id);
    const cb = h('input', { type: 'checkbox', class: 'todo-cb', checked: t.done, id: 'cb-' + t.id, 'aria-label': (t.done ? 'Mark not done: ' : 'Mark done: ') + t.title,
      onchange: () => {
        const nowDone = cb.checked;
        mutate((d) => { const x = d.tasks.find((y) => y.id === t.id); if (x) { x.done = nowDone; x.doneAt = nowDone ? new Date().toISOString() : null; } });
      } });
    const n = t.comments.length;
    const main = h('button', { type: 'button', class: 'todo-main', 'aria-expanded': String(isOpen), 'aria-controls': 'detail-' + t.id,
      onclick: () => { isOpen ? expanded.delete(t.id) : expanded.add(t.id); draw(); } },
      h('span', { class: 'todo-title' }, t.title),
      h('span', { class: 'todo-meta' },
        dueChip(t),
        t.done && t.doneAt ? h('span', { class: 'todo-chip' }, icon('check'), 'Done ' + fmtWhen(t.doneAt)) : null,
        n ? h('span', { class: 'todo-chip cmt', 'aria-label': `${n} comment${n === 1 ? '' : 's'}` }, icon('comment'), String(n)) : null,
        t.source === 'sync' ? h('span', { class: 'todo-chip src' }, 'from assistant') : null));
    const li = h('li', { class: 'todo-row' + (t.done ? ' done' : '') + (isOpen ? ' open' : ''), 'data-task': t.id },
      h('div', { class: 'todo-line' }, h('label', { class: 'todo-check', for: 'cb-' + t.id }, cb), main));
    if (isOpen) {
      const detail = h('div', { class: 'todo-detail', id: 'detail-' + t.id });
      if (editingTask === t.id) detail.append(editBlock(t));
      detail.append(commentBlock(t));
      const acts = h('div', { class: 'btnrow todo-acts' });
      if (t.source === 'manual' && editingTask !== t.id) acts.append(h('button', { type: 'button', class: 'btn ghost small t-edit', onclick: () => { editingTask = t.id; draw(); } }, 'Edit task'));
      acts.append(h('button', { type: 'button', class: 'btn ghost small danger-txt t-del', onclick: async () => {
        if (!(await confirmDialog({ title: 'Delete this task?', message: `“${t.title.slice(0, 80)}” and its comments will be removed from this device.` + (t.source === 'sync' ? ' It will not come back on the next sync.' : ''), okLabel: 'Delete', danger: true }))) return;
        expanded.delete(t.id); drafts.delete(t.id);
        mutate((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); if (t.source === 'sync' && !d.dismissed.includes(t.id)) d.dismissed = [...d.dismissed, t.id].slice(-LIMITS.dismissed); });
      } }, 'Delete task'));
      detail.append(acts);
      li.append(detail);
    }
    return li;
  }

  // ------------------------------------------------------------ sync UI
  function syncStatusText() {
    const c = sync.getConfig();
    if (!sync.isConfigured()) return null;
    if (c.lastError && (!c.lastSyncAt || Date.parse(c.lastAttemptAt || 0) > Date.parse(c.lastSyncAt))) return { cls: 'err', text: 'Last sync failed: ' + c.lastError };
    return { cls: '', text: c.lastSyncAt ? 'Synced ' + sync.timeAgo(c.lastSyncAt) : 'Not synced yet' };
  }

  async function runSync() {
    if (busy) return;
    busy = true; syncMsg = { cls: '', text: 'Syncing…' }; drawSync();
    const r = await sync.syncNow();
    busy = false;
    if (r.ok) {
      const parts = [];
      if (r.added) parts.push(`${r.added} new`);
      if (r.updated) parts.push(`${r.updated} updated`);
      if (r.removed) parts.push(`${r.removed} removed`);
      syncMsg = { cls: 'ok', text: 'Synced just now' + (parts.length ? ' · ' + parts.join(', ') : ' · nothing new') + (r.skipped ? ` · ${r.skipped} invalid entr${r.skipped === 1 ? 'y' : 'ies'} skipped` : '') + '.' };
      draw();
    } else { syncMsg = { cls: 'err', text: r.error }; drawSync(); }
  }

  function drawSync() {
    const c = sync.getConfig();
    const configured = sync.isConfigured();
    const st = syncMsg || syncStatusText();
    syncBar.replaceChildren(
      configured
        ? h('div', { class: 'todo-syncrow' },
            h('div', { class: 'todo-synctext' + (st && st.cls ? ' ' + st.cls : ''), id: 'sync-status', role: 'status' }, st ? st.text : ''),
            h('button', { type: 'button', class: 'btn ghost small', id: 'sync-now', disabled: busy, onclick: runSync }, busy ? 'Syncing…' : [icon('refresh'), 'Sync now']))
        : h('p', { class: 'note' }, 'Want your assistant’s task list here? ', h('button', { type: 'button', class: 'linkbtn', id: 'sync-setup-link', onclick: () => { syncPanel.open = true; syncOpen = true; syncPanel.scrollIntoView({ block: 'center' }); } }, 'Set up task sync')));

    const pass = h('input', { type: 'password', id: 'sync-pass', value: c.passphrase || '', placeholder: 'Your passphrase', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', maxlength: '200' });
    const msg = h('div', { class: 'note', id: 'sync-form-msg', role: 'status' });
    const form = h('form', { class: 'todo-syncform', id: 'sync-form', onsubmit: async (e) => {
      e.preventDefault();
      const errs = sync.checkConfig({ passphrase: pass.value });
      if (errs.length) { msg.className = 'form-err'; msg.replaceChildren(h('ul', null, errs.map((x) => h('li', null, x)))); return; }
      sync.saveConfig({ passphrase: pass.value });
      toast('Passphrase saved');
      syncMsg = null; drawSync();
      await runSync();
    } },
      h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Passphrase'), pass, h('span', { class: 'hint' }, 'Unlocks the encrypted task list published with the app. Stored only on this device, never exported. Typed exactly as you chose it: capitals and spaces count.')),
      msg,
      h('div', { class: 'btnrow' },
        h('button', { type: 'submit', class: 'btn primary small', id: 'sync-save' }, 'Save & sync'),
        configured ? h('button', { type: 'button', class: 'btn danger small', id: 'sync-remove', onclick: async () => {
          if (!(await confirmDialog({ title: 'Remove sync?', message: 'The saved passphrase is deleted from this device. Your tasks stay.', okLabel: 'Remove', danger: true }))) return;
          sync.clearConfig(); syncMsg = null; toast('Sync removed'); draw();
        } }, 'Remove sync') : null),
      configured && c.feedUpdated ? h('p', { class: 'note' }, 'Feed last updated by your assistant: ' + fmtWhen(c.feedUpdated)) : null);
    syncPanel.replaceChildren(h('summary', { id: 'sync-summary' }, h('span', null, [sectionGlyph('settings', 18), 'Task sync settings']), h('span', { class: 'trv-gcount' }, configured ? 'On' : 'Off')), h('div', { class: 'todo-syncbody' }, form));
    syncPanel.open = syncOpen;
  }

  // ------------------------------------------------------------ main draw
  function draw() {
    const doc = load();
    const open = openTasks(doc, list), done = doneTasks(doc, list);
    const work = list === 'work';
    head.replaceChildren(
      pageTitle('todo', 'To-Do'),
      h('p', { class: 'asof', id: 'todo-counts' }, `${open.length} open · ${done.length} done`));
    tabsEl.replaceChildren(...LISTS.map((l) => {
      const n = openTasks(doc, l).length, on = l === list;
      return h('button', { type: 'button', class: 'trv-tab' + (on ? ' on' : ''), id: 'tab-' + l, role: 'tab', 'aria-selected': String(on), 'aria-label': `${LIST_LABEL[l]}, ${n} open`, onclick: () => setList(l) },
        on ? h('span', { class: 'tab-pill', 'aria-hidden': 'true' }) : null,
        h('span', { class: 'tab-lbl' }, LIST_LABEL[l], h('span', { class: 'todo-tabn', id: 'tab-' + l + '-n', 'aria-hidden': 'true' }, String(n))));
    }));
    addTitle.placeholder = work ? 'Add a work task…' : 'Add a task…';
    addTitle.setAttribute('aria-label', work ? 'New work task' : 'New task');
    syncBar.hidden = work; syncPanel.hidden = work;
    footNote.replaceChildren(icon('lock'), work ? 'Work tasks are typed in by you and stay only on this device. Never synced. Included in backups via Settings > Export.' : 'Stored only on this device. Included in backups via Settings > Export.');

    const openCard = h('section', { class: 'card todo-open', id: 'todo-open' },
      h('h2', { class: 'todo-h' }, 'To do ', h('span', { class: 'trv-pill', id: 'todo-open-count' }, String(open.length))),
      open.length ? h('ul', { class: 'todo-ul', id: 'todo-open-list' }, open.map(row))
        : h('p', { class: 'note todo-empty', id: 'todo-none' }, done.length ? 'All done. Nothing left to do.' : work ? 'No work tasks yet. Add one above.' : 'No tasks yet. Add one above' + (sync.isConfigured() ? ', or tap Sync now.' : '.')));

    const doneDet = h('details', { class: 'group todo-done', id: 'todo-done' },
      h('summary', { id: 'todo-done-summary' }, h('span', { class: 'trv-gname' }, 'Done'), h('span', { class: 'trv-gcount', id: 'todo-done-count' }, String(done.length))),
      done.length ? h('div', { class: 'todo-donebody' }, h('ul', { class: 'todo-ul', id: 'todo-done-list' }, done.map(row)),
        h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn ghost small', id: 'todo-clear-done', onclick: async () => {
          if (!(await confirmDialog({ title: `Delete ${done.length} finished task${done.length === 1 ? '' : 's'}?`, message: work ? 'They and their comments are removed from this device.' : 'They and their comments are removed from this device. Tasks from your assistant will not come back on sync.', okLabel: 'Delete finished', danger: true }))) return;
          mutate((d) => { const gone = d.tasks.filter((x) => x.done && listOf(x) === forList); d.tasks = d.tasks.filter((x) => !(x.done && listOf(x) === forList)); for (const g of gone) if (g.source === 'sync' && !d.dismissed.includes(g.id)) d.dismissed.push(g.id); d.dismissed = d.dismissed.slice(-LIMITS.dismissed); });
        } }, 'Delete finished tasks')))
        : h('p', { class: 'note', style: 'padding:0 16px 14px' }, 'Checked tasks will show up here.'));
    doneDet.open = doneOpen[list];
    const forList = list;
    doneDet.addEventListener('toggle', () => { doneOpen[forList] = doneDet.open; });

    lists.replaceChildren(openCard, doneDet);
    drawSync();
    drawPaste(true);
  }

  const onSynced = () => { if (root.isConnected) draw(); };
  window.addEventListener('aitor:todo-synced', onSynced);
  const cleanup = () => { if (!root.isConnected) window.removeEventListener('aitor:todo-synced', onSynced); };
  window.addEventListener('hashchange', cleanup, { once: true });

  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home')),
    head, tabsEl, addForm, pastePanel, syncBar, lists, syncPanel,
    footNote);
  draw();
  if (sync.isConfigured() && sync.shouldAutoSync()) { sync.maybeAutoSync().then(() => { /* view refreshes via event */ }); }
}
