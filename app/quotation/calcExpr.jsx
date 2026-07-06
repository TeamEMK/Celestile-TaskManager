// Excel-style "type a formula into the cell" support for quotation number
// inputs, e.g. typing "2850*45" into Rate should resolve to 128250 on blur.
// Hand-rolled recursive-descent parser (no eval/Function) restricted to
// +, -, *, /, parentheses and decimal numbers.
export function evalMathExpr(input) {
  const s = String(input ?? '').trim().replace(/[×x]/gi, '*').replace(/÷/g, '/');
  if (!s || !/^[0-9+\-*/().\s]+$/.test(s)) return null;

  let i = 0;
  const skipWs = () => { while (s[i] === ' ') i++; };

  function parseExpr() {
    let v = parseTerm();
    skipWs();
    while (s[i] === '+' || s[i] === '-') {
      const op = s[i++]; const rhs = parseTerm();
      v = op === '+' ? v + rhs : v - rhs;
      skipWs();
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    skipWs();
    while (s[i] === '*' || s[i] === '/') {
      const op = s[i++]; const rhs = parseFactor();
      v = op === '*' ? v * rhs : v / rhs;
      skipWs();
    }
    return v;
  }
  function parseFactor() {
    skipWs();
    let sign = 1;
    while (s[i] === '+' || s[i] === '-') { if (s[i] === '-') sign *= -1; i++; skipWs(); }
    let v;
    if (s[i] === '(') {
      i++; v = parseExpr(); skipWs();
      if (s[i] !== ')') throw new Error('bad expr');
      i++;
    } else {
      const m = /^\d+(\.\d+)?/.exec(s.slice(i));
      if (!m) throw new Error('bad expr');
      v = parseFloat(m[0]); i += m[0].length;
    }
    return sign * v;
  }

  try {
    const result = parseExpr();
    skipWs();
    if (i !== s.length || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

// Reusable numeric cell: lets the user type a formula ("2850*45") which
// resolves to its computed value on blur, falling back to the typed text
// unchanged when it isn't a valid expression.
export function CalcInput({ value, onChange, className, ...rest }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const v = evalMathExpr(e.target.value);
        if (v !== null) onChange(String(v));
      }}
      {...rest}
    />
  );
}
