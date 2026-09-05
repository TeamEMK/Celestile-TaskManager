/**
 * Reading the factory's own Excel day-report back into the app.
 *
 * The floor doesn't fill the app's form — the office already produces this
 * workbook every day, one block per department stacked down the sheet:
 *
 *     CNC DEPARTMENT 16/08/2026 (DAY SHIFT)      <- title row
 *     S NO | MACHINE OPERATOR | HELPER | ...     <- header row
 *     1    | SUVA JIT         | GOVIND | ...     <- rows, until a blank gap
 *     NOTE : RAMOD ROUT (MACHINE CLEANERS)       <- optional note row
 *
 * Nothing about that layout is guaranteed, so this parser looks for the
 * shapes rather than fixed addresses: any row that opens a table ("S NO" plus
 * a couple of headers) starts a block, the nearest text above it is the
 * title, and columns are matched by what the header says. Whatever it can't
 * place is reported instead of dropped, so the import screen can show it and
 * let someone map it by hand.
 *
 * Parsing only — nothing here writes. The import screen saves each block
 * through the same POST /api/production/day the manual form uses.
 */
import * as XLSX from 'xlsx';
import { FIELDS, FIELD_KEYS } from '@/lib/production';
import { suspectOrderNumbers } from '@/lib/orderNumber';

/* ── header → field matching ──────────────────────────────────────── */

const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// What the real reports call each column. The catalogue label is matched too
// (lib/production.js FIELDS), so a department that renames a column keeps
// importing without anything being added here.
const HEADER_SYNONYMS = {
  worker:         ['name', 'machineoperator', 'operator', 'worker', 'workername', 'employee', 'staff'],
  helper:         ['helper', 'helpername', 'assistant'],
  order_number:   ['ordernumber', 'orderno', 'order', 'ordernumbers'],
  hours:          ['workinghours', 'hours', 'workinghour', 'hrs', 'workhours'],
  area:           ['area', 'areaname', 'areas'],
  material:       ['usedmaterial', 'material', 'materialused', 'usedmaterials'],
  material_qty:   ['usedmaterialquantity', 'materialquantity', 'quantity', 'qty', 'usedmaterialqty'],
  work:           ['work', 'workdone', 'workstatus'],
  machine_number: ['machinenumber', 'machineno', 'machine'],
  remarks:        ['remarks', 'remark', 'comment', 'comments'],
};

const SNO_HEADERS = ['sno', 'sirno', 'srno', 'slno', 'serialno', 's', 'sr'];
const isSnoHeader = (v) => SNO_HEADERS.includes(norm(v));

// Longest synonym first: "Used material Quantity" and "Used material" share a
// prefix, and matching the short one first would land the quantity column on
// `material`.
const SYNONYMS_BY_LENGTH = FIELD_KEYS
  .flatMap((key) => (HEADER_SYNONYMS[key] || []).map((word) => ({ key, word })))
  .sort((a, b) => b.word.length - a.word.length);

function fieldForHeader(text) {
  const n = norm(text);
  if (!n) return null;
  for (const key of FIELD_KEYS) {
    const exact = [...(HEADER_SYNONYMS[key] || []), norm(FIELDS.find((f) => f.key === key)?.label)];
    if (exact.includes(n)) return key;
  }
  for (const { key, word } of SYNONYMS_BY_LENGTH) {
    if (n.startsWith(word) || word.startsWith(n)) return key;
  }
  return null;
}

/* ── sheet → grid ─────────────────────────────────────────────────── */

// A merged cell only carries its value in the top-left cell of the range; the
// rest come back empty. These reports merge heavily — the CNC hours column is
// one merged "8" spanning five machine rows, and every title row is merged
// across the table — so the value is spread back over its range first, or
// most of a block reads as blank.
function sheetToGrid(ws) {
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, raw: false, defval: '' });
  for (const m of ws['!merges'] || []) {
    const value = grid[m.s.r]?.[m.s.c] ?? '';
    if (String(value).trim() === '') continue;
    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!grid[r]) grid[r] = [];
      for (let c = m.s.c; c <= m.e.c; c++) grid[r][c] = value;
    }
  }
  return grid.map((row) => (row || []).map((c) => String(c ?? '').trim()));
}

const rowIsBlank = (row) => (row || []).every((c) => !c);
const cellCount = (row) => (row || []).filter(Boolean).length;

/* ── titles: department, date, shift ──────────────────────────────── */

// "CNC DEPARTMENT 16/08/2026 (DAY SHIFT)" → each of its three parts.
function parseTitle(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const dateMatch = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  let date = null;
  if (dateMatch) {
    const [, d, m, y] = dateMatch;
    const year = y.length === 2 ? `20${y}` : y;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const shift = /night/i.test(text) ? 'night' : /day\s*shift/i.test(text) ? 'day' : '';
  const name = text
    .replace(/\(?\s*(day|night)\s*shift\s*\)?/ig, ' ')
    .replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, name, date, shift };
}

// Department titles are written differently every month — "(POLISHING)
// CUTTING DEPARTMENT" one day, "CUTTING DEPARTMENT" the next, "Metal, Laser &
// Blasting" with any punctuation at all — so match on the set of words. String
// comparison fails the first of those outright: "polishingcutting" neither
// starts with nor contains "cuttingpolishing".
const NOISE_WORDS = new Set(['department', 'dept', 'the', 'and', 'of', 'shift']);
function titleWords(value) {
  return new Set(
    String(value ?? '').toLowerCase().split(/[^a-z0-9]+/)
      .filter((w) => w && !NOISE_WORDS.has(w) && !/^\d+$/.test(w)),
  );
}

function matchDepartment(title, departments) {
  const t = titleWords(title);
  if (!t.size) return null;

  const scored = (departments || []).map((d) => {
    const n = titleWords(d.name);
    if (!n.size) return { dept: d, score: 0 };
    const shared = [...t].filter((w) => n.has(w)).length;
    if (!shared) return { dept: d, score: 0 };
    const jaccard = shared / new Set([...t, ...n]).size;
    // One name being the whole of the other ("Cutting" vs "Cutting
    // (Polishing)") is a match, not a half-match — that is just the office
    // writing the short form.
    const subset = shared === t.size || shared === n.size;
    return { dept: d, score: jaccard === 1 ? 100 : subset ? 70 + 30 * jaccard : 100 * jaccard };
  }).filter((s) => s.score >= 40).sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  // Two departments fitting equally well is not something to guess at — the
  // import screen asks which one instead.
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].dept;
}

// A single-cell line between blocks — "HANDWORK DEPARTMENT 16/08/2026" — ends
// the block above it whether or not the app knows that department.
const looksLikeTitle = (text) => /department|packed|dispatch/i.test(text) || /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(text);

/* ── rows ─────────────────────────────────────────────────────────── */

// The sheets are full of placeholders — "-", "EMPTY", "NO WORK", "NIL" — that
// mean "nothing here", not data. A row left with nothing after they're
// stripped is counted and skipped, so an idle department doesn't arrive as a
// row of workers called "NO WORK".
const PLACEHOLDER = /^(-+|—+|n\/?a|nil|na|none|empty|no\s*work)$/i;
const cleanCell = (v) => (PLACEHOLDER.test(String(v ?? '').trim()) ? '' : String(v ?? '').trim());

function rowFromCells(cells, colMap) {
  const row = {};
  let filled = 0;
  for (const [idx, key] of Object.entries(colMap)) {
    const value = cleanCell(cells[idx]);
    row[key] = value;
    if (value) filled += 1;
  }
  return { row, filled };
}

/* ── the parser ───────────────────────────────────────────────────── */

/**
 * @param {Buffer|ArrayBuffer|Uint8Array} data  the .xlsx/.xls file
 * @param {{departments: Array}} opts           departments to match titles against
 * @returns {{date: string|null, blocks: Array, warnings: string[]}}
 */
export function parseProductionWorkbook(data, { departments = [] } = {}) {
  const wb = XLSX.read(data, { type: 'buffer', cellDates: false });
  const blocks = [];
  const warnings = [];

  for (const sheetName of wb.SheetNames) {
    const grid = sheetToGrid(wb.Sheets[sheetName]);

    for (let r = 0; r < grid.length; r++) {
      const cells = grid[r];
      // A header row: an "S NO" column plus at least two headers we recognise.
      if (!cells.some(isSnoHeader)) continue;
      const colMap = {};
      const headerLabels = [];
      cells.forEach((cell, c) => {
        if (!cell || isSnoHeader(cell)) return;
        const key = fieldForHeader(cell);
        headerLabels.push({ column: cell, field: key });
        if (key && !Object.values(colMap).includes(key)) colMap[c] = key;
      });
      if (Object.keys(colMap).length < 2) continue;

      // The title is the nearest text above the header — usually the row just
      // above, but a blank spacer row between blocks is common.
      let title = '';
      for (let up = r - 1; up >= 0 && up >= r - 4; up--) {
        if (rowIsBlank(grid[up])) continue;
        if (grid[up].some(isSnoHeader)) break; // ran into the block above
        title = grid[up].find(Boolean) || '';
        break;
      }
      const parsed = parseTitle(title);
      const dept = matchDepartment(parsed.name, departments);

      // Rows run until the next block starts or the sheet gives out. A single
      // blank row inside a block is normal (spacers between crews); two in a
      // row means the block has ended.
      const rows = [];
      let note = '';
      let skipped = 0;
      let blanks = 0;
      let rr = r + 1;
      for (; rr < grid.length; rr++) {
        const line = grid[rr];
        if (line.some(isSnoHeader) && cellCount(line) > 2) break; // next block's header
        if (rowIsBlank(line)) { if (++blanks >= 2) break; continue; }
        blanks = 0;
        const joined = line.filter(Boolean).join(' ');
        if (/^note\s*[:-]/i.test(joined)) { note = joined.replace(/^note\s*[:-]\s*/i, '').trim(); continue; }
        // A lone title line inside the rows means the next block starts here,
        // with its own header on the row below.
        if (cellCount(line) === 1 && looksLikeTitle(joined)) break;

        const { row, filled } = rowFromCells(line, colMap);
        if (!filled) { skipped += 1; continue; }
        rows.push(row);
      }

      blocks.push({
        sheet: sheetName,
        title: parsed.text,
        titleName: parsed.name,
        date: parsed.date,
        shift: dept?.hasShifts ? parsed.shift : '',
        departmentId: dept?.id || '',
        departmentName: dept?.name || '',
        headerLabels,
        unmappedColumns: headerLabels.filter((h) => !h.field).map((h) => h.column),
        rows,
        note,
        skippedRows: skipped,
        // Order numbers that were reaching for H001 / B514 and missed. The
        // rows still import — this column carries "MOP SHEET" and "VINAY SIR"
        // for work booked against no order, so nothing here is refused — but a
        // stray "H 1774" would fork that job's history across every report,
        // and it's cheap to say so before the day is written.
        oddOrders: [...new Set(rows.flatMap((r) => suspectOrderNumbers(r.order_number)))],
      });
      r = rr - 1; // carry on from where this block ended
    }
  }

  // Every block should carry the same date. Take the one most of them agree
  // on and say so when they don't, rather than importing half a day under the
  // wrong date.
  const dateCounts = new Map();
  for (const b of blocks) if (b.date) dateCounts.set(b.date, (dateCounts.get(b.date) || 0) + 1);
  const dates = [...dateCounts.entries()].sort((a, b) => b[1] - a[1]);
  const date = dates[0]?.[0] || null;

  if (dates.length > 1) {
    warnings.push(`This file carries more than one date (${dates.map(([d, n]) => `${d} in ${n} block${n === 1 ? '' : 's'}`).join(', ')}). Everything imports under the date you confirm.`);
  }
  if (!date) warnings.push('No date found in the block titles — set the date this file should import under.');
  const unmapped = [...new Set(blocks.flatMap((b) => b.unmappedColumns))];
  if (unmapped.length) {
    warnings.push(`Columns that match no field and will not be imported: ${unmapped.join(', ')}.`);
  }
  const odd = [...new Set(blocks.flatMap((b) => b.oddOrders))];
  if (odd.length) {
    warnings.push(`Order numbers that don't read as H001 / B514: ${odd.slice(0, 12).join(', ')}${odd.length > 12 ? `, and ${odd.length - 12} more` : ''}. These still import — fix them in the sheet if they are typos.`);
  }
  if (!blocks.length) {
    warnings.push('No department tables found in this file. Each block needs a header row with an "S NO" column and a title above it naming the department.');
  }

  return { date, blocks, warnings };
}
