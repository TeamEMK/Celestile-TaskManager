'use client';

export default function PieChart({ completed = 0, pending = 0, revised = 0, size = 200 }) {
  const total = completed + pending + revised;
  const slices = [
    { value: completed, color: '#10b981', label: 'Completed' },
    { value: pending,   color: '#ef4444', label: 'Pending' },
    { value: revised,   color: '#f59e0b', label: 'Revised' },
  ].filter((s) => s.value > 0);

  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2 - 10;
  const innerR = r * 0.62;

  const arcs = [];
  let angle = -Math.PI / 2;
  slices.forEach((s, i) => {
    const slice = (s.value / Math.max(total, 1)) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const ix1 = cx + innerR * Math.cos(angle);
    const iy1 = cy + innerR * Math.sin(angle);
    angle += slice;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const ix2 = cx + innerR * Math.cos(angle);
    const iy2 = cy + innerR * Math.sin(angle);
    const largeArc = slice > Math.PI ? 1 : 0;
    const d = `M ${x1} ${y1}
               A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}
               L ${ix2} ${iy2}
               A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
    arcs.push(<path key={i} d={d} fill={s.color} />);
  });

  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {total === 0 ? (
          <svg width={size} height={size}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={r - innerR} />
          </svg>
        ) : (
          <svg width={size} height={size}>{arcs}</svg>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-[28px] font-bold text-slate-900 leading-none">{completionPct}%</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-1 font-semibold">Completion</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 w-full">
        {[
          { value: completed, color: '#10b981', label: 'Done' },
          { value: pending,   color: '#ef4444', label: 'Pending' },
          { value: revised,   color: '#f59e0b', label: 'Revised' },
        ].map((s) => (
          <div key={s.label} className="flex flex-col items-center px-2 py-1.5 rounded-lg bg-slate-50/80">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }}></span>
              {s.label}
            </div>
            <div className="text-[15px] font-semibold text-slate-800 mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
