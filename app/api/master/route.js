import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';
import { timingSafeEqual } from '@/lib/api';
import { invalidateAccessCache } from '@/lib/access';

// No hardcoded fallback. The old default was a literal in this file, so
// anyone who read the source could disable the whole product for every user.
// An unset MASTER_KEY now disables the panel rather than opening it.
// NOTE: if the previous default was ever deployed, rotate MASTER_KEY — it is
// in this file's history and must be treated as public.
const MASTER_KEY = process.env.MASTER_KEY || '';

// Flip the app_active kill switch. Called from POST below (key travels in the
// request body, never the URL) so a proxy/CDN/hosting access log never
// captures MASTER_KEY the way a "?key=...&action=disable" GET would, and so
// every flip leaves a line in the server log — there was no audit trail at
// all before this, just a bare shared secret with no actor attribution.
async function setActive(active) {
  await ensureSchema();
  await pool.query(
    "INSERT INTO app_config (`key`, `value`) VALUES ('app_active', ?) ON DUPLICATE KEY UPDATE `value` = ?",
    [String(active), String(active)]
  );
  invalidateAccessCache();
  console.log(`[master panel] app_active set to ${active} at ${new Date().toISOString()}`);
}

export async function POST(req) {
  if (!MASTER_KEY) {
    return NextResponse.json({ error: 'Master panel is disabled (MASTER_KEY not set)' }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  if (!timingSafeEqual(String(body.key || ''), MASTER_KEY))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (body.action === 'disable') {
    await setActive(false);
    return NextResponse.json({ success: true, app_active: false, message: 'App DISABLED — client cannot login' });
  }
  if (body.action === 'enable') {
    await setActive(true);
    return NextResponse.json({ success: true, app_active: true, message: 'App ENABLED — client can login' });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(req) {
  if (!MASTER_KEY) {
    return NextResponse.json({ error: 'Master panel is disabled (MASTER_KEY not set)' }, { status: 503 });
  }
  const key = new URL(req.url).searchParams.get('key') || '';
  if (!timingSafeEqual(key, MASTER_KEY)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureSchema();

  // Get current status
  const [rows] = await pool.query("SELECT `value` FROM app_config WHERE `key` = 'app_active'");
  const isActive = rows.length === 0 ? true : rows[0].value === 'true';

  // Show control panel HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Master Control Panel</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: Inter, system-ui, sans-serif; }
    body { background: #0f172a; color: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 1rem; padding: 2rem; width: 100%; max-width: 420px; }
    h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem; }
    .sub { color: #94a3b8; font-size: 0.8rem; margin-bottom: 2rem; }
    .status { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; border-radius: 0.75rem; margin-bottom: 1.5rem; font-weight: 600; }
    .status.on  { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); color: #34d399; }
    .status.off { background: rgba(239,68,68,0.1);  border: 1px solid rgba(239,68,68,0.3);  color: #f87171; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot.on  { background: #34d399; box-shadow: 0 0 8px #34d399; }
    .dot.off { background: #f87171; box-shadow: 0 0 8px #f87171; }
    .btn { display: block; width: 100%; padding: 0.875rem; border: none; border-radius: 0.75rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; text-align: center; text-decoration: none; margin-bottom: 0.75rem; transition: opacity 0.15s; }
    .btn:hover { opacity: 0.85; }
    .btn-red   { background: linear-gradient(135deg, #dc2626, #991b1b); color: white; }
    .btn-green { background: linear-gradient(135deg, #059669, #065f46); color: white; }
    .btn-blue  { background: linear-gradient(135deg, #2563eb, #1e40af); color: white; }
    .divider { border-top: 1px solid #334155; margin: 1.25rem 0; }
    .note { font-size: 0.75rem; color: #64748b; text-align: center; margin-top: 1rem; }
  </style>
</head>
<body>
<div class="card">
  <h1>🎛️ Master Control Panel</h1>
  <p class="sub">Celestile-TaskManager — Developer Only</p>

  <div class="status ${isActive ? 'on' : 'off'}">
    <span class="dot ${isActive ? 'on' : 'off'}"></span>
    App is currently <strong style="margin-left:4px">${isActive ? 'ACTIVE' : 'DISABLED'}</strong>
  </div>

  ${isActive
    ? `<button class="btn btn-red" onclick="doAction('disable', 'Are you sure? Client will lose access immediately.')">
        🔴 Disable App (Block Client Access)
      </button>`
    : `<button class="btn btn-green" onclick="doAction('enable')">
        🟢 Enable App (Restore Client Access)
      </button>`
  }
  <script>
    // The key travels in a POST body, not the URL — a GET with
    // "?action=disable&key=..." would leave the secret in every proxy/CDN
    // access log for a destructive, whole-app action.
    function doAction(action, confirmMsg) {
      if (confirmMsg && !confirm(confirmMsg)) return;
      fetch(location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ${JSON.stringify(MASTER_KEY)}, action }),
      }).then((r) => r.json()).then((d) => {
        if (!d.success) { alert(d.error || 'Failed'); return; }
        location.reload();
      }).catch(() => alert('Request failed'));
    }
  </script>

  <div class="divider"></div>

  <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:0.75rem;">📦 Give database to client:</p>
  <ol style="font-size:0.78rem; color:#64748b; padding-left:1.2rem; line-height:1.8;">
    <li>Railway → MySQL service → <strong style="color:#94a3b8">Backups</strong> tab</li>
    <li><strong style="color:#94a3b8">Create backup</strong> → Download .sql file</li>
    <li>Share the .sql file with client ✅</li>
  </ol>

  <p class="note">🔒 Keep this URL secret — developer access only</p>
</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
