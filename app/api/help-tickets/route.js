import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import { listTickets, createTicket, PRIORITIES } from '@/lib/helpTickets';

// List. A non-admin sees only their own — raised by them or assigned to them.
// The scope is applied inside listTickets(), against the session id, so a
// crafted query string can't widen it.
export async function GET(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const sp = new URL(req.url).searchParams;
    const data = await listTickets({
      viewerId: user.id,
      isAdmin: isAdminRoles(user.roles),
      status: sp.get('status') || '',
      priority: sp.get('priority') || '',
      assigneeId: sp.get('assignee') || '',
      from: sp.get('from') || '',
      to: sp.get('to') || '',
      q: sp.get('q') || '',
      page: sp.get('page'),
      pageSize: sp.get('pageSize'),
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Raise a ticket — any signed-in user.
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const subject = String(body.subject || '').trim();
    if (!subject) return NextResponse.json({ error: 'subject required' }, { status: 400 });

    const priority = PRIORITIES.includes(body.priority) ? body.priority : 'Medium';
    // raised_by_id is the session's id, never the body's: the form doesn't ask
    // who you are, and it wouldn't be believed if it did.
    const id = await createTicket({
      subject: subject.slice(0, 255),
      description: String(body.description || '').trim(),
      // category is VARCHAR(128) — the UI's dropdown never sends anything
      // close to that, but a direct API call could and would otherwise throw
      // a raw DB error message back at the caller.
      category: String(body.category || '').trim().slice(0, 128),
      priority,
      raisedById: user.id,
    });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
