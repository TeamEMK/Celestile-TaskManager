'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { fileToThumbnail } from '@/app/quotation/imageThumb';

const blank = () => ({
  description: '', doerId: '', dueDate: '', client: '',
  priority: 'Low', approval: 'No Approval',
  url: '', remarks: '', image: '',
  attachment: '', requireFile: false,
});

async function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const looksHeader = header.includes('doer_email') || header.includes('description');
  const cols = looksHeader ? header : ['doer_email', 'due_date', 'priority', 'approval', 'description', 'remarks', 'client_name'];
  const start = looksHeader ? 1 : 0;
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const row = {};
    cols.forEach((c, idx) => { row[c] = (parts[idx] || '').trim(); });
    out.push(row);
  }
  return out;
}

const Field = ({ label, required, children }) => (
  <div>
    <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>
      {label}{required && <span style={{ color:'#ef4444', marginLeft:2 }}>*</span>}
    </label>
    {children}
  </div>
);

const inputStyle = {
  width:'100%', boxSizing:'border-box',
  padding:'9px 12px', fontSize:13, color:'#1e293b',
  background:'#f8fafc', border:'1.5px solid #e2e8f0',
  borderRadius:10, outline:'none', transition:'border-color .15s, box-shadow .15s',
  fontFamily:'inherit',
};
const inputFocus = {
  borderColor:'#818cf8', boxShadow:'0 0 0 3px rgba(129,140,248,0.15)',
};

function StyledInput(props) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      {...props}
      style={{ ...inputStyle, ...(focus ? inputFocus : {}), ...props.style }}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    />
  );
}
function StyledSelect({ children, ...props }) {
  const [focus, setFocus] = useState(false);
  return (
    <select
      {...props}
      style={{ ...inputStyle, ...(focus ? inputFocus : {}), appearance:'none',
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center',
        paddingRight:30, cursor:'pointer' }}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    >
      {children}
    </select>
  );
}
function StyledTextarea(props) {
  const [focus, setFocus] = useState(false);
  return (
    <textarea
      {...props}
      style={{ ...inputStyle, resize:'none', lineHeight:1.5, ...(focus ? inputFocus : {}), ...props.style }}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    />
  );
}

export default function AddDelegateModal({ open, onClose, users: propUsers = [] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [file, setFile] = useState(null);
  const [users, setUsers] = useState(propUsers);
  const [csvOpen, setCsvOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/users').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setUsers(d.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    }).catch(() => {});
  }, [open]);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function pickAttachment(f) {
    if (!f) return;
    try {
      if (f.type === 'application/pdf') {
        set('attachment', await fileToDataUrl(f));
        set('image', '');
      } else {
        set('image', await fileToThumbnail(f, 700, 0.7));
        set('attachment', '');
      }
    } catch {}
  }

  async function save() {
    if (!form.description.trim() || !form.doerId || !form.dueDate) {
      setMsg('Description, Doer and Due Date are required.');
      return;
    }
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/delegations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, requireFile: form.requireFile ? 1 : 0, delegatedBy: session?.user?.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setForm(blank());
      onClose();
      router.refresh();
    } catch (e) {
      setMsg('❌ ' + e.message);
    } finally { setSaving(false); }
  }

  async function uploadCsv() {
    if (!file) { setMsg('Please choose a CSV file first.'); return; }
    setSaving(true); setMsg('');
    try {
      const rows = parseCSV(await file.text());
      if (!rows.length) { setMsg('No valid rows found in CSV.'); setSaving(false); return; }
      const res = await fetch('/api/delegations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk: rows, delegatedBy: session?.user?.id }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Upload failed');
      setMsg(`✅ ${out.inserted} added${out.errors?.length ? ` · ${out.errors.length} skipped` : ''}`);
      setFile(null);
      router.refresh();
    } catch (e) {
      setMsg('❌ ' + e.message);
    } finally { setSaving(false); }
  }

  function downloadSample() {
    const csv =
      'doer_email,approver_email,due_date,priority,approval,description,remarks,client_name\n' +
      'someone@example.com,manager@example.com,2026-06-15,High,Approval Required,Finish landing page,Urgent,Ambraee\n' +
      'john@example.com,,2026-06-20,Low,No Approval,Update weekly report,,Sohan Health Care\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'delegation-sample.csv';
    a.click();
  }

  const hasAttachment = form.image || form.attachment;

  return (
    <div
      onClick={onClose}
      style={{
        position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center',
        padding:16, background:'rgba(15,23,42,0.45)', backdropFilter:'blur(6px)',
        animation:'fadeIn .2s ease',
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(18px) scale(.98) } to { opacity:1; transform:translateY(0) scale(1) } }
        .del-modal-scroll::-webkit-scrollbar { width:4px }
        .del-modal-scroll::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:99px }
        .del-modal-scroll::-webkit-scrollbar-track { background:transparent }
        .del-file-zone:hover { border-color:#818cf8 !important; background:#f5f3ff !important; }
        .del-csv-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:'#fff', borderRadius:20, width:'100%', maxWidth:520,
          maxHeight:'92vh', display:'flex', flexDirection:'column',
          boxShadow:'0 24px 80px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)',
          animation:'slideUp .25s cubic-bezier(.16,1,.3,1)',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding:'18px 22px 16px',
          borderBottom:'1px solid #f1f5f9',
          background:'linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)',
          borderRadius:'20px 20px 0 0',
          display:'flex', alignItems:'center', gap:12,
        }}>
          <div style={{
            width:40, height:40, borderRadius:12, flexShrink:0,
            background:'linear-gradient(135deg,#7c3aed,#4f46e5)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 12px rgba(124,58,237,0.35)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="m17 11 2 2 4-4"/>
            </svg>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#3730a3' }}>Delegate Task</div>
            <div style={{ fontSize:11.5, color:'#6d28d9', marginTop:2 }}>Assign new work to a team member</div>
          </div>
          <button
            onClick={onClose}
            style={{ width:32, height:32, borderRadius:8, border:'none', background:'rgba(109,40,217,0.08)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#7c3aed' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="del-modal-scroll" style={{ padding:'20px 22px', overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>

          {/* Row 1: Doer + Due Date */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Assign To" required>
              <StyledSelect value={form.doerId} onChange={(e) => set('doerId', e.target.value)}>
                <option value="">Select person</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </StyledSelect>
            </Field>
            <Field label="Due Date" required>
              <StyledInput type="date" value={form.dueDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => set('dueDate', e.target.value)} />
            </Field>
          </div>

          {/* Row 2: Priority + Approval */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Priority">
              <StyledSelect value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                <option>Low</option><option>Medium</option><option>High</option>
              </StyledSelect>
            </Field>
            <Field label="Approval">
              <StyledSelect value={form.approval} onChange={(e) => set('approval', e.target.value)}>
                <option>No Approval</option><option>Approval Required</option>
              </StyledSelect>
            </Field>
          </div>

          {/* Description */}
          <Field label="Description" required>
            <StyledTextarea value={form.description} rows={3} onChange={(e) => set('description', e.target.value)} placeholder="What needs to be done?" />
          </Field>

          {/* Client + URL */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Client">
              <StyledInput value={form.client} onChange={(e) => set('client', e.target.value)} placeholder="Client name (optional)" />
            </Field>
            <Field label="URL">
              <StyledInput value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://..." />
            </Field>
          </div>

          {/* Remarks */}
          <Field label="Remarks">
            <StyledTextarea value={form.remarks} rows={2} onChange={(e) => set('remarks', e.target.value)} placeholder="Any additional notes..." />
          </Field>

          {/* Attachment + Require File */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'start' }}>

            {/* Attachment */}
            <Field label="Photo / PDF">
              <label
                className="del-file-zone"
                style={{
                  display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                  border:'1.5px dashed #c7d2fe', borderRadius:10, cursor:'pointer',
                  background:'#fafafa', transition:'all .15s',
                }}
              >
                <div style={{
                  width:38, height:38, borderRadius:8, background:'#ede9fe', flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden',
                }}>
                  {form.image
                    ? <img src={form.image} alt="" style={{ width:38, height:38, objectFit:'cover' }} />
                    : form.attachment
                    ? <span style={{ fontSize:20 }}>📄</span>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  }
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#4c1d95' }}>
                    {hasAttachment ? 'Change file' : 'Attach file'}
                  </div>
                  <div style={{ fontSize:10.5, color:'#94a3b8', marginTop:1 }}>Image or PDF</div>
                </div>
                <input type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={(e) => pickAttachment(e.target.files?.[0])} />
              </label>
              {hasAttachment && (
                <div style={{ display:'flex', gap:8, marginTop:5 }}>
                  {form.attachment && <a href={form.attachment} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:'#4f46e5' }}>View PDF</a>}
                  <button type="button" onClick={() => { set('image',''); set('attachment',''); }} style={{ fontSize:11, color:'#ef4444', background:'none', border:'none', cursor:'pointer', padding:0 }}>Remove</button>
                </div>
              )}
            </Field>

            {/* Require File */}
            <Field label="Completion">
              <label style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', border:'1.5px solid #e2e8f0', borderRadius:10, cursor:'pointer', background: form.requireFile ? '#fdf4ff' : '#fafafa', transition:'all .15s' }}>
                <div style={{ position:'relative', width:36, height:20, flexShrink:0, marginTop:1 }}>
                  <input type="checkbox" checked={form.requireFile} onChange={(e) => set('requireFile', e.target.checked)} style={{ opacity:0, width:0, height:0, position:'absolute' }} />
                  <div style={{
                    width:36, height:20, borderRadius:10, transition:'background .2s',
                    background: form.requireFile ? '#7c3aed' : '#cbd5e1',
                    position:'absolute', inset:0,
                  }}/>
                  <div style={{
                    position:'absolute', top:2, left: form.requireFile ? 18 : 2,
                    width:16, height:16, borderRadius:8, background:'#fff',
                    transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,0.25)',
                  }}/>
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color: form.requireFile ? '#4c1d95' : '#475569' }}>File required</div>
                  <div style={{ fontSize:10.5, color:'#94a3b8', marginTop:1 }}>Must upload to mark done</div>
                </div>
              </label>
            </Field>
          </div>

          {/* Error / success msg */}
          {msg && (
            <div style={{ fontSize:12, padding:'8px 12px', borderRadius:8, background: msg.startsWith('❌') ? '#fef2f2' : '#f0fdf4', color: msg.startsWith('❌') ? '#dc2626' : '#16a34a', border:`1px solid ${msg.startsWith('❌') ? '#fecaca' : '#bbf7d0'}` }}>
              {msg}
            </div>
          )}

          {/* Bulk CSV — collapsible */}
          <div style={{ borderRadius:10, border:'1.5px dashed #e2e8f0', overflow:'hidden' }}>
            <button
              type="button"
              onClick={() => setCsvOpen(v => !v)}
              style={{ width:'100%', padding:'9px 14px', background:'#f8fafc', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11.5, fontWeight:600, color:'#64748b' }}
            >
              <span>Bulk Upload via CSV</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: csvOpen ? 'rotate(180deg)' : 'none', transition:'transform .2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {csvOpen && (
              <div style={{ padding:'12px 14px', background:'#fff', borderTop:'1px solid #f1f5f9' }}>
                <div className="del-csv-row">
                  <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)}
                    style={{ fontSize:12, flex:1, minWidth:0 }}
                    className="text-[12px] file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-1 file:text-[11px] file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
                  <button
                    style={{ padding:'6px 12px', fontSize:12, fontWeight:600, borderRadius:8, border:'none', cursor:'pointer', background: (!saving && file) ? '#059669' : '#d1fae5', color: (!saving && file) ? '#fff' : '#6ee7b7', opacity: saving ? .6 : 1 }}
                    disabled={saving || !file} onClick={uploadCsv}>⬆ Upload</button>
                  <button
                    style={{ padding:'6px 12px', fontSize:12, fontWeight:600, borderRadius:8, border:'1.5px solid #e2e8f0', cursor:'pointer', background:'#fff', color:'#64748b' }}
                    onClick={downloadSample}>⬇ Sample</button>
                </div>
                <div style={{ fontSize:10.5, color:'#94a3b8', marginTop:6 }}>
                  Format: doer_email, due_date, priority, approval, description, remarks, client_name
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding:'14px 22px', borderTop:'1px solid #f1f5f9',
          display:'flex', justifyContent:'flex-end', gap:8, borderRadius:'0 0 20px 20px',
          background:'#fafafa',
        }}>
          <button
            onClick={onClose}
            style={{ padding:'8px 18px', fontSize:13, fontWeight:600, borderRadius:10, border:'1.5px solid #e2e8f0', cursor:'pointer', background:'#fff', color:'#475569' }}
          >Cancel</button>
          <button
            onClick={save} disabled={saving}
            style={{
              padding:'8px 22px', fontSize:13, fontWeight:700, borderRadius:10, border:'none', cursor:'pointer',
              background: saving ? '#a5b4fc' : 'linear-gradient(135deg,#7c3aed,#4f46e5)',
              color:'#fff', opacity: saving ? .7 : 1,
              boxShadow: saving ? 'none' : '0 4px 14px rgba(124,58,237,0.4)',
              transition:'all .15s',
            }}
          >{saving ? 'Assigning…' : '✓ Assign Task'}</button>
        </div>
      </div>
    </div>
  );
}
