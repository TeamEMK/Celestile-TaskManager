/* festival.js — Navratri + Dussehra theme for Celestile Task Manager.
 *
 * One self-contained file: all art is inline SVG, no images, no libraries.
 * Loaded from app/layout.jsx with next/script (beforeInteractive) so the day's
 * colours are on <html> before first paint. Bump the ?v= there on every change.
 *
 * Hook points (each a single call in the React code):
 *   Festival.applyTheme()          — runs once below; recolours via CSS tokens
 *   Festival.decorateTopbar()      — Topbar.jsx, fills [data-fest-slot="topbar"]
 *   Festival.mount(dashboardWrap)  — DashboardClient.jsx, after first paint
 *   Festival.decorateLogin(rootEl) — login/page.jsx
 *
 * Preview any day: ?fest=navratri | ?fest=dussehra | ?fest=YYYY-MM-DD
 * (sticks for the tab; ?fest=today clears it).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.Festival) return;

  // ── Dates ────────────────────────────────────────────────────────────────
  // ADD A ROW EVERY YEAR: Navratri day 1 (Ghatasthapana) and Vijayadashami,
  // from the panchang. Nothing shows in a year that has no row.
  var CALENDAR = [
    { start: '2026-10-11', dussehra: '2026-10-20' },
  ];
  var COMPANY = 'Celestile';
  var MODE_KEY = 'celestile-fest-mode';
  var USER_KEY = 'celestile-fest-user';
  var PREVIEW_KEY = 'celestile-fest-preview';

  // ── Colours ──────────────────────────────────────────────────────────────
  // p: the app's primary/button colour that day (gold on White and Yellow so
  // white button text stays readable); tint: page ground; deep: sidebar;
  // accent: sidebar highlight; saree / sareeDeep: the goddess's saree.
  var COLOURS = {
    'White':         { swatch: '#ffffff', p: '#a16207', tint: '#faf8f2', deep: '#2f2a20', accent: '#f2dfa6', saree: '#f7f2e4', sareeDeep: '#dccfae' },
    'Red':           { swatch: '#dc2626', p: '#dc2626', tint: '#fdf5f5', deep: '#450a0a', accent: '#fca5a5', saree: '#d81f26', sareeDeep: '#8f1016' },
    'Royal Blue':    { swatch: '#1d4ed8', p: '#1d4ed8', tint: '#f4f6fd', deep: '#0c1a45', accent: '#93c5fd', saree: '#2448c9', sareeDeep: '#132a7a' },
    'Yellow':        { swatch: '#facc15', p: '#a16207', tint: '#fefbea', deep: '#3d2a05', accent: '#fde047', saree: '#f7c718', sareeDeep: '#c08a06' },
    'Green':         { swatch: '#16a34a', p: '#15803d', tint: '#f3faf5', deep: '#0b331b', accent: '#86efac', saree: '#1f9d4c', sareeDeep: '#0f5c2b' },
    'Grey':          { swatch: '#9ca3af', p: '#4b5563', tint: '#f5f5f6', deep: '#1f2430', accent: '#d1d5db', saree: '#a3a9b4', sareeDeep: '#5b616c' },
    'Orange':        { swatch: '#f97316', p: '#ea580c', tint: '#fdf6f1', deep: '#431806', accent: '#fdba74', saree: '#f26b12', sareeDeep: '#a3410a' },
    'Peacock Green': { swatch: '#0f9b8e', p: '#0f766e', tint: '#f1f9f8', deep: '#06312e', accent: '#5eead4', saree: '#0f8f84', sareeDeep: '#08514b' },
    'Purple':        { swatch: '#7e22ce', p: '#7e22ce', tint: '#f8f4fc', deep: '#2a0c47', accent: '#d8b4fe', saree: '#7b2bc4', sareeDeep: '#4a1479' },
  };
  var SAFFRON = { swatch: '#ea580c', p: '#c2410c', tint: '#fdf5ef', deep: '#3d0c06', accent: '#fdba74', saree: '#ea580c', sareeDeep: '#9a2c06' };
  // Day 1 takes its weekday's colour (indexed Sun..Sat); days 2–7 carry on round
  // the week in order; day 8 and day 9 are fixed.
  var WEEK = ['Orange', 'White', 'Red', 'Royal Blue', 'Yellow', 'Green', 'Grey'];

  // ── The nine forms ──────────────────────────────────────────────────────
  // R / L: arms on her right / left (viewer's right / left), top to bottom, as
  // [angle in degrees below horizontal, what the hand holds]. The last arm on
  // each side is the front one.
  var GODDESS = [
    { en: 'Shailputri', hi: 'शैलपुत्री', virtue: 'strength & devotion', vahana: 'bull', moon: true,
      R: [[25, 'trishul']], L: [[25, 'lotus']] },
    { en: 'Brahmacharini', hi: 'ब्रह्मचारिणी', virtue: 'penance & discipline', vahana: null, white: true, bun: true,
      R: [[30, 'mala']], L: [[30, 'kamandal']] },
    { en: 'Chandraghanta', hi: 'चंद्रघंटा', virtue: 'courage & grace', vahana: 'tiger', moon: true,
      R: [[-72, 'trishul'], [-48, 'gada'], [-24, 'sword'], [0, 'kamandal'], [26, 'bell']],
      L: [[-72, 'lotus'], [-48, 'arrow'], [-24, 'bow'], [0, 'mala'], [26, 'abhaya']] },
    { en: 'Kushmanda', hi: 'कूष्मांडा', virtue: 'creative energy', vahana: 'lion',
      R: [[-68, 'kamandal'], [-38, 'bow'], [-8, 'arrow'], [24, 'lotus']],
      L: [[-68, 'kalash'], [-38, 'chakra'], [-8, 'gada'], [24, 'mala']] },
    { en: 'Skandamata', hi: 'स्कंदमाता', virtue: "a mother's love", vahana: 'lion', baby: true,
      R: [[-45, 'lotus'], [22, 'abhaya']], L: [[-45, 'lotus'], [112, 'none']] },
    { en: 'Katyayani', hi: 'कात्यायनी', virtue: 'valour', vahana: 'lion',
      R: [[-45, 'sword'], [22, 'abhaya']], L: [[-45, 'lotus'], [22, 'varada']] },
    { en: 'Kalaratri', hi: 'कालरात्रि', virtue: 'fearlessness', vahana: 'donkey', dark: true, wild: true,
      R: [[-45, 'sword'], [22, 'abhaya']], L: [[-45, 'hook'], [22, 'varada']] },
    { en: 'Mahagauri', hi: 'महागौरी', virtue: 'purity & peace', vahana: 'bull', fair: true, white: true,
      R: [[-45, 'trishul'], [22, 'abhaya']], L: [[-45, 'damaru'], [22, 'varada']] },
    { en: 'Siddhidatri', hi: 'सिद्धिदात्री', virtue: 'wisdom & fulfilment', vahana: 'lotus',
      R: [[-45, 'chakra'], [22, 'gada']], L: [[-45, 'shankh'], [22, 'lotus']] },
  ];

  var JOKES = {
    navratri: [
      'Garba raat ko, approvals abhi. 💃',
      'Nau din, nau rang — aur zero pending tasks. 🎨',
      'Dandiya practice after the 7 PM report. 🥢',
      'Aaj ka rang match karo, deadline bhi. ✨',
      'Vrat hai, par follow-ups nahi chhodenge. 🙏',
    ],
    dussehra: [
      'Aaj pending tasks ka Ravan Dahan. 🏹',
      'Burai pe acchai ki jeet — aur backlog pe team ki. 🔥',
      'Dus sar wali problem? Ek team kaafi hai. 💪',
    ],
    eve: ['Kal se nau rang. Aaj se planning. 🪔'],
    after: ['Ravan jal gaya — ab reports bhejo. 📊'],
  };

  // ── Small helpers ────────────────────────────────────────────────────────
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) window.sessionStorage.removeItem(k); else window.sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function reduceMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function node(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  var uid = 0;
  function nid(p) { uid += 1; return p + uid; }
  function r1(n) { return Math.round(n * 10) / 10; }

  function hexRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function mix(a, b, t) { return a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }); }
  function trip(c) { return c.join(' '); }
  function hex(c) { return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }

  // ── Today, in IST ────────────────────────────────────────────────────────
  function istToday() {
    try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }
    catch (e) { return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); }
  }
  function dayNum(iso) { return Math.round(Date.parse(iso + 'T00:00:00Z') / 864e5); }
  function addDays(iso, n) { return new Date((dayNum(iso) + n) * 864e5).toISOString().slice(0, 10); }
  function weekday(iso) { return new Date(iso + 'T00:00:00Z').getUTCDay(); }

  function stateFor(iso) {
    for (var i = 0; i < CALENDAR.length; i++) {
      var row = CALENDAR[i];
      var d = dayNum(iso) - dayNum(row.start) + 1;
      if (d === 0) return { phase: 'eve', row: row };
      if (d >= 1 && iso < row.dussehra) {
        var day = Math.min(d, 9);
        var colour = day === 8 ? 'Peacock Green' : day === 9 ? 'Purple' : WEEK[(weekday(row.start) + day - 1) % 7];
        return { phase: 'navratri', row: row, day: day, colour: colour, pal: COLOURS[colour], g: GODDESS[day - 1] };
      }
      if (iso === row.dussehra) return { phase: 'dussehra', row: row, pal: SAFFRON };
      if (iso === addDays(row.dussehra, 1)) return { phase: 'after', row: row };
    }
    return null;
  }

  function resolveState() {
    var today = istToday();
    try {
      var q = new URLSearchParams(window.location.search).get('fest');
      if (q) ssSet(PREVIEW_KEY, q === 'today' || q === 'off' ? null : q);
    } catch (e) { /* no URL API */ }
    var o = ssGet(PREVIEW_KEY);
    if (/^\d{4}-\d{2}-\d{2}$/.test(o || '')) return stateFor(o);
    if (o === 'navratri' || o === 'dussehra') {
      var now = stateFor(today);
      if (o === 'navratri' && now && now.phase === 'navratri') return now;
      var row = (now && now.row) || nearestRow(today);
      return stateFor(o === 'navratri' ? row.start : row.dussehra);
    }
    return stateFor(today);
  }
  function nearestRow(iso) {
    var best = CALENDAR[CALENDAR.length - 1], gap = Infinity;
    CALENDAR.forEach(function (r) { var g = Math.abs(dayNum(r.start) - dayNum(iso)); if (g < gap) { gap = g; best = r; } });
    return best;
  }

  var S = resolveState();
  var currentUser = '';

  function themed() { return !!S && (S.phase === 'navratri' || S.phase === 'dussehra'); }
  function userKey() { return currentUser || lsGet(USER_KEY) || 'anon'; }
  function getMode() {
    var v = lsGet(MODE_KEY + ':' + userKey());
    return v === 'lite' || v === 'off' ? v : 'full';
  }
  function setMode(m) {
    lsSet(MODE_KEY + ':' + userKey(), m);
    refreshAll();
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Art
  // ═════════════════════════════════════════════════════════════════════════

  // ── Things held in the hands (hx, hy = the hand) ─────────────────────────
  var GOLD = '#d4a017', GOLD_D = '#9a6f0c', STEEL = '#d7dbe3', STEEL_D = '#8a909c';
  function item(name, x, y, gold) {
    var g = 'url(#' + gold + ')';
    switch (name) {
      case 'trishul':
        return '<g><line x1="' + x + '" y1="' + (y + 14) + '" x2="' + x + '" y2="' + (y - 27) + '" stroke="' + g + '" stroke-width="2.2" stroke-linecap="round"/>' +
          '<path d="M' + (x - 7.5) + ' ' + (y - 37) + ' Q' + (x - 8) + ' ' + (y - 27) + ' ' + x + ' ' + (y - 26) + ' Q' + (x + 8) + ' ' + (y - 27) + ' ' + (x + 7.5) + ' ' + (y - 37) + '" fill="none" stroke="' + STEEL_D + '" stroke-width="2.4" stroke-linecap="round"/>' +
          '<path d="M' + x + ' ' + (y - 26) + ' L' + x + ' ' + (y - 41) + '" stroke="' + STEEL_D + '" stroke-width="2.4" stroke-linecap="round"/>' +
          '<path d="M' + (x - 2) + ' ' + (y - 40) + ' L' + x + ' ' + (y - 45) + ' L' + (x + 2) + ' ' + (y - 40) + ' Z M' + (x - 9.5) + ' ' + (y - 36) + ' L' + (x - 7.5) + ' ' + (y - 41) + ' L' + (x - 5.5) + ' ' + (y - 36) + ' Z M' + (x + 5.5) + ' ' + (y - 36) + ' L' + (x + 7.5) + ' ' + (y - 41) + ' L' + (x + 9.5) + ' ' + (y - 36) + ' Z" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width=".5"/>' +
          '<path d="M' + x + ' ' + (y - 22) + ' q 5 3 3 8 M' + x + ' ' + (y - 22) + ' q -4 4 -1 8" stroke="#dc2626" stroke-width="1.4" fill="none"/></g>';
      case 'lotus':
        return '<g><line x1="' + x + '" y1="' + (y + 6) + '" x2="' + x + '" y2="' + (y - 9) + '" stroke="#3f8f3a" stroke-width="1.6"/>' +
          [-62, -31, 0, 31, 62].map(function (a) {
            return '<ellipse cx="' + x + '" cy="' + (y - 16) + '" rx="3" ry="6.5" transform="rotate(' + a + ' ' + x + ' ' + (y - 10) + ')" fill="#f9a8d4" stroke="#db2777" stroke-width=".6"/>';
          }).join('') + '<circle cx="' + x + '" cy="' + (y - 11) + '" r="1.8" fill="#fde047"/></g>';
      case 'mala': {
        var out = '<g>';
        for (var i = 0; i < 14; i++) {
          var a = i / 14 * Math.PI * 2;
          out += '<circle cx="' + r1(x + Math.cos(a) * 6.5) + '" cy="' + r1(y + 8 + Math.sin(a) * 6.5) + '" r="1.45" fill="#8b4f24" stroke="#5c3014" stroke-width=".4"/>';
        }
        return out + '<path d="M' + x + ' ' + (y + 14.5) + ' l -1.5 5 h 3 z" fill="#dc2626"/></g>';
      }
      case 'kamandal':
        return '<g><path d="M' + (x - 4) + ' ' + y + ' Q' + x + ' ' + (y - 6) + ' ' + (x + 4) + ' ' + y + '" fill="none" stroke="' + g + '" stroke-width="1.6"/>' +
          '<path d="M' + (x - 6.5) + ' ' + (y + 3) + ' Q' + (x - 9) + ' ' + (y + 14) + ' ' + x + ' ' + (y + 15) + ' Q' + (x + 9) + ' ' + (y + 14) + ' ' + (x + 6.5) + ' ' + (y + 3) + ' Z" fill="' + g + '" stroke="' + GOLD_D + '" stroke-width=".7"/>' +
          '<path d="M' + (x + 6) + ' ' + (y + 6) + ' q 5 -1 6 -5" stroke="' + GOLD_D + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
          '<rect x="' + (x - 3.5) + '" y="' + (y + 1) + '" width="7" height="2.4" rx="1" fill="' + GOLD_D + '"/></g>';
      case 'sword':
        return '<g><path d="M' + (x - 1.7) + ' ' + (y - 5) + ' L' + (x - 2.2) + ' ' + (y - 35) + ' L' + x + ' ' + (y - 42) + ' L' + (x + 2.2) + ' ' + (y - 35) + ' L' + (x + 1.7) + ' ' + (y - 5) + ' Z" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width=".6"/>' +
          '<line x1="' + x + '" y1="' + (y - 8) + '" x2="' + x + '" y2="' + (y - 35) + '" stroke="#fff" stroke-width=".5" opacity=".8"/>' +
          '<rect x="' + (x - 6) + '" y="' + (y - 6) + '" width="12" height="2.6" rx="1.2" fill="' + g + '"/>' +
          '<rect x="' + (x - 1.3) + '" y="' + (y - 4) + '" width="2.6" height="8" fill="#5b2a0c"/><circle cx="' + x + '" cy="' + (y + 5) + '" r="1.8" fill="' + g + '"/></g>';
      case 'hook':
        return '<g><line x1="' + x + '" y1="' + (y + 9) + '" x2="' + x + '" y2="' + (y - 30) + '" stroke="' + g + '" stroke-width="2.2" stroke-linecap="round"/>' +
          '<path d="M' + x + ' ' + (y - 28) + ' Q' + (x + 10) + ' ' + (y - 30) + ' ' + (x + 7) + ' ' + (y - 20) + '" fill="none" stroke="' + STEEL_D + '" stroke-width="2.4" stroke-linecap="round"/>' +
          '<path d="M' + (x - 2) + ' ' + (y - 29) + ' L' + x + ' ' + (y - 38) + ' L' + (x + 2) + ' ' + (y - 29) + ' Z" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width=".5"/></g>';
      case 'bow':
        return '<g><path d="M' + (x + 3) + ' ' + (y - 27) + ' Q' + (x - 11) + ' ' + y + ' ' + (x + 3) + ' ' + (y + 27) + '" fill="none" stroke="#8b4513" stroke-width="2.6" stroke-linecap="round"/>' +
          '<line x1="' + (x + 3) + '" y1="' + (y - 27) + '" x2="' + (x + 3) + '" y2="' + (y + 27) + '" stroke="#f5f0e1" stroke-width=".7"/></g>';
      case 'arrow':
        return '<g><line x1="' + x + '" y1="' + (y + 13) + '" x2="' + x + '" y2="' + (y - 30) + '" stroke="#8b4513" stroke-width="1.6"/>' +
          '<path d="M' + (x - 2.6) + ' ' + (y - 29) + ' L' + x + ' ' + (y - 36) + ' L' + (x + 2.6) + ' ' + (y - 29) + ' Z" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width=".5"/>' +
          '<path d="M' + x + ' ' + (y + 7) + ' l -3 6 M' + x + ' ' + (y + 7) + ' l 3 6 M' + x + ' ' + (y + 10) + ' l -3 5 M' + x + ' ' + (y + 10) + ' l 3 5" stroke="#dc2626" stroke-width="1.1"/></g>';
      case 'chakra': {
        var c = '<g class="fd-chakra" style="transform-origin:' + x + 'px ' + (y - 13) + 'px"><circle cx="' + x + '" cy="' + (y - 13) + '" r="10.5" fill="none" stroke="#f59e0b" stroke-width="1.6" stroke-dasharray="2 1.6"/>' +
          '<circle cx="' + x + '" cy="' + (y - 13) + '" r="8.4" fill="' + g + '" stroke="' + GOLD_D + '" stroke-width=".7"/>';
        for (var k = 0; k < 8; k++) {
          var b = k / 8 * Math.PI * 2;
          c += '<line x1="' + x + '" y1="' + (y - 13) + '" x2="' + r1(x + Math.cos(b) * 7.5) + '" y2="' + r1(y - 13 + Math.sin(b) * 7.5) + '" stroke="' + GOLD_D + '" stroke-width=".9"/>';
        }
        return c + '<circle cx="' + x + '" cy="' + (y - 13) + '" r="2.6" fill="#dc2626" stroke="' + GOLD_D + '" stroke-width=".6"/></g>';
      }
      case 'gada':
        return '<g><line x1="' + x + '" y1="' + (y + 10) + '" x2="' + x + '" y2="' + (y - 22) + '" stroke="' + g + '" stroke-width="2.6" stroke-linecap="round"/>' +
          '<circle cx="' + x + '" cy="' + (y - 29) + '" r="7.5" fill="' + g + '" stroke="' + GOLD_D + '" stroke-width=".8"/>' +
          '<circle cx="' + (x - 4) + '" cy="' + (y - 29) + '" r="1.3" fill="' + GOLD_D + '"/><circle cx="' + (x + 4) + '" cy="' + (y - 29) + '" r="1.3" fill="' + GOLD_D + '"/><circle cx="' + x + '" cy="' + (y - 33) + '" r="1.3" fill="' + GOLD_D + '"/>' +
          '<path d="M' + (x - 1.6) + ' ' + (y - 36) + ' L' + x + ' ' + (y - 41) + ' L' + (x + 1.6) + ' ' + (y - 36) + ' Z" fill="' + g + '"/></g>';
      case 'kalash':
        return '<g><circle cx="' + x + '" cy="' + (y - 7) + '" r="7.2" fill="#c2541a" stroke="' + GOLD_D + '" stroke-width=".8"/>' +
          '<path d="M' + (x - 6.6) + ' ' + (y - 9) + ' Q' + x + ' ' + (y - 5) + ' ' + (x + 6.6) + ' ' + (y - 9) + '" stroke="' + g + '" stroke-width="1.6" fill="none"/>' +
          '<rect x="' + (x - 3.6) + '" y="' + (y - 16.5) + '" width="7.2" height="3.4" rx="1" fill="' + g + '"/>' +
          [-50, -25, 0, 25, 50].map(function (a) { return '<ellipse cx="' + x + '" cy="' + (y - 22) + '" rx="1.9" ry="5.4" transform="rotate(' + a + ' ' + x + ' ' + (y - 16) + ')" fill="#2f8f3a"/>'; }).join('') +
          '<circle cx="' + x + '" cy="' + (y - 21) + '" r="3.6" fill="#8a5a2b"/></g>';
      case 'shankh':
        return '<g><path d="M' + (x - 7) + ' ' + (y - 3) + ' Q' + (x - 9) + ' ' + (y - 16) + ' ' + x + ' ' + (y - 20) + ' Q' + (x + 9) + ' ' + (y - 16) + ' ' + (x + 5) + ' ' + (y - 4) + ' Q' + x + ' ' + (y + 2) + ' ' + (x - 7) + ' ' + (y - 3) + ' Z" fill="#fbf7ef" stroke="#c9b897" stroke-width=".8"/>' +
          '<path d="M' + (x - 4) + ' ' + (y - 6) + ' q 4 -6 8 -2 M' + (x - 5) + ' ' + (y - 11) + ' q 5 -5 8 0" stroke="#c9b897" stroke-width=".7" fill="none"/>' +
          '<path d="M' + x + ' ' + (y - 20) + ' l -1.4 -4 l 2.8 0 z" fill="#fbf7ef" stroke="#c9b897" stroke-width=".5"/></g>';
      case 'damaru':
        return '<g><path d="M' + (x - 6) + ' ' + (y - 21) + ' H' + (x + 6) + ' L' + x + ' ' + (y - 12) + ' Z M' + (x - 6) + ' ' + (y - 3) + ' H' + (x + 6) + ' L' + x + ' ' + (y - 12) + ' Z" fill="#a0522d" stroke="#5b2a0c" stroke-width=".7"/>' +
          '<line x1="' + (x - 6) + '" y1="' + (y - 21) + '" x2="' + (x + 6) + '" y2="' + (y - 21) + '" stroke="' + g + '" stroke-width="1.6"/><line x1="' + (x - 6) + '" y1="' + (y - 3) + '" x2="' + (x + 6) + '" y2="' + (y - 3) + '" stroke="' + g + '" stroke-width="1.6"/>' +
          '<path d="M' + x + ' ' + (y - 12) + ' q -7 2 -9 7 M' + x + ' ' + (y - 12) + ' q 7 2 9 7" stroke="#5b2a0c" stroke-width=".6" fill="none"/><circle cx="' + (x - 9) + '" cy="' + (y - 5) + '" r="1.2" fill="#5b2a0c"/><circle cx="' + (x + 9) + '" cy="' + (y - 5) + '" r="1.2" fill="#5b2a0c"/></g>';
      case 'bell':
        return '<g><path d="M' + (x - 6) + ' ' + (y + 15) + ' Q' + (x - 6) + ' ' + (y + 3) + ' ' + x + ' ' + (y + 3) + ' Q' + (x + 6) + ' ' + (y + 3) + ' ' + (x + 6) + ' ' + (y + 15) + ' Z" fill="' + g + '" stroke="' + GOLD_D + '" stroke-width=".7"/>' +
          '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y + 3) + '" stroke="' + GOLD_D + '" stroke-width="1.4"/><circle cx="' + x + '" cy="' + (y + 16.5) + '" r="1.6" fill="' + GOLD_D + '"/></g>';
      default:
        return '';
    }
  }

  // ── Vahanas ──────────────────────────────────────────────────────────────
  function vahana(kind, id) {
    var legs = function (fill) {
      return [72, 86, 132, 146].map(function (lx) {
        return '<rect x="' + lx + '" y="224" width="9" height="20" rx="4" fill="' + fill + '"/>';
      }).join('');
    };
    switch (kind) {
      case 'lion':
        return '<g><path d="M162 216 q 18 -4 14 -22" stroke="#c7863a" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="176" cy="192" r="4" fill="#8a4a16"/>' +
          legs('#c7863a') + '<ellipse cx="110" cy="220" rx="54" ry="17" fill="url(#' + id + 'v)"/>' +
          '<polygon points="' + star(56, 208, 22, 15, 16) + '" fill="#9a4f1a"/>' +
          '<circle cx="54" cy="210" r="11.5" fill="#e9b35a"/><circle cx="50" cy="207" r="1.4" fill="#2b1a0e"/><circle cx="58" cy="207" r="1.4" fill="#2b1a0e"/>' +
          '<path d="M51.5 212 l 2.5 2.5 l 2.5 -2.5 z" fill="#5b2a0c"/><path d="M50 216 q 4 3 8 0" stroke="#5b2a0c" stroke-width="1" fill="none"/></g>';
      case 'tiger': {
        var stripes = [92, 106, 120, 134, 148].map(function (sx) {
          return '<path d="M' + sx + ' 204 q -4 8 0 16" stroke="#1c1917" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
        }).join('');
        return '<g><path d="M162 216 q 18 -2 16 -20" stroke="#ea7a1c" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
          legs('#d9691a') + '<ellipse cx="110" cy="220" rx="54" ry="17" fill="url(#' + id + 'v)"/>' + stripes +
          '<circle cx="47" cy="198" r="4.2" fill="#ea7a1c"/><circle cx="65" cy="198" r="4.2" fill="#ea7a1c"/>' +
          '<circle cx="56" cy="209" r="13" fill="#f08a24"/><ellipse cx="56" cy="215" rx="8" ry="5.5" fill="#fff7ed"/>' +
          '<path d="M52 199 l 1 5 M56 198 l 0 5 M60 199 l -1 5" stroke="#1c1917" stroke-width="1.2"/>' +
          '<circle cx="51" cy="207" r="1.5" fill="#14532d"/><circle cx="61" cy="207" r="1.5" fill="#14532d"/><path d="M54 212 l 2 2 l 2 -2 z" fill="#1c1917"/></g>';
      }
      case 'bull':
        return '<g><path d="M162 214 q 10 8 6 20" stroke="#d6d0c4" stroke-width="2.6" fill="none"/>' +
          legs('#e2dccf') + '<ellipse cx="110" cy="220" rx="54" ry="17" fill="url(#' + id + 'v)"/>' +
          '<path d="M74 206 q 10 -14 22 -4" fill="#efe9dd"/>' +
          '<path d="M96 204 h 40 l 4 16 h -48 z" fill="#b91c1c" stroke="' + GOLD + '" stroke-width="1.4"/><path d="M98 214 h 40" stroke="' + GOLD + '" stroke-width="1" stroke-dasharray="1.5 2"/>' +
          '<path d="M44 196 q -8 -10 -2 -16 M66 196 q 8 -10 2 -16" stroke="#c9b48a" stroke-width="3" fill="none" stroke-linecap="round"/>' +
          '<ellipse cx="55" cy="210" rx="11" ry="14" fill="#f3efe6"/><ellipse cx="55" cy="219" rx="7" ry="5" fill="#e6c9b5"/>' +
          '<circle cx="50" cy="206" r="1.4" fill="#2b1a0e"/><circle cx="60" cy="206" r="1.4" fill="#2b1a0e"/>' +
          '<path d="M46 224 q 9 6 18 0" stroke="' + GOLD + '" stroke-width="1.6" fill="none"/><circle cx="55" cy="229" r="2.6" fill="' + GOLD + '"/></g>';
      case 'donkey':
        return '<g><path d="M162 214 q 10 6 8 18" stroke="#7b7b85" stroke-width="2.2" fill="none"/>' +
          legs('#80808a') + '<ellipse cx="110" cy="220" rx="54" ry="17" fill="url(#' + id + 'v)"/>' +
          '<path d="M64 204 q 14 -10 30 0" stroke="#55555e" stroke-width="3" fill="none"/>' +
          '<ellipse cx="46" cy="186" rx="3.4" ry="11" transform="rotate(-18 46 186)" fill="#8e8e98"/><ellipse cx="58" cy="186" rx="3.4" ry="11" transform="rotate(14 58 186)" fill="#8e8e98"/>' +
          '<rect x="42" y="196" width="22" height="30" rx="10" fill="#9a9aa3"/><ellipse cx="53" cy="222" rx="9" ry="6" fill="#c9c9cf"/>' +
          '<circle cx="48" cy="204" r="1.4" fill="#1c1917"/><circle cx="58" cy="204" r="1.4" fill="#1c1917"/></g>';
      case 'lotus': {
        var back = [-70, -45, -22, 0, 22, 45, 70].map(function (a) {
          return '<ellipse cx="100" cy="205" rx="10" ry="26" transform="rotate(' + a + ' 100 232)" fill="#f9a8d4" stroke="#db2777" stroke-width=".8"/>';
        }).join('');
        var front = [-55, -28, 0, 28, 55].map(function (a) {
          return '<ellipse cx="100" cy="214" rx="9" ry="19" transform="rotate(' + a + ' 100 234)" fill="#fbcfe8" stroke="#db2777" stroke-width=".8"/>';
        }).join('');
        return '<g><ellipse cx="100" cy="240" rx="72" ry="8" fill="#3f8f3a" opacity=".85"/>' + back + front + '</g>';
      }
      default: // no vahana: bare feet on a little lotus pedestal
        return '<g><ellipse cx="100" cy="226" rx="44" ry="8" fill="#f9a8d4" stroke="#db2777" stroke-width=".8"/>' +
          '<ellipse cx="91" cy="214" rx="6" ry="3.4" fill="url(#' + id + 's)"/><ellipse cx="109" cy="214" rx="6" ry="3.4" fill="url(#' + id + 's)"/>' +
          '<path d="M85.5 215 q 5.5 3 11 0 M103.5 215 q 5.5 3 11 0" stroke="#dc2626" stroke-width="1" fill="none"/></g>';
    }
  }
  function star(cx, cy, ro, ri, n) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? ri : ro, a = i / (n * 2) * Math.PI * 2;
      pts.push(r1(cx + Math.cos(a) * r) + ',' + r1(cy + Math.sin(a) * r));
    }
    return pts.join(' ');
  }

  // ── Durga, dressed for the day. crop: 'full' | 'face' ────────────────────
  function durgaSVG(st, crop) {
    var g = st.g, c = st.pal, id = nid('fd');
    var skin = g.dark ? ['#56507a', '#2a2540'] : g.fair ? ['#fde9d8', '#eac2a2'] : ['#f6c9a0', '#d8946a'];
    var saree = g.white ? ['#fbf8f1', '#e2dac6'] : [c.saree, c.sareeDeep];
    var blouse = g.white ? (st.colour === 'White' ? '#c99a2e' : c.saree) : c.sareeDeep;
    var vahFill = { lion: ['#f0c070', '#c7863a'], tiger: ['#f6a040', '#d9691a'], bull: ['#faf7f0', '#d9d2c3'], donkey: ['#a8a8b0', '#76767f'] }[g.vahana] || ['#fff', '#ddd'];
    var view = crop === 'face' ? '73 33 54 54' : '0 0 200 250';
    var GD = id + 'g';

    var defs = '<defs>' +
      '<radialGradient id="' + id + 's" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="' + skin[0] + '"/><stop offset="1" stop-color="' + skin[1] + '"/></radialGradient>' +
      '<linearGradient id="' + id + 'a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + skin[0] + '"/><stop offset="1" stop-color="' + skin[1] + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'c" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="' + saree[0] + '"/><stop offset="1" stop-color="' + saree[1] + '"/></linearGradient>' +
      '<linearGradient id="' + GD + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset=".5" stop-color="#e3b21c"/><stop offset="1" stop-color="#a87a12"/></linearGradient>' +
      '<radialGradient id="' + id + 'h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe8"/><stop offset=".65" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b" stop-opacity=".85"/></radialGradient>' +
      '<linearGradient id="' + id + 'v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + vahFill[0] + '"/><stop offset="1" stop-color="' + vahFill[1] + '"/></linearGradient>' +
      '</defs>';

    // Halo: rotating sun rays, a ring of lotus petals, then the disc.
    var rays = '';
    for (var i = 0; i < 24; i++) {
      var a = i * 15 * Math.PI / 180, w = 4.2 * Math.PI / 180;
      rays += '<polygon points="' + r1(100 + Math.cos(a) * 62) + ',' + r1(64 + Math.sin(a) * 62) + ' ' +
        r1(100 + Math.cos(a - w) * 36) + ',' + r1(64 + Math.sin(a - w) * 36) + ' ' +
        r1(100 + Math.cos(a + w) * 36) + ',' + r1(64 + Math.sin(a + w) * 36) + '" fill="' + (i % 2 ? '#f59e0b' : '#fbbf24') + '" opacity="' + (i % 2 ? '.55' : '.8') + '"/>';
    }
    var petals = '';
    for (var p = 0; p < 16; p++) {
      petals += '<ellipse cx="100" cy="23" rx="5.5" ry="9.5" transform="rotate(' + (p * 22.5) + ' 100 64)" fill="#fbcfe8" stroke="#ec4899" stroke-width=".6"/>';
    }
    var halo = '<g class="fd-halo">' + rays + '</g>' + petals + '<circle cx="100" cy="64" r="37" fill="url(#' + id + 'h)"/>';

    // Hair behind the body.
    var backHair = g.wild
      ? '<polygon points="' + star(100, 66, 36, 24, 18) + '" fill="#120d14"/><path d="M78 80 Q70 120 80 150 L120 150 Q130 120 122 80 Z" fill="#120d14"/>'
      : '<path d="M82 62 Q75 104 82 144 L118 144 Q125 104 118 62 Z" fill="#1d1310"/>';

    // Arms.
    function arm(side, spec, front) {
      var sx = side > 0 ? 116 : 84, sy = 101;
      var rad = spec[0] * Math.PI / 180;
      var dx = Math.cos(rad) * side, dy = Math.sin(rad);
      var ex = r1(sx + dx * 19), ey = r1(sy + dy * 19 + 5);
      var hx = r1(sx + dx * 38), hy = r1(sy + dy * 38);
      var mx = r1(sx + dx * 9), my = r1(sy + dy * 9 + 2.4);
      var bx = r1(ex + (hx - ex) * .78), by = r1(ey + (hy - ey) * .78);
      return '<g>' +
        '<path d="M' + sx + ' ' + sy + ' L' + ex + ' ' + ey + ' L' + hx + ' ' + hy + '" fill="none" stroke="url(#' + id + 'a)" stroke-width="' + (front ? 7.4 : 6.4) + '" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="' + mx + '" cy="' + my + '" r="3.5" fill="none" stroke="url(#' + GD + ')" stroke-width="1.8"/>' +
        '<circle cx="' + bx + '" cy="' + by + '" r="3.2" fill="none" stroke="#dc2626" stroke-width="1.3"/>' +
        '<circle cx="' + bx + '" cy="' + by + '" r="3.9" fill="none" stroke="url(#' + GD + ')" stroke-width="1"/>' +
        (spec[1] === 'abhaya' ? '<ellipse cx="' + hx + '" cy="' + (hy - 5) + '" rx="4" ry="6" fill="url(#' + id + 's)"/><circle cx="' + hx + '" cy="' + (hy - 5) + '" r="1.5" fill="#dc2626"/>' : '') +
        (spec[1] === 'varada' ? '<ellipse cx="' + hx + '" cy="' + (hy + 5) + '" rx="4" ry="6" fill="url(#' + id + 's)"/><circle cx="' + hx + '" cy="' + (hy + 5) + '" r="1.5" fill="#dc2626"/>' : '') +
        '<circle cx="' + hx + '" cy="' + hy + '" r="4" fill="url(#' + id + 's)"/>' +
        item(spec[1], hx, hy, GD) + '</g>';
    }
    var backArms = '', frontArms = '';
    [[1, g.R], [-1, g.L]].forEach(function (pair) {
      pair[1].forEach(function (spec, i) {
        var isFront = i === pair[1].length - 1;
        if (isFront) frontArms += arm(pair[0], spec, true); else backArms += arm(pair[0], spec, false);
      });
    });

    // Body: skirt with pleats and a zari hem, blouse, pallu over the shoulder.
    var body =
      '<path d="M84 134 Q100 139 116 134 Q134 170 143 207 Q100 216 57 207 Q66 170 84 134 Z" fill="url(#' + id + 'c)"/>' +
      '<path d="M100 140 L97 211 M92 139 L82 209 M108 139 L116 209" stroke="' + saree[1] + '" stroke-width="1" opacity=".55" fill="none"/>' +
      '<path d="M57 207 Q100 216 143 207" stroke="url(#' + GD + ')" stroke-width="5" fill="none"/>' +
      '<path d="M58 203.5 Q100 212 142 203.5" stroke="#b91c1c" stroke-width="1" fill="none" stroke-dasharray="2 2.4"/>' +
      '<rect x="95" y="82" width="10" height="14" fill="url(#' + id + 'a)"/>' +
      '<path d="M80 98 Q100 92 120 98 L117 136 Q100 141 83 136 Z" fill="' + blouse + '"/>' +
      '<path d="M82 98 Q98 104 119 131 L111 139 Q94 119 80 108 Z" fill="url(#' + id + 'c)"/>' +
      '<path d="M82 98 Q98 104 119 131" stroke="url(#' + GD + ')" stroke-width="2" fill="none"/>' +
      '<path d="M83 136 Q100 141 117 136" stroke="url(#' + GD + ')" stroke-width="3.2" fill="none"/>';

    var baby = g.baby
      ? '<g><ellipse cx="100" cy="166" rx="10" ry="12" fill="#facc15" stroke="#ca8a04" stroke-width=".8"/>' +
        '<circle cx="100" cy="150" r="7.5" fill="url(#' + id + 's)"/><path d="M93.5 146 L95 140 L98 144 L100 138.5 L102 144 L105 140 L106.5 146 Z" fill="url(#' + GD + ')"/>' +
        '<path d="M97 151 q 1.2 1 2.4 0 M100.6 151 q 1.2 1 2.4 0" stroke="#2b1a12" stroke-width=".7" fill="none"/><path d="M98.4 154.5 q 1.6 1.2 3.2 0" stroke="#be185d" stroke-width=".8" fill="none"/>' +
        '<circle cx="100" cy="147" r=".9" fill="#dc2626"/></g>'
      : '';

    // Jewellery: layered necklaces, rudraksha for the ascetic form.
    var necklaces = g.bun
      ? '<path d="M92 90 Q100 96 108 90" stroke="#7a3f18" stroke-width="2.4" fill="none" stroke-dasharray=".1 3" stroke-linecap="round"/>' +
        '<path d="M86 99 Q100 116 114 99" stroke="#7a3f18" stroke-width="2.8" fill="none" stroke-dasharray=".1 3.4" stroke-linecap="round"/>'
      : '<path d="M92.5 90 Q100 95 107.5 90" stroke="url(#' + GD + ')" stroke-width="2.4" fill="none"/>' +
        '<path d="M93.5 91.6 Q100 96 106.5 91.6" stroke="#dc2626" stroke-width="1.2" fill="none" stroke-dasharray="1 1.6"/>' +
        '<path d="M86 99 Q100 112 114 99" stroke="url(#' + GD + ')" stroke-width="2" fill="none"/><circle cx="100" cy="108.6" r="2.8" fill="#dc2626" stroke="url(#' + GD + ')" stroke-width="1"/>' +
        '<path d="M84 101 Q100 126 116 101" stroke="#fde68a" stroke-width="2" fill="none" stroke-dasharray=".1 2.6" stroke-linecap="round"/><path d="M98 119.5 h4 l-2 4.5 z" fill="#16a34a" stroke="url(#' + GD + ')" stroke-width=".6"/>';

    // Head. Face, then hair, crown, jhalar, features.
    var crownTop = '';
    if (!g.bun && !g.wild) {
      crownTop =
        '<path d="M82.5 51 L84 37 L89.5 43 L94 27 L100 15 L106 27 L110.5 43 L116 37 L117.5 51 Z" fill="url(#' + GD + ')" stroke="' + GOLD_D + '" stroke-width=".7"/>' +
        '<path d="M83 47.5 Q100 44 117 47.5" stroke="#b91c1c" stroke-width="1.2" fill="none" stroke-dasharray="1.4 1.6"/>' +
        '<circle cx="100" cy="36" r="3.4" fill="#dc2626" stroke="#fde68a" stroke-width=".8"/><circle cx="90" cy="44" r="1.7" fill="#16a34a"/><circle cx="110" cy="44" r="1.7" fill="#16a34a"/>' +
        '<circle cx="100" cy="17" r="2" fill="#fef3c7"/>' +
        (g.moon ? '<path d="M93 24 a 8 8 0 0 0 14 0 a 6.5 6.5 0 0 1 -14 0 Z" fill="#f8fafc" stroke="#cbd5e1" stroke-width=".5"/>' : '');
      for (var jx = 85.5; jx <= 114.6; jx += 3.6) {
        crownTop += '<line x1="' + r1(jx) + '" y1="51" x2="' + r1(jx) + '" y2="' + (Math.abs(jx - 100) < 6 ? 54.6 : 53.4) + '" stroke="url(#' + GD + ')" stroke-width=".6"/><circle cx="' + r1(jx) + '" cy="' + (Math.abs(jx - 100) < 6 ? 55.2 : 54) + '" r=".9" fill="#fffdf5" stroke="#e5e0d0" stroke-width=".25"/>';
      }
    }
    var bun = g.bun
      ? '<circle cx="100" cy="42" r="8.5" fill="#1d1310"/>' +
        [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) { var rr = a * Math.PI / 180; return '<circle cx="' + r1(100 + Math.cos(rr) * 8.6) + '" cy="' + r1(42 + Math.sin(rr) * 8.6) + '" r="1.5" fill="#fffdf5"/>'; }).join('')
      : '';
    var wildFront = g.wild ? '<path d="M84 60 l -6 -4 l 5 -1 l -4 -6 l 6 2 l -1 -6 l 6 4 l 2 -6 l 4 5 l 4 -6 l 3 6 l 5 -5 l 1 6 l 6 -4 l -2 6 l 6 0 l -4 5 l 6 3 l -6 2" fill="#120d14"/>' : '';
    var eye = function (cx) {
      return '<path d="M' + (cx - 6) + ' 66 Q' + cx + ' 60.6 ' + (cx + 6) + ' 66 Q' + cx + ' 69.6 ' + (cx - 6) + ' 66 Z" fill="#fffdf8"/>' +
        '<circle cx="' + cx + '" cy="65.5" r="2.7" fill="' + (g.dark ? '#7a1d1d' : '#4a2a14') + '"/><circle cx="' + cx + '" cy="65.5" r="1.25" fill="#0b0705"/>' +
        '<circle cx="' + r1(cx - .9) + '" cy="64.6" r=".8" fill="#fff"/>' +
        '<path d="M' + (cx - 6.4) + ' 66.2 Q' + cx + ' 60.2 ' + (cx + 6.4) + ' 65.6" stroke="#120a06" stroke-width="1.15" fill="none" stroke-linecap="round"/>';
    };
    var face =
      '<ellipse cx="100" cy="68" rx="15.5" ry="18.5" fill="url(#' + id + 's)"/>' +
      (g.wild ? '' : '<path d="M84.5 67 Q84 46 100 45 Q116 46 115.5 67 Q112 54 100 52.5 Q88 54 84.5 67 Z" fill="#1d1310"/>') + wildFront +
      '<line x1="100" y1="45.5" x2="100" y2="53" stroke="#dc2626" stroke-width="1.6" stroke-linecap="round"/>' +
      bun + crownTop +
      '<path d="M100 55.8 Q101.7 58.4 100 61 Q98.3 58.4 100 55.8 Z" fill="#fff4e6" stroke="#b91c1c" stroke-width=".8"/><circle cx="100" cy="58.4" r=".7" fill="#b91c1c"/>' +
      '<path d="M87.6 61.2 Q92.6 58.4 97.4 60.8 M102.6 60.8 Q107.4 58.4 112.4 61.2" stroke="#2b1a12" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
      eye(93) + eye(107) +
      '<path d="M99.4 72 L94.6 70.2 M100.6 72 L105.4 70.2" stroke="none"/>' +
      '<path d="M86.8 66 L84.6 64.6 M113.2 66 L115.4 64.6" stroke="#120a06" stroke-width="1" stroke-linecap="round"/>' +
      '<ellipse cx="90" cy="73" rx="3.6" ry="2.1" fill="#f472b6" opacity=".33"/><ellipse cx="110" cy="73" rx="3.6" ry="2.1" fill="#f472b6" opacity=".33"/>' +
      '<path d="M100 67 Q99.2 72 97.6 73.6 Q100 75 102.4 73.6" stroke="' + skin[1] + '" stroke-width=".9" fill="none"/>' +
      '<path d="M95.6 79 Q100 77.1 104.4 79 Q100 82.6 95.6 79 Z" fill="#c2185b"/><path d="M95.6 79 Q100 79.8 104.4 79" stroke="#8a1040" stroke-width=".5" fill="none"/>' +
      // nath with its chain to the ear
      '<circle cx="96.6" cy="74.6" r="3.2" fill="none" stroke="url(#' + GD + ')" stroke-width="1"/><circle cx="96.6" cy="77.8" r=".95" fill="#fffdf5"/><circle cx="94" cy="74" r=".7" fill="#dc2626"/>' +
      '<path d="M93.5 73.6 Q88 72 85 70" stroke="url(#' + GD + ')" stroke-width=".55" fill="none" stroke-dasharray=".1 1.2" stroke-linecap="round"/>' +
      // jhumkas
      jhumka(84.4, GD) + jhumka(115.6, GD);

    var full = crop !== 'face';
    return '<svg class="fest-durga fest-anim" viewBox="' + view + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + defs +
      halo +
      (full ? backHair + backArms + body + necklaces + frontArms + baby + vahana(g.vahana, id) : backHair) +
      face + (full ? '' : necklaces) +
      '</svg>';
  }
  function jhumka(x, GD) {
    return '<circle cx="' + x + '" cy="72" r="1.5" fill="url(#' + GD + ')"/>' +
      '<path d="M' + (x - 3.2) + ' 78.6 Q' + x + ' 72.6 ' + (x + 3.2) + ' 78.6 Z" fill="url(#' + GD + ')"/>' +
      '<circle cx="' + (x - 2.4) + '" cy="79.6" r=".75" fill="#fffdf5"/><circle cx="' + x + '" cy="80" r=".75" fill="#fffdf5"/><circle cx="' + (x + 2.4) + '" cy="79.6" r=".75" fill="#fffdf5"/>';
  }

  // ── Dandiya couple ──────────────────────────────────────────────────────
  function coupleSVG(st) {
    var id = nid('fc');
    var ghagra = st && st.pal ? st.pal.saree : '#e11d48';
    var ghagraD = st && st.pal ? st.pal.sareeDeep : '#9f1239';
    if (st && st.colour === 'White') { ghagra = '#e11d48'; ghagraD = '#9f1239'; }
    var skin = 'url(#' + id + 's)';
    var stick = function (x1, y1, x2, y2) {
      return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#b45309" stroke-width="2.6" stroke-linecap="round"/>' +
        '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#fde047" stroke-width="2.6" stroke-dasharray="2 3" stroke-linecap="butt"/>';
    };
    return '<svg class="fest-couple fest-anim" viewBox="0 0 170 168" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' +
      '<radialGradient id="' + id + 's" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#f6c9a0"/><stop offset="1" stop-color="#d28c5e"/></radialGradient>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + ghagra + '"/><stop offset="1" stop-color="' + ghagraD + '"/></linearGradient>' +
      '</defs>' +
      '<ellipse cx="85" cy="160" rx="66" ry="5" fill="#000" opacity=".12"/>' +
      // ── girl ──
      '<g class="fc-bounce">' +
        '<g class="fc-arm fc-arm-a" style="transform-origin:46px 58px">' +
          '<path d="M46 58 L37 47 L35 35" stroke="' + skin + '" stroke-width="4.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<circle cx="35.6" cy="39" r="2.4" fill="none" stroke="#fbbf24" stroke-width="1.2"/>' + stick(35, 36, 27, 20) + '</g>' +
        '<path d="M50 32 Q42 50 46 72" stroke="#1d1310" stroke-width="4.6" fill="none" stroke-linecap="round"/><circle cx="46" cy="73" r="2" fill="#e11d48"/>' +
        '<g class="fc-skirt" style="transform-origin:52px 76px">' +
          '<path d="M44 76 L60 76 Q74 108 81 136 Q52 145 23 136 Q30 108 44 76 Z" fill="url(#' + id + 'g)"/>' +
          '<path d="M26 128 Q52 137 78 128" stroke="#fbbf24" stroke-width="3.2" fill="none"/>' +
          '<path d="M24.5 133 Q52 142 79.5 133" stroke="#16a34a" stroke-width="2" fill="none"/>' +
          '<path d="M33 106 Q52 112 71 106" stroke="#fbbf24" stroke-width="1.6" fill="none" stroke-dasharray="1.6 2.2"/>' +
          '<path d="M52 78 L52 140 M46 80 L36 138 M58 80 L68 138" stroke="' + ghagraD + '" stroke-width=".8" opacity=".55"/>' +
        '</g>' +
        '<path d="M44 140 l -5 4 h 8 z M58 140 l 0 4 h 7 z" fill="#7f1d1d"/>' +
        '<rect x="46" y="68" width="12" height="8" fill="' + skin + '"/>' +
        '<path d="M45 56 Q52 52.5 59 56 L58.4 69 L45.6 69 Z" fill="#16a34a"/><path d="M45.6 69 L58.4 69" stroke="#fbbf24" stroke-width="1.4"/>' +
        '<path d="M58 57 Q67 72 62 96 L57 93 Q60 74 54 60 Z" fill="#facc15" opacity=".92"/><path d="M58 57 Q67 72 62 96" stroke="#e11d48" stroke-width=".9" fill="none" stroke-dasharray="1 1.4"/>' +
        '<rect x="49.5" y="47" width="5" height="6" fill="' + skin + '"/>' +
        '<circle cx="52" cy="40" r="9.5" fill="' + skin + '"/>' +
        '<path d="M42.6 40 Q42 29 52 29 Q62 29 61.4 40 Q58 33 52 33 Q46 33 42.6 40 Z" fill="#1d1310"/>' +
        '<path d="M52 33 v 3" stroke="#dc2626" stroke-width="1"/><circle cx="52" cy="37.5" r="1.1" fill="#dc2626"/>' +
        '<path d="M47 41.5 q 2 -1.6 4 0 M53 41.5 q 2 -1.6 4 0" stroke="#2b1a12" stroke-width=".9" fill="none" stroke-linecap="round"/>' +
        '<path d="M49.5 45 q 2.5 2.2 5 0" stroke="#be185d" stroke-width="1" fill="none" stroke-linecap="round"/>' +
        '<circle cx="47.2" cy="44" r="1.6" fill="#f472b6" opacity=".35"/><circle cx="56.8" cy="44" r="1.6" fill="#f472b6" opacity=".35"/>' +
        '<circle cx="42.6" cy="44" r="1.3" fill="#fbbf24"/><circle cx="61.4" cy="44" r="1.3" fill="#fbbf24"/>' +
        '<g class="fc-arm fc-arm-b" style="transform-origin:58px 58px">' +
          '<path d="M58 58 L70 55 L79 47" stroke="' + skin + '" stroke-width="4.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<circle cx="76.4" cy="49.6" r="2.4" fill="none" stroke="#fbbf24" stroke-width="1.2"/>' + stick(79, 48, 90, 32) + '</g>' +
      '</g>' +
      // ── boy ──
      '<g class="fc-bounce fc-bounce-2">' +
        '<g class="fc-arm fc-arm-c" style="transform-origin:126px 54px">' +
          '<path d="M126 54 L136 44 L138 32" stroke="' + skin + '" stroke-width="4.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' + stick(138, 33, 147, 17) + '</g>' +
        '<path d="M111 94 L114 140 L119 140 L119 98 Z M123 98 L122 140 L127 140 L130 94 Z" fill="#7f1d1d"/>' +
        '<path d="M110 140 h 10 v 4 h -12 z M121 140 h 10 l 2 4 h -12 z" fill="#78350f"/>' +
        '<g class="fc-skirt fc-skirt-2" style="transform-origin:118px 78px">' +
          '<path d="M108 52 Q118 48 128 52 L130 78 Q139 87 142 98 Q118 104 94 98 Q97 87 106 78 Z" fill="#fff8ee" stroke="#e7d8c0" stroke-width=".8"/>' +
          '<path d="M106 78 L130 78" stroke="#e11d48" stroke-width="3" stroke-dasharray="2 1.4"/>' +
          '<path d="M95 97 Q118 103 141 97" stroke="' + ghagra + '" stroke-width="3" fill="none"/>' +
          '<path d="M110 80 L102 98 M118 80 L118 101 M126 80 L134 98" stroke="#e7d8c0" stroke-width=".9"/>' +
        '</g>' +
        '<path d="M113 52 Q118 60 123 52" stroke="#e11d48" stroke-width="1.2" fill="none"/>' +
        '<rect x="115.5" y="43" width="5" height="7" fill="' + skin + '"/>' +
        '<circle cx="118" cy="36" r="9.5" fill="' + skin + '"/>' +
        '<path d="M108.4 34 Q108 20 118 20 Q129 20 128.4 34 Q118 28 108.4 34 Z" fill="#e11d48"/>' +
        '<path d="M110 30 Q118 25 127 30 M109 26 Q118 21 127.5 26" stroke="#fbbf24" stroke-width="1.1" fill="none"/>' +
        '<path d="M111 24 h .1 M115 22.4 h .1 M120 22.4 h .1 M124 24 h .1 M113 28 h .1 M122 28 h .1" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' +
        '<path d="M127 30 Q140 32 137 50" stroke="#e11d48" stroke-width="3.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M118 20 q 2 -8 7 -10" stroke="#16a34a" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        '<path d="M113 37.5 q 2 -1.6 4 0 M119 37.5 q 2 -1.6 4 0" stroke="#2b1a12" stroke-width=".9" fill="none" stroke-linecap="round"/>' +
        '<path d="M114 41.2 q 4 -1.6 8 0" stroke="#2b1a12" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M115.6 43.4 q 2.4 1.6 4.8 0" stroke="#9f1239" stroke-width=".9" fill="none" stroke-linecap="round"/>' +
        '<g class="fc-arm fc-arm-d" style="transform-origin:110px 55px">' +
          '<path d="M110 55 L99 51 L90 45" stroke="' + skin + '" stroke-width="4.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' + stick(90, 46, 81, 30) + '</g>' +
      '</g></svg>';
  }

  // ── Shri Ram, bow drawn, facing right ───────────────────────────────────
  var STRING_DRAWN = 'M124 26 L84 75 L124 124';
  var STRING_SLACK = 'M124 26 Q126 75 124 124';
  function ramSVG() {
    var id = nid('fr');
    return '<svg class="fest-ram fest-anim" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + 'b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b8ff0"/><stop offset="1" stop-color="#2a4fae"/></linearGradient>' +
      '<linearGradient id="' + id + 'y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#e0a40c"/></linearGradient>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#b8860b"/></linearGradient>' +
      '</defs>' +
      '<ellipse cx="72" cy="194" rx="42" ry="4.5" fill="#000" opacity=".14"/>' +
      // quiver on his back
      '<g transform="rotate(-24 50 78)"><rect x="43" y="52" width="13" height="48" rx="4" fill="#7c4a1e" stroke="url(#' + id + 'g)" stroke-width="1.4"/>' +
      '<path d="M45 52 l -1 -9 l 3 4 l 1 -7 l 3 6 l 2 -8 l 2 8 l 3 -5 l -1 11 z" fill="#dc2626"/></g>' +
      '<path d="M58 40 Q50 70 56 92 L84 92 Q90 70 82 40 Z" fill="#1b1410"/>' +
      // legs and pitambar
      '<path d="M60 160 L58 186 L66 186 L68 162 Z M76 162 L78 186 L86 186 L84 160 Z" fill="url(#' + id + 'b)"/>' +
      '<path d="M55 188 h 12 v -3 h -12 z M77 188 h 12 v -3 h -12 z" fill="url(#' + id + 'b)"/>' +
      '<path d="M52 104 Q70 99 90 104 L96 160 Q83 169 72 158 Q60 169 46 160 Z" fill="url(#' + id + 'y)"/>' +
      '<path d="M72 106 L72 158 M64 106 L58 160 M80 106 L86 160" stroke="#c8900a" stroke-width=".9" opacity=".7"/>' +
      '<path d="M47 158 Q60 166 72 157 Q83 166 95 158" stroke="#b91c1c" stroke-width="2" fill="none"/>' +
      '<rect x="51" y="101" width="40" height="6" rx="2" fill="#ea580c"/><path d="M84 107 q 4 14 -2 26" stroke="#ea580c" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      // torso
      '<path d="M52 66 Q70 59 90 66 L88 104 L54 104 Z" fill="url(#' + id + 'b)"/>' +
      '<path d="M56 66 L86 103" stroke="#fffdf5" stroke-width="1.1"/>' +
      '<path d="M58 68 Q71 80 84 68" stroke="url(#' + id + 'g)" stroke-width="2" fill="none"/>' +
      '<path d="M55 68 Q71 108 87 68" stroke="#f472b6" stroke-width="2.4" fill="none" stroke-dasharray=".1 3" stroke-linecap="round"/>' +
      // drawing arm (behind the string)
      '<path d="M55 71 L60 88 L84 76" stroke="url(#' + id + 'b)" stroke-width="6.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="84" cy="76" r="3.8" fill="url(#' + id + 'b)"/>' +
      '<rect x="66" y="56" width="9" height="11" fill="url(#' + id + 'b)"/>' +
      // head
      '<circle cx="71" cy="47" r="12.5" fill="url(#' + id + 'b)"/>' +
      '<path d="M58.5 46 Q58 33 71 33 Q84 33 83.5 46 Q78 38 71 38 Q64 38 58.5 46 Z" fill="#1b1410"/>' +
      '<path d="M58 46 q -4 8 -1 16 M60 48 q -3 7 0 14" stroke="#1b1410" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M60 37 L61 23 L66 29 L71 13 L76 29 L81 23 L82 37 Z" fill="url(#' + id + 'g)" stroke="#9a6f0c" stroke-width=".7"/>' +
      '<circle cx="71" cy="27" r="2.6" fill="#dc2626"/><path d="M61 34.5 Q71 31.5 81 34.5" stroke="#16a34a" stroke-width="1.2" stroke-dasharray="1.4 1.4" fill="none"/>' +
      '<path d="M69 39.5 L69 44 Q71 45.6 73 44 L73 39.5" stroke="#fffdf5" stroke-width="1.1" fill="none"/><line x1="71" y1="40" x2="71" y2="44.4" stroke="#dc2626" stroke-width=".9"/>' +
      '<path d="M64 47.6 Q67 45.2 70 47.6 Q67 49.2 64 47.6 Z M72.6 47.6 Q75.6 45.2 78.6 47.6 Q75.6 49.2 72.6 47.6 Z" fill="#fffdf8"/>' +
      '<circle cx="68" cy="47.5" r="1.25" fill="#120a06"/><circle cx="76.6" cy="47.5" r="1.25" fill="#120a06"/>' +
      '<path d="M68 53.6 q 3 1.8 6 0" stroke="#7f1d1d" stroke-width="1" fill="none" stroke-linecap="round"/>' +
      '<circle cx="59" cy="51" r="2" fill="url(#' + id + 'g)"/><circle cx="83" cy="51" r="2" fill="url(#' + id + 'g)"/>' +
      // bow arm, bow, string, nocked arrow
      '<path d="M88 70 L110 72 L133 75" stroke="url(#' + id + 'b)" stroke-width="6.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="104" cy="71.5" r="3.6" fill="none" stroke="url(#' + id + 'g)" stroke-width="1.6"/>' +
      '<path d="M124 26 Q146 75 124 124" stroke="#7c3a10" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
      '<circle cx="124" cy="26" r="1.8" fill="url(#' + id + 'g)"/><circle cx="124" cy="124" r="1.8" fill="url(#' + id + 'g)"/>' +
      '<path class="fr-string" d="' + STRING_DRAWN + '" stroke="#f5f0e1" stroke-width=".9" fill="none"/>' +
      '<g class="fr-nock"><line x1="84" y1="75" x2="150" y2="75" stroke="#78350f" stroke-width="1.7"/>' +
      '<path d="M150 72 L157 75 L150 78 Z" fill="#cbd5e1" stroke="#64748b" stroke-width=".5"/>' +
      '<path d="M84 75 l 6 -4 h 5 l -5 4 z M84 75 l 6 4 h 5 l -5 -4 z" fill="#dc2626"/></g>' +
      '<circle cx="133" cy="75" r="3.8" fill="url(#' + id + 'b)"/>' +
      '</svg>';
  }
  function flyingArrowSVG() {
    return '<svg class="fest-flyarrow" width="74" height="12" viewBox="0 0 74 12" aria-hidden="true">' +
      '<line x1="2" y1="6" x2="66" y2="6" stroke="#78350f" stroke-width="1.8"/>' +
      '<path d="M65 2.5 L73 6 L65 9.5 Z" fill="#e2e8f0" stroke="#64748b" stroke-width=".6"/>' +
      '<path d="M2 6 l 7 -4.5 h 5 l -6 4.5 z M2 6 l 7 4.5 h 5 l -6 -4.5 z" fill="#dc2626"/>' +
      '<path d="M60 6 L66 6" stroke="#fbbf24" stroke-width="3" opacity=".7"/></svg>';
  }

  // ── Ravan putla on a bamboo stand ───────────────────────────────────────
  function ravanSVG() {
    var id = nid('fv');
    var heads = '';
    var xs = [18, 32, 46, 60, 74, 148, 134, 120, 106]; // nine side heads, outermost first
    xs.forEach(function (x) { heads += ravanHead(x, 60, 7.8, id); });
    heads += ravanHead(90, 57, 12.5, id);
    var flame = function (x, y, h, w) {
      var outer = 'M' + x + ' ' + y + ' C' + (x - w) + ' ' + y + ' ' + (x - w * .8) + ' ' + (y - h * .5) + ' ' + x + ' ' + (y - h) +
        ' C' + (x + w * .8) + ' ' + (y - h * .5) + ' ' + (x + w) + ' ' + y + ' ' + x + ' ' + y + ' Z';
      var ih = h * .58, iw = w * .55;
      var inner = 'M' + x + ' ' + y + ' C' + (x - iw) + ' ' + y + ' ' + (x - iw * .8) + ' ' + (y - ih * .5) + ' ' + x + ' ' + (y - ih) +
        ' C' + (x + iw * .8) + ' ' + (y - ih * .5) + ' ' + (x + iw) + ' ' + y + ' ' + x + ' ' + y + ' Z';
      return '<path class="fv-flick" d="' + outer + '" fill="#f97316"/><path class="fv-flick fv-flick-2" d="' + inner + '" fill="#fde047"/>';
    };
    var fire = '<g class="fv-fire">' +
      flame(40, 128, 40, 13) + flame(64, 122, 54, 15) + flame(90, 132, 72, 19) + flame(116, 122, 54, 15) + flame(140, 128, 42, 13) +
      flame(28, 74, 30, 10) + flame(60, 72, 34, 11) + flame(90, 62, 42, 13) + flame(120, 72, 34, 11) + flame(150, 74, 30, 10) +
      flame(70, 176, 34, 12) + flame(110, 176, 34, 12) + '</g>';
    return '<svg class="fest-ravan fest-anim" viewBox="0 0 180 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset=".5" stop-color="#e0ac1c"/><stop offset="1" stop-color="#9a6f0c"/></linearGradient>' +
      '<pattern id="' + id + 'p" width="18" height="10" patternUnits="userSpaceOnUse"><rect width="6" height="10" fill="#b91c1c"/><rect x="6" width="6" height="10" fill="#facc15"/><rect x="12" width="6" height="10" fill="#15803d"/></pattern>' +
      '<pattern id="' + id + 'k" width="8" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 Q4 0 8 6" fill="none" stroke="#9a6f0c" stroke-width=".8"/></pattern>' +
      '</defs>' +
      '<ellipse cx="90" cy="236" rx="56" ry="4" fill="#000" opacity=".16"/>' +
      // bamboo stand
      '<g stroke="#b7862b" stroke-width="3" stroke-linecap="round"><line x1="72" y1="176" x2="66" y2="234"/><line x1="108" y1="176" x2="114" y2="234"/>' +
      '<line x1="68" y1="200" x2="112" y2="200"/><line x1="66" y1="228" x2="114" y2="228"/><line x1="70" y1="202" x2="112" y2="226"/><line x1="110" y1="202" x2="68" y2="226"/></g>' +
      '<g stroke="#8a6420" stroke-width=".8" opacity=".7"><line x1="69" y1="190" x2="75" y2="190"/><line x1="105" y1="190" x2="111" y2="190"/><line x1="67" y1="214" x2="73" y2="214"/><line x1="107" y1="214" x2="113" y2="214"/></g>' +
      '<g class="fv-shake"><g class="fv-body">' +
        // skirt
        '<path d="M56 128 L124 128 L134 180 L46 180 Z" fill="url(#' + id + 'p)"/>' +
        '<path d="M46 180 L134 180" stroke="url(#' + id + 'g)" stroke-width="4"/><path d="M56 128 L124 128" stroke="url(#' + id + 'g)" stroke-width="3"/>' +
        // arms: shield on the left, sword raised on the right
        '<path d="M60 88 L44 104 L40 114" stroke="#d99a62" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="34" cy="116" r="16" fill="#7f1d1d" stroke="url(#' + id + 'g)" stroke-width="2.6"/><circle cx="34" cy="116" r="10" fill="none" stroke="url(#' + id + 'g)" stroke-width="1" stroke-dasharray="1.6 1.6"/>' +
        '<circle cx="34" cy="116" r="3.4" fill="url(#' + id + 'g)"/><circle cx="34" cy="106" r="1.5" fill="url(#' + id + 'g)"/><circle cx="34" cy="126" r="1.5" fill="url(#' + id + 'g)"/><circle cx="24" cy="116" r="1.5" fill="url(#' + id + 'g)"/><circle cx="44" cy="116" r="1.5" fill="url(#' + id + 'g)"/>' +
        '<path d="M150 74 L154 22 L158 14 L161 22 L157 74 Z" fill="#e5e7eb" stroke="#6b7280" stroke-width=".7"/>' +
        '<rect x="146" y="73" width="15" height="3.4" rx="1.4" fill="url(#' + id + 'g)"/><rect x="151.6" y="76" width="3.6" height="9" fill="#5b2a0c"/>' +
        '<path d="M120 88 L140 98 L153 82" stroke="#d99a62" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        // armoured torso
        '<path class="fv-chest" d="M58 80 Q90 72 122 80 L120 130 L60 130 Z" fill="url(#' + id + 'g)"/>' +
        '<path d="M58 80 Q90 72 122 80 L120 130 L60 130 Z" fill="url(#' + id + 'k)" opacity=".7"/>' +
        '<circle cx="90" cy="102" r="10" fill="#9a6f0c" stroke="#fde68a" stroke-width="1.4"/><circle cx="90" cy="102" r="4" fill="#dc2626"/>' +
        '<rect x="60" y="122" width="60" height="7" fill="#b91c1c" stroke="url(#' + id + 'g)" stroke-width="1"/>' +
        '<ellipse cx="60" cy="84" rx="9" ry="6" fill="url(#' + id + 'g)" stroke="#9a6f0c" stroke-width=".7"/><ellipse cx="120" cy="84" rx="9" ry="6" fill="url(#' + id + 'g)" stroke="#9a6f0c" stroke-width=".7"/>' +
        '<path d="M72 74 Q90 80 108 74" stroke="url(#' + id + 'g)" stroke-width="4" fill="none"/>' +
        heads + fire +
      '</g></g></svg>';
  }
  function ravanHead(x, y, r, id) {
    var s = r / 10;
    var fill = r > 10 ? '#e9a46e' : '#efb07e';
    return '<g>' +
      '<path d="M' + r1(x - 8.5 * s) + ' ' + r1(y - 7 * s) + ' L' + r1(x - 7 * s) + ' ' + r1(y - 19 * s) + ' L' + r1(x - 3 * s) + ' ' + r1(y - 13 * s) + ' L' + x + ' ' + r1(y - 23 * s) + ' L' + r1(x + 3 * s) + ' ' + r1(y - 13 * s) + ' L' + r1(x + 7 * s) + ' ' + r1(y - 19 * s) + ' L' + r1(x + 8.5 * s) + ' ' + r1(y - 7 * s) + ' Z" fill="url(#' + id + 'g)" stroke="#9a6f0c" stroke-width=".5"/>' +
      '<circle cx="' + x + '" cy="' + r1(y - 13.5 * s) + '" r="' + r1(1.8 * s) + '" fill="#dc2626"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '" stroke="#b36b3a" stroke-width=".5"/>' +
      '<path d="M' + r1(x - 6.5 * s) + ' ' + r1(y - 4.6 * s) + ' L' + r1(x - 1.6 * s) + ' ' + r1(y - 2.6 * s) + ' M' + r1(x + 6.5 * s) + ' ' + r1(y - 4.6 * s) + ' L' + r1(x + 1.6 * s) + ' ' + r1(y - 2.6 * s) + '" stroke="#1c1917" stroke-width="' + r1(1.3 * s) + '" stroke-linecap="round"/>' +
      '<ellipse cx="' + r1(x - 3.8 * s) + '" cy="' + r1(y - .6 * s) + '" rx="' + r1(2.4 * s) + '" ry="' + r1(1.7 * s) + '" fill="#fff"/><ellipse cx="' + r1(x + 3.8 * s) + '" cy="' + r1(y - .6 * s) + '" rx="' + r1(2.4 * s) + '" ry="' + r1(1.7 * s) + '" fill="#fff"/>' +
      '<circle cx="' + r1(x - 3.6 * s) + '" cy="' + r1(y - .5 * s) + '" r="' + r1(1 * s) + '" fill="#111"/><circle cx="' + r1(x + 3.6 * s) + '" cy="' + r1(y - .5 * s) + '" r="' + r1(1 * s) + '" fill="#111"/>' +
      '<path d="M' + x + ' ' + r1(y + 3.4 * s) + ' Q' + r1(x - 4 * s) + ' ' + r1(y + 2 * s) + ' ' + r1(x - 7 * s) + ' ' + r1(y + 4.6 * s) + ' q ' + r1(-1.6 * s) + ' ' + r1(-2.8 * s) + ' ' + r1(.6 * s) + ' ' + r1(-3.4 * s) +
        ' M' + x + ' ' + r1(y + 3.4 * s) + ' Q' + r1(x + 4 * s) + ' ' + r1(y + 2 * s) + ' ' + r1(x + 7 * s) + ' ' + r1(y + 4.6 * s) + ' q ' + r1(1.6 * s) + ' ' + r1(-2.8 * s) + ' ' + r1(-.6 * s) + ' ' + r1(-3.4 * s) + '" stroke="#1c1917" stroke-width="' + r1(1.5 * s) + '" fill="none" stroke-linecap="round"/>' +
      '<path d="M' + r1(x - 2.4 * s) + ' ' + r1(y + 6.6 * s) + ' Q' + x + ' ' + r1(y + 8 * s) + ' ' + r1(x + 2.4 * s) + ' ' + r1(y + 6.6 * s) + '" stroke="#991b1b" stroke-width="' + r1(1.2 * s) + '" fill="none"/>' +
      '</g>';
  }

  function bowOrbSVG() {
    return '<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M20 8 Q46 30 20 52" stroke="#fde68a" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
      '<line x1="20" y1="8" x2="20" y2="52" stroke="#fff7ed" stroke-width="1"/><line x1="12" y1="30" x2="52" y2="30" stroke="#fde68a" stroke-width="2"/>' +
      '<path d="M50 26 L57 30 L50 34 Z" fill="#fff7ed"/><path d="M12 30 l 5 -4 h 4 l -5 4 z M12 30 l 5 4 h 4 l -5 -4 z" fill="#fca5a5"/></svg>';
  }

  // Toran tile: string, marigold, mango leaf — repeated across as a background.
  function toranURI() {
    var petals = '';
    for (var i = 0; i < 10; i++) {
      var a = i / 10 * Math.PI * 2;
      petals += '<circle cx="' + r1(14 + Math.cos(a) * 5) + '" cy="' + r1(16 + Math.sin(a) * 5) + '" r="2.7" fill="#f97316"/>';
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="34" viewBox="0 0 56 34">' +
      '<path d="M0 4 Q28 9 56 4" stroke="#8a5a1a" stroke-width="1.4" fill="none"/>' +
      '<line x1="14" y1="6" x2="14" y2="10" stroke="#8a5a1a" stroke-width=".8"/>' + petals +
      '<circle cx="14" cy="16" r="4.2" fill="#f59e0b"/><circle cx="14" cy="16" r="2" fill="#fbbf24"/>' +
      '<path d="M42 6 C35 13 37 24 42 31 C47 24 49 13 42 6 Z" fill="#2f8f3a"/><path d="M42 7 L42 30" stroke="#1d6a27" stroke-width=".7"/>' +
      '<circle cx="28" cy="7.4" r="1.6" fill="#dc2626"/></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Styles
  // ═════════════════════════════════════════════════════════════════════════
  var DEVA = "'Nirmala UI','Noto Sans Devanagari','Mangal','Kohinoor Devanagari',Inter,system-ui,sans-serif";
  function baseCSS() {
    return '' +
      '@keyframes fest-spin{to{transform:rotate(360deg)}}' +
      '.fd-halo{transform-box:view-box;transform-origin:100px 64px;animation:fest-spin 60s linear infinite}' +
      '.fd-chakra{transform-box:view-box;animation:fest-spin 6s linear infinite}' +
      '.fest-durga,.fest-couple,.fest-ram,.fest-ravan{display:block;width:100%;height:auto;overflow:visible}' +

      // dandiya
      '@keyframes fc-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}' +
      '@keyframes fc-swing{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(14deg)}}' +
      '@keyframes fc-swing2{0%,100%{transform:rotate(14deg)}50%{transform:rotate(-12deg)}}' +
      '@keyframes fc-sway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}' +
      '.fc-bounce{animation:fc-bounce .9s ease-in-out infinite}.fc-bounce-2{animation-delay:-.45s}' +
      '.fc-arm{transform-box:view-box;animation:fc-swing .9s ease-in-out infinite}' +
      '.fc-arm-b,.fc-arm-c{animation-name:fc-swing2}' +
      '.fc-skirt{transform-box:view-box;animation:fc-sway 1.8s ease-in-out infinite}.fc-skirt-2{animation-duration:1.4s;animation-delay:-.7s}' +

      // ravan
      '@keyframes fv-flick{0%,100%{transform:scaleY(1) skewX(0)}33%{transform:scaleY(1.12) skewX(-3deg)}66%{transform:scaleY(.92) skewX(3deg)}}' +
      '@keyframes fv-shake{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(-2px,0) rotate(-1deg)}75%{transform:translate(2px,0) rotate(1deg)}}' +
      '.fv-fire{opacity:0;transition:opacity .45s}.fv-flick{transform-box:fill-box;transform-origin:50% 100%;animation:fv-flick .5s ease-in-out infinite}.fv-flick-2{animation-duration:.36s}' +
      '.fv-body,.fv-shake{transform-box:view-box;transform-origin:90px 180px}' +
      '.fr-burning .fv-fire{opacity:1}.fr-burning .fv-shake{animation:fv-shake .16s linear infinite}' +
      '.fest-flyarrow{position:fixed;left:0;top:0;z-index:66;pointer-events:none;will-change:transform;transform-origin:37px 6px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))}' +

      // corner stickers
      '.fest-corner{position:fixed;bottom:10px;z-index:35;pointer-events:none;transition:opacity .22s ease;' +
        'filter:drop-shadow(1.6px 0 0 #fff) drop-shadow(-1.6px 0 0 #fff) drop-shadow(0 1.6px 0 #fff) drop-shadow(0 -1.6px 0 #fff) drop-shadow(0 6px 10px rgba(0,0,0,.18))}' +
      '.fest-corner-l{left:242px;width:150px}.fest-corner-r{right:14px;width:150px}' +
      '.fest-corner-ram{width:124px}.fest-corner-ravan{width:132px}' +
      '@media (min-width:1024px){.fest-corner-l{left:78px}}' +
      '@media (max-width:767px){.fest-corner{display:none}}' +
      '.fest-tag{display:table;margin:0 auto 4px;padding:3px 10px;border-radius:999px;background:#fff;color:rgb(var(--c-primary-700));' +
        'font:600 12px/1.4 ' + DEVA + ';box-shadow:0 1px 3px rgba(0,0,0,.12);white-space:nowrap}' +

      // dashboard
      '.fest-dash{position:relative}' +
      '.fest-dash-full{padding-top:30px}@media (min-width:768px){.fest-dash-full{padding-top:40px;padding-bottom:230px}}' +
      '.fest-band{position:absolute;left:0;right:0;top:-14px;height:300px;pointer-events:none;z-index:5;' +
        '-webkit-mask-image:linear-gradient(#000 55%,transparent);mask-image:linear-gradient(#000 55%,transparent)}' +
      '.fest-band canvas{position:absolute;inset:0;width:100%;height:100%}' +
      '.fest-toran{position:absolute;left:0;right:0;top:0;height:34px;background-repeat:repeat-x;background-size:56px 34px}' +
      '@media (max-width:767px){.fest-band{top:-10px}}' +
      '.fest-banner{display:none}' +
      // The banner is phone-only; on desktop it must not push the header down via space-y.
      '@media (min-width:768px){.fest-dash>.fest-banner+*{margin-top:0!important}}' +
      '@media (max-width:767px){.fest-banner{display:flex;align-items:center;gap:10px;position:relative;overflow:hidden;padding:12px;' +
        'background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 1px 2px rgba(9,9,11,.04)}' +
        '.fest-banner:before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,#f59e0b,rgb(var(--c-fest,234 88 12)),#16a34a)}}' +
      '.fest-banner-portrait{flex:none;width:42px;height:42px;border-radius:999px;overflow:hidden;box-shadow:0 0 0 2px #fff,0 0 0 3.5px rgb(var(--c-fest,234 88 12))}' +
      '.fest-banner-portrait svg{width:100%;height:100%}' +
      '.fest-banner-orb{flex:none;display:grid;place-items:center;width:42px;height:42px;border-radius:999px;background:#fff7ed;font-size:20px}' +
      '.fest-banner-text{flex:1;min-width:0;line-height:1.3}' +
      '.fest-banner-t{font:700 15px/1.3 ' + DEVA + ';color:rgb(var(--c-primary-700))}' +
      '.fest-banner-s{font:500 12px/1.4 ' + DEVA + ';color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.fest-scene{display:none}' +
      '@media (max-width:767px){.fest-scene{display:block;padding:18px 8px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;text-align:center}}' +
      '.fest-scene-row{display:flex;align-items:flex-end;justify-content:center;gap:2px}' +
      '.fest-scene-side{width:27%;max-width:110px}.fest-scene-mid{width:42%;max-width:170px}' +
      '.fest-scene-cap{margin-top:8px;font:700 16px/1.4 ' + DEVA + ';color:rgb(var(--c-primary-700))}' +

      // topbar pill
      '.fest-pill{display:flex;align-items:center;gap:8px;height:36px;padding:0 4px 0 4px;max-width:100%;border-radius:999px;' +
        'background:rgba(255,255,255,.78);border:1px solid rgb(var(--c-primary-200));box-shadow:0 1px 2px rgba(9,9,11,.05);' +
        'font:500 12.5px/1 ' + DEVA + ';color:#4b5563;white-space:nowrap;overflow:hidden}' +
      '.fest-pill-portrait{flex:none;width:28px;height:28px;border-radius:999px;overflow:hidden;box-shadow:0 0 0 1.5px rgb(var(--c-fest,234 88 12))}' +
      '.fest-pill-portrait svg{width:100%;height:100%}' +
      '.fest-pill-emoji{flex:none;padding-left:6px;font-size:15px}' +
      '.fest-pill-title{font-weight:700;font-size:13.5px;color:rgb(var(--c-primary-700))}' +
      '.fest-pill-sub{color:#6b7280}' +
      '.fest-pill-colour{display:inline-flex;align-items:center;gap:5px;color:#4b5563}' +
      '.fest-dot{display:inline-block;width:9px;height:9px;border-radius:999px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}' +
      '.fest-sep{width:1px;height:16px;background:#e5e7eb}' +
      '.fest-seg{display:inline-flex;gap:1px;padding:2px;border-radius:999px;background:#f4f4f5}' +
      '.fest-seg button{padding:3px 8px;border-radius:999px;font:600 11px/1.3 Inter,system-ui,sans-serif;color:#6b7280;cursor:pointer;background:transparent;border:0}' +
      '.fest-seg button:hover{color:#111}.fest-seg button[aria-pressed=true]{background:#fff;color:rgb(var(--c-primary-700));box-shadow:0 1px 2px rgba(0,0,0,.1)}' +
      '.fest-dahan{flex:none;padding:5px 10px;border-radius:999px;border:0;cursor:pointer;background:rgb(var(--c-primary-600));color:#fff;font:600 11.5px/1.2 Inter,system-ui,sans-serif}' +
      '.fest-dahan:hover{background:rgb(var(--c-primary-700))}' +
      '.fest-on{padding:4px 10px;border-radius:999px;border:1px dashed #d1d5db;background:transparent;color:#6b7280;font:500 11.5px/1.3 Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}' +
      '.fest-on:hover{border-color:#9ca3af;color:#111}' +
      '@media (max-width:1279px){.fest-pill-colour span{display:none}}' +
      '@media (max-width:1099px){.fest-pill-sub{display:none}}' +
      '@media (max-width:899px){.fest-pill-title{display:none}}' +
      '@media (max-width:767px){[data-fest-slot=topbar] .fest-pill{display:none}}' +
      '@media (max-width:1535px){html[data-fest-pill] [data-topbar-date]{display:none!important}}' +

      // toast
      '@keyframes fest-toast{from{opacity:0;transform:translate(-50%,-10px)}to{opacity:1;transform:translate(-50%,0)}}' +
      '.fest-toast{position:fixed;top:68px;left:50%;transform:translateX(-50%);z-index:70;pointer-events:none;padding:10px 18px;border-radius:999px;' +
        'background:rgba(20,12,8,.92);color:#fde68a;font:600 14px/1.4 ' + DEVA + ';box-shadow:0 10px 30px rgba(0,0,0,.25);white-space:nowrap;animation:fest-toast .35s ease both}' +
      '.fest-fireworks{position:fixed;inset:0;width:100vw;height:100vh;z-index:65;pointer-events:none}' +

      // login
      'html[data-fest-login] .fest-swap{display:none!important}' +
      'html[data-fest-login] .lx-brand{background:radial-gradient(circle at 80% 0%,rgb(var(--c-fest) / .30),transparent 55%),' +
        'radial-gradient(circle at 0% 100%,rgb(var(--c-fest) / .22),transparent 55%),linear-gradient(160deg,rgba(255,255,255,.05),rgba(255,255,255,.01));overflow:hidden}' +
      '.fl-toran{position:absolute;left:0;right:0;top:0;height:34px;background-repeat:repeat-x;background-size:56px 34px;pointer-events:none;z-index:1}' +
      '.fl-petals{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:.9}' +
      '.fl-card{position:relative;z-index:1;width:100%;max-width:300px;margin:18px auto 0;padding:18px 18px 14px;border-radius:20px;text-align:center;' +
        'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 20px 50px rgba(0,0,0,.35)}' +
      '.fl-orb{width:112px;height:112px;margin:0 auto 10px;border-radius:999px;overflow:hidden;' +
        'background:radial-gradient(circle,rgb(var(--c-fest) / .55),rgb(var(--c-fest) / .1) 70%);' +
        'box-shadow:0 0 0 2px rgba(255,255,255,.18),0 0 40px rgb(var(--c-fest) / .55),0 0 90px rgb(var(--c-fest) / .25)}' +
      '.fl-orb svg{width:100%;height:100%}.fl-orb-bow{display:grid;place-items:center}.fl-orb-bow svg{width:62%;height:62%}' +
      '.fl-hi{font:700 22px/1.3 ' + DEVA + ';color:#fff7e6}' +
      '.fl-en{margin-top:2px;font:500 12px/1.4 Inter,system-ui,sans-serif;color:#a3a3a3}' +
      '.fl-dots{display:flex;justify-content:center;gap:7px;margin:12px 0 8px}' +
      '.fl-dots i{width:10px;height:10px;border-radius:999px;opacity:.55;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}' +
      '.fl-dots i.on{opacity:1;box-shadow:0 0 0 2px #0b0b0c,0 0 0 3.5px #fff7e6}' +
      '.fl-rang{font:600 12px/1.4 Inter,system-ui,sans-serif;color:#e5e5e5;letter-spacing:.02em}' +
      '.fl-joke{margin-top:10px;min-height:20px;font:500 13px/1.45 ' + DEVA + ';color:#fde68a;transition:opacity .3s}' +
      '.fl-dancers{position:relative;z-index:1;display:flex;justify-content:center;gap:4px;margin-top:6px}' +
      '.fl-dancers > div{width:112px}' +
      '@media (max-height:760px){.fl-dancers{display:none}}' +
      '.fl-chip{display:inline-flex;align-items:center;gap:7px;margin:0 0 12px;padding:5px 12px;border-radius:999px;' +
        'background:rgba(255,255,255,.06);border:1px solid rgb(var(--c-fest,234 88 12) / .45);color:#f5f5f5;font:600 12.5px/1.3 ' + DEVA + '}' +
      '.fl-chip .fest-dot{box-shadow:0 0 8px rgb(var(--c-fest,234 88 12))}' +
      '.fl-mobile{display:none}' +
      '@media (max-width:860px){.fl-mobile{display:block;position:absolute;inset:0;pointer-events:none;z-index:1}' +
        '.fl-mobile .fl-toran{position:absolute}' +
        '.fl-mobile-tint{position:absolute;left:50%;top:8%;width:520px;height:520px;margin-left:-260px;border-radius:999px;' +
          'background:radial-gradient(circle,rgb(var(--c-fest) / .30),transparent 65%);filter:blur(10px)}}' +

      '@media (prefers-reduced-motion:reduce){.fest-anim,.fest-anim *{animation:none!important}.fest-toast{animation:none}}';
  }

  function themeCSS() {
    if (!themed()) return '';
    var pal = S.pal, c = hexRgb(pal.p), W = [255, 255, 255], K = [0, 0, 0];
    var sc = {
      50: mix(c, W, .93), 100: mix(c, W, .85), 200: mix(c, W, .7), 300: mix(c, W, .45), 400: c,
      500: mix(c, K, .12), 600: mix(c, K, .25), 700: mix(c, K, .4), 800: mix(c, K, .55), 900: mix(c, K, .7), 950: mix(c, K, .8),
    };
    var vars = Object.keys(sc).map(function (k) { return '--c-primary-' + k + ':' + trip(sc[k]); }).join(';');
    var tint = hexRgb(pal.tint), acc = hexRgb(pal.accent);
    return 'html[data-fest]{' + vars +
      ';--c-ring:' + trip(c) +
      ';--c-btn:' + pal.p + ';--c-btn-hover:' + hex(sc[500]) + ';--c-btn-active:' + hex(sc[600]) + ';--c-btn-ink:#ffffff' +
      ';--c-page-bg:' + pal.tint +
      ';--c-topbar-bg:rgba(' + mix(tint, c, .05).join(',') + ',.9)' +
      ';--c-title:' + hex(mix(c, K, .35)) +
      ';--c-sidebar-bg:' + pal.deep +
      ';--c-sidebar-accent:' + trip(acc) +
      ';--c-sidebar-accent-soft:' + hex(mix(acc, W, .55)) +
      ';--c-fest:' + trip(hexRgb(pal.swatch === '#ffffff' ? '#f5e6b8' : pal.swatch)) + '}';
  }

  function ensureStyle(id, css) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      (document.head || document.documentElement).appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Theme
  // ═════════════════════════════════════════════════════════════════════════
  function applyTheme() {
    var root = document.documentElement;
    var m = getMode();
    var on = themed() && m !== 'off';
    ensureStyle('fest-base', baseCSS());
    ensureStyle('fest-theme', on ? themeCSS() : '');
    if (on) { root.setAttribute('data-fest', S.phase); root.setAttribute('data-fest-mode', m); }
    else { root.removeAttribute('data-fest'); root.removeAttribute('data-fest-mode'); }
  }

  function refreshAll() {
    applyTheme();
    decorateTopbar();
    if (dash) paintDash();
    if (loginRoot) paintLogin();
  }

  // ── Topbar ───────────────────────────────────────────────────────────────
  function modeSwitch() {
    var m = getMode();
    return '<span class="fest-seg" role="group" aria-label="Festival theme">' +
      ['full', 'lite', 'off'].map(function (k) {
        return '<button type="button" data-fest-mode-btn="' + k + '" aria-pressed="' + (m === k) + '">' + k.charAt(0).toUpperCase() + k.slice(1) + '</button>';
      }).join('') + '</span>';
  }
  function portraitSVG() { return durgaSVG(S, 'face'); }
  function dot(colour) { return '<i class="fest-dot" style="background:' + COLOURS[colour].swatch + '"></i>'; }

  function pillHTML() {
    if (!S) return '';
    var m = getMode();
    if (m === 'off') return themed() ? '<button type="button" class="fest-on" data-fest-mode-btn="full" title="Turn the festival theme back on">🪔 Festive theme</button>' : '';
    if (S.phase === 'eve') {
      return '<div class="fest-pill" role="note"><span class="fest-pill-emoji">🪔</span><span class="fest-pill-title">नवरात्रि कल से</span>' +
        '<span class="fest-pill-sub" style="padding-right:10px">Navratri begins tomorrow</span></div>';
    }
    if (S.phase === 'after') {
      return '<div class="fest-pill" role="note"><span class="fest-pill-emoji">🙏</span><span class="fest-pill-title">विजयादशमी की शुभकामनाएँ</span>' +
        '<span class="fest-pill-sub" style="padding-right:10px">See you next Navratri</span></div>';
    }
    if (S.phase === 'dussehra') {
      return '<div class="fest-pill" role="note"><span class="fest-pill-emoji">🏹</span><span class="fest-pill-title">शुभ विजयादशमी</span>' +
        '<span class="fest-pill-sub">· असत्य पर सत्य की विजय</span>' +
        (m === 'full' ? '<button type="button" class="fest-dahan" data-fest-dahan>🏹 Ravan Dahan</button>' : '') +
        modeSwitch() + '</div>';
    }
    return '<div class="fest-pill" role="note"><span class="fest-pill-portrait">' + portraitSVG() + '</span>' +
      '<span class="fest-pill-title">शुभ नवरात्रि</span><span class="fest-pill-sub">माँ ' + S.g.hi + '</span>' +
      '<span class="fest-sep"></span><span class="fest-pill-colour">' + dot(S.colour) + '<span>' + S.colour + '</span></span>' +
      modeSwitch() + '</div>';
  }

  function decorateTopbar() {
    var slot = document.querySelector('[data-fest-slot="topbar"]');
    if (!slot) return;
    var u = slot.getAttribute('data-user') || '';
    if (u && u !== currentUser) {
      var before = getMode();
      currentUser = u;
      lsSet(USER_KEY, u);
      if (getMode() !== before) { applyTheme(); if (dash) paintDash(); }
    }
    var html = pillHTML();
    slot.innerHTML = html;
    if (html && getMode() !== 'off') document.documentElement.setAttribute('data-fest-pill', '');
    else document.documentElement.removeAttribute('data-fest-pill');
  }

  // ── Particles (petals / embers) ──────────────────────────────────────────
  // The loop ends by itself once the canvas leaves the DOM, and idles while
  // the tab is hidden.
  var PETAL_COLOURS = ['#f59e0b', '#f97316', '#fbbf24', '#e11d48', '#fb7185'];
  var EMBER_COLOURS = ['#f97316', '#fbbf24', '#ef4444', '#fde68a'];
  function particles(cv, kind) {
    if (!cv || reduceMotion()) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
    function size() {
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    var petals = kind === 'petals';
    var N = petals ? 14 : 28, ps = [];
    function spawn(p, first) {
      p.x = Math.random() * W;
      if (petals) {
        p.y = first ? Math.random() * H : -12;
        p.vy = .35 + Math.random() * .5; p.sw = Math.random() * Math.PI * 2; p.amp = .4 + Math.random() * .6;
        p.rot = Math.random() * 6.28; p.vr = (Math.random() - .5) * .04; p.s = 4 + Math.random() * 3.4;
        p.c = PETAL_COLOURS[Math.floor(Math.random() * PETAL_COLOURS.length)];
      } else {
        p.y = first ? Math.random() * H : H + 4;
        p.vy = -(.35 + Math.random() * .8); p.sw = Math.random() * Math.PI * 2; p.amp = .3 + Math.random() * .4;
        p.s = .9 + Math.random() * 1.6; p.c = EMBER_COLOURS[Math.floor(Math.random() * EMBER_COLOURS.length)];
      }
      return p;
    }
    for (var i = 0; i < N; i++) ps.push(spawn({}, true));
    function frame() {
      if (!cv.isConnected) return;
      if (document.hidden) { setTimeout(function () { requestAnimationFrame(frame); }, 700); return; }
      if (cv.clientWidth !== W || cv.clientHeight !== H) size();
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) {
        p.sw += .02; p.x += Math.sin(p.sw) * p.amp; p.y += p.vy;
        if (petals) {
          p.rot += p.vr;
          if (p.y > H + 12) spawn(p, false);
          ctx.save(); ctx.globalAlpha = .85; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * .55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        } else {
          if (p.y < -6) spawn(p, false);
          var a = Math.max(0, Math.min(1, p.y / H)) * (.6 + Math.random() * .4);
          ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function fireworks() {
    if (reduceMotion() || document.hidden) return;
    var cv = document.createElement('canvas');
    cv.className = 'fest-fireworks';
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var COLS = ['#fbbf24', '#f97316', '#ef4444', '#fde68a', '#fb7185', '#a3e635', '#60a5fa'];
    var ps = [], bursts = 6, t = 0;
    function burst() {
      var x = W * (.2 + Math.random() * .6), y = H * (.12 + Math.random() * .3), col = COLS[Math.floor(Math.random() * COLS.length)];
      for (var i = 0; i < 48; i++) {
        var a = Math.random() * Math.PI * 2, sp = 1.6 + Math.random() * 3.4;
        ps.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 60 + Math.random() * 40, age: 0, c: Math.random() < .3 ? '#fff7ed' : col });
      }
    }
    function frame() {
      if (!cv.isConnected) return;
      if (document.hidden) { cv.remove(); return; }
      t += 1;
      if (bursts > 0 && t % 18 === 1) { burst(); bursts -= 1; }
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ps = ps.filter(function (p) {
        p.age += 1; p.vx *= .985; p.vy = p.vy * .985 + .045; p.x += p.vx; p.y += p.vy;
        var a = 1 - p.age / p.life;
        if (a <= 0) return false;
        ctx.globalAlpha = a; ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.9, 0, Math.PI * 2); ctx.fill();
        return true;
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (ps.length || bursts > 0) requestAnimationFrame(frame); else cv.remove();
    }
    requestAnimationFrame(frame);
  }

  function toast(text) {
    var old = document.querySelector('.fest-toast');
    if (old) old.remove();
    var el = node('<div class="fest-toast" role="status">' + esc(text) + '</div>');
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3600);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Dashboard
  // ═════════════════════════════════════════════════════════════════════════
  var dash = null, corners = null, watchTimer = null, fireTimers = [], busy = false;

  function mount(wrap) {
    if (!wrap) return;
    dash = wrap;
    paintDash();
  }

  function bannerHTML() {
    if (S.phase === 'eve') return '<div class="fest-banner" data-fest-node><span class="fest-banner-orb">🪔</span><div class="fest-banner-text"><div class="fest-banner-t">नवरात्रि कल से</div><div class="fest-banner-s">Navratri begins tomorrow</div></div></div>';
    if (S.phase === 'after') return '<div class="fest-banner" data-fest-node><span class="fest-banner-orb">🙏</span><div class="fest-banner-text"><div class="fest-banner-t">विजयादशमी की शुभकामनाएँ</div><div class="fest-banner-s">See you next Navratri</div></div></div>';
    if (S.phase === 'dussehra') return '<div class="fest-banner" data-fest-node><span class="fest-banner-orb">🏹</span><div class="fest-banner-text"><div class="fest-banner-t">शुभ विजयादशमी</div><div class="fest-banner-s">असत्य पर सत्य की विजय</div></div>' + modeSwitch() + '</div>';
    return '<div class="fest-banner" data-fest-node><span class="fest-banner-portrait">' + portraitSVG() + '</span><div class="fest-banner-text"><div class="fest-banner-t">शुभ नवरात्रि</div>' +
      '<div class="fest-banner-s">माँ ' + S.g.hi + ' · ' + dot(S.colour) + ' ' + S.colour + '</div></div>' + modeSwitch() + '</div>';
  }

  function sceneHTML() {
    if (S.phase === 'dussehra') {
      return '<div class="fest-scene" data-fest-node aria-hidden="true"><div class="fest-scene-row"><div class="fest-scene-mid" style="width:36%">' + ramSVG() + '</div>' +
        '<div class="fest-scene-mid" style="width:40%">' + ravanSVG() + '</div></div><div class="fest-scene-cap">🏹 जय श्री राम · शुभ विजयादशमी</div></div>';
    }
    return '<div class="fest-scene" data-fest-node aria-hidden="true"><div class="fest-scene-row"><div class="fest-scene-side">' + coupleSVG(S) + '</div>' +
      '<div class="fest-scene-mid">' + durgaSVG(S, 'full') + '</div><div class="fest-scene-side">' + coupleSVG(S) + '</div></div>' +
      '<div class="fest-scene-cap">जय माँ ' + S.g.hi + '</div></div>';
  }

  function unpaintDash() {
    removeCorners();
    clearInterval(watchTimer); watchTimer = null;
    if (dash) {
      Array.prototype.forEach.call(dash.querySelectorAll('[data-fest-node]'), function (n) { n.remove(); });
      dash.classList.remove('fest-dash', 'fest-dash-full');
    }
  }

  function paintDash() {
    unpaintDash();
    if (!dash || !dash.isConnected || !S) return;
    var m = getMode();
    if (m === 'off') return;
    dash.classList.add('fest-dash');
    dash.insertBefore(node(bannerHTML()), dash.firstChild);
    if (!themed() || m !== 'full') return;
    dash.classList.add('fest-dash-full');
    var band = node('<div class="fest-band" data-fest-node aria-hidden="true"><canvas></canvas><div class="fest-toran"></div></div>');
    band.querySelector('.fest-toran').style.backgroundImage = toranURI();
    dash.appendChild(band);
    particles(band.querySelector('canvas'), S.phase === 'dussehra' ? 'embers' : 'petals');
    dash.appendChild(node(sceneHTML()));
    watchTimer = setInterval(syncCorners, 500);
    syncCorners();
  }

  // Corners live on <body> (a transformed ancestor would break position:fixed),
  // so they need watching: gone when the dashboard unmounts, the mode changes,
  // or the window drops to phone width.
  function syncCorners() {
    if (!dash || !dash.isConnected || getMode() !== 'full' || !themed()) {
      if (dash && !dash.isConnected) dash = null;
      unpaintDash();
      return;
    }
    var want = window.innerWidth >= 768;
    if (want && !corners) addCorners();
    else if (!want && corners) removeCorners();
  }

  function addCorners() {
    var l, r;
    if (S.phase === 'dussehra') {
      l = node('<div class="fest-corner fest-corner-l fest-corner-ram" aria-hidden="true"><div class="fest-tag">🏹 जय श्री राम</div>' + ramSVG() + '</div>');
      r = node('<div class="fest-corner fest-corner-r fest-corner-ravan" aria-hidden="true">' + ravanSVG() + '</div>');
    } else {
      l = node('<div class="fest-corner fest-corner-l" aria-hidden="true"><div class="fest-tag">🪔 शुभ नवरात्रि</div>' + coupleSVG(S) + '</div>');
      r = node('<div class="fest-corner fest-corner-r" aria-hidden="true">' + durgaSVG(S, 'full') + '</div>');
    }
    document.body.appendChild(l);
    document.body.appendChild(r);
    corners = { l: l, r: r };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    if (S.phase === 'dussehra' && !reduceMotion()) {
      fireTimers.push(setTimeout(function () { fire(false); }, 2000));
      fireTimers.push(setInterval(function () { if (!document.hidden) fire(true); }, 25000));
    }
  }

  function removeCorners() {
    window.removeEventListener('mousemove', onMouseMove);
    fireTimers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    fireTimers = [];
    if (corners) { corners.l.remove(); corners.r.remove(); corners = null; }
  }

  // Never hide content: a figure fades to 10% when the pointer comes within 30px.
  function onMouseMove(e) {
    if (!corners) return;
    [corners.l, corners.r].forEach(function (el) {
      var b = el.getBoundingClientRect();
      var near = e.clientX > b.left - 30 && e.clientX < b.right + 30 && e.clientY > b.top - 30 && e.clientY < b.bottom + 30;
      el.style.opacity = near ? '0.1' : '';
    });
  }

  // ── Ravan Dahan ─────────────────────────────────────────────────────────
  function ravanDahan() { fire(false); }

  function celebrate() {
    fireworks();
    toast('जय श्री राम — Happy Dussehra from ' + COMPANY);
  }

  function fire(quiet) {
    if (busy) return;
    if (!corners || S.phase !== 'dussehra' || reduceMotion()) { if (!quiet) celebrate(); return; }
    var ram = corners.l, rav = corners.r;
    var nock = ram.querySelector('.fr-nock'), str = ram.querySelector('.fr-string');
    var chest = rav.querySelector('.fv-chest');
    var a = nock.getBoundingClientRect(), b = chest.getBoundingClientRect();
    if (!a.width || !b.width) return;
    busy = true;
    setTimeout(function () { busy = false; }, 9000); // safety net if anything is torn down mid-flight

    str.setAttribute('d', STRING_SLACK);
    nock.style.visibility = 'hidden';
    var fly = node(flyingArrowSVG());
    document.body.appendChild(fly);

    var p0 = { x: a.left + a.width * .7, y: a.top + a.height / 2 };
    var p2 = { x: b.left + b.width / 2, y: b.top + b.height * .4 };
    var p1 = { x: (p0.x + p2.x) / 2, y: Math.max(60, Math.min(p0.y, p2.y) - window.innerHeight * .5) };
    var frames = [];
    for (var i = 0; i <= 12; i++) {
      var t = i / 12, u = 1 - t;
      var x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
      var y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
      var dx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
      var dy = 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
      frames.push({ transform: 'translate(' + r1(x - 37) + 'px,' + r1(y - 6) + 'px) rotate(' + r1(Math.atan2(dy, dx) * 180 / Math.PI) + 'deg)' });
    }
    var anim = fly.animate(frames, { duration: 1500, easing: 'linear', fill: 'forwards' });
    setTimeout(function () { str.setAttribute('d', STRING_DRAWN); nock.style.visibility = ''; }, 1400);
    anim.onfinish = function () {
      fly.remove();
      if (!rav.isConnected) { busy = false; return; }
      rav.classList.add('fr-burning');
      if (!quiet) celebrate();
      var body = rav.querySelector('.fv-body');
      setTimeout(function () {
        if (!rav.isConnected) { busy = false; return; }
        var down = body.animate(
          [{ transform: 'scaleY(1)', filter: 'brightness(1)', opacity: 1 }, { transform: 'scaleY(.04)', filter: 'brightness(.25)', opacity: .2 }],
          { duration: 1500, easing: 'ease-in', fill: 'forwards' });
        down.onfinish = function () {
          rav.classList.remove('fr-burning');
          var up = body.animate(
            [{ transform: 'scaleY(.04)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1 }],
            { duration: 800, easing: 'cubic-bezier(.2,1.3,.4,1)' });
          down.cancel();
          up.onfinish = function () { busy = false; };
        };
      }, 1800);
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Login
  // ═════════════════════════════════════════════════════════════════════════
  var loginRoot = null, jokeTimer = null;

  function decorateLogin(root) {
    if (!root) return;
    loginRoot = root;
    paintLogin();
  }

  function paintLogin() {
    var root = loginRoot;
    clearInterval(jokeTimer);
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-fest-node]'), function (n) { n.remove(); });
    var html = document.documentElement;
    html.removeAttribute('data-fest-login');
    if (!root.isConnected || !S) return;
    var m = getMode();
    if (m === 'off') return;

    var chipSlot = root.querySelector('[data-fest-slot="login-chip"]');
    var brandSlot = root.querySelector('[data-fest-slot="login-brand"]');
    var brand = root.querySelector('.lx-brand');

    var chip;
    if (S.phase === 'navratri') chip = dot(S.colour) + ' शुभ नवरात्रि · ' + S.colour;
    else if (S.phase === 'dussehra') chip = '<i class="fest-dot" style="background:#ea580c"></i> शुभ दशहरा · Saffron';
    else if (S.phase === 'eve') chip = '🪔 नवरात्रि कल से';
    else chip = '🙏 विजयादशमी की शुभकामनाएँ';
    if (chipSlot) chipSlot.appendChild(node('<div data-fest-node><span class="fl-chip">' + chip + '</span></div>'));

    var jokes = JOKES[S.phase] || [];
    if (!themed()) return;
    html.setAttribute('data-fest-login', S.phase);
    var full = m === 'full';

    if (brandSlot) {
      var card;
      if (S.phase === 'dussehra') {
        card = '<div class="fl-card" data-fest-node><div class="fl-orb fl-orb-bow">' + bowOrbSVG() + '</div>' +
          '<div class="fl-hi">शुभ दशहरा</div><div class="fl-en">Vijayadashami · असत्य पर सत्य की विजय</div>' +
          '<div class="fl-dots">' + nineDots(10) + '</div><div class="fl-rang">Aaj ka rang · Saffron</div><div class="fl-joke"></div></div>';
      } else {
        card = '<div class="fl-card" data-fest-node><div class="fl-orb">' + portraitSVG() + '</div>' +
          '<div class="fl-hi">माँ ' + S.g.hi + '</div><div class="fl-en">Maa ' + S.g.en + ' · ' + esc(S.g.virtue) + '</div>' +
          '<div class="fl-dots">' + nineDots(S.day) + '</div><div class="fl-rang">Aaj ka rang · ' + S.colour + '</div><div class="fl-joke"></div></div>';
      }
      brandSlot.appendChild(node(card));
      if (full) {
        brandSlot.appendChild(node('<div class="fl-dancers fest-anim" data-fest-node aria-hidden="true"><div>' + coupleSVG(S) + '</div><div>' + coupleSVG(S) + '</div></div>'));
      }
      var jokeEl = brandSlot.querySelector('.fl-joke');
      var ji = Math.floor(Math.random() * jokes.length);
      jokeEl.textContent = jokes[ji] || '';
      if (jokes.length > 1 && !reduceMotion()) {
        jokeTimer = setInterval(function () {
          if (!jokeEl.isConnected) { clearInterval(jokeTimer); return; }
          jokeEl.style.opacity = '0';
          setTimeout(function () { ji = (ji + 1) % jokes.length; jokeEl.textContent = jokes[ji]; jokeEl.style.opacity = '1'; }, 300);
        }, 4500);
      }
    }
    if (brand && full) {
      var t = node('<div class="fl-toran" data-fest-node aria-hidden="true"></div>');
      t.style.backgroundImage = toranURI();
      brand.appendChild(t);
      var cv = node('<canvas class="fl-petals" data-fest-node aria-hidden="true"></canvas>');
      brand.insertBefore(cv, brand.firstChild);
      particles(cv, S.phase === 'dussehra' ? 'embers' : 'petals');
    }
    // Phones: the brand panel is hidden, so the toran and a day-colour glow go
    // behind the sign-in card instead.
    var mob = node('<div class="fl-mobile" data-fest-node aria-hidden="true"><div class="fl-mobile-tint"></div>' + (full ? '<div class="fl-toran"></div>' : '') + '</div>');
    var mt = mob.querySelector('.fl-toran');
    if (mt) mt.style.backgroundImage = toranURI();
    root.appendChild(mob);
  }
  function nineDots(today) {
    var start = weekday(S.row.start);
    var out = '';
    for (var d = 1; d <= 9; d++) {
      var c = d === 8 ? 'Peacock Green' : d === 9 ? 'Purple' : WEEK[(start + d - 1) % 7];
      out += '<i class="' + (d === today ? 'on' : '') + '" style="background:' + COLOURS[c].swatch + '" title="Day ' + d + ' · ' + c + '"></i>';
    }
    return out;
  }

  // ── Clicks on our own controls ──────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var b = t.closest('[data-fest-mode-btn]');
    if (b) { e.preventDefault(); setMode(b.getAttribute('data-fest-mode-btn')); return; }
    if (t.closest('[data-fest-dahan]')) { e.preventDefault(); ravanDahan(); }
  });

  window.Festival = {
    mount: mount,
    decorateTopbar: decorateTopbar,
    decorateLogin: decorateLogin,
    applyTheme: applyTheme,
    ravanDahan: ravanDahan,
    state: function () { return S; },
  };
  applyTheme();
})();
