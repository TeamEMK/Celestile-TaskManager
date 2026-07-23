'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import SheetGridView from './SheetGridView';
import PcView from './PcView';

export default function FmsDetailClient({ fmsId }) {
  const [sheet, setSheet] = useState(null);
  const [loadingHeader, setLoadingHeader] = useState(true);
  const [tab, setTab] = useState('fms'); // 'fms' | 'pc'

  const [grid, setGrid] = useState(null);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [pcItems, setPcItems] = useState(null);
  const [loadingPc, setLoadingPc] = useState(false);

  useEffect(() => {
    fetch(`/api/fms-view/${fmsId}`).then((r) => r.json()).then((d) => {
      setSheet(d.sheet || null);
      setLoadingHeader(false);
    }).catch(() => setLoadingHeader(false));
  }, [fmsId]);

  useEffect(() => {
    if (tab === 'fms' && grid == null && !loadingGrid) {
      setLoadingGrid(true);
      fetch(`/api/fms-view/${fmsId}/grid`).then((r) => r.json()).then((d) => {
        setGrid(d);
        setLoadingGrid(false);
      }).catch(() => setLoadingGrid(false));
    }
    if (tab === 'pc' && pcItems == null && !loadingPc) {
      setLoadingPc(true);
      fetch(`/api/fms-view/${fmsId}/pc`).then((r) => r.json()).then((d) => {
        setPcItems(d.items || []);
        setLoadingPc(false);
      }).catch(() => setLoadingPc(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fmsId]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <Link href="/fms-view" className="btn-ghost !p-2" title="Back to FMS Tracker">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0"><IconLayers /></div>
        <div>
          <h1 className="font-display text-[18px] font-semibold tracking-tight text-slate-900">
            {loadingHeader ? 'Loading…' : (sheet?.fms_name || sheet?.sheet_name || 'FMS')}
          </h1>
          <p className="text-[11.5px] text-slate-500">Live sheet view, and pending entries across every step</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button className={`seg-btn ${tab === 'fms' ? 'seg-btn-active' : 'bg-white border border-slate-200'}`} onClick={() => setTab('fms')}>📄 FMS View</button>
        <button className={`seg-btn ${tab === 'pc' ? 'seg-btn-active' : 'bg-white border border-slate-200'}`} onClick={() => setTab('pc')}>👤 PC View</button>
      </div>

      {tab === 'fms' && (
        loadingGrid || !grid ? (
          <div className="card p-10 text-center text-slate-400 text-[13px]">Loading sheet…</div>
        ) : (
          <SheetGridView rows={grid.rows || []} headerRow={grid.headerRow} />
        )
      )}

      {tab === 'pc' && (
        loadingPc || pcItems == null ? (
          <div className="card p-10 text-center text-slate-400 text-[13px]">Loading pending entries…</div>
        ) : (
          <PcView items={pcItems} />
        )
      )}
    </div>
  );
}

function IconLayers(props) {
  return (
    <svg {...props} className={`w-[18px] h-[18px] ${props.className || ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" />
    </svg>
  );
}
