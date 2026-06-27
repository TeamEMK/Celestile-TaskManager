'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import BangaloreForm from './BangaloreForm';
import HyderabadForm from './HyderabadForm';

const BRANCHES = [
  { id: 'bangalore', label: 'Bangalore' },
  { id: 'hyderabad', label: 'Hyderabad' },
];

export default function QuotationClient() {
  const { data: session } = useSession();
  const profileBranch = (session?.user?.branch || '').toLowerCase();

  const [branch, setBranch] = useState('bangalore');
  const [initialRef, setInitialRef] = useState('');

  // Set branch: URL param wins (deep-link from admin panel), else user's profile branch.
  // Re-runs when profileBranch loads so session delay doesn't leave wrong default.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const urlBranch = p.get('branch');
    const r = p.get('ref');
    if (urlBranch === 'hyderabad' || urlBranch === 'bangalore') {
      setBranch(urlBranch);
    } else if (profileBranch === 'bangalore' || profileBranch === 'hyderabad') {
      setBranch(profileBranch);
    }
    if (r) setInitialRef(r);
  }, [profileBranch]);

  const branchLocked = profileBranch === 'bangalore' || profileBranch === 'hyderabad';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[16px] font-semibold text-slate-900">Quotation</div>
          <div className="text-[12px] text-slate-500 flex items-center gap-2">
            Celestile · The Home &amp; Bath Boutique
            {branchLocked && (
              <span className={`pill font-semibold ${branch === 'hyderabad' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                {branch === 'hyderabad' ? 'Hyderabad' : 'Bangalore'}
              </span>
            )}
          </div>
        </div>
        {/* Show branch toggle only for users without a locked branch */}
        {!branchLocked && (
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {BRANCHES.map((b) => (
              <button key={b.id} onClick={() => { setBranch(b.id); setInitialRef(''); }}
                className={`px-4 py-2 text-[13px] font-semibold transition-colors ${
                  branch === b.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}>
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {branch === 'bangalore'
        ? <BangaloreForm key={'b' + initialRef} initialRef={initialRef} />
        : <HyderabadForm key={'h' + initialRef} initialRef={initialRef} />}
    </div>
  );
}
