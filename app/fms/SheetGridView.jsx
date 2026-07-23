'use client';
import { useState } from 'react';

const COL_WIDTH = 150;

function colLabel(i) {
  let n = i + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Live spreadsheet-style view: sticky header, "freeze first N columns", and
// a column show/hide picker. Fixed column widths keep sticky-left math
// simple (cumulative offset = index * COL_WIDTH) without measuring the DOM.
export default function SheetGridView({ rows, headerRow }) {
  const [freezeCols, setFreezeCols] = useState(1);
  const [hiddenCols, setHiddenCols] = useState(() => new Set());
  const [showColPicker, setShowColPicker] = useState(false);

  const headerIdx = Math.max(0, (headerRow || 1) - 1);
  const headerCells = rows[headerIdx] || [];
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), headerCells.length);
  const colIndexes = Array.from({ length: colCount }, (_, i) => i);
  const visibleCols = colIndexes.filter((i) => !hiddenCols.has(i));
  const maxFreeze = Math.max(0, visibleCols.length - 1);

  function colName(i) {
    const h = (headerCells[i] || '').toString().trim();
    return h ? `${h} (${colLabel(i)})` : colLabel(i);
  }
  function toggleCol(i) {
    setHiddenCols((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  if (!rows.length) {
    return <div className="card p-14 text-center text-[13px] text-slate-400">No data in this sheet yet.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
          Freeze first
          <input type="number" min="0" max={maxFreeze} value={freezeCols}
            onChange={(e) => setFreezeCols(Math.min(maxFreeze, Math.max(0, Number(e.target.value) || 0)))}
            className="input !w-16 !py-1 text-center" />
          column{freezeCols === 1 ? '' : 's'}
        </label>
        <div className="relative">
          <button className="btn-secondary !text-[12px]" onClick={() => setShowColPicker((v) => !v)}>
            👁 Columns {hiddenCols.size > 0 ? `(${colCount - hiddenCols.size}/${colCount} shown)` : `(${colCount})`}
          </button>
          {showColPicker && (
            <div className="absolute z-30 mt-1 w-64 max-h-[280px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-elevated p-2 space-y-0.5"
              onMouseLeave={() => setShowColPicker(false)}>
              {colIndexes.map((i) => (
                <label key={i} className="flex items-center gap-2 px-2 py-1 text-[12px] hover:bg-slate-50 rounded cursor-pointer">
                  <input type="checkbox" checked={!hiddenCols.has(i)} onChange={() => toggleCol(i)} className="accent-primary-600" />
                  <span className="truncate">{colName(i)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-320px)]">
          <table className="text-[12px] border-collapse" style={{ tableLayout: 'fixed', width: visibleCols.length * COL_WIDTH }}>
            <colgroup>{visibleCols.map((i) => <col key={i} style={{ width: COL_WIDTH }} />)}</colgroup>
            <thead>
              <tr>
                {visibleCols.map((i, vi) => (
                  <th key={i}
                    className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 border border-slate-200 truncate"
                    style={{ position: 'sticky', top: 0, left: vi < freezeCols ? vi * COL_WIDTH : undefined, zIndex: vi < freezeCols ? 20 : 10, background: '#f1f5f9' }}
                    title={colName(i)}
                  >
                    {colName(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                if (ri === headerIdx) return null;
                const zebra = ri % 2 === 0;
                return (
                  <tr key={ri}>
                    {visibleCols.map((i, vi) => (
                      <td key={i}
                        className="px-3 py-2 text-slate-600 border border-slate-100 truncate"
                        style={vi < freezeCols
                          ? { position: 'sticky', left: vi * COL_WIDTH, zIndex: 5, background: zebra ? '#ffffff' : '#f8fafc' }
                          : { background: zebra ? '#ffffff' : '#f8fafc' }}
                        title={row[i] || ''}
                      >
                        {row[i] || ''}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
