import { NextResponse } from 'next/server';
import { sendWhatsApp, delegationMessage, isWhatsappConfigured, formatNumber } from '@/lib/whatsapp';

// Quick WhatsApp tester — send a sample "task delegated" message without
// creating a real delegation.
//   GET /api/whatsapp-test?secret=<DEVELOPER_SECRET>&to=<phone>&name=<doer>
export async function GET(req) {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== process.env.DEVELOPER_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const to = url.searchParams.get('to');
  if (!to) return NextResponse.json({ error: 'pass ?to=<phone number>' }, { status: 400 });

  if (!isWhatsappConfigured())
    return NextResponse.json({ error: 'Maytapi not configured — set MAYTAPI_PRODUCT_ID / MAYTAPI_PHONE_ID / MAYTAPI_TOKEN' }, { status: 400 });

  const message = delegationMessage({
    doerName: url.searchParams.get('name') || 'Test User',
    byName: 'Admin',
    dueDate: '2026-06-08',
    priority: 'URGENT',
    approval: 'Approval Required',
    description: 'This is a test WhatsApp message from Celestile-TaskManager.',
  });

  const result = await sendWhatsApp(to, message);
  return NextResponse.json({ formattedNumber: formatNumber(to), message, result });
}
