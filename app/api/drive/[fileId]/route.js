import { NextResponse } from 'next/server';
import { getDrive } from '@/lib/googleDrive';
import { requireUser } from '@/lib/api';

// Streams an attachment stored in Google Drive back to the browser. The files
// are deliberately not link-shareable (the Workspace org blocks sharing outside
// the domain), so they can only be read through here — which also means only
// signed-in users can see attachments. Image tags send session cookies on
// same-origin requests, so <img src="/api/drive/..."> just works.
export async function GET(req, { params }) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const { fileId } = await params;
    if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

    const drive = getDrive();
    const [meta, file] = await Promise.all([
      drive.files.get({ fileId, fields: 'mimeType, name', supportsAllDrives: true }),
      drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' }),
    ]);

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
