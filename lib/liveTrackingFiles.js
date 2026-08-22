/**
 * Resolving AppSheet file-upload answers to something the browser can open.
 *
 * The tracking sheets are AppSheet data sources, and an AppSheet file/image
 * column does NOT store a URL — it stores a path relative to the app's data
 * folder in Drive:
 *
 *   Live form_Files_/02-27-2026 14-03-58.Document Upload.084556.NAME.pdf
 *
 * There is no hyperlink on the cell either (checked: no `hyperlink`, no
 * textFormatRuns link, no HYPERLINK formula), so nothing in the sheet is
 * clickable on its own. The bytes live in a "<Table>_Files_" folder sitting
 * beside the spreadsheet, and the only way to reach them is to look the name
 * up in Drive and serve the file id through /api/drive/<id>.
 *
 * That lookup needs the service account to be able to *see* that folder.
 * Sharing the spreadsheet alone is not enough — Drive shares are per-item, so
 * the folder has to be shared too. When it isn't, everything here degrades to
 * "no link resolved" and the UI falls back to a Drive search link instead of
 * failing.
 */
import { getDrive } from '@/lib/googleDrive';
// Path parsing lives in the view helper so the client can use it too — that
// module is pure, this one drags in googleapis.
import { isAppSheetPath, splitAppSheetPath } from '@/lib/liveTrackingView';

export { isAppSheetPath, splitAppSheetPaths } from '@/lib/liveTrackingView';

/* ── Drive folder index, cached ───────────────────────────────────── */

const TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map(); // `${sheetId}::${folder}` -> { at, byName?, error? }

/**
 * Folder ids this app has legitimately resolved for a Live Tracking sheet.
 *
 * /api/drive/<id> streams whatever file id it is handed, and the service
 * account can read a great deal more than this app's own uploads. The route
 * checks a candidate file's parent against this set (plus the attachments
 * folder) so a signed-in user cannot walk arbitrary Drive ids.
 */
const _appFolderIds = new Set();
export function isKnownAppFolder(folderId) {
  return !!folderId && _appFolderIds.has(String(folderId));
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findFolder(drive, sheetId, folderName) {
  // The app's file folder is a sibling of the spreadsheet, so start from the
  // spreadsheet's own parents.
  const meta = await drive.files.get({
    fileId: sheetId, fields: 'parents', supportsAllDrives: true,
  });
  for (const parent of meta.data.parents || []) {
    const res = await drive.files.list({
      q: `name = '${esc(folderName)}' and '${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)', pageSize: 1,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    if (res.data.files?.length) return res.data.files[0].id;
  }

  // No parents visible (the sheet was shared on its own) — fall back to a
  // by-name search across everything the service account can reach.
  const anywhere = await drive.files.list({
    q: `name = '${esc(folderName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)', pageSize: 1, corpora: 'allDrives',
    supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  return anywhere.data.files?.[0]?.id || null;
}

async function indexFolder(drive, folderId) {
  const byName = new Map();
  let pageToken;
  // Bounded so a folder with a runaway number of uploads can't stall a page
  // load; 20 pages x 1000 covers far more than these trackers ever hold.
  for (let page = 0; page < 20; page++) {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType)',
      pageSize: 1000, pageToken,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files || []) {
      if (!byName.has(f.name)) byName.set(f.name, { id: f.id, mimeType: f.mimeType });
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return byName;
}

async function getIndex(sheetId, folderName) {
  const key = `${sheetId}::${folderName}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;

  let entry;
  try {
    const drive = getDrive();
    const folderId = await findFolder(drive, sheetId, folderName);
    if (folderId) _appFolderIds.add(String(folderId));
    entry = folderId
      ? { at: Date.now(), byName: await indexFolder(drive, folderId) }
      : { at: Date.now(), error: `Drive folder "${folderName}" is not shared with the app's Google service account.` };
  } catch (err) {
    // Negative-cached too: without this a permission problem would re-run the
    // whole Drive lookup on every 30s poll, for every viewer.
    entry = { at: Date.now(), error: err.message };
  }
  cache.delete(key);
  cache.set(key, entry);
  // Bounded — one entry per (sheet, folder) pair, and the process is long-lived.
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return entry;
}

/**
 * Warm the folder allowlist for every configured Live Tracking sheet.
 *
 * Needed because the allowlist is only populated as a side effect of somebody
 * viewing a tracker: after a restart, a bookmarked /api/drive/<id> link would
 * otherwise be refused until someone opened the tracker page again.
 */
let _warmedAt = 0;
export async function warmAppFolders() {
  if (Date.now() - _warmedAt < TTL_MS) return;
  _warmedAt = Date.now();
  try {
    const { pool } = await import('@/lib/db');
    const [rows] = await pool.query('SELECT sheet_id FROM live_trackers');
    const drive = getDrive();
    for (const r of rows || []) {
      const meta = await drive.files.get({ fileId: r.sheet_id, fields: 'parents', supportsAllDrives: true });
      for (const parent of meta.data.parents || []) {
        const res = await drive.files.list({
          q: `'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: 'files(id,name)', pageSize: 100,
          supportsAllDrives: true, includeItemsFromAllDrives: true,
        });
        for (const f of res.data.files || []) {
          if (/_Files_$/.test(f.name || '')) _appFolderIds.add(String(f.id));
        }
      }
    }
  } catch (err) {
    console.error('[drive allowlist] warm failed:', err.message);
  }
}

/* ── public API ───────────────────────────────────────────────────── */

// paths: the distinct AppSheet paths seen in the sheet.
// -> { links: { [path]: '/api/drive/<id>' }, error, indexed, total, resolved }
//
// `indexed` says the Drive folder itself was read successfully. That matters
// downstream: a path with no link means "this upload was deleted from Drive"
// when indexed is true, but only "we couldn't look" when it's false.
export async function resolveAppSheetFiles(sheetId, paths) {
  const wanted = [...new Set((paths || []).filter(isAppSheetPath))];
  if (!wanted.length) return { links: {}, error: '', indexed: true, total: 0, resolved: 0 };

  const byFolder = new Map();
  for (const p of wanted) {
    const { folder, name } = splitAppSheetPath(p);
    if (!folder) continue;
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push({ path: p, name });
  }

  const links = {};
  let error = '';
  let indexed = true;

  await Promise.all([...byFolder.entries()].map(async ([folder, items]) => {
    const index = await getIndex(sheetId, folder);
    if (index.error) { error = error || index.error; indexed = false; return; }
    for (const { path, name } of items) {
      const f = index.byName.get(name);
      if (f) links[path] = `/api/drive/${f.id}`;
    }
  }));

  return { links, error, indexed, total: wanted.length, resolved: Object.keys(links).length };
}
