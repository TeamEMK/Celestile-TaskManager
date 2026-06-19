'use client';
import { useState } from 'react';
import UsersClient from './UsersClient';
import AccessClient from '../access/AccessClient';

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

const TABS = [
  { id: 'users',  label: 'Users' },
  { id: 'access', label: 'Access' },
];

export default function UsersPage() {
  const [tab, setTab] = useState('users');

  return (
    <div className="space-y-4">
      <PageTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'users'  && <UsersClient />}
      {tab === 'access' && <AccessClient />}
    </div>
  );
}
