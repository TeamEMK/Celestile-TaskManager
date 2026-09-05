import { NextResponse } from 'next/server';
import { execFileSync, spawn } from 'child_process';
import { openSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { requireDeveloper, timingSafeEqual } from '@/lib/api';

/**
 * Pull + build + reload hook.
 *
 * The old version trusted the header `x-github-event: push` as proof the call
 * came from GitHub and skipped the secret check entirely when it was present —
 * a header anyone can set with one curl flag, which made `git pull` + `pm2
 * reload all` an unauthenticated action. The secret also fell back to a value
 * hardcoded in this file, so even the non-GitHub path was public knowledge.
 *
 * Now: a GitHub call must carry a valid `x-hub-signature-256` HMAC over the
 * exact request body (that is the only thing about a webhook that can't be
 * forged), and a manual call must carry DEPLOY_SECRET in the body. Neither
 * path has a fallback — an unset DEPLOY_SECRET refuses everything.
 *
 * It also used to skip `next build`. PM2 runs `next start`, which serves the
 * compiled .next folder, so a pull followed by a reload changed nothing on
 * the live site until somebody built by hand. The build now runs after the
 * pull — detached, logged to deploy.log in the app folder, followed by the
 * reload — and the response returns straight away so GitHub's 10 s webhook
 * timeout never marks the delivery failed.
 */
function verifyGitHub(rawBody, header) {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret || !header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return timingSafeEqual(header, expected);
}

const LOG_FILE = () => join(process.cwd(), 'deploy.log');

// Build, then reload — one detached child so it outlives this request. The
// command is a fixed string with nothing from the request in it. `npm run
// build` is `next build` (package.json); `pm2 reload` keeps one instance up
// while the other restarts, and --update-env picks up any changed env.
function buildAndReload() {
  const fd = openSync(LOG_FILE(), 'a');
  const isWin = process.platform === 'win32';
  const script = 'echo "=== deploy $(date) ===" && npm run build && pm2 reload all --update-env && echo "=== done ==="';
  const child = spawn(
    isWin ? 'cmd.exe' : 'sh',
    isWin ? ['/c', 'npm run build && pm2 reload all --update-env'] : ['-c', script],
    { cwd: process.cwd(), detached: true, stdio: ['ignore', fd, fd], env: process.env },
  );
  child.unref();
}

export async function POST(req) {
  try {
    const secret = process.env.DEPLOY_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'Deploy hook is disabled (DEPLOY_SECRET not set)' }, { status: 503 });
    }

    // Read the body ONCE, as text — the HMAC has to run over the exact bytes
    // GitHub signed, so it can't be re-serialised from a parsed object.
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    let authorized = verifyGitHub(rawBody, signature);
    if (!authorized) {
      let body = {};
      try { body = JSON.parse(rawBody || '{}'); } catch { /* not JSON */ }
      authorized = !!body.secret && timingSafeEqual(body.secret, secret);
    }
    if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let pullOut = '';
    try {
      // execFileSync with an argument array — never a shell string, so nothing
      // from the request can ever be spliced into a command line.
      pullOut = execFileSync('git', ['pull', 'origin', 'main'], {
        cwd: process.cwd(),
        timeout: 30000,
        encoding: 'utf8',
      }).trim();
    } catch (e) {
      pullOut = e.message;
    }

    // Build + reload in the background; the pull output goes back now.
    let building = true;
    try { buildAndReload(); } catch (e) { building = false; pullOut += `\nbuild not started: ${e.message}`; }

    return NextResponse.json({ success: true, output: pullOut, building, log: 'deploy.log' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Healthcheck. The deployed commit is only reported to a developer-authorised
// caller; everyone else gets liveness and nothing more.
export async function GET(req) {
  if (requireDeveloper(req)) return NextResponse.json({ status: 'ok' });
  try {
    const commit = execFileSync('git', ['log', '--oneline', '-1'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
    return NextResponse.json({ status: 'ok', latestCommit: commit });
  } catch {
    return NextResponse.json({ status: 'ok' });
  }
}
