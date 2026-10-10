import { h, pageTitle, money, money2, pct, fmtDate, todayISO, parseAmount } from '../../js/util.js';
import { icon } from '../../js/icons.js';
import * as storage from '../../js/storage.js';
import { compute, alerts, projectableGoals, validate, projectSavings, LIMITS, RETURN_DEFAULT, RETURN_MIN, RETURN_MAX } from './model.js';
import { projectionChart, savingsChart } from './chart.js';
import { refreshBar } from './refreshbar.js';
import { financePrivacy, MASK } from './privacy.js';

let projGoalId = null; // which goal the illustration uses (UI-only state)
// v46: every personal figure goes through `priv.secret(...)` (placeholder + blur while hidden); public data (prices, dates, labels, asset shares) does not.
const sec = (priv, text, opts) => priv.secret(text, MASK.money, opts);
const hasAmount = (t) => /\$|\d{1,3}(,\d{3})+|\d+\.\d{2}|\d{5,}/.test(t);   // free text that quotes an amount (dates and small numbers do not match)

function groupCard(g, priv) {
  return h('details', { class: 'group', 'data-group': g.name },
    h('summary', null,
      h('div', { class: 'gsum' },
        h('div', null,
          h('div', { class: 't' }, h('span', { class: 'dot', style: `background:${g.color}` }), g.name),
          h('div', { class: 'sub' }, g.accounts.length + (g.accounts.length === 1 ? ' account' : ' accounts'))),
        h('div', null, h('div', { class: 'amt' }, sec(priv, money(g.total))), h('div', { class: 'p' }, pct(g.share) + ' of assets'))),   // the share is relative only (no absolute amount)
      h('div', { class: 'gtap' }, 'Tap to show accounts')),
    h('div', { class: 'gbody' },
      g.accounts.map((a) => h('div', { class: 'row acct' },
        h('div', { class: 'l' }, a.name, a.note ? (hasAmount(a.note) ? priv.secret(a.note, MASK.text, { cls: 'src' }) : h('span', { class: 'src' }, a.note)) : null),   // an account note that quotes an amount is hidden too
        h('div', { class: 'r' }, sec(priv, money(a.value)))))));
}

const na = (id, title, text, link = '#/finances/edit', cta = 'Add') =>
  h('div', { class: 'card na', id },
    h('div', { class: 'k' }, title), h('div', { class: 'big' }, 'Not added'), h('div', { class: 'note' }, text),
    h('a', { class: 'btn ghost small', href: link }, cta));

function projectionCard(doc, c, cands, priv) {
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
          cands.map((x) => h('option', { value: x.id, selected: x.id === projGoalId }, x.name)))) : '',   // v46: '' not null (replaceChildren(null) printed the word "null" above the chart when only one goal can be illustrated)
      h('div', { class: 'chart-wrap' }, (() => {
        const svg = projectionChart({
          start: today, end: goal.date, goalValue: goal.target, nowValue: c.netWorth, history: (doc.feed && doc.feed.history) || [],   // v46: past points (feed, user-entered)
          series: [
            { label: 'Net worth held flat', color: '#ff5238', points: [[today, c.netWorth], [goal.date, c.netWorth]] },
            { label: 'Straight line to goal', color: '#ffffff', dash: '6 5', points: [[today, c.netWorth], [goal.date, goal.target]] },
          ] });
        priv.chart(svg);
        if (svg.past) priv.swap(svg.past.g, svg.past.real, svg.past.mask);   // v46: the past line, its markers and labels (positions + amounts) are only in the page while revealed   // v46: tick labels, "Goal $X", "Today $X" and the y-axis note are masked while hidden (the curves alone give no absolute scale)
        return svg;
      })()),
      h('div', { class: 'legend' },
        h('span', null, h('span', { class: 'dot', style: 'background:#ff5238' }), 'Net worth today, held flat'),
        h('span', null, h('span', { class: 'dash-key' }), 'Straight line to goal'),
        (doc.feed && doc.feed.history || []).some((p) => p.date < today) ? h('span', { class: 'pj-past-key' }, h('span', { class: 'dot', style: 'background:#c4c5c6' }), 'Net worth history (entered by you)') : null),
      h('div', { style: 'margin-top:10px' },
        h('div', { class: 'row' }, h('div', { class: 'l' }, 'Net worth today'), h('div', { class: 'r' }, priv.secret(money(c.netWorth), MASK.big))),
        h('div', { class: 'row' }, h('div', { class: 'l' }, 'Goal (' + fmtDate(goal.date) + ')'), h('div', { class: 'r' }, sec(priv, money(goal.target)))),
        h('div', { class: 'row' }, h('div', { class: 'l' }, 'Gap'), h('div', { class: 'r' }, sec(priv, money(goal.target - c.netWorth)))),   // v44: goal - net worth gives net worth away
        h('div', { class: 'row' }, h('div', { class: 'l' }, 'Needed per month, with no growth'),
          h('div', { class: 'r' }, 'About ', sec(priv, money((goal.target - c.netWorth) / Math.max(1, monthsTo(goal.date))))))));
  };
  draw();
  return card;
}
// "Key holdings": the prices the assistant used for the totals above. Feed-only (no manual entries); hidden when the feed has none.
const priceText = (p) => (Math.abs(p) >= 10000 ? money(p) : money2(p));
const chgText = (c) => (c > 0 ? '▲ +' : c < 0 ? '▼ −' : '') + Math.abs(c).toFixed(2) + '%';
function holdingsCard(f) {
  const rows = f.prices.map((p) => {
    const meta = [p.basis, p.asOf].filter(Boolean).join(' · ');
    return h('div', { class: 'row hold', 'data-ticker': p.ticker },
      h('div', { class: 'l' }, h('b', { class: 'tk' }, p.ticker), p.name ? h('span', { class: 'nm' }, p.name) : null),
      h('div', { class: 'r' }, h('div', { class: 'px' }, priceText(p.price)),
        p.changePct != null || meta ? h('div', { class: 'pmeta' },
          p.changePct != null ? h('span', { class: 'chg ' + (p.changePct > 0 ? 'up' : p.changePct < 0 ? 'down' : 'flat') }, chgText(p.changePct)) : null,
          p.changePct != null && meta ? ' · ' : null, meta || null) : null));
  });
  const asOf = f.asOf || f.prices.map((p) => p.asOf).find(Boolean) || (f.refreshedAt ? new Date(f.refreshedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null);
  return h('div', { class: 'card', id: 'holdings' }, rows,
    h('p', { class: 'hold-foot', id: 'holdings-foot' }, 'Prices used in the totals above' + (asOf ? ', as of ' + asOf : '') + '.'));
}

// v40.1 "Income breakdown": each person's monthly take-home, a per-paycheck row (gross, each deduction, net) and the monthly gross / deductions / net.
// Feed-only (Financials Bot's numbers, never typed in); hidden when the feed has none. Amounts shown exactly as given (cents only when the feed has cents).
const amtText = (n) => (Number.isInteger(n) ? money(n) : money2(n));
const dedText = (n) => (n > 0 ? '−' + amtText(n) : amtText(n));
const ibRow = (cls, label, value, attrs = {}) => h('div', { class: 'row ' + cls, ...attrs }, h('div', { class: 'l' }, label), h('div', { class: 'r' }, value));
function breakdownCard(ib, priv) {
  const kids = [h('div', { class: 'ib-head' }, h('div', { class: 'k' }, 'Income breakdown'),
    ib.estimate ? h('span', { class: 'chip warn ib-est', id: 'ib-estimate' }, 'Estimate, until first new pay stub') : null)];
  for (const p of ib.people) {
    kids.push(h('div', { class: 'row ib-person', 'data-person': p.name },
      h('div', { class: 'l' }, h('b', null, p.name), h('span', { class: 'src' }, 'Take-home per month'), p.note ? priv.secret(p.note, MASK.text, { cls: 'src ib-note' }) : null),
      h('div', { class: 'r' }, sec(priv, money(p.monthlyNet)), h('span', { class: 'per' }, '/mo'))));
    if (p.paycheck || p.monthly) {
      const box = h('div', { class: 'ib-detail', 'data-person': p.name });
      if (p.paycheck) {
        const pc = p.paycheck;
        box.append(h('div', { class: 'ib-sub' }, p.name + "'s paycheck" + (pc.perYear ? ' (' + pc.perYear + ' a year)' : '')),
          h('div', { class: 'ib-pay' }, ibRow('ib-gross', 'Gross', sec(priv, amtText(pc.gross))),
            pc.lines.map((ln) => ibRow('ib-ded', ln.label, sec(priv, dedText(ln.amount)), { 'data-label': ln.label })),
            ibRow('ib-net', 'Net per paycheck', sec(priv, amtText(pc.net)))));
      }
      if (p.monthly) {
        const m = p.monthly;
        box.append(h('div', { class: 'ib-sub' }, p.name + ' per month'),
          h('div', { class: 'ib-mo' }, ibRow('ib-gross', 'Gross', sec(priv, amtText(m.gross))), ibRow('ib-ded', 'Deductions', sec(priv, dedText(m.deductions))), ibRow('ib-net', 'Net', sec(priv, amtText(m.net)))));
      }
      kids.push(box);
    }
  }
  if (ib.people.length > 1) kids.push(ibRow('ib-total', 'Total take-home', h('span', null, sec(priv, money(ib.people.reduce((s, p) => s + p.monthlyNet, 0))), h('span', { class: 'per' }, '/mo')), { id: 'ib-total' }));
  const fnote = ib.note || (ib.basis === 'net' ? 'Take-home pay, after taxes and deductions.' : null), fas = ib.asOf ? 'As of ' + ib.asOf + '.' : null;
  if (fnote || fas) kids.push(h('p', { class: 'hold-foot', id: 'ib-foot' }, ib.note ? priv.secret(ib.note, MASK.text) : fnote, fnote && fas ? ' ' : null, fas));   // the free-text note may quote amounts: hidden; the as-of date is public
  return h('div', { class: 'card', id: 'income-breakdown' }, kids);
}

// v40.1: change a value on the LATEST saved doc (an auto refresh may have saved since this page was drawn), then save + redraw.
function patchDoc(doc, ctx, fn) {
  let target = doc;
  try { const raw = storage.section('finances').get(); const v = raw ? validate(raw) : null; if (v && v.ok) target = v.doc; } catch { /* use the drawn doc */ }
  fn(target); ctx.save(target); ctx.rerender();
}

// v40.1 editable expenses: tap the number, type your own estimate (numeric keypad), saved on Enter / leaving the field. It wins over the feed until reset.
function expensesCard(doc, c, ctx, priv) {
  const ov = doc.monthlyExpensesOverride, fromFeed = !!(doc.feed && doc.feed.refreshedAt);
  const card = h('div', { class: 'card exp-card', id: 'expenses-card' });
  const show = () => {
    card.replaceChildren(
      h('div', { class: 'k' }, 'Expenses / month'),
      (() => {
        // v46: while hidden a tap only reveals (it never opens the editor, so the input can never show the real number); a second tap edits
        const btn = h('button', { type: 'button', class: 'exp-val', id: 'exp-edit', onclick: () => { if (priv.isHidden()) priv.set(false); else edit(); } },
          h('span', { class: 'v sm' }, sec(priv, money(c.expenses))), icon('edit'));
        priv.attr(btn, 'aria-label', 'Edit monthly expenses, now ' + money(c.expenses), 'Edit monthly expenses (hidden, tap to show)');
        return btn;
      })(),
      ov ? h('div', { class: 'exp-ov' },
        h('span', { class: 'chip ok', id: 'exp-est' }, 'Your estimate'),
        doc.monthlyExpenses != null ? h('div', { class: 'sub', id: 'exp-base' }, (fromFeed ? 'Feed value ' : 'Saved value '), sec(priv, money(doc.monthlyExpenses))) : null,
        h('button', { type: 'button', class: 'btn ghost small', id: 'exp-reset', onclick: () => patchDoc(doc, ctx, (d) => { d.monthlyExpensesOverride = null; }) },
          fromFeed ? 'Reset to feed value' : 'Reset to saved value'))
        : h('div', { class: 'sub exp-hint' }, 'Tap to set your own estimate'));
  };
  let editing = false;
  priv.onHide(() => { if (editing) { editing = false; show(); } });   // the figures were hidden again (background, Hide): close the editor so the typed number leaves the page
  function edit() {
    let done = false; editing = true;
    const err = h('div', { class: 'form-err', id: 'exp-err', role: 'alert', hidden: true });
    const input = h('input', { type: 'text', id: 'exp-input', inputmode: 'decimal', enterkeyhint: 'done', autocomplete: 'off', 'aria-label': 'Monthly expenses, your estimate', value: String(c.expenses) });
    const commit = () => {
      if (done) return;
      const t = input.value.trim(), n = parseAmount(t);
      if (t === '') { done = true; editing = false; show(); return; }                  // nothing typed: keep what was there
      if (Number.isNaN(n) || n < 0 || n > LIMITS.amount) { err.textContent = 'Enter a number, 0 or more.'; err.hidden = false; return; }
      done = true;
      if (n === c.expenses) { editing = false; show(); return; }                     // unchanged
      patchDoc(doc, ctx, (d) => { d.monthlyExpensesOverride = { value: n, at: new Date().toISOString() }; });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { done = true; editing = false; show(); }
    });
    input.addEventListener('blur', commit);
    card.replaceChildren(h('div', { class: 'k' }, 'Expenses / month'), h('label', { class: 'exp-field' }, h('span', { class: 'cur' }, '$'), input), err,
      h('div', { class: 'sub' }, 'Your estimate. Saved when you press Enter or tap away.'));
    input.focus(); input.select();
  }
  show();
  return card;
}

// v40.1 savings summary + 10-year projection (illustration). The only rate is the one you type (default 5%), stored on this device.
const projCfg = () => storage.config('finproj');
function returnPct() { const v = (projCfg().get() || {}).returnPct; return typeof v === 'number' && Number.isFinite(v) && v >= RETURN_MIN && v <= RETURN_MAX ? v : RETURN_DEFAULT; }
const pctText = (v) => (Math.round(v * 100) / 100).toString() + '%';
function savingsCard(doc, c, priv) {
  const card = h('div', { class: 'card', id: 'savings' });
  const draw = () => {
    const usingOv = !!doc.monthlyExpensesOverride;
    const head = h('div', { class: 'grid2 sv-nums' },
      h('div', null, h('div', { class: 'k' }, 'Monthly surplus'), h('div', { class: 'v sm ' + (c.surplus > 0 ? 'pos' : c.surplus < 0 ? 'neg' : ''), id: 'sv-month' }, sec(priv, money(c.surplus)))),
      h('div', null, h('div', { class: 'k' }, 'Annual savings'), h('div', { class: 'v sm', id: 'sv-year' }, sec(priv, money(c.annualSavings)))));
    const sub = h('div', { class: 'sub' }, 'Income − expenses' + (usingOv ? ' (your expense estimate)' : '') + '; annual = monthly × 12.');
    if (!(c.surplus > 0)) {
      card.replaceChildren(head, sub, h('p', { class: 'sv-msg', id: 'savings-msg' },
        c.surplus === 0 ? 'Income and expenses are even right now, so there is nothing left over to project yet. When income pulls ahead, a 10-year view will show up here.'
          : 'Expenses are running ahead of income right now, so there is no monthly surplus to project. That is worth a look, and when income pulls ahead again a 10-year view will show up here.'));
      return;
    }
    const rate = returnPct(), rows = projectSavings(c.surplus, rate, 10);
    const err = h('div', { class: 'form-err', id: 'ret-err', role: 'alert', hidden: true });
    const input = h('input', { type: 'text', id: 'ret-input', inputmode: 'decimal', enterkeyhint: 'done', autocomplete: 'off', value: String(rate), 'aria-label': 'Assumed annual return, percent' });
    let done = false;
    const commit = () => {
      if (done) return;
      const n = parseAmount(input.value.replace('%', ''));
      if (input.value.trim() === '' || Number.isNaN(n) || n < RETURN_MIN || n > RETURN_MAX) { err.textContent = `Enter a percent from ${RETURN_MIN} to ${RETURN_MAX}.`; err.hidden = false; return; }
      done = true;
      if (n !== rate) { try { projCfg().set({ returnPct: n }); } catch { /* ignore */ } }
      draw();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
    const pick = rows.filter((r) => [1, 5, 10].includes(r.year));
    card.replaceChildren(head, sub,
      h('div', { class: 'k sv-title' }, '10-year projection (illustration)'),
      h('label', { class: 'sv-rate' }, h('span', { class: 'fl' }, 'Assumed annual return'), h('span', { class: 'sv-in' }, input, h('span', { class: 'pct' }, '%'))), err,
      h('p', { class: 'note sv-assume', id: 'sv-assume' }, 'An assumption you choose, not advice or a forecast. No market data is used.'),
      h('div', { class: 'chart-wrap' }, (() => {
        const svg = priv.chart(savingsChart({ rows, rate }));   // v46: amount labels masked; the aria-label quotes the 10-year totals, so it is swapped too
        priv.attr(svg, 'aria-label', svg.getAttribute('aria-label'), `Illustration only. Savings over ${rows.length} years, amounts hidden.`);
        return svg;
      })()),
      h('div', { class: 'legend' },
        h('span', null, h('span', { class: 'dash-key sv-k-saved' }), 'Saved only (no growth)'),
        h('span', null, h('span', { class: 'dot sv-k-inv' }), 'If invested at ' + pctText(rate) + ' a year')),
      h('table', { class: 'sv-table', id: 'savings-table' },
        h('thead', null, h('tr', null, h('th', null, 'Year'), h('th', null, 'Saved only'), h('th', null, 'If invested'))),
        h('tbody', null, pick.map((r) => h('tr', { 'data-year': String(r.year) }, h('td', null, String(r.year)), h('td', null, sec(priv, money(r.saved))), h('td', null, sec(priv, money(r.invested))))))),
      h('p', { class: 'note' }, 'Saves the same surplus at the end of every month. "If invested" compounds monthly at ' + pctText(rate) + ' ÷ 12 per month. Taxes, fees and inflation are left out.'));
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
  // v46: ONE privacy state for the whole tab. Hidden on every draw (no stored state, no count-up on any personal number so nothing can flash).
  const priv = financePrivacy();
  root.append(
    h('div', { class: 'topbar' }, h('a', { class: 'back', href: '#/' }, icon('chevL'), 'Home'),
      h('a', { class: 'btn ghost small', href: '#/finances/edit', id: 'edit-btn' }, icon('edit'), 'Edit')),
    h('div', { class: 'fin-head' }, pageTitle('finances', 'Finances'),
      doc.updatedAt && !(doc.feed && doc.feed.refreshedAt) ? h('div', { class: 'asof' }, 'Last updated ' + new Date(doc.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })) : null));

  root.append(priv.toggleBar('networth'));   // v46: the sticky Show / Hide bar, at the top, above the Refresh bar
  root.append(refreshBar(doc, ctx.rerender, priv));

  if (doc.example) {
    root.append(h('div', { class: 'banner example', id: 'example-banner' },
      h('b', null, 'Fake example data. '), 'These numbers are made up to show how AI-TOR looks.',
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn ghost small', id: 'clear-example', onclick: () => ctx.clearExample() }, 'Clear example & start fresh'),
        h('button', { class: 'btn ghost small', id: 'keep-example', onclick: () => ctx.keepExample() }, 'Keep & edit as mine'))));
  }

  // 1. net worth
  const top = c.groups[0];
  // v44: privacy blur of the headline (v46: the one Show / Hide button is now the sticky bar at the top). A tap on the blurred number reveals all.
  root.append(h('div', { class: 'card', id: 'networth' },
    h('div', { class: 'k' }, 'Net worth'),
    h('div', { class: 'nw-line' },
      priv.secret(money(c.netWorth), MASK.big, { tag: 'div', cls: 'v nw-val ' + (c.netWorth < 0 ? 'neg' : ''), main: true, id: 'nw-value' })),
    h('div', { class: 'sub' }, priv.secret('Assets ' + money(c.assets) + ' − Debts ' + money(c.debts), 'Assets $8,888,888 − Debts $888')),   // assets − debts = net worth
    h('div', null,
      !doc.debts.length ? h('span', { class: 'chip warn' }, 'No debts added') : null,
      !c.hasCash ? h('span', { class: 'chip warn' }, 'No bank/cash accounts added') : null),
    top ? h('div', null,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('div', { class: 'l' }, 'Largest group: ' + top.name), h('div', { class: 'r' }, pct(top.share) + ' of assets')),
      h('div', { class: 'bar' }, h('i', { style: `width:${(top.share * 100).toFixed(1)}%;background:${top.color}` }))) : null));

  // 2. income & expenses
  const hasInc = doc.monthlyIncome != null, hasExp = c.expenses != null;
  root.append(h('h2', { class: 'sec' }, 'Monthly income & expenses'));
  if (hasInc || hasExp) {
    root.append(h('div', { class: 'grid2', id: 'income' },
      hasInc ? h('div', { class: 'card' }, h('div', { class: 'k' }, 'Income / month'), h('div', { class: 'v sm' }, sec(priv, money(doc.monthlyIncome)))) : na('na-income', 'Monthly income', 'Add it to see your monthly surplus.'),
      hasExp ? expensesCard(doc, c, ctx, priv) : na('na-expenses', 'Monthly expenses', 'Add it to see your monthly surplus.'),   // v40.1: tap to type your own estimate
      c.surplus != null ? h('div', { class: 'card span2' }, h('div', { class: 'k' }, 'Income − expenses'),
        h('div', { class: 'v sm ' + (c.surplus >= 0 ? 'pos' : 'neg') }, sec(priv, money(c.surplus))), h('div', { class: 'sub' }, 'per month, derived from your numbers')) : null));
  } else {
    root.append(h('div', { class: 'grid2' }, na('na-income', 'Monthly income', 'Optional.'), na('na-expenses', 'Monthly expenses', 'Optional.')));
  }
  if (doc.feed && doc.feed.incomeBreakdown && doc.feed.incomeBreakdown.people.length) root.append(breakdownCard(doc.feed.incomeBreakdown, priv));   // v40.1
  if (c.surplus != null) { root.append(h('h2', { class: 'sec', id: 'savings-h' }, 'Savings')); root.append(savingsCard(doc, c, priv)); }             // v40.1

  // 3. asset groups
  root.append(h('h2', { class: 'sec' }, 'Asset groups'));
  if (c.groups.length) {
    root.append(h('div', { class: 'card', id: 'mix' },
      h('div', { class: 'k' }, 'Where your assets are'),
      h('div', { class: 'stack', role: 'img', 'aria-label': 'Asset mix' }, c.groups.map((g) => h('i', { style: `width:${(g.share * 100).toFixed(2)}%;background:${g.color}`, title: g.name }))),
      h('div', { class: 'legend' }, c.groups.map((g) => h('span', null, h('span', { class: 'dot', style: `background:${g.color}` }), g.name + ' ' + pct(g.share))))));
    c.groups.forEach((g) => root.append(groupCard(g, priv)));
  } else {
    root.append(na('na-accounts', 'Accounts', 'No accounts yet.', '#/finances/edit', 'Add an account'));
  }

  // 4. projection (illustration)
  const cands = projectableGoals(doc, c);
  if (cands.length) { root.append(h('h2', { class: 'sec' }, 'Projection (illustration)')); root.append(projectionCard(doc, c, cands, priv)); }

  // 5. alerts & goals
  const al = alerts(doc, c, pct, (n) => '\u0001' + money(n) + '\u0002');   // v46: amounts inside an alert sentence are wrapped in a secret (the rest of the sentence stays)
  if (al.length) {
    root.append(h('h2', { class: 'sec' }, 'Alerts'));
    root.append(h('div', { class: 'card', id: 'alerts' }, h('ul', { class: 'clean alerts' }, al.map((t) => h('li', null, t.split(/\u0001(.*?)\u0002/).map((part, i) => (i % 2 ? sec(priv, part) : part)))))));
  }
  if (doc.goals.length) {
    root.append(h('h2', { class: 'sec' }, 'Goals'));
    root.append(h('div', { class: 'card', id: 'goals' }, h('ul', { class: 'clean goals' }, doc.goals.map((g) => {
      const p = Math.max(0, Math.min(1, c.netWorth / g.target));
      // v46: target, and the progress (net worth / target, which with a known target gives the net worth away) are hidden; bar = fixed placeholder width + blur
      return h('li', null, h('b', null, g.name), h('div', { class: 'sub' }, 'Target ', sec(priv, money(g.target)), (g.date ? ' by ' + fmtDate(g.date) : '') + ' · net worth is ', priv.secret(pct(p, 0), MASK.pct), ' of target'),
        h('div', { class: 'bar' }, priv.bar(h('i', { style: 'background:var(--mars)' }), `${(p * 100).toFixed(1)}%`)));
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
    root.append(h('details', { class: 'src-all', id: 'notes' }, h('summary', null, 'Tap to expand your notes'), h('div', { class: 'gbody' }, priv.secret(doc.notes, MASK.text, { tag: 'p', cls: 'notes-text' }))));   // your own notes may quote amounts: hidden too
  }
  // 8. key holdings (from the feed only)
  if (doc.feed && Array.isArray(doc.feed.prices) && doc.feed.prices.length) {
    root.append(h('h2', { class: 'sec', id: 'holdings-h' }, 'Key holdings'));
    root.append(holdingsCard(doc.feed));
  }
  root.append(h('p', { class: 'note center' }, icon('lock'), 'Stored only on this device. Export a backup any time in Settings.'));
  // v46: no count-up any more: every number that used to count up is personal, and a count-up would put digits in the page while hidden
}
