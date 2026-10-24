/**
 * Which configured fields are stone-master fields.
 *
 * FMS forms carry a type an admin picks ('thickness'), but a form that was set
 * up before that type existed just says "THICKNESS" in the label — those start
 * offering the IMS list without anyone going back to reconfigure them, the
 * same way order-number fields do (lib/orderNumber.js).
 *
 * Material is only ever detected, never a type of its own: it's here so a
 * thickness dropdown can narrow to the sizes that stone is sold in when the
 * form happens to carry one.
 */

const labelOf = (field) => String(
  field?.field_label || field?.label || field?.row_label || '',
).trim();

// "Thickness per Piece" — one measured thickness per piece. A field set up as
// plain text/number but labelled for pieces ("All pieces thickness before
// production") is meant the same way: Vivek sir asked (23-10-2026 review) for
// a piece count that opens one box per piece, not a single number.
export function isPiecesField(field) {
  const type = String(field?.field_type || field?.type || 'text');
  if (type === 'pieces') return true;
  // A dropdown with no options renders as a text box, so it counts as one.
  const emptyDropdown = type === 'dropdown' && !String(field?.dropdown_options || '').trim();
  if (type !== 'text' && type !== 'number' && !emptyDropdown) return false;
  const label = labelOf(field);
  return /\bthick/i.test(label) && /\b(pieces?|pcs)\b/i.test(label);
}

export function isThicknessField(field) {
  const type = String(field?.field_type || field?.type || 'text');
  if (type === 'thickness') return true;
  if (isPiecesField(field)) return false;
  if (type !== 'text') return false;
  return /\bthick(ness)?\b/i.test(labelOf(field));
}

// "MATERIAL", "Stone Name", "Material / Stone" — the column a thickness
// belongs to. Deliberately loose: getting this wrong only costs the narrowing,
// never the list itself.
export function isMaterialField(field) {
  const type = String(field?.field_type || field?.type || 'text');
  if (type !== 'text' && type !== 'dropdown') return false;
  return /\b(material|stone)\b/i.test(labelOf(field));
}
