/**
 * The app's one icon set.
 *
 * Before this, buttons and headings across the ERP were labelled with emoji
 * (a clip, a magnifier, a bin, a tick). Emoji are the wrong tool for product
 * chrome: every OS draws them differently, they are full-colour in a
 * two-tone UI, they don't inherit
 * `currentColor` so they never match the text beside them, and they sit on a
 * different baseline in every font. That mismatch is most of what made the
 * screens read as improvised rather than as a product.
 *
 * These are line icons on a 24×24 grid, stroked in `currentColor`, so an icon
 * always matches the colour and weight of the label next to it.
 *
 *   <Icon name="search" />                  // 16px, inherits colour
 *   <Icon name="trash" className="w-4 h-4" />
 *
 * Sidebar.jsx keeps its own copy of the nav icons — those are tuned for the
 * rail and shouldn't shift if this set is re-drawn.
 */

// Every path is authored for a 24×24 box with a 2px stroke.
const PATHS = {
  /* status */
  check:       <path d="m5 13 4 4L19 7" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5L15.5 9.5" /></>,
  x:           <path d="M18 6 6 18M6 6l12 12" />,
  xCircle:     <><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></>,
  alert:       <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  info:        <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  clock:       <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  dot:         <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />,

  /* actions */
  search:   <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  refresh:  <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></>,
  edit:     <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  trash:    <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></>,
  plus:     <path d="M12 5v14M5 12h14" />,
  minus:    <path d="M5 12h14" />,
  save:     <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  upload:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 9l5-5 5 5M12 4v12" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 11l5 5 5-5M12 16V4" /></>,
  send:     <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></>,
  filter:   <path d="M22 3H2l8 9.5V19l4 2v-8.5z" />,
  external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></>,

  /* objects */
  file:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>,
  folder:    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  image:     <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
  paperclip: <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 0 1 5.18 5.18l-9.2 9.2a1.83 1.83 0 0 1-2.59-2.59l8.5-8.49" />,
  link:      <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  sheet:     <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></>,
  calendar:  <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  tag:       <><path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  pin:       <><path d="M12 17v5" /><path d="M9 2h6l-1 6 3.5 3.5V14H6.5v-2.5L10 8z" /></>,
  hash:      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  building:  <><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" /><path d="M15 9h2a2 2 0 0 1 2 2v10" /><path d="M9 7h2M9 11h2M9 15h2" /></>,
  rupee:     <><circle cx="12" cy="12" r="9" /><path d="M9 7h6M9 10.5h6M13.5 7c1.6 0 2.5 1 2.5 2.4S15.1 12 13.5 12H9l5 5" /></>,
  car:       <><path d="M5 17H3v-4l2-5h14l2 5v4h-2" /><circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" /><path d="M9.5 17h5" /></>,
  laptop:    <><rect x="3" y="5" width="18" height="11" rx="2" /><path d="M2 20h20" /></>,
  phone:     <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  mail:      <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></>,

  /* people */
  user:   <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  users:  <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,

  /* data */
  trendUp:   <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  trendDown: <><path d="m3 7 6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>,
  chart:     <><path d="M3 3v18h18" /><path d="M7 15v-4M12 15V7M17 15v-7" /></>,
  trophy:    <><path d="M8 21h8M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
  flag:      <><path d="M4 21V4" /><path d="M4 4h13l-2 4 2 4H4" /></>,
  zap:       <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,

  // The Live Tracking rail icon — concentric arcs over a dot, i.e. "this is
  // streaming". Matches the sidebar entry for the same page.
  live:  <><path d="M12 18a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" /><path d="M8.5 14.5a5 5 0 0 1 7 0" /><path d="M5 11a9 9 0 0 1 14 0" /></>,

  /* chevrons */
  chevronDown:  <path d="m6 9 6 6 6-6" />,
  chevronUp:    <path d="m6 15 6-6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft:  <path d="m15 6-6 6 6 6" />,
  arrowUp:      <path d="M12 19V5M5 12l7-7 7 7" />,
  arrowDown:    <path d="M12 5v14M19 12l-7 7-7-7" />,
  arrowRight:   <path d="M5 12h14M12 5l7 7-7 7" />,
};

export const ICON_NAMES = Object.keys(PATHS);

export default function Icon({ name, className = 'w-4 h-4', strokeWidth = 2, title, ...rest }) {
  const body = PATHS[name];
  // A typo in a name should show up while building the screen, not silently
  // leave a hole where the icon was meant to be.
  if (!body) {
    if (process.env.NODE_ENV !== 'production') console.warn(`<Icon name="${name}"> is not in the set`);
    return null;
  }
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      /* inline-block + a nudge so an icon sitting in plain text (not a flex
         row) lands on the text baseline instead of below it. Flex parents
         blockify their children, so this is inert inside a .btn. */
      className={`shrink-0 inline-block align-[-0.15em] ${className}`}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}
