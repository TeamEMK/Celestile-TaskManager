'use client';
import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 5;

export default function AccessClient() {
  const [pages, setPages] = useState([]);
  const [users, setUsers] = useState([]);
  const [edit, setEdit] = useState({});   // { [userId]: { keys: string[], configured: bool } }
  const [rowStatus, setRowStatus] = useState({}); // { [userId]: 'saving'|'saved'|'error' }
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
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

  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = shown.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSearch(v) { setSearch(v); setPage(1); }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[16px] font-semibold text-slate-900">Page Access</div>
            <div className="text-[12px] text-slate-500">
              Tick the tabs each user can open. Admin / HOD always have full access.
              <span className="ml-2 text-slate-400">{shown.length} user{shown.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <input className="input max-w-xs" placeholder="Search user…" value={search} onChange={(e) => handleSearch(e.target.value)} />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-5 text-[12.5px] text-slate-400">Loading…</div>
        ) : (
          <>
          <div className="overflow-auto max-h-[420px]">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-900 text-white sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-slate-900 z-20">User</th>
                {pages.map((p) => (
                  <th key={p.key} className="px-2 py-2 text-center font-semibold whitespace-nowrap" title={p.key}>{p.label}</th>
                ))}
                <th className="px-3 py-2 text-center font-semibold">All</th>
                <th className="px-3 py-2 text-right font-semibold">Save</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((u) => {
                const e = edit[u.id] || { keys: [], configured: true };
                const admin = isAdmin(u);
                const st = rowStatus[u.id];
                return (
                  <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 sticky left-0 bg-white z-10">
                      <div className="font-medium text-slate-800">{u.name}</div>
                      <div className="text-[11px] text-slate-400">{u.email}</div>
                      {admin && <span className="pill bg-violet-50 text-violet-700 mt-1 inline-block">{(u.roles || []).join(' · ')}</span>}
                      {!admin && !e.configured && <span className="pill bg-slate-100 text-slate-500 mt-1 inline-block">default (all)</span>}
                    </td>
                    {pages.map((p) => (
                      <td key={p.key} className="px-2 py-2 text-center">
                        {admin ? (
                          <span className="text-emerald-500">✓</span>
                        ) : (
                          <input type="checkbox" className="h-4 w-4 cursor-pointer accent-primary-600"
                            checked={e.keys.includes(p.key)} onChange={() => toggle(u.id, p.key)} />
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {!admin && (
                        <div className="flex gap-1 justify-center">
                          <button className="btn-ghost !px-2 !py-0.5 text-[11px]" onClick={() => setAll(u.id, true)}>All</button>
                          <button className="btn-ghost !px-2 !py-0.5 text-[11px]" onClick={() => setAll(u.id, false)}>None</button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {!admin && (
                        <div className="flex gap-1 justify-end items-center">
                          {st === 'saved' && <span className="text-emerald-600 text-[11px]">✓ Saved</span>}
                          {st === 'error' && <span className="text-rose-600 text-[11px]">✕ Error</span>}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-white">
              <span className="text-[12px] text-slate-500">
                Page {safePage} of {totalPages} &mdash; showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, shown.length)} of {shown.length}
              </span>
              <div className="flex items-center gap-1">
                <PagBtn onClick={() => setPage(1)}           disabled={safePage === 1}          title="First">&laquo;</PagBtn>
                <PagBtn onClick={() => setPage(p => p - 1)} disabled={safePage === 1}          title="Prev">&lsaquo;</PagBtn>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) => p === '…'
                    ? <span key={`e${i}`} className="px-1 text-[12px] text-slate-400">…</span>
                    : <PagBtn key={p} onClick={() => setPage(p)} active={p === safePage}>{p}</PagBtn>
                  )
                }
                <PagBtn onClick={() => setPage(p => p + 1)} disabled={safePage === totalPages} title="Next">&rsaquo;</PagBtn>
                <PagBtn onClick={() => setPage(totalPages)}  disabled={safePage === totalPages} title="Last">&raquo;</PagBtn>
              </div>
            </div>
          )}
          </>
        )}
      </div>
      <p className="text-[11.5px] text-slate-400 px-1">
        Changes apply on the user&apos;s next page load (their session refreshes automatically). Dashboard &amp; Profile are always accessible.
      </p>
    </div>
  );
}

function PagBtn({ onClick, disabled, active, children, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="min-w-[28px] h-7 px-1.5 rounded text-[12px] font-medium transition-colors"
      style={{
        background: active ? '#2E72B5' : 'transparent',
        color:      active ? '#fff'    : disabled ? '#cbd5e1' : '#475569',
        cursor:     disabled ? 'not-allowed' : 'pointer',
        border:     active ? 'none' : '1px solid #e2e8f0',
      }}
      onMouseEnter={e => { if (!disabled && !active) e.currentTarget.style.background = '#f1f5f9'; }}
      onMouseLeave={e => { if (!disabled && !active) e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}
