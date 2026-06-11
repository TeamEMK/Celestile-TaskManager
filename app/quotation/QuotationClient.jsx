'use client';
import { useState } from 'react';
import BangaloreForm from './BangaloreForm';

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

      {branch === 'bangalore' ? (
        <BangaloreForm />
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-[13px] font-semibold text-amber-800">Hyderabad form — coming next</div>
          <div className="text-[12px] text-amber-700/80 mt-1 leading-relaxed">
            The backend (save / load / revisions / WhatsApp) already supports Hyderabad. The editable
            Hyderabad form (Client Firm, PAN, Transport, Fixing Items, Design Fees, Installation Charges)
            will be added once its source is ported — same calculation-faithful approach as Bangalore.
          </div>
        </div>
      )}
    </div>
  );
}
