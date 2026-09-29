import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/api';
import { isAdminRoles } from '@/lib/pages';
import {
  getTicketRow, addComment, listEvents, canViewTicket, canCommentTicket,
} from '@/lib/helpTickets';

// Add to the thread. The raiser, the assignee or an admin — checked against
// this ticket, not just "is signed in".
export async function POST(req, { params }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const isAdmin = isAdminRoles(user.roles);
    const row = await getTicketRow(id);
    if (!row || !canViewTicket(row, user.id, isAdmin)) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    if (!canCommentTicket(row, user.id, isAdmin)) {
      return NextResponse.json({ error: 'Not allowed to comment on this ticket' }, { status: 403 });
    }

    const body = await req.json();
    const text = String(body.body || '').trim();
    if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 });

    await addComment(id, user.id, text);
    return NextResponse.json({ success: true, events: await listEvents(id) }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
