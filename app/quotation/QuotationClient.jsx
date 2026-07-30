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
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <IconQuote className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[16px] font-semibold tracking-tight text-slate-900">Quotation</h1>
            <div className="text-[11.5px] text-slate-500 flex items-center gap-2 flex-wrap">
              Celestile · The Home &amp; Bath Boutique
              {branchLocked && (
                <span className={`pill font-semibold ${branch === 'hyderabad' ? 'bg-violet-100 text-violet-700' : 'bg-primary-100 text-primary-700'}`}>
                  {branch === 'hyderabad' ? 'Hyderabad' : 'Bangalore'}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Show branch toggle only for users without a locked branch */}
        {!branchLocked && (
          <div className="seg">
            {BRANCHES.map((b) => (
              <button key={b.id} onClick={() => { setBranch(b.id); setInitialRef(''); }}
                className={`seg-btn ${branch === b.id ? 'seg-btn-active' : ''}`}>
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

function IconQuote(props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 7.5c-2.5 0-4 1.8-4 4.2 0 2.1 1.5 3.6 3.4 3.6.4 2.4-1 4.4-3.4 5.2" />
      <path d="M18 7.5c-2.5 0-4 1.8-4 4.2 0 2.1 1.5 3.6 3.4 3.6.4 2.4-1 4.4-3.4 5.2" />
    </svg>
  );
}
