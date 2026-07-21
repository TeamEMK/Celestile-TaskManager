// Pure helper (safe for client + server) — decides whether a stored
// attachment value should render as an image or a document/PDF link.
// Handles both legacy inline base64 values and the newer Drive URLs.
export function isImageAttachment(value) {
  if (!value) return false;
  if (value.startsWith('data:image')) return true;
  if (value.startsWith('data:')) return false;
  if (value.includes('drive.google.com/thumbnail')) return true;
  if (value.includes('drive.google.com/file/d/')) return false;
  return false;
}
