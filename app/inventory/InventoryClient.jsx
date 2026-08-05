'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fileToThumbnail } from '@/app/quotation/imageThumb';

const num = (v) => parseFloat(v) || 0;
const sftOf = (l, w) => Math.round((num(l) * num(w) / 144) * 100) / 100;
const blankRow = () => ({ slab: '', material: '', thickness: '', sizeL: '', sizeW: '', sft: '', photo: '', remarks: '' });
const TAB_IDS = ['inward', 'stock', 'step2'];

export default function InventoryClient() {
  // Lets a link land directly on a specific tab — e.g. an FMS step's "Open
  // Page on this Step" pointing at /inventory?tab=step2 for "Blocking for
  // Jointing" instead of always opening on Inward.
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState(TAB_IDS.includes(requestedTab) ? requestedTab : 'inward');
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

  const TABS = [['inward', 'Inward'], ['stock', 'Stock'], ['step2', 'Blocking for Jointing']];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconLayers /></div>
          <div>
            <div className="section-title">Stone Inventory Factory</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Slab inward, live stock &amp; jointing blocks</div>
          </div>
        </div>
        <div className="seg">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`seg-btn ${tab === id ? 'seg-btn-active' : ''}`}>{label}</button>
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

  // Photos are base64 data-URIs, so a single request with many rows can grow
  // large enough for the hosting proxy/WAF to reject it with a plain-text
  // (non-JSON) error page. Posting in small batches keeps each request small
  // and lets earlier batches survive if a later one fails.
  const SUBMIT_BATCH_SIZE = 3;

  async function postEntriesBatch(entries) {
    const res = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
    const text = await res.text();
    let d;
    try { d = JSON.parse(text); } catch { throw new Error(text || `Request failed (${res.status})`); }
    if (!res.ok) throw new Error(d.error || 'Failed');
    return d;
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
    const entries = rows.map((r) => ({
      slab: r.slab, material: r.material, thickness: r.thickness, sizeL: r.sizeL, sizeW: r.sizeW,
      sft: r.sft, slabPhoto: r.photo, status: 'Available', remarks: r.remarks,
    }));
    let saved = 0;
    try {
      for (let i = 0; i < entries.length; i += SUBMIT_BATCH_SIZE) {
        const batch = entries.slice(i, i + SUBMIT_BATCH_SIZE);
        setStatus(`Saving ${i + 1}-${Math.min(i + batch.length, entries.length)} of ${entries.length}…`);
        const d = await postEntriesBatch(batch);
        saved += d.count || batch.length;
      }
      setStatus(`✅ ${saved} slabs added`); setRows([blankRow()]); onSaved();
    } catch (e) { setStatus(`❌ ${e.message} (${saved} of ${entries.length} saved)`); }
    finally { setSaving(false); }
  }

  return (
    <div className="card p-5">
      <datalist id="inv-mat">{masters.materials.map((m) => <option key={m} value={m} />)}</datalist>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-[13px] font-semibold text-slate-800">Slab Rows</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Row 1 material &amp; thickness applies to all rows</div>
        </div>
        <button className="btn-ghost" onClick={() => setShowAddMat(true)}>
          <IconPlus /> Material
        </button>
      </div>

      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 items-end border border-slate-200 rounded-xl p-3 relative bg-white/60 transition-colors hover:border-primary-200">
            <span
              className="absolute -top-2 left-2 text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full shadow-sm"
              style={{ background: 'linear-gradient(135deg, #F3C955 0%, #B78A16 100%)' }}
            >
              Row {i + 1}
            </span>
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
            <F label="SFT*"><input type="number" className="input !py-1 tabular-nums" value={r.sft} onChange={(e) => set(i, 'sft', e.target.value)} placeholder="auto" /></F>
            <F label="Photo">
              <label className="cursor-pointer flex items-center justify-center h-9 rounded-lg border border-dashed border-slate-300 overflow-hidden hover:border-primary-400 hover:bg-primary-50/30 transition-colors">
                {r.photo ? <img src={r.photo} alt="" className="h-9 object-cover" /> : <span className="text-slate-400 text-[11px]">+ Photo</span>}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(i, e.target.files[0])} />
              </label>
            </F>
            <F label="Remarks" wide><input className="input !py-1" value={r.remarks} onChange={(e) => set(i, 'remarks', e.target.value)} placeholder="Any remarks / issues" /></F>
            <div className="flex justify-end"><button className="btn-danger !px-2 !py-1" onClick={() => delRow(i)}>✕</button></div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
        <button className="btn-secondary" onClick={addRow}>+ Add Row</button>
        <div className="flex items-center gap-2">
          {status && <span className="text-[12px] text-slate-600">{status}</span>}
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
  const [edit, setEdit] = useState(null);   // {id, slab, material, thickness, sizeL, sizeW, sft, remarks, photo}

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
  async function saveEdit() {
    await patch({ id: edit.id, slab: edit.slab, material: edit.material, thickness: edit.thickness,
      sizeL: edit.sizeL, sizeW: edit.sizeW, sft: edit.sft, remarks: edit.remarks, slabPhoto: edit.photo });
    setEdit(null);
  }
  async function editPhoto(file) { if (!file) return; try { const url = await fileToThumbnail(file, 220, 0.7); setEdit((x) => ({ ...x, photo: url })); } catch {} }
  const editThkOpts = (edit && masters.thicknessMap[edit.material]) || [];

  function csv() {
    const head = ['Slab', 'Material', 'Thk', 'L', 'W', 'SFT', 'Status', 'Order', 'Client', 'Area', 'Remarks'];
    const cell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const lines = filtered.map((r) => [cell(r.slab), cell(r.material), r.thickness, r.sizeL, r.sizeW, r.sft, r.status, cell(r.orderNo), cell(r.client), cell(r.area), cell(r.remarks)].join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stock.csv'; a.click();
  }

  const badge = (s) => ({
    Available: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    Blocked: 'bg-red-50 text-red-700 border border-red-100',
    Used: 'bg-slate-100 text-slate-500 border border-slate-200',
  }[s] || 'bg-slate-100 text-slate-600 border border-slate-200');

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <F label="Min SFT"><input type="number" className="input !py-1 w-28" value={minSft} onChange={(e) => setMinSft(e.target.value)} placeholder="e.g. 35" /></F>
        <F label="Material"><select className="input !py-1 w-40" value={mat} onChange={(e) => { setMat(e.target.value); setThk(''); }}><option value="">All</option>{masters.materials.map((m) => <option key={m} value={m}>{m}</option>)}</select></F>
        <F label="Thickness"><select className="input !py-1 w-32" value={thk} onChange={(e) => setThk(e.target.value)}><option value="">All</option>{thicknessOpts.map((t) => <option key={t} value={t}>{t}</option>)}</select></F>
        <F label="Status"><select className="input !py-1 w-32" value={statusF} onChange={(e) => setStatusF(e.target.value)}>{['All', 'Available', 'Blocked', 'Used'].map((s) => <option key={s}>{s}</option>)}</select></F>
        <div className="relative flex-1 min-w-[180px]">
          <label className="label">Search</label>
          <svg className="absolute left-2.5 top-1/2 mt-[3px] -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input className="input !py-1 pl-8 w-full" placeholder="slab / client / order…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-secondary" onClick={csv}>⬇ Export CSV</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Available" value={stats.avail} tone="emerald" icon={<IconCheck />} />
        <Kpi label="Blocked" value={stats.blocked} tone="red" icon={<IconLock />} />
        <Kpi label="Used" value={stats.used} tone="stone" icon={<IconArchive />} />
        <Kpi label="Available SFT" value={stats.availSft} tone="gold" icon={<IconRuler />} />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-400 text-[12.5px]">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
                <IconBox className="w-6 h-6 text-primary-500" />
              </div>
              <div className="text-[13.5px] font-semibold text-slate-700">No slabs found</div>
              <div className="text-[12px] text-slate-500 mt-0.5">Try adjusting your filters, or add new stock from the Inward tab.</div>
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                <tr>
                  {['#', 'Slab', 'Material', 'Thk', 'L', 'W', 'SFT', 'Status', 'Order', 'Client', 'Area', 'Remarks', ''].map((h, i) => (
                    <th key={i} className={`table-th whitespace-nowrap ${['L', 'W', 'SFT'].includes(h) ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className="table-row">
                    <td className="table-td text-slate-400">{i + 1}</td>
                    <td className="table-td font-medium text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{r.slab}</span>
                        {r.slabPhoto ? <img src={r.slabPhoto} alt="" className="w-6 h-6 object-cover rounded" /> : null}
                      </div>
                    </td>
                    <td className="table-td">{r.material}</td><td className="table-td">{r.thickness}</td>
                    <td className="table-td text-right tabular-nums">{r.sizeL}</td>
                    <td className="table-td text-right tabular-nums">{r.sizeW}</td>
                    <td className="table-td text-right tabular-nums font-semibold text-slate-700">{r.sft}</td>
                    <td className="table-td"><span className={`pill ${badge(r.status)}`}>{r.status}</span></td>
                    <td className="table-td">{r.orderNo || '—'}</td><td className="table-td">{r.client || '—'}</td><td className="table-td">{r.area || '—'}</td>
                    <td className="table-td max-w-[140px] truncate" title={r.remarks}>{r.remarks || '—'}</td>
                    <td className="table-td whitespace-nowrap">
                      <div className="flex gap-1 justify-end">
                        {r.status === 'Available' && <button className="btn-danger !px-2 !py-1" onClick={() => setBlock({ id: r.id, orderNo: '', client: '', area: '' })}>Block</button>}
                        {r.status === 'Blocked' && <button className="btn-success !px-2 !py-1" onClick={() => unblock(r)}>Unblock</button>}
                        <button className="btn-ghost !px-2 !py-1" onClick={() => setEdit({ id: r.id, slab: r.slab, material: r.material, thickness: r.thickness, sizeL: r.sizeL, sizeW: r.sizeW, sft: r.sft, remarks: r.remarks, photo: r.slabPhoto })}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {block && (
        <Modal title="Block Slab" onClose={() => setBlock(null)}>
          <F label="Order No."><input className="input" value={block.orderNo} onChange={(e) => setBlock({ ...block, orderNo: e.target.value })} placeholder="ORD-2026-001" /></F>
          <F label="Client Name"><input className="input" value={block.client} onChange={(e) => setBlock({ ...block, client: e.target.value })} /></F>
          <F label="Area / Project"><input className="input" value={block.area} onChange={(e) => setBlock({ ...block, area: e.target.value })} /></F>
          <div className="flex gap-2 justify-end mt-3"><button className="btn-ghost" onClick={() => setBlock(null)}>Cancel</button><button className="btn-warn" onClick={confirmBlock}>Block Slab</button></div>
        </Modal>
      )}

      {edit && (
        <Modal title="Edit Slab" onClose={() => setEdit(null)}>
          <div className="grid grid-cols-2 gap-2">
            <F label="Slab No."><input className="input" value={edit.slab} onChange={(e) => setEdit({ ...edit, slab: e.target.value })} /></F>
            <F label="Material"><input className="input" list="inv-mat-edit" value={edit.material} onChange={(e) => setEdit({ ...edit, material: e.target.value, thickness: '' })} /></F>
            <datalist id="inv-mat-edit">{masters.materials.map((m) => <option key={m} value={m} />)}</datalist>
            <F label="Thickness"><select className="input" value={edit.thickness} onChange={(e) => setEdit({ ...edit, thickness: e.target.value })}><option value="">{edit.thickness || 'Select'}</option>{editThkOpts.map((t) => <option key={t} value={t}>{t}</option>)}</select></F>
            <F label="SFT"><input type="number" className="input" value={edit.sft} onChange={(e) => setEdit({ ...edit, sft: e.target.value })} /></F>
            <F label="Size L"><input type="number" className="input" value={edit.sizeL} onChange={(e) => setEdit({ ...edit, sizeL: e.target.value, sft: String(sftOf(e.target.value, edit.sizeW) || edit.sft) })} /></F>
            <F label="Size W"><input type="number" className="input" value={edit.sizeW} onChange={(e) => setEdit({ ...edit, sizeW: e.target.value, sft: String(sftOf(edit.sizeL, e.target.value) || edit.sft) })} /></F>
          </div>
          <F label="Remarks"><input className="input" value={edit.remarks} onChange={(e) => setEdit({ ...edit, remarks: e.target.value })} /></F>
          <F label="Photo">
            <label className="cursor-pointer flex items-center justify-center h-12 rounded-lg border border-dashed border-slate-300 overflow-hidden hover:border-primary-400 transition-colors">
              {edit.photo ? <img src={edit.photo} alt="" className="h-12 object-cover" /> : <span className="text-[11px] text-slate-400">+ Replace photo</span>}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => editPhoto(e.target.files[0])} />
            </label>
          </F>
          <div className="flex gap-2 justify-end mt-3"><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-warn" onClick={saveEdit}>Save</button></div>
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

  function printReport() {
    if (!data) return;
    const html = buildStep2Report(orderNo.trim(), hdr, data.slabs, cut);
    const w = window.open('', '_blank');
    if (!w) { setStatus('❌ Popup blocked — allow popups to print.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  }

  async function submit() {
    if (!data) return;
    setSaving(true); setStatus('Submitting…');
    try {
      const cuttingRows = (data.slabs || []).map((s) => ({ id: s.id, slab: s.slab, ...cut[s.id] }));
      const body = { orderNo: orderNo.trim(), key: data.key, ...hdr, cuttingRows };
      const res = await fetch('/api/inventory/step2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setStatus('✅ Saved — slabs marked Used, remnants created.');
      setData(null); setCut({}); onDone();
    } catch (e) { setStatus('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  const hasSlabs = !!(data && data.slabs?.length > 0);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <Stepper current={hasSlabs ? 1 : 0} />
      </div>

      <div className="card p-5">
        <div className="flex items-end gap-2 flex-wrap">
          <F label="Order No."><input className="input" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="ORD-2026-001" /></F>
          <button className="btn-warn" onClick={load}>Load Order</button>
          {status && <span className="text-[12px] text-slate-600 ml-2">{status}</span>}
        </div>
      </div>

      {!data && (
        <div className="card p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
            <IconSearch className="w-6 h-6 text-primary-500" />
          </div>
          <div className="text-[13.5px] font-semibold text-slate-700">No order loaded yet</div>
          <div className="text-[12px] text-slate-500 mt-0.5">Enter an order number above and click "Load Order" to begin blocking for jointing.</div>
        </div>
      )}

      {data && !hasSlabs && (
        <div className="card p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 grid place-items-center mx-auto mb-3">
            <IconAlertCircle className="w-6 h-6 text-amber-500" />
          </div>
          <div className="text-[13.5px] font-semibold text-slate-700">No slabs for this order</div>
          <div className="text-[12px] text-slate-500 mt-0.5">Block slabs to this order first from the Stock tab.</div>
        </div>
      )}

      {hasSlabs && (
        <>
          <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <F label="Material"><input className="input" value={hdr.material} onChange={(e) => setHdr({ ...hdr, material: e.target.value })} /></F>
            <F label="All Pieces"><input className="input" value={hdr.allPieces} onChange={(e) => setHdr({ ...hdr, allPieces: e.target.value })} placeholder="e.g. 12" /></F>
            <F label="Grain"><input className="input" value={hdr.grain} onChange={(e) => setHdr({ ...hdr, grain: e.target.value })} placeholder="Yes / No / type" /></F>
            <F label="Material Issue"><input className="input" value={hdr.issue} onChange={(e) => setHdr({ ...hdr, issue: e.target.value })} placeholder="No / describe" /></F>
            <F label="Sizes / Packing"><input className="input" value={hdr.sizesPacking} onChange={(e) => setHdr({ ...hdr, sizesPacking: e.target.value })} /></F>
            <div className="flex gap-3">
              <F label="Grain Photo"><label className="cursor-pointer flex items-center justify-center h-9 px-2 rounded-lg border border-dashed border-slate-300 overflow-hidden hover:border-primary-400 transition-colors">{hdr.grainImg ? <img src={hdr.grainImg} className="h-9" alt="" /> : <span className="text-[11px] text-slate-400">+ Grain</span>}<input type="file" accept="image/*" className="hidden" onChange={(e) => pick((v) => setHdr((h) => ({ ...h, grainImg: v })), e.target.files[0])} /></label></F>
              <F label="Material Photo"><label className="cursor-pointer flex items-center justify-center h-9 px-2 rounded-lg border border-dashed border-slate-300 overflow-hidden hover:border-primary-400 transition-colors">{hdr.matImg ? <img src={hdr.matImg} className="h-9" alt="" /> : <span className="text-[11px] text-slate-400">+ Mat</span>}<input type="file" accept="image/*" className="hidden" onChange={(e) => pick((v) => setHdr((h) => ({ ...h, matImg: v })), e.target.files[0])} /></label></F>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr>
                    {['Slab', 'Material', 'Thk', 'L', 'W', 'SFT', 'Cutting?', 'Reason', 'Cut L', 'Cut W'].map((h, i) => (
                      <th key={i} className={`table-th whitespace-nowrap ${['L', 'W', 'SFT', 'Cut L', 'Cut W'].includes(h) ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slabs.map((s) => {
                    const c = cut[s.id] || {};
                    return (
                      <tr key={s.id} className="table-row">
                        <td className="table-td font-medium text-slate-800">{s.slab}</td>
                        <td className="table-td">{s.material}</td><td className="table-td">{s.thickness}</td>
                        <td className="table-td text-right tabular-nums">{s.sizeL}</td>
                        <td className="table-td text-right tabular-nums">{s.sizeW}</td>
                        <td className="table-td text-right tabular-nums font-semibold text-slate-700">{s.sft}</td>
                        <td className="table-td"><select className="input !py-1" value={c.cutting} onChange={(e) => setC(s.id, 'cutting', e.target.value)}><option>No</option><option>Yes</option></select></td>
                        <td className="table-td"><input className="input !py-1" value={c.cuttingReason} onChange={(e) => setC(s.id, 'cuttingReason', e.target.value)} disabled={c.cutting !== 'Yes'} /></td>
                        <td className="table-td w-16"><input type="number" className="input !py-1 text-right" value={c.cuttingSizeL} onChange={(e) => setC(s.id, 'cuttingSizeL', e.target.value)} disabled={c.cutting !== 'Yes'} /></td>
                        <td className="table-td w-16"><input type="number" className="input !py-1 text-right" value={c.cuttingSizeW} onChange={(e) => setC(s.id, 'cuttingSizeW', e.target.value)} disabled={c.cutting !== 'Yes'} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-secondary" onClick={printReport}>⬇ Cutting Report</button>
            <button className="btn-warn" disabled={saving} onClick={submit}>{saving ? 'Submitting…' : 'Submit Blocking'}</button>
          </div>
          <p className="text-[11.5px] text-slate-500">Cutting "Yes" → slab marked <b className="text-slate-700">Used</b>, a remnant slab (size − cut) is auto-created as Available, and a WhatsApp update is sent.</p>
        </>
      )}
    </div>
  );
}

/* ─── Step 2 cutting report (browser print) ─── */
function buildStep2Report(orderNo, hdr, slabs, cut) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const f2 = (n) => (Number(n) || 0).toFixed(2);
  let rows = '';
  (slabs || []).forEach((s, i) => {
    const c = cut[s.id] || {};
    const oL = num(s.sizeL), oW = num(s.sizeW), oSft = (oL * oW) / 144;
    const yes = c.cutting === 'Yes';
    const uL = num(c.cuttingSizeL), uW = num(c.cuttingSizeW), cSft = (uL * uW) / 144;
    const rL = Math.max(oL - uL, 0), rW = Math.max(oW - uW, 0), rSft = yes ? (rL * rW) / 144 : 0;
    rows += `<tr><td>${i + 1}</td><td>${esc(s.slab)}</td><td>${esc(s.material)} ${esc(s.thickness)}</td>
      <td class="n">${oL} x ${oW}</td><td class="n">${f2(oSft)}</td>
      <td class="${yes ? 'yes' : 'no'}">${yes ? 'CUT' : '—'}</td>
      <td class="n">${yes ? uL + ' x ' + uW : '—'}</td><td class="n">${yes ? f2(cSft) : '—'}</td>
      <td>${esc(c.cuttingReason || '—')}</td>
      <td class="n">${yes && rL > 0 && rW > 0 ? rL + ' x ' + rW : '—'}</td><td class="n">${yes && rSft > 0 ? f2(rSft) : '—'}</td></tr>`;
  });
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cutting Report ${esc(orderNo)}</title><style>
@page{margin:12mm;size:A4 landscape}*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#0A0A0A}
.hdr{background:#0A0A0A;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center}
.logo{font-weight:700;font-size:16px;letter-spacing:.06em}.logo span{color:#EEBC2E}
.doc{color:#EEBC2E;font-size:13px;letter-spacing:2px}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:6px 18px;padding:12px 16px;background:#F5F5F5;border-bottom:1px solid #E5E7EB}
.meta .l{font-size:8px;text-transform:uppercase;letter-spacing:1px;color:#71717A;display:block}.meta .v{font-weight:700;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#0A0A0A;color:#fff;padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px}
td{padding:5px 8px;border-bottom:1px solid #E5E7EB}td.n{font-variant-numeric:tabular-nums}
td.yes{color:#B78A16;font-weight:700}td.no{color:#71717A}
tbody tr:nth-child(even){background:#FAFAFA}
.foot{margin-top:14px;padding:8px 16px;font-size:9px;color:#71717A;border-top:1px solid #E5E7EB}
</style></head><body>
<div class="hdr"><div class="logo">SK <span>Tiles</span></div><div class="doc">CUTTING REPORT</div></div>
<div class="meta">
<div><span class="l">Order No.</span><span class="v">${esc(orderNo) || '—'}</span></div>
<div><span class="l">Material</span><span class="v">${esc(hdr.material) || '—'}</span></div>
<div><span class="l">All Pieces</span><span class="v">${esc(hdr.allPieces) || '—'}</span></div>
<div><span class="l">Grain</span><span class="v">${esc(hdr.grain) || '—'}</span></div>
<div><span class="l">Material Issue</span><span class="v">${esc(hdr.issue) || 'No'}</span></div>
<div style="grid-column:span 3"><span class="l">Sizes / Packing</span><span class="v">${esc(hdr.sizesPacking) || '—'}</span></div>
</div>
<div style="padding:0 16px"><table>
<thead><tr><th>#</th><th>Slab</th><th>Material</th><th>Orig L×W</th><th>Orig SFT</th><th>Cut?</th><th>Cut L×W</th><th>Cut SFT</th><th>Reason</th><th>Remnant L×W</th><th>Remnant SFT</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<div class="foot">SK Tiles · Inventory cutting report · sizes in inches, SFT = (L × W) ÷ 144</div>
</body></html>`;
}

/* ─── small shared bits ─── */
function F({ label, children, wide }) {
  return <div className={wide ? 'sm:col-span-2 lg:col-span-2' : ''}><label className="label">{label}</label>{children}</div>;
}

const KPI_TONES = {
  emerald: { grad: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', shadow: 'rgba(16,185,129,0.35)' },
  red:     { grad: 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)', shadow: 'rgba(220,38,38,0.32)' },
  stone:   { grad: 'linear-gradient(135deg, #9CA3AF 0%, #52525B 100%)', shadow: 'rgba(82,82,91,0.30)' },
  gold:    { grad: 'linear-gradient(135deg, #F3C955 0%, #B78A16 100%)', shadow: 'rgba(183,138,22,0.38)' },
};

function Kpi({ label, value, tone = 'gold', icon }) {
  const g = KPI_TONES[tone] || KPI_TONES.gold;
  return (
    <div
      className="rounded-xl p-3.5 relative overflow-hidden card-hover cursor-default"
      style={{ background: g.grad, boxShadow: `0 0 0 1px ${g.shadow}44, 0 4px 18px ${g.shadow}` }}
    >
      <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }} />
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9.5px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.72)' }}>{label}</div>
          <div className="text-[22px] leading-none font-black mt-1.5 tabular-nums text-white">{value}</div>
        </div>
        <div className="w-7 h-7 rounded-lg grid place-items-center shrink-0" style={{ background: 'rgba(255,255,255,0.18)' }}>
          <span className="text-white">{icon}</span>
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }) {
  const steps = ['Load Order', 'Cutting & Submit'];
  return (
    <div className="flex items-center gap-3 px-1">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className={`flex items-center gap-3 ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold shrink-0 transition-all duration-200 ${done || active ? 'text-white' : 'bg-slate-100 text-slate-400'}`}
                style={done || active ? { background: 'linear-gradient(135deg, #F3C955 0%, #B78A16 100%)', boxShadow: '0 2px 8px rgba(183,138,22,0.35)' } : undefined}
              >
                {done ? <IconCheckSmall /> : i + 1}
              </div>
              <span className={`text-[12px] font-semibold whitespace-nowrap ${active ? 'text-slate-900' : done ? 'text-primary-600' : 'text-slate-400'}`}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-0.5 rounded-full transition-colors" style={{ background: done ? 'linear-gradient(90deg, #F3C955, #B78A16)' : '#E5E7EB' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-start justify-center overflow-y-auto z-50 pt-10 px-4 pb-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-5 w-96 max-w-[92%]" onClick={(e) => e.stopPropagation()}>
        <div className="text-[14px] font-semibold text-slate-900 font-display mb-3">{title}</div>
        <div className="space-y-2.5">{children}</div>
      </div>
    </div>
  );
}

function IconPlus()      { return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>; }
function IconLayers()    { return <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></svg>; }
function IconCheck()     { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>; }
function IconCheckSmall(){ return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>; }
function IconLock()      { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>; }
function IconArchive()   { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="1" /><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" /><path d="M10 13h4" /></svg>; }
function IconRuler()     { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 5 5-13 13-5-5z" /><path d="m14.5 4.5 1.5 1.5M11.5 7.5 13 9M8.5 10.5 10 12M5.5 13.5 7 15" /></svg>; }
function IconBox()       { return <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></svg>; }
function IconSearch()    { return <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>; }
function IconAlertCircle() { return <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" /></svg>; }
