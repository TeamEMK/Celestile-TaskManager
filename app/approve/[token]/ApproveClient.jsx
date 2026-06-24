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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🔗</div>
        <h1 className="text-lg font-semibold text-slate-800 mb-2">Invalid Link</h1>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    </div>
  );

  if (!quotation) return null;

  const isPending = finalStatus === 'pending';

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">

        {/* Top bar */}
        <div className="h-1.5 w-full" style={{ background: branchColor }} />

        <div className="p-7">
          {/* Logo + brand */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-slate-100 flex items-center justify-center">
              <img src="/logo.jpeg" alt="Celestile" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-slate-800 leading-tight">Celestile Task Manager</div>
              <div className="text-[11px] font-semibold" style={{ color: branchColor }}>
                ● {branchLabel} Branch
              </div>
            </div>
          </div>

          <h1 className="text-[20px] font-bold text-slate-900 mb-1">Quotation Approval</h1>
          <p className="text-[12px] text-slate-400 mb-5">Review the quotation and approve or reject below.</p>

          {/* Quotation details card */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 mb-5 space-y-2.5">
            <Row label="Ref No"     value={quotation.refNo} />
            <Row label="Client"     value={quotation.clientName} />
            <Row label="Amount"     value={quotation.grandTotal ? `₹${quotation.grandTotal}` : '—'} bold />
            <Row label="Created by" value={quotation.createdByName} />
          </div>

          {/* Already actioned */}
          {!isPending && !done && (
            <div className={`rounded-xl p-5 text-center ${
              finalStatus === 'approved' ? 'bg-green-50' : 'bg-red-50'
            }`}>
              <div className="text-3xl mb-2">{finalStatus === 'approved' ? '✅' : '❌'}</div>
              <div className={`text-[15px] font-bold ${finalStatus === 'approved' ? 'text-green-700' : 'text-red-700'}`}>
                {finalStatus === 'approved' ? 'Already Approved' : 'Already Rejected'}
              </div>
              {quotation.approvedBy && (
                <div className="text-[12px] text-slate-500 mt-1">by {quotation.approvedBy}</div>
              )}
            </div>
          )}

          {/* Action done */}
          {done && (
            <div className={`rounded-xl p-5 text-center ${
              done === 'approved' ? 'bg-green-50' : 'bg-red-50'
            }`}>
              <div className="text-3xl mb-2">{done === 'approved' ? '✅' : '❌'}</div>
              <div className={`text-[15px] font-bold ${done === 'approved' ? 'text-green-700' : 'text-red-700'}`}>
                {done === 'approved' ? 'Approved Successfully!' : 'Rejected'}
              </div>
              <p className="text-[12px] text-slate-500 mt-1">Sales person ko WhatsApp pe notify kar diya gaya hai.</p>
            </div>
          )}

          {/* Action form */}
          {isPending && !done && (
            <div className="space-y-3">
              {error && (
                <div className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
              )}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Aapka Naam *
                </label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': branchColor }}
                  placeholder="Enter your name"
                  value={approverName}
                  onChange={e => setApproverName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Remarks (optional)
                </label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 resize-none"
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
                  className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white transition-opacity disabled:opacity-60"
                  style={{ background: '#16a34a' }}
                >
                  {submitting ? '…' : '✅  Approve'}
                </button>
                <button
                  onClick={() => act('rejected')}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white transition-opacity disabled:opacity-60"
                  style={{ background: '#dc2626' }}
                >
                  {submitting ? '…' : '❌  Reject'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between items-center text-[12.5px]">
      <span className="text-slate-500">{label}</span>
      <span className={`${bold ? 'font-bold text-[15px] text-slate-900' : 'font-medium text-slate-700'}`}>
        {value || '—'}
      </span>
    </div>
  );
}
