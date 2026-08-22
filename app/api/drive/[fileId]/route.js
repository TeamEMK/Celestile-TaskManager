import { NextResponse } from 'next/server';
import { getDrive, resolveFolderId } from '@/lib/googleDrive';
import { isKnownAppFolder, warmAppFolders } from '@/lib/liveTrackingFiles';
import { requireUser } from '@/lib/api';

// Nothing this app stores is anywhere near this size; the cap exists so a
// mistaken id can't pull a multi-gigabyte file into memory (the whole body is
// buffered to send it) and take the process down.
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Streams an attachment stored in Google Drive back to the browser. The files
 * are deliberately not link-shareable (the Workspace org blocks sharing outside
 * the domain), so they can only be read through here — which also means only
 * signed-in users can see attachments. Image tags send session cookies on
 * same-origin requests, so <img src="/api/drive/..."> just works.
 *
 * Being signed in is not sufficient on its own. The service account this route
 * authenticates as can read every file that has ever been shared with it —
 * which is far more than this app's own uploads — so a bare `requireUser` made
 * the route an open proxy: change the id in the URL and you fetch whatever
 * else that account can see. A file is only served if it actually belongs to
 * the app: the attachments folder it uploads into, or one of the AppSheet
 * "<Table>_Files_" folders behind a configured Live Tracking sheet.
 */
async function isAppOwnedFile(drive, meta) {
  const parents = meta.data.parents || [];
  if (!parents.length) return false;

  try {
    const attachments = await resolveFolderId(drive);
    if (attachments && parents.includes(String(attachments))) return true;
  } catch { /* folder not resolvable — fall through to the tracker folders */ }

  if (parents.some((p) => isKnownAppFolder(p))) return true;

  // The tracker allowlist is filled in as trackers get viewed, so after a
  // restart a bookmarked link can arrive before anything has populated it.
  await warmAppFolders();
  return parents.some((p) => isKnownAppFolder(p));
}

export async function GET(req, { params }) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { fileId } = await params;
    if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

    const drive = getDrive();
    const meta = await drive.files.get({
      fileId, fields: 'mimeType, name, size, parents', supportsAllDrives: true,
    });

    if (!(await isAppOwnedFile(drive, meta))) {
      // Same 404 as a missing file — no probing which ids exist.
      return NextResponse.json({ error: 'Attachment not available' }, { status: 404 });
    }

    const size = Number(meta.data.size || 0);
    if (size > MAX_BYTES) {
      return NextResponse.json({ error: 'Attachment too large to display' }, { status: 413 });
    }

    const file = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );

    return new NextResponse(Buffer.from(file.data), {
      status: 200,
      headers: {
        'Content-Type': meta.data.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${(meta.data.name || 'file').replace(/"/g, '')}"`,
        // Drive file contents never change once written, so let the browser
        // hold on to them instead of re-fetching on every table render.
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[api/drive]', err.message);
    return NextResponse.json({ error: 'Attachment not available' }, { status: 404 });
  }
}
