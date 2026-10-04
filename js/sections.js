// Section registry. To add a new life section (e.g. Travel):
//   1. create sections/<id>/index.js exporting `render(container, ctx)` plus, for data portability,
//      `validate(doc) -> {ok, errors, doc}` and `summary(doc, formatMoney)`.
//   2. add one entry below (icon = path to a square PNG in icons/sections/, shown at 56x56 on Home) (and its files to the precache list in sw.js; bump VERSION).
// Storage is namespaced per section id automatically: ctx.store reads/writes "aitor:sec:<id>" only.
export const sections = [
  {
    id: 'finances',
    title: 'Finances',
    subtitle: 'Net worth, accounts, debts & goals',
    icon: 'icons/sections/finances-256.png',
    route: '#/finances',
    loader: () => import('../sections/finances/index.js'),
  },
  {
    id: 'travels',
    title: 'Travels',
    subtitle: 'Countries you have visited',
    icon: 'icons/sections/travels-256.png',
    route: '#/travels',
    loader: () => import('../sections/travels/index.js'),
  },
  {
    id: 'todo',
    title: 'To-Do',
    subtitle: 'Your daily task list',
    icon: 'icons/sections/todo-256.png',
    route: '#/todo',
    loader: () => import('../sections/todo/index.js'),
  },
];
