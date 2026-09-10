/**
 * logview.js — the console's one live stream, and its filters.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clock, countLevels, filterLogs, foldLogs, levelOf, mergeLogs, whereFrom } from '../src/logview.js';

const page = [      // oldest first, as the store keeps the page's console
  { id: 1, at: 1000, level: 'log', text: 'app booted' },
  { id: 2, at: 1005, level: 'error', text: 'Failed to load resource: 404', url: 'https://x.test/api/me' },
  { id: 3, at: 1010, level: 'warn', text: 'deprecated API' },
  { id: 4, at: 1011, level: 'warn', text: 'deprecated API' },
  { id: 5, at: 1030, level: 'error', text: 'TypeError: x is undefined', source: 'exception' },
];
const runner = [    // newest first, as the rail keeps the runner's log
  { id: 'b', at: 1020, level: 'error', msg: 'step 2 failed: no element' },
  { id: 'a', at: 1002, level: 'info', msg: 'opened https://x.test/' },
];

test('both feeds come out as one stream, in the order they arrived', () => {
  const rows = mergeLogs(page, runner);
  assert.deepEqual(rows.map((r) => r.id), ['p1', 'ra', 'p2', 'p3', 'p4', 'rb', 'p5']);
  assert.deepEqual(rows.map((r) => r.source), ['page', 'runner', 'page', 'page', 'page', 'runner', 'exception']);
  assert.equal(rows[0].level, 'info');
  assert.equal(rows[0].said, 'log');       // bucketed as info, still labelled as what it was
  assert.equal(levelOf('verbose'), 'info');
});

test('filters by level, by source and by text — and no level picked means every level', () => {
  const rows = mergeLogs(page, runner);
  assert.equal(filterLogs(rows).length, 7);
  assert.deepEqual(filterLogs(rows, { levels: ['error'] }).map((r) => r.id), ['p2', 'rb', 'p5']);
  assert.deepEqual(filterLogs(rows, { levels: ['error', 'warn'], source: 'page' }).map((r) => r.id), ['p2', 'p3', 'p4', 'p5']);
  assert.deepEqual(filterLogs(rows, { source: 'runner' }).map((r) => r.id), ['ra', 'rb']);
  assert.deepEqual(filterLogs(rows, { query: '/API/ME' }).map((r) => r.id), ['p2']);   // the URL counts, in any case
  assert.deepEqual(filterLogs(rows, { since: 1010 }).map((r) => r.id), ['p4', 'rb', 'p5']);
  assert.deepEqual(countLevels(rows), { error: 3, warn: 2, info: 2, debug: 0 });
});

test('the same line again is one row with a count — but not the same words from somewhere else', () => {
  const folded = foldLogs(mergeLogs(page, runner));
  assert.equal(folded.length, 6);
  assert.equal(folded.find((r) => r.text === 'deprecated API').n, 2);
  const echo = foldLogs(mergeLogs([{ id: 1, at: 1, level: 'info', text: 'same' }], [{ id: 'x', at: 2, level: 'info', msg: 'same' }]));
  assert.equal(echo.length, 2);
});

test('a line says when and where it came from, the way DevTools does', () => {
  assert.equal(clock(new Date(2026, 8, 10, 14, 3, 7, 41).getTime()), '14:03:07.041');
  assert.equal(whereFrom('https://x.test/assets/app.js?v=3', 120), 'app.js:120');
  assert.equal(whereFrom('https://x.test/'), 'x.test');
  assert.equal(whereFrom(null), null);
});

test('lines from the same millisecond keep the order they arrived in', () => {
  const rows = mergeLogs(
    [{ id: 1, seq: 2, at: 5000, level: 'error', text: 'TypeError' }],
    [{ id: 'y', seq: 3, at: 5000, level: 'info', msg: 'after' }, { id: 'x', seq: 1, at: 5000, level: 'info', msg: 'before' }],
  );
  assert.deepEqual(rows.map((r) => r.text), ['before', 'TypeError', 'after']);
});
