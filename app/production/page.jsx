import { requireUser } from '@/lib/guards';
import ProductionClient from './ProductionClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Production Report — Celestile' };

export default async function ProductionPage() {
  await requireUser();
  return <ProductionClient />;
}
