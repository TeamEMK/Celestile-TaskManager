import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

const MASTER_KEY = process.env.MASTER_KEY || 'emarketing-master-2026';

export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (key !== MASTER_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureSchema();

  // Get current status
  const [rows] = await pool.query("SELECT `value` FROM app_config WHERE `key` = 'app_active'");
  const isActive = rows.length === 0 ? true : rows[0].value === 'true';

  const action = new URL(req.url).searchParams.get('action');

  if (action === 'disable') {
    await pool.query("INSERT INTO app_config (`key`, `value`) VALUES ('app_active', 'false') ON DUPLICATE KEY UPDATE `value` = 'false'");
    return NextResponse.json({ success: true, app_active: false, message: 'App DISABLED — client cannot login' });
  }

  if (action === 'enable') {
    await pool.query("INSERT INTO app_config (`key`, `value`) VALUES ('app_active', 'true') ON DUPLICATE KEY UPDATE `value` = 'true'");
    return NextResponse.json({ success: true, app_active: true, message: 'App ENABLED — client can login' });
  }

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
  <p class="sub">E-Marketing Task Manager — Developer Only</p>

  <div class="status ${isActive ? 'on' : 'off'}">
    <span class="dot ${isActive ? 'on' : 'off'}"></span>
    App is currently <strong style="margin-left:4px">${isActive ? 'ACTIVE' : 'DISABLED'}</strong>
  </div>

  ${isActive
    ? `<a href="?key=${MASTER_KEY}&action=disable" class="btn btn-red" onclick="return confirm('Are you sure? Client will lose access immediately.')">
        🔴 Disable App (Block Client Access)
      </a>`
    : `<a href="?key=${MASTER_KEY}&action=enable" class="btn btn-green">
        🟢 Enable App (Restore Client Access)
      </a>`
  }

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

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
