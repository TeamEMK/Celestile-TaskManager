// Shared CSV export — the blob + anchor dance used to be pasted into four
// admin pages, one of which (MIS) skipped quoting entirely, so a client name
// with a comma silently corrupted its export. None of them revoked the blob
// URL either, leaking one per export for the page's lifetime.

// Quote only when needed (commas, quotes, newlines) — same rule as the
// csvEscape in CsvImport.jsx.
//
// Formula-injection guard: a cell whose text starts with =, +, -, @ (or a
// tab/CR) is interpreted as a formula/DDE call by Excel or Sheets the moment
// the exported file is opened — a client/consultant name typed as e.g.
// "=HYPERLINK(...)" would otherwise execute for whoever opens the export.
// Prefixing with a single quote forces it to display as literal text
// (spreadsheet apps hide the leading quote; a plain text viewer shows it).
export function csvEscape(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
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

// Minimal RFC4180-style tokenizer: respects "quoted, fields" containing
// commas, embedded newlines and doubled "" escapes. A plain split(',') (the
// previous implementation) doesn't undo the quoting csvEscape() above
// produces, so any exported-then-reimported cell with a comma in it shifted
// every later column in that row with no error raised.
function tokenizeCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Parse for the bulk-upload modals. If the first line looks like a header
// (contains one of sniffCols), it names the columns; otherwise defaultCols
// apply positionally. (Was pasted into AddDelegateModal and AddMasterModal
// with only the column lists differing.)
export function parseCsvRows(text, defaultCols, sniffCols) {
  const lines = tokenizeCsv(text)
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
  if (!lines.length) return [];
  const header = lines[0].map((h) => h.toLowerCase());
  const looksHeader = sniffCols.some((c) => header.includes(c));
  const cols = looksHeader ? header : defaultCols;
  return lines.slice(looksHeader ? 1 : 0).map((parts) => {
    const row = {};
    cols.forEach((c, i) => { row[c] = (parts[i] || '').trim(); });
    return row;
  });
}
