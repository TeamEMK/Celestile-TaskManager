import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import { listMaterials, addMaterial } from '@/lib/imsSheet';

// Material + thickness master = the IMS spreadsheet's "Stone Name" tab, the
// same list the old Inward form's dropdowns read from.

export async function GET() {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const rows = await listMaterials();
    const set = new Set();
    const thicknessMap = {};
    rows.forEach(({ material, thickness }) => {
      set.add(material);
      if (!thicknessMap[material]) thicknessMap[material] = [];
      if (thickness && !thicknessMap[material].includes(thickness)) thicknessMap[material].push(thickness);
    });
    return NextResponse.json({ materials: Array.from(set).sort(), thicknessMap });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    let { material, thickness } = await req.json();
    material = String(material || '').trim();
    thickness = String(thickness || '').trim();
    if (!material || !thickness) return NextResponse.json({ error: 'Material and thickness required' }, { status: 400 });
    if (!/mm$/i.test(thickness)) thickness = thickness.replace(/[^0-9]/g, '') + 'MM';
    else thickness = thickness.toUpperCase();

    // de-dup exact pair (case-insensitively — the sheet is hand-edited)
    const rows = await listMaterials();
    const exists = rows.some((r) =>
      r.material.toLowerCase() === material.toLowerCase() &&
      r.thickness.toLowerCase() === thickness.toLowerCase());
    if (!exists) await addMaterial(material, thickness);

    return NextResponse.json({ ok: true, material, thickness });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
