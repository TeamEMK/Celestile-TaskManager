import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { syncAll } from '@/lib/google-sheets';

const sql = neon(process.env.DATABASE_URL);

export async function POST() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY)
    return NextResponse.json({ error: 'Google credentials not configured' }, { status: 500 });

  try {
    await syncAll(sql);
    return NextResponse.json({ success: true, message: 'All tabs synced to Google Sheets' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
