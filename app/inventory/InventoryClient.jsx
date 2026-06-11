'use client';
import { useEffect, useMemo, useState } from 'react';
import { fileToThumbnail } from '@/app/quotation/imageThumb';

const num = (v) => parseFloat(v) || 0;
const sftOf = (l, w) => Math.round((num(l) * num(w) / 144) * 100) / 100;
const blankRow = () => ({ slab: '', material: '', thickness: '', sizeL: '', sizeW: '', sft: '', photo: '', remarks: '' });

export default function InventoryClient() {
  const [tab, setTab] = useState('inward');
  const [masters, setMasters] = useState({ materials: [], thicknessMap: {} });
  const [inv, setInv] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadMasters() {
    try { setMasters(await (await fetch('/api/inventory/material')).json()); } catch {}
  }
  async function loadInv() {
    try { const d = await (await fetch('/api/inventory')).json(); setInv(Array.isArray(d) ? d : []); }
    catch { setInv([]); } finally { setLoading(false); }
  }
  useEffect(() => { loadMasters(); loadInv(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[16px] font-semibold text-slate-900">Inventory</div>
          <div className="text-[12px] text-slate-500">SK Tiles · slab stock & cutting</div>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {[['inward', 'Inward'], ['stock', 'Stock'], ['step2', 'Step 2']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 text-[13px] font-semibold transition-colors ${tab === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'inward' && <Inward masters={masters} reloadMasters={loadMasters} onSaved={loadInv} />}
      {tab === 'stock' && <Stock inv={inv} loading={loading} masters={masters} reload={loadInv} />}
      {tab === 'step2' && <Step2 onDone={loadInv} />}
    </div>
  );
}

/* ───────────────────────── INWARD ───────────────────────── */
function Inward({ masters, reloadMasters, onSaved }) {
  const [rows, setRows] = useState([blankRow()]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAddMat, setShowAddMat] = useState(false);
  const [newMat, setNewMat] = useState(''); const [newThk, setNewThk] = useState('');

  const set = (i, k, v) => setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  // row 0 drives material/thickness for all rows
  const setMat = (v) => setRows((rs) => rs.map((r) => ({ ...r, material: v, thickness: '' })));
  const setThk = (v) => setRows((rs) => rs.map((r) => ({ ...r, thickness: v })));
  const setSize = (i, k, v) => setRows((rs) => rs.map((r, idx) => {
    if (idx !== i) return r;
    const nr = { ...r, [k]: v };
    nr.sft = String(sftOf(k === 'sizeL' ? v : r.sizeL, k === 'sizeW' ? v : r.sizeW) || '');
    return nr;
  }));
  const addRow = () => setRows((rs) => [...rs, { ...blankRow(), material: rs[0]?.material || '', thickness: rs[0]?.thickness || '' }]);
  const delRow = (i) => setRows((rs) => rs.length === 1 ? [blankRow()] : rs.filter((_, idx) => idx !== i));
  async function pickPhoto(i, file) { if (!file) return; try { set(i, 'photo', await fileToThumbnail(file, 220, 0.7)); } catch {} }

  const thicknessOpts = masters.thicknessMap[rows[0]?.material] || [];

  async function addMaterial() {
    if (!newMat.trim() || !newThk.trim()) { setStatus('Material & thickness required'); return; }
    try {
      await fetch('/api/inventory/material', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ material: newMat, thickness: newThk }) });
      setShowAddMat(false); setNewMat(''); setNewThk(''); await reloadMasters();
    } catch (e) { setStatus('❌ ' + e.message); }
  }

  async function submitAll() {
    const errs = [];
    rows.forEach((r, i) => {
      if (!r.slab) errs.push(`Row ${i + 1}: Slab No.`);
      if (!r.material) errs.push(`Row ${i + 1}: Material`);
      if (!r.thickness) errs.push(`Row ${i + 1}: Thickness`);
      if (!r.sizeL) errs.push(`Row ${i + 1}: Size L`);
      if (!r.sizeW) errs.push(`Row ${i + 1}: Size W`);
      if (!r.sft) errs.push(`Row ${i + 1}: SFT`);
    });
    if (errs.length) { setStatus('❌ Required: ' + errs.slice(0, 4).join(', ') + (errs.length > 4 ? '…' : '')); return; }
    setSaving(true); setStatus('Saving…');
    try {
      const entries = rows.map((r) => ({
        slab: r.slab, material: r.material, thickness: r.thickness, sizeL: r.sizeL, sizeW: r.sizeW,
        sft: r.sft, slabPhoto: r.photo, status: 'Available', remarks: r.remarks,
      }));
      const res = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setStatus(`✅ ${d.count} slabs added`); setRows([blankRow()]); onSaved();
    } catch (e) { setStatus('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="card p-5">
      <datalist id="inv-mat">{masters.materials.map((m) => <option key={m} value={m} />)}</datalist>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[13px] font-semibold text-slate-800">Slab Rows <span className="text-slate-400 font-normal">(row 1 material/thickness applies to all)</span></div>
        <button className="btn-ghost" onClick={() => setShowAddMat(true)}>+ Material</button>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 items-end border border-slate-200 rounded-lg p-3 relative">
            <span className="absolute -top-2 left-2 text-[10px] font-bold bg-amber-500 text-white px-1.5 rounded">Row {i + 1}</span>
            <F label="Slab No.*"><input className="input !py-1" value={r.slab} onChange={(e) => set(i, 'slab', e.target.value)} placeholder="SB-001" /></F>
            <F label="Material*">
              {i === 0
                ? <input className="input !py-1" list="inv-mat" value={r.material} onChange={(e) => setMat(e.target.value)} placeholder="Material" />
                : <input className="input !py-1 bg-slate-100 text-slate-500" value={r.material} readOnly />}
            </F>
            <F label="Thickness*">
              {i === 0
                ? <select className="input !py-1" value={r.thickness} onChange={(e) => setThk(e.target.value)}><option value="">Select</option>{thicknessOpts.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                : <input className="input !py-1 bg-slate-100 text-slate-500" value={r.thickness} readOnly />}
            </F>
            <F label="Size L (in)*"><input type="number" className="input !py-1" value={r.sizeL} onChange={(e) => setSize(i, 'sizeL', e.target.value)} placeholder="102" /></F>
            <F label="Size W (in)*"><input type="number" className="input !py-1" value={r.sizeW} onChange={(e) => setSize(i, 'sizeW', e.target.value)} placeholder="48" /></F>
            <F label="SFT*"><input type="number" className="input !py-1" value={r.sft} onChange={(e) => set(i, 'sft', e.target.value)} placeholder="auto" /></F>
            <F label="Photo">
              <label className="cursor-pointer flex items-center justify-center h-9 rounded border border-dashed border-slate-300 overflow-hidden hover:border-slate-400">
                {r.photo ? <img src={r.photo} alt="" className="h-9 object-cover" /> : <span className="text-slate-400 text-[11px]">+ Photo</span>}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(i, e.target.files[0])} />
              </label>
            </F>
            <F label="Remarks" wide><input className="input !py-1" value={r.remarks} onChange={(e) => set(i, 'remarks', e.target.value)} placeholder="Any remarks / issues" /></F>
            <div className="flex justify-end"><button className="btn-danger !px-2 !py-1" onClick={() => delRow(i)}>✕</button></div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4">
        <button className="btn-secondary" onClick={addRow}>+ Add Row</button>
        <div className="flex items-center gap-2">
          {status && <span className="text-[12px]">{status}</span>}
          <button className="btn-warn" disabled={saving} onClick={submitAll}>{saving ? 'Saving…' : 'Submit All'}</button>
        </div>
      </div>

      {showAddMat && (
        <Modal title="Add Material & Thickness" onClose={() => setShowAddMat(false)}>
          <F label="Material Name *"><input className="input" value={newMat} onChange={(e) => setNewMat(e.target.value)} placeholder="Marble White" /></F>
          <F label="Thickness *"><input className="input" value={newThk} onChange={(e) => setNewThk(e.target.value)} placeholder="18" /></F>
          <div className="flex gap-2 justify-end mt-3"><button className="btn-ghost" onClick={() => setShowAddMat(false)}>Cancel</button><button className="btn-warn" onClick={addMaterial}>Add</button></div>
        </Modal>
      )}
    </div>
  );
}

/* ───────────────────────── STOCK ───────────────────────── */
function Stock({ inv, loading, masters, reload }) {
  const [minSft, setMinSft] = useState('');
  const [mat, setMat] = useState('');
  const [thk, setThk] = useState('');
  const [statusF, setStatusF] = useState('All');
  const [search, setSearch] = useState('');
  const [block, setBlock] = useState(null); // {id, orderNo, client, area}

  const thicknessOpts = useMemo(() => {
    const s = new Set(); inv.forEach((r) => { if (!mat || r.material === mat) { if (r.thickness) s.add(r.thickness); } });
    return Array.from(s).sort();
  }, [inv, mat]);

  const filtered = useMemo(() => {
    const t = search.toLowerCase();
    return inv.filter((r) => {
      if (minSft && num(r.sft) < num(minSft)) return false;
      if (mat && r.material !== mat) return false;
      if (thk && r.thickness !== thk) return false;
      if (statusF !== 'All' && r.status !== statusF) return false;
      if (t && !((r.slab + ' ' + r.material + ' ' + r.client + ' ' + r.orderNo + ' ' + r.area).toLowerCase().includes(t))) return false;
      return true;
    });
  }, [inv, minSft, mat, thk, statusF, search]);

  const stats = useMemo(() => {
    let avail = 0, blocked = 0, used = 0, availSft = 0;
    inv.forEach((r) => {
      if (r.status === 'Available') { avail++; availSft += num(r.sft); }
      else if (r.status === 'Blocked') blocked++;
      else if (r.status === 'Used') used++;
    });
    return { avail, blocked, used, availSft: Math.round(availSft * 100) / 100 };
  }, [inv]);

  async function patch(body) {
    await fetch('/api/inventory', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    reload();
  }
  const unblock = (r) => patch({ id: r.id, status: 'Available', orderNo: '', client: '', area: '' });
  async function confirmBlock() {
    await patch({ id: block.id, status: 'Blocked', orderNo: block.orderNo, client: block.client, area: block.area });
    setBlock(null);
  }

  function csv() {
    const head = ['Slab', 'Material', 'Thk', 'L', 'W', 'SFT', 'Status', 'Order', 'Client', 'Area', 'Remarks'];
    const cell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const lines = filtered.map((r) => [cell(r.slab), cell(r.material), r.thickness, r.sizeL, r.sizeW, r.sft, r.status, cell(r.orderNo), cell(r.client), cell(r.area), cell(r.remarks)].join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stock.csv'; a.click();
  }

  const badge = (s) => ({ Available: 'bg-emerald-50 text-emerald-700', Blocked: 'bg-rose-50 text-rose-700', Used: 'bg-slate-100 text-slate-500' }[s] || 'bg-slate-100 text-slate-600');

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <F label="Min SFT"><input type="number" className="input !py-1 w-28" value={minSft} onChange={(e) => setMinSft(e.target.value)} placeholder="e.g. 35" /></F>
        <F label="Material"><select className="input !py-1 w-40" value={mat} onChange={(e) => { setMat(e.target.value); setThk(''); }}><option value="">All</option>{masters.materials.map((m) => <option key={m} value={m}>{m}</option>)}</select></F>
        <F label="Thickness"><select className="input !py-1 w-32" value={thk} onChange={(e) => setThk(e.target.value)}><option value="">All</option>{thicknessOpts.map((t) => <option key={t} value={t}>{t}</option>)}</select></F>
        <F label="Status"><select className="input !py-1 w-32" value={statusF} onChange={(e) => setStatusF(e.target.value)}>{['All', 'Available', 'Blocked', 'Used'].map((s) => <option key={s}>{s}</option>)}</select></F>
        <input className="input !py-1 flex-1 min-w-[180px]" placeholder="🔍 slab / client / order…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-secondary" onClick={csv}>⬇ CSV</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Available" value={stats.avail} tone="text-emerald-600" />
        <Kpi label="Blocked" value={stats.blocked} tone="text-rose-600" />
        <Kpi label="Used" value={stats.used} tone="text-slate-500" />
        <Kpi label="Available SFT" value={stats.availSft} />
      </div>

      <div className="card p-0 overflow-x-auto">
        {loading ? <div className="p-5 text-[12.5px] text-slate-400">Loading…</div> : filtered.length === 0 ? (
          <div className="p-5 text-[12.5px] text-slate-400">No slabs.</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-900 text-white"><tr>{['#', 'Slab', 'Material', 'Thk', 'L', 'W', 'SFT', 'Status', 'Order', 'Client', 'Area', 'Remarks', ''].map((h, i) => <th key={i} className="px-2 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                  <td className="px-2 py-1.5 font-medium text-slate-800 whitespace-nowrap">{r.slab}{r.slabPhoto ? <img src={r.slabPhoto} alt="" className="inline-block w-6 h-6 object-cover rounded ml-1 align-middle" /> : ''}</td>
                  <td className="px-2 py-1.5">{r.material}</td><td className="px-2 py-1.5">{r.thickness}</td>
                  <td className="px-2 py-1.5">{r.sizeL}</td><td className="px-2 py-1.5">{r.sizeW}</td><td className="px-2 py-1.5">{r.sft}</td>
                  <td className="px-2 py-1.5"><span className={`pill ${badge(r.status)}`}>{r.status}</span></td>
                  <td className="px-2 py-1.5">{r.orderNo || '—'}</td><td className="px-2 py-1.5">{r.client || '—'}</td><td className="px-2 py-1.5">{r.area || '—'}</td>
                  <td className="px-2 py-1.5 max-w-[140px] truncate" title={r.remarks}>{r.remarks || '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {r.status === 'Available' && <button className="btn-danger !px-2 !py-1" onClick={() => setBlock({ id: r.id, orderNo: '', client: '', area: '' })}>Block</button>}
                    {r.status === 'Blocked' && <button className="btn-success !px-2 !py-1" onClick={() => unblock(r)}>Unblock</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {block && (
        <Modal title="Block Slab" onClose={() => setBlock(null)}>
          <F label="Order No."><input className="input" value={block.orderNo} onChange={(e) => setBlock({ ...block, orderNo: e.target.value })} placeholder="ORD-2026-001" /></F>
          <F label="Client Name"><input className="input" value={block.client} onChange={(e) => setBlock({ ...block, client: e.target.value })} /></F>
          <F label="Area / Project"><input className="input" value={block.area} onChange={(e) => setBlock({ ...block, area: e.target.value })} /></F>
          <div className="flex gap-2 justify-end mt-3"><button className="btn-ghost" onClick={() => setBlock(null)}>Cancel</button><button className="btn-warn" onClick={confirmBlock}>Block Slab</button></div>
        </Modal>
      )}
    </div>
  );
}

/* ───────────────────────── STEP 2 ───────────────────────── */
function Step2({ onDone }) {
  const [orderNo, setOrderNo] = useState('');
  const [data, setData] = useState(null); // {key, slabs}
  const [cut, setCut] = useState({}); // { [slabId]: {cutting, cuttingReason, cuttingSizeL, cuttingSizeW} }
  const [hdr, setHdr] = useState({ material: '', allPieces: '', grain: '', issue: '', sizesPacking: '', grainImg: '', matImg: '' });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!orderNo.trim()) return;
    setStatus('Loading…'); setData(null);
    try {
      const d = await (await fetch('/api/inventory/step2?orderNo=' + encodeURIComponent(orderNo.trim()))).json();
      if (d.error) throw new Error(d.error);
      setData(d);
      const c = {}; (d.slabs || []).forEach((s) => { c[s.id] = { cutting: 'No', cuttingReason: '', cuttingSizeL: '', cuttingSizeW: '' }; });
      setCut(c);
      setHdr((h) => ({ ...h, material: (d.slabs || [])[0]?.material || '' }));
      setStatus(d.slabs?.length ? '' : 'No slabs for this order (block slabs to this order first).');
    } catch (e) { setStatus('❌ ' + e.message); }
  }
  const setC = (id, k, v) => setCut((c) => ({ ...c, [id]: { ...c[id], [k]: v } }));
  async function pick(setter, file) { if (!file) return; try { setter(await fileToThumbnail(file, 300, 0.7)); } catch {} }

  async function submit() {
    if (!data) return;
    setSaving(true); setStatus('Submitting…');
    try {
      const cuttingRows = (data.slabs || []).map((s) => ({ id: s.id, slab: s.slab, ...cut[s.id] }));
      const body = { orderNo: orderNo.trim(), key: data.key, ...hdr, cuttingRows };
      const res = await fetch('/api/inventory/step2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setStatus('✅ Step 2 saved — slabs marked Used, remnants created.');
      setData(null); setCut({}); onDone();
    } catch (e) { setStatus('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-end gap-2 flex-wrap">
          <F label="Order No."><input className="input" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="ORD-2026-001" /></F>
          <button className="btn-warn" onClick={load}>Load Order</button>
          {status && <span className="text-[12px] ml-2">{status}</span>}
        </div>
      </div>

      {data && data.slabs?.length > 0 && (
        <>
          <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <F label="Material"><input className="input" value={hdr.material} onChange={(e) => setHdr({ ...hdr, material: e.target.value })} /></F>
            <F label="All Pieces"><input className="input" value={hdr.allPieces} onChange={(e) => setHdr({ ...hdr, allPieces: e.target.value })} placeholder="e.g. 12" /></F>
            <F label="Grain"><input className="input" value={hdr.grain} onChange={(e) => setHdr({ ...hdr, grain: e.target.value })} placeholder="Yes / No / type" /></F>
            <F label="Material Issue"><input className="input" value={hdr.issue} onChange={(e) => setHdr({ ...hdr, issue: e.target.value })} placeholder="No / describe" /></F>
            <F label="Sizes / Packing"><input className="input" value={hdr.sizesPacking} onChange={(e) => setHdr({ ...hdr, sizesPacking: e.target.value })} /></F>
            <div className="flex gap-3">
              <F label="Grain Photo"><label className="cursor-pointer flex items-center justify-center h-9 px-2 rounded border border-dashed border-slate-300 overflow-hidden">{hdr.grainImg ? <img src={hdr.grainImg} className="h-9" alt="" /> : <span className="text-[11px] text-slate-400">+ Grain</span>}<input type="file" accept="image/*" className="hidden" onChange={(e) => pick((v) => setHdr((h) => ({ ...h, grainImg: v })), e.target.files[0])} /></label></F>
              <F label="Material Photo"><label className="cursor-pointer flex items-center justify-center h-9 px-2 rounded border border-dashed border-slate-300 overflow-hidden">{hdr.matImg ? <img src={hdr.matImg} className="h-9" alt="" /> : <span className="text-[11px] text-slate-400">+ Mat</span>}<input type="file" accept="image/*" className="hidden" onChange={(e) => pick((v) => setHdr((h) => ({ ...h, matImg: v })), e.target.files[0])} /></label></F>
            </div>
          </div>

          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-900 text-white"><tr>{['Slab', 'Material', 'Thk', 'L', 'W', 'SFT', 'Cutting?', 'Reason', 'Cut L', 'Cut W'].map((h, i) => <th key={i} className="px-2 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {data.slabs.map((s) => {
                  const c = cut[s.id] || {};
                  return (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-medium">{s.slab}</td>
                      <td className="px-2 py-1.5">{s.material}</td><td className="px-2 py-1.5">{s.thickness}</td>
                      <td className="px-2 py-1.5">{s.sizeL}</td><td className="px-2 py-1.5">{s.sizeW}</td><td className="px-2 py-1.5">{s.sft}</td>
                      <td className="px-2 py-1.5"><select className="input !py-1" value={c.cutting} onChange={(e) => setC(s.id, 'cutting', e.target.value)}><option>No</option><option>Yes</option></select></td>
                      <td className="px-2 py-1.5"><input className="input !py-1" value={c.cuttingReason} onChange={(e) => setC(s.id, 'cuttingReason', e.target.value)} disabled={c.cutting !== 'Yes'} /></td>
                      <td className="px-2 py-1.5 w-16"><input type="number" className="input !py-1" value={c.cuttingSizeL} onChange={(e) => setC(s.id, 'cuttingSizeL', e.target.value)} disabled={c.cutting !== 'Yes'} /></td>
                      <td className="px-2 py-1.5 w-16"><input type="number" className="input !py-1" value={c.cuttingSizeW} onChange={(e) => setC(s.id, 'cuttingSizeW', e.target.value)} disabled={c.cutting !== 'Yes'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button className="btn-warn" disabled={saving} onClick={submit}>{saving ? 'Submitting…' : 'Submit Step 2'}</button>
          </div>
          <p className="text-[11.5px] text-slate-400">Cutting "Yes" → slab marked <b>Used</b>, a remnant slab (size − cut) is auto-created as Available, and a WhatsApp update is sent.</p>
        </>
      )}
    </div>
  );
}

/* ─── small shared bits ─── */
function F({ label, children, wide }) {
  return <div className={wide ? 'sm:col-span-2 lg:col-span-2' : ''}><label className="label">{label}</label>{children}</div>;
}
function Kpi({ label, value, tone = 'text-slate-900' }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div><div className={`text-[18px] font-bold mt-0.5 ${tone}`}>{value}</div></div>;
}
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 w-96 max-w-[92%]" onClick={(e) => e.stopPropagation()}>
        <div className="text-[14px] font-semibold mb-3">{title}</div>
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}
