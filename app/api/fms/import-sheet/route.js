import { NextResponse } from 'next/server';
import { pool, ensureSchema, toMysqlDate } from '@/lib/db';
import { requireUser } from '@/lib/api';
import { google } from 'googleapis';

function extractSheetId(url) {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

function getSheets() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Google credentials not configured in .env');
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

function detectCols(headers) {
  const h = headers.map(s => (s || '').toLowerCase().trim());
  const find = (...keys) => {
    for (const k of keys) {
      const i = h.findIndex(x => x.includes(k));
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    skm_no:       find('skm'),
    timestamp:    find('timestamp'),
    order_no:     find('order no', 'order_no', 'order'),
    client_name:  find('client name', 'client'),
    area:         find('area'),
    technology:   find('tech'),
    sft:          find('sft'),
    lead_date:    find('lead time', 'lead_time', 'leadtime'),
    planned_date: find('planned'),
    doer_name:    find('doer name', 'doer_name'),
    doer_email:   find('doer email', 'doer_email'),
    step_name:    find('step name', 'step_name', 'key'),
  };
}

function extractStepIdx(stepName) {
  const m = (stepName || '').match(/step\s*(\d+)/i);
  return m ? parseInt(m[1], 10) - 1 : 0;
}

function parseIndianDate(str) {
  if (!str) return null;
  // DD/MM/YYYY
  const p = String(str).split('/');
  if (p.length === 3 && p[2].length === 4) {
    return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  return null;
}

export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  const body = await req.json();
  const { sheetUrl, confirm, flowId, flowName, flowCoordinator, steps: providedSteps } = body;

  if (!sheetUrl) return NextResponse.json({ error: 'sheetUrl required' }, { status: 400 });
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) return NextResponse.json({ error: 'Invalid Google Sheets URL' }, { status: 400 });

  // Fetch sheet data
  let rows;
  try {
    const sheets = getSheets();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const tabName = meta.data.sheets?.[0]?.properties?.title || 'Sheet1';
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:Z`,
    });
    rows = res.data.values || [];
  } catch (err) {
    return NextResponse.json({ error: `Cannot access sheet: ${err.message}. Make sure the sheet is shared with your service account.` }, { status: 400 });
  }

  if (rows.length < 2) return NextResponse.json({ error: 'Sheet has no data rows' }, { status: 400 });

  const headers = rows[0];
  const dataRows = rows.slice(1).filter(r => r.some(c => c?.trim()));
  const cols = detectCols(headers);

  // Detect unique steps sorted by index
  const stepMap = new Map();
  const doerSet = new Set();
  dataRows.forEach(row => {
    const stepName = (row[cols.step_name] || '').trim();
    if (stepName) {
      const idx = extractStepIdx(stepName);
      if (!stepMap.has(idx)) stepMap.set(idx, stepName);
    }
    const doer = (row[cols.doer_name] || '').trim();
    if (doer) doerSet.add(doer);
  });
  const detectedSteps = Array.from(stepMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, name]) => name);

  if (!confirm) {
    // Preview mode — return analysis without importing
    return NextResponse.json({
      rowCount: dataRows.length,
      headers,
      detectedSteps,
      detectedDoers: Array.from(doerSet).sort(),
      sampleRows: dataRows.slice(0, 5).map(row => ({
        skm_no:      row[cols.skm_no]      || '',
        order_no:    row[cols.order_no]    || '',
        client_name: row[cols.client_name] || '',
        area:        row[cols.area]        || '',
        technology:  row[cols.technology]  || '',
        step_name:   row[cols.step_name]   || '',
      })),
    });
  }

  // ── Confirm mode: actually import ──────────────────────────────────────────
  await ensureSchema();
  const stepsForFlow = providedSteps?.length ? providedSteps : detectedSteps;
  let targetFlowId = flowId;

  if (!targetFlowId) {
    targetFlowId = 'FLW' + Date.now();
    await pool.query(
      'INSERT INTO fms_flows (id, name, coordinator, steps, sheet_url, color) VALUES (?, ?, ?, ?, ?, ?)',
      [targetFlowId, (flowName || 'Imported FMS').trim(), flowCoordinator || '', JSON.stringify(stepsForFlow), sheetUrl, '#2563eb']
    );
  } else {
    // Optionally update steps on existing flow
    if (stepsForFlow.length) {
      await pool.query('UPDATE fms_flows SET steps = ? WHERE id = ?', [JSON.stringify(stepsForFlow), targetFlowId]);
    }
  }

  let imported = 0, skipped = 0;
  for (const row of dataRows) {
    const skmNo = (row[cols.skm_no] || '').trim();
    if (!skmNo) { skipped++; continue; }

    // Skip duplicates in this flow
    const [existing] = await pool.query(
      'SELECT id FROM fms_flow_entries WHERE flow_id = ? AND skm_no = ?',
      [targetFlowId, skmNo]
    );
    if (existing.length) { skipped++; continue; }

    const stepName    = row[cols.step_name] || '';
    const currentStep = extractStepIdx(stepName);
    const timestamp   = row[cols.timestamp] || null;
    const leadDate    = parseIndianDate(row[cols.lead_date]);
    const plannedDate = parseIndianDate(row[cols.planned_date]);
    const doerName    = (row[cols.doer_name]  || '').trim();
    const doerEmail   = (row[cols.doer_email] || '').trim();

    const entryId = 'ENT' + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase();

    await pool.query(
      `INSERT INTO fms_flow_entries
         (id, flow_id, skm_no, order_no, client_name, area, technology, sft, lead_date, planned_date, doer_name, doer_email, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        entryId, targetFlowId, skmNo,
        (row[cols.order_no]    || '').trim(),
        (row[cols.client_name] || '').trim(),
        (row[cols.area]        || '').trim(),
        (row[cols.technology]  || '').trim(),
        (row[cols.sft]         || '').trim(),
        leadDate, plannedDate, doerName, doerEmail,
      ]
    );

    for (let i = 0; i < stepsForFlow.length; i++) {
      const isDone = i < currentStep;
      await pool.query(
        'INSERT INTO fms_flow_steps (entry_id, step_index, completed_at, completed_by) VALUES (?, ?, ?, ?)',
        [entryId, i, isDone ? (timestamp || new Date().toISOString().replace('T',' ').slice(0,19)) : null, isDone ? doerName : '']
      );
    }

    imported++;
  }

  return NextResponse.json({ success: true, flowId: targetFlowId, imported, skipped });
}
