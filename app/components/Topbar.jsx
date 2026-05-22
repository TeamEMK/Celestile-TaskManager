'use client';
import { usePathname } from 'next/navigation';

const TITLES = {
  '/':          { title: 'Dashboard',     sub: 'Operations overview' },
  '/all-tasks': { title: 'All Tasks',     sub: 'Track and update assignments' },
  '/approvals': { title: 'Approvals',     sub: 'Review pending requests' },
  '/users':     { title: 'Users',         sub: 'Manage team members and roles' },
  '/mis':       { title: 'MIS Report',    sub: 'Generate management reports' },
  '/masters':   { title: 'Checklists',    sub: 'Recurring tasks library' },
  '/fms':       { title: 'FMS Master',    sub: 'Campaign workflow tracking' },
  '/profile':   { title: 'Profile',       sub: 'Account and notification settings' },
};

export default function Topbar() {
  const pathname = usePathname();
  const meta = TITLES[pathname] || { title: '', sub: '' };
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-slate-200/70">
      <div className="px-6 lg:px-8 h-16 flex items-center gap-4">
        {/* Title block (single row, no wrapping) */}
        <div className="min-w-0 flex items-baseline gap-3 whitespace-nowrap">
          <h1 className="text-[18px] font-semibold tracking-tight text-slate-900 truncate">{meta.title}</h1>
          <span className="hidden lg:inline text-[12.5px] text-slate-400 truncate">{meta.sub}</span>
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 w-64 lg:w-80 rounded-lg bg-slate-100/80 border border-transparent focus-within:bg-white focus-within:border-slate-200">
          <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input placeholder="Search tasks, clients, users…" className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          <kbd className="hidden xl:inline text-[10px] font-medium text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5 shrink-0">⌘K</kbd>
        </div>

        <div className="hidden xl:flex items-center text-[12px] text-slate-500 whitespace-nowrap">
          <svg className="w-4 h-4 mr-1.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          {today}
        </div>

        {/* Notifications */}
        <button className="relative w-9 h-9 grid place-items-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 shrink-0">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"></span>
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2 pl-3 ml-1 border-l border-slate-200 shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-pink-500 grid place-items-center text-white font-semibold text-sm">TS</div>
          <div className="hidden lg:block leading-tight">
            <div className="text-[13px] font-semibold text-slate-800">Tushar S.</div>
            <div className="text-[11px] text-slate-500">Admin</div>
          </div>
        </div>
      </div>
    </header>
  );
}
