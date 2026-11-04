import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/api';
import { getFmsSheet } from '@/lib/fmsSheet';
import { parseDrawingRequest } from '@/lib/drawingRequest';
import { maybeUploadToDriveWithLink } from '@/lib/googleDrive';

export const dynamic = 'force-dynamic';

/**
 * A client's Drawing Request (PDF or Excel) read into New Entry rows — one
 * per Area + Technology (lib/drawingRequest.js). Nothing is written to the
 * sheet here: the form shows the rows for checking and submits each through
 * the ordinary intake POST. The file itself goes to Drive once, so every row
 * can carry the one link.
 *   POST { file: data: URI } → { orderNo, client, entries, pieces, fileUrl }
 */
export async function POST(req, { params }) {
  const gate = await requireAccess('fms-intake'); if (gate) return gate;
  try {
    const { id } = await params;
    const sheet = await getFmsSheet(id);
    if (!sheet) return NextResponse.json({ error: 'FMS not found' }, { status: 404 });

    const { file } = await req.json();
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(file || ''));
    if (!m) return NextResponse.json({ error: 'No file received' }, { status: 400 });
    const buf = Buffer.from(m[3], m[2] ? 'base64' : 'utf8');

    let parsed;
    try { parsed = await parseDrawingRequest(buf, m[1]); }
    catch (e) {
      console.error('[drawing-request] parse', e);
      // The reason too: "not a PDF" and "the server can't load the PDF
      // reader" read the same otherwise.
      return NextResponse.json({ error: `Could not read this file — upload the Drawing Request as PDF or Excel. (${e.message})` }, { status: 400 });
    }
    if (!parsed.entries.length) {
      return NextResponse.json({ error: 'No rows found — the file needs the AREA / TECHNOLOGY / TOTAL SQFT table of a Drawing Request.' }, { status: 400 });
    }

    const link = await maybeUploadToDriveWithLink(file, 'drawing-request');
    return NextResponse.json({ ...parsed, fileUrl: String(link).startsWith('data:') ? '' : link });
  } catch (err) {
    console.error('[drawing-request]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
