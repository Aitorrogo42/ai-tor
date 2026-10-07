import { h, money, parseAmount, uid, fmtDate, isValidISODate } from '../../js/util.js';
import { icon } from '../../js/icons.js';
import { field, confirmDialog } from '../../js/ui.js';
import { DEFAULT_GROUPS, LIMITS, canonicalGroup, effectiveExpenses } from './model.js';

const CUSTOM = '__custom__';
const txt = (id, value, extra = {}) => h('input', { type: 'text', id, value: value ?? '', autocomplete: 'off', autocapitalize: 'words', ...extra });
const amt = (id, value, extra = {}) => h('input', { type: 'text', id, inputmode: 'decimal', autocomplete: 'off', value: value == null ? '' : String(value), ...extra });

function formShell(title, id, fields, onSave, onCancel) {
  const err = h('div', { class: 'form-err', role: 'alert', hidden: true });
  const form = h('form', { class: 'card form', id, novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const msg = onSave();
    if (msg) { err.textContent = msg; err.hidden = false; } 
  } },
    h('h3', null, title), fields, err,
    h('div', { class: 'btnrow' },
      h('button', { type: 'submit', class: 'btn primary', 'data-act': 'save' }, 'Save'),
      h('button', { type: 'button', class: 'btn ghost', 'data-act': 'cancel', onclick: onCancel }, 'Cancel')));
  return form;
}

export function renderEdit(root, doc, ctx) {
  let open = ctx.openForm || null; // {kind, id|null}
  ctx.openForm = null;
  const customGroups = () => [...new Set(doc.accounts.map((a) => a.group).filter((g) => !DEFAULT_GROUPS.includes(g)))];
  const close = () => { open = null; draw(); };
  const commit = (fn) => { fn(); ctx.save(doc); draw(); };

  function accountForm(item) {
    const isNew = !item;
    const name = txt('f-name', item?.name, { maxlength: LIMITS.name, placeholder: 'e.g. Main brokerage', required: true });
    const value = amt('f-value', item?.value, { placeholder: '0' });
    const cg = customGroups();
    const initial = item ? item.group : 'Stock/Equity';
    const known = [...DEFAULT_GROUPS, ...cg];
    const sel = h('select', { id: 'f-group', onchange: () => { customField.hidden = sel.value !== CUSTOM; if (!customField.hidden) custom.focus(); } },
      known.map((g) => h('option', { value: g, selected: g === initial }, g)),
      h('option', { value: CUSTOM }, '+ Custom group…'));
    const custom = txt('f-custom', '', { maxlength: LIMITS.group, placeholder: 'e.g. Collectibles' });
    const customField = field('Custom group name', custom); customField.hidden = true;
    const note = txt('f-note', item?.note, { maxlength: LIMITS.note, placeholder: 'Optional', autocapitalize: 'sentences' });
    return formShell(isNew ? 'Add account' : 'Edit account', 'account-form', [
      field('Account name', name), field('Current value', value, 'Numbers only, e.g. 12500.50'), field('Group', sel), customField, field('Note (optional)', note)],
    () => {
      const n = name.value.trim(), v = parseAmount(value.value);
      if (!n) return 'Please enter an account name.';
      if (v == null || Number.isNaN(v)) return 'Please enter the value as a number, e.g. 12500.';
      if (v < 0) return 'Account values can\'t be negative. Put what you owe under Debts.';
      if (v > LIMITS.amount) return 'That number is too large.';
      let g = sel.value;
      if (g === CUSTOM) { g = canonicalGroup(custom.value); if (!g) return 'Please type a name for your custom group.'; }
      commit(() => {
        const rec = { id: item?.id || uid(), name: n, value: v, group: g, note: note.value.trim(), ...(item?.fk ? { fk: item.fk } : {}) };
        if (item) doc.accounts[doc.accounts.findIndex((a) => a.id === item.id)] = rec; else doc.accounts.push(rec);
        open = null;
      });
      return null;
    }, close);
  }

  function debtForm(item) {
    const name = txt('f-name', item?.name, { maxlength: LIMITS.name, placeholder: 'e.g. Car loan' });
    const value = amt('f-amount', item?.amount, { placeholder: '0' });
    const note = txt('f-note', item?.note, { maxlength: LIMITS.note, placeholder: 'Optional', autocapitalize: 'sentences' });
    return formShell(item ? 'Edit debt' : 'Add debt', 'debt-form', [field('What is it?', name), field('Amount owed', value, 'Positive number; it is subtracted from your assets'), field('Note (optional)', note)], () => {
      const n = name.value.trim(), v = parseAmount(value.value);
      if (!n) return 'Please enter a name.';
      if (v == null || Number.isNaN(v) || v < 0) return 'Please enter the amount owed as a number (0 or more).';
      if (v > LIMITS.amount) return 'That number is too large.';
      commit(() => {
        const rec = { id: item?.id || uid(), name: n, amount: v, note: note.value.trim(), ...(item?.fk ? { fk: item.fk } : {}) };
        if (item) doc.debts[doc.debts.findIndex((a) => a.id === item.id)] = rec; else doc.debts.push(rec);
        open = null;
      });
      return null;
    }, close);
  }

  function goalForm(item) {
    const name = txt('f-name', item?.name, { maxlength: LIMITS.name, placeholder: 'e.g. House down payment' });
    const target = amt('f-target', item?.target, { placeholder: '0' });
    const date = h('input', { type: 'date', id: 'f-date', value: item?.date || '' });
    return formShell(item ? 'Edit goal' : 'Add goal', 'goal-form', [field('Goal name', name), field('Target amount', target), field('Target date (optional)', date, 'Needed to draw the projection illustration')], () => {
      const n = name.value.trim(), v = parseAmount(target.value);
      if (!n) return 'Please enter a goal name.';
      if (v == null || Number.isNaN(v) || v <= 0) return 'Please enter a target amount greater than 0.';
      if (v > LIMITS.amount) return 'That number is too large.';
      if (date.value && !isValidISODate(date.value)) return 'Please pick a valid date.';
      commit(() => {
        const rec = { id: item?.id || uid(), name: n, target: v, date: date.value || null, ...(item?.fk ? { fk: item.fk } : {}) };
        if (item) doc.goals[doc.goals.findIndex((a) => a.id === item.id)] = rec; else doc.goals.push(rec);
        open = null;
      });
      return null;
    }, close);
  }

  const del = async (list, item, what) => {
    const ok = await confirmDialog({ title: `Delete this ${what}?`, message: `"${item.name}" will be removed from this device. This can't be undone.`, okLabel: 'Delete', danger: true });
    if (ok) commit(() => { list.splice(list.indexOf(item), 1); });
  };
  const openForm = (kind, id = null) => { open = { kind, id }; draw(); };

  function listCard(id, items, rowFn, emptyText) {
    return h('div', { class: 'card', id }, items.length ? items.map(rowFn) : h('p', { class: 'note' }, emptyText));
  }
  const itemRow = (kind, list, item, title, sub, amount, what) =>
    h('div', { class: 'item', 'data-id': item.id },
      h('div', { class: 'l' }, h('div', { class: 'in' }, title), sub ? h('div', { class: 'sub' }, sub) : null),
      h('div', { class: 'r' }, amount),
      h('div', { class: 'item-actions' },
        h('button', { type: 'button', class: 'btn ghost small', 'data-act': 'edit', 'aria-label': `Edit ${what} ${item.name}`, onclick: () => openForm(kind, item.id) }, 'Edit'),
        h('button', { type: 'button', class: 'btn ghost small danger-txt', 'data-act': 'delete', 'aria-label': `Delete ${what} ${item.name}`, onclick: () => del(list, item, what) }, 'Delete')));

  function draw() {
    root.replaceChildren();
    document.title = 'Edit finances · AI-TOR';
    const formFor = (kind) => (open && open.kind === kind ? ({ account: accountForm, debt: debtForm, goal: goalForm }[kind])(open.id ? ({ account: doc.accounts, debt: doc.debts, goal: doc.goals }[kind]).find((x) => x.id === open.id) : null) : null);
    const addBtn = (kind, label) => (open && open.kind === kind ? null : h('button', { type: 'button', class: 'btn primary add', id: 'add-' + kind, onclick: () => openForm(kind) }, icon('plus'), label));

    root.append(h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/finances' }, icon('chevL'), 'Dashboard'), h('a', { class: 'btn ghost small', href: '#/finances', id: 'done-btn' }, 'Done')),
      h('div', { class: 'fin-head' }, h('h1', { class: 'ph-title' }, 'Your finances'), h('div', { class: 'asof' }, 'Everything is saved on this device as you go.')));

    root.append(h('h2', { class: 'sec' }, 'Accounts'));
    root.append(listCard('accounts-list', doc.accounts, (a) => itemRow('account', doc.accounts, a, a.name, a.group + (a.note ? ' · ' + a.note : ''), money(a.value), 'account'), 'No accounts yet. Add a bank account, brokerage, retirement account, property, etc.'));
    root.append(formFor('account') || addBtn('account', 'Add account'));

    root.append(h('h2', { class: 'sec' }, 'Debts & liabilities'));
    root.append(listCard('debts-list', doc.debts, (d) => itemRow('debt', doc.debts, d, d.name, d.note, money(d.amount), 'debt'), 'No debts added. Net worth = assets − debts.'));
    root.append(formFor('debt') || addBtn('debt', 'Add debt'));

    root.append(h('h2', { class: 'sec' }, 'Monthly income & expenses (optional)'));
    const inc = amt('f-income', doc.monthlyIncome, { placeholder: 'Optional' }), exp = amt('f-expenses', effectiveExpenses(doc), { placeholder: 'Optional' });
    const ovOn = !!doc.monthlyExpensesOverride;   // v40.1: while your dashboard estimate is on, this field edits that estimate (blank = back to the feed / saved value)
    const ierr = h('div', { class: 'form-err', role: 'alert', hidden: true });
    root.append(h('form', { class: 'card form', id: 'cashflow-form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const i = parseAmount(inc.value), x = parseAmount(exp.value);
      if (Number.isNaN(i) || Number.isNaN(x) || (i != null && (i < 0 || i > LIMITS.amount)) || (x != null && (x < 0 || x > LIMITS.amount))) { ierr.textContent = 'Please enter numbers (0 or more), or leave blank.'; ierr.hidden = false; return; }
      commit(() => { doc.monthlyIncome = i; if (ovOn) doc.monthlyExpensesOverride = x == null ? null : { value: x, at: new Date().toISOString() }; else doc.monthlyExpenses = x; });
    } }, field('Income per month (after tax)', inc), field(ovOn ? 'Expenses per month (your estimate)' : 'Expenses per month', exp), ierr,
      h('div', { class: 'btnrow' }, h('button', { type: 'submit', class: 'btn primary', 'data-act': 'save' }, 'Save'))));

    root.append(h('h2', { class: 'sec' }, 'Goals'));
    root.append(listCard('goals-list', doc.goals, (g) => itemRow('goal', doc.goals, g, g.name, g.date ? 'By ' + fmtDate(g.date) : 'No date', money(g.target), 'goal'), 'No goals yet. Add a target amount (and a date for the projection illustration).'));
    root.append(formFor('goal') || addBtn('goal', 'Add goal'));

    root.append(h('h2', { class: 'sec' }, 'Notes'));
    const notes = h('textarea', { id: 'f-notes', rows: '4', maxlength: LIMITS.notes, placeholder: 'Anything you want to remember' }, doc.notes);
    root.append(h('form', { class: 'card form', id: 'notes-form', onsubmit: (e) => { e.preventDefault(); commit(() => { doc.notes = notes.value; }); } },
      field('Your notes', notes), h('div', { class: 'btnrow' }, h('button', { type: 'submit', class: 'btn primary', 'data-act': 'save' }, 'Save notes'))));

    root.append(h('p', { class: 'note center' }, icon('lock'), 'Stored only on this device. Nothing is uploaded.'));
    if (open) { const f = root.querySelector('.card.form input'); if (f && !f.value) f.focus({ preventScroll: false }); }
  }
  draw();
}
