'use client';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import QuotationClient from './QuotationClient';
import QuotationAdminClient from '../quotation-admin/QuotationAdminClient';

const BRANCHES = [
  { id: 'bangalore', label: 'Bangalore' },
  { id: 'hyderabad', label: 'Hyderabad' },
];

function PageTabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: '#f1f5f9' }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="px-5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150"
          style={active === t.id
            ? { background: '#fff', color: '#0f172a', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }
            : { color: '#64748b' }
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function QuotationPage() {
  const { data: session } = useSession();
  const roles = session?.user?.roles || [];
  const rolesArr = Array.isArray(roles) ? roles : String(roles).split(',').map(r => r.trim());
  const isAdmin = rolesArr.includes('Admin') || rolesArr.includes('HOD');
  const profileBranch = (session?.user?.branch || '').toLowerCase();

  const [tab, setTab] = useState('form');
  const [branch, setBranch] = useState('bangalore');
  const [initialRef, setInitialRef] = useState('');

  // Set branch: URL param wins, else user's profile branch.
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

  const tabs = [
    { id: 'form',  label: 'Form' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin View' }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageTabs tabs={tabs} active={tab} onChange={setTab} />
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
      {tab === 'form'  && <QuotationClient branch={branch} initialRef={initialRef} />}
      {tab === 'admin' && isAdmin && <QuotationAdminClient />}
    </div>
  );
}
