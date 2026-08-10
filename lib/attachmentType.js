// Pure helper (safe for client + server) — decides whether a stored
// attachment value should render as an image or a document/PDF link.
// Handles legacy inline base64 values as well as Drive-backed ones served
// through /api/drive/<id>?kind=image|pdf.
export function isImageAttachment(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith('data:image')) return true;
  if (value.startsWith('data:')) return false;
  if (value.includes('/api/drive/')) return value.includes('kind=image');
  if (value.includes('drive.google.com/thumbnail')) return true;
  return false;
}
