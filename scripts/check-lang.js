/**
 * The copy of the case language has not been edited here, and still says what
 * this app renders.
 *
 *   npm run check:lang
 *
 * This replaces the backend's `check:shared`, which asserted that
 * `web/src/lang/vocabulary.js` was byte-identical to `vocabulary.js` beside it.
 * Both files were on one disk then. They are in two repositories now, so no
 * script that ships with this one can read the original, and pretending
 * otherwise — a check that silently passes when the file it compares against
 * is absent — would be worse than no check, because it would be believed.
 *
 * What was one assertion is therefore three, and only the first two run
 * everywhere:
 *
 *   1. THE COPY IS UNEDITED.  vocabulary.lock.json holds the sha256 of the
 *      copy as it was synced. Editing the copy here is the failure this
 *      catches, and it is the likely one: a verb that needs a tweak for the
 *      console is one keystroke away, and a fork that starts as one keystroke
 *      is a fork. `npm run sync:lang` is the only thing that may move it, and
 *      it restamps the lock, so the digest tracks intent rather than mtime.
 *
 *   2. THE COPY STILL FITS THE APP.  `npm test` renders every verb in the
 *      table through showAction and labelAction, and fails if the table has
 *      grown one the console has never been shown. That is the assertion with
 *      real teeth in the new shape: a copy that has fallen behind is only a
 *      problem because the app renders it wrong, and this is the thing that
 *      says so. It runs from the test suite, not from here, because it needs
 *      to import the module rather than hash it.
 *
 *   3. THE COPY MATCHES THE ORIGINAL — only when a backend checkout is at
 *      hand. Sibling `../backend`, or GC_BACKEND. This is the old check,
 *      restored exactly when it is possible, and reported as skipped, loudly,
 *      when it is not.
 *
 *      `--local` skips step 3, and is what `prebuild` runs. A sibling checkout
 *      is somebody's working copy: it can be on a feature branch, or halfway
 *      through an edit, and a UI build that fails for that reason is a build
 *      that gets worked around rather than fixed. So the build asserts only
 *      what this repository can be certain of, and `npm run check:lang` — run
 *      deliberately, by someone who wants the real answer — asserts the rest.
 *
 * What this cannot promise: that the backend has not moved on. Nothing inside
 * this repository can know that, and the day the language is published as
 * @ghostclick/language the lock becomes a version range and this becomes
 * `npm outdated`. Until then, step 3 run against a checkout is the answer, and
 * the release procedure in README.md is what makes someone run it.
 */
import { join } from 'node:path';
import { COPY, LOCK, ORIGIN, backendDir, digest, here, normalize, readOr } from './lang.js';

const ok = (label, detail = '') => console.log(`  ok    ${label.padEnd(44)} ${detail}`);
const fail = (m) => { console.log(`\n  FAIL  ${m}\n`); process.exit(1); };

console.log('\n— the vendored case language ——————————————————————————————');

const copy = readOr(here(COPY));
if (copy === null) fail(`${COPY} is missing — run \`npm run sync:lang\``);

const lockText = readOr(here(LOCK));
if (lockText === null) fail(`${LOCK} is missing — run \`npm run sync:lang\``);
const lock = JSON.parse(lockText);

// -------------------------------------------------------- 1. unedited here
const actual = digest(copy);
if (actual !== lock.sha256) {
  fail(`${COPY} has been edited here.\n`
    + `        expected sha256 ${lock.sha256}\n`
    + `        found           ${actual}\n\n`
    + '        This file is a copy of the backend\'s and is not edited in this\n'
    + '        repository. Change it there, then `npm run sync:lang` here.');
}
ok('the copy is unedited', `sha256 ${actual.slice(0, 12)}… · synced ${lock.syncedAt}`);

// ------------------------------------------------ 3. matches the original?
if (process.argv.includes('--local')) {
  console.log('  skip  comparing against a backend checkout        --local');
} else {
  const origin = join(backendDir(), ORIGIN);
  const upstream = readOr(origin);
  if (upstream === null) {
    console.log(`  skip  no backend checkout to compare against  ${origin}`);
    console.log('        (set GC_BACKEND, or clone the backend beside this one, to check for real)');
  } else if (normalize(upstream) !== normalize(copy)) {
    fail(`${COPY} has drifted from ${origin} — run \`npm run sync:lang\``);
  } else {
    ok('the copy matches the original', origin);
  }
}

console.log('');
