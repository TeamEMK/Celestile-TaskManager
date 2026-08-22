/**
 * Row ids that can't collide.
 *
 * The pattern this replaces was `'XX' + (SELECT COUNT(*) + 1)`. It breaks the
 * first time any row is deleted — the count drops below the highest id already
 * handed out, so the next insert re-uses a live id and MySQL rejects it
 * ("Duplicate entry 'DEL568' for key 'PRIMARY'"). Two requests landing in the
 * same moment collide the same way, since they both read the same count.
 *
 * Shape, for a 3-character prefix, is exactly 16 characters — the width of the
 * VARCHAR(16) primary keys in lib/db.js:
 *
 *   CHK   m9x4k2p1   7f   001
 *   ^     ^          ^    ^
 *   |     |          |    +-- sequence within that millisecond (base36, 3 chars)
 *   |     |          +------- worker tag, fixed per process (base36, 2 chars)
 *   |     +------------------ Date.now() in base36 (8 chars until ~2059)
 *   +------------------------ caller's prefix
 *
 * The sequence is a real counter, not randomness. An earlier version used two
 * random characters and a counter that wrapped at 1296, and a tight loop of
 * 50,000 ids produced three duplicates — enough calls landed in the same
 * millisecond to exhaust the counter, and the random half is birthday-bound
 * long before that. A monotonic counter that refuses to wrap inside a
 * millisecond makes uniqueness a guarantee within the process rather than a
 * probability. The worker tag covers the multi-process case (PM2 cluster
 * mode): two processes would have to draw the same tag AND emit in the same
 * millisecond AND be at the same sequence to clash.
 */
import crypto from 'crypto';

const SEQ_MAX = 36 ** 3; // 46656 ids per process per millisecond

// Fixed for the life of the process. crypto rather than Math.random so forked
// workers starting in the same instant don't seed identically.
const WORKER = (() => {
  try {
    return (crypto.randomBytes(2).readUInt16BE(0) % 1296).toString(36).padStart(2, '0');
  } catch {
    return Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
  }
})();

let _lastMs = 0;
let _seq = 0;

function tick() {
  let now = Date.now();
  if (now === _lastMs) {
    _seq += 1;
    if (_seq >= SEQ_MAX) {
      // 46656 ids inside one millisecond. Not reachable in this app, but
      // spinning to the next millisecond is what keeps the guarantee a
      // guarantee instead of a very good chance.
      while (Date.now() === now) { /* spin */ }
      now = Date.now();
      _seq = 0;
    }
  } else if (now < _lastMs) {
    // Clock stepped backwards (NTP correction). Keep counting forward from
    // the last millisecond we used rather than re-issuing ids we may already
    // have handed out.
    now = _lastMs;
    _seq += 1;
  } else {
    _seq = 0;
  }
  _lastMs = now;
  return now.toString(36) + WORKER + _seq.toString(36).padStart(3, '0');
}

export function newId(prefix = '') {
  return `${prefix}${tick()}`.toUpperCase();
}

/**
 * Next id in a legacy zero-padded sequence (U001, U002, …).
 *
 * Only for the `users` table, whose ids are referenced by hand in seeds,
 * migrations and the hardcoded-admin check, so they can't move to newId().
 * `ORDER BY id DESC LIMIT 1` was wrong here: ids sort as STRINGS, so once the
 * table passes U999 the next id 'U1000' sorts below 'U999' and the sequence
 * silently sticks, handing out a duplicate on every insert after that. Take
 * the max numerically across every row instead.
 */
export function nextSeqId(rows, prefix = 'U', width = 3) {
  let max = 0;
  for (const r of rows || []) {
    const digits = String(r?.id ?? '').replace(/\D/g, '');
    if (digits) max = Math.max(max, parseInt(digits, 10) || 0);
  }
  return prefix + String(max + 1).padStart(width, '0');
}
