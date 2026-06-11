import { requireAdmin } from '@/lib/guards';
import QuotationAdminClient from './QuotationAdminClient';

export const dynamic = 'force-dynamic';

export default async function QuotationAdminPage() {
  await requireAdmin();
  return <QuotationAdminClient />;
}
