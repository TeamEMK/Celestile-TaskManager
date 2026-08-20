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
 * and anything unresolvable — controlling column not on this form, a
 * dependency cycle — fails OPEN, so a bad config can never make a required
 * field impossible to fill in.
 */
export function fieldVisibility(fields, valueOf) {
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
    const vis = (parentIdx === undefined || parentIdx === i)
      ? true
      : visit(parentIdx) && matchesCondition(valueOf(list[parentIdx], parentIdx), f.depends_value ?? f.dependsValue);
    visiting.delete(i);
    memo[i] = vis;
    return vis;
  };
  return list.map((_, i) => visit(i));
}

// Convenience wrapper — just the fields that should be shown/written.
export function filterVisible(fields, valueOf) {
  const vis = fieldVisibility(fields, valueOf);
  return (fields || []).filter((_, i) => vis[i]);
}
