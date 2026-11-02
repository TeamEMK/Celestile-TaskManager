// Mobile numbers are typed every which way ("+91 98765-43210", "098765 43210").
// Users created with a mobile number (no email) sign in with it, so login and
// the duplicate check both compare on this key: digits only, last 10 digits
// (drops the +91 / leading 0 prefix).
export function phoneKey(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function isValidMobile(raw) {
  return phoneKey(raw).length === 10;
}
