import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { syncAll } from '@/lib/google-sheets';
import { sql } from '@/lib/mysql-sql';
import { getGoogleCredentials } from '@/lib/googleCreds';
import { requireAdmin } from '@/lib/api';

// Admin-only. This had no guard of any kind, and syncAll() copies every table
// in the database out to a Google Sheet — an unauthenticated POST from anyone
// who knew the path could both trigger the export and hammer the Sheets quota.
export async function POST() {
  const gate = await requireAdmin(); if (gate) return gate;

  const { client_email, private_key } = getGoogleCredentials();
  if (!client_email || !private_key)
    return NextResponse.json({ error: 'Google credentials not configured' }, { status: 500 });
  if (!process.env.SYNC_SHEET_ID)
    return NextResponse.json({ error: 'SYNC_SHEET_ID not configured' }, { status: 500 });

  try {
    await ensureSchema();
    await syncAll(sql);
    return NextResponse.json({ success: true, message: 'All tabs synced to Google Sheets' });
  } catch (err) {
    console.error('[sync-sheets POST]', err.message);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
