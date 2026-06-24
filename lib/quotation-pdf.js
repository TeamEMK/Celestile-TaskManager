/**
 * Server-side PDF generation for Celestile quotations using pdfmake.
 * Works in Node.js without any browser / Puppeteer dependency.
 */
import PdfPrinter from 'pdfmake';

// Standard PDF-built-in fonts — no font files needed.
const FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(FONTS);

const GOLD = '#C9A96E';
const DARK = '#1a1a2e';

const parseJson = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const fmt = (n) => '₹ ' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

function cell(text, opts = {}) {
  return { text: String(text ?? ''), fontSize: 8, color: '#333', margin: [3, 3, 3, 3], ...opts };
}
function hcell(text) {
  return { text, fontSize: 8, bold: true, color: '#fff', fillColor: DARK, margin: [3, 4, 3, 4] };
}
function infoRow(label, value) {
  if (!value) return { text: '', margin: [0, 0, 0, 0] };
  return {
    columns: [
      { text: label + ':', width: 70, fontSize: 8, color: '#888888' },
      { text: String(value), fontSize: 8, color: '#222222' },
    ],
    margin: [0, 1, 0, 1],
  };
}

const tableLayout = {
  hLineWidth: (i, node) =>
    i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
  vLineWidth: () => 0,
  hLineColor: (i) => (i === 1 ? '#555555' : '#dddddd'),
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 3,
  paddingBottom: () => 3,
  fillColor: (rowIdx) => (rowIdx > 0 && rowIdx % 2 === 0 ? '#f7f7f7' : null),
};

export async function generateQuotationPdf(q) {
  const stone = parseJson(q.stone_items).filter(r => r.desc || r.price);
  const fixing = parseJson(q.fixing_items).filter(r => Number(r.qty) > 0);
  const branch = (q.branch || 'bangalore').toLowerCase();
  const branchLabel = branch === 'hyderabad' ? 'Hyderabad' : 'Bangalore';

  const stoneRows = [
    [hcell('#'), hcell('Description'), hcell('Area'), hcell('Size'), hcell('Material / Thickness'), hcell('Qty'), hcell('Rate (₹)'), { ...hcell('Amount (₹)'), alignment: 'right' }],
    ...stone.map((r, i) => {
      const price = parseFloat(r.price) || 0;
      const qty   = parseFloat(r.qty)   || 0;
      const mat   = [r.mat, r.thk].filter(Boolean).join(' / ') || '—';
      return [
        cell(i + 1, { alignment: 'center' }),
        cell(r.desc || '—'),
        cell(r.area || '—'),
        cell(r.size || '—'),
        cell(mat),
        cell(qty || '—', { alignment: 'right' }),
        cell(price ? price.toLocaleString('en-IN') : '—', { alignment: 'right' }),
        cell(price && qty ? fmt(price * qty) : '—', { alignment: 'right', bold: true }),
      ];
    }),
  ];

  const fixingRows = fixing.length ? [
    [hcell('#'), hcell('Description'), hcell('Material'), hcell('Size'), hcell('Unit'), { ...hcell('Qty'), alignment: 'right' }, { ...hcell('Amount (₹)'), alignment: 'right' }],
    ...fixing.map((r, i) => {
      const price = parseFloat(r.price) || 0;
      const qty   = parseFloat(r.qty)   || 0;
      return [
        cell(i + 1, { alignment: 'center' }),
        cell(r.desc || '—'),
        cell(r.mat  || '—'),
        cell(r.size || '—'),
        cell(r.unit || '—'),
        cell(qty,               { alignment: 'right' }),
        cell(fmt(price * qty),  { alignment: 'right', bold: true }),
      ];
    }),
  ] : null;

  const docDef = {
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    pageSize: 'A4',
    pageMargins: [32, 32, 32, 44],

    footer: (page, pages) => ({
      text: `Celestile — ${branchLabel}  |  Page ${page} of ${pages}`,
      alignment: 'center', fontSize: 7.5, color: '#aaaaaa', margin: [0, 10, 0, 0],
    }),

    content: [
      // ── Brand header ───────────────────────────────────────
      {
        columns: [
          {
            stack: [
              { text: 'CELESTILE', fontSize: 22, bold: true, color: DARK, characterSpacing: 3 },
              { text: 'The Home & Bath Boutique', fontSize: 8, color: GOLD, margin: [1, 2, 0, 0] },
              { text: branchLabel, fontSize: 7.5, color: '#999', margin: [1, 2, 0, 0] },
            ],
          },
          {
            stack: [
              { text: 'QUOTATION', fontSize: 18, bold: true, color: DARK, alignment: 'right' },
              { text: `Ref: ${q.ref_no || '—'}`, fontSize: 9, color: '#666', alignment: 'right', margin: [0, 4, 0, 0] },
            ],
          },
        ],
        margin: [0, 0, 0, 8],
      },
      // gold rule
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 531, y2: 0, lineWidth: 1.5, lineColor: GOLD }], margin: [0, 0, 0, 10] },

      // ── Client + Quotation info ────────────────────────────
      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'Client Details', fontSize: 8, bold: true, color: GOLD, margin: [0, 0, 0, 4] },
              infoRow('Name',    q.client_name),
              infoRow('Firm',    q.client_firm),
              infoRow('Contact', q.client_contact),
              infoRow('Email',   q.client_email),
              infoRow('Site',    q.site_address),
              infoRow('Billing', q.billing_address),
            ],
          },
          {
            width: '50%',
            stack: [
              { text: 'Quotation Details', fontSize: 8, bold: true, color: GOLD, margin: [0, 0, 0, 4] },
              infoRow('Boutique',   q.boutique),
              infoRow('Validity',   q.validity),
              infoRow('Lead Time',  q.lead_time),
              infoRow('Transport',  q.transport),
              infoRow('Consultant', q.consultant),
              infoRow('Architect',  q.architect_name || q.architect),
            ],
          },
        ],
        margin: [0, 0, 0, 14],
      },

      // ── Stone items ────────────────────────────────────────
      ...(stone.length ? [
        { text: 'Stone / Material Selections', fontSize: 9, bold: true, color: DARK, margin: [0, 0, 0, 4] },
        {
          table: { headerRows: 1, widths: [16, '*', 28, 36, 60, 24, 44, 50], body: stoneRows },
          layout: tableLayout,
          margin: [0, 0, 0, 12],
        },
      ] : []),

      // ── Fixing items ───────────────────────────────────────
      ...(fixingRows ? [
        { text: 'Fixing / Labour', fontSize: 9, bold: true, color: DARK, margin: [0, 0, 0, 4] },
        {
          table: { headerRows: 1, widths: [16, '*', 48, 36, 28, 28, 50], body: fixingRows },
          layout: tableLayout,
          margin: [0, 0, 0, 12],
        },
      ] : []),

      // ── Grand total ────────────────────────────────────────
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 'auto',
            table: {
              widths: [110, 90],
              body: [[
                { text: 'GRAND TOTAL', bold: true, fontSize: 10, color: DARK, margin: [6, 6, 6, 6] },
                { text: q.grand_total || '—', bold: true, fontSize: 10, color: GOLD, alignment: 'right', margin: [6, 6, 6, 6] },
              ]],
            },
            layout: {
              hLineWidth: () => 1.5, vLineWidth: () => 0,
              hLineColor: () => GOLD,
            },
          },
        ],
        margin: [0, 0, 0, 14],
      },

      // ── Payment terms ──────────────────────────────────────
      ...(q.payment_terms ? [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 531, y2: 0, lineWidth: 0.5, lineColor: '#e0e0e0' }], margin: [0, 0, 0, 6] },
        { text: 'Payment Terms', fontSize: 8, bold: true, color: GOLD, margin: [0, 0, 0, 2] },
        { text: q.payment_terms, fontSize: 8, color: '#555555' },
      ] : []),
    ],
  };

  return new Promise((resolve, reject) => {
    const doc = printer.createPdfKitDocument(docDef);
    const chunks = [];
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
