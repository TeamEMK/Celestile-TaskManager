'use client';

const PALETTE = ['#EEBC2E', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#0d9488', '#9333ea', '#db2777'];

// Gradient definitions for bar charts
const GRADIENT_PAIRS = [
  ['#EEBC2E', '#F7DA85'],
  ['#7c3aed', '#a78bfa'],
  ['#0891b2', '#22d3ee'],
  ['#059669', '#34d399'],
  ['#d97706', '#fbbf24'],
  ['#dc2626', '#f87171'],
  ['#0d9488', '#2dd4bf'],
  ['#9333ea', '#c084fc'],
  ['#db2777', '#f472b6'],
];

// Animated SVG ring/donut chart for showing a percentage
export function DonutChart({ value = 0, total = 0, size = 130, strokeColor = '#EEBC2E', label = 'Complete', thickness = 12 }) {
  const pct   = total > 0 ? Math.min(value / total, 1) : 0;
  const r     = (size / 2) - thickness - 4;
  const circ  = 2 * Math.PI * r;
  const dash  = pct * circ;
  const cx = size / 2;
  const cy = size / 2;
  const glowR = r + thickness / 2 + 3;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id={`glow-${strokeColor.replace('#','')}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Outer glow ring */}
      <circle
        cx={cx} cy={cy} r={glowR}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        opacity={0.18}
      />
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0E9DC" strokeWidth={thickness} />
      {/* Progress arc */}
      {dash > 0 && (
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={strokeColor} strokeWidth={thickness}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            transition: 'stroke-dasharray .6s cubic-bezier(.16,1,.3,1)',
            filter: `drop-shadow(0 0 4px ${strokeColor}55)`,
          }}
        />
      )}
      {/* Center: big % */}
      <text
        x={cx} y={cy - size * 0.08}
        textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: size * 0.22, fontWeight: 900, fill: '#09090B', fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {Math.round(pct * 100)}%
      </text>
      {/* Center: value/total */}
      <text
        x={cx} y={cy + size * 0.11}
        textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: size * 0.10, fontWeight: 600, fill: strokeColor, fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {value}/{total}
      </text>
      {/* Center: label */}
      <text
        x={cx} y={cy + size * 0.22}
        textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: size * 0.085, fontWeight: 500, fill: '#9CA3AF', fontFamily: 'Inter, system-ui, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        {label}
      </text>
    </svg>
  );
}

// A single horizontal bar row with gradient fill and rank circle
function HorizBar({ name, value, max, color, gradEnd, unit = '', rank }) {
  const num = Number(value) || 0;
  const pct = max > 0 ? Math.min((num / max) * 100, 100) : 0;
  const gradId = `bar-grad-${rank}-${color.replace('#','')}`;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {/* leading-none matters: the global 26.4px line-height gives bare text a
            line box far taller than the badge, which pushes the digit out of it */}
        <span
          className="shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] leading-none font-bold text-white tabular-nums"
          style={{ background: color }}
        >
          {rank}
        </span>
        <div className="flex items-baseline justify-between flex-1 min-w-0 gap-1">
          <span className="text-[11px] font-semibold text-slate-700 truncate" title={name}>{name}</span>
          <span className="text-[11px] font-bold shrink-0 tabular-nums" style={{ color }}>{value}{unit}</span>
        </div>
      </div>
      <div className="h-[6px] bg-slate-100 rounded-full overflow-hidden ml-6">
        <svg width="100%" height="6" style={{ display: 'block' }}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={color} />
              <stop offset="100%" stopColor={gradEnd || color} />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={`${pct}%`} height={6} rx={3}
            fill={`url(#${gradId})`}
            style={{ transition: 'width .5s cubic-bezier(.16,1,.3,1)' }}
          />
        </svg>
      </div>
    </div>
  );
}

// Horizontal bar chart card with title, icon, and list of bars
export function HorizBarChart({ title, items = [], valueKey = 'value', color, icon, subtitle, unit = '' }) {
  const vals = items.map(i => Number(i[valueKey]) || 0);
  const max  = Math.max(...vals, 1);
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
        {icon && (
          <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[14px] leading-none shrink-0"
            style={{ background: `${color || PALETTE[0]}15` }}>
            {icon}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-bold text-slate-900">{title}</div>
          {subtitle && <div className="text-[10px] text-slate-400 mt-0.5">{subtitle}</div>}
        </div>
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] leading-none font-bold tabular-nums shrink-0"
          style={{ background: `${color || PALETTE[0]}15`, color: color || PALETTE[0] }}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-slate-300 text-center py-4">No data in range</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item, i) => {
            const barColor = color || PALETTE[i % PALETTE.length];
            const [gradStart, gradEnd] = GRADIENT_PAIRS[i % GRADIENT_PAIRS.length];
            const finalColor = color ? barColor : gradStart;
            const finalEnd   = color ? barColor : gradEnd;
            return (
              <HorizBar
                key={item.name}
                name={item.name}
                value={item[valueKey]}
                max={max}
                color={finalColor}
                gradEnd={finalEnd}
                unit={unit}
                rank={i + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Mini inline spark bar (e.g., inside a table cell)
export function SparkBar({ value = 0, max = 100, color = '#EEBC2E' }) {
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
export function StatPill({ label, value, color = '#EEBC2E' }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: `${color}0f`, border: `1px solid ${color}22` }}>
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      <span className="text-[13px] font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

// Mini donut for table cells (40px)
export function MiniDonut({ value = 0, total = 0, color = '#EEBC2E' }) {
  const size = 40;
  const thickness = 5;
  const pct  = total > 0 ? Math.min(value / total, 1) : 0;
  const r    = (size / 2) - thickness - 1;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0E9DC" strokeWidth={thickness} />
      {dash > 0 && (
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={thickness}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 9, fontWeight: 700, fill: '#09090B', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}
