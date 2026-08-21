'use client';
/**
 * A date box that reads DD-MM-YYYY.
 *
 * `<input type="date">` renders in the browser's locale, which on these
 * machines means mm/dd/yyyy — the wrong way round for everyone who uses this
 * app, and the kind of thing that gets a date typed in wrong rather than
 * merely read wrong. This keeps the browser's own calendar (tucked behind the
 * button, so the OS picker is still one tap away on a tablet) but shows and
 * accepts the date the way the office writes it.
 *
 * Drop-in for the native input: `value` is still an ISO yyyy-mm-dd string and
 * `onChange` still receives `{ target: { value } }`, so call sites keep their
 * `onChange={(e) => setDate(e.target.value)}` exactly as they were.
 */
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

export const isoToDisplay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

// Accepts 21-08-2026, 21/08/2026, 21.8.2026 — whatever separator the typist
// reaches for. Rejects a date that doesn't exist (31-02-2026 parses as 3 March
// through the Date constructor, which is exactly the silent wrong answer this
// check is here to stop).
export const displayToIso = (text) => {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime()) || dt.getDate() !== Number(d) || dt.getMonth() + 1 !== Number(mo)) return null;
  return iso;
};

// Types as digits, reads as a date: 21082026 becomes 21-08-2026 while typing,
// and backspacing eats the separators without a fight.
const mask = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('-');
};

export default function DateField({
  value = '',
  onChange,
  className = 'input',
  disabled = false,
  min,
  max,
  required,
  placeholder = 'DD-MM-YYYY',
  title,
  id,
  name,
  autoFocus,
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const nativeRef = useRef(null);
  const typing = useRef(false);

  // Follow the parent when it sets the date itself (a "Today" button, a form
  // reset) — but never while someone is mid-keystroke in the box.
  useEffect(() => { if (!typing.current) setText(isoToDisplay(value)); }, [value]);

  const emit = (iso) => onChange?.({ target: { value: iso, name } });

  const outOfRange = (iso) => (min && iso < min) || (max && iso > max);

  function onText(raw) {
    typing.current = true;
    const masked = mask(raw);
    setText(masked);
    if (!masked) { emit(''); return; }
    const iso = displayToIso(masked);
    if (iso && !outOfRange(iso)) emit(iso);
  }

  function onBlur() {
    typing.current = false;
    if (!text) { emit(''); return; }
    const iso = displayToIso(text);
    // Anything half-typed, impossible, or outside the allowed range hands the
    // box back the last good date rather than quietly keeping a value the
    // parent never received.
    if (iso && !outOfRange(iso)) { setText(isoToDisplay(iso)); emit(iso); }
    else setText(isoToDisplay(value));
  }

  // showPicker() throws on an element that isn't rendered, so the native input
  // stays in the layout at 1px and fully transparent rather than hidden.
  function openPicker() {
    const el = nativeRef.current;
    if (!el || disabled) return;
    try { el.showPicker(); }
    catch { el.focus(); el.click(); }
  }

  // Full-width by default (`.input` is w-full); a caller that has set its own
  // width — `!w-auto`, `!w-44`, `date-ctl` — gets a box that hugs the field.
  const sized = /(^|\s|!)w-(auto|full|\d|\[)/.test(className) || !/\binput\b/.test(className);
  const wrapCls = sized ? 'relative inline-block' : 'relative block w-full';

  return (
    <span className={wrapCls}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        name={name}
        title={title}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        size={10}
        className={`${className} !pr-8`}
        placeholder={placeholder}
        value={text}
        onChange={(e) => onText(e.target.value)}
        onFocus={() => { typing.current = true; }}
        onBlur={onBlur}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openPicker}
        title="Open calendar"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center w-6 h-6 rounded text-slate-400 hover:text-primary-600 hover:bg-slate-100 disabled:opacity-40"
      >
        <Icon name="calendar" className="w-3.5 h-3.5" />
      </button>
      {/* The browser's own picker, kept for the calendar button and for tablets */}
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        min={min}
        max={max}
        value={value || ''}
        onChange={(e) => { typing.current = false; setText(isoToDisplay(e.target.value)); emit(e.target.value); }}
        className="absolute right-2 bottom-0 w-px h-px opacity-0 pointer-events-none"
      />
    </span>
  );
}
