export const dynamic = 'force-dynamic';

export default function CompliancePage() {
  return (
    <div className="space-y-4">
      <h1 className="page-title">Compliance</h1>

      <div className="card p-8 text-center">
        <div className="text-5xl mb-3">🛡️</div>
        <div className="text-[16px] font-semibold text-slate-800 mb-2">
          Compliance module not configured yet
        </div>
        <p className="text-[13px] text-slate-500 max-w-md mx-auto">
          To wire this up, please share what you want to track here. Common shapes are:
        </p>
        <ul className="text-[12.5px] text-slate-600 mt-3 inline-block text-left list-disc list-inside space-y-1">
          <li><b>Document expiry</b> — licences, certificates, contracts with renewal dates</li>
          <li><b>Audit checklist</b> — periodic items with due dates and evidence</li>
          <li><b>Training records</b> — per-user training completion + expiry</li>
          <li><b>Statutory filings</b> — GST / PF / ESI / TDS due dates and status</li>
        </ul>
        <p className="text-[12px] text-slate-400 mt-4">
          Tell us which one (or a mix) and we&apos;ll wire up the schema, API and UI.
        </p>
      </div>
    </div>
  );
}
