import './globals.css';
import { headers } from 'next/headers';
import Providers from './components/Providers';
import AppShell from './components/AppShell';
import { isAccessEnabled } from '@/lib/access';

export const metadata = {
  title: 'Manpur Patrol Pump',
  description: 'FMS & Checklist Operations Platform',
  icons: { icon: '/logo.png', apple: '/logo.png' },
};

export default async function RootLayout({ children }) {
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') || '';
  const isDeveloperPath = pathname.startsWith('/developer');

  if (!isDeveloperPath) {
    const enabled = await isAccessEnabled();
    if (!enabled) {
      return (
        <html lang="en">
          <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
            <div style={{
              minHeight: '100vh', display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: '24px',
            }}>
              <div style={{
                background: '#fff', borderRadius: '20px', padding: '48px 40px',
                textAlign: 'center', maxWidth: '420px', width: '100%',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9',
              }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '16px',
                  background: '#fef2f2', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 20px',
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                    stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', margin: '0 0 10px' }}>
                  Service Suspended
                </h1>
                <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 28px', lineHeight: '1.6' }}>
                  Your subscription has been paused. Please contact your service provider to restore access.
                </p>
                <div style={{
                  background: '#f8fafc', borderRadius: '10px', padding: '14px 18px',
                  fontSize: '13px', color: '#94a3b8',
                }}>
                  📧 akhileshvyas@e-marketingtech.in
                </div>
              </div>
            </div>
          </body>
        </html>
      );
    }
  }

  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
