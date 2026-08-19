'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { FMS_ENABLED, RACE_TRACKER_ENABLED } from '@/lib/config';
import { canSee } from '@/lib/pages';
import { useEffect, useState } from 'react';
const Icon = {
  dashboard: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  tasks:     (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>,
  approve:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>,
  users:     (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  mis:       (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/></svg>,
  masters:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/></svg>,
  fms:       (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  live:      (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 18a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M8.5 14.5a5 5 0 0 1 7 0"/><path d="M5 11a9 9 0 0 1 14 0"/></svg>,
  profile:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  dailytask: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>,
  leave:     (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="M8 15h2M14 15h2"/></svg>,
  meetings:  (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  reports:      (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2v4H8zM13 11h2v6h-2z"/></svg>,
  clientmaster: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4 8 4v14M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1"/></svg>,
  race:         (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4"/><path d="M4 4h13l-2 4 2 4H4"/></svg>,
  compliance:   (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>,
  quote:        (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>,
  access:       (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  inventory:    (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7 12 3 4 7l8 4 8-4z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/></svg>,
};

const SECTIONS = [
  { title: 'Workspace', items: [
    { href: '/',          label: 'Dashboard', icon: 'dashboard' },
    { href: '/all-tasks', label: 'All Tasks', icon: 'tasks' },
    { href: '/approvals', label: 'Approvals', icon: 'approve' },
  ]},
  { title: 'Operations', items: [
    { href: '/fms',           label: 'FMS',           icon: 'fms',          flag: 'fms' },
    { href: '/live-tracking', label: 'Live Tracking', icon: 'live' },
    { href: '/masters',       label: 'Checklists',    icon: 'masters',      adminOnly: true, hidden: true },
    { href: '/client-master', label: 'Client Master', icon: 'clientmaster', adminOnly: true, hidden: true },
    { href: '/mis',           label: 'MIS Report',    icon: 'mis',          adminOnly: true },
    { href: '/race-tracker',  label: 'Race Tracker',  icon: 'race',         flag: 'race', adminOnly: true },
    { href: '/compliance',    label: 'Compliance',    icon: 'compliance',   adminOnly: true, hidden: true },
  ]},
  { title: 'Daily', items: [
    { href: '/daily-task',    label: 'Daily Task',            icon: 'dailytask' },
    { href: '/quotation',     label: 'Quotation',             icon: 'quote' },
    { href: '/inventory',     label: 'Stone Inventory Factory', icon: 'inventory' },
    { href: '/leave-tracker', label: 'Leave Tracker',         icon: 'leave',    hidden: true },
    { href: '/meetings',      label: 'Meetings',              icon: 'meetings', hidden: true },
    { href: '/daily-reports', label: 'Daily Reports',         icon: 'reports',  adminOnly: true },
  ]},
  { title: 'Administration', items: [
    { href: '/users',   label: 'Users & Access', icon: 'users',   adminOnly: true },
    { href: '/profile', label: 'Profile',        icon: 'profile' },
  ]},
];

export default function Sidebar({ mobileOpen = false, onClose = () => {}, expanded = false, onExpandChange = () => {} }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const roles = session?.user?.roles || [];
  const access = session?.user?.access;
  const isAdmin = roles.includes('Admin') || roles.includes('HOD');

  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      // Skip while the tab is backgrounded — this poll runs on every page for
      // every signed-in user, so a background tab was still hitting the API
      // (and, behind it, a DB query) every 15s for no visible benefit.
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/approvals/pending-count');
        if (!res.ok) return;
        const { count } = await res.json();
        setPendingCount(count);
      } catch {}
    };
    fetchCount();
    const t = setInterval(fetchCount, 20000);
    document.addEventListener('visibilitychange', fetchCount);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', fetchCount); };
  }, []);

  // On lg+ the rail expands on hover / keyboard focus. AppShell owns the state
  // so the page content shifts with it rather than being covered by it.
  const lgLabel = expanded ? 'lg:opacity-100' : 'lg:opacity-0';

  const visible = (n) =>
    !n.hidden &&
    (n.flag !== 'fms'  || FMS_ENABLED) &&
    (n.flag !== 'race' || RACE_TRACKER_ENABLED) &&
    (!n.adminOnly || isAdmin) &&
    canSee(n.href, roles, access);

  return (
    <>
      {/* Mobile backdrop — tap to close the drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        onMouseEnter={() => onExpandChange(true)}
        onMouseLeave={() => onExpandChange(false)}
        onFocus={() => onExpandChange(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) onExpandChange(false); }}
        className={`fixed left-0 top-0 h-screen flex flex-col z-40 overflow-hidden transition-all duration-200 ease-out
        w-[230px] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:w-[230px]
        ${expanded ? 'lg:w-[230px]' : 'lg:w-16'}`}
        style={{
          background: '#0B0B0C',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'none',
        }}>

      {/* Brand */}
      <div className="h-14 px-3 flex items-center gap-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(238,188,46,0.14)' }}>
        {/* Single logo icon — always visible */}
        <div className="relative w-9 h-9 rounded-lg shrink-0 overflow-hidden grid place-items-center"
          style={{ background: '#000000', border: '1px solid rgba(238,188,46,0.30)' }}>
          <img src="/logo.jpeg" alt="Celestile" className="w-9 h-9 object-contain" />
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2"
            style={{ background: '#34d399', borderColor: '#000000' }}></span>
        </div>
        {/* Brand name — fades in when sidebar expands */}
        <div className={`leading-tight min-w-0 opacity-100 md:opacity-100 ${lgLabel} transition-opacity duration-200 whitespace-nowrap`}>
          <div className="font-display text-[15px] font-semibold tracking-tight" style={{ color: '#FBEAB8' }}>Celestile</div>
          <div className="text-[9px] font-medium tracking-wide" style={{ color: '#6B7280' }}>Task Manager</div>
        </div>
        {/* Close button — mobile drawer only */}
        <button onClick={onClose} aria-label="Close menu"
          className="md:hidden ml-auto p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {SECTIONS.map((sec) => {
          const items = sec.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={sec.title} className="mb-1">
              <div className="px-2 space-y-0.5">
                {items.map((n) => {
                  const active   = pathname === n.href;
                  const IconComp = Icon[n.icon];

                  return (
                    <Link key={n.href} href={n.href} title={n.label} onClick={onClose}
                      className={`group/item flex items-center gap-3 h-10 px-2.5 rounded-lg text-[14px] relative transition-colors duration-150 ${active ? 'font-bold' : 'font-medium'}`}
                      style={{
                        background: active ? 'rgba(238,188,46,0.18)' : 'transparent',
                        color: active ? '#FBEAB8' : '#D4D4D4',
                      }}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; } }}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                          style={{ background: '#EEBC2E' }} />
                      )}
                      <span className="relative shrink-0">
                        <IconComp className="w-[17px] h-[17px]"
                          style={{ color: active ? '#F3C955' : 'inherit' }} />
                        {n.href === '/approvals' && pendingCount > 0 && (
                          <span
                            className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] font-bold text-black flex items-center justify-center"
                            style={{ background: '#EEBC2E', boxShadow: '0 0 0 2px #000000' }}
                          >
                            {pendingCount}
                          </span>
                        )}
                      </span>
                      <span className={`whitespace-nowrap opacity-100 md:opacity-100 ${lgLabel} transition-opacity duration-200`}>
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
      <div className="px-2 pb-3 pt-2 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg transition-colors duration-150"
          style={{ cursor: 'default' }}>
          <div className="w-8 h-8 rounded-full grid place-items-center text-white/80 font-semibold text-[11px] shrink-0"
            style={{ background: 'rgba(255,255,255,0.10)' }}>
            {session?.user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
          </div>
          <div className={`min-w-0 flex-1 opacity-100 md:opacity-100 ${lgLabel} transition-opacity duration-200`}>
            <div className="text-[12px] font-medium truncate whitespace-nowrap" style={{ color: '#F5F5F5' }}>{session?.user?.name || 'User'}</div>
            <div className="text-[10px] truncate whitespace-nowrap" style={{ color: '#6B7280' }}>
              {session?.user?.roles?.join(' · ') || 'User'}
              {session?.user?.branch && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                  style={{ background: session.user.branch === 'hyderabad' ? 'rgba(124,58,237,0.2)' : 'rgba(5,150,105,0.2)',
                           color:      session.user.branch === 'hyderabad' ? '#a78bfa' : '#34d399' }}>
                  {session.user.branch === 'hyderabad' ? 'HYD' : 'BNG'}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Sign out"
            aria-label="Sign out"
            className={`p-1 rounded-md opacity-100 md:opacity-100 ${expanded ? 'lg:opacity-100' : 'lg:opacity-50'} transition-all duration-200`}
            style={{ color: '#A3A3A3' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(220,38,38,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#A3A3A3'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
