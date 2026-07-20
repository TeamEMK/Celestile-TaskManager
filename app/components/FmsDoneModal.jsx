'use client';
import { useState, useMemo } from 'react';

function isDelayed(planValue) {
  const v = (planValue || '').trim();
  if (!v) return false;
  let planDate;
  const ddmmyyyy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)?$/);
  const yyyymmdd = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(.*)?$/);
  if (ddmmyyyy) {
    const [, d, m, y, time = ''] = ddmmyyyy;
    planDate = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${time.trim() ? 'T' + time.trim() : 'T23:59:59'}`);
  } else if (yyyymmdd) {
    planDate = new Date(v);
  }
  return !!(planDate && !isNaN(planDate.getTime()) && new Date() > planDate);
}

// Shared "Mark FMS step done" modal — writes the Actual timestamp (+ delay
// reason + extra fields) back to the live Google Sheet. Used by both the
// FMS Task page (rows already loaded) and All Tasks' FMS tab (needs the
// step's extraRows config fetched first — pass it in via `step`).
export default function FmsDoneModal({ row, step, fmsId, onClose, onSaved }) {
  const [delayReason, setDelayReason] = useState('');
  const [extraValues, setExtraValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const delayed = isDelayed(row.planValue);
  const extraRows = (step?.extraRows || []).filter((r) => r.col_letter);
  const actualDisplay = useMemo(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }, []);

  async function save() {
    setErr('');
    if (delayed && !delayReason.trim()) { setErr('Delay reason is required.'); return; }
    for (const r of extraRows) {
      const required = !(r.required === 0 || r.required === false || r.required === '0');
      if (required && !extraValues[r.col_letter]?.trim()) { setErr(`"${r.row_label || r.col_letter}" is required.`); return; }
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/fms-tasks/${fmsId}/steps/${step.id}/done`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowNumber: row.sheetRowNumber,
          delayReason: delayed ? delayReason.trim() : '',
          extraInputs: extraRows.map((r) => ({ colLetter: r.col_letter, value: extraValues[r.col_letter] || '' })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Failed to save'); setSaving(false); return; }
      onSaved();
    } catch (e) {
      setErr(e.message); setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Mark as Done</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Writes back to the live Google Sheet</p>
          </div>
          <button onClick={onClose} disabled={saving} className="btn-ghost w-8 h-8 !p-0 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          {err && <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12.5px] px-3 py-2">{err}</div>}

          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-[12.5px] space-y-1.5 max-h-[160px] overflow-y-auto">
            {Object.entries(row.data || {}).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="font-semibold text-slate-500 min-w-[110px] shrink-0">{k}</span>
                <span className="text-slate-800">{v || '—'}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="label !mb-1">Plan Value</div>
              <div className="rounded-lg bg-primary-50 text-primary-700 font-semibold text-[13px] px-3 py-2.5">{row.planValue || '—'}</div>
            </div>
            <div>
              <div className="label !mb-1">Actual (Now)</div>
              <div className="rounded-lg bg-emerald-50 text-emerald-700 font-semibold text-[13px] px-3 py-2.5">{actualDisplay}</div>
            </div>
          </div>

          {delayed && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <div className="text-[12.5px] font-semibold text-amber-800 mb-2">⚠️ Delay Detected — Reason Required</div>
              <input value={delayReason} onChange={(e) => setDelayReason(e.target.value)} placeholder="Reason for delay…" className="input" />
            </div>
          )}

          {extraRows.length > 0 && (
            <div>
              <div className="text-[12.5px] font-semibold text-slate-700 mb-2 pb-1.5 border-b border-slate-100">📝 Additional Fields</div>
              <div className="space-y-3">
                {extraRows.map((r) => (
                  <ExtraField key={r.col_letter} row={r} value={extraValues[r.col_letter] || ''}
                    onChange={(v) => setExtraValues((ev) => ({ ...ev, [r.col_letter]: v }))} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-success">{saving ? 'Saving…' : 'Save to Sheet'}</button>
        </div>
      </div>
    </div>
  );
}

function ExtraField({ row, value, onChange }) {
  const label = row.row_label || row.col_letter;
  const required = !(row.required === 0 || row.required === false || row.required === '0');
  return (
    <div>
      <label className="label">
        {label} {required ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal normal-case">(optional)</span>}
        <span className="text-slate-400 font-normal normal-case ml-1">(COL {row.col_letter})</span>
      </label>
      {row.field_type === 'number'   && <input type="number" className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter number…" />}
      {row.field_type === 'date'     && <input type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />}
      {row.field_type === 'link'     && <input type="url" className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />}
      {row.field_type === 'dropdown' && (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">-- Select --</option>
          {(row.dropdown_options || '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {(!row.field_type || row.field_type === 'text') && <input type="text" className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter value…" />}
    </div>
  );
}
