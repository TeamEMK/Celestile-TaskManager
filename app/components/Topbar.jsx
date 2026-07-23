'use client';
import { usePathname } from 'next/navigation';

const TITLES = {
  '/':               'Dashboard',
  '/all-tasks':      'All Tasks',
  '/approvals':      'Approvals',
  '/users':          'Users',
  '/mis':            'MIS Report',
  '/masters':        'Checklists',
  '/fms':            'FMS Admin',
  '/fms-view':       'FMS Tracker',
  '/profile':        'Profile',
  '/leave-tracker':  'Leave Tracker',
  '/daily-reports':  'Daily Reports',
  '/meetings':       'Meetings',
  '/client-master':  'Client Master',
  '/daily-task':     'Daily Task',
  '/race-tracker':   'Race Tracker',
  '/compliance':     'Compliance',
};

export default function Topbar({ onMenuClick = () => {} }) {
  const pathname = usePathname();
  const title = TITLES[pathname] || '';
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <header className="sticky top-0 z-20 backdrop-blur-md"
      style={{ background: 'rgba(251,247,240,0.85)', borderBottom: '1px solid rgba(185,111,61,0.14)' }}>
      <div className="px-4 lg:px-8 h-14 flex items-center gap-3 lg:gap-4">

        <button onClick={onMenuClick} aria-label="Open menu"
          className="md:hidden -ml-1 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition shrink-0">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </button>

        <h1 className="font-display text-[16.5px] font-semibold tracking-tight truncate whitespace-nowrap text-slate-900">
          {title}
        </h1>

        <div className="flex-1" />

        <div className="hidden xl:flex items-center text-[12px] whitespace-nowrap text-slate-400">
          <svg className="w-3.5 h-3.5 mr-1.5 text-primary-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          {today}
        </div>

      </div>
    </header>
  );
}
