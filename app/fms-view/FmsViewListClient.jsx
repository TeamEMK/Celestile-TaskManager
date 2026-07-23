'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useConfirmToast } from '../components/ConfirmToast';

export default function FmsViewListClient() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.roles?.includes('Admin') || session?.user?.roles?.includes('HOD');
  const { ask, ConfirmUI } = useConfirmToast();

  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const list = await fetch('/api/fms-view').then((r) => r.json()).catch(() => []);
    setSheets(Array.isArray(list) ? list : []);
    setLoading(false);
  }

  function deleteSheet(s) {
    ask(`Delete "${s.fms_name || s.sheet_name}"? Step config is removed — the Google Sheet itself is untouched.`, async () => {
      await fetch(`/api/fms/${s.id}`, { method: 'DELETE' });
      load();
    });
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconLayers /></div>
        <div>
          <h1 className="font-display text-[18px] font-semibold tracking-tight text-slate-900">FMS Tracker</h1>
          <p className="text-[11.5px] text-slate-500">Browse every flow — steps, entries, and who's coordinating</p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-[13px]">Loading…</div>
        ) : sheets.length === 0 ? (
          <div className="p-14 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3"><IconLayers className="text-primary-500" /></div>
            <div className="text-[13.5px] font-semibold text-slate-700">No FMS flows yet</div>
            <div className="text-[12px] text-slate-500 mt-0.5">Ask an admin to set one up in FMS Admin.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50/95">
                <tr>
                  <th className="table-th">FMS Name</th>
                  <th className="table-th text-center">Total Steps</th>
                  <th className="table-th text-center">Total Entries</th>
                  <th className="table-th">Process Coordinator</th>
                  {isAdmin && <th className="table-th text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => (
                  <tr key={s.id} className="table-row">
                    <td className="table-td">
                      <Link href={`/fms-view/${s.id}`} className="font-semibold text-primary-700 hover:underline">
                        {s.fms_name || s.sheet_name}
                      </Link>
                    </td>
                    <td className="table-td text-center">{s.totalSteps}</td>
                    <td className="table-td text-center">{s.totalEntries}</td>
                    <td className="table-td">{s.coordinatorName || '—'}</td>
                    {isAdmin && (
                      <td className="table-td text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/fms?edit=${s.id}`} className="btn-secondary !text-[11px] !px-2.5 !py-1">✏️ Edit</Link>
                          <button className="btn-danger !text-[11px] !px-2.5 !py-1" onClick={() => deleteSheet(s)}>🗑 Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {ConfirmUI}
    </div>
  );
}

function IconLayers(props) {
  return (
    <svg {...props} className={`w-[18px] h-[18px] ${props.className || ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" />
    </svg>
  );
}
