import { google } from 'googleapis';
import { Readable } from 'stream';
import { getGoogleCredentials } from './googleCreds';

// Photo/PDF attachments live in Google Drive rather than inline in the database.
// Files are uploaded with the same service account used for Sheets and are NOT
// made publicly shareable — the Workspace org blocks link-sharing outside the
// domain, so the browser could not load them anyway. Instead the stored value
// points at /api/drive/<id>, which streams the bytes back through the app for
// signed-in users (see app/api/drive/[fileId]/route.js).
const DEFAULT_FOLDER_ID = '1FrxrLhCQEEMT4Gp-oCqCAOM3lfhA59Ms';

const EXT_BY_MIME = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'application/pdf': 'pdf',
};

export function getDrive() {
  const { client_email, private_key } = getGoogleCredentials();
  if (!client_email || !private_key) throw new Error('Google credentials not configured');

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

function parseDataUri(value) {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(value);
  if (!m) return null;
  return { mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

// Uploads a base64 data: URI to Drive and returns an app-served URL for it.
// Anything that isn't a data: URI — an existing URL, empty, null — passes
// through untouched, so this is safe to call on every write. If the upload
// fails the original value is returned, so a Drive problem degrades to the old
// inline-base64 behaviour rather than losing the attachment.
export async function maybeUploadToDrive(value, nameHint = 'file') {
  if (typeof value !== 'string' || !value.startsWith('data:')) return value;
  const parsed = parseDataUri(value);
  if (!parsed) return value;
  try {
    const { mimeType, buffer } = parsed;
    const ext = EXT_BY_MIME[mimeType] || 'bin';
    const res = await getDrive().files.create({
      requestBody: {
        name: `${nameHint}-${Date.now()}.${ext}`,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID],
      },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id',
      supportsAllDrives: true,
    });
    const kind = mimeType === 'application/pdf' ? 'pdf' : 'image';
    return `/api/drive/${res.data.id}?kind=${kind}`;
  } catch (e) {
    console.error('[googleDrive] upload failed, keeping attachment inline as base64:', e.message);
    return value;
  }
}
