// Shared CSV export — the blob + anchor dance used to be pasted into four
// admin pages, one of which (MIS) skipped quoting entirely, so a client name
// with a comma silently corrupted its export. None of them revoked the blob
// URL either, leaking one per export for the page's lifetime.

// Quote only when needed (commas, quotes, newlines) — same rule as the
// csvEscape in CsvImport.jsx.
export function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// rows: array of arrays. Every cell goes through csvEscape.
export function downloadCsv(filename, header, rows) {
  const text = [header, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
