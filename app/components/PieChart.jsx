'use client';
import { useState } from 'react';

export default function PieChart({ completed = 0, pending = 0, revised = 0, size = 220 }) {
  const total = completed + pending + revised;
  const slices = [
    { key: 'completed', value: completed, color: '#10b981', label: 'Completed' },
    { key: 'pending',   value: pending,   color: '#ef4444', label: 'Pending' },
    { key: 'revised',   value: revised,   color: '#f59e0b', label: 'Revised' },
  ].filter((s) => s.value > 0);

  const [hover, setHover] = useState(null);  // { slice, x, y } | null

  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2 - 6;

  const arcs = [];
  if (total === 0) {
    arcs.push(
      <circle key="empty" cx={cx} cy={cy} r={r} fill="#e2e8f0" />
    );
  } else if (slices.length === 1) {
    const s = slices[0];
    arcs.push(
      <circle key="full" cx={cx} cy={cy} r={r} fill={s.color}
        stroke="#fff" strokeWidth={2}
        onMouseMove={(e) => setHover({ slice: s, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: 'pointer' }} />
    );
  } else {
    let angle = -Math.PI / 2;
    slices.forEach((s) => {
      const slice = (s.value / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += slice;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const largeArc = slice > Math.PI ? 1 : 0;
      // Full-pie wedge (no inner hole): center → arc → back to center
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      arcs.push(
        <path key={s.key} d={d} fill={s.color}
          stroke="#fff" strokeWidth={2} strokeLinejoin="round"
          onMouseMove={(e) => setHover({ slice: s, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setHover(null)}
          style={{ cursor: 'pointer', transition: 'opacity .15s' }}
          opacity={hover && hover.slice.key !== s.key ? 0.55 : 1} />
      );
    });
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size}>{arcs}</svg>

        {/* tooltip */}
        {hover && (
          <div
            className="fixed pointer-events-none z-50 bg-slate-900 text-white text-[12px] rounded-md shadow-lg px-2.5 py-1.5"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            <div className="font-semibold">{hover.slice.label}</div>
            <div className="flex items-center gap-1.5 mt-0.5 text-slate-200">
              <span className="w-2.5 h-2.5 rounded-sm border border-white/40" style={{ background: hover.slice.color }} />
              {hover.slice.label}: {hover.slice.value}
            </div>
          </div>
        )}
      </div>

      {/* bottom legend */}
      <div className="flex items-center justify-center gap-5 mt-4">
        {[
          { value: completed, color: '#10b981', label: 'Completed' },
          { value: pending,   color: '#ef4444', label: 'Pending' },
          { value: revised,   color: '#f59e0b', label: 'Revised' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[12px] text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}