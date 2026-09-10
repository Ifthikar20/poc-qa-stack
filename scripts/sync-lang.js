/**
 * Take a fresh copy of the case language from a backend checkout.
 *
 *   npm run sync:lang                       ../backend/vocabulary.js
 *   GC_BACKEND=../ghostclick npm run sync:lang
 *
 * The backend has the same command and, while both halves were one repository,
 * it wrote this file: `scripts/copies.js` there listed
 * `web/src/lang/vocabulary.js` among its copies. It cannot any more — writing
 * into a sibling repository from a build script is precisely the coupling the
 * split was for — so the copy is pulled from this side instead of pushed from
 * that one, which also means the person who has to look at the diff is the one
 * whose app renders it.
 *
 * Editing src/lang/vocabulary.js directly is what check-lang.js exists to
 * refuse. Change it in the backend, land it there, then run this.
 */
import { copyFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { COPY, LOCK, ORIGIN, backendDir, digest, here, normalize, readOr } from './lang.js';

const origin = join(backendDir(), ORIGIN);
const upstream = readOr(origin);

if (upstream === null) {
  console.log(`\n  No backend checkout at ${origin}.\n`);
  console.log('  This copy can only be refreshed from the repository that owns the');
  console.log('  original. Clone the backend beside this one, or point GC_BACKEND at it:\n');
  console.log('      GC_BACKEND=/path/to/ghostclick npm run sync:lang\n');
  process.exit(1);
}

const current = readOr(here(COPY));
if (current !== null && normalize(current) === normalize(upstream)) {
  console.log(`\n  already current — ${COPY} matches ${origin}\n`);
  process.exit(0);
}

copyFileSync(origin, here(COPY));

// The lock records what was taken and when, so a reviewer reading the diff can
// see that the file moved on purpose rather than under someone's editor.
const lock = {
  ...JSON.parse(readOr(here(LOCK)) ?? '{}'),
  source: { repo: 'ghostclick (the backend)', path: ORIGIN },
  sha256: digest(upstream),
  syncedAt: new Date().toISOString().slice(0, 10),
};
writeFileSync(here(LOCK), `${JSON.stringify(lock, null, 2)}\n`);

console.log(`\n  copied   ${COPY}  <-  ${relative(process.cwd(), origin)}`);
console.log(`  stamped  ${LOCK}  ${lock.sha256.slice(0, 12)}…\n`);
console.log('  Commit both, and run `npm test` — a verb the console has never');
console.log('  been shown is a failing test, not a silent rendering gap.\n');
