/**
 * One-time: rewrite the attachment links already sitting in the FMS sheets
 * so they open for everyone (03-11-2026). Uploads used to be written as the
 * Drive link (drive.google.com/file/d/…), which asks anyone outside the
 * company for access — the Workspace refuses "anyone with the link" — or, for
 * FMS step uploads, as the bare "/api/drive/<id>" path, which doesn't open
 * from a sheet at all. Both become the signed app link (publicDriveUrl).
 *
 * Only files in the app's own attachments folder are touched (a Drive link
 * to anything else is left as it was), and only plain cells — a formula is
 * never overwritten. Runs at server start because the link signature needs
 * the production secret; the app_config flag stops a second run.
 */
import { pool, ensureSchema } from '@/lib/db';
import { getSheetsClient } from '@/lib/googleCreds';
import { getDrive, resolveFolderId, publicDriveUrl } from '@/lib/googleDrive';
import { extractSpreadsheetId, writeCells } from '@/lib/fmsSheet';

const FLAG = 'drive_links_public_v1';
const DRIVE_LINK = /https?:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=)([-\w]{20,})[^\s,]*/g;
const APP_PATH = /(?<![\w/])\/api\/drive\/([-\w]{20,})(?:\?[^\s,]*)?/g;

function colName(i) {
  let n = i + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// `dryRun`: count and show, write nothing (for checking from a dev machine,
// whose secret would sign links production can't open).
export async function migrateDriveLinks({ dryRun = false } = {}) {
  await ensureSchema();
  const [flag] = await pool.query('SELECT `value` FROM app_config WHERE `key` = ?', [FLAG]);
  if (flag.length && !dryRun) return { skipped: 'already done' };

  // The app's own files, with what they are (the link says pdf or image).
  const drive = getDrive();
  const kindOf = new Map();
  let folder;
  try {
    folder = await resolveFolderId(drive);
    let pageToken;
    do {
      const r = await drive.files.list({
        q: `'${folder}' in parents and trashed=false`, pageSize: 1000, pageToken,
        fields: 'nextPageToken, files(id, mimeType)', supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      for (const f of r.data.files || []) kindOf.set(f.id, f.mimeType === 'application/pdf' ? 'pdf' : 'image');
      pageToken = r.data.nextPageToken;
    } while (pageToken);
  } catch (e) {
    return { failed: [{ step: `listing the attachments folder ${folder || '(not found)'}`, error: e.message }] };
  }

  // Every tab an FMS reads or its New Entry form writes.
  const [fmsRows] = await pool.query('SELECT * FROM fms_sheets');
  const tabs = new Map();
  for (const s of fmsRows) {
    for (const [id, name] of [[s.sheet_id, s.sheet_name], [s.intake_sheet_id || s.sheet_id, s.intake_sheet_name]]) {
      const sid = extractSpreadsheetId(id);
      if (sid && name) tabs.set(`${sid}::${name}`, { sid, name });
    }
  }

  const sheets = getSheetsClient();
  const done = [], failed = [];
  for (const { sid, name } of tabs.values()) {
    // One sheet the service account cannot open or edit is reported and
    // skipped, not the end of the run (04-11-2026: "The caller does not
    // have permission" stopped every tab after it).
    try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sid, range: `'${name}'`, valueRenderOption: 'FORMULA' });
    const writes = [];
    (res.data.values || []).forEach((row, ri) => row.forEach((cell, ci) => {
      if (typeof cell !== 'string' || cell.startsWith('=')) return;
      let changed = false;
      const swap = (m, id) => (kindOf.has(id) ? ((changed = true), publicDriveUrl(id, kindOf.get(id))) : m);
      const next = cell.replace(DRIVE_LINK, swap).replace(APP_PATH, swap);
      if (changed && next !== cell) writes.push({ colLetter: colName(ci), rowNumber: ri + 1, value: next });
    }));
    if (dryRun) { done.push({ tab: name, cells: writes.length, sample: writes.slice(0, 2) }); continue; }
    for (let i = 0; i < writes.length; i += 400) await writeCells(sid, `'${name}'`, writes.slice(i, i + 400));
    done.push(`${name}: ${writes.length}`);
    } catch (e) {
      failed.push({ tab: name, sheet: sid, error: e.message });
    }
  }
  if (dryRun) return { dryRun: true, tabs: done, failed };
  // Not marked done while a tab failed — the next run (server start or
  // /api/one-time-jobs) tries it again; tabs already rewritten have nothing
  // left to change.
  if (failed.length) return { tabs: done, failed };

  await pool.query('INSERT INTO app_config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
    [FLAG, new Date().toISOString(), new Date().toISOString()]);
  return { tabs: done };
}
