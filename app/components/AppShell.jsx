'use client';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { data: session, update } = useSession();

  useEffect(() => {
    if (session?.error === 'ForceLogout') {
      signOut({ callbackUrl: '/login' });
      return;
    }
    // Force session refresh every 20s as failsafe
    const t = setInterval(() => update(), 20000);
    return () => clearInterval(t);
  }, [session, update]);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="ml-16 flex flex-col min-h-screen">
        <Topbar />
        <main className="flex-1 p-4 lg:p-6">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
