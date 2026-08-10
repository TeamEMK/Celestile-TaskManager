'use client';
import { useCallback, useEffect, useState } from 'react';

// Item + thickness options for both quotation forms, loaded once from the
// team's master spreadsheet (/api/quotations/master). If the sheet can't be
// read the hook reports `error` and leaves the lists empty — callers fall back
// to their built-in list so a quotation can still be written.
export function useQuotationMaster() {
  const [items, setItems] = useState([]);
  const [thicknesses, setThicknesses] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/quotations/master');
        const data = await res.json();
        if (!alive) return;
        setItems(data.items || []);
        setThicknesses(data.thicknesses || []);
        setError(data.error || '');
      } catch (err) {
        if (alive) setError('Could not reach the item master');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const addItem = useCallback(async (item, thickness) => {
    const res = await fetch('/api/quotations/master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item, thickness }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not add the item');
    setItems(data.items || []);
    setThicknesses(data.thicknesses || []);
    return data;
  }, []);

  return { items, thicknesses, error, loading, addItem };
}

// Shared "+ Add new item" dialog. Deliberately plain — the quotation forms
// have their own scoped CSS, so this uses the app's global classes only.
export function AddItemModal({ onClose, onAdd, thicknesses = [] }) {
  const [name, setName] = useState('');
  const [thk, setThk] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!name.trim()) { setErr('Item name required'); return; }
    setBusy(true); setErr('');
    try {
      await onAdd(name.trim(), thk.trim());
      onClose(name.trim());
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-start justify-center pt-28 px-4 animate-fade-in"
      style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => onClose(null)}>
      <div className="bg-white rounded-2xl shadow-2xl p-5 w-[26rem] max-w-[94%]" onClick={(e) => e.stopPropagation()}>
        <div className="text-[14px] font-semibold text-slate-900 mb-1">Add item to master</div>
        <div className="text-[12px] text-slate-500 mb-4">Saved into the quotation master sheet, so it shows up for everyone.</div>

        <label className="label">Item / Material name *</label>
        <input className="input mb-3" value={name} autoFocus placeholder="e.g. Statuario Marble"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />

        <label className="label">Thickness <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
        <input className="input" list="qmaster-thk" value={thk} placeholder="e.g. 18MM"
          onChange={(e) => setThk(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <datalist id="qmaster-thk">{thicknesses.map((t) => <option key={t} value={t} />)}</datalist>

        {err && <div className="text-[12px] text-red-600 mt-2">{err}</div>}

        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-ghost" onClick={() => onClose(null)} disabled={busy}>Cancel</button>
          <button className="btn-warn" onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add item'}</button>
        </div>
      </div>
    </div>
  );
}

export const ADD_ITEM_VALUE = '__add_item__';
