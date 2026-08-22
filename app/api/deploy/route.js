import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import { requireDeveloper, timingSafeEqual } from '@/lib/api';

/**
 * Pull + restart hook.
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
 */
function verifyGitHub(rawBody, header) {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret || !header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return timingSafeEqual(header, expected);
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

    // Graceful reload — new process starts before old one stops (zero downtime)
    // pm2 reload keeps at least 1 instance alive at all times
    setTimeout(() => {
      try {
        execFileSync('pm2', ['reload', 'all', '--update-env'], { timeout: 10000 });
      } catch {
        // reload failed — try graceful restart with small overlap window
        try { execFileSync('pm2', ['restart', 'all'], { timeout: 5000 }); } catch { /* ignore */ }
      }
    }, 500);

    return NextResponse.json({ success: true, output: pullOut, restarting: true });
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
