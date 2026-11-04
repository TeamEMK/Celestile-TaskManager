/**
 * A client's "Drawing Request" sheet (04-11-2026) — the table the sales side
 * sends for an order: one line per piece, with Area, Technology, 2D/3D, Stone
 * Type, Thickness, Total SQFT. Read out of the PDF (or the Excel it was
 * exported from) so the Design O2D New Entry form can add one entry per Area
 * + Technology instead of someone typing each in.
 *
 * The PDF has no table structure, only positioned text, so the columns come
 * from the header labels and the rows from the Technology / 2D-3D cells — the
 * one single-line cell every piece has. Every other line goes to the row whose
 * Technology cell is nearest (cells are vertically centred in their row).
 * Whatever this gets wrong, the form shows it for checking before saving.
 */
import * as XLSX from 'xlsx';

const HEADERS = [
  ['sno', /^S\.?\s*NO\.?$/i],
  ['date', /^DATE$/i],
  ['dc', /^DC\s*NAME/i],
  ['orderNo', /^(H\s*NO|ORDER\s*(NO|NUMBER))\.?$/i],
  ['client', /^CLIENT/i],
  ['architect', /^ARCHITECT/i],
  ['area', /^AREA(\s*NAME)?$/i],
  ['ref', /^REFERENCE/i],
  ['desc', /DESCRIPTION/i],
  ['technology', /^TECHNOLOGY(\s*\(|$)/i],
  ['dim', /DIMENSIONAL/i],
  ['stoneType', /^STONE\s*TYPE/i],
  ['thickness', /^THICKNESS/i],
  ['size', /^SIZE/i],
  ['wt', /^WT$/i],
  ['ht', /^HT$/i],
  ['pcs', /^NO\.?(\s*OF\s*PCS)?$/i],
  ['sft', /^TOTAL\s*SQ?\.?\s*FT|^SFT$|^SQFT$/i],
  ['comments', /^COMMENTS?$/i],
];
const headerKey = (s) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return (HEADERS.find(([, re]) => re.test(t)) || [])[0] || null;
};

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const sftOf = (s) => {
  const m = clean(s).replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m && !/PCS/i.test(s) ? Number(m[0]) : 0;
};

// ── PDF ─────────────────────────────────────────────────────────────────────

async function pdfLines(buf) {
  // Loaded at run time, not resolved by the build: a server that has not run
  // npm install since pdfjs-dist was added still builds, and only this (PDF)
  // path fails until it has.
  const pdfjs = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, isEvalSupported: false }).promise;
  const records = [];
  let cols = null;
  let title = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const items = (await page.getTextContent()).items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width }));
    if (!title) title = items.map((i) => i.s).find((s) => /DRAWING\s*REQUEST/i.test(s)) || '';

    // Header band: the line holding "TECHNOLOGY" and the WT / HT line under
    // it. A page without one (page 2 onward) keeps the columns of the page
    // before; a "TECHNOLOGY" inside a description has no header line around it.
    const tech = items.find((i) => headerKey(i.s) === 'technology'
      && items.filter((j) => Math.abs(j.y - i.y) <= 10 && headerKey(j.s)).length >= 5);
    let below = items;
    if (tech) {
      const band = items.filter((i) => i.y <= tech.y + 10 && i.y >= tech.y - 30 && headerKey(i.s));
      const found = {};
      for (const i of band.sort((a, b) => b.y - a.y)) {
        const k = headerKey(i.s);
        if (!found[k]) found[k] = i.x + i.w / 2;
      }
      cols = Object.entries(found).map(([key, c]) => ({ key, c })).sort((a, b) => a.c - b.c);
      cols.forEach((col, n) => {
        col.lo = n ? (cols[n - 1].c + col.c) / 2 : -Infinity;
        col.hi = n < cols.length - 1 ? (col.c + cols[n + 1].c) / 2 : Infinity;
      });
      const top = Math.min(...band.map((i) => i.y));
      below = items.filter((i) => i.y < top - 3);
    }
    if (!cols) continue;

    const colOf = (i) => {
      const mid = i.x + i.w / 2;
      const col = cols.find((c) => mid >= c.lo && mid < c.hi);
      if (!col) return null;
      // A note across several columns ("NEED MATERIAL BY 10TH OCT…") is no
      // one cell's text.
      const width = Number.isFinite(col.lo) && Number.isFinite(col.hi) ? col.hi - col.lo : Infinity;
      return i.w > width * 1.5 ? null : col.key;
    };
    const placed = below.map((i) => ({ ...i, key: colOf(i) })).filter((i) => i.key);

    // One anchor per piece: its Technology / 2D-3D cell, merged when both
    // (or a two-line cell) sit at the same height.
    const anchors = [];
    for (const i of placed.filter((i) => i.key === 'technology' || i.key === 'dim').sort((a, b) => b.y - a.y)) {
      const last = anchors[anchors.length - 1];
      if (last && last.y0 - i.y <= 7) { last.ys.push(i.y); last.y = last.ys.reduce((a, b) => a + b, 0) / last.ys.length; }
      else anchors.push({ y: i.y, y0: i.y, ys: [i.y] });
    }
    if (!anchors.length) continue;

    const rows = anchors.map(() => ({}));
    for (const i of placed) {
      let best = 0;
      for (let n = 1; n < anchors.length; n++) if (Math.abs(anchors[n].y - i.y) < Math.abs(anchors[best].y - i.y)) best = n;
      if (Math.abs(anchors[best].y - i.y) > 30) continue;
      (rows[best][i.key] ||= []).push(i);
    }
    for (const r of rows) {
      const rec = {};
      for (const [k, list] of Object.entries(r)) {
        rec[k] = clean(list.sort((a, b) => (Math.abs(a.y - b.y) < 2 ? a.x - b.x : b.y - a.y)).map((i) => i.s).join(' '));
      }
      records.push(rec);
    }
  }
  return { records, title };
}

// ── Excel ───────────────────────────────────────────────────────────────────

function sheetLines(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
    const h = grid.findIndex((row) => row.some((c) => headerKey(c) === 'technology') && row.some((c) => headerKey(c) === 'area'));
    if (h < 0) continue;
    const map = {};
    grid[h].forEach((c, i) => { const k = headerKey(c); if (k && map[k] === undefined) map[k] = i; });
    const title = grid.slice(0, h + 1).flat().map(clean).find((s) => /DRAWING\s*REQUEST/i.test(s)) || '';
    const records = grid.slice(h + 1)
      .map((row) => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, clean(row[i])])))
      .filter((r) => r.technology || r.dim || r.sft);
    return { records, title };
  }
  return { records: [], title: '' };
}

// ── Pieces → entries ───────────────────────────────────────────────────────

const distinct = (list) => [...new Map(list.filter(Boolean).map((v) => [v.toUpperCase(), v])).values()];

/**
 * Parse a drawing request. `buf` is the file's bytes, `mime` its type.
 * Returns { orderNo, client, date, pieces, entries } — entries are one per
 * Area + Technology, SFT summed and the stones / thicknesses listed.
 */
export async function parseDrawingRequest(buf, mime = '') {
  const isPdf = /pdf/i.test(mime) || buf.slice(0, 5).toString() === '%PDF-';
  const { records, title } = isPdf ? await pdfLines(buf) : sheetLines(buf);

  const first = (k) => records.map((r) => r[k]).find(Boolean) || '';
  const orderNo = (first('orderNo') || (title.match(/\b([A-Z]\s?\d{3,5})\b/i) || [])[1] || '').replace(/\s+/g, '').toUpperCase();

  // The area is written on a piece's first line only. A numbered line with no
  // area of its own ("8 — SANDBLASTED TEXTURED") is named by its description.
  let area = '';
  const pieces = records.map((r) => {
    if (r.area) area = r.area;
    else if (r.sno) area = r.desc || `Item ${r.sno}`;
    return {
      area, technology: r.technology || '', dim: r.dim || '', desc: r.desc || '',
      stoneType: r.stoneType || '', thickness: r.thickness || '',
      pcs: r.pcs || '', sft: sftOf(r.sft), comments: r.comments || '',
    };
  });

  const groups = new Map();
  for (const p of pieces) {
    const k = `${p.area.toUpperCase()}|${p.technology.toUpperCase()}`;
    if (!groups.has(k)) groups.set(k, { area: p.area, technology: p.technology, pieces: [] });
    groups.get(k).pieces.push(p);
  }
  const entries = [...groups.values()].map((g) => ({
    area: g.area,
    technology: g.technology,
    dim: distinct(g.pieces.map((p) => p.dim)).join(' / '),
    stoneType: distinct(g.pieces.map((p) => p.stoneType)).join(', '),
    thickness: distinct(g.pieces.map((p) => p.thickness)).join(', '),
    sft: Math.round(g.pieces.reduce((s, p) => s + p.sft, 0) * 100) / 100,
    lines: g.pieces.length,
  }));

  return { orderNo, client: first('client'), date: first('date'), pieces, entries };
}
