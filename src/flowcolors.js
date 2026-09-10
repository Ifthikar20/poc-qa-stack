/**
 * The case language's colours, as classes — one table for the three places a
 * case is drawn: FlowRead's steps, its source, and the editor under the caret.
 *
 * One hue per verb (readflow's `tone`), so what a step does reads before its
 * words do; blue for an address and nothing else. The hues themselves are
 * tokens in app.css, with the contrast they were picked for.
 *
 * The editor gets colour and nothing more. It is a coloured copy of the text
 * laid under a transparent textarea, and the two only line up while every
 * glyph is the same width in both — a bold verb is a hair wider in some
 * monospace fonts, and a caret a hair off by the end of a long line is worse
 * than no colour at all. Reading has no caret, so there the verb is bold.
 */

/** A verb's colour, by readflow's tone. */
export const TONE = {
  open: 'text-code-open', click: 'text-code-click', hover: 'text-code-hover',
  fill: 'text-code-fill', scroll: 'text-code-scroll', wait: 'text-code-wait',
  check: 'text-code-check', see: 'text-code-see', todo: 'text-code-todo',
};

/** A source token's colour, for the editor: hue only. */
export const PAINT = {
  plain: 'text-ink-2', punct: 'text-ink-3', comment: 'text-ink-3', evidence: 'text-ink-3',
  keyword: 'text-ink', node: 'text-code-role', place: 'text-ink', name: 'text-ink',
  role: 'text-code-role', value: 'text-code-value', vault: 'text-code-vault', todo: 'text-code-todo',
  link: 'text-code-link underline decoration-code-link/40 underline-offset-2',
  'link-name': 'text-code-link', 'link-role': 'text-code-link',
  bad: 'text-code-todo underline decoration-wavy decoration-code-todo/50',
  ...Object.fromEntries(Object.entries(TONE).flatMap(([tone, cls]) => [[tone, cls], [`${tone}-word`, cls]])),
};

/** The same for reading, where the verb and what needs a second look can carry weight. */
export const TOKEN = {
  ...PAINT,
  evidence: 'text-ink-3/75', keyword: 'font-semibold text-ink', place: 'font-medium text-ink',
  vault: 'font-medium text-code-vault', todo: 'font-semibold text-code-todo',
  link: 'text-code-link underline decoration-code-link/30 underline-offset-2 hover:decoration-code-link',
  ...Object.fromEntries(Object.entries(TONE).map(([tone, cls]) => [tone, `font-semibold ${cls}`])),
};

/** The key's order: where you go, what you do there, what you check — then the text in between. */
export const KEY = [
  ['open', 'open'], ['click', 'click'], ['hover', 'hover'], ['fill', 'fill'], ['scroll', 'scroll'],
  ['wait', 'wait'], ['check', 'check'], ['see', 'see'], ['link', 'link'], ['value', "'value'"], ['vault', '$vault'],
];

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (s) => s.replace(/[&<>"]/g, (ch) => ESCAPE[ch]);

/**
 * The source as HTML for the editor's underlay: one escaped span per token,
 * lines joined by the newlines they had.
 *
 * A string rather than components because it is rebuilt on every keystroke,
 * and a few hundred component spans per key is the lag that kept the editor
 * uncoloured until now. Safe as v-html because every character of the text is
 * escaped and every class comes from the table above.
 */
export function paintHtml(lines) {
  const html = lines.map((l) => l.tokens.map((tk) => {
    const cls = PAINT[tk.c];
    return cls ? `<span class="${cls}">${escape(tk.t)}</span>` : escape(tk.t);
  }).join('')).join('\n');
  // A textarea that ends in a newline shows the empty line after it; a <pre>
  // does not, and the colour would sit a line short of the text it copies.
  return lines.length > 1 && !lines.at(-1).tokens.length ? `${html} ` : html;
}
