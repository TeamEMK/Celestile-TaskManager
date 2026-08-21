'use client';
/**
 * Thickness, picked from the IMS stone master rather than typed.
 *
 * The list is the "Stone Name" tab of the IMS spreadsheet — the same master
 * Inventory and the quotation forms read, so a thickness captured on an FMS
 * order is the same string the slab register and the quote use. Typed by hand
 * it wasn't: "30MM", "30 MM" and "30mm" are three different sizes to every
 * report that groups by it.
 *
 * When the form also carries a material, the list narrows to the sizes that
 * stone is actually sold in, with everything else still reachable below —
 * same shape as the quotation form.
 *
 * The master is fetched once per page load and shared by every field using it.
 * If it can't be reached this quietly becomes a text box: a stone master that
 * is down must not be able to stop an order being captured.
 */
import { useEffect, useState } from 'react';

// One in-flight request for the whole page, whatever the field count.
let cache = null;
let inFlight = null;

async function loadMaster() {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = fetch('/api/inventory/material')
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) throw new Error(d.error);
        cache = {
          thicknesses: d.thicknesses || [],
          byMaterial: d.thicknessByMaterial || {},
        };
        return cache;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

export default function ImsThicknessSelect({ value = '', onChange, material = '', className = 'input', disabled }) {
  const [master, setMaster] = useState(cache);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadMaster().then((m) => { if (alive) setMaster(m); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const emit = (v) => onChange?.({ target: { value: v } });

  // No master, no dropdown — but still a usable field.
  if (failed) {
    return (
      <>
        <input className={className} value={value} disabled={disabled} placeholder="e.g. 30MM"
          onChange={(e) => emit(e.target.value.toUpperCase().replace(/\s+/g, ''))} />
        <div className="text-[11px] text-amber-600 mt-1">Stone master unreachable — type the thickness.</div>
      </>
    );
  }

  if (!master) {
    return <select className={className} disabled><option>Loading sizes…</option></select>;
  }

  const own = master.byMaterial[String(material || '').trim().toLowerCase()] || [];
  const primary = own.length ? own : master.thicknesses;
  const others = own.length ? master.thicknesses.filter((t) => !own.includes(t)) : [];

  return (
    <select className={className} value={value} disabled={disabled} onChange={(e) => emit(e.target.value)}>
      <option value="">-- Select --</option>
      {/* A thickness saved before the master changed stays selectable */}
      {value && !master.thicknesses.includes(value) && <option value={value}>{value}</option>}
      {primary.map((t) => <option key={t} value={t}>{t}</option>)}
      {others.length > 0 && (
        <optgroup label="Other sizes in the master">
          {others.map((t) => <option key={t} value={t}>{t}</option>)}
        </optgroup>
      )}
    </select>
  );
}
