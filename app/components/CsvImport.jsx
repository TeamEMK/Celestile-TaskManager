'use client';
import { useRef, useState } from 'react';

/**
 * CSV Template + Upload control.
 *
 * Props:
 *   templateName   string  - downloaded filename
 *   columns        string[] - CSV header row
 *   sampleRow      string[] - one example row (matches columns)
 *   parseRow(obj)  fn       - map csv row object -> POST payload (or null to skip)
 *   endpoint       string   - POST URL
 *   onDone()       fn       - called after import
 */
export default function CsvImport({ templateName, columns, sampleRow, parseRow, endpoint, onDone }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);

  function downloadTemplate() {
    const csv = [columns.join(','), sampleRow.map(csvEscape).join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = templateName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setReport(null);
    const text = await file.text();
    const rows = parseCsv(text);

    let ok = 0, skipped = 0, failed = 0;
    for (const row of rows) {
      const payload = parseRow(row);
      if (!payload) { skipped++; continue; }
      try {
        const res = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) ok++; else failed++;
      } catch { failed++; }
    }
    setBusy(false);
    setReport({ ok, skipped, failed, total: rows.length });
    if (fileRef.current) fileRef.current.value = '';
    if (onDone) onDone();
  }

  const reportTone = report
    ? report.failed > 0
      ? 'bg-red-50 text-red-700'
      : report.skipped > 0
      ? 'bg-amber-50 text-amber-700'
      : 'bg-emerald-50 text-emerald-700'
    : '';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={downloadTemplate} className="btn-secondary" title="Download CSV template">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        Template
      </button>
      <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        title="Upload CSV"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-primary-700 bg-white border border-dashed border-primary-200 hover:bg-primary-50 hover:border-primary-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
            Importing…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5 text-primary-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
            Import CSV
          </>
        )}
      </button>
      {report && (
        <span className={`pill ${reportTone}`}>
          {report.ok}/{report.total} imported{report.failed > 0 ? ` · ${report.failed} failed` : ''}{report.skipped > 0 ? ` · ${report.skipped} skipped` : ''}
        </span>
      )}
    </div>
  );
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
    return obj;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}
