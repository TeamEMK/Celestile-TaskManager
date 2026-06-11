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
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[16px] font-semibold text-slate-900">Page Access</div>
            <div className="text-[12px] text-slate-500">Tick the tabs each user can open. Admin / HOD always have full access.</div>
          </div>
          <input className="input max-w-xs" placeholder="🔍 Search user…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        {loading ? (
          <div className="p-5 text-[12.5px] text-slate-400">Loading…</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-900 text-white sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-slate-900 z-10">User</th>
                {pages.map((p) => (
                  <th key={p.key} className="px-2 py-2 text-center font-semibold whitespace-nowrap" title={p.key}>{p.label}</th>
                ))}
                <th className="px-3 py-2 text-center font-semibold">All</th>
                <th className="px-3 py-2 text-right font-semibold">Save</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
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
        )}
      </div>
      <p className="text-[11.5px] text-slate-400 px-1">
        Changes apply on the user&apos;s next page load (their session refreshes automatically). Dashboard &amp; Profile are always accessible.
      </p>
    </div>
  );
}
