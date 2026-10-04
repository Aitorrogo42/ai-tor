// To-Do data model (document version 1). Stored at "aitor:sec:todo" and included in export files.
// { version:1, updatedAt, tasks:[ Task ], dismissed:[ids] }   (tasks are kept newest-first)
// Task = { id, title, due?:'YYYY-MM-DD', notes?, source:'manual'|'sync', list:'personal'|'work', done, doneAt, comments:[{id,text,at,editedAt?}], createdAt }
// Two parallel lists live in the same document, told apart by `list`. A task with no `list` (everything saved before v16, every old
// backup) is read as 'personal'; nothing is rewritten until the user next changes something. Only 'personal' tasks ever take part
// in the encrypted-feed sync (mergeFeed); 'work' tasks are typed in by hand, stay on the device and are never touched by a sync.
// Sync settings (passphrase) are NOT part of this document: they live in "aitor:cfg:todo" and are never exported.
import { isValidISODate, uid } from '../../js/util.js';

export const VERSION = 1;
export const LISTS = ['personal', 'work'];
export const DEFAULT_LIST = 'personal';
export const LIST_LABEL = { personal: 'Personal', work: 'Work' };
export const LIMITS = { title: 200, comment: 1000, notes: 1000, tasks: 1000, comments: 200, id: 100, dismissed: 1000, feedBytes: 1024 * 1024 };

export const emptyDoc = () => ({ version: VERSION, updatedAt: null, tasks: [], dismissed: [] });
export const isEmptyDoc = (d) => !d || (d.tasks.length === 0);
/** Which list a task belongs to (a missing/unknown value reads as 'personal'). */
export const listOf = (t) => (t && t.list === 'work' ? 'work' : 'personal');
export const inList = (doc, list) => doc.tasks.filter((t) => listOf(t) === list);

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const isISOTime = (s) => typeof s === 'string' && s.length <= 40 && !Number.isNaN(Date.parse(s));

/** Validate + sanitize a To-Do document. Returns { ok, errors, doc }. Never throws. */
export function validate(raw) {
  const errors = [];
  const err = (m) => { if (errors.length < 12) errors.push(m); };
  const doc = emptyDoc();
  if (!isObj(raw)) return { ok: false, errors: ['To-Do data must be an object.'], doc };
  if (!Number.isInteger(raw.version)) err('To-Do: missing "version".');
  else if (raw.version > VERSION) err(`To-Do: data is from a newer version of AI-TOR (version ${raw.version}; this app supports up to ${VERSION}).`);
  else if (raw.version < 1) err('To-Do: invalid "version".');
  doc.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 40) : null;
  if (raw.tasks != null && !Array.isArray(raw.tasks)) err('To-Do: "tasks" must be a list.');
  else if ((raw.tasks || []).length > LIMITS.tasks * LISTS.length) err(`To-Do: too many tasks (max ${LIMITS.tasks} per list).`);
  else if (LISTS.some((l) => (raw.tasks || []).filter((t) => isObj(t) && (t.list === 'work' ? 'work' : 'personal') === l).length > LIMITS.tasks)) err(`To-Do: too many tasks (max ${LIMITS.tasks} per list).`);
  else {
    const seen = new Set();
    (raw.tasks || []).forEach((t, i) => {
      const at = `To-Do: task #${i + 1}`;
      if (!isObj(t)) return err(`${at} must be an object.`);
      if (typeof t.id !== 'string' || !t.id || t.id.length > LIMITS.id) return err(`${at} needs an "id" (text up to ${LIMITS.id} characters).`);
      if (seen.has(t.id)) return err(`${at}: duplicate id.`);
      if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > LIMITS.title) return err(`${at} needs a title (up to ${LIMITS.title} characters).`);
      if (t.due != null && t.due !== '' && !isValidISODate(t.due)) return err(`${at}: due date must look like YYYY-MM-DD.`);
      if (t.notes != null && (typeof t.notes !== 'string' || t.notes.length > LIMITS.notes)) return err(`${at}: notes must be text up to ${LIMITS.notes} characters.`);
      if (t.source != null && t.source !== 'manual' && t.source !== 'sync') return err(`${at}: source must be "manual" or "sync".`);
      if (t.list != null && !LISTS.includes(t.list)) return err(`${at}: list must be "personal" or "work".`);
      if (t.done != null && typeof t.done !== 'boolean') return err(`${at}: "done" must be true or false.`);
      if (t.doneAt != null && !isISOTime(t.doneAt)) return err(`${at}: bad "doneAt" time.`);
      if (t.createdAt != null && !isISOTime(t.createdAt)) return err(`${at}: bad "createdAt" time.`);
      if (t.comments != null && !Array.isArray(t.comments)) return err(`${at}: "comments" must be a list.`);
      if ((t.comments || []).length > LIMITS.comments) return err(`${at}: too many comments (max ${LIMITS.comments}).`);
      const comments = [];
      for (const [j, c] of (t.comments || []).entries()) {
        if (!isObj(c) || typeof c.text !== 'string' || !c.text.trim() || c.text.length > LIMITS.comment) return err(`${at}: comment #${j + 1} must have text up to ${LIMITS.comment} characters.`);
        if (c.at != null && !isISOTime(c.at)) return err(`${at}: comment #${j + 1} has a bad time.`);
        if (c.editedAt != null && !isISOTime(c.editedAt)) return err(`${at}: comment #${j + 1} has a bad edit time.`);
        const cm = { id: typeof c.id === 'string' && c.id && c.id.length <= LIMITS.id ? c.id : uid(), text: c.text.trim(), at: c.at || t.createdAt || new Date(0).toISOString() };
        if (c.editedAt) cm.editedAt = c.editedAt;
        comments.push(cm);
      }
      seen.add(t.id);
      const done = !!t.done;
      const list = t.list === 'work' ? 'work' : 'personal';
      const task = { id: t.id, title: t.title.trim(), source: list === 'work' ? 'manual' : (t.source || 'manual'), list, done, doneAt: done ? (t.doneAt || t.createdAt || new Date(0).toISOString()) : null, comments, createdAt: t.createdAt || new Date(0).toISOString() };
      if (t.due) task.due = t.due;
      if (t.notes && t.notes.trim()) task.notes = t.notes.trim();
      doc.tasks.push(task);
    });
  }
  if (raw.dismissed != null) {
    if (!Array.isArray(raw.dismissed) || raw.dismissed.length > LIMITS.dismissed || raw.dismissed.some((x) => typeof x !== 'string' || x.length > LIMITS.id)) err('To-Do: "dismissed" must be a list of ids.');
    else doc.dismissed = [...new Set(raw.dismissed)];
  }
  return { ok: errors.length === 0, errors, doc };
}

export function summary(doc) {
  const one = (l) => { const ts = inList(doc, l); const d = ts.filter((t) => t.done).length; return `${ts.length - d} open, ${d} done`; };
  const work = inList(doc, 'work').length;
  return work ? `Personal: ${one('personal')} · Work: ${one('work')}` : one('personal');
}

export function newTask({ title, due, source = 'manual', id, notes, list = 'personal' }, now = new Date().toISOString()) {
  if (list === 'work') source = 'manual';
  const t = { id: id || (list === 'work' ? 'w-' : source === 'manual' ? 'm-' : 's-') + uid(), title: title.trim(), source, list: list === 'work' ? 'work' : 'personal', done: false, doneAt: null, comments: [], createdAt: now };
  if (due) t.due = due;
  if (notes) t.notes = notes;
  return t;
}

/** Open tasks in stored order (newest first); done tasks by most recently completed. */
export const openTasks = (doc, list = DEFAULT_LIST) => inList(doc, list).filter((t) => !t.done);
export const doneTasks = (doc, list = DEFAULT_LIST) => inList(doc, list).filter((t) => t.done).sort((a, b) => (Date.parse(b.doneAt) || 0) - (Date.parse(a.doneAt) || 0));

// ---------------------------------------------------------------- sync feed
/** Parse + validate the (decrypted) feed text. Returns { ok, error?, feed? }. Bad individual tasks are skipped (counted), not fatal. */
export function parseFeed(text) {
  if (typeof text !== 'string' || text.length > LIMITS.feedBytes) return { ok: false, error: 'The task file is too large (max 1 MB).' };
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'The task file is not valid JSON.' }; }
  if (!isObj(obj)) return { ok: false, error: 'The task file must be a JSON object like {"version":1,"tasks":[…]}.' };
  if (obj.version !== 1) return { ok: false, error: obj.version > 1 ? 'The task file is a newer format than this app understands (update AI-TOR).' : 'The task file needs "version": 1.' };
  if (!Array.isArray(obj.tasks)) return { ok: false, error: 'The task file needs a "tasks" list.' };
  const tasks = []; let skipped = 0; const seen = new Set();
  for (const t of obj.tasks.slice(0, LIMITS.tasks)) {
    if (!isObj(t) || typeof t.id !== 'string' || !t.id.trim() || t.id.length > LIMITS.id || typeof t.title !== 'string' || !t.title.trim() || seen.has(t.id)) { skipped++; continue; }
    seen.add(t.id);
    const e = { id: t.id, title: t.title.trim().slice(0, LIMITS.title) };
    if (typeof t.due === 'string' && isValidISODate(t.due)) e.due = t.due;
    if (typeof t.notes === 'string' && t.notes.trim()) e.notes = t.notes.trim().slice(0, LIMITS.notes);
    if (t.removed === true) e.removed = true;
    tasks.push(e);
  }
  skipped += Math.max(0, obj.tasks.length - LIMITS.tasks);
  return { ok: true, feed: { updated: isISOTime(obj.updated) ? obj.updated : null, tasks, skipped } };
}

/**
 * Merge a parsed feed into a doc (mutates `doc`). Rules:
 *  - unknown id -> added as an OPEN task (newest first, feed order kept) unless the user deleted it earlier
 *  - known id   -> only title/due/notes of sync-sourced tasks follow the feed; done, doneAt and comments are never touched
 *  - missing from feed -> task stays (nothing is removed because it disappeared)
 *  - feed entry with "removed": true -> an open sync task is deleted; a task you already completed stays in Done
 *  - ONLY the Personal list takes part: Work tasks are never read, changed, removed or counted, and a feed id that happens to equal a Work task's id is skipped
 */
export function mergeFeed(doc, feed, now = new Date().toISOString()) {
  const stats = { added: 0, updated: 0, removed: 0, skipped: feed.skipped || 0 };
  const byId = new Map(doc.tasks.filter((t) => listOf(t) === 'personal').map((t) => [t.id, t]));
  const workIds = new Set(doc.tasks.filter((t) => listOf(t) === 'work').map((t) => t.id));
  const personalCount = byId.size;
  const dismissed = new Set(doc.dismissed);
  const fresh = [];
  for (const e of feed.tasks) {
    if (workIds.has(e.id)) { stats.skipped++; continue; }
    const cur = byId.get(e.id);
    if (e.removed) {
      if (cur && cur.source === 'sync' && !cur.done) { doc.tasks = doc.tasks.filter((t) => t !== cur); byId.delete(e.id); stats.removed++; }
      continue;
    }
    if (cur) {
      if (cur.source !== 'sync') continue;
      let changed = false;
      if (cur.title !== e.title) { cur.title = e.title; changed = true; }
      if ((cur.due || '') !== (e.due || '')) { if (e.due) cur.due = e.due; else delete cur.due; changed = true; }
      if ((cur.notes || '') !== (e.notes || '')) { if (e.notes) cur.notes = e.notes; else delete cur.notes; changed = true; }
      if (changed) stats.updated++;
      continue;
    }
    if (dismissed.has(e.id)) continue;
    if (personalCount + fresh.length >= LIMITS.tasks) { stats.skipped++; continue; }
    fresh.push(newTask({ id: e.id, title: e.title, due: e.due, notes: e.notes, source: 'sync', list: 'personal' }, now));
    stats.added++;
  }
  if (fresh.length) doc.tasks = [...fresh, ...doc.tasks];
  doc.updatedAt = now;
  return stats;
}
