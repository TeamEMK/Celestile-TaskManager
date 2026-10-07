/**
 * Live Tracking — a saved pointer (name + sheet + tab) to an external Google
 * Sheet, rendered as-is in full. Unlike FMS (lib/fmsSheet.js), there's no
 * per-column config (Plan/Actual/steps) — this is the "print the whole sheet
 * into the ERP" view, so it just mirrors the connected tab.
 */
import { pool, ensureSchema } from '@/lib/db';
import { extractSpreadsheetId, fetchRange, writeCellAt } from '@/lib/fmsSheet';
import { isAppSheetPath, splitAppSheetPaths, resolveAppSheetFiles } from '@/lib/liveTrackingFiles';

export async function listLiveTrackers() {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM live_trackers ORDER BY created_at DESC');
  return rows;
}

export async function getLiveTracker(id) {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM live_trackers WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function createLiveTracker({ name, sheetLink, sheetName, headerRow, startRow, createdBy }) {
  await ensureSchema();
  const sheetId = extractSpreadsheetId(sheetLink);
  if (!sheetId) throw new Error('Could not read a Sheet ID from that link');
  const id = 'LT' + Date.now();
  await pool.query(
    'INSERT INTO live_trackers (id, name, sheet_id, sheet_name, header_row, start_row, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
    [id, name || sheetName || '', sheetId, sheetName || '', parseInt(headerRow) || 1, parseInt(startRow) || 0, createdBy || null]
  );
  return id;
}

export async function updateLiveTracker(id, { name, sheetLink, sheetName, headerRow, startRow }) {
  await ensureSchema();
  const sheetId = extractSpreadsheetId(sheetLink);
  if (!sheetId) throw new Error('Could not read a Sheet ID from that link');
  await pool.query(
    'UPDATE live_trackers SET name = ?, sheet_id = ?, sheet_name = ?, header_row = ?, start_row = ? WHERE id = ?',
    [name || sheetName || '', sheetId, sheetName || '', parseInt(headerRow) || 1, parseInt(startRow) || 0, id]
  );
}

export async function deleteLiveTracker(id) {
  await ensureSchema();
  await pool.query('DELETE FROM live_trackers WHERE id = ?', [id]);
}

// Full live snapshot of the connected tab. `range` = just the tab name (no
// column bound), so Sheets returns the whole used range — we don't know the
// sheet's shape ahead of time, unlike FMS's step-scoped fetchRange calls.
//
// `fileLinks` maps any AppSheet upload path found in the data to an openable
// /api/drive/<id> URL — those cells hold a bare filename, not a link, so the
// table has nothing to make clickable without this (see lib/liveTrackingFiles).
export async function getLiveTrackerData(tracker) {
  const rawRows = await fetchRange(tracker.sheet_id, tracker.sheet_name || 'Sheet1');
  const headerIdx = (parseInt(tracker.header_row) || 1) - 1;
  const headers = (rawRows[headerIdx] || []).map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
  const width = headers.length;

  // `start_row` is a sheet row number (what the Google Sheet's own gutter
  // shows), not an offset — the whole point is that you read "396" off the
  // sheet and type it in. 0/unset, or anything at or above the header, means
  // "start right below the header", which is what every tracker did before.
  const startRow = parseInt(tracker.start_row) || 0;
  const firstIdx = startRow > headerIdx + 1 ? startRow - 1 : headerIdx + 1;

  const keep = (r) => r.some((c) => String(c ?? '').trim() !== '');
  const skipped = rawRows.slice(headerIdx + 1, firstIdx).filter(keep).length;
  // Blank rows are dropped, so a row's place in `rows` is not its place in
  // the sheet — `rowNumbers[i]` is the sheet row `rows[i]` came from, which
  // is what an in-table edit has to write back to.
  const rows = [], rowNumbers = [];
  rawRows.slice(firstIdx).forEach((r, i) => {
    if (!keep(r)) return;
    rows.push(Array.from({ length: width }, (_, c) => r[c] ?? ''));
    rowNumbers.push(firstIdx + i + 1);
  });

  const paths = [];
  for (const row of rows) {
    for (const cell of row) {
      if (isAppSheetPath(cell)) paths.push(...splitAppSheetPaths(cell));
    }
  }

  // A Drive problem must never take the whole sheet view down — the table is
  // perfectly usable with the filenames left as plain text.
  let fileLinks = {}, fileLinkError = '', fileStats = null;
  if (paths.length) {
    try {
      const r = await resolveAppSheetFiles(tracker.sheet_id, paths);
      fileLinks = r.links;
      fileLinkError = r.error;
      fileStats = { indexed: r.indexed, total: r.total, resolved: r.resolved };
    } catch (err) {
      fileLinkError = err.message;
      fileStats = { indexed: false, total: paths.length, resolved: 0 };
    }
  }

  return { headers, rows, rowNumbers, fileLinks, fileLinkError, fileStats, firstRow: firstIdx + 1, skipped };
}

/**
 * Write one cell of the connected tab back to the sheet.
 *
 * The row is re-read first and its order number compared with what the
 * table showed: AppSheet users add and delete rows all day, so the row
 * number the browser holds can be stale by the time someone clicks — and a
 * stale write would land on somebody else's order. Returns the fresh row so
 * the caller can re-check the user's branch scope against it.
 */
export async function setLiveTrackerCell(tracker, { rowNumber, colIdx, value, orderIdx, expectOrder }) {
  const tab = tracker.sheet_name || 'Sheet1';
  const [row = []] = await fetchRange(tracker.sheet_id, `${tab}!${rowNumber}:${rowNumber}`);
  if (orderIdx != null && orderIdx >= 0
      && String(row[orderIdx] ?? '').trim() !== String(expectOrder ?? '').trim()) {
    const err = new Error('This row moved in the sheet since the page loaded. Refresh and try again.');
    err.status = 409;
    throw err;
  }
  await writeCellAt(tracker.sheet_id, tab, colIdx, rowNumber, value);
  return row;
}
