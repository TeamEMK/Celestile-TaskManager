'use client';
/**
 * Factory Attendance & Report.
 *
 * Replaces the daily Excel the floor runs on: one block per department, one
 * row per worker/machine. Three views —
 *   Daily     enter and read one day's report, department by department
 *   Workers   hours per person over a range
 *   Orders    an order's journey across departments
 * plus a Departments tab (admin) where the shape of every block is configured,
 * because the real reports change columns from one month to the next.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useConfirmToast } from '../components/ConfirmToast';
import Icon from '../components/Icon';
import {
  PageHeader, MetaLine, EmptyState, ErrorState, LoadingState,
  SearchInput, SectionTitle, ResultCount, StatCard, StatGrid,
} from '../components/ui';
import DateField from '../components/DateField';
import { suspectOrderNumbers, ORDER_HINT } from '@/lib/orderNumber';
import { isAdminRoles } from '@/lib/pages';

const todayISO = () => new Date().toLocaleDateString('en-CA');
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const fmtDate = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('-') : '—');

// Must match FIELDS in lib/production.js — the form and the printed table are
// both built from whichever of these a department has switched on.
const ALL_FIELDS = [
  { key: 'worker',         label: 'Name' },
  { key: 'helper',         label: 'Helper' },
  { key: 'order_number',   label: 'Order Number' },
  { key: 'hours',          label: 'Working Hours', numeric: true },
  { key: 'area',           label: 'Area' },
  { key: 'material',       label: 'Used Material' },
  { key: 'material_qty',   label: 'Used Material Quantity' },
  { key: 'work',           label: 'Work' },
  { key: 'machine_number', label: 'Machine Number' },
  { key: 'remarks',        label: 'Remarks' },
];

const SHIFTS = [
  { key: '',      label: 'Single shift' },
  { key: 'day',   label: 'Day Shift' },
  { key: 'night', label: 'Night Shift' },
];
const shiftLabel = (s) => (s === 'day' ? 'Day Shift' : s === 'night' ? 'Night Shift' : '');
const blankRow = () => Object.fromEntries(ALL_FIELDS.map((f) => [f.key, '']));

const TABS = [
  { key: 'daily',   label: 'Daily Report', icon: 'clipboard' },
  { key: 'workers', label: 'Worker Hours', icon: 'users' },
  { key: 'orders',  label: 'Order Tracking', icon: 'chart' },
  { key: 'setup',   label: 'Departments', icon: 'edit', adminOnly: true },
];

export default function ProductionClient() {
  const { data: session } = useSession();
  const isAdmin = isAdminRoles(session?.user?.roles);

  const [tab, setTab] = useState('daily');
  const [departments, setDepartments] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [err, setErr] = useState('');

  const loadDepartments = useCallback(async () => {
    setLoadingDepts(true);
    try {
      const r = await fetch('/api/production/departments');
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Failed to load departments'); return; }
      setDepartments(Array.isArray(d) ? d : []);
      setErr('');
    } catch { setErr('Failed to load departments'); }
    finally { setLoadingDepts(false); }
  }, []);

  useEffect(() => { loadDepartments(); }, [loadDepartments]);

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon="building" title="Factory Attendance & Report"
        subtitle={<MetaLine items={[
          `${departments.length} department${departments.length === 1 ? '' : 's'}`,
          'factory floor · daily',
        ]} />}
      />

      <div className="seg print:hidden">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`seg-btn flex items-center gap-1.5 ${tab === t.key ? 'seg-btn-active' : ''}`}>
            <Icon name={t.icon} className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {err ? <div className="card"><ErrorState title={err} /></div>
        : loadingDepts ? <div className="card"><LoadingState label="Loading departments…" /></div>
        : departments.length === 0 ? (
          <div className="card">
            <EmptyState icon="building" title="No departments configured yet"
              hint={isAdmin ? 'Add your first department in the Departments tab.' : 'Ask an admin to set up the departments.'} />
          </div>
        )
        : tab === 'daily'   ? <DailyReport departments={departments} />
        : tab === 'workers' ? <WorkerHours departments={departments} />
        : tab === 'orders'  ? <OrderTracking />
        : <DepartmentSetup departments={departments} reload={loadDepartments} />}
    </div>
  );
}

/* ── Daily report ─────────────────────────────────────────────────── */

function DailyReport({ departments }) {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // { departmentId, shift }
  const [importing, setImporting] = useState(false);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/production/day?date=${d}`);
      const j = await r.json();
      setData(r.ok ? j : null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  // Every block that should appear for this day: a department with shifts
  // contributes one block per shift.
  const blocks = useMemo(() => departments.flatMap((d) => (
    d.hasShifts
      ? [{ dept: d, shift: 'day' }, { dept: d, shift: 'night' }]
      : [{ dept: d, shift: '' }]
  )), [departments]);

  const rowsFor = useCallback((deptId, shift) =>
    (data?.entries || []).filter((e) => e.departmentId === deptId && (e.shift || '') === shift),
    [data]);
  const noteFor = useCallback((deptId, shift) =>
    (data?.notes || []).find((n) => n.departmentId === deptId && (n.shift || '') === shift)?.note || '',
    [data]);

  const totals = useMemo(() => {
    const entries = data?.entries || [];
    const hours = entries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
    const orders = new Set();
    const workers = new Set();
    for (const e of entries) {
      for (const o of String(e.order_number || '').split(/[,/&]/).map((x) => x.trim()).filter(Boolean)) orders.add(o.toUpperCase());
      for (const w of `${e.worker},${e.helper}`.split(/[,/&]/).map((x) => x.trim()).filter(Boolean)) workers.add(w.toUpperCase());
    }
    const depts = new Set(entries.map((e) => e.departmentId));
    return { rows: entries.length, hours: Math.round(hours * 10) / 10, orders: orders.size, workers: workers.size, depts: depts.size };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="toolbar print:hidden">
        <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Date</label>
        <DateField className="date-ctl" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn-secondary btn-sm" onClick={() => setDate(todayISO())}>Today</button>
        <button className="btn-secondary btn-sm" onClick={() => load(date)} disabled={loading}>
          <Icon name="refresh" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <div className="sm:ml-auto flex items-center gap-2">
          <ResultCount shown={totals.rows} total={totals.rows} noun="row" />
          <button className="btn-secondary btn-sm" onClick={() => setImporting(true)}>
            <Icon name="upload" className="w-3.5 h-3.5" /> Import Excel
          </button>
          <button className="btn-primary btn-sm" onClick={() => window.print()}>
            <Icon name="download" className="w-3.5 h-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      <StatGrid cols={4}>
        <StatCard tone="gold"    label="Departments filled" value={`${totals.depts} / ${departments.length}`} icon="building" />
        <StatCard tone="blue"    label="Rows"    value={totals.rows}    icon="clipboard" />
        <StatCard tone="emerald" label="Hours"   value={totals.hours}   icon="clock" />
        <StatCard tone="violet"  label="Workers" value={totals.workers} icon="users" />
      </StatGrid>

      <div className="hidden print:block text-center pb-2">
        <div className="text-[15px] font-semibold">Factory Attendance &amp; Report — {fmtDate(date)}</div>
      </div>

      {loading && !data ? (
        <div className="card"><LoadingState label="Loading the day…" /></div>
      ) : (
        blocks.map(({ dept, shift }) => (
          <DepartmentBlock
            key={`${dept.id}-${shift}`}
            date={date} dept={dept} shift={shift}
            rows={rowsFor(dept.id, shift)}
            note={noteFor(dept.id, shift)}
            editing={editing?.departmentId === dept.id && editing?.shift === shift}
            onEdit={() => setEditing({ departmentId: dept.id, shift })}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(date); }}
          />
        ))
      )}

      {importing && (
        <ImportExcelModal
          departments={departments}
          defaultDate={date}
          onClose={() => setImporting(false)}
          onImported={(importedDate) => { setImporting(false); setDate(importedDate); load(importedDate); }}
        />
      )}
    </div>
  );
}

/* One department's block.
   Reads as a ruled table; edits as a card per row on a phone or tablet and as
   a grid on a desktop. The floor fills this on a tablet, so the editor leads
   with the touch layout, and every field offers what the department has typed
   before — retyping "8MM ENDMILL" by hand is slow, and one typo splits a
   worker's hours across two names in the attendance report. */
function DepartmentBlock({ date, dept, shift, rows, note, editing, onEdit, onCancel, onSaved }) {
  const fields = dept.fields;
  const [draft, setDraft] = useState([]);
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [suggest, setSuggest] = useState({});
  const [copying, setCopying] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');

  // A fresh row starts at 8 hours — that is the shift, and the exceptions are
  // rarer than the rule.
  const newRow = () => ({ ...blankRow(), hours: '8' });

  useEffect(() => {
    if (!editing) return;
    setDraft(rows.length
      ? rows.map((r) => ({ ...blankRow(), ...Object.fromEntries(fields.map((f) => [f.key, r[f.key] ?? ''])) }))
      : [{ ...blankRow(), hours: '8' }]);
    setDraftNote(note);
    setSaveErr(''); setCopyMsg('');
    fetch(`/api/production/suggestions?departmentId=${dept.id}`)
      .then((r) => r.json()).then((d) => setSuggest(d && !d.error ? d : {})).catch(() => {});
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCell = (i, key, v) => setDraft((d) => d.map((row, j) => (j === i ? { ...row, [key]: v } : row)));
  const addRow = () => setDraft((d) => [...d, newRow()]);
  const removeRow = (i) => setDraft((d) => d.filter((_, j) => j !== i));
  // The floor writes the same order/area down a whole block, so a new row that
  // starts as a copy of the one above is usually most of the way there already.
  const duplicate = (i) => setDraft((d) => [...d.slice(0, i + 1), { ...d[i] }, ...d.slice(i + 1)]);

  // Yesterday's crew is usually today's crew. Pull the last filled block in and
  // edit what changed, rather than typing eight rows again.
  async function copyLast() {
    setCopying(true); setCopyMsg('');
    try {
      const r = await fetch(`/api/production/suggestions?departmentId=${dept.id}&shift=${shift}&before=${date}`);
      const j = await r.json();
      if (!r.ok || !j.rows?.length) { setCopyMsg('No earlier day to copy from'); return; }
      setDraft(j.rows.map((x) => ({ ...blankRow(), ...Object.fromEntries(fields.map((f) => [f.key, x[f.key] ?? ''])) })));
      setCopyMsg(`Copied from ${fmtDate(j.date)} — edit what changed`);
    } catch { setCopyMsg('Could not copy'); }
    finally { setCopying(false); }
  }

  async function save() {
    setSaving(true); setSaveErr('');
    try {
      const r = await fetch('/api/production/day', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, departmentId: dept.id, shift, rows: draft, note: draftNote }),
      });
      const j = await r.json();
      if (!r.ok) { setSaveErr(j.error || 'Failed to save'); return; }
      onSaved();
    } catch { setSaveErr('Failed to save'); }
    finally { setSaving(false); }
  }

  const hours = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  const title = `${dept.name}${shift ? ` — ${shiftLabel(shift)}` : ''}`;
  const filled = draft.filter((r) => fields.some((f) => String(r[f.key] ?? '').trim() !== '')).length;

  return (
    <div className="card overflow-hidden break-inside-avoid">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
          <div className="text-[11px] text-slate-500">
            {rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'}${hours ? ` · ${Math.round(hours * 10) / 10} hours` : ''}` : 'Not filled yet'}
          </div>
        </div>
        {!editing && (
          <button className="btn-primary print:hidden" onClick={onEdit}>
            <Icon name="edit" className="w-4 h-4" /> {rows.length ? 'Edit' : 'Fill'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="p-3 space-y-3 print:hidden">
          {saveErr && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12.5px] px-3 py-2">{saveErr}</div>}

          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-secondary" onClick={copyLast} disabled={copying}>
              <Icon name="clipboard" className="w-4 h-4" /> {copying ? 'Copying…' : 'Copy last day'}
            </button>
            {copyMsg && <span className="text-[11.5px] text-slate-500">{copyMsg}</span>}
          </div>

          {/* Phone / tablet: one card per row, full-size fields. */}
          <div className="md:hidden space-y-3">
            {draft.map((row, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Row {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <button className="icon-btn !w-11 !h-11" title="Duplicate this row" onClick={() => duplicate(i)}>
                      <Icon name="plus" className="w-4 h-4" />
                    </button>
                    <button className="icon-btn-danger !w-11 !h-11" title="Remove this row" onClick={() => removeRow(i)}>
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {fields.map((f) => (
                    <div key={f.key}>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{f.label}</label>
                      <FieldInput field={f} value={row[f.key] ?? ''} options={suggest[f.key]}
                        onChange={(v) => setCell(i, f.key, v)} big />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: the familiar grid. */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className="table-th w-10">#</th>
                  {fields.map((f) => <th key={f.key} className="table-th whitespace-nowrap">{f.label}</th>)}
                  <th className="table-th w-20"></th>
                </tr>
              </thead>
              <tbody>
                {draft.map((row, i) => (
                  <tr key={i} className="table-row align-top">
                    <td className="table-td text-slate-400 tabular-nums">{i + 1}</td>
                    {fields.map((f) => (
                      <td key={f.key} className="table-td !py-1">
                        <FieldInput field={f} value={row[f.key] ?? ''} options={suggest[f.key]}
                          onChange={(v) => setCell(i, f.key, v)} />
                      </td>
                    ))}
                    <td className="table-td !py-1 whitespace-nowrap">
                      <button className="icon-btn" title="Duplicate this row" onClick={() => duplicate(i)}>
                        <Icon name="plus" className="w-3.5 h-3.5" />
                      </button>
                      <button className="icon-btn-danger" title="Remove this row" onClick={() => removeRow(i)}>
                        <Icon name="trash" className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn-secondary w-full md:w-auto" onClick={addRow}>
            <Icon name="plus" className="w-4 h-4" /> Add row
          </button>

          <input className="input-ctl w-full !h-11 md:!h-9"
            placeholder="Note for this block (optional)"
            value={draftNote} onChange={(e) => setDraftNote(e.target.value)} />

          {/* Save stays in reach at the bottom of a long block on a phone. */}
          <div className="sticky bottom-0 -mx-3 -mb-3 px-3 py-2.5 bg-white border-t border-slate-200 flex items-center gap-2">
            <span className="text-[11.5px] text-slate-500">{filled} row{filled === 1 ? '' : 's'} to save</span>
            <button className="btn-ghost ml-auto" onClick={onCancel} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-slate-400">No work recorded for this block.</div>
      ) : (
        <>
          {/* Phone: a card per row — a nine-column table is unreadable there. */}
          <div className="md:hidden divide-y divide-slate-100 print:hidden">
            {rows.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="text-[12.5px] font-semibold text-slate-900">{r.sNo}. {r.worker || '—'}</div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                  {fields.filter((f) => f.key !== 'worker').map((f) => {
                    const v = String(r[f.key] ?? '').trim();
                    if (!v) return null;
                    return (
                      <div key={f.key} className="text-[11.5px]">
                        <span className="text-slate-400">{f.label}: </span>
                        <span className="text-slate-700">{v}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block print:block overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className="table-th w-10">S No</th>
                  {fields.map((f) => <th key={f.key} className="table-th whitespace-nowrap">{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="table-row align-top">
                    <td className="table-td text-slate-400 tabular-nums">{r.sNo}</td>
                    {fields.map((f) => (
                      <td key={f.key} className="table-td" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                        {String(r[f.key] ?? '').trim() || <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {note && (
            <div className="px-4 py-2 border-t border-slate-100 text-[11.5px] text-slate-600 bg-slate-50/60">
              <b>Note:</b> {note}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* One editable cell.
   A plain input with a datalist rather than a <select>: the suggestions cover
   the common case without ever blocking a value nobody has typed before, and
   on Android/iOS it still opens the normal keyboard. */
function FieldInput({ field, value, onChange, options = [], big = false }) {
  const listId = options.length ? `sg-${field.key}` : undefined;
  // Flagged, not blocked: this column legitimately carries "MOP SHEET" and
  // "VINAY SIR" for work booked against no order, so only something that was
  // reaching for an order number and missed gets called out.
  const odd = field.key === 'order_number' ? suspectOrderNumbers(value) : [];
  return (
    <>
      <input
        className={`input-ctl w-full ${big ? '!h-11 !text-[15px]' : '!h-9'} ${field.numeric ? 'min-w-[80px]' : 'min-w-[120px]'}`}
        type={field.numeric ? 'number' : 'text'}
        inputMode={field.numeric ? 'decimal' : undefined}
        step={field.numeric ? '0.5' : undefined}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {odd.length > 0 && (
        <div className="text-[10.5px] text-amber-600 mt-0.5" title={ORDER_HINT}>
          {odd.join(', ')} — orders read H001 / B514
        </div>
      )}
      {listId && (
        <datalist id={listId}>
          {options.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
    </>
  );
}

/* ── Import the factory's Excel ───────────────────────────────────── */

/* The floor doesn't fill this form — the office already builds the same
   report in Excel every day. This reads that workbook back in: it shows what
   it understood first (which block landed on which department, how many rows,
   what it skipped), lets that be corrected, and only then writes, block by
   block, through the same save the manual form uses. */
function ImportExcelModal({ departments, defaultDate, onClose, onImported }) {
  const [parsing, setParsing] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [date, setDate] = useState(defaultDate);
  const [blocks, setBlocks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);

  async function readFile(file) {
    if (!file) return;
    setErr(''); setParsing(true); setResult(null); setBlocks([]);
    try {
      const body = new FormData();
      body.append('file', file);
      const r = await fetch('/api/production/import', { method: 'POST', body });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Could not read that file'); return; }
      setResult(d);
      if (d.date) setDate(d.date);
      setBlocks((d.blocks || []).map((b, i) => ({
        ...b, key: i,
        // A block with no rows is an idle department — nothing to write, and
        // importing it would wipe whatever is already saved for that day.
        include: !!b.departmentId && b.rows.length > 0,
      })));
    } catch (e) {
      setErr(e.message || 'Could not read that file');
    } finally { setParsing(false); }
  }

  const patch = (key, p) => setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...p } : b)));
  const deptById = (id) => departments.find((d) => d.id === id);

  // Memoized so the clashes memo below can actually cache - a bare .filter()
  // handed it a new array identity every render.
  const chosen = useMemo(
    () => blocks.filter((b) => b.include && b.departmentId && b.rows.length),
    [blocks]);

  // Two blocks aimed at the same department and shift would overwrite each
  // other — the day only stores one. That's a mis-read to fix, not something
  // to silently resolve by letting the last one win.
  const clashes = useMemo(() => {
    const seen = new Map();
    const dupes = new Set();
    for (const b of chosen) {
      const k = `${b.departmentId}::${b.shift || ''}`;
      if (seen.has(k)) dupes.add(k); else seen.set(k, b.key);
    }
    return dupes;
  }, [chosen]);

  const clashKey = (b) => clashes.has(`${b.departmentId}::${b.shift || ''}`);
  const totalRows = chosen.reduce((n, b) => n + b.rows.length, 0);

  async function commit() {
    setErr(''); setSaving(true); setSaved(0);
    try {
      let n = 0;
      for (const b of chosen) {
        const r = await fetch('/api/production/day', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date, departmentId: b.departmentId, shift: b.shift || '',
            rows: b.rows, note: b.note || '',
          }),
        });
        const d = await r.json().catch(() => ({}));
        // Stop at the first failure rather than pressing on: the blocks
        // already written stay written, and the message says where it stopped.
        if (!r.ok) { setErr(`${b.departmentName || b.title}: ${d.error || 'failed to save'} — ${n} of ${chosen.length} blocks were imported.`); return; }
        setSaved(++n);
      }
      onImported(date);
    } catch (e) {
      setErr(e.message || 'Import failed');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-10 px-4 pb-4 print:hidden"
      onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <Icon name="upload" className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Import the day&apos;s Excel</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Reads the report the office already makes — nothing is saved until you confirm below</p>
          </div>
          <button onClick={onClose} disabled={saving} className="btn-ghost w-8 h-8 !p-0 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {err && <div className="rounded-lg bg-red-50 border border-red-100 text-red-600 text-[12.5px] px-3 py-2">{err}</div>}

          <div>
            <label className="label">Excel file <span className="text-slate-400 font-normal normal-case">(.xlsx or .xls — the same one that gets printed)</span></label>
            <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="input !py-1.5" disabled={parsing || saving}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; readFile(f); }} />
            {parsing && <div className="text-[11.5px] text-slate-400 mt-1">Reading the file…</div>}
          </div>

          {result && (
            <>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="label">Import under this date</label>
                    <DateField className="date-ctl" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="text-[12px] text-slate-500 pb-2">
                    {result.date
                      ? <>Read from the file&apos;s own block titles ({fmtDate(result.date)}).</>
                      : <>The file&apos;s titles carry no date — set it here.</>}
                  </div>
                </div>
                {(result.warnings || []).map((w, i) => (
                  <div key={i} className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <Icon name="alert" className="w-3.5 h-3.5" /> {w}
                  </div>
                ))}
              </div>

              {blocks.length === 0 ? (
                <EmptyState icon="clipboard" title="No department tables found in that file"
                  hint="Each block needs a header row with an S NO column, and a line above it naming the department." />
              ) : (
                <div className="space-y-2.5">
                  {blocks.map((b) => {
                    const dept = deptById(b.departmentId);
                    const clash = b.include && clashKey(b);
                    return (
                      <div key={b.key} className={`rounded-xl border p-3 ${clash ? 'border-red-200 bg-red-50/40' : b.include ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/60'}`}>
                        <div className="flex items-start gap-2.5">
                          <input type="checkbox" checked={b.include} disabled={!b.rows.length}
                            onChange={(e) => patch(b.key, { include: e.target.checked })}
                            className="accent-primary-600 mt-1" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold text-slate-800 truncate">{b.title || '(untitled block)'}</div>
                            <div className="text-[11.5px] text-slate-500 mt-0.5">
                              {b.rows.length} row{b.rows.length === 1 ? '' : 's'}
                              {b.skippedRows > 0 && <> · {b.skippedRows} empty row{b.skippedRows === 1 ? '' : 's'} skipped</>}
                              {b.note && <> · note: “{b.note}”</>}
                              {b.sheet && <> · sheet “{b.sheet}”</>}
                            </div>
                            {b.rows.length > 0 && (
                              <div className="text-[11px] text-slate-400 mt-1 truncate">
                                {b.rows.slice(0, 3).map((r) => [r.worker, r.order_number, r.hours && `${r.hours}h`].filter(Boolean).join(' · ')).join('  |  ')}
                                {b.rows.length > 3 && ' …'}
                              </div>
                            )}
                            {!!b.unmappedColumns?.length && (
                              <div className="text-[11px] text-amber-600 mt-1">Not imported: {b.unmappedColumns.join(', ')}</div>
                            )}
                            {!!b.oddOrders?.length && (
                              <div className="text-[11px] text-amber-600 mt-1">
                                Order numbers to check: {b.oddOrders.join(', ')} — these import as they are
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0 w-[200px]">
                            <select className="select !text-[11.5px]" value={b.departmentId}
                              onChange={(e) => patch(b.key, { departmentId: e.target.value, include: !!e.target.value && b.rows.length > 0 })}>
                              <option value="">-- Which department? --</option>
                              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            {dept?.hasShifts && (
                              <select className="select !text-[11.5px]" value={b.shift || ''} onChange={(e) => patch(b.key, { shift: e.target.value })}>
                                {SHIFTS.map((sh) => <option key={sh.key} value={sh.key}>{sh.label}</option>)}
                              </select>
                            )}
                          </div>
                        </div>
                        {!b.departmentId && (
                          <div className="text-[11.5px] text-amber-700 mt-2 pl-7">
                            No department in the app matches this title — pick one, or leave it out.
                          </div>
                        )}
                        {clash && (
                          <div className="text-[11.5px] text-red-600 mt-2 pl-7">
                            Another block is already going to {dept?.name}{b.shift ? ` (${shiftLabel(b.shift)})` : ''} — a day keeps only one, so fix this before importing.
                          </div>
                        )}
                        {!b.rows.length && (
                          <div className="text-[11.5px] text-slate-400 mt-2 pl-7">Nothing to import — the block is empty in the file.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {chosen.length > 0 && (
                <div className="text-[12px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  <Icon name="alert" className="w-3.5 h-3.5" /> Importing replaces whatever is already saved for these departments on {fmtDate(date)}. Every other day and department is untouched.
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center gap-2 shrink-0">
          <span className="text-[11.5px] text-slate-400">
            {saving
              ? `Importing… ${saved} of ${chosen.length} blocks`
              : chosen.length
                ? `${chosen.length} block${chosen.length === 1 ? '' : 's'} · ${totalRows} row${totalRows === 1 ? '' : 's'}`
                : ''}
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={commit}
              disabled={saving || parsing || !chosen.length || clashes.size > 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)}>
              {saving ? 'Importing…' : `Import ${chosen.length || ''} block${chosen.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Worker hours ─────────────────────────────────────────────────── */

function WorkerHours({ departments }) {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(todayISO());
  const [departmentId, setDepartmentId] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    const url = `/api/production/reports?type=workers&from=${from}&to=${to}${departmentId ? `&departmentId=${departmentId}` : ''}`;
    fetch(url).then((r) => r.json()).then((d) => { if (!dead) setRows(Array.isArray(d) ? d : []); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [from, to, departmentId]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => r.worker.toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  const totalHours = shown.reduce((s, r) => s + r.hours, 0);
  const maxHours = Math.max(...shown.map((r) => r.hours), 1);

  return (
    <div className="space-y-4">
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search a worker…" />
        <DateField className="date-ctl" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-slate-400 text-[12px]">→</span>
        <DateField className="date-ctl" value={to} onChange={(e) => setTo(e.target.value)} />
        <select className="select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="sm:ml-auto"><ResultCount shown={shown.length} total={rows.length} noun="worker" /></div>
      </div>

      <StatGrid cols={3}>
        <StatCard tone="gold"    label="Workers" value={shown.length} icon="users" />
        <StatCard tone="emerald" label="Total hours" value={Math.round(totalHours * 10) / 10} icon="clock" />
        <StatCard tone="blue"    label="Avg hours / worker"
          value={shown.length ? Math.round((totalHours / shown.length) * 10) / 10 : 0} icon="chart" />
      </StatGrid>

      <div className="card overflow-hidden">
        {loading ? <LoadingState /> : shown.length === 0 ? (
          <EmptyState icon="users" title="No hours recorded in this range"
            hint="Pick a wider date range, or fill the daily report first." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className="table-th">Worker</th>
                  <th className="table-th">Hours</th>
                  <th className="table-th w-[28%]"></th>
                  <th className="table-th">Days</th>
                  <th className="table-th">Orders</th>
                  <th className="table-th">Departments</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.worker} className="table-row">
                    <td className="table-td font-medium text-slate-800">{r.worker}</td>
                    <td className="table-td tabular-nums font-semibold text-slate-900">{r.hours}</td>
                    <td className="table-td">
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-primary-500" style={{ width: `${(r.hours / maxHours) * 100}%` }} />
                      </div>
                    </td>
                    <td className="table-td tabular-nums">{r.days}</td>
                    <td className="table-td tabular-nums" title={r.orders.join(', ')}>{r.orders.length}</td>
                    <td className="table-td text-[11.5px] text-slate-500">{r.departments.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Order tracking ───────────────────────────────────────────────── */

function OrderTracking() {
  const [from, setFrom] = useState(daysAgo(89));
  const [to, setTo] = useState(todayISO());
  const [order, setOrder] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/production/reports?type=orders&from=${from}&to=${to}&order=${encodeURIComponent(order)}`)
        .then((r) => r.json()).then((d) => { if (!dead) setRows(Array.isArray(d) ? d : []); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 250); // typing an order number shouldn't fire a query per keystroke
    return () => { dead = true; clearTimeout(t); };
  }, [from, to, order]);

  return (
    <div className="space-y-4">
      <div className="toolbar">
        <SearchInput value={order} onChange={setOrder} placeholder="Order number, e.g. H1799…" />
        <DateField className="date-ctl" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-slate-400 text-[12px]">→</span>
        <DateField className="date-ctl" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="sm:ml-auto"><ResultCount shown={rows.length} total={rows.length} noun="order" /></div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <LoadingState /> : rows.length === 0 ? (
          <EmptyState icon="search" title="No orders found in this range"
            hint="Orders appear here as soon as a department records work against them." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className="table-th w-8"></th>
                  <th className="table-th">Order</th>
                  <th className="table-th">Departments</th>
                  <th className="table-th">Hours</th>
                  <th className="table-th">Workers</th>
                  <th className="table-th">First seen</th>
                  <th className="table-th">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <FragmentRow key={r.order} r={r} open={open === r.order}
                    onToggle={() => setOpen(open === r.order ? null : r.order)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// An order row, expanding to the department-by-department trail beneath it.
function FragmentRow({ r, open, onToggle }) {
  return (
    <>
      <tr className="table-row cursor-pointer" onClick={onToggle}>
        <td className="table-td text-slate-400">
          <Icon name={open ? 'chevronDown' : 'chevronRight'} className="w-3.5 h-3.5" />
        </td>
        <td className="table-td font-semibold text-slate-900">{r.order}</td>
        <td className="table-td">
          <div className="flex items-center gap-1 flex-wrap">
            {r.departments.map((d) => (
              <span key={d.department} className="badge-neutral">{d.department}</span>
            ))}
          </div>
        </td>
        <td className="table-td tabular-nums font-semibold">{r.hours}</td>
        <td className="table-td tabular-nums">{r.workers}</td>
        <td className="table-td whitespace-nowrap">{fmtDate(r.first)}</td>
        <td className="table-td whitespace-nowrap">{fmtDate(r.last)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-slate-50/60 border-t border-slate-100">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Journey through the floor
            </div>
            <div className="space-y-1.5">
              {r.departments.map((d) => (
                <div key={d.department} className="flex items-center gap-3 text-[12px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
                  <span className="font-medium text-slate-800 min-w-[200px]">{d.department}</span>
                  <span className="text-slate-500">{fmtDate(d.first)}{d.last !== d.first ? ` → ${fmtDate(d.last)}` : ''}</span>
                  <span className="text-slate-500 tabular-nums ml-auto">{d.hours} hrs · {d.entries} rows</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Department setup (admin) ─────────────────────────────────────── */

function DepartmentSetup({ departments, reload }) {
  const { ask, ConfirmUI } = useConfirmToast();
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const startNew = () => setEditing({
    name: '', hasShifts: false,
    fields: ['worker', 'order_number', 'hours', 'area', 'material', 'work'].map((key) => ({
      key, label: ALL_FIELDS.find((f) => f.key === key).label,
    })),
  });

  async function save() {
    if (!editing?.name.trim()) return;
    setSaving(true);
    try {
      const isEdit = !!editing.id;
      await fetch('/api/production/departments', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      setEditing(null);
      reload();
    } finally { setSaving(false); }
  }

  function remove(d) {
    ask(`Remove "${d.name}"? Past reports keep their rows — the department is only hidden from new entry.`, async () => {
      await fetch(`/api/production/departments?id=${d.id}`, { method: 'DELETE' });
      reload();
    });
  }

  const toggleField = (key) => setEditing((e) => {
    const has = e.fields.some((f) => f.key === key);
    if (has) return { ...e, fields: e.fields.filter((f) => f.key !== key) };
    const def = ALL_FIELDS.find((f) => f.key === key);
    return { ...e, fields: [...e.fields, { key, label: def.label }] };
  });

  const renameField = (key, label) => setEditing((e) => ({
    ...e, fields: e.fields.map((f) => (f.key === key ? { ...f, label } : f)),
  }));

  return (
    <div className="space-y-4">
      <SectionTitle note="each department decides its own columns — the entry form and the printed report both follow this"
        right={<button className="btn-primary btn-sm" onClick={startNew}><Icon name="plus" className="w-3.5 h-3.5" /> Add department</button>}
      >Departments</SectionTitle>

      <div className="grid gap-3 md:grid-cols-2">
        {departments.map((d) => (
          <div key={d.id} className="card p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">{d.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {d.fields.length} columns{d.hasShifts ? ' · day / night shift' : ''}
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button className="icon-btn" title="Edit" onClick={() => setEditing({ ...d })}>
                  <Icon name="edit" className="w-3.5 h-3.5" />
                </button>
                <button className="icon-btn-danger" title="Remove" onClick={() => remove(d)}>
                  <Icon name="trash" className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-wrap mt-2.5">
              {d.fields.map((f) => <span key={f.key} className="badge-neutral">{f.label}</span>)}
            </div>
          </div>
        ))}
      </div>

      {ConfirmUI}

      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto p-4 pt-10"
          onClick={() => !saving && setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="text-[14px] font-semibold text-slate-900">
                {editing.id ? 'Edit department' : 'New department'}
              </div>
              <button className="icon-btn" onClick={() => setEditing(null)}><Icon name="x" className="w-4 h-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3.5">
              <div>
                <label className="label">Department name</label>
                <input className="input" value={editing.name} placeholder="e.g. CNC Department"
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
                <input type="checkbox" checked={!!editing.hasShifts}
                  onChange={(e) => setEditing({ ...editing, hasShifts: e.target.checked })} />
                Splits into day and night shift
              </label>
              <div>
                <label className="label">Columns</label>
                <div className="space-y-1.5">
                  {ALL_FIELDS.map((f) => {
                    const cur = editing.fields.find((x) => x.key === f.key);
                    const on = !!cur;
                    return (
                      <div key={f.key} className="flex items-center gap-2">
                        <input type="checkbox" checked={on} disabled={f.key === 'worker'}
                          onChange={() => toggleField(f.key)} />
                        <span className={`text-[12.5px] w-[150px] ${on ? 'text-slate-700' : 'text-slate-400'}`}>{f.label}</span>
                        {on && (
                          <input className="input-ctl flex-1" value={cur.label}
                            placeholder={f.label}
                            onChange={(e) => renameField(f.key, e.target.value)} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="text-[11px] text-slate-400 mt-1.5">
                  The box on the right renames the column — CNC calls Name &ldquo;Machine Operator&rdquo;.
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving || !editing.name.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
