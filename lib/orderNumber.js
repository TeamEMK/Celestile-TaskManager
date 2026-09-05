/**
 * Order numbers — one shape, everywhere: H001, B514, H1774.
 *
 * A letter or two, then digits. Nothing else: no spaces, no dashes, no dots.
 * The reason is that an order number is a join key without a table behind it —
 * "H1774", "h 1774" and "H-1774" are the same order to a person and three
 * different orders to every report in this app, which is how one job's hours
 * end up split three ways in the worker and order summaries.
 *
 * Typed entry (FMS intake, Daily Task, Inventory) is normalised and refused
 * when it doesn't fit. The factory's Excel import is NOT: its order column
 * legitimately carries "MOP SHEET", "VINAY SIR" and "HYD DISPLAY" for work
 * that has no order behind it, so there the mismatch is surfaced as a warning
 * on the preview and the rows import as they are.
 */

const ORDER_PATTERN = /^[A-Z]{1,3}\d{1,6}$/;

export const ORDER_HINT = 'Use a letter then digits, like H001 or B514 — no spaces or dashes.';

// "h 1774" / "H-1774" / "h1774." all mean the same order.
export function normalizeOrderNumber(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidOrderNumber(value) {
  return ORDER_PATTERN.test(normalizeOrderNumber(value));
}

// One cell often names several orders — "H1774 , H1781" on a machine that ran
// both. Split before judging any of them.
function splitOrderNumbers(value) {
  return String(value ?? '')
    .split(/[,;/&\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Normalised, comma-separated, order preserved. Empty in, empty out.

// The parts that don't fit the shape — the input's own words, so a message
// can quote back what the person actually typed.

/**
 * The parts that were clearly MEANT to be an order number and missed.
 *
 * For the factory's own sheets, "not a valid order number" is far too broad a
 * net: their order column carries "MOP SHEET", "VINAY SIR" and "BALAJI" for
 * work booked against no order at all, and flagging those buries the one entry
 * that matters. Anything carrying a digit was someone reaching for an order
 * number — "H 1774", "1774", "h1774-b" — and that is worth pointing at.
 *
 * Tested against the raw text, NOT the normalised form: "H 1774" would clean
 * up to a perfectly good H1774, but nothing cleans the imported sheets, so in
 * them it stays a second, separate order. Case is left alone — the reports
 * already group orders case-insensitively, so "h1774" forks nothing.
 */
export function suspectOrderNumbers(value) {
  return splitOrderNumbers(value)
    .filter((part) => /\d/.test(part) && !ORDER_PATTERN.test(part.trim().toUpperCase()));
}

/**
 * Is this configured field an order number?
 *
 * FMS fields carry a type an admin picks ('order'), but the forms that were
 * set up before that type existed just say "ORDER NO" in the label — those
 * keep working without anyone having to go back and reconfigure them. Only
 * text fields qualify: "Order Received Date" is a date, not an order.
 */
export function isOrderField(field) {
  const type = String(field?.field_type || field?.type || 'text');
  if (type === 'order') return true;
  if (type !== 'text') return false;
  const label = String(field?.field_label || field?.label || field?.row_label || '').trim();
  return /\border\s*(no|nos|num|number)?\.?$/i.test(label);
}
