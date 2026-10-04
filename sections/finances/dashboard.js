import { h, pageTitle, countUp, money, pct, fmtDate, todayISO } from '../../js/util.js';
import { icon } from '../../js/icons.js';
import { compute, alerts, projectableGoals } from './model.js';
import { projectionChart } from './chart.js';
import { refreshBar } from './refreshbar.js';

let projGoalId = null; // which goal the illustration uses (UI-only state)

function groupCard(g) {
  return h('details', { class: 'group', 'data-group': g.name },
    h('summary', null,
      h('div', { class: 'gsum' },
        h('div', null,
          h('div', { class: 't' }, h('span', { class: 'dot', style: `background:${g.color}` }), g.name),
          h('div', { class: 'sub' }, g.accounts.length + (g.accounts.length === 1 ? ' account' : ' accounts'))),
        h('div', null, h('div', { class: 'amt' }, money(g.total)), h('div', { class: 'p' }, pct(g.share) + ' of assets'))),
      h('div', { class: 'gtap' }, 'Tap to show accounts')),
    h('div', { class: 'gbody' },
      g.accounts.map((a) => h('div', { class: 'row acct' },
        h('div', { class: 'l' }, a.name, a.note ? h('span', { class: 'src' }, a.note) : null),
        h('div', { class: 'r' }, money(a.value))))));
}

const na = (id, title, text, link = '#/finances/edit', cta = 'Add') =>
  h('div', { class: 'card na', id },
    h('div', { class: 'k' }, title), h('div', { class: 'big' }, 'Not added'), h('div', { class: 'note' }, text),
    h('a', { class: 'btn ghost small', href: link }, cta));

function projectionCard(doc, c, cands) {
  if (!cands.some((g) => g.id === projGoalId)) projGoalId = cands[0].id;
  const today = todayISO();
  const card = h('div', { class: 'card', id: 'projection' });
  const draw = () => {
    const goal = cands.find((x) => x.id === projGoalId);
    card.replaceChildren(
      h('div', { class: 'k' }, 'Illustration: path to your goal'),
      h('div', { class: 'banner' }, 'Illustration only, not a forecast. It draws a straight line from your net worth today to your goal on its date. It assumes no investment returns, contributions, or market moves.'),
      cands.length > 1 ? h('label', { class: 'fld', style: 'margin-top:10px' }, h('span', { class: 'fl' }, 'Goal to illustrate'),
        h('select', { id: 'proj-goal', onchange: (e) => { projGoalId = e.target.value; draw(); } },
          cands.map((x) => h('option', { value: x.id, selected: x.id === projGoalId }, x.name)))) : null,
      h('div', { class: 'chart-wrap' }, projectionChart({
        start: today, end: goal.date, goalValue: goal.target, nowValue: c.netWorth,
        series: [
          { label: 'Net worth held flat', color: '#ff5238', points: [[today, c.netWorth], [goal.date, c.netWorth]] },
          { label: 'Straight line to goal', color: '#ffffff', dash: '6 5', points: [[today, c.netWorth], [goal.date, goal.target]] },
        ] })),
      h('div', { class: 'legend' },
        h('span', null, h('span', { class: 'dot', style: 'background:#ff5238' }), 'Net worth today, held flat'),
        h('span', null, h('span', { class: 'dash-key' }), 'Straight line to goal')),
      h('div', { style: 'margin-top:10px' },
        h('div', { class: 'row' }, h('div', { class: 'l' }, 'Net worth today'), h('div', { class: 'r' }, money(c.netWorth))),
        h('div', { class: 'row' }, h('div', { class: 'l' }, 'Goal (' + fmtDate(goal.date) + ')'), h('div', { class: 'r' }, money(goal.target))),
        h('div', { class: 'row' }, h('div', { class: 'l' }, 'Gap'), h('div', { class: 'r' }, money(goal.target - c.netWorth))),
        h('div', { class: 'row' }, h('div', { class: 'l' }, 'Needed per month, with no growth'),
          h('div', { class: 'r' }, 'About ' + money((goal.target - c.netWorth) / Math.max(1, monthsTo(goal.date)))))));
  };
  draw();
  return card;
}
function monthsTo(iso) {
  const [ty, tm, td] = todayISO().split('-').map(Number), [gy, gm, gd] = iso.split('-').map(Number);
  return (gy - ty) * 12 + (gm - tm) + (gd - td) / 30;
}

export function renderDashboard(root, doc, ctx) {
  const c = compute(doc);
  document.title = 'Finances · AI-TOR';
  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home'),
      h('a', { class: 'btn ghost small', href: '#/finances/edit', id: 'edit-btn' }, icon('edit'), 'Edit')),
    h('div', { class: 'fin-head' }, pageTitle('finances', 'Finances'),
      doc.updatedAt && !(doc.feed && doc.feed.refreshedAt) ? h('div', { class: 'asof' }, 'Last updated ' + new Date(doc.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })) : null));

  root.append(refreshBar(doc, ctx.rerender));

  if (doc.example) {
    root.append(h('div', { class: 'banner example', id: 'example-banner' },
      h('b', null, 'Fake example data. '), 'These numbers are made up to show how AI-TOR looks.',
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn ghost small', id: 'clear-example', onclick: () => ctx.clearExample() }, 'Clear example & start fresh'),
        h('button', { class: 'btn ghost small', id: 'keep-example', onclick: () => ctx.keepExample() }, 'Keep & edit as mine'))));
  }

  // 1. net worth
  const top = c.groups[0];
  root.append(h('div', { class: 'card', id: 'networth' },
    h('div', { class: 'k' }, 'Net worth'),
    h('div', { class: 'v ' + (c.netWorth < 0 ? 'neg' : ''), 'data-count': String(c.netWorth) }, money(c.netWorth)),
    h('div', { class: 'sub' }, 'Assets ' + money(c.assets) + ' − Debts ' + money(c.debts)),
    h('div', null,
      !doc.debts.length ? h('span', { class: 'chip warn' }, 'No debts added') : null,
      !c.hasCash ? h('span', { class: 'chip warn' }, 'No bank/cash accounts added') : null),
    top ? h('div', null,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('div', { class: 'l' }, 'Largest group: ' + top.name), h('div', { class: 'r' }, pct(top.share) + ' of assets')),
      h('div', { class: 'bar' }, h('i', { style: `width:${(top.share * 100).toFixed(1)}%;background:${top.color}` }))) : null));

  // 2. income & expenses
  const hasInc = doc.monthlyIncome != null, hasExp = doc.monthlyExpenses != null;
  root.append(h('h2', { class: 'sec' }, 'Monthly income & expenses'));
  if (hasInc || hasExp) {
    root.append(h('div', { class: 'grid2', id: 'income' },
      hasInc ? h('div', { class: 'card' }, h('div', { class: 'k' }, 'Income / month'), h('div', { class: 'v sm', 'data-count': String(doc.monthlyIncome) }, money(doc.monthlyIncome))) : na('na-income', 'Monthly income', 'Add it to see your monthly surplus.'),
      hasExp ? h('div', { class: 'card' }, h('div', { class: 'k' }, 'Expenses / month'), h('div', { class: 'v sm', 'data-count': String(doc.monthlyExpenses) }, money(doc.monthlyExpenses))) : na('na-expenses', 'Monthly expenses', 'Add it to see your monthly surplus.'),
      c.surplus != null ? h('div', { class: 'card span2' }, h('div', { class: 'k' }, 'Income − expenses'),
        h('div', { class: 'v sm ' + (c.surplus >= 0 ? 'pos' : 'neg'), 'data-count': String(c.surplus) }, money(c.surplus)), h('div', { class: 'sub' }, 'per month, derived from your numbers')) : null));
  } else {
    root.append(h('div', { class: 'grid2' }, na('na-income', 'Monthly income', 'Optional.'), na('na-expenses', 'Monthly expenses', 'Optional.')));
  }

  // 3. asset groups
  root.append(h('h2', { class: 'sec' }, 'Asset groups'));
  if (c.groups.length) {
    root.append(h('div', { class: 'card', id: 'mix' },
      h('div', { class: 'k' }, 'Where your assets are'),
      h('div', { class: 'stack', role: 'img', 'aria-label': 'Asset mix' }, c.groups.map((g) => h('i', { style: `width:${(g.share * 100).toFixed(2)}%;background:${g.color}`, title: g.name }))),
      h('div', { class: 'legend' }, c.groups.map((g) => h('span', null, h('span', { class: 'dot', style: `background:${g.color}` }), g.name + ' ' + pct(g.share))))));
    c.groups.forEach((g) => root.append(groupCard(g)));
  } else {
    root.append(na('na-accounts', 'Accounts', 'No accounts yet.', '#/finances/edit', 'Add an account'));
  }

  // 4. projection (illustration)
  const cands = projectableGoals(doc, c);
  if (cands.length) { root.append(h('h2', { class: 'sec' }, 'Projection (illustration)')); root.append(projectionCard(doc, c, cands)); }

  // 5. alerts & goals
  const al = alerts(doc, c, pct, money);
  if (al.length) {
    root.append(h('h2', { class: 'sec' }, 'Alerts'));
    root.append(h('div', { class: 'card', id: 'alerts' }, h('ul', { class: 'clean alerts' }, al.map((t) => h('li', null, t)))));
  }
  if (doc.goals.length) {
    root.append(h('h2', { class: 'sec' }, 'Goals'));
    root.append(h('div', { class: 'card', id: 'goals' }, h('ul', { class: 'clean goals' }, doc.goals.map((g) => {
      const p = Math.max(0, Math.min(1, c.netWorth / g.target));
      return h('li', null, h('b', null, g.name), h('div', { class: 'sub' }, 'Target ' + money(g.target) + (g.date ? ' by ' + fmtDate(g.date) : '') + ' · net worth is ' + pct(p, 0) + ' of target'),
        h('div', { class: 'bar' }, h('i', { style: `width:${(p * 100).toFixed(1)}%;background:var(--mars)` })));
    }))));
  }

  // 6. not available (only what is empty)
  const missing = [];
  if (!doc.debts.length) missing.push(na('na-debts', 'Debts', 'No loans, mortgage or card balances added. Net worth shows assets only.'));
  if (!c.hasCash) missing.push(na('na-cash', 'Bank cash balances', 'No Cash/Bank accounts added yet.'));
  if (!doc.goals.length) missing.push(na('na-goals', 'Goals', 'Add a goal with a target (and date) to see progress and a projection illustration.'));
  else if (!cands.length && doc.goals.some((g) => !g.date)) missing.push(na('na-projection', 'Projection', 'Give a goal a future date and a target above your net worth to see the illustration.'));
  if (missing.length) { root.append(h('h2', { class: 'sec' }, 'Not available')); missing.forEach((m) => root.append(m)); }

  // 7. notes
  if (doc.notes.trim()) {
    root.append(h('h2', { class: 'sec' }, 'Notes'));
    root.append(h('details', { class: 'src-all', id: 'notes' }, h('summary', null, 'Tap to expand your notes'), h('div', { class: 'gbody' }, h('p', { class: 'notes-text' }, doc.notes))));
  }
  root.append(h('p', { class: 'note center' }, icon('lock'), 'Stored only on this device. Export a backup any time in Settings.'));
  // count the headline numbers up when the page is entered (no-op for reduced motion and for in-place re-renders)
  root.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count), money));
}
