import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import { stateForCity, cityForPlace } from '@/lib/indianCities';

export const dynamic = 'force-dynamic';

/**
 * Area / Location suggestions as you type, the way a map search offers them
 * (17-11-2026). Answered by Photon — OpenStreetMap's free search, no key —
 * limited to India. Only the typed text goes out; nothing about the lead.
 *   GET /api/places?q=gachib → [{ label, name, city, state }]
 */
const PHOTON = 'https://photon.komoot.io/api/';
const INDIA_BBOX = '68,6,98,37';
const cache = new Map(); // q → { at, items }
const TTL = 6 * 3600 * 1000;

// The city behind a result — Photon's own city is often a village or ward
// ("Seegehalli", "Jaipur Municipal Corporation"), or missing; the county /
// district usually names the real one ("Bangalore East", "Serilingampalle
// mandal"). First known one wins (lib/indianCities.js cityForPlace).
function cityOf(p) {
  for (const raw of [p.city, p.county, p.district, p.name]) {
    const c = cityForPlace(raw);
    if (c) return c;
  }
  // Not one we know: the map's own city, else its county without
  // "mandal" / "taluk" / "East"… — better than an empty City box.
  const own = [p.city, p.county].map((x) => String(x || '')
    .replace(/\b(municipal\s*corporation|municipality|mandal|tahsil|tehsil|taluka?|district|division|east|west|north|south|urban|rural|central)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim()).find(Boolean);
  return own || '';
}

// Places people live in, not the shop or office that happens to be there.
const PLACE_KEYS = new Set(['place', 'boundary', 'landuse', 'highway']);

export async function GET(req) {
  const gate = await requireUser(); if (gate) return gate;
  const q = String(new URL(req.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 3) return NextResponse.json([]);
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.items);

  try {
    const url = `${PHOTON}?q=${encodeURIComponent(q)}&limit=15&lang=en&bbox=${INDIA_BBOX}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Celestile-TaskManager/1.0' }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    const seen = new Set();
    const items = [];
    for (const f of data.features || []) {
      const p = f.properties || {};
      if (p.countrycode && p.countrycode !== 'IN') continue;
      if (p.osm_key && !PLACE_KEYS.has(p.osm_key)) continue;
      const city = cityOf(p);
      // "Ward 105 Gachibowli" is an election ward, noise in an address.
      const place = [p.locality, p.district].find((x) => x && !/^ward\b/i.test(x) && x !== p.name) || '';
      const parts = [p.name, place, city, p.state].filter(Boolean);
      const label = [...new Set(parts)].join(', ');
      if (!p.name || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      items.push({ label, name: p.name, city, state: p.state || stateForCity(city) });
      if (items.length >= 6) break;
    }
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), items });
    return NextResponse.json(items);
  } catch (err) {
    // No suggestions is fine — the field still takes whatever is typed.
    console.error('[places]', err.message);
    return NextResponse.json([]);
  }
}
