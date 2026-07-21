import { google } from 'googleapis';
import { Readable } from 'stream';

// Shared Drive folder photos/attachments get uploaded to. Override via
// GOOGLE_DRIVE_FOLDER_ID if a different folder should be used.
const DEFAULT_FOLDER_ID = '0AAk5LdEEdgfrUk9PVA';

const EXT_BY_MIME = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'application/pdf': 'pdf',
};

function getDrive() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Google credentials not configured');

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

function parseDataUri(value) {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(value);
  if (!m) return null;
  return { mimeType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

// Uploads a base64 data: URI to the shared Drive folder and returns a public,
// directly-embeddable URL (images → inline thumbnail link, PDFs → viewer link).
// Anything that isn't a data: URI (already a URL, empty, null, undefined)
// passes through unchanged, so this is safe to call on every write.
// On upload failure, falls back to the original value so a Drive hiccup
// never loses the photo — it just stays inline as base64 that one time.
export async function maybeUploadToDrive(value, nameHint = 'file') {
  if (typeof value !== 'string' || !value.startsWith('data:')) return value;
  const parsed = parseDataUri(value);
  if (!parsed) return value;
  try {
    const { mimeType, buffer } = parsed;
    const drive = getDrive();
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
    const ext = EXT_BY_MIME[mimeType] || 'bin';
    const res = await drive.files.create({
      requestBody: { name: `${nameHint}-${Date.now()}.${ext}`, parents: [folderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id',
      supportsAllDrives: true,
    });
    const fileId = res.data.id;
    // Without this the browser can't load the file (it fetches Drive directly,
    // unauthenticated). If an org policy blocks link-sharing this throws — log
    // it loudly rather than silently serving a broken image.
    await drive.permissions.create({
      fileId, supportsAllDrives: true,
      requestBody: { role: 'reader', type: 'anyone' },
    }).catch((e) => {
      console.error(`[googleDrive] file ${fileId} uploaded but could NOT be made link-viewable — it will not render in the app:`, e.message);
    });
    return mimeType === 'application/pdf'
      ? `https://drive.google.com/file/d/${fileId}/view`
      : `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
  } catch (e) {
    console.error('[googleDrive] upload failed, keeping inline data:', e.message);
    return value;
  }
}
