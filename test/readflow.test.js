/**
 * readflow.js — how the Recording box reads a case.
 *
 *   npm test
 *
 * The fixture is a real recording against treasury.sh, evidence comments and
 * all, because that is the text this exists to make readable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFlow } from '../src/readflow.js';

const RECORDING = `%% suite "Recorded flow"
testcase TD
  n0(("https://treasury.sh/"))
  n1["/tools"]
  n2["/tools/paycheck-calculator"]

  n0 -->|click 'Tools' : link| n1
  n1 -->|scroll to 'Paycheck Calculator' : text; click 'Biweekly paycheck Example Gross pay $3,846.15 Taxes & deductions −$1,004.98 Take-home pay After federal, state, and FICA $2,841.17 Free calculator Paycheck Calculator Calculate your take-home pay after federal and state taxes, Social Security, and Medicare deductions. Calculate your paycheck' : main/link| n2
  n2 --> n2
    check at top
    scroll to 'Salary Hourly' : text
    scroll to 'Take-Home' : button
    scroll to 'Salary Hourly' : text
    click 'Pre-tax Deductions 401(k), HSA, Health Insurance' : button
    scroll to 'California' : button
    fill 'HSA' : label = '40'

%% entry ["link:Treasury home","link:Features","link:Pricing","link:Learn","link:Changelog","link:Tools","link:Log in","link:Get Started","link:Ask Treasury","tab:Transactions Catches what your bank alerts miss","tab:Rewards A card-rewards optimizer, built in","tab:Debt & credit Your payoff plan and score, no extra app","tab:Housing The rent-vs-buy math, done for you","tab:Investing Portfolio and equity-comp decisions","tab:Retirement Whether you’re actually on track","tab:Taxes Lower your bill, legally","tab:Big decisions Talk through the life-changing ones","button:Thought for 6s 3 steps","link:See how we tested","link:4.7 on the App Store — view Treasury","link:Get started","tab:Yearly Save $61","tab:Monthly","button:Can Treasury move my money?","button:Which accounts and institutions can I connect?","button:What happens after the free trial?","button:Why not use a budgeting app or generic AI?","link:View all FAQs →","link:Start my free trial","link:Download Treasury on the App Store","link:Compare","link:Benchmarks","link:Documentation","link:Newsroom","link:About","link:Contact","link:Privacy","link:Terms","link:LinkedIn","link:Instagram","link:TikTok","link:X"]
%% at 1 753,39 33x36 in 1180x760
%% at 3 590,412 976x244 in 1180x760
%% at 4 795,474 976x244 in 1180x760
%% at 7 170,340 166x36 in 1180x760
%% at 8 814,134 325x24 in 1180x760
%% at 9 170,240 166x36 in 1180x760
%% at 10 321,608 408x36 in 1180x760
%% at 11 308,212 442x44 in 1180x760
%% at 12 308,381 125x44 in 1180x760`;

test('a recording reads as its steps, in the order the runner numbers them', () => {
  const r = readFlow(RECORDING);
  assert.equal(r.suite, 'Recorded flow');
  assert.deepEqual(r.groups.map((g) => g.place), ['https://treasury.sh/', '/tools', '/tools/paycheck-calculator']);
  assert.deepEqual(r.steps.map((s) => s.verb),
    ['open', 'click', 'url', 'scroll', 'click', 'url', 'check', 'scroll', 'scroll', 'scroll', 'click', 'scroll', 'fill']);
  assert.deepEqual(r.counts, { steps: 13, pages: 3, checks: 3, actions: 9, warnings: 1 });
});

test('a recorded position lands on the step it was recorded for', () => {
  const r = readFlow(RECORDING);
  assert.deepEqual(r.steps[3].at, { x: 590, y: 412 });    // scroll to Paycheck Calculator
  assert.deepEqual(r.steps[12].at, { x: 308, y: 381 });   // fill HSA
  assert.equal(r.steps[6].at, null);                      // check at top: nothing to point at
});

test('a step comes apart into what a person checks', () => {
  const r = readFlow(RECORDING);
  const fill = r.steps[12];
  assert.deepEqual([fill.name, fill.role, fill.value], ['HSA', 'label', '40']);
  const card = r.steps[4];
  assert.deepEqual([card.scope, card.role], ['main', 'link']);
  assert.match(card.warn, /long name/);
});

test('evidence is counted and folded, and no character of the source is lost', () => {
  const r = readFlow(RECORDING);
  assert.deepEqual(r.evidence, { lines: 10, entryTargets: 42, positions: 9, vias: 0 });
  assert.equal(r.lines.map((l) => l.tokens.map((t) => t.t).join('')).join('\n'), RECORDING);
});

test('what needs a second look is said, and an unreadable step is kept in its place', () => {
  const r = readFlow(`testcase TD
  a(("https://example.test/login"))
  b["/home"]
  a -->|fill 'Password' : label = $TODO; click 'Sign in' : nth2/button| b
  b --> b
    teleport 'Somewhere' : link`);
  assert.deepEqual(r.steps.map((s) => s.kind), ['open', 'fill', 'act', 'check', 'unreadable']);
  assert.match(r.steps[1].warn, /\$TODO/);
  assert.match(r.steps[2].warn, /position/);
  assert.equal(r.counts.warnings, 3);
});

test('a script written one instruction per line reads too', () => {
  const r = readFlow("goto https://example.test/\nclick 'Pricing' : navigation/link\nsee 'Plans'");
  assert.deepEqual(r.steps.map((s) => s.verb), ['open', 'click', 'see']);
  assert.equal(r.groups[0].place, 'https://example.test/');
  assert.equal(r.steps[1].scope, 'navigation');
});
