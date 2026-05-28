'use client';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

const TITLES = {
  '/':          'Dashboard',
  '/all-tasks': 'All Tasks',
  '/approvals': 'Approvals',
  '/users':     'Users',
  '/mis':       'MIS Report',
  '/masters':   'Checklists',
  '/fms':       'FMS Master',
  '/profile':   'Profile',
};

export default function Topbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const title    = TITLES[pathname] || '';
  const today    = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const userName = session?.user?.name || 'User';
  const userRole = session?.user?.roles?.[0] || 'User';
  const initials = userName.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'U';

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="px-6 lg:px-8 h-16 flex items-center gap-4">
        {/* Title */}
        <h1 className="text-[17px] font-semibold tracking-tight text-slate-900 truncate whitespace-nowrap">{title}</h1>

        <div className="flex-1" />

        {/* Date */}
        <div className="hidden xl:flex items-center text-[12px] text-slate-500 whitespace-nowrap">
          <svg className="w-4 h-4 mr-1.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          {today}
        </div>

        {/* Avatar + Logout */}
        <div className="flex items-center gap-2 pl-3 ml-1 border-l border-slate-200 shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-pink-500 grid place-items-center text-white font-semibold text-sm shrink-0">
            {initials}
          </div>
          <div className="hidden lg:block leading-tight">
            <div className="text-[13px] font-semibold text-slate-800">{userName}</div>
            <div className="text-[11px] text-slate-500">{userRole}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Logout"
            className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition ml-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
