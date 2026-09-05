// One neutral initials chip. Six pages used to carry their own byte-identical
// copy of this (three of them with a leftover, unused colour-hash variable);
// only the size token ever differed. Initials in five rotating gradients made
// every table of names look like a chart legend — hence one neutral style.
const SIZES = {
  sm: 'w-6 h-6 text-[9px] font-semibold',   // table rows (dashboard, approvals, leave)
  md: 'w-7 h-7 text-[10px] font-bold',      // masters list
  lg: 'w-8 h-8 text-[11px] font-semibold',  // all-tasks group headers
};

export default function Avatar({ name = '', size = 'sm' }) {
  const ini = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || '·';
  return (
    <div className={`${SIZES[size] || SIZES.sm} rounded-full bg-slate-100 text-slate-600 border border-slate-200 grid place-items-center shrink-0`}>
      {ini}
    </div>
  );
}
