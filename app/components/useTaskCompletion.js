'use client';
// Shared "mark done with proof" + "FMS done" plumbing. DashboardClient and
// AllTasksClient carried byte-identical copies of this state machine (~87
// duplicated lines including the popup-blocking comment below).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { stepOpenUrl, selfCompletes, linkedStepAutoAnswers } from '@/lib/fmsOpenUrl';
import { fileToDataUrl } from '@/app/quotation/imageThumb';

export function useTaskCompletion() {
  const router = useRouter();
  const [fileTask,        setFileTask]        = useState(null);
  const [completionInput, setCompletionInput] = useState(null);
  const [fileUploading,   setFileUploading]   = useState(false);
  const [fmsDone,         setFmsDone]         = useState(null); // { fmsId, row, step }
  const [fmsDoneLoading,  setFmsDoneLoading]  = useState(false);
  const [fmsAssign,       setFmsAssign]       = useState(null); // { fmsId, row, step, currentDoer }

  // "Assign" / "Reassign" on an FMS row whose doer is picked per row (a step
  // with assigners). The step's doers list is the pool to choose from, and
  // that list only comes with the full step config, hence the fetch.
  async function openFmsAssign(task) {
    setFmsDoneLoading(true);
    try {
      const d = await fetch(`/api/fms-tasks/${task.fmsId}`).then((r) => r.json());
      const step = (d.steps || []).find((s) => String(s.id) === String(task.stepId));
      setFmsAssign({
        fmsId: task.fmsId,
        step: step || { id: task.stepId, doers: [], step_name: task.stepName || '' },
        currentDoer: task.needsAssign ? '' : (task.doer || ''),
        row: {
          sheetRowNumber: task.rowNumber,
          planValue: task.planValue,
          orderNo: task.orderNo || '',
          refValues: task.refValues || {},
          area: task.area || '',
          data: Object.fromEntries((task.details || []).map((x) => [x.header, x.value])),
        },
      });
    } finally {
      setFmsDoneLoading(false);
    }
  }

  async function openFmsDone(task) {
    // Opened synchronously, before the await below, so it still counts as a
    // direct response to the click — an async-deferred window.open gets
    // silently popup-blocked by most browsers.
    // A page that completes the step itself (Inventory Step 2) is the whole
    // job: it opens in this tab instead, and the Mark Done form is skipped
    // unless the step asks for something that page can't answer.
    const linked = task.openUrl ? stepOpenUrl(task.openUrl, task) : '';
    const self = selfCompletes(linked);
    if (linked && !self) window.open(linked, '_blank', 'noopener');
    setFmsDoneLoading(true);
    try {
      const d = await fetch(`/api/fms-tasks/${task.fmsId}`).then((r) => r.json());
      const step = (d.steps || []).find((s) => String(s.id) === String(task.stepId));
      if (self && step && linkedStepAutoAnswers(step.extraRows)) { window.location.assign(linked); return; }
      setFmsDone({
        fmsId: task.fmsId,
        step: step || { id: task.stepId, extraRows: [] },
        row: {
          sheetRowNumber: task.rowNumber,
          planValue: task.planValue,
          orderNo: task.orderNo || '',
          refValues: task.refValues || {},
          area: task.area || '',
          data: Object.fromEntries((task.details || []).map((x) => [x.header, x.value])),
        },
      });
    } finally {
      setFmsDoneLoading(false);
    }
  }

  async function submitCompletionFile() {
    if (!fileTask || !completionInput) return;
    setFileUploading(true);
    try {
      const dataUrl = await fileToDataUrl(completionInput);
      if (fileTask.type === 'Checklist') {
        await fetch('/api/checklist-completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ masterId: fileTask.id, file: dataUrl }),
        });
      } else {
        await fetch('/api/delegations', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: fileTask.id, status: 'done', completionFile: dataUrl }),
        });
      }
      setFileTask(null); setCompletionInput(null);
      router.refresh();
    } catch {
      // keep the modal open so the person can retry
    } finally {
      setFileUploading(false);
    }
  }

  return {
    fileTask, setFileTask, completionInput, setCompletionInput, fileUploading,
    submitCompletionFile, fmsDone, setFmsDone, fmsDoneLoading, openFmsDone,
    fmsAssign, setFmsAssign, openFmsAssign,
  };
}
