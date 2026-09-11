'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

// "Who does this step?" — for FMS steps whose doer is picked per row rather
// than fixed in config (a step with assigners; see lib/fmsSheet.js
// isAssignedStep). Writes the chosen name into the step's Doer Name column
// via POST /steps/[stepId]/assign, after which only that person sees the row.
// Used from the Dashboard / All Tasks "Assign" pill and the FMS page's PC
// view (Assign / Reassign).
//
// `step` must carry `doers` (the pool) and `step_name`; `row` needs
// `sheetRowNumber` and, for the header, whatever of orderNo/data it has.
export default function FmsAssignModal({ fmsId, step, row, currentDoer, onClose, onSaved }) {
  const pool = step?.doers || [];
  const [userId, setUserId] = useState(() => {
    const cur = pool.find((d) => d.name === currentDoer);
    return cur ? String(cur.user_id) : '';
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const orderNo = row?.orderNo || '';
  const reassign = !!currentDoer && currentDoer !== 'Unassigned';

  async function save() {
    setErr('');
    if (!userId) { setErr('Pick who should do this step.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/fms-tasks/${fmsId}/steps/${step.id}/assign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowNumber: row.sheetRowNumber, userId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || 'Failed to assign'); setSaving(false); return; }
      onSaved(d);
    } catch (e) {
      setErr(e.message); setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/25 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-16 px-4 pb-4" onClick={() => !saving && onClose()}>
      <div className="card w-full max-w-md shadow-elevated animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-50 grid place-items-center text-primary-600">
            <Icon name="user" className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-slate-800">{reassign ? 'Reassign step' : 'Assign step'}</div>
            <div className="text-[11.5px] text-slate-500 truncate">
              {step?.step_name || 'Step'}{orderNo ? ` · Order ${orderNo}` : ''}
            </div>
          </div>
          <button type="button" className="ml-auto btn-ghost !p-1.5" onClick={onClose} disabled={saving} aria-label="Close">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {reassign && (
            <div className="text-[12px] text-slate-500">
              Currently with <b className="text-slate-700">{currentDoer}</b>. Picking someone else moves the task to them.
            </div>
          )}
          <div>
            <label className="label">Who will do this step?</label>
            {pool.length ? (
              <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)} autoFocus>
                <option value="">-- Select person --</option>
                {pool.map((d) => <option key={d.user_id} value={String(d.user_id)}>{d.name}</option>)}
              </select>
            ) : (
              <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                This step has no doers to pick from. An admin needs to add people under Step Doer(s) in the FMS editor.
              </div>
            )}
            <div className="text-[11px] text-slate-400 mt-1.5">
              They get a WhatsApp (if a number is on file) and the task appears on their Dashboard.
            </div>
          </div>
          {err && <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving || !pool.length}>
            {saving ? 'Saving…' : reassign ? 'Reassign' : 'Assign'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
