'use client';
import { useState } from 'react';
import BangaloreForm from './BangaloreForm';
import HyderabadForm from './HyderabadForm';

const BRANCHES = [
  { id: 'bangalore', label: 'Bangalore' },
  { id: 'hyderabad', label: 'Hyderabad' },
];

export default function QuotationClient() {
  const [branch, setBranch] = useState('bangalore');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[16px] font-semibold text-slate-900">Quotation</div>
          <div className="text-[12px] text-slate-500">Celestile · The Home &amp; Bath Boutique</div>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {BRANCHES.map((b) => (
            <button key={b.id} onClick={() => setBranch(b.id)}
              className={`px-4 py-2 text-[13px] font-semibold transition-colors ${
                branch === b.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {branch === 'bangalore' ? <BangaloreForm /> : <HyderabadForm />}
    </div>
  );
}
