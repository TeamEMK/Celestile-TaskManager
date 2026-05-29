import './globals.css';
import Providers from './components/Providers';
import AppShell from './components/AppShell';

export const metadata = {
  title: 'Indian Automotive · ERP',
  description: 'FMS & Checklist Operations Platform',
  icons: { icon: '/logo.png', apple: '/logo.png' },
};

export default function RootLayout({ children }) {
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