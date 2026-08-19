'use client';

const TONES = {
  emerald: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  red:     { bar: 'bg-red-500',     dot: 'bg-red-500',     text: 'text-red-700' },
  blue:    { bar: 'bg-primary-500', dot: 'bg-primary-500', text: 'text-primary-700' },
  amber:   { bar: 'bg-amber-500',   dot: 'bg-amber-500',   text: 'text-amber-700' },
};

function initialsOf(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '·';
}

export default function BarList({ title, items, valueKey = 'completed', color = 'bg-emerald-500', icon, tone }) {
  // Backwards compat: derive tone from old `color` prop if not passed
  const resolvedTone = tone || (color.includes('emerald') ? 'emerald' : color.includes('red') ? 'red' : color.includes('blue') ? 'blue' : 'amber');
  const t = TONES[resolvedTone];
  const max = Math.max(...items.map((i) => i[valueKey]), 1);

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3.5">
        <div className="w-7 h-7 rounded-lg grid place-items-center bg-slate-100 text-slate-500 text-xs font-semibold">
          {icon}
        </div>
        <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400 py-6 text-center">No data in this range</div>
      ) : (
        <ul className="space-y-2">
          {items.map((i, idx) => (
            <li key={i.name} className="flex items-center gap-2.5 text-xs">
              <div className="w-5 h-5 rounded-md bg-slate-100 grid place-items-center text-[10px] font-semibold text-slate-500 shrink-0">
                {idx + 1}
              </div>
              <div className="w-20 truncate font-medium text-slate-700" title={i.name}>{i.name}</div>
              <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full ${t.bar} transition-all duration-500`}
                  style={{ width: `${(i[valueKey] / max) * 100}%` }}
                ></div>
              </div>
              <div className={`w-7 text-right font-semibold ${t.text} tabular-nums`}>{i[valueKey]}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
