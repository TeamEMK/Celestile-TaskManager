'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Shared click-to-enlarge viewer. Thumbnails across the app are 6–40px, which
// is far too small to actually look at a photo, so every uploaded image is
// rendered through <ZoomImg> and opens here at full size on click.
//
// Rendered into document.body via a portal so it escapes the scroll/stacking
// context of the tables and modals it is triggered from.
export function Lightbox({ src, alt = '', onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-6 animate-fade-in cursor-zoom-out"
      style={{ background: 'rgba(15,23,42,0.85)' }}
      onClick={onClose}
    >
      <div className="absolute top-3 right-4 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 hover:text-white text-[12px] underline underline-offset-2"
        >
          Open in new tab
        </a>
        <button
          type="button"
          className="text-white/70 hover:text-white text-3xl leading-none"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <img
        src={src}
        alt={alt}
        className="max-h-[88vh] max-w-[92vw] object-contain rounded-xl shadow-2xl bg-white cursor-default"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

// Drop-in replacement for <img> on any uploaded photo. Click opens the
// full-size view; preventDefault/stopPropagation keep it working when the
// thumbnail sits inside an <a> or an upload <label> (where the parent would
// otherwise navigate away / re-open the file picker).
export function ZoomImg({ src, alt = '', className = '', title = 'Click to view full image', ...imgProps }) {
  const [open, setOpen] = useState(false);
  if (!src) return null;
  return (
    <>
      <img
        {...imgProps}
        src={src}
        alt={alt}
        title={title}
        className={`${className} cursor-zoom-in`.trim()}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
      />
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

// An <img> that walks a list of candidate URLs, moving to the next one each
// time the browser fails to load the current src. Google Drive attachments
// need this: the same file may only be readable through /api/drive/<id>
// (service account) *or* only through the public thumbnail host, and nothing
// in the URL says which. Once every candidate fails we render a link instead,
// which is also the correct outcome for a PDF that was never an image.
export function SmartImg({ candidates = [], alt = '', className = '', href = '', onFail }) {
  const key = candidates.join('|');
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [key]);

  if (!candidates.length || i >= candidates.length) {
    if (onFail) return onFail;
    return (
      <div className="text-center text-white/80 text-[13px] px-6 py-10">
        <div className="text-3xl mb-2">📄</div>
        <div>This file can&apos;t be previewed here.</div>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="inline-block mt-2 underline underline-offset-2 text-white">
            Open it in a new tab ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <img
      key={i}
      src={candidates[i]}
      alt={alt}
      className={className}
      onError={() => setI((n) => n + 1)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// Full-screen viewer for a *set* of attachments — one sheet cell routinely
// holds several uploaded photos, so the viewer has to page through them
// rather than being opened once per file.
export function Gallery({ items = [], start = 0, onClose }) {
  const [i, setI] = useState(start);
  const count = items.length;

  useEffect(() => { setI(start); }, [start, count]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => (n + 1) % count);
      if (e.key === 'ArrowLeft')  setI((n) => (n - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, count]);

  if (typeof document === 'undefined' || !count) return null;

  const cur = items[Math.min(i, count - 1)] || items[0];

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-6 animate-fade-in cursor-zoom-out"
      style={{ background: 'rgba(15,23,42,0.9)' }}
      onClick={onClose}
    >
      <div className="absolute top-3 right-4 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {count > 1 && <span className="text-white/60 text-[12px]">{i + 1} / {count}</span>}
        <a
          href={cur.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 hover:text-white text-[12px] underline underline-offset-2"
        >
          Open in new tab
        </a>
        <button type="button" className="text-white/70 hover:text-white text-3xl leading-none"
          onClick={onClose} aria-label="Close">×</button>
      </div>

      {count > 1 && (
        <>
          <button type="button" aria-label="Previous"
            onClick={(e) => { e.stopPropagation(); setI((n) => (n - 1 + count) % count); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white text-2xl leading-none grid place-items-center">‹</button>
          <button type="button" aria-label="Next"
            onClick={(e) => { e.stopPropagation(); setI((n) => (n + 1) % count); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white text-2xl leading-none grid place-items-center">›</button>
        </>
      )}

      <div onClick={(e) => e.stopPropagation()} className="max-w-[92vw]">
        <SmartImg
          candidates={cur.candidates}
          href={cur.href}
          alt={cur.name || ''}
          className="max-h-[86vh] max-w-[92vw] object-contain rounded-xl shadow-2xl bg-white cursor-default"
        />
      </div>
    </div>,
    document.body,
  );
}
