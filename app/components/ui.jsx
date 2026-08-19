'use client';
/**
 * Shared page furniture.
 *
 * Every screen in the ERP needs the same four things — a header, a filter
 * strip, a table frame and something to show when there is nothing to show —
 * and before this each one built its own. That is why the same "page" looked
 * like a different product depending on which menu item you clicked: headers
 * ranged from 15px to 24px, empty states from a grey sentence to a full card,
 * and search boxes from a bare input to an emoji-prefixed one.
 *
 * These are deliberately thin. They set structure and spacing; the colours and
 * control chrome live in globals.css (.card, .ctl, .badge-*, .toolbar) so a
 * change there reaches every page without touching this file.
 */
import Icon from './Icon';

/* ── page header ──────────────────────────────────────────────────────
   Title block on the left, actions on the right. Actions collapse under the
   title on a narrow screen rather than squeezing it. */
export function PageHeader({ icon, title, subtitle, children }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-600 grid place-items-center shrink-0">
            <Icon name={icon} className="w-[18px] h-[18px]" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-[16px] font-semibold tracking-tight text-slate-900 truncate">{title}</h1>
          {subtitle && <div className="text-[11.5px] text-slate-500 flex items-center gap-1.5 flex-wrap">{subtitle}</div>}
        </div>
      </div>
      {children && <div className="flex items-center gap-1.5 sm:ml-auto flex-wrap">{children}</div>}
    </div>
  );
}

// A "·"-separated run of facts under a page title, skipping the empty ones so
// a missing value doesn't leave a stray dot behind.
export function MetaLine({ items = [] }) {
  const shown = items.filter(Boolean);
  return shown.map((item, i) => (
    <span key={i} className="flex items-center gap-1.5">
      {i > 0 && <span className="text-slate-300">·</span>}
      {item}
    </span>
  ));
}

// The green "this is live" dot, used wherever a screen polls for fresh data.
export function LiveDot({ label = 'live' }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      {label}
    </span>
  );
}

/* ── empty / error states ─────────────────────────────────────────── */

export function EmptyState({ icon = 'search', title, hint, action, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-400',
    gold:    'bg-primary-50 text-primary-500',
    danger:  'bg-red-50 text-red-500',
  };
  return (
    <div className="p-12 text-center">
      <div className={`w-11 h-11 rounded-xl grid place-items-center mx-auto mb-2.5 ${tones[tone] || tones.neutral}`}>
        <Icon name={icon} className="w-5 h-5" />
      </div>
      <div className="text-[13px] font-semibold text-slate-700">{title}</div>
      {hint && <div className="text-[11.5px] text-slate-500 mt-0.5 max-w-md mx-auto">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// Same shape, but for a failure — the hint is what to actually go and check.
export function ErrorState({ title, hint }) {
  return (
    <div className="p-10 text-center">
      <div className="w-11 h-11 rounded-xl bg-red-50 text-red-500 grid place-items-center mx-auto mb-2.5">
        <Icon name="alert" className="w-5 h-5" />
      </div>
      <div className="text-[13px] font-semibold text-red-600">{title}</div>
      {hint && <div className="text-[11.5px] text-slate-500 mt-1 max-w-md mx-auto">{hint}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="p-10 text-center text-slate-400 text-[12.5px] flex items-center justify-center gap-2">
      <Icon name="refresh" className="w-4 h-4 animate-spin" /> {label}
    </div>
  );
}

/* ── toolbar pieces ───────────────────────────────────────────────── */

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={`relative flex-1 min-w-[180px] max-w-sm ${className}`}>
      <Icon name="search" className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        className="input-ctl !pl-8 !pr-8"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} title="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100">
          <Icon name="x" className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function Chip({ children, onRemove }) {
  return (
    <button type="button" className="chip" onClick={onRemove} title="Remove this filter">
      {children}
      <Icon name="x" className="w-3 h-3 text-primary-400" />
    </button>
  );
}

// The "Active: …  Clear all" line under a filter strip. Renders nothing when
// nothing is applied, so the toolbar doesn't reserve dead space.
export function ActiveFilters({ chips = [], onClearAll }) {
  if (!chips.length) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap border-t border-slate-100 pt-2.5 w-full">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Active</span>
      {chips.map((c) => <Chip key={c.key} onRemove={c.onRemove}>{c.label}</Chip>)}
      {onClearAll && (
        <button type="button" onClick={onClearAll}
          className="text-[11.5px] text-slate-500 hover:text-red-600 font-medium ml-1">Clear all</button>
      )}
    </div>
  );
}

// "12 of 480 rows" — the number people look for right after changing a filter.
export function ResultCount({ shown, total, noun = 'row' }) {
  const narrowed = shown !== total;
  return (
    <div className="text-[11.5px] text-slate-500 tabular-nums whitespace-nowrap">
      {narrowed
        ? <><b className="text-slate-800">{shown.toLocaleString()}</b> of {total.toLocaleString()} {noun}s</>
        : <><b className="text-slate-800">{total.toLocaleString()}</b> {noun}{total === 1 ? '' : 's'}</>}
    </div>
  );
}

/* ── misc ─────────────────────────────────────────────────────────── */

export function Badge({ tone = 'neutral', icon, children }) {
  return (
    <span className={`badge-${tone}`}>
      {icon && <Icon name={icon} className="w-3 h-3" />}
      {children}
    </span>
  );
}

export function SectionTitle({ children, note, right }) {
  return (
    <div className="flex items-baseline justify-between gap-2 flex-wrap">
      <h2 className="text-[13px] font-semibold text-slate-900">
        {children}
        {note && <span className="ml-2 font-normal text-[11px] text-slate-500">{note}</span>}
      </h2>
      {right}
    </div>
  );
}

// A labelled divider between groups of cards in a stacked layout.
export function GroupRule({ label, right }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11.5px] font-semibold text-slate-700 uppercase tracking-wide">{label}</span>
      <span className="h-px flex-1 bg-slate-200" />
      {right && <span className="text-[11px] text-slate-400">{right}</span>}
    </div>
  );
}

/* ── stat cards ───────────────────────────────────────────────────────
   The one way this app states a number.

   These used to be saturated gradient slabs with a coloured glow — five of
   them across the top of a page turned the page into the number rather than
   the number into information. A stat is now a white card whose only colour
   is a 3px accent rail: enough to tell High from Regular at a glance, quiet
   enough that a screenful of them still reads as a report. */

// Each tone is a small flat palette rather than one hue: a soft surface, a
// matching border, a saturated ink for the number, and a stronger chip for the
// icon. Flat throughout — no gradient, no glow — but the card carries real
// colour, which a white box with a hairline rail did not.
export const STAT_TONES = {
  neutral: { bg: '#F8FAFC', border: '#E2E8F0', ink: '#334155', accent: '#64748B', chip: '#F1F5F9' },
  slate:   { bg: '#F8FAFC', border: '#E2E8F0', ink: '#334155', accent: '#64748B', chip: '#F1F5F9' },
  gold:    { bg: '#FEFAED', border: '#F2DFA8', ink: '#8F6B10', accent: '#B78A16', chip: '#FBF0CE' },
  red:     { bg: '#FEF2F2', border: '#FCC9C9', ink: '#B91C1C', accent: '#DC2626', chip: '#FEE2E2' },
  amber:   { bg: '#FFFBEB', border: '#FCE3A6', ink: '#B45309', accent: '#D97706', chip: '#FEF3C7' },
  emerald: { bg: '#ECFDF5', border: '#A7E8CD', ink: '#047857', accent: '#059669', chip: '#D1FAE5' },
  blue:    { bg: '#EFF6FF', border: '#B9D5FE', ink: '#1D4ED8', accent: '#2563EB', chip: '#DBEAFE' },
  violet:  { bg: '#F5F3FF', border: '#C9BDFB', ink: '#6D28D9', accent: '#7C3AED', chip: '#EDE9FE' },
  teal:    { bg: '#F0FDFA', border: '#9DE8DD', ink: '#0F766E', accent: '#0D9488', chip: '#CCFBF1' },
};

export function StatCard({
  label, value, sub, subTone = '', tone = 'neutral', icon,
  active = false, onClick, progress = null,
}) {
  const t = STAT_TONES[tone] || STAT_TONES.neutral;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl border text-left w-full px-4 py-3.5 transition
        ${onClick ? 'cursor-pointer hover:brightness-[0.985]' : 'cursor-default'}`}
      style={{
        background: t.bg,
        borderColor: active ? t.accent : t.border,
        boxShadow: active ? `0 0 0 2px ${t.chip}` : '0 1px 2px rgba(9,9,11,0.04)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider truncate" style={{ color: t.accent }}>
            {label}
          </div>
          <div className="text-[30px] leading-none font-bold tabular-nums mt-1.5" style={{ color: t.ink }}>
            {value}
          </div>
          {sub && (
            <div className="text-[11px] mt-1.5" style={{ color: t.ink, opacity: 0.7 }}>{sub}</div>
          )}
        </div>
        {icon && (
          <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center"
            style={{ background: t.chip, color: t.accent }}>
            <Icon name={icon} className="w-4 h-4" />
          </span>
        )}
      </div>
      {progress != null && (
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: t.chip }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%`, background: t.accent }} />
        </div>
      )}
    </Tag>
  );
}

// The row a set of StatCards sits in.
export function StatGrid({ children, cols = 5 }) {
  const at = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' }[cols] || 'lg:grid-cols-5';
  return <div className={`grid grid-cols-2 sm:grid-cols-3 ${at} gap-3`}>{children}</div>;
}

export { Icon };
