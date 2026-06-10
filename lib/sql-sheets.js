/**
 * A tiny SQL engine that runs the app's (finite, known) set of MySQL queries
 * against Google-Sheets-backed tables (see lib/sheets-client.js).
 *
 * It is intentionally NOT a general SQL parser — it supports exactly the
 * statement shapes this codebase uses:
 *   SELECT [cols|*|COUNT(*) AS x] FROM t [WHERE ...] [ORDER BY ...] [LIMIT n]
 *   INSERT INTO t (cols) VALUES (...) [ON DUPLICATE KEY UPDATE ...]
 *   INSERT INTO t (cols) VALUES ?            (bulk; param is array of rows)
 *   UPDATE t SET ... WHERE ...
 *   DELETE FROM t [WHERE ...]
 *   CREATE TABLE / ALTER TABLE              (no-op; tabs are pre-ensured)
 *
 * WHERE supports: col {= < > <= >= != } {? 'lit' NUM NULL NOW() CURDATE()},
 *   col BETWEEN a AND b, LOWER(col)=?, FIND_IN_SET('x',col) {=|>} n,
 *   col IS [NOT] NULL, joined by AND.
 */
import { SCHEMAS, PRIMARY_KEYS, getTables, loadAll, flushTable, invalidateCache } from './sheets-client.js';

/* ── date helpers (UTC, MySQL-style strings) ───────────────────────────── */
const pad = (n) => String(n).padStart(2, '0');
function nowDateTime(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
function today() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/* ── small parsing utils ───────────────────────────────────────────────── */
// split on a delimiter at top level (ignoring commas inside () or '')
function splitTop(str, delim = ',') {
  const out = [];
  let depth = 0, inStr = false, cur = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) { cur += c; if (c === "'") inStr = false; continue; }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === delim && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '' || out.length) out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s.length);
}

function stripQuotes(t) {
  return t.startsWith("'") && t.endsWith("'") ? t.slice(1, -1).replace(/''/g, "'") : t;
}

// resolve a scalar token used as a value (RHS / VALUES / SET)
function resolveScalar(tok, ctx) {
  tok = tok.trim();
  if (tok === '?') return ctx.params[ctx.idx++];
  if (/^NULL$/i.test(tok)) return null;
  if (/^NOW\(\)$/i.test(tok)) return nowDateTime();
  if (/^CURDATE\(\)$/i.test(tok)) return today();
  if (/^DATE_ADD\(\s*NOW\(\)\s*,\s*INTERVAL\s+(\d+)\s+DAY\s*\)$/i.test(tok)) {
    const days = Number(tok.match(/INTERVAL\s+(\d+)\s+DAY/i)[1]);
    return nowDateTime(new Date(Date.now() + days * 86400000));
  }
  if (tok.startsWith("'")) return stripQuotes(tok);
  if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
  return tok;
}

function looksNumeric(v) {
  return v !== '' && v !== null && v !== undefined && !isNaN(Number(v));
}

function compare(lhs, op, rhs) {
  if (rhs === null) {
    const empty = lhs === null || lhs === undefined || lhs === '';
    return op === '!=' || op === '<>' ? !empty : empty;
  }
  if (op === '=' ) return String(lhs ?? '') === String(rhs);
  if (op === '!=' || op === '<>') return String(lhs ?? '') !== String(rhs);
  // ordering
  let a = lhs, b = rhs;
  if (looksNumeric(a) && looksNumeric(b)) { a = Number(a); b = Number(b); }
  else { a = String(a ?? ''); b = String(b ?? ''); }
  if (op === '<') return a < b;
  if (op === '>') return a > b;
  if (op === '<=') return a <= b;
  if (op === '>=') return a >= b;
  return false;
}

// build a predicate(row) from a WHERE string, consuming params in order
function parseWhere(whereStr, ctx) {
  let s = whereStr.trim();
  const conds = [];
  while (s.length) {
    let m;
    if ((m = s.match(/^FIND_IN_SET\(\s*'([^']*)'\s*,\s*`?(\w+)`?\s*\)\s*(=|>|<|>=|<=)\s*(\d+)/i))) {
      const val = m[1], col = m[2], op = m[3], n = Number(m[4]);
      conds.push((row) => {
        const present = String(row[col] || '').split(',').map((x) => x.trim()).includes(val);
        const pos = present ? 1 : 0;
        return compare(pos, op, n);
      });
      s = s.slice(m[0].length);
    } else if ((m = s.match(/^LOWER\(\s*`?(\w+)`?\s*\)\s*=\s*(\?|'[^']*')/i))) {
      const col = m[1]; const rhs = resolveScalar(m[2], ctx);
      conds.push((row) => String(row[col] ?? '').toLowerCase() === String(rhs ?? '').toLowerCase());
      s = s.slice(m[0].length);
    } else if ((m = s.match(/^`?(\w+)`?\s+BETWEEN\s+(\?|'[^']*'|\S+?)\s+AND\s+(\?|'[^']*'|\S+)/i))) {
      const col = m[1]; const lo = resolveScalar(m[2], ctx); const hi = resolveScalar(m[3], ctx);
      conds.push((row) => {
        const v = row[col];
        if (v === null || v === undefined || v === '') return false;
        return String(v) >= String(lo) && String(v) <= String(hi);
      });
      s = s.slice(m[0].length);
    } else if ((m = s.match(/^`?(\w+)`?\s+IS\s+NOT\s+NULL/i))) {
      const col = m[1];
      conds.push((row) => row[col] !== null && row[col] !== undefined && row[col] !== '');
      s = s.slice(m[0].length);
    } else if ((m = s.match(/^`?(\w+)`?\s+IS\s+NULL/i))) {
      const col = m[1];
      conds.push((row) => row[col] === null || row[col] === undefined || row[col] === '');
      s = s.slice(m[0].length);
    } else if ((m = s.match(/^`?(\w+)`?\s*(<=|>=|!=|<>|=|<|>)\s*(\?|'[^']*'|CURDATE\(\)|NOW\(\)|NULL|-?\d+(?:\.\d+)?)/i))) {
      const col = m[1], op = m[2]; const rhs = resolveScalar(m[3], ctx);
      conds.push((row) => compare(row[col], op, rhs));
      s = s.slice(m[0].length);
    } else {
      throw new Error('sheets-sql: unsupported WHERE near "' + s.slice(0, 50) + '"');
    }
    s = s.trim();
    const am = s.match(/^AND\s+/i);
    if (am) { s = s.slice(am[0].length); continue; }
    if (/^OR\b/i.test(s)) throw new Error('sheets-sql: OR not supported');
    if (s.length) throw new Error('sheets-sql: trailing WHERE "' + s.slice(0, 40) + '"');
  }
  return (row) => conds.every((fn) => fn(row));
}

function applyOrder(rows, orderStr) {
  const keys = splitTop(orderStr).map((part) => {
    const mm = part.trim().match(/^`?(\w+)`?(?:\s+(ASC|DESC))?$/i);
    return { col: mm[1], dir: (mm[2] || 'ASC').toUpperCase() };
  });
  return rows.slice().sort((a, b) => {
    for (const { col, dir } of keys) {
      let x = a[col], y = b[col];
      if (looksNumeric(x) && looksNumeric(y)) { x = Number(x); y = Number(y); }
      else { x = String(x ?? ''); y = String(y ?? ''); }
      if (x < y) return dir === 'DESC' ? 1 : -1;
      if (x > y) return dir === 'DESC' ? -1 : 1;
    }
    return 0;
  });
}

function pkMatch(table, a, b) {
  return PRIMARY_KEYS[table].every((k) => String(a[k] ?? '') === String(b[k] ?? ''));
}

/* ── statement execution (mutates the cached table arrays) ─────────────── */
async function execute(sql, params) {
  const clean = sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  const ctx = { params: params || [], idx: 0 };
  const tables = await getTables();

  // CREATE / ALTER — tabs are pre-ensured, treat as no-ops
  if (/^CREATE TABLE/i.test(clean) || /^ALTER TABLE/i.test(clean)) {
    return { rows: [], result: { affectedRows: 0 }, dirty: null };
  }

  let m;

  /* SELECT */
  if ((m = clean.match(/^SELECT (.+?) FROM `?(\w+)`?(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i))) {
    const selList = m[1], table = m[2], whereStr = m[3], orderStr = m[4], limit = m[5];
    if (!SCHEMAS[table]) throw new Error('sheets-sql: unknown table ' + table);
    let rows = tables[table];
    if (whereStr) { const pred = parseWhere(whereStr, ctx); rows = rows.filter(pred); }

    // COUNT(*)
    const cm = selList.match(/^COUNT\(\*\)\s+AS\s+`?(\w+)`?$/i);
    if (cm) return { rows: [{ [cm[1]]: rows.length }], result: null, dirty: null };

    if (orderStr) rows = applyOrder(rows, orderStr);
    if (limit) rows = rows.slice(0, Number(limit));

    if (selList.trim() === '*') {
      return { rows: rows.map((r) => ({ ...r })), result: null, dirty: null };
    }
    const cols = splitTop(selList).map((item) => {
      const am = item.match(/^`?([\w]+)`?\s+AS\s+`?(\w+)`?$/i);
      if (am) return { src: am[1], out: am[2] };
      const cm2 = item.match(/^`?(\w+)`?$/);
      return { src: cm2[1], out: cm2[1] };
    });
    const projected = rows.map((r) => {
      const o = {};
      cols.forEach(({ src, out }) => { o[out] = r[src]; });
      return o;
    });
    return { rows: projected, result: null, dirty: null };
  }

  /* INSERT */
  if ((m = clean.match(/^INSERT INTO `?(\w+)`?\s*\(([^)]+)\)\s+VALUES\s+(.+)$/i))) {
    const table = m[1];
    const cols = splitTop(m[2]).map((c) => c.replace(/`/g, '').trim());
    let rest = m[3].trim();
    if (!SCHEMAS[table]) throw new Error('sheets-sql: unknown table ' + table);

    let onDup = null;
    const od = rest.match(/\s+ON DUPLICATE KEY UPDATE\s+(.+)$/i);
    if (od) { onDup = od[1]; rest = rest.slice(0, od.index).trim(); }

    const arr = tables[table];
    const newRows = [];

    if (rest === '?') {
      // bulk: params[0] is an array of value-arrays
      const bulk = ctx.params[ctx.idx++] || [];
      for (const tuple of bulk) {
        const row = blankRow(table);
        cols.forEach((c, i) => { row[c] = normalizeStore(tuple[i]); });
        newRows.push(row);
      }
    } else {
      // one or more (..) tuples (parens may nest, e.g. DATE_ADD(NOW(), ...))
      const tuples = extractTuples(rest);
      for (const tup of tuples) {
        const vals = splitTop(tup).map((t) => normalizeStore(resolveScalar(t, ctx)));
        const row = blankRow(table);
        cols.forEach((c, i) => { row[c] = vals[i]; });
        newRows.push(row);
      }
    }

    let affected = 0;
    for (const row of newRows) {
      const existingIdx = arr.findIndex((e) => pkMatch(table, e, row));
      if (existingIdx >= 0) {
        if (onDup) { applyAssignments(arr[existingIdx], onDup, ctx, row); affected += 2; }
        else { arr[existingIdx] = row; affected += 1; }
      } else { arr.push(row); affected += 1; }
    }
    const lastPk = newRows.length ? newRows[newRows.length - 1][PRIMARY_KEYS[table][0]] : null;
    return { rows: [], result: { affectedRows: affected, insertId: lastPk }, dirty: table };
  }

  /* UPDATE */
  if ((m = clean.match(/^UPDATE `?(\w+)`?\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i)) ||
      (m = clean.match(/^UPDATE `?(\w+)`?\s+SET\s+(.+)$/i))) {
    const table = m[1], setStr = m[2], whereStr = m[3];
    if (!SCHEMAS[table]) throw new Error('sheets-sql: unknown table ' + table);
    const arr = tables[table];
    // MySQL binds params left-to-right: SET first, then WHERE. Resolve SET
    // assignments (consuming their params) BEFORE parsing WHERE. Each becomes a
    // per-row evaluator so COALESCE(?, col) can fall back to the current value.
    const assigns = [];
    for (const tok of splitTop(setStr)) {
      const am = tok.match(/^`?(\w+)`?\s*=\s*([\s\S]+)$/);
      const col = am[1]; const expr = am[2].trim();
      const cm = expr.match(/^COALESCE\(\s*(.+?)\s*,\s*`?(\w+)`?\s*\)$/i);
      if (cm) {
        const provided = resolveScalar(cm[1], ctx);   // consumes its param now
        const fallbackCol = cm[2];
        assigns.push({ col, fn: (row) => (provided !== null && provided !== undefined ? provided : row[fallbackCol]) });
      } else {
        const v = resolveScalar(expr, ctx);
        assigns.push({ col, fn: () => v });
      }
    }
    const pred = whereStr ? parseWhere(whereStr, ctx) : () => true;
    const targets = arr.filter(pred);
    for (const row of targets) for (const a of assigns) row[a.col] = normalizeStore(a.fn(row));
    return { rows: [], result: { affectedRows: targets.length }, dirty: table };
  }

  /* DELETE */
  if ((m = clean.match(/^DELETE FROM `?(\w+)`?(?:\s+WHERE\s+(.+))?$/i))) {
    const table = m[1], whereStr = m[2];
    if (!SCHEMAS[table]) throw new Error('sheets-sql: unknown table ' + table);
    const arr = tables[table];
    let removed;
    if (!whereStr) { removed = arr.length; arr.length = 0; }
    else {
      const pred = parseWhere(whereStr, ctx);
      removed = 0;
      for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) { arr.splice(i, 1); removed++; }
    }
    return { rows: [], result: { affectedRows: removed }, dirty: table };
  }

  throw new Error('sheets-sql: unsupported statement "' + clean.slice(0, 60) + '"');
}

// extract top-level parenthesized groups, returning their inner contents.
// respects nested parens (e.g. DATE_ADD(NOW(), INTERVAL 15 DAY)) and quotes.
function extractTuples(str) {
  const out = [];
  let depth = 0, inStr = false, start = -1;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) { if (c === "'") inStr = false; continue; }
    if (c === "'") { inStr = true; continue; }
    if (c === '(') { if (depth === 0) start = i + 1; depth++; }
    else if (c === ')') { depth--; if (depth === 0) out.push(str.slice(start, i)); }
  }
  return out.length ? out : [str];
}

function blankRow(table) {
  const r = {};
  for (const c of SCHEMAS[table]) r[c] = '';
  return r;
}

// store-friendly value: numbers/strings kept; null -> '' ; Date -> iso
function normalizeStore(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return nowDateTime(v);
  return v;
}

function applyAssignments(row, assignStr, ctx, insertedRow) {
  for (const tok of splitTop(assignStr)) {
    const am = tok.match(/^`?(\w+)`?\s*=\s*(.+)$/);
    const col = am[1]; const expr = am[2].trim();
    const vm = expr.match(/^VALUES\(\s*`?(\w+)`?\s*\)$/i);
    if (vm) row[col] = insertedRow[vm[1]];
    else row[col] = normalizeStore(resolveScalar(expr, ctx));
  }
}

/* ── public API (mysql2-compatible shapes) ─────────────────────────────── */

// pool.query(sql, params) -> [rows|resultHeader, fields]
export async function query(sql, params) {
  await loadAll(); // refresh snapshot (honours short TTL)
  const r = await execute(sql, params);
  if (r.dirty) await flushTable(r.dirty);
  return [r.result ? r.result : r.rows, undefined];
}

// pool.getConnection() -> transaction-capable connection (buffers flushes)
export function makeConnection() {
  const dirty = new Set();
  return {
    async beginTransaction() { await loadAll(); },
    async query(sql, params) {
      const r = await execute(sql, params); // operates on the live cache
      if (r.dirty) dirty.add(r.dirty);
      return [r.result ? r.result : r.rows, undefined];
    },
    async commit() { for (const t of dirty) await flushTable(t); dirty.clear(); },
    async rollback() { dirty.clear(); invalidateCache(); await loadAll(true); },
    release() {},
  };
}

