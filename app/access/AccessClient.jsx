'use client';
import { useEffect, useMemo, useState } from 'react';

export default function AccessClient() {
  const [pages, setPages] = useState([]);
  const [users, setUsers] = useState([]);
  const [edit, setEdit] = useState({});   // { [userId]: { keys: string[], configured: bool } }
  const [rowStatus, setRowStatus] = useState({}); // { [userId]: 'saving'|'saved'|'error' }
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const allKeys = useMemo(() => pages.map((p) => p.key), [pages]);

  useEffect(() => {
    (async () => {
      try {
        const d = await (await fetch('/api/access')).json();
        const pg = d.pages || [];
        setPages(pg);
        setUsers(d.users || []);
        const e = {};
        (d.users || []).forEach((u) => {
          e[u.id] = u.access == null
            ? { keys: pg.map((p) => p.key), configured: false }
            : { keys: u.access.slice(), configured: true };
        });
        setEdit(e);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const isAdmin = (u) => (u.roles || []).includes('Admin') || (u.roles || []).includes('HOD');

  function toggle(userId, key) {
    setEdit((e) => {
      const cur = e[userId] || { keys: [], configured: true };
      const has = cur.keys.includes(key);
      const keys = has ? cur.keys.filter((k) => k !== key) : [...cur.keys, key];
      return { ...e, [userId]: { keys, configured: true } };
    });
    setRowStatus((s) => ({ ...s, [userId]: undefined }));
  }
  function setAll(userId, on) {
    setEdit((e) => ({ ...e, [userId]: { keys: on ? allKeys.slice() : [], configured: true } }));
    setRowStatus((s) => ({ ...s, [userId]: undefined }));
  }

  async function save(userId, accessOverride) {
    setRowStatus((s) => ({ ...s, [userId]: 'saving' }));
    const access = accessOverride === null ? null : (edit[userId]?.keys || []);
    try {
      const res = await fetch('/api/access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, access }),
      });
      if (!res.ok) throw new Error();
      setRowStatus((s) => ({ ...s, [userId]: 'saved' }));
      if (accessOverride === null) {
        setEdit((e) => ({ ...e, [userId]: { keys: allKeys.slice(), configured: false } }));
      }
      setTimeout(() => setRowStatus((s) => ({ ...s, [userId]: undefined })), 2500);
    } catch {
      setRowStatus((s) => ({ ...s, [userId]: 'error' }));
    }
  }

  const shown = users.filter((u) =>
    !search || (u.name + ' ' + u.email).toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4 animate-fade-in">

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <ShieldIcon className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[15px] font-semibold tracking-tight text-slate-900">Page Access</h1>
            <p className="text-[11.5px] text-slate-500">
              Tick the tabs each user can open · {shown.length} user{shown.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 w-full sm:w-64 shadow-sm transition-all duration-200 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-100 sm:ml-auto">
          <SearchIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            className="bg-transparent border-none outline-none text-[13px] text-slate-700 placeholder:text-slate-400 w-full"
            placeholder="Search user…" value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2.5 py-16">
            <div className="w-5 h-5 rounded-full border-2 border-primary-300 border-t-primary-600 animate-spin" />
            <span className="text-[13px] text-slate-500">Loading access matrix…</span>
          </div>
        ) : (
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full text-[12px] min-w-[720px]">
              <thead className="bg-ink-700 text-white sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-ink-700 z-20">User</th>
                  {pages.map((p) => (
                    <th key={p.key} className="px-2 py-2.5 text-center font-semibold whitespace-nowrap" title={p.key}>{p.label}</th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-semibold">All</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Save</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={pages.length + 3} className="py-14 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center mx-auto mb-3">
                        <SearchIcon className="w-6 h-6 text-slate-400" />
                      </div>
                      <div className="text-[13.5px] font-semibold text-slate-700">No users found</div>
                      <div className="text-[12px] text-slate-500 mt-0.5">Try adjusting your search terms.</div>
                    </td>
                  </tr>
                ) : shown.map((u) => {
                  const e = edit[u.id] || { keys: [], configured: true };
                  const admin = isAdmin(u);
                  const st = rowStatus[u.id];
                  return (
                    <tr key={u.id} className="table-row">
                      <td className="px-3 py-2.5 sticky left-0 bg-white z-10">
                        <div className="font-medium text-slate-800">{u.name}</div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                        {admin && <span className="pill bg-violet-50 text-violet-700 mt-1 inline-block">{(u.roles || []).join(' · ')}</span>}
                        {!admin && !e.configured && <span className="pill bg-slate-100 text-slate-500 mt-1 inline-block">default (all)</span>}
                      </td>
                      {pages.map((p) => (
                        <td key={p.key} className="px-2 py-2.5 text-center">
                          {admin ? (
                            <span className="text-emerald-500">
                              <CheckIcon className="w-4 h-4 inline-block" />
                            </span>
                          ) : (
                            <input type="checkbox"
                              className="h-4 w-4 rounded cursor-pointer accent-primary-600 transition-transform duration-150 hover:scale-110"
                              checked={e.keys.includes(p.key)} onChange={() => toggle(u.id, p.key)} />
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {!admin && (
                          <div className="flex gap-1 justify-center">
                            <button className="btn-ghost !px-2 !py-0.5 text-[11px]" onClick={() => setAll(u.id, true)}>All</button>
                            <button className="btn-ghost !px-2 !py-0.5 text-[11px]" onClick={() => setAll(u.id, false)}>None</button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {!admin && (
                          <div className="flex gap-1.5 justify-end items-center">
                            {st === 'saved' && <span className="text-emerald-600 text-[11px] font-medium">✓ Saved</span>}
                            {st === 'error' && <span className="text-rose-600 text-[11px] font-medium">✕ Error</span>}
                            <button className="btn-warn !px-3 !py-1" disabled={st === 'saving'} onClick={() => save(u.id)}>
                              {st === 'saving' ? '…' : 'Save'}
                            </button>
                            {e.configured && (
                              <button className="btn-ghost !px-2 !py-1 text-[11px]" title="Clear → default (all)" onClick={() => save(u.id, null)}>Reset</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[11.5px] text-slate-400 px-1">
        Admin / HOD always have full access. Changes apply on the user&apos;s next page load (their session refreshes automatically). Dashboard &amp; Profile are always accessible.
      </p>
    </div>
  );
}

function ShieldIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>; }
function SearchIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>; }
function CheckIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>; }
