/**
 * Conditional fields — shared by every FMS form (intake "starting form" and
 * the per-step "Additional Fields" on Mark-as-Done), on both the client
 * (which field inputs to render) and the server (what actually gets written).
 *
 * A field can be configured to appear only when ANOTHER field on the same
 * form holds a particular value — e.g. "Program File Received Date" only
 * shows once "Program File Received" is set to Yes. The controlling field is
 * referenced by its sheet COLUMN LETTER (`depends_on`), not by row id: ids
 * are regenerated on every config save (saveIntakeFields / writeSteps delete
 * and recreate), so a column letter is the only stable handle.
 *
 * `depends_value` is a comma-separated list of values that reveal the field;
 * blank means "any non-empty value".
 *
 * On a step's Mark-as-Done form the controlling column may also be a column
 * of the sheet row itself rather than another field — "only for Stone" reads
 * the row's Material cell. Those values come in through `externalValue`.
 */

// Column letters are stored/typed inconsistently ("as", " AS ") — one form.
export function colKey(v) {
  return String(v ?? '').trim().toUpperCase();
}

// Case/whitespace-insensitive so "yes" typed into a text field still matches
// a "Yes" dropdown option.
export function matchesCondition(currentValue, expected) {
  const cur = String(currentValue ?? '').trim().toLowerCase();
  const wanted = String(expected ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!wanted.length) return !!cur;
  return wanted.includes(cur);
}

/**
 * Visibility flag per field, index-aligned with `fields`.
 *
 * `valueOf(field, index)` supplies the current value of a field. Chains are
 * resolved (a field whose controlling field is itself hidden is hidden too),
 * and anything unresolvable — controlling column neither on this form nor
 * supplied by `externalValue`, a dependency cycle — fails OPEN, so a bad
 * config can never make a required field impossible to fill in.
 *
 * `externalValue(colKey)` (optional) returns the sheet row's value for a
 * column that is not a field on the form, or undefined when it isn't known.
 */
export function fieldVisibility(fields, valueOf, externalValue) {
  const list = Array.isArray(fields) ? fields : [];
  const idxByCol = new Map();
  list.forEach((f, i) => {
    const c = colKey(f?.col_letter ?? f?.colLetter);
    if (c && !idxByCol.has(c)) idxByCol.set(c, i);
  });

  const memo = new Array(list.length).fill(undefined);
  const visiting = new Set();
  const visit = (i) => {
    if (memo[i] !== undefined) return memo[i];
    if (visiting.has(i)) return true; // cycle — fail open
    visiting.add(i);
    const f = list[i] || {};
    const dep = colKey(f.depends_on ?? f.dependsOn);
    const parentIdx = dep ? idxByCol.get(dep) : undefined;
    const ext = (dep && parentIdx === undefined && externalValue) ? externalValue(dep) : undefined;
    const vis = ext !== undefined
      ? matchesCondition(ext, f.depends_value ?? f.dependsValue)
      : (parentIdx === undefined || parentIdx === i)
        ? true
        : visit(parentIdx) && matchesCondition(valueOf(list[parentIdx], parentIdx), f.depends_value ?? f.dependsValue);
    visiting.delete(i);
    memo[i] = vis;
    return vis;
  };
  return list.map((_, i) => visit(i));
}

// Convenience wrapper — just the fields that should be shown/written.

// Whether a configured field must be filled. The Sheets DB hands `required`
// back as 0, "0", 1 or "1" depending on how the row was written, and a bare
// truthiness test reads "0" as required — optional intake fields (SFT, RFT,
// Number of pieces) were being demanded, and the FMS editor turned them
// required on its next save. Missing = required (the column's default).
export function isRequiredField(f) {
  const v = f?.required;
  return !(v === 0 || v === false || v === '0');
}

// The answer that holds a step for rework. An explicit "Alert when" wins;
// otherwise a plain Yes/No checklist question holds on "No" — "No pe wapas
// wahi step aana chahiye" (23-10-2026 review). Before this a "No" on a
// question with no alert configured just moved the order on, silently.
// With no group named the hold still happens and is logged to the rework
// record; only the WhatsApp send is skipped. Set "Alert when" to e.g.
// "never" for a Yes/No question where No is a normal answer.
//
// A question asking whether something is WRONG ("Any issues in Order?",
// "Finishing required?") holds on "Yes" instead — "Yes karein toh problem
// kya hai, No karein toh direct aage badhe" (26-10-2026 review).
const PROBLEM_QUESTION = /\b(issues?|problems?|damage[sd]?|defects?|cracks?|broken|required|rework|missing|mistakes?)\b/i;

export function alertWhen(r) {
  const explicit = String(r.alert_on || '').trim();
  if (explicit) return explicit;
  if (r.field_type !== 'dropdown') return '';
  const opts = String(r.dropdown_options || '').split(',').map((o) => o.trim().toLowerCase()).filter(Boolean);
  if (!(opts.length === 2 && opts.includes('yes') && opts.includes('no'))) return '';
  return PROBLEM_QUESTION.test(String(r.row_label || r.field_label || '')) ? 'Yes' : 'No';
}
