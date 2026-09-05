'use client';
// "Upload Proof of Completion" modal — pairs with useTaskCompletion. Was
// duplicated verbatim in DashboardClient and AllTasksClient.
import Icon from './Icon';
import { Modal } from './ui';

export default function CompletionFileModal({ task, input, setInput, uploading, onClose, onSubmit }) {
  if (!task) return null;
  return (
    <Modal onClose={onClose} closable={!uploading} maxW="max-w-sm" className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 grid place-items-center shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Upload Proof of Completion</h3>
            <p className="text-[12px] text-slate-500 mt-0.5">A file is required to mark this task as done</p>
          </div>
        </div>
        <p className="text-[12px] text-slate-600 bg-slate-50 rounded-lg p-3 mb-4 line-clamp-2">{task.description}</p>
        <label className="block cursor-pointer border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-primary-300 hover:bg-primary-50 transition mb-4">
          {input
            ? <span className="text-sm font-medium text-slate-700"><Icon name="paperclip" className="w-3.5 h-3.5" /> {input.name}</span>
            : <><span className="text-2xl block mb-1"><Icon name="arrowUp" className="w-3.5 h-3.5" /></span><span className="text-sm text-slate-500">Click to choose Photo or PDF</span></>}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setInput(e.target.files?.[0] || null)} />
        </label>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} disabled={uploading} className="btn-secondary">Cancel</button>
          <button onClick={onSubmit} disabled={uploading || !input} className="btn-primary">
            {uploading ? 'Uploading…' : 'Submit & Mark Done'}
          </button>
        </div>
    </Modal>
  );
}
