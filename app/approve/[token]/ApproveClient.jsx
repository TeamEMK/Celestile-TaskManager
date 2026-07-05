'use client';
import { useState } from 'react';

export default function ApproveClient({ token, quotation: initial, initError }) {
  const [quotation] = useState(initial);
  const [approverName, setApproverName] = useState('');
  const [reason, setReason]             = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [done, setDone]                 = useState(null);
  const [error, setError]               = useState(initError || null);
  const [finalStatus, setFinalStatus]   = useState(initial?.status || 'pending');

  const isHyd = (quotation?.branch || '').toLowerCase().includes('hyd');
  const branchLabel = isHyd ? 'Hyderabad' : 'Bangalore';
  const branchColor = isHyd ? '#7c3aed' : '#2563eb';

  async function act(action) {
    if (!approverName.trim()) { alert('Apna naam enter karo'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/quotations/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, approverName: approverName.trim(), reason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); setSubmitting(false); return; }
      setDone(action);
      setFinalStatus(action);
    } catch (e) {
      setError(e.message);
    }
    setSubmitting(false);
  }

  if (error && !quotation) return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-5 overflow-y-auto">
      <div className="app-bg" aria-hidden="true">
        <div className="orb" style={{ width: 460, height: 460, top: -140, left: -100, background: 'radial-gradient(circle, rgba(232,200,154,0.55), transparent 70%)', animation: 'app-drift1 20s ease-in-out infinite' }} />
        <div className="orb" style={{ width: 400, height: 400, bottom: -160, right: -100, background: 'radial-gradient(circle, rgba(200,138,84,0.42), transparent 70%)', animation: 'app-drift2 24s ease-in-out infinite' }} />
      </div>
      <div className="relative z-10 w-full max-w-sm card-glass shadow-glass rounded-2xl p-8 text-center animate-pop-in">
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="font-display text-[20px] font-semibold text-slate-900 mb-1.5">Invalid Link</h1>
        <p className="text-[13px] text-slate-500 leading-relaxed">{error}</p>
      </div>
    </div>
  );

  if (!quotation) return null;

  const isPending = finalStatus === 'pending';

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto">
      <div className="app-bg" aria-hidden="true">
        <div className="orb" style={{ width: 560, height: 560, top: -180, left: -140, background: 'radial-gradient(circle, rgba(232,200,154,0.55), transparent 70%)', animation: 'app-drift1 20s ease-in-out infinite' }} />
        <div className="orb" style={{ width: 500, height: 500, bottom: -200, right: -140, background: 'radial-gradient(circle, rgba(200,138,84,0.42), transparent 70%)', animation: 'app-drift2 24s ease-in-out infinite' }} />
        <div className="orb" style={{ width: 420, height: 420, top: '35%', left: '55%', background: 'radial-gradient(circle, rgba(248,235,205,0.55), transparent 70%)', animation: 'app-drift3 26s ease-in-out infinite' }} />
      </div>

      <div className="relative z-10 min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md animate-pop-in">
          <div className="card-glass shadow-glass rounded-2xl overflow-hidden">
            <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${branchColor}, transparent)` }} />

            <div className="p-6 sm:p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl overflow-hidden bg-white border border-slate-200/70 shadow-card flex items-center justify-center shrink-0">
                  <img src="/logo.jpeg" alt="Celestile" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-slate-800 leading-tight truncate">Celestile Task Manager</div>
                  <div className="pill mt-1" style={{ background: `${branchColor}1a`, color: branchColor }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: branchColor }} />
                    {branchLabel} Branch
                  </div>
                </div>
              </div>

              <h1 className="font-display text-[21px] font-semibold text-slate-900 mb-1">Quotation Approval</h1>
              <p className="text-[12.5px] text-slate-500 mb-5">Review the quotation and approve or reject below.</p>

              <div className="rounded-xl border border-slate-200/70 bg-white/60 p-4 mb-5 space-y-2.5">
                <Row label="Ref No"     value={quotation.refNo} />
                <Row label="Client"     value={quotation.clientName} />
                <Row label="Amount"     value={quotation.grandTotal ? `₹${quotation.grandTotal}` : '—'} bold />
                <Row label="Created by" value={quotation.createdByName} />
              </div>

              {!isPending && !done && (
                <div className={`rounded-xl p-6 text-center animate-pop-in ${finalStatus === 'approved' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <StatusIcon kind={finalStatus === 'approved' ? 'check' : 'x'} />
                  <div className={`font-display text-[17px] font-semibold mt-3 ${finalStatus === 'approved' ? 'text-emerald-700' : 'text-red-700'}`}>
                    {finalStatus === 'approved' ? 'Already Approved' : 'Already Rejected'}
                  </div>
                  {quotation.approvedBy && (
                    <div className="text-[12.5px] text-slate-500 mt-1">by {quotation.approvedBy}</div>
                  )}
                </div>
              )}

              {done && (
                <div className={`rounded-xl p-6 text-center animate-pop-in ${done === 'approved' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <StatusIcon kind={done === 'approved' ? 'check' : 'x'} />
                  <div className={`font-display text-[17px] font-semibold mt-3 ${done === 'approved' ? 'text-emerald-700' : 'text-red-700'}`}>
                    {done === 'approved' ? 'Approved Successfully!' : 'Rejected'}
                  </div>
                  <p className="text-[12.5px] text-slate-500 mt-1">Sales person ko WhatsApp pe notify kar diya gaya hai.</p>
                </div>
              )}

              {isPending && !done && (
                <div className="space-y-3.5">
                  {error && (
                    <div className="text-[12px] font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
                  )}
                  <div>
                    <label className="label">Aapka Naam *</label>
                    <input
                      className="input"
                      placeholder="Enter your name"
                      value={approverName}
                      onChange={e => setApproverName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Remarks (optional)</label>
                    <textarea
                      className="input resize-none"
                      rows="2"
                      placeholder="Add a comment..."
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => act('approved')}
                      disabled={submitting}
                      className="btn-success flex-1 !py-3 !rounded-xl !text-[13.5px] !gap-2"
                    >
                      {submitting ? <Spinner /> : (<><CheckIcon /> Approve</>)}
                    </button>
                    <button
                      onClick={() => act('rejected')}
                      disabled={submitting}
                      className="btn-danger flex-1 !py-3 !rounded-xl !text-[13.5px] !gap-2"
                    >
                      {submitting ? <Spinner /> : (<><XIcon /> Reject</>)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-4">
            <span className="font-semibold text-primary-600">Celestile-TaskManager</span>
            <span className="mx-1.5 text-slate-300">·</span>
            Grow Your Business
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between items-center text-[12.5px] gap-3">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`text-right truncate ${bold ? 'font-bold text-[15px] text-slate-900' : 'font-medium text-slate-700'}`}>
        {value || '—'}
      </span>
    </div>
  );
}

function StatusIcon({ kind }) {
  const approved = kind === 'check';
  return (
    <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${approved ? 'bg-emerald-100' : 'bg-red-100'}`}>
      {approved ? (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
