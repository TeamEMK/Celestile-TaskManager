/**
 * Live Tracking — a saved pointer (name + sheet + tab) to an external Google
 * Sheet, rendered as-is in full. Unlike FMS (lib/fmsSheet.js), there's no
 * per-column config (Plan/Actual/steps) — this is the "print the whole sheet
 * into the ERP" view, so it just mirrors the connected tab.
 */
import { pool, ensureSchema } from '@/lib/db';
import { extractSpreadsheetId, fetchRange } from '@/lib/fmsSheet';
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

export async function createLiveTracker({ name, sheetLink, sheetName, headerRow, createdBy }) {
  await ensureSchema();
  const sheetId = extractSpreadsheetId(sheetLink);
  if (!sheetId) throw new Error('Could not read a Sheet ID from that link');
  const id = 'LT' + Date.now();
  await pool.query(
    'INSERT INTO live_trackers (id, name, sheet_id, sheet_name, header_row, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
    [id, name || sheetName || '', sheetId, sheetName || '', parseInt(headerRow) || 1, createdBy || null]
  );
  return id;
}

export async function updateLiveTracker(id, { name, sheetLink, sheetName, headerRow }) {
  await ensureSchema();
  const sheetId = extractSpreadsheetId(sheetLink);
  if (!sheetId) throw new Error('Could not read a Sheet ID from that link');
  await pool.query(
    'UPDATE live_trackers SET name = ?, sheet_id = ?, sheet_name = ?, header_row = ? WHERE id = ?',
    [name || sheetName || '', sheetId, sheetName || '', parseInt(headerRow) || 1, id]
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
  const rows = rawRows
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
    .map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));

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

  return { headers, rows, fileLinks, fileLinkError, fileStats };
}
