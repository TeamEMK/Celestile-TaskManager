import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { requireUser } from '@/lib/api';

const uid = () => 'SM' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    const [rows] = await pool.query('SELECT material, thickness FROM stone_master');
    const set = new Set();
    const thicknessMap = {};
    rows.forEach((r) => {
      const m = String(r.material || '').trim();
      const t = String(r.thickness || '').trim();
      if (!m) return;
      set.add(m);
      if (!thicknessMap[m]) thicknessMap[m] = [];
      if (t && !thicknessMap[m].includes(t)) thicknessMap[m].push(t);
    });
    return NextResponse.json({ materials: Array.from(set).sort(), thicknessMap });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    await ensureSchema();
    let { material, thickness } = await req.json();
    material = String(material || '').trim();
    thickness = String(thickness || '').trim();
    if (!material || !thickness) return NextResponse.json({ error: 'Material and thickness required' }, { status: 400 });
    if (!/mm$/i.test(thickness)) thickness = thickness.replace(/[^0-9]/g, '') + 'MM';
    else thickness = thickness.toUpperCase();

    // de-dup exact pair
    const [ex] = await pool.query('SELECT id FROM stone_master WHERE material = ? AND thickness = ?', [material, thickness]);
    if (!ex.length) await pool.query('INSERT INTO stone_master (id, material, thickness) VALUES (?, ?, ?)', [uid(), material, thickness]);
    return NextResponse.json({ ok: true, material, thickness });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
