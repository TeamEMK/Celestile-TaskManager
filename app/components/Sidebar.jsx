'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { FMS_ENABLED, RACE_TRACKER_ENABLED } from '@/lib/config';
import { useEffect, useState } from 'react';
const Icon = {
  dashboard: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  tasks:     (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>,
  approve:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>,
  users:     (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  mis:       (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/></svg>,
  masters:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/></svg>,
  fms:       (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  profile:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  dailytask: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>,
  leave:     (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="M8 15h2M14 15h2"/></svg>,
  meetings:  (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  reports:      (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2v4H8zM13 11h2v6h-2z"/></svg>,
  clientmaster: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4 8 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1"/></svg>,
  race:         (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4"/><path d="M4 4h13l-2 4 2 4H4"/></svg>,
  compliance:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>,
};

const SECTIONS = [
  { title: 'Workspace', items: [
    { href: '/',          label: 'Dashboard', icon: 'dashboard' },
    { href: '/all-tasks', label: 'All Tasks', icon: 'tasks' },
    { href: '/approvals', label: 'Approvals', icon: 'approve' },
  ]},
  { title: 'Operations', items: [
    { href: '/fms',           label: 'FMS Master',    icon: 'fms',          flag: 'fms',  adminOnly: true },
    { href: '/masters',       label: 'Checklists',    icon: 'masters',      adminOnly: true, hidden: true },
    { href: '/client-master', label: 'Client Master', icon: 'clientmaster', adminOnly: true, hidden: true },
    { href: '/mis',           label: 'MIS Report',    icon: 'mis',          adminOnly: true },
    { href: '/race-tracker',  label: 'Race Tracker',  icon: 'race',         flag: 'race', adminOnly: true },
    { href: '/compliance',    label: 'Compliance',    icon: 'compliance',   adminOnly: true, hidden: true },
  ]},
  { title: 'Daily', items: [
    { href: '/daily-task',    label: 'Daily Task',    icon: 'dailytask', hidden: true },
    { href: '/leave-tracker', label: 'Leave Tracker', icon: 'leave',     hidden: true },
    { href: '/meetings',      label: 'Meetings',      icon: 'meetings',  hidden: true },
    { href: '/daily-reports', label: 'Daily Reports', icon: 'reports',   hidden: true },
  ]},
  { title: 'Administration', items: [
    { href: '/users',   label: 'Users',   icon: 'users',   adminOnly: true },
    { href: '/profile', label: 'Profile', icon: 'profile' },
  ]},
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = (session?.user?.roles || []).includes('Admin') || (session?.user?.roles || []).includes('HOD');

  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/approvals/pending-count');
        if (!res.ok) return;
        const { count } = await res.json();
        setPendingCount(count);
      } catch {}
    };
    fetchCount();
    const t = setInterval(fetchCount, 15000);
    return () => clearInterval(t);
  }, [isAdmin]);

  const visible = (n) =>
    !n.hidden &&
    (n.flag !== 'fms'  || FMS_ENABLED) &&
    (n.flag !== 'race' || RACE_TRACKER_ENABLED) &&
    (!n.adminOnly || isAdmin);

  return (
    <aside className="group/sb fixed left-0 top-0 h-screen w-16 hover:w-[230px] transition-[width] duration-200 ease-out flex flex-col z-40 overflow-hidden"
      style={{ background: '#09090b', borderRight: '1px solid #1c1c1f', boxShadow: '4px 0 24px rgba(0,0,0,0.5)' }}>

      {/* Brand */}
      <div className="h-14 px-3 flex items-center gap-2.5 shrink-0"
        style={{ borderBottom: '1px solid #1c1c1f' }}>
        {/* Single logo icon — always visible */}
        <div className="relative w-9 h-9 rounded-lg shrink-0 overflow-hidden grid place-items-center bg-white">
          <img src="/logo.png" alt="IA" className="w-9 h-9 object-contain" />
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2"
            style={{ background: '#34d399', borderColor: '#09090b' }}></span>
        </div>
        {/* Brand name — fades in when sidebar expands */}
        <div className="leading-tight min-w-0 opacity-0 group-hover/sb:opacity-100 transition-opacity duration-200 whitespace-nowrap">
          <div className="text-[13px] font-semibold tracking-tight" style={{ color: '#f4f4f5' }}>India Automotive</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {SECTIONS.map((sec) => {
          const items = sec.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={sec.title} className="mb-2">
              <div className="h-5 px-3 mb-0.5 text-[9px] font-semibold uppercase opacity-0 group-hover/sb:opacity-100 transition-opacity duration-200 whitespace-nowrap"
                style={{ letterSpacing: '0.14em', color: '#3f3f46' }}>
                {sec.title}
              </div>
              <div className="px-2 space-y-0.5">
                {items.map((n) => {
                  const active   = pathname === n.href;
                  const IconComp = Icon[n.icon];

                  return (
                    <Link key={n.href} href={n.href} title={n.label}
                      className="group/item flex items-center gap-3 h-9 px-2.5 rounded-lg text-[12.5px] font-medium relative transition-colors duration-150"
                      style={{
                        background: active ? 'rgba(46,114,181,0.14)' : 'transparent',
                        color: active ? '#f4f4f5' : '#52525b',
                      }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#a1a1aa'; } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#52525b'; } }}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                          style={{ background: '#2E72B5' }} />
                      )}
                      <span className="relative shrink-0">
                        <IconComp className="w-[17px] h-[17px]"
                          style={{ color: active ? '#5B9ED7' : 'inherit' }} />
                        {n.href === '/approvals' && isAdmin && pendingCount > 0 && (
                          <span
                            className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                            style={{ background: '#C4714A', boxShadow: '0 0 0 2px #09090b' }}
                          >
                            {pendingCount}
                          </span>
                        )}
                      </span>
                      <span className="whitespace-nowrap opacity-0 group-hover/sb:opacity-100 transition-opacity duration-200">
                        {n.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User card */}
      <div className="px-2 pb-3 pt-2 shrink-0" style={{ borderTop: '1px solid #1c1c1f' }}>
        <div className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg transition-colors duration-150"
          style={{ cursor: 'default' }}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-pink-500 grid place-items-center text-white font-bold text-[11px] shrink-0">
            {session?.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1 opacity-0 group-hover/sb:opacity-100 transition-opacity duration-200">
            <div className="text-[12px] font-medium truncate whitespace-nowrap" style={{ color: '#e4e4e7' }}>{session?.user?.name || 'User'}</div>
            <div className="text-[10px] truncate whitespace-nowrap" style={{ color: '#52525b' }}>{session?.user?.roles?.join(' · ') || 'User'}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Sign out"
            className="p-1 rounded-md opacity-0 group-hover/sb:opacity-100 transition-all duration-200"
            style={{ color: '#3f3f46' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(220,38,38,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#3f3f46'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
