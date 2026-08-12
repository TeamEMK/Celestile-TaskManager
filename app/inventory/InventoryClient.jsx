'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fileToThumbnail } from '@/app/quotation/imageThumb';
import { Lightbox, ZoomImg } from '@/app/components/ImageLightbox';

const num = (v) => parseFloat(v) || 0;
// The register is hand-fed by the old forms, so the same material/thickness
// shows up spelled several ways ("Mint" / "mint ", "40MM" / "40 MM").
const normMat = (v) => String(v ?? '').trim().toLowerCase();
const normThk = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, '');
const sftOf = (l, w) => Math.round((num(l) * num(w) / 144) * 100) / 100;
const blankRow = () => ({ slab: '', material: '', thickness: '', sizeL: '', sizeW: '', sft: '', photo: '', remarks: '' });
const shortDate = (iso) => {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
};
const TAB_IDS = ['inward', 'stock', 'step2'];

// Step 2 form fields keep a fixed vocabulary (matches the original SK Tiles
// dispatch sheet) instead of free text, so downstream logic that keys off
// these values (e.g. "is there a material issue?") can't be broken by a typo.
const STEP2_MATERIALS = ['Tile', 'Stone', 'Wood Vineer', 'Acralic', 'WPC', 'PLY Wood', 'MOP'];
const STEP2_ISSUES = ['No', 'Chiping', 'Breakage', 'Grain Opening', 'Flaking', 'Color Matching'];
const MAX_IMG_BYTES = 4 * 1024 * 1024;
// Slab photos are click-to-enlarge in the Stock table, so they are stored
// bigger than the 220px thumbnail they used to be — the file lands in Google
// Drive (see maybeUploadToDrive), not inline in a row, so the extra size only
// costs upload bandwidth, which the 3-row submit batching already handles.
const SLAB_IMG_PX = 900;

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
      {tab === 'step2' && <Step2 inv={inv} reload={loadInv} initialOrder={searchParams.get('orderNo') || ''} />}
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
  async function pickPhoto(i, file) { if (!file) return; try { set(i, 'photo', await fileToThumbnail(file, SLAB_IMG_PX, 0.7)); } catch {} }

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

  async function postEntriesBatch(entries, lotKey) {
    const res = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries, lotKey }) });
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
    // The register stamps one Uniquekey per submission, so every batch of this
    // Submit All reuses the key the first batch came back with.
    let lotKey = '';
    try {
      for (let i = 0; i < entries.length; i += SUBMIT_BATCH_SIZE) {
        const batch = entries.slice(i, i + SUBMIT_BATCH_SIZE);
        setStatus(`Saving ${i + 1}-${Math.min(i + batch.length, entries.length)} of ${entries.length}…`);
        const d = await postEntriesBatch(batch, lotKey);
        lotKey = lotKey || d.lotKey || '';
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
              <div className="flex items-center gap-1.5">
                {r.photo && <ZoomImg src={r.photo} className="h-9 w-9 rounded-lg object-cover border border-slate-200 shrink-0" />}
                <label className="cursor-pointer flex-1 flex items-center justify-center h-9 rounded-lg border border-dashed border-slate-300 overflow-hidden hover:border-primary-400 hover:bg-primary-50/30 transition-colors">
                  <span className={r.photo ? 'text-primary-600 text-[11px]' : 'text-slate-400 text-[11px]'}>{r.photo ? 'Change' : '+ Photo'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(i, e.target.files[0])} />
                </label>
              </div>
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
  const [statusF, setStatusF] = useState('Available');
  const [search, setSearch] = useState('');
  const [openLots, setOpenLots] = useState([]); // expanded lot keys
  const [sel, setSel] = useState([]);           // slab ids ticked for blocking
  const [block, setBlock] = useState(null);     // {orderNo, client, area} — bulk block form
  const [edit, setEdit] = useState(null);   // {id, slab, material, thickness, sizeL, sizeW, sft, remarks, photo}
  const [confirm, setConfirm] = useState(null); // {title, message, danger, onConfirm}
  const [photo, setPhoto] = useState(null); // enlarged slab photo (lightbox)
  const [saving, setSaving] = useState(false);

  // Both dropdowns are built from the register itself, NOT from the "Stone
  // Name" master tab: the register carries 65 distinct material names against
  // the master's 59, and 1500+ slabs sit under names the master never had
  // ("Mint", "Camel Brown", …). Listing master names here made those slabs
  // unreachable — the filter matched on a name the dropdown couldn't offer.
  // Matching is case/space-tolerant for the same reason ("40 MM" vs "40MM").
  const materialOpts = useMemo(() => {
    const m = new Map();
    inv.forEach((r) => { const k = normMat(r.material); if (k && !m.has(k)) m.set(k, String(r.material).trim()); });
    return Array.from(m.values()).sort((a, b) => a.localeCompare(b));
  }, [inv]);

  const thicknessOpts = useMemo(() => {
    const m = new Map();
    inv.forEach((r) => {
      if (mat && normMat(r.material) !== normMat(mat)) return;
      const k = normThk(r.thickness); if (k && !m.has(k)) m.set(k, String(r.thickness).trim());
    });
    return Array.from(m.values()).sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  }, [inv, mat]);

  // Filter-first: the register carries ~2700 slabs, so dumping every lot on
  // load is noise. Status doesn't count as a filter — it starts on Available.
  const hasFilters = !!(minSft || mat || thk || search.trim());

  const matched = useMemo(() => {
    const t = search.trim().toLowerCase();
    return inv.filter((r) => {
      if (mat && normMat(r.material) !== normMat(mat)) return false;
      if (thk && normThk(r.thickness) !== normThk(thk)) return false;
      if (statusF !== 'All' && r.status !== statusF) return false;
      if (t && !((r.slab + ' ' + r.key + ' ' + r.material + ' ' + r.client + ' ' + r.orderNo + ' ' + r.area).toLowerCase().includes(t))) return false;
      return true;
    });
  }, [inv, mat, thk, statusF, search]);

  // Stock is worked lot by lot, not slab by slab: one Inward submission = one
  // Uniquekey = one lot of ~19 slabs, and that is the unit the floor picks
  // from. So the list shows lots, and slabs only appear once a lot is opened.
  // Min SFT is read as "how much material do I need" — a lot qualifies when
  // its matching slabs ADD UP to that, even if no single slab is that big.
  const lots = useMemo(() => {
    const need = num(minSft);
    const groups = new Map();
    matched.forEach((r) => {
      const k = String(r.key || '').trim() || '—';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    const out = [];
    groups.forEach((slabs, key) => {
      const sfts = slabs.map((s) => num(s.sft));
      const total = Math.round(sfts.reduce((a, b) => a + b, 0) * 100) / 100;
      if (need && total < need) return;
      // Dedupe on the normalised name, show the spelling the sheet used —
      // otherwise "Mint" and "mint " in one lot read as "Mixed (2)".
      const uniq = (vals, norm) => {
        const m = new Map();
        vals.filter(Boolean).forEach((v) => { const k = norm(v); if (!m.has(k)) m.set(k, String(v).trim()); });
        return Array.from(m.values());
      };
      const mats = uniq(slabs.map((s) => s.material), normMat);
      const thks = uniq(slabs.map((s) => s.thickness), normThk);
      out.push({
        key, total, count: slabs.length,
        minSft: Math.min(...sfts), maxSft: Math.max(...sfts),
        material: mats.length > 1 ? `Mixed (${mats.length})` : (mats[0] || '—'),
        thickness: thks.length > 1 ? 'Mixed' : (thks[0] || '—'),
        createdAt: slabs.map((s) => s.createdAt).sort().pop() || '',
        slabs: [...slabs].sort((a, b) => num(a.sft) - num(b.sft)),
      });
    });
    return out.sort((a, b) =>
      String(a.material).localeCompare(String(b.material))
      || String(a.thickness).localeCompare(String(b.thickness))
      || String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [matched, minSft]);

  const rows = hasFilters ? lots : [];
  const totalSlabs = rows.reduce((n, l) => n + l.count, 0);

  // Only Available slabs can be blocked; the rest stay visible but un-tickable.
  const lotIds = (lot) => lot.slabs.filter((s) => s.status === 'Available').map((s) => s.id);
  const toggleLot = (k) => setOpenLots((o) => o.includes(k) ? o.filter((x) => x !== k) : [...o, k]);
  const toggleSlab = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleLotSel = (lot, on) => {
    const ids = lotIds(lot);
    setSel((s) => on ? Array.from(new Set([...s, ...ids])) : s.filter((x) => !ids.includes(x)));
  };

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
  const askUnblock = (r) => setConfirm({
    title: 'Unblock Slab', danger: true,
    message: `"${r.slab}" will be released from order ${r.orderNo || '—'} and set back to Available.`,
    onConfirm: () => { setConfirm(null); patch({ id: r.id, status: 'Available', orderNo: '', client: '', area: '' }); },
  });
  const askMarkSold = (r) => setConfirm({
    title: 'Mark as Sold',
    message: `"${r.slab}" will be marked Sold and removed from the available/blocking pool.`,
    onConfirm: () => { setConfirm(null); patch({ id: r.id, status: 'Sold' }); },
  });
  const askRevertSold = (r) => setConfirm({
    title: 'Revert Sale',
    message: `"${r.slab}" will be set back to Available.`,
    onConfirm: () => { setConfirm(null); patch({ id: r.id, status: 'Available' }); },
  });
  // One PATCH for whatever the dialog was opened with — a single row's Block
  // button, or the ticked selection, which may span several lots.
  async function confirmBlock() {
    const ids = block?.ids || [];
    if (!ids.length) return;
    setSaving(true);
    try {
      await patch({ ids, status: 'Blocked', orderNo: block.orderNo, client: block.client, area: block.area });
      setSel((s) => s.filter((x) => !ids.includes(x)));
      setBlock(null);
    } finally { setSaving(false); }
  }
  async function saveEdit() {
    await patch({ id: edit.id, slab: edit.slab, material: edit.material, thickness: edit.thickness,
      sizeL: edit.sizeL, sizeW: edit.sizeW, sft: edit.sft, remarks: edit.remarks, slabPhoto: edit.photo });
    setEdit(null);
  }
  async function editPhoto(file) { if (!file) return; try { const url = await fileToThumbnail(file, SLAB_IMG_PX, 0.7); setEdit((x) => ({ ...x, photo: url })); } catch {} }
  const editThkOpts = (edit && masters.thicknessMap[edit.material]) || [];

  function csv() {
    const head = ['Lot', 'Slab', 'Material', 'Thk', 'L', 'W', 'SFT', 'Status', 'Order', 'Client', 'Area', 'Remarks'];
    const cell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const lines = rows.flatMap((lot) => lot.slabs.map((r) =>
      [cell(lot.key), cell(r.slab), cell(r.material), r.thickness, r.sizeL, r.sizeW, r.sft, r.status, cell(r.orderNo), cell(r.client), cell(r.area), cell(r.remarks)].join(',')));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'stock.csv'; a.click();
  }

  const badge = (s) => ({
    Available: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    Blocked: 'bg-red-50 text-red-700 border border-red-100',
    Step2: 'bg-amber-50 text-amber-700 border border-amber-100',
    Sold: 'bg-blue-50 text-blue-700 border border-blue-100',
    Used: 'bg-slate-100 text-slate-500 border border-slate-200',
  }[s] || 'bg-slate-100 text-slate-600 border border-slate-200');

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <F label="Min SFT"><input type="number" className="input !py-1 w-28" value={minSft} onChange={(e) => setMinSft(e.target.value)} placeholder="e.g. 35" /></F>
        <F label="Material"><select className="input !py-1 w-40" value={mat} onChange={(e) => { setMat(e.target.value); setThk(''); }}><option value="">All</option>{materialOpts.map((m) => <option key={m} value={m}>{m}</option>)}</select></F>
        <F label="Thickness"><select className="input !py-1 w-32" value={thk} onChange={(e) => setThk(e.target.value)}><option value="">All</option>{thicknessOpts.map((t) => <option key={t} value={t}>{t}</option>)}</select></F>
        <F label="Status"><select className="input !py-1 w-32" value={statusF} onChange={(e) => setStatusF(e.target.value)}>{['All', 'Available', 'Blocked', 'Step2', 'Sold', 'Used'].map((s) => <option key={s}>{s}</option>)}</select></F>
        <div className="relative flex-1 min-w-[180px]">
          <label className="label">Search</label>
          <svg className="absolute left-2.5 top-1/2 mt-[3px] -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input className="input !py-1 pl-8 w-full" placeholder="slab / client / order…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-secondary" disabled={!rows.length} onClick={csv}>⬇ Export CSV</button>
        <div className="w-full text-[11px] text-slate-400 -mt-1">
          Min SFT = material you need — lots whose slabs add up to at least that much are listed. Open a lot to pick and block its slabs.
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Available" value={stats.avail} tone="emerald" icon={<IconCheck />} />
        <Kpi label="Blocked" value={stats.blocked} tone="red" icon={<IconLock />} />
        <Kpi label="Used" value={stats.used} tone="stone" icon={<IconArchive />} />
        <Kpi label="Available SFT" value={stats.availSft} tone="gold" icon={<IconRuler />} />
      </div>

      {sel.length > 0 && (
        <div className="card p-3 flex items-center justify-between gap-3 flex-wrap sticky top-2 z-20 border-primary-200 bg-primary-50/70 backdrop-blur">
          <div className="text-[12.5px] text-slate-700"><b>{sel.length}</b> slab{sel.length > 1 ? 's' : ''} selected</div>
          <div className="flex gap-2">
            <button className="btn-ghost !px-2 !py-1" onClick={() => setSel([])}>Clear</button>
            <button className="btn-warn !px-3 !py-1" onClick={() => setBlock({ ids: sel, orderNo: '', client: '', area: '' })}>Block Selected</button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-400 text-[12.5px]">Loading…</div>
          ) : !hasFilters ? (
            <div className="p-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
                <IconSearch className="w-6 h-6 text-primary-500" />
              </div>
              <div className="text-[13.5px] font-semibold text-slate-700">Set a filter to see stock</div>
              <div className="text-[12px] text-slate-500 mt-0.5">Enter Min SFT, or pick a material / thickness — matching lots will be listed here.</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
                <IconBox className="w-6 h-6 text-primary-500" />
              </div>
              <div className="text-[13.5px] font-semibold text-slate-700">No lots found</div>
              <div className="text-[12px] text-slate-500 mt-0.5">Try a smaller Min SFT or different filters, or add new stock from the Inward tab.</div>
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                <tr>
                  <th className="table-th w-8"></th>
                  {['Lot', 'Material', 'Thk', statusF === 'Available' ? 'Avail' : 'Slabs', 'SFT Range', 'Total SFT', 'Date'].map((h) => (
                    <th key={h} className={`table-th whitespace-nowrap ${['Avail', 'Slabs', 'SFT Range', 'Total SFT'].includes(h) ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((lot) => {
                  const open = openLots.includes(lot.key);
                  const ids = lotIds(lot);
                  const picked = ids.filter((id) => sel.includes(id)).length;
                  return (
                    <Fragment key={lot.key}>
                      <tr className={`table-row cursor-pointer ${open ? 'bg-primary-50/40' : ''}`} onClick={() => toggleLot(lot.key)}>
                        <td className="table-td text-slate-400">
                          <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
                        </td>
                        <td className="table-td font-semibold text-slate-800 whitespace-nowrap">
                          {lot.key}
                          {picked > 0 && <span className="ml-1.5 pill bg-primary-100 text-primary-700 border border-primary-200">{picked} picked</span>}
                        </td>
                        <td className="table-td">{lot.material}</td>
                        <td className="table-td">{lot.thickness}</td>
                        <td className="table-td text-right tabular-nums font-semibold text-slate-700">{lot.count}</td>
                        <td className="table-td text-right tabular-nums text-slate-500">{lot.minSft} – {lot.maxSft}</td>
                        <td className="table-td text-right tabular-nums font-semibold text-slate-800">{lot.total}</td>
                        <td className="table-td text-slate-500 whitespace-nowrap">{shortDate(lot.createdAt)}</td>
                      </tr>

                      {open && (
                        <tr>
                          <td colSpan={8} className="p-0 bg-slate-50/60">
                            <div className="px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                <label className="flex items-center gap-1.5 text-[11.5px] text-slate-600 cursor-pointer">
                                  <input type="checkbox" disabled={!ids.length}
                                    checked={!!ids.length && picked === ids.length}
                                    onChange={(e) => toggleLotSel(lot, e.target.checked)} />
                                  Select all available ({ids.length})
                                </label>
                                <span className="text-[11px] text-slate-400">{lot.count} slab(s) in this lot</span>
                              </div>
                              <table className="w-full text-[12px] bg-white rounded-lg overflow-hidden">
                                <thead>
                                  <tr>
                                    {['', 'Slab', 'L', 'W', 'SFT', 'Status', 'Order', 'Client', 'Area', 'Remarks', ''].map((h, i) => (
                                      <th key={i} className={`table-th whitespace-nowrap ${['L', 'W', 'SFT'].includes(h) ? 'text-right' : ''}`}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {lot.slabs.map((r) => (
                                    <tr key={r.id} className="table-row">
                                      <td className="table-td">
                                        <input type="checkbox" disabled={r.status !== 'Available'}
                                          checked={sel.includes(r.id)} onChange={() => toggleSlab(r.id)} />
                                      </td>
                                      <td className="table-td font-medium text-slate-800 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                          <span>{r.slab}</span>
                                          {r.slabPhoto ? (
                                            <button
                                              type="button"
                                              title="Click to enlarge"
                                              onClick={() => setPhoto(r.slabPhoto)}
                                              className="w-7 h-7 rounded overflow-hidden border border-slate-200 hover:ring-2 hover:ring-primary-300 transition-shadow shrink-0"
                                            >
                                              <img src={r.slabPhoto} alt={r.slab} className="w-full h-full object-cover" />
                                            </button>
                                          ) : null}
                                        </div>
                                      </td>
                                      <td className="table-td text-right tabular-nums">{r.sizeL}</td>
                                      <td className="table-td text-right tabular-nums">{r.sizeW}</td>
                                      <td className="table-td text-right tabular-nums font-semibold text-slate-700">{r.sft}</td>
                                      <td className="table-td"><span className={`pill ${badge(r.status)}`}>{r.status}</span></td>
                                      <td className="table-td">{r.orderNo || '—'}</td><td className="table-td">{r.client || '—'}</td><td className="table-td">{r.area || '—'}</td>
                                      <td className="table-td max-w-[140px] truncate" title={r.remarks}>{r.remarks || '—'}</td>
                                      <td className="table-td whitespace-nowrap">
                                        <div className="flex gap-1 justify-end">
                                          {r.status === 'Available' && <button className="btn-danger !px-2 !py-1" onClick={() => setBlock({ ids: [r.id], slab: r.slab, orderNo: '', client: '', area: '' })}>Block</button>}
                                          {r.status === 'Blocked' && <button className="btn-success !px-2 !py-1" onClick={() => askUnblock(r)}>Unblock</button>}
                                          {r.status === 'Sold' && <button className="btn-success !px-2 !py-1" onClick={() => askRevertSold(r)}>Revert</button>}
                                          <button className="btn-ghost !px-2 !py-1" onClick={() => setEdit({ id: r.id, slab: r.slab, status: r.status, material: r.material, thickness: r.thickness, sizeL: r.sizeL, sizeW: r.sizeW, sft: r.sft, remarks: r.remarks, photo: r.slabPhoto })}>Edit</button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {hasFilters && rows.length > 0 && (
        <div className="text-[11.5px] text-slate-500 px-1">{rows.length} lot(s) · {totalSlabs} slab(s) matching</div>
      )}

      {block && (
        <Modal title={block.slab ? `Block Slab ${block.slab}` : `Block ${block.ids.length} Slab${block.ids.length > 1 ? 's' : ''}`} onClose={() => setBlock(null)}>
          <F label="Order No."><input className="input" value={block.orderNo} onChange={(e) => setBlock({ ...block, orderNo: e.target.value })} placeholder="ORD-2026-001" /></F>
          <F label="Client Name"><input className="input" value={block.client} onChange={(e) => setBlock({ ...block, client: e.target.value })} /></F>
          <F label="Area / Project"><input className="input" value={block.area} onChange={(e) => setBlock({ ...block, area: e.target.value })} /></F>
          <div className="flex gap-2 justify-end mt-3"><button className="btn-ghost" onClick={() => setBlock(null)}>Cancel</button><button className="btn-warn" disabled={saving} onClick={confirmBlock}>{saving ? 'Blocking…' : `Block ${block.ids.length} Slab${block.ids.length > 1 ? 's' : ''}`}</button></div>
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
            <div className="flex items-center gap-2">
              {edit.photo && (
                <img
                  src={edit.photo}
                  alt=""
                  title="Click to view full image"
                  className="h-12 w-12 rounded-lg object-cover border border-slate-200 shrink-0 cursor-zoom-in"
                  onClick={() => setPhoto(edit.photo)}
                />
              )}
              <label className="cursor-pointer flex-1 flex items-center justify-center h-12 rounded-lg border border-dashed border-slate-300 overflow-hidden hover:border-primary-400 transition-colors">
                <span className="text-[11px] text-slate-400">{edit.photo ? 'Replace photo' : '+ Add photo'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => editPhoto(e.target.files[0])} />
              </label>
            </div>
          </F>
          {/* Selling a slab is rare next to blocking, so it lives here rather
              than as a button on every row of an open lot. */}
          <div className="flex gap-2 justify-between items-center mt-3">
            {edit.status === 'Available'
              ? <button className="btn-ghost !text-slate-500" onClick={() => { const r = edit; setEdit(null); askMarkSold(r); }}>Mark Sold</button>
              : <span />}
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn-warn" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message} danger={confirm.danger}
          onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}

      {photo && <Lightbox src={photo} onClose={() => setPhoto(null)} />}
      {saving && <SaveLoader text="Blocking slabs…" />}
    </div>
  );
}

/* ───────────────────────── STEP 2 ───────────────────────── */
// Slab lifecycle: Available → Blocked (Stock tab) → Step2 (in review, this
// tab) → Used (on final submit) — with Sold as a side-exit straight from
// Available. Order dropdown only lists orders still in Blocked/Step2 since
// those are the only ones with anything left to do here.
function Step2({ inv, reload, initialOrder = '' }) {
  const [orderNo, setOrderNo] = useState(initialOrder);
  const [data, setData] = useState(null); // {key, client, area, slabs}
  const [cut, setCut] = useState({}); // { [slabId]: {cutting, cuttingReason, cuttingSizeL, cuttingSizeW} }
  const [hdr, setHdr] = useState({ material: '', allPieces: '', grain: '', issue: '', sizesPacking: '', grainImg: '', matImg: '' });
  const [imgStatus, setImgStatus] = useState({ grainImg: '', matImg: '' }); // '' | 'ready' | 'toolarge'
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSel, setAddSel] = useState([]);
  const [confirm, setConfirm] = useState(null);

  const orderOptions = useMemo(() => {
    const seen = new Set();
    inv.forEach((r) => {
      const o = (r.orderNo || '').trim();
      if (o && (r.status === 'Blocked' || r.status === 'Step2')) seen.add(o);
    });
    // An order arriving from an FMS step may have no blocked slabs yet, which
    // is exactly when the doer needs to add them — keep it selectable rather
    // than silently falling back to "Choose an order".
    if (initialOrder.trim()) seen.add(initialOrder.trim());
    return Array.from(seen).sort();
  }, [inv, initialOrder]);

  const availableSlabs = useMemo(() => inv.filter((r) => r.status === 'Available'), [inv]);

  async function load(o) {
    const target = (o ?? orderNo).trim();
    if (!target) { setData(null); return; }
    setStatus('Loading…'); setData(null);
    try {
      const d = await (await fetch('/api/inventory/step2?orderNo=' + encodeURIComponent(target))).json();
      if (d.error) throw new Error(d.error);
      setData(d);
      const c = {};
      (d.slabs || []).forEach((s) => { c[s.id] = { cutting: 'No', cuttingReason: '', cuttingSizeL: '', cuttingSizeW: '' }; });
      setCut(c);
      setHdr((h) => ({ ...h, material: (d.slabs || [])[0]?.material || '' }));
      setStatus(d.slabs?.length ? '' : 'No slabs for this order (block slabs to this order first).');
    } catch (e) { setStatus('❌ ' + e.message); }
  }
  function chooseOrder(o) { setOrderNo(o); load(o); }

  // Landed here from an FMS step's "Open Page on this Step" link, which now
  // carries ?orderNo=… — load it straight away so the doer never has to pick
  // their own order out of the dropdown.
  useEffect(() => {
    const o = initialOrder.trim();
    if (o) { setOrderNo(o); load(o); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrder]);

  const setC = (id, k, v) => setCut((c) => ({ ...c, [id]: { ...c[id], [k]: v } }));
  async function pick(key, setter, file) {
    if (!file) return;
    if (file.size > MAX_IMG_BYTES) { setImgStatus((s) => ({ ...s, [key]: 'toolarge' })); return; }
    setImgStatus((s) => ({ ...s, [key]: '' }));
    try { setter(await fileToThumbnail(file, 300, 0.7)); setImgStatus((s) => ({ ...s, [key]: 'ready' })); }
    catch { setImgStatus((s) => ({ ...s, [key]: 'toolarge' })); }
  }

  // Editable rows are the ones still awaiting a cutting decision; Used/Sold
  // rows from an earlier round stay visible for context but read-only.
  const editableSlabs = (data?.slabs || []).filter((s) => s.status === 'Blocked' || s.status === 'Step2');
  const blockedCount = editableSlabs.filter((s) => s.status === 'Blocked').length;
  const step2Count = editableSlabs.filter((s) => s.status === 'Step2').length;
  const hasSlabs = !!(data && data.slabs?.length > 0);

  async function bulkTransition(from, to) {
    setSaving(true);
    try {
      const res = await fetch('/api/inventory/step2', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderNo, from, to }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      await reload(); await load();
    } catch (e) { setStatus('❌ ' + e.message); }
    finally { setSaving(false); }
  }
  const startReview = () => setConfirm({
    title: 'Start Step 2 Review', message: `${blockedCount} slab(s) will move from Blocked into Step 2 review.`,
    onConfirm: () => { setConfirm(null); bulkTransition('Blocked', 'Step2'); },
  });
  const revertReview = () => setConfirm({
    title: 'Revert to Blocked', message: `${step2Count} slab(s) will move back from Step 2 review to Blocked.`,
    onConfirm: () => { setConfirm(null); bulkTransition('Step2', 'Blocked'); },
  });

  function removeSlab(s) {
    setConfirm({
      title: 'Remove Slab', danger: true,
      message: `"${s.slab}" will be released from order ${orderNo} and set back to Available.`,
      onConfirm: async () => {
        setConfirm(null);
        await fetch('/api/inventory', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, status: 'Available', orderNo: '', client: '', area: '' }) });
        await reload(); await load();
      },
    });
  }

  function openAddSlabs() { setAddSel([]); setAddOpen(true); }
  async function confirmAddSlabs() {
    if (!addSel.length) return;
    setSaving(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: addSel, status: 'Blocked', orderNo, client: data?.client || '', area: data?.area || '' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setAddOpen(false); setAddSel([]);
      await reload(); await load();
    } catch (e) { setStatus('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  function printReport() {
    if (!data) return;
    const html = buildStep2Report(orderNo.trim(), hdr, editableSlabs, cut);
    const w = window.open('', '_blank');
    if (!w) { setStatus('❌ Popup blocked — allow popups to print.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  }

  // Cutting "Yes" without a size isn't a valid cut — nothing to remnant, and
  // the cutting report would print a blank. Block submit and name the slabs.
  function cuttingErrors() {
    return editableSlabs
      .filter((s) => cut[s.id]?.cutting === 'Yes' && (!num(cut[s.id]?.cuttingSizeL) || !num(cut[s.id]?.cuttingSizeW)))
      .map((s) => s.slab);
  }

  async function submit() {
    if (!data || !editableSlabs.length) return;
    const missing = cuttingErrors();
    if (missing.length) { setStatus('❌ Cut L & Cut W required for: ' + missing.join(', ')); return; }
    setSaving(true); setStatus('Submitting…');
    try {
      const cuttingRows = editableSlabs.map((s) => ({ id: s.id, slab: s.slab, ...cut[s.id] }));
      const body = { orderNo: orderNo.trim(), key: data.key, ...hdr, cuttingRows };
      const res = await fetch('/api/inventory/step2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setStatus('✅ Saved — slabs marked Used, remnants created.');
      setData(null); setCut({}); setOrderNo(''); await reload();
    } catch (e) { setStatus('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <Stepper current={hasSlabs ? 1 : 0} />
      </div>

      <div className="card p-5">
        <div className="flex items-end gap-2 flex-wrap">
          <F label="Order No.">
            <select className="input" value={orderNo} onChange={(e) => chooseOrder(e.target.value)}>
              <option value="">Choose an order</option>
              {orderOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </F>
          {status && <span className="text-[12px] text-slate-600 ml-2">{status}</span>}
        </div>
      </div>

      {!data && (
        <div className="card p-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
            <IconSearch className="w-6 h-6 text-primary-500" />
          </div>
          <div className="text-[13.5px] font-semibold text-slate-700">No order loaded yet</div>
          <div className="text-[12px] text-slate-500 mt-0.5">Pick an order above to begin blocking for jointing. Only orders with slabs Blocked or in Step 2 review are listed.</div>
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
          <div className="card p-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12.5px] text-slate-600">
              <b className="text-slate-800">Order:</b> {orderNo} &nbsp; <b className="text-slate-800">Client:</b> {data.client || '—'} &nbsp;
              <b className="text-slate-800">Area:</b> {data.area || '—'} &nbsp; <b className="text-slate-800">Key:</b> {data.key || '—'} &nbsp;
              <b className="text-slate-800">Slabs:</b> {data.slabs.length}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-secondary !px-2 !py-1" onClick={openAddSlabs}>+ Add Slabs</button>
              {blockedCount > 0 && <button className="btn-secondary !px-2 !py-1" onClick={startReview}>Start Step 2 Review ({blockedCount})</button>}
              {step2Count > 0 && <button className="btn-ghost !px-2 !py-1" onClick={revertReview}>Revert to Blocked ({step2Count})</button>}
            </div>
          </div>

          <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <F label="Material">
              <select className="input" value={hdr.material} onChange={(e) => setHdr({ ...hdr, material: e.target.value })}>
                <option value="">Select</option>{STEP2_MATERIALS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </F>
            <F label="All pieces used?">
              <select className="input" value={hdr.allPieces} onChange={(e) => setHdr({ ...hdr, allPieces: e.target.value })}>
                <option value="">Select</option><option>Yes</option><option>No</option>
              </select>
            </F>
            <F label="Grain matching">
              <select className="input" value={hdr.grain} onChange={(e) => setHdr({ ...hdr, grain: e.target.value })}>
                <option value="">Select</option><option value="Y">Y</option><option value="N">N</option>
              </select>
            </F>
            <F label="Material issue">
              <select className="input" value={hdr.issue} onChange={(e) => setHdr({ ...hdr, issue: e.target.value })}>
                <option value="">Select</option>{STEP2_ISSUES.map((i) => <option key={i}>{i}</option>)}
              </select>
            </F>
            <F label="Sizes given to packing?">
              <select className="input" value={hdr.sizesPacking} onChange={(e) => setHdr({ ...hdr, sizesPacking: e.target.value })}>
                <option value="">Select</option><option>Yes</option><option>No</option>
              </select>
            </F>
            <div className="flex gap-3">
              <ImgUpload label="Grain Photo" value={hdr.grainImg} imgStatus={imgStatus.grainImg}
                onPick={(f) => pick('grainImg', (v) => setHdr((h) => ({ ...h, grainImg: v })), f)} />
              <ImgUpload label="Material Photo" value={hdr.matImg} imgStatus={imgStatus.matImg}
                onPick={(f) => pick('matImg', (v) => setHdr((h) => ({ ...h, matImg: v })), f)} />
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr>
                    {['Slab', 'Status', 'Material', 'Thk', 'L', 'W', 'SFT', 'Cutting?', 'Reason', 'Cut L*', 'Cut W*', ''].map((h, i) => (
                      <th key={i} className={`table-th whitespace-nowrap ${['L', 'W', 'SFT', 'Cut L*', 'Cut W*'].includes(h) ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slabs.map((s) => {
                    const c = cut[s.id] || { cutting: 'No', cuttingReason: '', cuttingSizeL: '', cuttingSizeW: '' };
                    const editable = s.status === 'Blocked' || s.status === 'Step2';
                    const needsCut = c.cutting === 'Yes';
                    const missL = needsCut && !num(c.cuttingSizeL);
                    const missW = needsCut && !num(c.cuttingSizeW);
                    return (
                      <tr key={s.id} className="table-row">
                        <td className="table-td font-medium text-slate-800">{s.slab}</td>
                        <td className="table-td"><span className={`pill ${STOCK_BADGE(s.status)}`}>{s.status}</span></td>
                        <td className="table-td">{s.material}</td><td className="table-td">{s.thickness}</td>
                        <td className="table-td text-right tabular-nums">{s.sizeL}</td>
                        <td className="table-td text-right tabular-nums">{s.sizeW}</td>
                        <td className="table-td text-right tabular-nums font-semibold text-slate-700">{s.sft}</td>
                        <td className="table-td"><select className="input !py-1" value={c.cutting} onChange={(e) => setC(s.id, 'cutting', e.target.value)} disabled={!editable}><option>No</option><option>Yes</option></select></td>
                        <td className="table-td"><input className="input !py-1" placeholder={needsCut ? 'Reason' : ''} value={c.cuttingReason} onChange={(e) => setC(s.id, 'cuttingReason', e.target.value)} disabled={!editable || !needsCut} /></td>
                        <td className="table-td w-16">
                          <input type="number" step="0.01" placeholder={needsCut ? 'Required' : ''}
                            className={`input !py-1 text-right ${missL ? '!border-red-400 !bg-red-50' : ''}`}
                            value={c.cuttingSizeL} onChange={(e) => setC(s.id, 'cuttingSizeL', e.target.value)} disabled={!editable || !needsCut} />
                        </td>
                        <td className="table-td w-16">
                          <input type="number" step="0.01" placeholder={needsCut ? 'Required' : ''}
                            className={`input !py-1 text-right ${missW ? '!border-red-400 !bg-red-50' : ''}`}
                            value={c.cuttingSizeW} onChange={(e) => setC(s.id, 'cuttingSizeW', e.target.value)} disabled={!editable || !needsCut} />
                        </td>
                        <td className="table-td">{editable && <button className="btn-danger !px-2 !py-1" onClick={() => removeSlab(s)}>Remove</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {(() => {
            const missing = cuttingErrors();
            return (
              <div className="flex flex-wrap justify-end items-center gap-2">
                {missing.length > 0 && <span className="text-[12px] text-red-600">Cut L &amp; Cut W required for: {missing.join(', ')}</span>}
                <button className="btn-secondary" onClick={printReport}>⬇ Cutting Report</button>
                <button className="btn-warn" disabled={saving || !editableSlabs.length || missing.length > 0} onClick={submit}>{saving ? 'Submitting…' : 'Submit Blocking'}</button>
              </div>
            );
          })()}
          <p className="text-[11.5px] text-slate-500">Cutting "Yes" → slab marked <b className="text-slate-700">Used</b>, a remnant slab (size − cut) is auto-created as Available, and a WhatsApp update is sent. Cut L &amp; Cut W are required whenever Cutting is Yes.</p>
        </>
      )}

      {addOpen && (
        <Modal title="Choose Slabs" onClose={() => setAddOpen(false)}>
          <p className="text-[12px] text-slate-500 -mt-1 mb-2">Select from available slabs to block them for order {orderNo}.</p>
          <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
            {availableSlabs.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-slate-400">No available slabs.</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="table-th"><input type="checkbox" checked={addSel.length === availableSlabs.length} onChange={(e) => setAddSel(e.target.checked ? availableSlabs.map((r) => r.id) : [])} /></th>
                    <th className="table-th">Slab</th><th className="table-th">Material</th><th className="table-th">Size</th><th className="table-th">SFT</th>
                  </tr>
                </thead>
                <tbody>
                  {availableSlabs.map((r) => (
                    <tr key={r.id} className="table-row">
                      <td className="table-td"><input type="checkbox" checked={addSel.includes(r.id)} onChange={(e) => setAddSel((sel) => e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /></td>
                      <td className="table-td font-medium text-slate-800">{r.slab}</td>
                      <td className="table-td">{r.material}</td>
                      <td className="table-td">{r.sizeL}x{r.sizeW}</td>
                      <td className="table-td">{r.sft}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-warn" disabled={!addSel.length || saving} onClick={confirmAddSlabs}>Block Selected ({addSel.length})</button>
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message} danger={confirm.danger}
          onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}

      {saving && <SaveLoader text="Saving…" />}
    </div>
  );
}

const STOCK_BADGE = (s) => ({
  Available: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  Blocked: 'bg-red-50 text-red-700 border border-red-100',
  Step2: 'bg-amber-50 text-amber-700 border border-amber-100',
  Sold: 'bg-blue-50 text-blue-700 border border-blue-100',
  Used: 'bg-slate-100 text-slate-500 border border-slate-200',
}[s] || 'bg-slate-100 text-slate-600 border border-slate-200');

function ImgUpload({ label, value, imgStatus, onPick }) {
  return (
    <F label={label}>
      <div className="flex items-center gap-1.5">
        {value && <ZoomImg src={value} className="h-9 w-9 rounded-lg object-cover border border-slate-200 shrink-0" />}
        <label className="cursor-pointer flex-1 flex items-center justify-center h-9 px-2 rounded-lg border border-dashed border-slate-300 overflow-hidden hover:border-primary-400 transition-colors">
          <span className={`text-[11px] ${value ? 'text-primary-600' : 'text-slate-400'}`}>{value ? 'Change' : `+ ${label.replace(' Photo', '')}`}</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files[0])} />
        </label>
      </div>
      {imgStatus === 'ready' && <span className="text-[10px] text-emerald-600 mt-0.5">✓ Ready</span>}
      {imgStatus === 'toolarge' && <span className="text-[10px] text-red-600 mt-0.5">File too large — max 4MB</span>}
    </F>
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

// Shared "are you sure?" dialog — used before destructive/bulk actions
// (unblock, remove slab, mark sold, revert lifecycle) instead of firing
// straight away like the old flat PATCH calls did.
function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-start justify-center overflow-y-auto z-[60] pt-24 px-4 pb-4 animate-fade-in" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl p-5 w-96 max-w-[92%]" onClick={(e) => e.stopPropagation()}>
        <div className="text-[14px] font-semibold text-slate-900 font-display mb-1">{title}</div>
        <div className="text-[12.5px] text-slate-500 mb-4 leading-relaxed">{message}</div>
        <div className="flex gap-2 justify-end">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-warn'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// Full-screen loader for slower multi-step saves (Step 2 submit, bulk block).
function SaveLoader({ text = 'Saving…' }) {
  return (
    <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <div className="w-12 h-12 rounded-full border-4 border-white/30 border-t-primary-400 animate-spin" />
      <div className="text-white text-[14px] font-medium">{text}</div>
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
