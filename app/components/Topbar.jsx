'use client';
import { usePathname } from 'next/navigation';

const TITLES = {
  '/':               'Dashboard',
  '/all-tasks':      'All Tasks',
  '/approvals':      'Approvals',
  '/users':          'Users',
  '/mis':            'MIS Report',
  '/masters':        'Checklists',
  '/fms':            'FMS Master',
  '/profile':        'Profile',
  '/leave-tracker':  'Leave Tracker',
  '/daily-reports':  'Daily Reports',
  '/meetings':       'Meetings',
  '/client-master':  'Client Master',
  '/daily-task':     'Daily Task',
  '/race-tracker':   'Race Tracker',
  '/compliance':     'Compliance',
};

export default function Topbar() {
  const pathname = usePathname();
  const title = TITLES[pathname] || '';
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <header className="sticky top-0 z-20 backdrop-blur-sm"
      style={{ background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid #e2e8f0' }}>
      <div className="px-6 lg:px-8 h-14 flex items-center gap-4">

        <h1 className="text-[15px] font-semibold tracking-tight truncate whitespace-nowrap text-slate-800">
          {title}
        </h1>

        <div className="flex-1" />

        <div className="hidden xl:flex items-center text-[12px] whitespace-nowrap text-slate-400">
          <svg className="w-3.5 h-3.5 mr-1.5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          {today}
        </div>

      </div>
    </header>
  );
}
