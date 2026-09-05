import fs from 'fs';
import { google } from 'googleapis';
import path from 'path';
import { createPrivateKey } from 'crypto';

/**
 * One place that answers "which Google service account are we?".
 *
 * The credentials can arrive three ways, tried in this order:
 *   1. GOOGLE_CREDENTIALS_JSON  — the whole JSON key file, raw or base64
 *   2. GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
 *   3. credentials.json in the app folder (gitignored; also honours
 *      GOOGLE_CREDENTIALS_FILE)
 *
 * (2) is the fragile one: hosting control panels reformat multi-line secrets,
 * and every variant surfaces as the same opaque OpenSSL error
 * ("DECODER routines::unsupported") only once an API call actually signs a JWT.
 * So we repair what can be repaired below, verify the key really parses, and
 * fall through to the next source if it doesn't — a working credentials.json
 * beats a mangled env var.
 */

const CREDENTIALS_FILE = process.env.GOOGLE_CREDENTIALS_FILE || path.join(process.cwd(), 'credentials.json');

// Accepts the JSON key file as text or base64-of-text. Returns null for
// anything that isn't a service-account JSON.
function parseKeyFile(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (!t.startsWith('{')) {
    try {
      const decoded = Buffer.from(t, 'base64').toString('utf8');
      return decoded.trim().startsWith('{') ? parseKeyFile(decoded) : null;
    } catch { return null; }
  }
  try {
    const j = JSON.parse(t);
    return j.private_key ? j : null;
  } catch { return null; }
}

// Normalises whatever ended up in the env var into a PEM OpenSSL will accept.
function normalizePrivateKey(raw) {
  if (!raw) return '';
  let key = String(raw).trim();

  // Pasted straight out of the JSON key file, quotes and all.
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  // The whole key file pasted into the private-key var (raw or base64).
  const asFile = parseKeyFile(key);
  if (asFile) key = asFile.private_key;

  // In the JSON file the newlines are \n escapes, not real line breaks.
  key = key.replace(/\\r\\n|\\r|\\n/g, '\n').replace(/\r/g, '');

  // Escape hatch for panels that refuse to store multi-line values at all:
  // the whole PEM can be supplied base64-encoded instead.
  if (!key.includes('BEGIN')) {
    try {
      const decoded = Buffer.from(key, 'base64').toString('utf8');
      if (decoded.includes('BEGIN')) key = decoded.replace(/\r/g, '').trim();
    } catch { /* not base64 — fall through and let the caller fail loudly */ }
  }

  // Rebuild the canonical PEM unconditionally: strip whatever whitespace the
  // panel left in (or took out of) the body, undo URL-safe base64, and re-wrap
  // at 64 chars. This covers the one-long-line case as well as bodies joined
  // with spaces or wrapped at the wrong width.
  const m = /-----BEGIN ([A-Z0-9 ]+?)-----([\s\S]+?)-----END \1-----/.exec(key);
  if (m) {
    key = pem(m[1], m[2]);
  } else if (!key.includes('BEGIN') && /^[A-Za-z0-9+/=_\-\s]+$/.test(key) && key.replace(/\s+/g, '').length > 500) {
    // Header and footer stripped entirely — only the base64 body survived.
    key = pem('PRIVATE KEY', key);
  }

  return key;
}

function pem(label, body) {
  const b64 = body.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const lines = b64.match(/.{1,64}/g)?.join('\n') || '';
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}

function privateKeyIsUsable(key) {
  if (!key) return false;
  try { createPrivateKey(key); return true; } catch { return false; }
}

function fromJsonEnv() {
  const j = parseKeyFile(process.env.GOOGLE_CREDENTIALS_JSON);
  if (!j?.client_email) return null;
  return { client_email: j.client_email, private_key: normalizePrivateKey(j.private_key), source: 'GOOGLE_CREDENTIALS_JSON' };
}

function fromEnvPair() {
  const raw = process.env.GOOGLE_PRIVATE_KEY;
  if (!raw) return null;
  // The var may hold the whole key file, in which case it carries the email too.
  const asFile = parseKeyFile(String(raw).trim().replace(/^["']|["']$/g, ''));
  const client_email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || asFile?.client_email || '').trim();
  if (!client_email) return null;
  return { client_email, private_key: normalizePrivateKey(raw), source: 'GOOGLE_PRIVATE_KEY' };
}

function fromFile() {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return null;
    const j = parseKeyFile(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
    if (!j?.client_email) return null;
    return { client_email: j.client_email, private_key: normalizePrivateKey(j.private_key), source: path.basename(CREDENTIALS_FILE) };
  } catch { return null; }
}

let _cached = null;

export function getGoogleCredentials() {
  if (_cached) return _cached;

  let broken = null;
  for (const load of [fromJsonEnv, fromEnvPair, fromFile]) {
    const c = load();
    if (!c?.client_email || !c?.private_key) continue;
    if (privateKeyIsUsable(c.private_key)) {
      _cached = { ...c, usable: true };
      return _cached;
    }
    broken = broken || { ...c, usable: false }; // keep the first, for the error message
  }
  // Nothing cached on failure: uploading credentials.json then fixes it on the
  // next request instead of needing a restart.
  return broken || { client_email: '', private_key: '', source: null, usable: false };
}

// Use this wherever an API client is built — it turns the OpenSSL noise into
// something an admin can act on, and does it before the first API call rather
// than deep inside googleapis' JWT signing.
export function requireGoogleCredentials() {
  const creds = getGoogleCredentials();
  if (!creds.client_email || !creds.private_key) {
    throw new Error('Google account not configured — set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY, or upload the service-account JSON key file as credentials.json in the app folder.');
  }
  if (!creds.usable) {
    throw new Error(`Google private key could not be read — the value in ${creds.source} is not a valid PEM (the hosting panel has reformatted it). Fix: upload the service-account JSON key file as credentials.json in the app folder, or set GOOGLE_CREDENTIALS_JSON to that file base64-encoded. Open /api/drive-check for a full diagnosis.`);
  }
  return creds;
}

/* ── Shared Google API clients ─────────────────────────────────────────
   One memoized Sheets client for the whole app. Five modules used to build
   their own copy of exactly this (and one of them forgot to memoize, paying
   a fresh JWT exchange on every call). The Drive client stays in
   lib/googleDrive.js — different scope, single owner. */
let _sheetsClient = null;
export function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;
  const { client_email, private_key } = requireGoogleCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheetsClient = google.sheets({ version: 'v4', auth });
  return _sheetsClient;
}
