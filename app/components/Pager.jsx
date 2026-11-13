'use client';
/**
 * Client-side pagination for lists that are already searched / filtered /
 * sorted in the browser.
 *
 * The rule every caller follows: filter + sort the FULL list first, then hand
 * the result to usePaged() and render only `pageRows`. Search, filters, sort,
 * exports and permission checks keep working on the full list exactly as
 * before — paging only decides which slice reaches the DOM, which is where
 * the time went on long lists (thousands of <tr>s with badges and buttons).
 *
 *   const { pageRows, pager } = usePaged(filtered, { resetKey: [q, status] });
 *   ...rows.map → pageRows.map
 *   <Pager {...pager} noun="task" />
 *
 * `resetKey` — anything that changes which rows match (search text, filters,
 * sort, active tab). When it changes the pager jumps back to page 1, so a new
 * search never lands on an empty page 7.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

export const PAGE_SIZES = [25, 50, 100, 200];

export function usePaged(rows, { pageSize: initialSize = 50, resetKey } = {}) {
  const list = rows || [];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  // Back to page 1 when the result set's definition changes. JSON keeps the
  // comparison stable for array/object keys built inline at the call site.
  const key = JSON.stringify(resetKey ?? null);
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) { lastKey.current = key; setPage(1); }
  }, [key]);

  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  // A delete / refresh can shrink the list under the current page — clamp
  // rather than show an empty page.
  const current = Math.min(page, pages);

  const pageRows = useMemo(
    () => list.slice((current - 1) * pageSize, current * pageSize),
    [list, current, pageSize],
  );

  return {
    pageRows,
    page: current,
    pager: {
      page: current, pages, pageSize, total: list.length,
      onPage: setPage,
      onPageSize: (n) => { setPageSize(n); setPage(1); },
    },
  };
}

export function Pager({ page, pages, pageSize, total, onPage, onPageSize, noun = 'row', className = '' }) {
  // Nothing to page — keep the footer out of the way on short lists.
  if (!total || total <= PAGE_SIZES[0]) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={`px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap ${className}`}>
      <div className="text-[11.5px] text-slate-500 tabular-nums flex items-center gap-2 flex-wrap">
        <span>
          <b className="text-slate-800">{from.toLocaleString()}–{to.toLocaleString()}</b> of {total.toLocaleString()} {noun}{total === 1 ? '' : 's'}
        </span>
        {onPageSize && (
          <select className="ctl !py-0.5 !text-[11.5px] w-auto" value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Rows per page">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-slate-500 tabular-nums">
            Page <b className="text-slate-800">{page}</b> of {pages}
          </span>
          <button type="button" className="btn-secondary btn-sm" disabled={page <= 1}
            onClick={() => onPage(Math.max(1, page - 1))}>
            <Icon name="chevronLeft" className="w-3.5 h-3.5" /> Previous
          </button>
          <button type="button" className="btn-secondary btn-sm" disabled={page >= pages}
            onClick={() => onPage(Math.min(pages, page + 1))}>
            Next <Icon name="chevronRight" className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
