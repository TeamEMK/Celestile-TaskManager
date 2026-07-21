// Normalises the service-account private key coming out of an environment
// variable. Hosting control panels mangle multi-line secrets in a few
// predictable ways, and every one of them surfaces as the same opaque OpenSSL
// error ("DECODER routines::unsupported"), so handle them up front.
export function normalizePrivateKey(raw) {
  if (!raw) return '';
  let key = String(raw).trim();

  // Pasted straight out of the JSON key file, quotes and all.
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  // In the JSON file the newlines are \n escapes, not real line breaks.
  key = key.replace(/\\n/g, '\n');

  // Escape hatch for panels that refuse to store multi-line values at all:
  // the whole PEM can be supplied base64-encoded instead.
  if (!key.includes('BEGIN')) {
    try {
      const decoded = Buffer.from(key, 'base64').toString('utf8');
      if (decoded.includes('BEGIN')) key = decoded.trim();
    } catch { /* not base64 — fall through and let the caller fail loudly */ }
  }

  // Some panels strip the line breaks but keep the header/footer, leaving one
  // long line that OpenSSL rejects. Rebuild the canonical 64-char PEM body.
  const m = /-----BEGIN ([A-Z ]+)-----([\s\S]+?)-----END \1-----/.exec(key);
  if (m && !m[2].includes('\n')) {
    const body = m[2].replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || '';
    key = `-----BEGIN ${m[1]}-----\n${body}\n-----END ${m[1]}-----\n`;
  }

  return key;
}

export function getGoogleCredentials() {
  const client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const private_key  = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  return { client_email, private_key };
}
