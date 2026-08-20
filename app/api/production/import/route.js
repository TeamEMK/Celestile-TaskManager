import { requireUser, json, fail } from '@/lib/api';
import { listDepartments } from '@/lib/production';
import { parseProductionWorkbook } from '@/lib/productionImport';

// 10 MB. A day's report is a few hundred KB — anything past this is not one
// of these files, and parsing it would tie the server up for no reason.
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Read the factory's Excel day-report and hand back what it contains.
 *
 * This saves NOTHING. The import screen shows the parsed blocks first — which
 * department each one landed on, how many rows, what was skipped — and only
 * then writes them, one block at a time, through the same
 * POST /api/production/day the manual form uses. That keeps a mis-read file a
 * preview to correct rather than a day of the report to undo.
 */
export async function POST(req) {
  const gate = await requireUser(); if (gate) return gate;
  try {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return fail('Attach the Excel file as "file"');
    if (file.size > MAX_BYTES) return fail(`That file is ${(file.size / 1048576).toFixed(1)} MB — the limit is 10 MB`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const departments = await listDepartments();
    const parsed = parseProductionWorkbook(buffer, { departments });
    return json({ fileName: file.name || '', ...parsed });
  } catch (err) {
    // A wrong file (a PDF renamed .xlsx, a corrupt download) surfaces from the
    // xlsx reader as something unhelpful like "Unsupported file" — say what
    // was actually expected instead.
    if (/unsupported|corrupt|zip|cfb|password/i.test(err?.message || '')) {
      return fail('That file could not be read as an Excel workbook. Save it as .xlsx and try again — a password-protected file has to be unlocked first.');
    }
    return fail(err.message, 500);
  }
}
