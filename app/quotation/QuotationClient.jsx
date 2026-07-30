'use client';
import BangaloreForm from './BangaloreForm';
import HyderabadForm from './HyderabadForm';

export default function QuotationClient({ branch, initialRef }) {
  return branch === 'bangalore'
    ? <BangaloreForm key={'b' + initialRef} initialRef={initialRef} />
    : <HyderabadForm key={'h' + initialRef} initialRef={initialRef} />;
}
