/**
 * Design O2D, second version (flow agreed 30-10-2026) — the sheet layout
 * of the "Design FMS" tab and the FMS step config that reads it, built from
 * one table so the two can't drift apart.
 *
 *   Step 1   Jibin: 2D required? + picks the 2D (or, straight to 3D, the 3D) doer
 *   Step nA  the doer works (assigned by Jibin when nobody was picked yet)
 *   Step nB  Jibin reviews   — Not approved: he picks the doer, back to nA
 *   Step nC  CRM: Revision?  — Yes (with what to change + a photo): back to
 *                              nA for Jibin to assign; No = approved
 *   (sending back: lib/fmsRework.js)
 *
 * for n = 2D drawing, 3D drawing, jointing detail, electrical drawing,
 * program to factory, installation PDF. Time allowed (30-10-2026): Step 1
 * (Jibin assigns) and Jibin's reviews 30 minutes, CRM approval 1 working
 * day; the work steps keep the days the old FMS tab gave them.
 *
 * 02-11-2026 (meeting with Vivek sir): the CRM step asks "Revision?" instead
 * of "Approved?" — the files go to the client by mail, the CRM only says
 * whether a change is wanted. Its photo columns sit after every other
 * column so the sheet's existing formulas keep their letters
 * (lib/designRevisionMigrate.js switched the live config).
 *
 * Pure (no app imports): the one-off script that lays out the tab uses it too.
 */

export const DESIGN_SHEET_ID = '1Vv-iJDo60FCO5DNSvE_sAFAyS_Mr_oXMQ2WQFTwYGgE';
export const OLD_TAB = 'FMS';
export const NEW_TAB = 'Design FMS';
export const HEADER_ROW = 6;
export const REVIEW_HOURS = 0.5;
export const CRM_DAYS = 1;

const GROUPS = [
  { n: 2, work: 'Work On 2D Drawing',  tag: '2D',          days: 4, upload: '2D Drawing', noUpload: true, oldWork: /^step\s*2\b/i, oldAlso: /^step\s*3\b/i },
  { n: 3, work: 'Work On 3D Drawing',  tag: '3D',          days: 8, upload: '3D Drawing', noUpload: true, oldWork: /^step\s*4\b/i, oldAlso: /^step\s*5\b/i },
  { n: 4, work: 'Jointing Detail',     tag: 'Jointing',    days: 1, upload: 'Jointing Detail',    oldWork: /^step\s*6\b/i },
  { n: 5, work: 'Electrical Drawing',  tag: 'Electrical',  days: 1, upload: 'Electrical Drawing', oldWork: /^step\s*7\b/i },
  { n: 6, work: 'Program To Factory',  tag: 'Program',     days: 4, upload: 'Layout PDF',         oldWork: /^step\s*8\b/i },
  { n: 7, work: 'Installation PDF',    tag: 'Installation', days: 1, upload: 'Installation PDF',  oldWork: /^step\s*9\b/i },
];

export function colName(idx) {
  let n = idx + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * The whole layout: columns (letter, header, the "What"/"How"/"When" cells
 * above it) and each step's columns. Pure function of GROUPS.
 */
export function designLayout() {
  const cols = [];
  const add = (header, extra = {}) => { const letter = colName(cols.length); cols.push({ letter, header, ...extra }); return letter; };

  add('TIMESTAMP'); add('ORDER NUMBER'); add('Upload Design Folder');

  const step1 = { name: 'Step 1 - Check 2D/3D & Assign Doer' };
  step1.plan = add('1 Planned', { what: step1.name, how: 'hours', when: REVIEW_HOURS });
  step1.actual = add('1 Actual');
  step1.need2d = add('2D Required?');
  step1.doer = add('1 Doer');
  step1.delay = add('1 Time Delay');

  const groups = GROUPS.map((g) => {
    // Headers carry the step code ("2B Remarks"): a task card lists cells
    // by header, so two plain "Remarks" would overwrite each other.
    const A = `${g.n}A`, B = `${g.n}B`, C = `${g.n}C`;
    const work = { name: `Step ${A} - ${g.work}` };
    work.plan = add(`${A} Planned`, { what: work.name, how: 'days', when: g.days });
    work.actual = add(`${A} Actual`); work.doer = add(`${A} Doer`); work.upload = add(g.upload);
    work.remarks = add(`${A} Doer Remarks`); work.delay = add(`${A} Time Delay`);
    const review = { name: `Step ${B} - Jibin Review (${g.tag})` };
    review.plan = add(`${B} Planned`, { what: review.name, how: 'hours', when: REVIEW_HOURS });
    review.actual = add(`${B} Actual`); review.approved = add(`${B} Approved? (Jibin)`);
    review.remarks = add(`${B} Jibin Remarks`); review.delay = add(`${B} Time Delay`);
    const crm = { name: `Step ${C} - CRM Approval (${g.tag})` };
    crm.plan = add(`${C} Planned`, { what: crm.name, how: 'days', when: CRM_DAYS });
    crm.actual = add(`${C} Actual`); crm.approved = add(`${C} Revision? (CRM)`);
    crm.remarks = add(`${C} CRM Revision Remarks`); crm.delay = add(`${C} Time Delay`);
    const count = add(`Step ${g.n} Rejections`);
    const rejectedAt = add(`Step ${g.n} Last Rejected At`);
    return { ...g, work, review, crm, count, rejectedAt };
  });
  // Added 02-11-2026, after every other column (see the header comment).
  groups.forEach((g) => { g.crm.photo = add(`${g.n}C Revision Photo`); });
  // The New Entry form's stone details (04-11-2026), after those again.
  const intake = { sft: add('SFT'), stoneType: add('Stone Type'), thickness: add('Thickness') };
  // …and the area and technology (asked the same day).
  intake.area = add('Area Name');
  intake.technology = add('Technology');

  return { cols, step1, groups, intake };
}

// Same departments as the Factory O2D form's Technology.
const TECHNOLOGIES = 'CNC,SLAB,INLAY,OVERLAY,SCOOPING,PRINTING,STAMPING,SAND BLASTING,HAND CASTED,RESIN,METAL';

// The New Entry form fields that fill those columns, in form order. "Stone
// Type" is the material a "Thickness" field narrows its inventory list by
// (lib/imsFields.js).
export const intakeStoneFields = ({ intake }) => [
  { field_label: 'Area Name', col_letter: intake.area, field_type: 'text' },
  { field_label: 'Technology', col_letter: intake.technology, field_type: 'dropdown', dropdown_options: TECHNOLOGIES },
  { field_label: 'SFT', col_letter: intake.sft, field_type: 'number' },
  { field_label: 'Stone Type', col_letter: intake.stoneType, field_type: 'text' },
  { field_label: 'Thickness', col_letter: intake.thickness, field_type: 'thickness' },
];

/**
 * The Planned formulas of one sheet row, as { colLetter: formula }.
 * Work steps: WORKDAY on from the later of "the step before was done" and
 * "last sent back", keeping the time of day (as the old tab did). Review /
 * Step 1: +30 minutes; CRM: +1 working day.
 */
export function plannedFormulas(r, layout = designLayout()) {
  const { step1, groups } = layout;
  const f = {};
  const hrs = (from, at) => `=IF(${from}${r}="","",${from}${r}+${at}$5/24)`;
  const days = (start, g) => `=LET(s,${start},IF(s="","",LET(b,MAX(s,N(${g.rejectedAt}${r})),WORKDAY.INTL(b,${g.work.plan}$5,"0000001",Holidays!A:A)+MOD(b,1))))`;

  // Working days on from `from`, keeping the time of day.
  const wd = (from, at) => `=IF(${from}${r}="","",WORKDAY.INTL(${from}${r},${at}$5,"0000001",Holidays!A:A)+MOD(${from}${r},1))`;

  f[step1.plan] = hrs('A', step1.plan);
  groups.forEach((g, i) => {
    let start;
    if (g.n === 2) start = `IF(AND(${step1.actual}${r}<>"",${step1.need2d}${r}="Yes"),${step1.actual}${r},"")`;
    else if (g.n === 3) start = `IF(${step1.need2d}${r}="No",${step1.actual}${r},IF(${step1.need2d}${r}="Yes",${groups[0].crm.actual}${r},""))`;
    else start = `IF(${groups[i - 1].crm.actual}${r}="","",${groups[i - 1].crm.actual}${r})`;
    f[g.work.plan] = days(start, g);
    f[g.review.plan] = hrs(g.work.actual, g.review.plan);
    f[g.crm.plan] = wd(g.review.actual, g.crm.plan);
  });
  return f;
}

// "Revision? Yes" must say what to change and show it.
export const crmRevisionRows = (crm) => [
  { label: 'What revision is needed?', col_letter: crm.remarks, field_type: 'text', required: 1, depends_on: crm.approved, depends_value: 'Yes' },
  { label: 'Revision Photo', col_letter: crm.photo, field_type: 'upload', required: 1, depends_on: crm.approved, depends_value: 'Yes' },
];

// Jibin's review remarks: asked only when he rejects ("Approved? No"), and
// then required — they tell the doer what to fix.
export const reviewRemarksRow = (g) => ({
  label: 'Remarks', col_letter: g.review.remarks, field_type: 'text', required: 1, depends_on: g.review.approved, depends_value: 'No',
});

/**
 * The FMS step config (the shape updateFmsSheet takes). `pick(name)` turns
 * a user name into ids; `oldPool(re)` gives the doer ids of the old step
 * whose name matches, so the designers carry over.
 */
export function designSteps({ jibin = [], crm = [], oldPool = () => [] }, layout = designLayout()) {
  const { step1, groups } = layout;
  const idx = (letter) => layout.cols.findIndex((c) => c.letter === letter);
  const base = [idx('A'), idx('B'), idx('C')];
  // alert_on "never": a Yes/No dropdown otherwise holds the step as a failed
  // QC check (lib/fieldVisibility.js alertWhen) — "2D Required? Yes" was
  // read as a problem. A "No" on Approved? is the send-back, not an alert.
  const yesNo = (label, col, extra = {}) => ({ label, col_letter: col, field_type: 'dropdown', dropdown_options: 'Yes,No', required: 1, alert_on: 'never', ...extra });

  const steps = [{
    stepName: step1.name, planCol: step1.plan, actualCol: step1.actual,
    doers: jibin, assigners: [], doerNameCol: step1.doer, delayReasonCol: step1.delay,
    showCols: base, extraInput: 'yes',
    extraRows: [
      yesNo('2D Required?', step1.need2d),
      { label: '2D Doer', col_letter: groups[0].work.doer, field_type: 'dropdown', dropdown_options: '@doers:Step 2A', required: 1, depends_on: step1.need2d, depends_value: 'Yes' },
      { label: '3D Doer', col_letter: groups[1].work.doer, field_type: 'dropdown', dropdown_options: '@doers:Step 3A', required: 1, depends_on: step1.need2d, depends_value: 'No' },
    ],
  }];

  groups.forEach((g, i) => {
    const earlierUploads = groups.slice(0, i).map((x) => idx(x.work.upload));
    const feedback = [idx(g.review.remarks), idx(g.crm.remarks), idx(g.count)];
    const pool = [...new Set([...oldPool(g.oldWork), ...(g.oldAlso ? oldPool(g.oldAlso) : [])])];
    steps.push({
      stepName: g.work.name, planCol: g.work.plan, actualCol: g.work.actual,
      doers: pool, assigners: jibin, doerNameCol: g.work.doer, delayReasonCol: g.work.delay,
      showCols: [...base, ...earlierUploads, ...feedback], extraInput: 'yes',
      extraRows: [
        // 2D / 3D drawings go to the team by mail (03-11-2026), not uploaded here.
        ...(g.noUpload ? [] : [{ label: g.upload, col_letter: g.work.upload, field_type: 'upload', required: 0 }]),
        { label: 'Remarks', col_letter: g.work.remarks, field_type: 'text', required: 0 },
      ],
    });
    const workView = [...base, ...earlierUploads, idx(g.work.doer), idx(g.work.upload), idx(g.work.remarks), idx(g.count)];
    steps.push({
      stepName: g.review.name, planCol: g.review.plan, actualCol: g.review.actual,
      doers: jibin, assigners: [], doerNameCol: '', delayReasonCol: g.review.delay,
      showCols: workView, extraInput: 'yes',
      extraRows: [
        yesNo('Approved?', g.review.approved),
        { label: 'Send back to (doer)', col_letter: g.work.doer, field_type: 'dropdown', dropdown_options: `@doers:Step ${g.n}A`, required: 1, depends_on: g.review.approved, depends_value: 'No' },
        // Only on a rejection, and then it must say why (03-11-2026).
        reviewRemarksRow(g),
      ],
    });
    steps.push({
      stepName: g.crm.name, planCol: g.crm.plan, actualCol: g.crm.actual,
      doers: crm, assigners: [], doerNameCol: '', delayReasonCol: g.crm.delay,
      showCols: [...workView, idx(g.review.remarks)], extraInput: 'yes',
      extraRows: [
        yesNo('Revision?', g.crm.approved),
        ...crmRevisionRows(g.crm),
      ],
    });
  });
  return steps;
}
