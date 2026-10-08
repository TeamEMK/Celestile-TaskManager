'use client';
import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { pickUploadFile } from '../quotation/imageThumb';
import { ZoomImg } from './ImageLightbox';
import { stepOpenUrl } from '@/lib/fmsOpenUrl';
import { fieldVisibility, matchesCondition } from '@/lib/fieldVisibility';
import Icon from '../components/Icon';
import DateField from './DateField';
import OrderNumberInput from './OrderNumberInput';
import { isOrderField, isValidOrderNumber, ORDER_HINT } from '@/lib/orderNumber';
import ImsThicknessSelect from './ImsThicknessSelect';
import { isThicknessField, isMaterialField } from '@/lib/imsFields';

// PDFs are kept as-is (no resize); images are downscaled to a JPEG thumbnail.
// The resulting data: URI is swapped for a Drive URL server-side (writeStepDone)
// once actually submitted.

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
  // Set when the save raised a QC alert instead of completing the step —
  // { alerts: [{ check, answer, sentTo, unset, error }] }.
  const [heldResult, setHeldResult] = useState(null);

  // Only prompt for a delay reason if this step actually has a Delay Reason
  // Column configured — otherwise there's nowhere to write it, and the user
  // was being forced to type a reason that silently went nowhere.
  const delayed = isDelayed(row.planValue) && !!step?.delay_reason_col;
  const configuredRows = useMemo(() => (step?.extraRows || []).filter((r) => r.col_letter), [step]);
  // Conditional fields — a row configured with "Show only when …" appears
  // only once its controlling row holds the configured value (e.g. a date
  // that's only asked for when "Received?" is answered Yes).
  // A field may also hang off a column of the sheet row itself ("only for
  // Stone" → the row's Material cell); the pending row carries those values.
  const refValues = row.refValues;
  const shown = useMemo(
    () => fieldVisibility(configuredRows, (r) => extraValues[r.col_letter] ?? '',
      refValues ? (c) => refValues[c] ?? '' : undefined),
    [configuredRows, extraValues, refValues]
  );
  const extraRows = configuredRows.filter((_, i) => shown[i]);
  // Answers that will send a QC alert (and keep the step pending) on save.
  const alerting = extraRows.filter((r) => String(r.alert_on || '').trim() && String(r.alert_to || '').trim()
    && (extraValues[r.col_letter] || '').trim() && matchesCondition(extraValues[r.col_letter], r.alert_on));
  const alertGroups = [...new Set(alerting.flatMap((r) => r.alert_to.split(/[,\n]+/).map((g) => g.trim()).filter(Boolean)))];
  // The stone this step captured, if it captures one — narrows the thickness
  // list to the sizes that stone comes in.
  const materialValue = (() => {
    const r = configuredRows.find(isMaterialField);
    return r ? (extraValues[r.col_letter] || '') : '';
  })();
  // Steps can be configured (in the FMS editor) to point at another page of
  // the app — e.g. the Inventory form for a "slab inward" step. The caller
  // (the "Mark Done" click handler) already tries to open this in a new tab
  // synchronously, before this modal even mounts, so it survives popup
  // blockers; this is just the manual reopen if that got blocked anyway or
  // the tab was closed.
  const openUrl = stepOpenUrl(step?.open_url, row);

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
      const typed = extraValues[r.col_letter]?.trim();
      if (isOrderField(r) && typed && !isValidOrderNumber(typed)) { setErr(`"${r.row_label || r.col_letter}" — ${ORDER_HINT}`); return; }
      if (r.field_type === 'pieces' && typed && !piecesComplete(typed)) { setErr(`"${r.row_label || r.col_letter}" — enter the thickness of every piece.`); return; }
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
      if (d.held) { setHeldResult(d); setSaving(false); return; }
      onSaved();
    } catch (e) {
      setErr(e.message); setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/25 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4" onClick={() => !saving && onClose()}>
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

        {heldResult ? (
          <HeldResult result={heldResult} onClose={onSaved} />
        ) : (<>
        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          {err && <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12.5px] px-3 py-2">{err}</div>}

          {openUrl && (
            <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-violet-800"><Icon name="paperclip" className="w-3.5 h-3.5" /> This step has a linked form — it should have opened in a new tab when you clicked Mark Done.</span>
              <button type="button" onClick={() => window.open(openUrl, '_blank', 'noopener')}
                className="btn-secondary btn-sm !py-1.5 !px-2.5 whitespace-nowrap"><Icon name="external" className="w-3 h-3" /> Open Form</button>
            </div>
          )}

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
              <div className="text-[12.5px] font-semibold text-amber-800 mb-2"><Icon name="alert" className="w-3.5 h-3.5" /> Delay Detected — Reason Required</div>
              <input value={delayReason} onChange={(e) => setDelayReason(e.target.value)} placeholder="Reason for delay…" className="input" />
            </div>
          )}

          {extraRows.length > 0 && (
            <div>
              <div className="text-[12.5px] font-semibold text-slate-700 mb-2 pb-1.5 border-b border-slate-100"><Icon name="edit" className="w-3.5 h-3.5" /> Additional Fields</div>
              <div className="space-y-3">
                {extraRows.map((r) => (
                  <ExtraField key={r.col_letter} row={r} value={extraValues[r.col_letter] || ''}
                    material={materialValue}
                    alerting={alerting.includes(r)}
                    stockFor={{ orderNo: row.orderNo || '', area: row.area || '' }}
                    onChange={(v) => setExtraValues((ev) => ({ ...ev, [r.col_letter]: v }))} />
                ))}
              </div>
            </div>
          )}

          {alerting.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-[12.5px] text-red-700">
              <div className="font-semibold mb-0.5"><Icon name="alert" className="w-3.5 h-3.5" /> This will raise a QC alert</div>
              Your answers are saved and {alertGroups.join(', ')} {alertGroups.length > 1 ? 'are' : 'is'} alerted on WhatsApp. The step stays pending until it is rechecked.
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={saving} className={alerting.length ? 'btn-danger' : 'btn-success'}>
            {saving ? 'Saving…' : alerting.length ? 'Save & Raise Alert' : 'Save to Sheet'}
          </button>
        </div>
        </>)}
      </div>
    </div>,
    document.body
  );
}

// Alert sent, step held — say exactly which groups heard about it, and which
// named groups have no WhatsApp ID yet (set on the FMS page → QC Alerts).
function HeldResult({ result, onClose }) {
  return (
    <>
      <div className="p-6 space-y-3">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[12.5px] text-amber-800">
          <div className="font-semibold mb-0.5"><Icon name="alert" className="w-3.5 h-3.5" /> Answers saved — QC alert raised</div>
          The step is still pending. Recheck it once the issue is fixed and mark it done again.
        </div>
        {(result.alerts || []).map((a, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3 text-[12.5px] space-y-0.5">
            <div className="font-semibold text-slate-800">{a.check}: <span className="text-red-600">{a.answer}</span></div>
            {a.sentTo?.length > 0 && <div className="text-emerald-700">Sent to {a.sentTo.join(', ')}</div>}
            {a.unset?.length > 0 && <div className="text-amber-700">No WhatsApp ID set for {a.unset.join(', ')} — logged only</div>}
            {a.error && <div className="text-red-600">{a.error} — the answers are still saved on the sheet</div>}
          </div>
        ))}
      </div>
      <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
        <button onClick={onClose} className="btn-primary">Close</button>
      </div>
    </>
  );
}

// "Thickness per piece": a slab billed at 18mm arrives anywhere from 17 to
// 19mm, so every piece is measured before production. The pieces are the
// slabs blocked to this order's area in the stock list (Inventory) — 10
// slabs blocked for the kitchen means 10 boxes, each named by its slab no.
// With nothing in the stock list it falls back to a typed piece count.
// Stored in one cell: "3 pcs: S12=18, S13=17.5, S14=18" (or "3 pcs: 18, 17.5, 18").
function parsePieces(value) {
  const m = String(value || '').match(/^\s*(\d+)\s*pcs?\s*:\s*(.*)$/i);
  if (!m) return { count: '', list: [] };
  const list = m[2].split(',').map((x) => {
    const [label, val] = x.includes('=') ? x.split('=') : ['', x];
    return { label: label.trim(), val: (val ?? '').trim() };
  });
  return { count: m[1], list };
}
function piecesComplete(value) {
  const { count, list } = parsePieces(value);
  const n = parseInt(count, 10) || 0;
  return n > 0 && list.length === n && list.every((x) => x.val !== '' && !isNaN(parseFloat(x.val)));
}
function formatPieces(entries) {
  if (!entries.length) return '';
  return `${entries.length} pcs: ${entries.map((e) => (e.label ? `${e.label}=${e.val}` : e.val)).join(', ')}`;
}
function PiecesField({ value, onChange, stockFor }) {
  const { orderNo = '', area = '' } = stockFor || {};
  const [slabs, setSlabs] = useState(null); // null = loading/not looked up
  const [lookupErr, setLookupErr] = useState('');

  useEffect(() => {
    if (!orderNo) { setSlabs([]); return; }
    let live = true;
    fetch(`/api/fms-tasks/blocked-slabs?orderNo=${encodeURIComponent(orderNo)}&area=${encodeURIComponent(area)}`)
      .then((r) => r.json())
      .then((d) => { if (live) { if (d.error) setLookupErr(d.error); setSlabs(d.slabs || []); } })
      .catch((e) => { if (live) { setLookupErr(e.message); setSlabs([]); } });
    return () => { live = false; };
  }, [orderNo, area]);

  const { count, list } = parsePieces(value);
  const valOf = (label, i) => (label ? list.find((x) => x.label === label)?.val : list[i]?.val) ?? '';

  if (slabs === null) return <div className="text-[12px] text-slate-400">Reading the stock list for {orderNo}{area ? ` · ${area}` : ''}…</div>;

  // Slabs found → one box per slab, in stock-list order.
  if (slabs.length) {
    const set = (i, v) => onChange(formatPieces(slabs.map((sl, j) => ({ label: sl.slab, val: j === i ? v.replace(/[,=]/g, '') : valOf(sl.slab, j) }))));
    return (
      <div className="space-y-2">
        <div className="text-[11.5px] text-slate-500">
          {slabs.length} slab{slabs.length > 1 ? 's' : ''} blocked for {orderNo}{area ? ` · ${area}` : ''} in the stock list — enter each one&apos;s measured thickness.
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {slabs.map((sl, i) => (
            <label key={sl.slab + i} className="block">
              <span className="text-[10.5px] text-slate-500">{sl.slab}{sl.thickness ? ` · bill ${sl.thickness}` : ''}</span>
              <input type="number" step="0.1" className="input !py-1.5" value={valOf(sl.slab, i)} placeholder="mm"
                onChange={(e) => set(i, e.target.value)} />
            </label>
          ))}
        </div>
      </div>
    );
  }

  // Nothing blocked (or no order on the row) → typed count.
  const n = Math.min(parseInt(count, 10) || 0, 200);
  const emit = (c, vals) => {
    const k = Math.min(parseInt(c, 10) || 0, 200);
    onChange(k ? formatPieces(Array.from({ length: k }, (_, i) => ({ label: '', val: vals[i] ?? '' }))) : '');
  };
  const vals = list.map((x) => x.val);
  return (
    <div className="space-y-2">
      <div className="text-[11.5px] text-amber-700">
        {lookupErr ? `Couldn't read the stock list (${lookupErr}).` : orderNo ? `No slabs are blocked for ${orderNo}${area ? ` · ${area}` : ''} in the stock list.` : 'This row has no order number to look up in the stock list.'} Enter the number of pieces.
      </div>
      <input type="number" min="1" max="200" className="input" value={count} placeholder="Number of pieces…"
        onChange={(e) => emit(e.target.value, vals)} />
      {n > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {Array.from({ length: n }, (_, i) => (
            <label key={i} className="block">
              <span className="text-[10.5px] text-slate-500">Piece {i + 1} (mm)</span>
              <input type="number" step="0.1" className="input !py-1.5" value={vals[i] ?? ''}
                onChange={(e) => emit(count, Array.from({ length: n }, (_, j) => (j === i ? e.target.value.replace(/[,=]/g, '') : (vals[j] ?? ''))))} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ExtraField({ row, value, onChange, material = '', alerting = false, stockFor }) {
  const label = row.row_label || row.col_letter;
  const required = !(row.required === 0 || row.required === false || row.required === '0');
  const dropdownOptions = (row.dropdown_options || '').split(',').map((o) => o.trim()).filter(Boolean);
  // A dropdown with nothing to pick from would be impossible to fill in.
  const isDropdown = row.field_type === 'dropdown' && dropdownOptions.length > 0;
  const isText = (!row.field_type || row.field_type === 'text' || (row.field_type === 'dropdown' && !isDropdown))
    && !isOrderField(row) && !isThicknessField(row);
  return (
    <div>
      <label className="label">
        {label} {required ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal normal-case">(optional)</span>}
        <span className="text-slate-400 font-normal normal-case ml-1">(COL {row.col_letter})</span>
      </label>
      {row.field_type === 'number'   && <input type="number" className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter number…" />}
      {row.field_type === 'date'     && <DateField className="input" value={value} onChange={(e) => onChange(e.target.value)} />}
      {row.field_type === 'link'     && <input type="url" className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://…" />}
      {row.field_type === 'pieces' && <PiecesField value={value} onChange={onChange} stockFor={stockFor} />}
      {isDropdown && (
        <select className={`input ${alerting ? '!border-red-400 !bg-red-50' : ''}`} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">-- Select --</option>
          {dropdownOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {row.field_type === 'upload' && <UploadField value={value} onChange={onChange} />}
      {isOrderField(row) && <OrderNumberInput value={value} onChange={(e) => onChange(e.target.value)} />}
      {isThicknessField(row) && <ImsThicknessSelect allowTyping value={value} material={material} onChange={(e) => onChange(e.target.value)} />}
      {isText && <input type="text" className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter value…" />}
    </div>
  );
}

function UploadField({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [pickErr, setPickErr] = useState('');
  const isImage = (value || '').startsWith('data:image/');
  const isPdf = (value || '').startsWith('data:application/pdf');
  const isZip = (value || '').startsWith('data:application/zip') || (value || '').startsWith('data:application/x-zip-compressed');
  const isRar = (value || '').startsWith('data:application/vnd.rar') || (value || '').startsWith('data:application/x-rar-compressed');
  return (
    <div>
      <input
        type="file"
        accept="image/*,application/pdf,.zip,application/zip,application/x-zip-compressed,.rar,application/vnd.rar,application/x-rar-compressed"
        className="input !py-1.5"
        onChange={async (e) => {
          const file = e.target.files[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setPickErr('');
          try { onChange(await pickUploadFile(file)); }
          catch (err) { setPickErr(err?.message || 'Could not read that file — try again.'); }
          finally { setBusy(false); }
        }}
      />
      {busy && <div className="text-[11px] text-slate-400 mt-1">Processing…</div>}
      {!busy && pickErr && <div className="text-[11.5px] text-red-600 mt-1">{pickErr}</div>}
      {!busy && value && (
        <div className="flex items-center gap-2 mt-1.5">
          {isImage
            ? <ZoomImg src={value} className="w-10 h-10 object-cover rounded border border-slate-200" />
            : <span className="text-[11.5px] text-slate-600"><Icon name="file" className="w-3.5 h-3.5" /> {isPdf ? 'PDF attached' : isZip ? 'Zip attached' : isRar ? 'RAR attached' : 'File attached'}</span>}
          <button type="button" className="text-[11px] text-red-500 hover:underline" onClick={() => onChange('')}>Remove</button>
        </div>
      )}
    </div>
  );
}
