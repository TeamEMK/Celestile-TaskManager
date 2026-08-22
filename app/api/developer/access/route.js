import { NextResponse } from 'next/server';
import { requireDeveloper } from '@/lib/api';
// Read/write the flag through lib/access.js rather than re-issuing the same
// two queries here. That module owns the short-TTL cache the layout and the
// API guards read, so a toggle made here has to go through it or the flip
// would not be seen for the life of the cached value.
import { isAccessEnabled, setAccessEnabled } from '@/lib/access';

export async function GET(req) {
  const gate = requireDeveloper(req); if (gate) return gate;
  try {
    return NextResponse.json({ enabled: await isAccessEnabled() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = requireDeveloper(req); if (gate) return gate;
  try {
    const { enabled } = await req.json();
    await setAccessEnabled(!!enabled);
    return NextResponse.json({ success: true, enabled: !!enabled });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
