import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export async function POST(req) {
  try {
    const { masterId, doer } = await req.json();
    if (!masterId) return NextResponse.json({ error: 'masterId required' }, { status: 400 });

    const count = await sql`SELECT COUNT(*) FROM checklist_completions`;
    const id = 'CC' + (Number(count[0].count) + 1).toString().padStart(3, '0');

    await sql`
      INSERT INTO checklist_completions (id, master_id, doer, completed_at, date)
      VALUES (${id}, ${masterId}, ${doer || ''}, NOW(), CURRENT_DATE)
    `;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const completions = await sql`
    SELECT * FROM checklist_completions ORDER BY completed_at DESC
  `;
  return NextResponse.json(completions);
}