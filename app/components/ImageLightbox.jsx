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
