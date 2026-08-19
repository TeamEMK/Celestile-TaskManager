import { requireUser, requireAdmin, json, fail } from '@/lib/api';
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment, seedDepartments,
} from '@/lib/production';

// Reading the department list is what builds the entry form, so any signed-in
// user needs it; changing the shape of the report is admin-only.
export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const includeInactive = new URL(req.url).searchParams.get('all') === '1';
    // First load of the module seeds the departments the factory already runs,
    // so nobody has to type eight of them in before entering a single row.
    await seedDepartments();
    return json(await listDepartments({ includeInactive }));
  } catch (err) {
    return fail(err.message, 500);
  }
}

export async function POST(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const body = await req.json();
    if (!body.name?.trim()) return fail('Department name is required');
    const id = await createDepartment(body);
    return json({ id });
  } catch (err) {
    return fail(err.message, 500);
  }
}

export async function PUT(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const body = await req.json();
    if (!body.id) return fail('id is required');
    await updateDepartment(body.id, body);
    return json({ success: true });
  } catch (err) {
    return fail(err.message, 500);
  }
}

export async function DELETE(req) {
  const gate = await requireAdmin(); if (gate) return gate;
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return fail('id is required');
    return json(await deleteDepartment(id));
  } catch (err) {
    return fail(err.message, 500);
  }
}
