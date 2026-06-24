import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const DEPLOY_SECRET = process.env.DEPLOY_SECRET || 'celestile-deploy-2026';

export async function POST(req) {
  try {
    const { secret } = await req.json().catch(() => ({}));
    if (secret !== DEPLOY_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // git pull
    const pullOut = execSync('git pull origin main', {
      cwd: process.cwd(),
      timeout: 30000,
      encoding: 'utf8',
    });

    // Restart after 1s (gives time for response to send)
    setTimeout(() => {
      try { execSync('pm2 restart all', { timeout: 5000 }); } catch {
        process.exit(0); // fallback: exit and let PM2 auto-restart
      }
    }, 1000);

    return NextResponse.json({ success: true, output: pullOut.trim(), restarting: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET: status check — shows latest commit
export async function GET() {
  try {
    const commit = execSync('git log --oneline -1', { cwd: process.cwd(), encoding: 'utf8' }).trim();
    return NextResponse.json({ status: 'ok', latestCommit: commit });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}
