'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AddMasterModal from '../components/AddMasterModal';
import CsvImport from '../components/CsvImport';

const FREQ_TONE = {
  Daily:              'bg-emerald-50 text-emerald-700 border-emerald-100',
  Weekly:             'bg-primary-50 text-primary-700 border-primary-100',
  'Alternative Week': 'bg-sky-50 text-sky-700 border-sky-100',
  Monthly:            'bg-violet-50 text-violet-700 border-violet-100',
  Quarterly:          'bg-rose-50 text-rose-700 border-rose-100',
  Yearly:             'bg-orange-50 text-orange-700 border-orange-100',
  'One-time':         'bg-amber-50 text-amber-700 border-amber-100',
};

const ALL_FREQS = ['All', 'Daily', 'Weekly', 'Alternative Week', 'Monthly', 'Quarterly', 'Yearly', 'One-time'];

export default function MastersClient({ masters, users = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [freq, setFreq] = useState('All');

  const filtered = useMemo(() => {
    return masters.filter((m) => {
      if (freq !== 'All' && m.frequency !== freq) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!m.task.toLowerCase().includes(s) && !(m.assignedTo || '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [masters, search, freq]);

  const counts = useMemo(() => {
    const c = {
      All: masters.length,
      Daily: 0, Weekly: 0,
      'Alternative Week': 0,
      Monthly: 0,
      Quarterly: 0,
      Yearly: 0,
      'One-time': 0,
    };
    masters.forEach((m) => { if (c[m.frequency] !== undefined) c[m.frequency]++; else c[m.frequency] = 1; });
    return c;
  }, [masters]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
<div className="flex items-center gap-2 flex-wrap">
          <CsvImport
            templateName="checklist_template.csv"
            columns={['task', 'assignedTo', 'frequency']}
            sampleRow={['Daily standup notes', 'Tushar Singh', 'Daily']}
            parseRow={(r) => {
              if (!r.task) return null;
              return { task: r.task, assignedTo: r.assignedTo || '', frequency: r.frequency || 'Daily' };
            }}
            endpoint="/api/masters"
            onDone={() => router.refresh()}
          />
          <button onClick={() => setOpen(true)} className="btn-primary">
            <PlusIcon /> Add Checklist Task
          </button>
        </div>
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="seg flex-wrap">
          {ALL_FREQS.map((f) => (
            <button
              key={f}
              onClick={() => setFreq(f)}
              className={`seg-btn ${freq === f ? 'seg-btn-active' : ''}`}
            >
              {f}
              <span className="ml-1 text-[10px] text-slate-400">{counts[f] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks or assignees"
            className="input pl-9 w-72"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState onAdd={() => setOpen(true)} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="table-th w-24">ID</th>
                <th className="table-th">Task</th>
                <th className="table-th">Assigned To</th>
                <th className="table-th w-40">Frequency</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="table-row">
                  <td className="table-td font-mono text-xs text-slate-500">{m.id}</td>
                  <td className="table-td font-medium text-slate-800">{m.task}</td>
                  <td className="table-td">
                    {m.assignedTo ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={m.assignedTo} />
                        <span className="text-slate-700">{m.assignedTo}</span>
                      </div>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="table-td">
                    <span className={`pill border ${FREQ_TONE[m.frequency] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      {m.frequency}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddMasterModal open={open} onClose={() => setOpen(false)} users={users} />
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="p-14 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary-50 grid place-items-center mx-auto mb-3">
        <svg className="w-7 h-7 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/></svg>
      </div>
      <div className="text-sm font-medium text-slate-800">No checklist tasks yet</div>
      <div className="text-xs text-slate-500 mt-1">Start by adding your first recurring task.</div>
      <button onClick={onAdd} className="btn-primary mt-4">
        <PlusIcon /> Add Checklist Task
      </button>
    </div>
  );
}

function Avatar({ name = '' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '·';
  return <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-white grid place-items-center text-[10px] font-bold shrink-0">{ini}</div>;
}

function PlusIcon() { return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }