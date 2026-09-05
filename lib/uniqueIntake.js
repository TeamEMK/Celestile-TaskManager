/**
 * "This value has already been entered" — the rule, in one place.
 *
 * An intake field can be marked Unique (fms_intake_fields.unique_value), which
 * is what stops the same enquiry being captured twice: the enquiry form asks
 * for a mobile number, and the same number ringing in again is the same
 * enquiry, not a new one.
 *
 * Pure and client-safe on purpose — the form checks as you type and the server
 * checks again before it writes, and the two must agree on what "the same
 * number" means, or the form clears a value the server then rejects.
 */

const DIGITS = /\d/g;

export function digitsOf(value) {
  return (String(value ?? '').match(DIGITS) || []).join('');
}

/**
 * Is this a phone number rather than a name or a note?
 *
 * Digits, and the punctuation people put between them — "+91 98765-43210",
 * "(080) 4123 4567". A letter anywhere means it isn't one: "H1774" is an order
 * number and "Plot 42" is an address, and neither should be compared the way a
 * phone number is. Seven digits is the shortest real Indian landline.
 */
export function looksLikePhone(value) {
  const s = String(value ?? '').trim();
  if (!s || /[a-z]/i.test(s)) return false;
  return digitsOf(s).length >= 7;
}

/**
 * What two values are compared by.
 *
 * For a phone number that is its last 10 digits, so every way the same mobile
 * gets typed — "+919876543210", "0 9876543210", "98765 43210" — collapses to
 * one key. The country code and the trunk 0 are exactly the noise that let the
 * same number in twice. Ten because that is an Indian mobile; a shorter
 * landline is compared whole.
 *
 * Anything else is compared as text: case-folded, with runs of whitespace
 * squeezed, so "ravi kumar" and "Ravi  Kumar" are one value.
 */
export function compareKey(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (looksLikePhone(s)) {
    const d = digitsOf(s);
    return d.length > 10 ? d.slice(-10) : d;
  }
  return s.toLowerCase().replace(/\s+/g, ' ');
}

// True when this configured field is one that may not repeat.
export function isUniqueField(field) {
  const v = field?.unique_value ?? field?.uniqueValue;
  return v === 1 || v === true || v === '1';
}
