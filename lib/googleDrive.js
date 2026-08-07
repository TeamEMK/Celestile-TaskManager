import { google } from 'googleapis';
import { Readable } from 'stream';
import { requireGoogleCredentials } from './googleCreds';

// Photo/PDF attachments live in Google Drive rather than inline in the database.
// Files are uploaded with the same service account used for Sheets and are NOT
// made publicly shareable — the Workspace org blocks link-sharing outside the
// domain, so the browser could not load them anyway. Instead the stored value
// points at /api/drive/<id>, which streams the bytes back through the app for
// signed-in users (see app/api/drive/[fileId]/route.js).
// Uploads go to a Shared Drive, not a My Drive folder: a service account owns
// whatever it creates but has no storage quota of its own, so only a Shared
// Drive — where the organisation owns the storage — will accept the write.
// It must also be a *member* of that drive; a folder shared with it out of
// someone's My Drive is invisible to it when the org blocks external sharing.
const DEFAULT_DRIVE_ID = '0AAk5LdEEdgfrUk9PVA'; // "ERP Image Database"
const ATTACHMENTS_FOLDER = 'Celestile Attachments';

const EXT_BY_MIME = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'application/pdf': 'pdf',
};

// Cached across calls (module scope survives for the life of the PM2/Node
// process) — building a fresh GoogleAuth client meant a brand-new JWT token
// exchange with Google on literally every attachment upload/view, which was
// adding a full OAuth round-trip of latency to the most frequently-hit
// Drive path (/api/drive/[fileId]). Mirrors the caching already done for the
// Sheets client in lib/sheets-client.js / lib/fmsSheet.js.
let _drive = null;
export function getDrive() {
  if (_drive) return _drive;
  const { client_email, private_key } = requireGoogleCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  _drive = google.drive({ version: 'v3', auth });
  return _drive;
}

// Where attachments land. GOOGLE_DRIVE_FOLDER_ID pins an exact folder; with no
// override we keep a single named folder at the root of the Shared Drive,
// creating it on first use so there is no manual setup step to get wrong.
let _folderId = null;
export async function resolveFolderId(drive) {
  if (process.env.GOOGLE_DRIVE_FOLDER_ID) return process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (_folderId) return _folderId;

  const driveId = process.env.GOOGLE_DRIVE_ID || DEFAULT_DRIVE_ID;
  const found = await drive.files.list({
    q: `name='${ATTACHMENTS_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${driveId}' in parents`,
    fields: 'files(id)', pageSize: 1,
    corpora: 'drive', driveId,
    supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  if (found.data.files?.length) {
    _folderId = found.data.files[0].id;
    return _folderId;
  }

  const created = await drive.files.create({
    requestBody: {
      name: ATTACHMENTS_FOLDER,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [driveId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });
  _folderId = created.data.id;
  return _folderId;
}

function parseDataUri(value) {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(value);
  if (!m) return null;
  return { mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

// Shared upload core for both link styles below. Returns null (rather than
// throwing) for anything that isn't a data: URI, so callers can no-op on
// existing URLs/empty values without a separate guard.
async function uploadDataUri(value, nameHint) {
  if (typeof value !== 'string' || !value.startsWith('data:')) return null;
  const parsed = parseDataUri(value);
  if (!parsed) return null;
  const { mimeType, buffer } = parsed;
  const ext = EXT_BY_MIME[mimeType] || 'bin';
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: `${nameHint}-${Date.now()}.${ext}`,
      parents: [await resolveFolderId(drive)],
    },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { drive, fileId: res.data.id, webViewLink: res.data.webViewLink, mimeType };
}

// Uploads a base64 data: URI to Drive and returns an app-served URL for it.
// Anything that isn't a data: URI — an existing URL, empty, null — passes
// through untouched, so this is safe to call on every write. If the upload
// fails the original value is returned, so a Drive problem degrades to the old
// inline-base64 behaviour rather than losing the attachment.
export async function maybeUploadToDrive(value, nameHint = 'file') {
  try {
    const uploaded = await uploadDataUri(value, nameHint);
    if (!uploaded) return value;
    const kind = uploaded.mimeType === 'application/pdf' ? 'pdf' : 'image';
    return `/api/drive/${uploaded.fileId}?kind=${kind}`;
  } catch (e) {
    console.error('[googleDrive] upload failed, keeping attachment inline as base64:', e.message);
    return value;
  }
}

// Same upload, but returns the real drive.google.com link instead of the
// app-proxied one — for places where the link needs to open on its own
// outside the app (e.g. clicked directly from a Google Sheet cell). Grants
// "anyone with the link" viewer access so it opens without a Task Manager
// login; if the org's sharing policy blocks that (external sharing can be
// disabled Workspace-wide), the file stays reachable to anyone who already
// has access to the "ERP Image Database" Shared Drive, and we fall back to
// the app-proxied link so the attachment is never unreachable.
export async function maybeUploadToDriveWithLink(value, nameHint = 'file') {
  try {
    const uploaded = await uploadDataUri(value, nameHint);
    if (!uploaded) return value;
    try {
      await uploaded.drive.permissions.create({
        fileId: uploaded.fileId,
        requestBody: { type: 'anyone', role: 'reader' },
        supportsAllDrives: true,
      });
    } catch (permErr) {
      console.error('[googleDrive] anyone-with-link share denied (org sharing policy?), link may only open for Shared Drive members:', permErr.message);
    }
    if (uploaded.webViewLink) return uploaded.webViewLink;
    const kind = uploaded.mimeType === 'application/pdf' ? 'pdf' : 'image';
    return `/api/drive/${uploaded.fileId}?kind=${kind}`;
  } catch (e) {
    console.error('[googleDrive] upload failed, keeping attachment inline as base64:', e.message);
    return value;
  }
}
