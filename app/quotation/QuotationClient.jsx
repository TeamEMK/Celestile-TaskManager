'use client';
import { useEffect, useState } from 'react';

const BRANCHES = [
  { id: 'bangalore', label: 'Bangalore' },
  { id: 'hyderabad', label: 'Hyderabad' },
];

export default function QuotationClient() {
  const [branch, setBranch] = useState('bangalore');
  const [refs, setRefs] = useState([]);
  const [nextRef, setNextRef] = useState('—');
  const [loading, setLoading] = useState(false);

  async function load(b) {
    setLoading(true);
    try {
      const [listRes, nextRes] = await Promise.all([
        fetch(`/api/quotations?branch=${b}`),
        fetch(`/api/quotations/next-ref?branch=${b}`),
      ]);
      const list = await listRes.json();
      const next = await nextRes.json();
      setRefs(Array.isArray(list?.refs) ? list.refs : []);
      setNextRef(next?.refNo || '—');
    } catch {
      setRefs([]); setNextRef('—');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(branch); }, [branch]);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-[15px] font-semibold text-slate-900">Quotation</div>
            <div className="text-[12px] text-slate-500">Celestile · The Home &amp; Bath Boutique</div>
          </div>
          {/* Branch switch */}
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

        <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
          <span className="text-[12px] text-slate-500">Next Ref No.</span>
          <span className="pill bg-amber-50 text-amber-700 font-bold">{nextRef}</span>
        </div>
      </div>

      <div className="card p-5">
        <div className="text-[14px] font-semibold text-slate-900 mb-3">
          Saved Quotations — {BRANCHES.find((b) => b.id === branch)?.label}
        </div>
        {loading ? (
          <p className="text-[12.5px] text-slate-400">Loading…</p>
        ) : refs.length === 0 ? (
          <p className="text-[12.5px] text-slate-400">No quotations saved yet for this branch.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {refs.map((r) => (
              <span key={r} className="pill bg-primary-50 text-primary-700">{r}</span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="text-[13px] font-semibold text-amber-800">⚙️ Editable quotation form — in progress</div>
        <div className="text-[12px] text-amber-700/80 mt-1 leading-relaxed">
          The data layer (save / load / revisions / per-branch WhatsApp on revision) and both branch
          schemas (Bangalore: charges &amp; totals · Hyderabad: fixing items, design fees, installation)
          are wired. The line-item editor with live Amount/GST/totals/grand-total calculation is being
          ported next — its math is replicated exactly from the original to keep figures correct.
        </div>
      </div>
    </div>
  );
}
