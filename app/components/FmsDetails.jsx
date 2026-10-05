'use client';
import { isImageAttachment } from '@/lib/attachmentType';
import { ZoomImg } from '@/app/components/ImageLightbox';

// FMS answers are raw sheet values, so an uploaded file or a pasted link
// would otherwise print as a wall of URL text in the details strip (the
// "Quotation pdf" field is the worst offender). Show a thumbnail for images
// and a short "Click here" for anything else that is openable.
function DetailValue({ value }) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (isImageAttachment(v)) {
    return <ZoomImg src={v} className="w-6 h-6 rounded object-cover border border-slate-200" />;
  }
  const isFile = v.includes('/api/drive/') || v.startsWith('data:application/pdf');
  if (isFile || /^https?:\/\//i.test(v)) {
    return (
      <a href={v} target="_blank" rel="noopener noreferrer" title={v}
        className="text-primary-600 hover:text-primary-700 hover:underline font-medium">
        Click here
      </a>
    );
  }
  return <>{value || '—'}</>;
}

// The sheet row behind an FMS task (order no, client, …) as a "Header: value"
// strip under its description — without it every row of one step reads the
// same. Shared by the Dashboard and All Tasks tables.
export default function FmsDetails({ task }) {
  if (task.type !== 'FMS' || !task.details?.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
      {task.details.map(({ header, value }) => (
        <span key={header} className="inline-flex items-center gap-1">
          <span className="font-semibold text-slate-600">{header}:</span>
          <DetailValue value={value} />
        </span>
      ))}
    </div>
  );
}
