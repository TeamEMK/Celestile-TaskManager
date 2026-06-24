import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const DEPLOY_SECRET = process.env.DEPLOY_SECRET || 'celestile-deploy-2026';

export async function POST(req) {
  try {
    const isGitHub = req.headers.get('x-github-event') === 'push';

    if (!isGitHub) {
      const body = await req.json().catch(() => ({}));
      if (body.secret !== DEPLOY_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

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

    // Graceful reload — new process starts before old one stops (zero downtime)
    // pm2 reload keeps at least 1 instance alive at all times
    setTimeout(() => {
      try {
        execSync('pm2 reload all --update-env', { timeout: 10000 });
      } catch {
        // reload failed — try graceful restart with small overlap window
        try { execSync('pm2 restart all', { timeout: 5000 }); } catch { /* ignore */ }
      }
    }, 500);

    return NextResponse.json({ success: true, output: pullOut, restarting: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const commit = execSync('git log --oneline -1', { cwd: process.cwd(), encoding: 'utf8' }).trim();
    return NextResponse.json({ status: 'ok', latestCommit: commit });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}
