'use client';

export default function HolidaysModal({ open, onClose, holidays }) {
  if (!open) return null;
  const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 grid place-items-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Holidays</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">{holidays.length} holiday{holidays.length === 1 ? '' : 's'} this year</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {holidays.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No holidays added.</div>
          ) : (
            <ul className="space-y-2">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-50/60 to-amber-50/20 border border-amber-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white border border-amber-200 flex flex-col items-center justify-center">
                      <div className="text-[9px] uppercase text-amber-700 font-semibold leading-none">{new Date(h.date).toLocaleDateString('en-IN', { month: 'short' })}</div>
                      <div className="text-base font-bold text-slate-900 leading-none mt-0.5">{new Date(h.date).getDate()}</div>
                    </div>
                    <div>
                      <div className="font-medium text-slate-900 text-sm">{h.name}</div>
                      <div className="text-[11px] text-slate-500">{fmt(h.date)}</div>
                    </div>
                  </div>
                  <span className="pill bg-amber-100 text-amber-800">{h.type}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
