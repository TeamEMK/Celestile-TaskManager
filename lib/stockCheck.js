/**
 * Drawing Request lines vs what we actually have (Vivek sir, 13-11-2026):
 * a request asked for Vietnam White in 22 MM, which we only carry in 18 MM,
 * and it was caught only when he cancelled it by hand. "Stock list se link
 * karna hai."
 *
 * A line is flagged when its stone is known — in the IMS slab register or
 * the "Stone Name" master — and the thickness asked for is not among that
 * stone's available slabs (or, with none available, its master thicknesses).
 * A stone the lists don't know is not flagged: names are hand-typed on both
 * sides, and a guess would only add noise. Pure functions — no I/O.
 */

const norm = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
// "18MM", "18 mm", "18" → [18]; "16-18 MM" → [16, 18].
const nums = (s) => (String(s ?? '').match(/\d+(\.\d+)?/g) || []).map(Number);

function sameStone(want, have) {
  const a = norm(want), b = norm(have);
  if (!a || !b) return false;
  if (a === b) return true;
  // "VIETNAM WHITE MARBLE" vs "VIETNAM WHITE": one name inside the other,
  // and long enough not to be a stray word ("WHITE").
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && long.includes(short);
}

// Does a thickness asked for ("16-18 MM", "20MM") fit one we have ("18MM")?
function fits(wanted, have) {
  const w = nums(wanted), h = nums(have)[0];
  if (!w.length || h === undefined) return false;
  if (w.length >= 2) return h >= Math.min(w[0], w[1]) && h <= Math.max(w[0], w[1]);
  return Math.abs(w[0] - h) < 0.01;
}

const label = (t) => { const n = nums(t)[0]; return n === undefined ? String(t) : `${n}MM`; };

/**
 * pieces    — parseDrawingRequest().pieces ({ area, stoneType, thickness, … })
 * slabs     — IMS register rows ({ material, thickness, status })
 * materials — "Stone Name" master rows ({ material, thickness })
 * → [{ stone, thickness, areas, inStock: ['18MM (12 slabs)'], known: ['18MM'] }]
 */
export function checkPiecesAgainstStock(pieces = [], slabs = [], materials = []) {
  const out = new Map();
  for (const p of pieces) {
    const stone = String(p.stoneType || '').trim();
    const thick = String(p.thickness || '').trim();
    if (!stone || !nums(thick).length) continue;

    const mySlabs = slabs.filter((s) => sameStone(stone, s.material));
    const myMaster = materials.filter((m) => sameStone(stone, m.material));
    if (!mySlabs.length && !myMaster.length) continue; // stone unknown — no guess

    const available = mySlabs.filter((s) => (s.status || 'Available') === 'Available');
    const pool = available.length ? available.map((s) => s.thickness) : myMaster.map((m) => m.thickness);
    if (pool.some((t) => fits(thick, t))) continue;

    // Keyed by the stock name it matched, so "Vietnam White" and "VIETNAM
    // WHITE MARBLE" on two lines are one warning, not two.
    const matched = (mySlabs[0] || myMaster[0]).material;
    const key = `${norm(matched)}|${nums(thick).join('-')}`;
    if (!out.has(key)) {
      const count = {};
      for (const s of available) { const l = label(s.thickness); count[l] = (count[l] || 0) + 1; }
      out.set(key, {
        stone, thickness: thick, areas: [],
        inStock: Object.entries(count).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([t, n]) => `${t} (${n} slab${n > 1 ? 's' : ''})`),
        known: [...new Set(myMaster.map((m) => label(m.thickness)).filter((t) => /\d/.test(t)))],
      });
    }
    const w = out.get(key);
    if (p.area && !w.areas.includes(p.area)) w.areas.push(p.area);
  }
  return [...out.values()];
}

// One line for the form: "VIETNAM WHITE 22 MM — not in stock. In stock: 18MM (12 slabs)".
export function stockWarningText(w) {
  const have = w.inStock.length ? `In stock: ${w.inStock.join(', ')}`
    : w.known.length ? `None available now; this stone comes in ${w.known.join(', ')}`
    : 'None available now';
  return `${w.stone} ${w.thickness} — not in stock. ${have}.`;
}
