/**
 * Every verb the case language has, rendered the way the console renders it.
 *
 *   npm test
 *
 * This is the half of the old `check:shared` that survived the split with its
 * teeth. The digest in check-lang.js proves the copy has not been edited here;
 * it cannot prove the copy is still the right one, because the original is in
 * another repository. But "the copy is stale" only ever hurts by way of "the
 * app renders a case wrongly", and that is a thing this repository can test on
 * its own.
 *
 * So: one fixture per row of the VERBS table, and a test that fails when the
 * table has a row no fixture covers. Sync a vocabulary with a new verb in it
 * and this goes red until someone has looked at what the console does with it —
 * which is the review the copy used to get for free from living next door to
 * the code that executes it.
 *
 * ConsoleView.vue imports exactly `showAction` and `labelAction`, so those are
 * what is exercised. `showAction` returning null is not a gap: two rows are
 * nodes in the diagram rather than edge actions, and say so by returning null.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERBS, labelAction, parseAction, showAction, verbFor } from '../src/lang/vocabulary.js';

/** ConsoleView passes a truncator because only the caller knows its budget. */
const trunc = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));

const key = (op, assert_) => (assert_ ? `${op}:${assert_}` : op);

/**
 * One example per verb. A `clause` is written the way a suite author writes it
 * and must survive parse → show → parse; a `step` is a row that has no written
 * form, and is checked for its label alone.
 */
const FIXTURES = [
  { clause: "click 'Sign in' : button" },
  { clause: "hover 'Account' : nav" },
  { clause: "fill 'Email' : label = 'qa@example.com'" },
  { clause: 'wait 250ms' },
  { clause: 'scroll to bottom' },
  { clause: "scroll to 'Pricing' : text" },
  {
    clause: "check 'Username' : label is 'hunter2'",
    // The one row that does not round-trip, and must not: it writes the value
    // back as a LENGTH, because the value may have come from the vault and a
    // script is a thing people paste into tickets. So the assertion for this
    // fixture is the opposite one — the written form must NOT contain 'hunter2'.
    redacts: 'hunter2',
  },
  { clause: 'check at top' },
  { clause: 'check status 200' },
  { clause: 'check 2 redirects' },
  { clause: 'check redirect via /login' },
  { clause: 'see Welcome back' },
  { step: { op: 'expect', assert: 'urlContains', value: '/dashboard' } },
  { step: { op: 'goto', url: 'https://example.test/app' } },
];

/** The step each fixture describes, however it describes it. */
const stepOf = (f) => f.step ?? parseAction(f.clause);

test('every fixture names a verb the table actually has', () => {
  for (const f of FIXTURES) {
    const step = stepOf(f);
    assert.ok(verbFor(step), `no verb for ${key(step.op, step.assert)} (${f.clause ?? 'constructed'})`);
  }
});

test('every verb in the table has a fixture', () => {
  const covered = new Set(FIXTURES.map((f) => {
    const s = stepOf(f);
    return key(s.op, s.assert);
  }));
  const missing = VERBS
    .map((v) => key(v.op, v.assert))
    .filter((k) => !covered.has(k));

  assert.deepEqual(missing, [],
    'The vocabulary has verbs this app has never been shown rendering.\n'
    + 'That is usually a fresh `npm run sync:lang`: add a fixture above, look at\n'
    + 'what ConsoleView does with the new verb, and only then commit the sync.');
});

test('a written clause survives parse -> show -> parse', () => {
  for (const f of FIXTURES.filter((x) => x.clause && !x.redacts)) {
    const step = parseAction(f.clause);
    const written = showAction(step);
    assert.ok(written, `${f.clause} has a syntax but no way to write itself back`);
    // Not string equality with the input: the language is allowed to normalise
    // quoting and spacing, and does — `see Welcome back` comes back quoted.
    // Reparsing is what has to be stable, because that is what a suite that
    // was saved and reopened does.
    assert.deepEqual(parseAction(written), step,
      `"${f.clause}" was written back as "${written}", which parses differently`);
  }
});

test('a value that could be a secret is never written back into a script', () => {
  for (const f of FIXTURES.filter((x) => x.redacts)) {
    const written = showAction(parseAction(f.clause));
    assert.ok(written, `${f.clause} has no way to write itself back`);
    assert.ok(!written.includes(f.redacts),
      `"${f.clause}" was written back as "${written}", which still holds the value`);
  }
});

test('every verb draws a non-empty label', () => {
  for (const f of FIXTURES) {
    const step = stepOf(f);
    const label = labelAction(step, trunc);
    assert.equal(typeof label, 'string');
    assert.ok(label.trim().length > 0, `${key(step.op, step.assert)} drew an empty label`);
  }
});

test('a step the table does not know is a stop, not a silent drop', () => {
  // The whole reason the vocabulary is a table: a step nobody taught to write
  // itself used to be dropped from the script rather than reported.
  assert.throws(() => showAction({ op: 'teleport' }), /No way to write/);
});
