import { requireUser, json, fail } from '@/lib/api';
import { fieldSuggestions, lastBlock } from '@/lib/production';

// Everything the entry form needs to spare the floor from typing:
// what this department has entered before, and its last filled block.
export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const q = new URL(req.url).searchParams;
    const departmentId = q.get('departmentId') || '';
    if (!departmentId) return fail('departmentId is required');

    const before = q.get('before');
    if (before) {
      return json(await lastBlock({ departmentId, shift: q.get('shift') || '', before }));
    }
    return json(await fieldSuggestions({ departmentId }));
  } catch (err) {
    return fail(err.message, 500);
  }
}
