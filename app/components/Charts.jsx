'use client';

const PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#0d9488', '#9333ea', '#db2777'];

// Animated SVG ring/donut chart for showing a percentage
export function DonutChart({ value = 0, total = 0, size = 130, strokeColor = '#2563eb', label = 'Complete', thickness = 10 }) {
  const pct   = total > 0 ? Math.min(value / total, 1) : 0;
  const r     = (size / 2) - thickness - 2;
  const circ  = 2 * Math.PI * r;
  const dash  = pct * circ;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
      {dash > 0 && (
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={strokeColor} strokeWidth={thickness}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray .6s cubic-bezier(.16,1,.3,1)' }}
        />
      )}
      <text
        x={cx} y={cy - size * 0.06}
        textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: size * 0.19, fontWeight: 800, fill: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {Math.round(pct * 100)}%
      </text>
      <text
        x={cx} y={cy + size * 0.14}
        textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: size * 0.09, fontWeight: 500, fill: '#94a3b8', fontFamily: 'Inter, system-ui, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        {label}
      </text>
    </svg>
  );
}

// A single horizontal bar row
function HorizBar({ name, value, max, color, unit = '' }) {
  const num = Number(value) || 0;
  const pct = max > 0 ? Math.min((num / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-slate-700 truncate max-w-[72%]" title={name}>{name}</span>
        <span className="text-[12px] font-bold shrink-0 ml-2 tabular-nums" style={{ color }}>{value}{unit}</span>
      </div>
      <div className="h-[6px] bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, transition: 'width .5s cubic-bezier(.16,1,.3,1)' }}
        />
      </div>
    </div>
  );
}

// Horizontal bar chart card with title, icon, and list of bars
export function HorizBarChart({ title, items = [], valueKey = 'value', color, icon, subtitle, unit = '' }) {
  const vals = items.map(i => Number(i[valueKey]) || 0);
  const max  = Math.max(...vals, 1);
  return (
    <div className="card p-5 flex flex-col gap-3.5">
      <div className="flex items-start gap-2.5">
        {icon && <span className="text-[20px] mt-0.5 leading-none">{icon}</span>}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-slate-900">{title}</div>
          {subtitle && <div className="text-[11px] text-slate-400 mt-0.5">{subtitle}</div>}
        </div>
        <span className="text-[10.5px] text-slate-400 font-medium shrink-0">{items.length} items</span>
      </div>
      {items.length === 0 ? (
        <div className="text-[12px] text-slate-300 text-center py-5">No data in range</div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, i) => (
            <HorizBar
              key={item.name}
              name={item.name}
              value={item[valueKey]}
              max={max}
              color={color || PALETTE[i % PALETTE.length]}
              unit={unit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Mini inline spark bar (e.g., inside a table cell)
export function SparkBar({ value = 0, max = 100, color = '#2563eb' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[5px] bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums" style={{ color, minWidth: 28, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// Stat pill: label + value badge (for small inline stats)
export function StatPill({ label, value, color = '#2563eb' }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: `${color}0f`, border: `1px solid ${color}22` }}>
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      <span className="text-[13px] font-bold" style={{ color }}>{value}</span>
    </div>
  );
}
