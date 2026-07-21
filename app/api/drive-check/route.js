import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getDrive, resolveFolderId } from '@/lib/googleDrive';
import { getGoogleCredentials } from '@/lib/googleCreds';
import { requireAdmin } from '@/lib/api';

// Admin-only smoke test for the Drive attachment pipeline. Uploads fail
// silently by design (the attachment falls back to inline base64 so nothing is
// lost), which makes a misconfiguration hard to spot from the UI — hit this
// route to see exactly which step is broken.
export async function GET() {
  const gate = await requireAdmin(); if (gate) return gate;

  // Report the shape of the key, never the key itself — a mangled PEM is the
  // most common failure here and it is otherwise invisible. A real 2048-bit
  // PKCS#8 key is ~1700 chars over ~28 lines, so a much smaller number means
  // the panel truncated the value.
  const creds = getGoogleCredentials();
  const key = creds.private_key;
  const bodyChars = key.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  const steps = {
    serviceAccountEmail: creds.client_email || '(not set)',
    credentialsSource: creds.source || '(none)',
    privateKeySet: !!key,
    privateKeyLooksValid: key.includes('-----BEGIN') && key.includes('-----END') && key.includes('\n'),
    privateKeyHeader: (key.split('\n')[0] || '').slice(0, 40),
    privateKeyLength: key.length,
    privateKeyLines: key.split('\n').filter(Boolean).length,
    privateKeyBodyIsBase64: /^[A-Za-z0-9+/=]*$/.test(bodyChars),
    privateKeyParses: false,
  };

  try {
    const { createPrivateKey } = await import('crypto');
    createPrivateKey(key);
    steps.privateKeyParses = true;
  } catch (e) {
    return NextResponse.json({
      ...steps, ok: false, failedAt: 'private-key', error: e.message,
      hint: `The key in ${steps.credentialsSource} is not usable. Most reliable fix: upload the service-account JSON key file as credentials.json in the app folder — nothing can reformat it there. Alternatively base64-encode the whole private_key and paste that single line into GOOGLE_PRIVATE_KEY; the app decodes it automatically.`,
    });
  }

  let drive;
  try {
    drive = getDrive();
  } catch (e) {
    return NextResponse.json({ ...steps, ok: false, failedAt: 'credentials', error: e.message });
  }

  let folderId;
  try {
    // Resolves (and creates on first run) the same folder uploads use.
    folderId = await resolveFolderId(drive);
    steps.folderId = folderId;
    const meta = await drive.files.get({ fileId: folderId, fields: 'name, mimeType, driveId', supportsAllDrives: true });
    steps.folderName = meta.data.name;
    steps.isSharedDrive = !!meta.data.driveId;
  } catch (e) {
    // A malformed key surfaces here rather than at credential-build time,
    // because googleapis only signs the JWT once a call is actually made.
    const badKey = /DECODER|routines|PEM|asn1|Invalid keyData/i.test(e.message);
    if (badKey) {
      return NextResponse.json({
        ...steps, ok: false, failedAt: 'private-key', error: e.message,
        hint: `The key in ${steps.credentialsSource} is not a readable PEM. Upload the service-account JSON key file as credentials.json in the app folder, or paste the private_key exactly as it appears in that file (keeping the \\n sequences).`,
      });
    }
    // "File not found" here means the account authenticated fine but cannot
    // see the folder — almost always the share landing on a different address.
    // List what it *can* reach so the mismatch is obvious.
    const visible = { sharedDrives: [], folders: [] };
    await Promise.all([
      drive.drives.list({ pageSize: 10, fields: 'drives(id,name)' })
        .then((r) => { visible.sharedDrives = (r.data.drives || []).map((d) => `${d.name} (${d.id})`); })
        .catch((err) => { visible.sharedDrives = [`could not list: ${err.message}`]; }),
      drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        pageSize: 10, fields: 'files(id,name)',
        supportsAllDrives: true, includeItemsFromAllDrives: true,
      })
        .then((r) => { visible.folders = (r.data.files || []).map((f) => `${f.name} (${f.id})`); })
        .catch((err) => { visible.folders = [`could not list: ${err.message}`]; }),
    ]);
    return NextResponse.json({
      ...steps, ok: false, failedAt: 'folder-access', error: e.message,
      visibleToServiceAccount: visible,
      hint: `${steps.serviceAccountEmail} cannot see this folder. Share it with exactly that address (Editor). If it lives in a Shared Drive, add the account as a member of the Shared Drive itself — sharing a single folder out of a Shared Drive is blocked when the org disallows external sharing. Anything the account can already reach is listed above.`,
    });
  }

  try {
    const res = await drive.files.create({
      requestBody: { name: `drive-check-${Date.now()}.txt`, parents: [folderId] },
      media: { mimeType: 'text/plain', body: Readable.from(Buffer.from('celestile drive check')) },
      fields: 'id',
      supportsAllDrives: true,
    });
    // Leave nothing behind — this is only a connectivity probe.
    await drive.files.delete({ fileId: res.data.id, supportsAllDrives: true }).catch(() => {});
    return NextResponse.json({ ...steps, ok: true, message: 'Upload works — attachments will go to Drive.' });
  } catch (e) {
    return NextResponse.json({
      ...steps, ok: false, failedAt: 'upload',
      error: e.message,
      hint: /storageQuota/i.test(e.message)
        ? 'Service accounts have no Drive storage of their own. Move the folder into a Shared Drive and add the service account as a member (Content Manager or higher).'
        : 'Check that the service account has Editor (not Viewer) access to the folder.',
    });
  }
}
