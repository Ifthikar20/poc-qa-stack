/**
 * flowcolors.js, and the colouring readflow.js does — what a case is drawn in.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkFor, readFlow } from '../src/readflow.js';
import { paintHtml, PAINT, TONE } from '../src/flowcolors.js';

const CASE = `%% suite "Paycheck"
testcase TD
  n0(("https://treasury.sh/"))
  n1["/tools"]
  n2{{"Take-home pay"}}

  n0 -->|click 'Tools' : link; hover 'Menu' : navigation/button| n1
  n1 --> n1
    wait 500ms
    scroll to 'Salary' : text
    fill 'Email' : textbox = 'a<b>&"c"'
    fill 'Password' : label = $QA_PASS
    check at top
  n1 -->|click 'Calculate' : button| n2
`;

test('every verb is drawn in a colour of its own', () => {
  const r = readFlow(CASE);
  assert.deepEqual(r.steps.map((s) => s.tone),
    ['open', 'click', 'hover', 'check', 'wait', 'scroll', 'fill', 'fill', 'check', 'click', 'see']);
  const loose = readFlow("goto https://example.test/\nteleport 'Somewhere' : link");
  assert.deepEqual(loose.steps.map((s) => s.tone), ['open', 'todo']);
  // No two tones share a class, or the key would promise a difference that is not there.
  assert.equal(new Set(Object.values(TONE)).size, Object.keys(TONE).length);
});

test('an address is a link, a path resolves against where the case starts, and nothing else is one', () => {
  const r = readFlow(CASE);
  assert.equal(r.base, 'https://treasury.sh/');
  assert.deepEqual(r.groups.map((g) => g.href), ['https://treasury.sh/', 'https://treasury.sh/tools', null]);
  assert.equal(r.steps[3].href, 'https://treasury.sh/tools');     // url contains /tools
  assert.equal(r.steps[1].href, null);                            // a link on the page is an element, not an address

  const linky = (i) => r.lines[i].tokens.filter((t) => t.c.startsWith('link')).map((t) => `${t.c} ${t.t}`);
  assert.deepEqual(linky(2), ['link https://treasury.sh/']);
  assert.deepEqual(linky(3), ['link /tools']);
  assert.deepEqual(linky(6), ["link-name 'Tools'", 'link-role : link']);   // the button beside it is not blue

  assert.equal(linkFor('javascript:alert(1)', r.base), null);
  assert.equal(linkFor('data:text/html,<b>hi</b>', r.base), null);
  assert.equal(linkFor('/tools', null), null);                    // a path with nothing to be relative to
  assert.equal(linkFor("'https://a.test/x'"), 'https://a.test/x');
});

test('the editor underlay is escaped, loses no character, and never changes a glyph\'s weight', () => {
  const html = paintHtml(readFlow(CASE).lines);
  assert.ok(!html.includes('<b>'), 'text from the case is never markup');
  assert.ok(html.includes('a&lt;b&gt;&amp;&quot;c&quot;'));

  const text = html.replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  // The trailing space stands in for the empty line a textarea shows after a final newline.
  assert.equal(text, `${CASE} `);

  const classes = new Set(Object.values(PAINT));
  for (const [, cls] of html.matchAll(/class="([^"]*)"/g)) assert.ok(classes.has(cls), cls);
  for (const cls of classes) assert.doesNotMatch(cls, /\bfont-|italic/, `${cls} would move the caret off its glyph`);
});

test('a line of only spaces keeps its spaces', () => {
  const src = "goto https://example.test/\n   \nsee 'Plans'";
  assert.equal(readFlow(src).lines.map((l) => l.tokens.map((t) => t.t).join('')).join('\n'), src);
});
