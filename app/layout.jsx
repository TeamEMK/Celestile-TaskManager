import './globals.css';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Providers from './components/Providers';

export const metadata = {
  title: 'Indian Automotive · ERP',
  description: 'FMS & Checklist Operations Platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
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
        </Providers>
      </body>
    </html>
  );
}