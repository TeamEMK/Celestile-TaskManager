'use client';
/**
 * The one box every order number is typed into.
 *
 * Anything that isn't a letter or a digit is dropped as it's typed and the
 * letters go up to caps, so "h 1774" can't be saved as something different
 * from "H1774" — see lib/orderNumber.js for why that matters. What the shape
 * still won't take (a bare number, a name) is called out under the field.
 *
 * Drop-in for a text input: `onChange` receives `{ target: { value } }`.
 */
import { useState } from 'react';
import { normalizeOrderNumber, isValidOrderNumber, ORDER_HINT } from '@/lib/orderNumber';

export default function OrderNumberInput({
  value = '',
  onChange,
  className = 'input',
  placeholder = 'e.g. H001',
  disabled = false,
  required,
  name,
  title,
}) {
  const [touched, setTouched] = useState(false);
  const text = String(value ?? '');
  // Only complain about a field someone has actually left — flagging an empty
  // box, or one still being typed into, is nagging rather than helping.
  const invalid = touched && text.trim() !== '' && !isValidOrderNumber(text);

  return (
    <>
      <input
        type="text"
        name={name}
        title={title}
        required={required}
        disabled={disabled}
        className={`${className}${invalid ? ' !border-red-300' : ''}`}
        placeholder={placeholder}
        value={text}
        autoComplete="off"
        onChange={(e) => onChange?.({ target: { value: normalizeOrderNumber(e.target.value), name } })}
        onBlur={() => setTouched(true)}
      />
      {invalid && <div className="text-[11px] text-red-500 mt-1">{ORDER_HINT}</div>}
    </>
  );
}
