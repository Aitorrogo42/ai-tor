// Section registry. To add a new life section (e.g. Travel):
//   1. create sections/<id>/index.js exporting `render(container, ctx)` plus, for data portability,
//      `validate(doc) -> {ok, errors, doc}` and `summary(doc, formatMoney)`.
//   2. add one entry below (v18: its glyph is an inline SVG in js/icons.js SECTION_GLYPHS, shown by the wheel and the page header; bump sw.js VERSION).
// Storage is namespaced per section id automatically: ctx.store reads/writes "aitor:sec:<id>" only.
export const sections = [
  {
    id: 'finances',
    title: 'Finances',
    subtitle: 'Net worth & accounts',
    route: '#/finances',
    loader: () => import('../sections/finances/index.js'),
  },
  {
    id: 'travels',
    title: 'Travels',
    subtitle: 'Countries you have visited',
    route: '#/travels',
    loader: () => import('../sections/travels/index.js'),
  },
  {
    id: 'todo',
    title: 'To-Do',
    subtitle: 'Your daily task list',
    route: '#/todo',
    loader: () => import('../sections/todo/index.js'),
  },
];
