'use client';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import QuotationClient from './QuotationClient';
import QuotationAdminClient from '../quotation-admin/QuotationAdminClient';

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

  const [tab, setTab] = useState('form');

  const tabs = [
    { id: 'form',  label: 'Form' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin View' }] : []),
  ];

  return (
    <div className="space-y-4">
      <PageTabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'form'  && <QuotationClient />}
      {tab === 'admin' && isAdmin && <QuotationAdminClient />}
    </div>
  );
}
