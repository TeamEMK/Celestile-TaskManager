/**
 * Factory production report.
 *
 * The daily sheet the factory floor runs on: one block per department (CNC,
 * Resin, Inlay, Finishing, …), one row per worker or machine, carrying the
 * order worked on, hours, area, material and what was done.
 *
 * The column set is configuration rather than code. Two months of the real
 * reports are already different from each other — CNC gained a Helper column,
 * a material-quantity column and a day/night shift split between June and
 * August — so a department stores which fields it uses and what to call them,
 * and the form and the printed report are both built from that.
 */
import { pool, ensureSchema } from '@/lib/db';
// One id implementation for the whole app. This module used to carry its own
// copy — same idea, and the reason for it is documented there: Date.now()
// alone repeats inside a seeding loop that runs many inserts in one
// millisecond, which is how the department seed used to overwrite itself.
import { newId } from '@/lib/ids';

/* ── field catalogue ──────────────────────────────────────────────── */

// Every column a department may switch on. `key` is the DB column; `label` is
// only the default — a department can rename it (CNC calls `worker`
// "Machine Operator", everyone else calls it "Name").
export const FIELDS = [
  { key: 'worker',         label: 'Name',           always: true },
  { key: 'helper',         label: 'Helper' },
  { key: 'order_number',   label: 'Order Number' },
  { key: 'hours',          label: 'Working Hours',  numeric: true },
  { key: 'area',           label: 'Area' },
  { key: 'material',       label: 'Used Material' },
  { key: 'material_qty',   label: 'Used Material Quantity' },
  { key: 'work',           label: 'Work' },
  { key: 'machine_number', label: 'Machine Number' },
  { key: 'remarks',        label: 'Remarks' },
];

export const FIELD_KEYS = FIELDS.map((f) => f.key);
const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

// `fields` is stored as JSON: [{ key, label }] in display order. Anything
// unparseable falls back to the common set, so a bad row can't blank a form.
const DEFAULT_FIELDS = ['worker', 'order_number', 'hours', 'area', 'material', 'work'];

function parseFields(raw) {
  let list = null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length) list = parsed;
  } catch { /* fall through */ }

  const src = list || DEFAULT_FIELDS.map((key) => ({ key }));
  const seen = new Set();
  const out = [];
  for (const f of src) {
    const key = typeof f === 'string' ? f : f?.key;
    if (!FIELD_BY_KEY[key] || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: String(f?.label || '').trim() || FIELD_BY_KEY[key].label });
  }
  // `worker` is the one column a row is meaningless without.
  if (!seen.has('worker')) out.unshift({ key: 'worker', label: FIELD_BY_KEY.worker.label });
  return out;
}

function serializeFields(list) {
  return JSON.stringify(parseFields(list));
}

/* ── departments ──────────────────────────────────────────────────── */

const shape = (row) => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sort_order,
  hasShifts: !!row.has_shifts,
  active: !!row.active,
  fields: parseFields(row.fields),
});

export async function listDepartments({ includeInactive = false } = {}) {
  await ensureSchema();
  const [rows] = await pool.query('SELECT * FROM production_departments ORDER BY sort_order');
  return rows
    .filter((r) => includeInactive || Number(r.active) === 1)
    .map(shape)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function createDepartment({ name, hasShifts, fields, sortOrder }) {
  await ensureSchema();
  const id = newId('PD');
  // MAX() isn't in the Sheets-as-DB SQL subset (lib/sql-sheets.js), and the
  // table is a handful of rows — read them and take the max here instead.
  const [existing] = await pool.query('SELECT * FROM production_departments');
  const maxOrder = existing.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0);
  await pool.query(
    `INSERT INTO production_departments (id, name, sort_order, has_shifts, fields, active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, NOW())`,
    [id, name.trim(), Number.isFinite(sortOrder) ? sortOrder : maxOrder + 10,
     hasShifts ? 1 : 0, serializeFields(fields)],
  );
  return id;
}

export async function updateDepartment(id, { name, hasShifts, fields, sortOrder, active }) {
  await ensureSchema();
  await pool.query(
    `UPDATE production_departments
        SET name = COALESCE(?, name),
            has_shifts = COALESCE(?, has_shifts),
            fields = COALESCE(?, fields),
            sort_order = COALESCE(?, sort_order),
            active = COALESCE(?, active)
      WHERE id = ?`,
    [
      name?.trim() ?? null,
      hasShifts == null ? null : (hasShifts ? 1 : 0),
      fields == null ? null : serializeFields(fields),
      Number.isFinite(sortOrder) ? sortOrder : null,
      active == null ? null : (active ? 1 : 0),
      id,
    ],
  );
}

// Departments are never hard-deleted while entries reference them — a deleted
// department would silently erase its rows from every past report.
export async function deleteDepartment(id) {
  await ensureSchema();
  const [[{ n }]] = await pool.query(
    'SELECT COUNT(*) AS n FROM production_entries WHERE department_id = ?', [id],
  );
  if (n > 0) {
    await pool.query('UPDATE production_departments SET active = 0 WHERE id = ?', [id]);
    return { deactivated: true, entries: n };
  }
  await pool.query('DELETE FROM production_departments WHERE id = ?', [id]);
  return { deleted: true };
}

// The departments the factory actually runs, seeded from the reports they are
// already producing in Excel. Only ever runs into an empty table.
const SEED = [
  { name: 'CNC Department', hasShifts: true,
    fields: [
      { key: 'worker', label: 'Machine Operator' }, { key: 'helper' },
      { key: 'order_number' }, { key: 'hours' }, { key: 'area' },
      { key: 'material' }, { key: 'material_qty' }, { key: 'work' }, { key: 'machine_number' },
    ] },
  { name: 'Resin Department' },
  { name: 'Metal, Laser & Blasting Department' },
  { name: 'Inlay Department' },
  { name: 'Cutting Department (Polishing)' },
  { name: 'Finishing Department' },
  { name: 'Packed & Dispatched' },
  { name: 'Handwork Department' },
];

const COMMON = ['worker', 'order_number', 'hours', 'area', 'material', 'material_qty', 'work'];

export async function seedDepartments() {
  await ensureSchema();
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM production_departments');
  if (n > 0) return { seeded: 0 };
  let order = 10;
  for (const d of SEED) {
    await createDepartment({
      name: d.name,
      hasShifts: !!d.hasShifts,
      fields: d.fields || COMMON.map((key) => ({ key })),
      sortOrder: order,
    });
    order += 10;
  }
  return { seeded: SEED.length };
}

/* ── one day's report ─────────────────────────────────────────────── */

const entryShape = (r) => ({
  id: r.id,
  date: r.entry_date,
  departmentId: r.department_id,
  department: r.department,
  shift: r.shift || '',
  sNo: r.s_no,
  worker: r.worker,
  helper: r.helper,
  order_number: r.order_number,
  hours: Number(r.hours) || 0,
  area: r.area,
  material: r.material,
  material_qty: r.material_qty,
  work: r.work,
  machine_number: r.machine_number,
  remarks: r.remarks || '',
});

export async function getDayReport(date) {
  await ensureSchema();
  const [[entries], [notes], departments] = await Promise.all([
    pool.query('SELECT * FROM production_entries WHERE entry_date = ? ORDER BY department_id, shift, s_no', [date]),
    pool.query('SELECT * FROM production_notes WHERE entry_date = ?', [date]),
    listDepartments(),
  ]);
  return {
    date,
    departments,
    entries: entries.map(entryShape),
    notes: notes.map((n) => ({ departmentId: n.department_id, shift: n.shift || '', note: n.note || '' })),
  };
}

/**
 * Replace one department+shift block for one date.
 *
 * The form edits a whole block at a time, so this is a delete-then-insert
 * rather than a per-row diff: it keeps the stored S.No order identical to what
 * the user sees, and means a removed row actually disappears.
 */
export async function saveBlock({ date, departmentId, shift = '', rows = [], note = '', userId = null }) {
  await ensureSchema();
  const [[dept]] = await pool.query('SELECT * FROM production_departments WHERE id = ?', [departmentId]);
  if (!dept) throw new Error('Unknown department');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'DELETE FROM production_entries WHERE entry_date = ? AND department_id = ? AND shift = ?',
      [date, departmentId, shift],
    );

    let sNo = 0;
    for (const row of rows) {
      // A row with nothing in it is not an empty row to store, it's a row the
      // user never filled — the real sheets are full of these.
      const hasAny = FIELD_KEYS.some((k) => String(row?.[k] ?? '').trim() !== '');
      if (!hasAny) continue;
      sNo += 1;
      await conn.query(
        `INSERT INTO production_entries
           (id, entry_date, department_id, department, shift, s_no,
            worker, helper, order_number, hours, area, material, material_qty,
            work, machine_number, remarks, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          newId('PE'),
          date, departmentId, dept.name, shift, sNo,
          str(row.worker), str(row.helper), str(row.order_number),
          num(row.hours), str(row.area), str(row.material), str(row.material_qty),
          str(row.work), str(row.machine_number), row.remarks || null, userId,
        ],
      );
    }

    const noteText = String(note || '').trim();
    if (noteText) {
      await conn.query(
        `INSERT INTO production_notes (id, entry_date, department_id, shift, note)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE note = VALUES(note)`,
        [productionNoteId(date, departmentId, shift), date, departmentId, shift, noteText],
      );
    } else {
      await conn.query(
        'DELETE FROM production_notes WHERE entry_date = ? AND department_id = ? AND shift = ?',
        [date, departmentId, shift],
      );
    }

    await conn.commit();
    return { rows: sNo };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Stable id for one day's note on one department block.
 *
 * It has to be deterministic (the INSERT relies on ON DUPLICATE KEY UPDATE)
 * and it has to fit VARCHAR(24). Concatenating date + departmentId + shift and
 * slicing to 24 put the shift LAST, so with a long department id the shift was
 * the part that got cut — day and night collapsed onto the same id and one
 * shift's note overwrote the other's. Put the shift where it can't be trimmed
 * and give the department id the remaining room.
 */
function productionNoteId(date, departmentId, shift) {
  const d = String(date || '').replace(/\D/g, '').slice(0, 8);          // YYYYMMDD
  const sh = (String(shift || '').trim().toUpperCase()[0] || 'X');       // D / N / X
  const dept = String(departmentId || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  // 'PN' + 8 + 1 = 11 used, 13 left for the department id.
  return `PN${d}${sh}${dept.slice(-13)}`;
}

const str = (v) => String(v ?? '').trim().slice(0, 500);
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/* ── reports ──────────────────────────────────────────────────────── */

// One cell often holds several people ("ASHOK , SUMANTA , KALIA MAHAKULA")
// because they worked the machine together. For a per-person total each named
// worker is credited the row's hours — they were all there for them.
function splitNames(value) {
  return String(value ?? '')
    .split(/\s*[,/]\s*|\s*&\s*/)
    .map((s) => s.trim())
    .filter((s) => s && !/^-+$/.test(s) && !/^(empty|no work|nil|na)$/i.test(s));
}

export async function workerHours({ from, to, departmentId = '' }) {
  await ensureSchema();
  const params = [from, to];
  let sql = 'SELECT * FROM production_entries WHERE entry_date BETWEEN ? AND ?';
  if (departmentId) { sql += ' AND department_id = ?'; params.push(departmentId); }
  const [rows] = await pool.query(sql, params);

  const byWorker = new Map();
  for (const r of rows) {
    const hours = Number(r.hours) || 0;
    const names = [...splitNames(r.worker), ...splitNames(r.helper)];
    for (const name of new Set(names)) {
      const key = name.toUpperCase();
      if (!byWorker.has(key)) {
        byWorker.set(key, { worker: name, hours: 0, entries: 0, days: new Set(), departments: new Set(), orders: new Set() });
      }
      const w = byWorker.get(key);
      w.hours += hours;
      w.entries += 1;
      w.days.add(String(r.entry_date));
      if (r.department) w.departments.add(r.department);
      for (const o of splitNames(r.order_number)) w.orders.add(o);
    }
  }

  return [...byWorker.values()]
    .map((w) => ({
      worker: w.worker,
      hours: Math.round(w.hours * 100) / 100,
      entries: w.entries,
      days: w.days.size,
      departments: [...w.departments].sort(),
      orders: [...w.orders].sort(),
    }))
    .sort((a, b) => b.hours - a.hours || a.worker.localeCompare(b.worker));
}

// An order's journey across the floor: which departments touched it, when,
// for how long, and who worked on it.
export async function orderTracking({ from, to, order = '' }) {
  await ensureSchema();
  // LIKE isn't in the Sheets SQL subset, so the range is fetched and the
  // order filter applied here — it has to be re-checked per split order
  // number anyway, since one cell can name several.
  const [rows] = await pool.query(
    'SELECT * FROM production_entries WHERE entry_date BETWEEN ? AND ? ORDER BY entry_date',
    [from, to],
  );

  const byOrder = new Map();
  for (const r of rows) {
    const hours = Number(r.hours) || 0;
    for (const ord of new Set(splitNames(r.order_number))) {
      if (order && !ord.toUpperCase().includes(order.toUpperCase())) continue;
      const key = ord.toUpperCase();
      if (!byOrder.has(key)) {
        byOrder.set(key, { order: ord, hours: 0, entries: 0, first: null, last: null, byDept: new Map(), workers: new Set() });
      }
      const o = byOrder.get(key);
      o.hours += hours;
      o.entries += 1;
      const d = String(r.entry_date);
      if (!o.first || d < o.first) o.first = d;
      if (!o.last || d > o.last) o.last = d;
      const dept = r.department || '—';
      const cur = o.byDept.get(dept) || { department: dept, hours: 0, entries: 0, first: d, last: d };
      cur.hours += hours; cur.entries += 1;
      if (d < cur.first) cur.first = d;
      if (d > cur.last) cur.last = d;
      o.byDept.set(dept, cur);
      for (const w of [...splitNames(r.worker), ...splitNames(r.helper)]) o.workers.add(w);
    }
  }

  return [...byOrder.values()]
    .map((o) => ({
      order: o.order,
      hours: Math.round(o.hours * 100) / 100,
      entries: o.entries,
      first: o.first,
      last: o.last,
      workers: o.workers.size,
      departments: [...o.byDept.values()]
        .map((d) => ({ ...d, hours: Math.round(d.hours * 100) / 100 }))
        .sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0)),
    }))
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
}

// Dates that already have entries, so the day picker can show which days are
// filled rather than making someone hunt for them.
export async function filledDates({ from, to }) {
  await ensureSchema();
  // GROUP BY isn't in the Sheets SQL subset — group here.
  const [rows] = await pool.query(
    'SELECT * FROM production_entries WHERE entry_date BETWEEN ? AND ?', [from, to],
  );
  const byDate = new Map();
  for (const r of rows) {
    const d = String(r.entry_date);
    if (!byDate.has(d)) byDate.set(d, { date: d, rows: 0, depts: new Set() });
    const e = byDate.get(d);
    e.rows += 1;
    e.depts.add(r.department_id);
  }
  return [...byDate.values()]
    .map((e) => ({ date: e.date, rows: e.rows, departments: e.depts.size }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ── shop-floor helpers ───────────────────────────────────────────── */

const daysBefore = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA');
};

/**
 * What this department has typed into each column before.
 *
 * The floor enters this on a tablet, and re-typing "8MM ENDMILL" or a worker's
 * name by hand every day is both slow and how the data gets dirty — one typo
 * splits a worker's hours across two names in the attendance report. These
 * feed a suggestion list on every field, most-used first.
 */
export async function fieldSuggestions({ departmentId, days = 120 }) {
  await ensureSchema();
  const [rows] = await pool.query(
    'SELECT * FROM production_entries WHERE entry_date BETWEEN ? AND ?',
    [daysBefore(days), daysBefore(-1)],
  );

  const counts = {};
  for (const key of FIELD_KEYS) counts[key] = new Map();

  for (const r of rows) {
    if (departmentId && r.department_id !== departmentId) continue;
    for (const key of FIELD_KEYS) {
      if (key === 'hours') continue; // a number, not a vocabulary
      const raw = String(r[key] ?? '').trim();
      if (!raw) continue;
      // Names and orders arrive several to a cell; suggest each on its own so
      // picking one doesn't drag the whole group along.
      const parts = (key === 'worker' || key === 'helper' || key === 'order_number')
        ? splitNames(raw) : [raw];
      for (const p of parts) {
        const k = p.trim();
        if (!k) continue;
        counts[key].set(k, (counts[key].get(k) || 0) + 1);
      }
    }
  }

  const out = {};
  for (const key of FIELD_KEYS) {
    out[key] = [...counts[key].entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 60)
      .map(([value]) => value);
  }
  return out;
}

/**
 * The most recent earlier block for this department+shift.
 *
 * Day to day these reports barely change — the same crew on the same machines,
 * often the same order. Copying the last filled day and editing it is far less
 * work than typing eight rows from scratch.
 */
export async function lastBlock({ departmentId, shift = '', before, days = 60 }) {
  await ensureSchema();
  const [rows] = await pool.query(
    'SELECT * FROM production_entries WHERE entry_date BETWEEN ? AND ?',
    [daysBefore(days), before],
  );
  const mine = rows.filter((r) => (
    r.department_id === departmentId && (r.shift || '') === shift && String(r.entry_date) < before
  ));
  if (!mine.length) return { date: null, rows: [] };

  const latest = mine.reduce((m, r) => (String(r.entry_date) > m ? String(r.entry_date) : m), '');
  return {
    date: latest,
    rows: mine
      .filter((r) => String(r.entry_date) === latest)
      .sort((a, b) => Number(a.s_no) - Number(b.s_no))
      .map(entryShape),
  };
}
