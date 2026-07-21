import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { getDrive } from '@/lib/googleDrive';
import { normalizePrivateKey } from '@/lib/googleCreds';
import { requireAdmin } from '@/lib/api';

// Admin-only smoke test for the Drive attachment pipeline. Uploads fail
// silently by design (the attachment falls back to inline base64 so nothing is
// lost), which makes a misconfiguration hard to spot from the UI — hit this
// route to see exactly which step is broken.
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1FrxrLhCQEEMT4Gp-oCqCAOM3lfhA59Ms';

export async function GET() {
  const gate = await requireAdmin(); if (gate) return gate;

  // Report the shape of the key, never the key itself — a mangled PEM is the
  // most common failure here and it is otherwise invisible.
  const key = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  const steps = {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '(not set)',
    privateKeySet: !!process.env.GOOGLE_PRIVATE_KEY,
    privateKeyLooksValid: key.includes('-----BEGIN') && key.includes('-----END') && key.includes('\n'),
    folderId: FOLDER_ID,
  };

  let drive;
  try {
    drive = getDrive();
  } catch (e) {
    return NextResponse.json({ ...steps, ok: false, failedAt: 'credentials', error: e.message });
  }

  try {
    const meta = await drive.files.get({ fileId: FOLDER_ID, fields: 'name, mimeType, driveId', supportsAllDrives: true });
    steps.folderName = meta.data.name;
    steps.isSharedDrive = !!meta.data.driveId;
  } catch (e) {
    // A malformed key surfaces here rather than at credential-build time,
    // because googleapis only signs the JWT once a call is actually made.
    const badKey = /DECODER|routines|PEM|asn1|Invalid keyData/i.test(e.message);
    return NextResponse.json({
      ...steps, ok: false, failedAt: badKey ? 'private-key' : 'folder-access',
      error: e.message,
      hint: badKey
        ? 'GOOGLE_PRIVATE_KEY is not a readable PEM. Paste the private_key value exactly as it appears in the JSON key file (keeping the \\n sequences), or base64-encode the whole key and paste that instead.'
        : 'Share the folder with the service account email above, giving it Editor access.',
    });
  }

  try {
    const res = await drive.files.create({
      requestBody: { name: `drive-check-${Date.now()}.txt`, parents: [FOLDER_ID] },
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
