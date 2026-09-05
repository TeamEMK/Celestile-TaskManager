'use client';
// Bits shared by ApprovalsClient (admin) and UserApprovalsClient — the two
// screens rendered the same rows and used to carry ~130 duplicated lines:
// the priority pill ternary (4 copies), the attachment strip (3), the
// avatar+name cell (4), the action-button pair (3), the date formatter and
// the three tab icons (2 each).
import { ZoomImg } from '../components/ImageLightbox';
import { isImageAttachment } from '@/lib/attachmentType';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';

export const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function ReviseIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/></svg>; }
export function TaskIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>; }
export function SentIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>; }

export function PriorityPill({ priority }) {
  return (
    <span className={`pill ${
      priority === 'High'   ? 'bg-red-50 text-red-600 border border-red-100'   :
      priority === 'Medium' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
      'bg-blue-50 text-blue-600 border border-blue-100'
    }`}>{priority || 'Low'}</span>
  );
}

// Image thumbnail / PDF link / URL link strip under a task description.
export function TaskAttachments({ task: t }) {
  if (!(t.image || t.attachment || t.url)) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {t.image && (
        <ZoomImg src={t.image} className="w-6 h-6 rounded object-cover border border-slate-200 shrink-0" />
      )}
      {t.attachment && (
        isImageAttachment(t.attachment)
          ? <ZoomImg src={t.attachment} className="w-6 h-6 rounded object-cover border border-slate-200 shrink-0" />
          : <a href={t.attachment} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary-600 hover:underline shrink-0"><Icon name="file" className="w-3.5 h-3.5" /> View PDF</a>
      )}
      {t.url && (
        <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary-600 hover:underline shrink-0" title={t.url}><Icon name="link" className="w-3.5 h-3.5" /> Link</a>
      )}
    </div>
  );
}

export function DoerCell({ name }) {
  return (
    <div className="flex items-center gap-1.5">
      <Avatar name={name} />
      <span className="text-slate-700">{name}</span>
    </div>
  );
}

// The green/red action pair at the row's right edge.
export function RowActions({ onYes, onNo, yesLabel, noLabel }) {
  return (
    <div className="flex gap-1.5 justify-end pr-2">
      <button onClick={onYes} className="pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer">{yesLabel}</button>
      <button onClick={onNo}  className="pill bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer">{noLabel}</button>
    </div>
  );
}
