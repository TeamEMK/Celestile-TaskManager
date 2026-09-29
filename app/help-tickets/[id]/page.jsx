import TicketDetailClient from './TicketDetailClient';

export const dynamic = 'force-dynamic';

export default async function HelpTicketPage({ params }) {
  const { id } = await params;
  // Everything about this ticket — including whether this user may see it at
  // all — comes from GET /api/help-tickets/[id], which checks the session
  // against the ticket. The page itself decides nothing.
  return <TicketDetailClient ticketId={id} />;
}
