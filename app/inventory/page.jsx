import { Suspense } from 'react';
import InventoryClient from './InventoryClient';

export const dynamic = 'force-dynamic';

export default function InventoryPage() {
  // Suspense boundary because InventoryClient reads useSearchParams() (the
  // ?tab= deep link) — required by Next.js so that read doesn't bail the
  // whole route out of static optimization.
  return (
    <Suspense fallback={null}>
      <InventoryClient />
    </Suspense>
  );
}
