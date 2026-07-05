import { requireAdmin } from '@/lib/guards';

export const dynamic = 'force-dynamic';

const IDEAS = [
  {
    label: 'Document expiry',
    desc: 'Licences, certificates, contracts with renewal dates',
    icon: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />,
  },
  {
    label: 'Audit checklist',
    desc: 'Periodic items with due dates and evidence',
    icon: <path d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  },
  {
    label: 'Training records',
    desc: 'Per-user training completion and expiry',
    icon: <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5Zm4 2v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5" />,
  },
  {
    label: 'Statutory filings',
    desc: 'GST / PF / ESI / TDS due dates and status',
    icon: <path d="M8 2v4M16 2v4M3.5 9h17M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  },
];

export default async function CompliancePage() {
  await requireAdmin();
  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="page-title">Compliance</h1>
        <p className="page-sub">Licences, audits, training and statutory filings — in one place.</p>
      </div>
      <div className="card p-8 sm:p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary-50 text-primary-600 grid place-items-center mx-auto mb-4">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z" />
          </svg>
        </div>
        <h2 className="section-title mb-2">Compliance module not configured yet</h2>
        <p className="text-[13px] text-slate-500 max-w-md mx-auto">
          To wire this up, please share what you want to track here. Common shapes are:
        </p>
        <div className="mt-4 grid sm:grid-cols-2 gap-2.5 max-w-xl mx-auto text-left">
          {IDEAS.map((item) => (
            <div key={item.label} className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-100 bg-slate-50/60">
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-primary-600 grid place-items-center shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
              </div>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-slate-800">{item.label}</div>
                <div className="text-[11.5px] text-slate-500 mt-0.5">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-slate-400 mt-5">
          Tell us which one (or a mix) and we&apos;ll wire up the schema, API and UI.
        </p>
      </div>
    </div>
  );
}
