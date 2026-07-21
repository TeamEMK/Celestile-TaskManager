import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { syncAll } from '@/lib/google-sheets';
import { sql } from '@/lib/mysql-sql';
import { getGoogleCredentials } from '@/lib/googleCreds';

export async function POST() {
  const { client_email, private_key } = getGoogleCredentials();
  if (!client_email || !private_key)
    return NextResponse.json({ error: 'Google credentials not configured' }, { status: 500 });

  try {
    await ensureSchema();
    await syncAll(sql);
    return NextResponse.json({ success: true, message: 'All tabs synced to Google Sheets' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
