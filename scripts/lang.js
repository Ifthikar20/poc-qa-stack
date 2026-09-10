/**
 * Where the vendored case language lives, and how it is fingerprinted.
 *
 * `src/lang/vocabulary.js` is not this project's file. It is a verbatim copy of
 * the backend's, because three programs parse the same grammar — the backend
 * executes cases, this app renders them, and the browser extension writes them
 * with no server in the picture — and the alternative to copying is three
 * implementations that agree until they don't.
 *
 * While both halves were one repository, `npm run check:shared` read the
 * original and the copy off the same disk and demanded they be byte-identical.
 * That check cannot exist here: the original is in another repository, and
 * nothing in this one can see it. So the guarantee is split in two, and the
 * split is the honest part — see check-lang.js for what each half does and
 * what neither half can promise.
 *
 * The digest normalises CRLF to LF before hashing, which is not fussiness:
 * git checks this file out with native line endings, so the same commit is
 * CRLF on Windows and LF everywhere else. A fingerprint that changed with the
 * checkout would fail on half the machines and mean nothing on the other half.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A path relative to the repository root, as an absolute one. */
export const here = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/** The copy this project builds against. */
export const COPY = 'src/lang/vocabulary.js';

/** The fingerprint of the copy, committed beside it. */
export const LOCK = 'src/lang/vocabulary.lock.json';

/**
 * The file's path in the backend repository, and where to look for a checkout
 * of it. GC_BACKEND is how you point at one that is not the sibling directory;
 * neither script requires it to be there.
 */
export const ORIGIN = 'vocabulary.js';
export const backendDir = () => process.env.GC_BACKEND || here('../poc-qa-stack-backend');

/** Line-ending-independent content, which is what "identical" has to mean. */
export const normalize = (text) => text.replace(/\r\n/g, '\n');

export const digest = (text) =>
  createHash('sha256').update(normalize(text), 'utf8').digest('hex');

export const readOr = (path) => {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
};
