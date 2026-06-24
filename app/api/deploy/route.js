import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const DEPLOY_SECRET = process.env.DEPLOY_SECRET || 'celestile-deploy-2026';

function restartServer() {
  setTimeout(() => {
    try { execSync('pm2 restart all', { timeout: 5000 }); } catch {
      process.exit(0); // PM2 auto-restarts on exit
    }
  }, 800);
}

export async function POST(req) {
  try {
    // GitHub sends X-GitHub-Event: push — no body secret needed
    const isGitHub = req.headers.get('x-github-event') === 'push';

    if (!isGitHub) {
      const body = await req.json().catch(() => ({}));
      if (body.secret !== DEPLOY_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // git pull (best-effort — Hostinger may have already pulled)
    let pullOut = '';
    try {
      pullOut = execSync('git pull origin main', {
        cwd: process.cwd(),
        timeout: 30000,
        encoding: 'utf8',
      }).trim();
    } catch (e) {
      pullOut = e.message;
    }

    restartServer();

    return NextResponse.json({ success: true, output: pullOut, restarting: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET: status check
export async function GET() {
  try {
    const commit = execSync('git log --oneline -1', { cwd: process.cwd(), encoding: 'utf8' }).trim();
    return NextResponse.json({ status: 'ok', latestCommit: commit });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}
