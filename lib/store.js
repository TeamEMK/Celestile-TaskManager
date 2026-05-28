/**
 * Hybrid data store:
 *  - If POSTGRES_URL / DATABASE_URL env var is set → uses Postgres (lib/store-postgres.js).
 *  - If DB_HOST env var is set → uses MySQL (lib/store-mysql.js).
 *  - Otherwise → reads/writes data/store.json (good for local dev + offline work).
 *
 * Both modes expose the same shape:
 *   readStore()  -> { users, delegations, masters, holidays, fms, profile, approvals }
 *   writeStore(data)
 */
import fs from 'fs/promises';
import path from 'path';

// Static imports — required for Vercel (dynamic imports are not supported)
import { readStoreDb as readStoreDbPg, writeStoreDb as writeStoreDbPg } from './store-postgres.js';
import { readStoreDb as readStoreDbMysql, writeStoreDb as writeStoreDbMysql } from './store-mysql.js';
import { FMS_ENABLED } from './config.js';

const USE_POSTGRES = !!(process.env.POSTGRES_URL || process.env.DATABASE_URL);
const USE_MYSQL    = !USE_POSTGRES && !!process.env.DB_HOST;
const USE_DB       = USE_POSTGRES || USE_MYSQL;

export const FMS_STEPS = [
  { name: 'New Client Order Confirmation', who: 'Sales Team', how: 'Google Form' },
  { name: 'Draft Campaign Plan & Budgeting', who: 'Doer', how: 'Google Sheet' },
  { name: 'Plan Meeting & Get Plan Approved', who: 'Doer', how: 'Zoom + G-Sheets' },
  { name: 'KW Analysis + Grouping', who: 'Doer', how: 'Whatsapp' },
  { name: 'Receive Negative KW', who: 'Doer', how: 'G-Sheets' },
  { name: 'Ad Content', who: 'Content Team', how: 'Google Drive' },
  { name: 'Ad Content Approval', who: 'Doer', how: 'Ad Account' },
  { name: 'Make Campaigns Live', who: 'Doer', how: 'Ad Account' },
];

export const DEPARTMENTS = [
  'CXO', 'Business Automation', 'Social Media', 'Graphic Designing',
  'Google Ads', 'SEO', 'Meta Ads', 'Content Writing', 'AI',
  'Website Design & Development', 'MDO', 'eMarketing Accounts'
];

export const ROLES = ['Admin', 'User', 'HOD'];

/* =====================================================================
   PUBLIC API — auto-routes to Postgres / MySQL / JSON based on env
   ===================================================================== */

export async function readStore() {
  return USE_DB ? readStoreDb() : readStoreJson();
}

export async function writeStore(data) {
  return USE_DB ? writeStoreDb(data) : writeStoreJson(data);
}

/* =====================================================================
   DB IMPLEMENTATION (static imports — works on Vercel)
   ===================================================================== */

async function readStoreDb() {
  return USE_POSTGRES ? readStoreDbPg() : readStoreDbMysql();
}

async function writeStoreDb(data) {
  return USE_POSTGRES ? writeStoreDbPg(data) : writeStoreDbMysql(data);
}

/* =====================================================================
   JSON IMPLEMENTATION (default, local dev)
   ===================================================================== */

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const SEED_USERS = [
  { name: 'Abhishek Jain', email: 'abhishek@e-marketing.io', phone: '9602684444', department: 'CXO', roles: ['Admin'] },
  { name: 'Akhilesh Vyas', email: 'vyas.akhilesh@e-marketing.io', phone: '7048462985', department: 'Business Automation', roles: ['Admin', 'HOD'] },
  { name: 'Akshita Jain', email: 'jain.akshita@e-marketing.io', phone: '7340302359', department: 'Social Media', roles: ['User'] },
  { name: 'Aman Bejal', email: 'bejal.aman@e-marketing.io', phone: '6376724283', department: 'Graphic Designing', roles: ['User'] },
  { name: 'Aman Pareek', email: 'pareek.aman@e-marketing.io', phone: '7507905684', department: 'Business Automation', roles: ['Admin', 'User'] },
  { name: 'Ankit Ladha', email: 'ladha.ankit@e-marketing.io', phone: '7737270516', department: 'Google Ads', roles: ['User'] },
  { name: 'Ashish Jha', email: 'seo@e-marketing.io', phone: '9024736048', department: 'SEO', roles: ['User'] },
  { name: 'Bhanu Sharma', email: 'sharma.bhanu@e-marketing.io', phone: '9351842255', department: 'SEO', roles: ['User'] },
  { name: 'Chetna Agrawal', email: 'chetna@e-marketing.io', phone: '8238999732', department: 'CXO', roles: ['User'] },
  { name: 'Ching Thakral', email: 'googlexecutive@e-marketing.io', phone: '9988716423', department: 'Google Ads', roles: ['User'] },
  { name: 'Divvy Jain', email: 'jain.divvy@e-marketing.io', phone: '8769533770', department: 'Meta Ads', roles: ['User'] },
  { name: 'Divya Srivastava', email: 'srivastava.divya@e-marketing.io', phone: '9001798754', department: 'Graphic Designing', roles: ['User'] },
  { name: 'Garvit Kedia', email: 'kedia.garvit@e-marketing.io', phone: '9782800257', department: 'Meta Ads', roles: ['User'] },
  { name: 'Gaurav Gupta', email: 'gupta.gaurav@e-marketing.io', phone: '9155836021', department: 'Website Design & Development', roles: ['User'] },
  { name: 'Harsh Daharwal', email: 'daharwal.harsh@e-marketing.io', phone: '9596896449', department: 'Business Automation', roles: ['Admin', 'User'] },
  { name: 'Kritika Saini', email: 'saini.kritika@e-marketing.io', phone: '8696482750', department: 'Google Ads', roles: ['User'] },
  { name: 'Kushagra Dubey', email: 'dubey.kushagra@e-marketing.io', phone: '8203058282', department: 'Meta Ads', roles: ['User'] },
  { name: 'Mohit Kumawat', email: 'kumawat.mohit@e-marketing.io', phone: '6290552269', department: 'Content Writing', roles: ['User'] },
  { name: 'Nikita Khandelwal', email: 'khandelwal.nikita@e-marketing.io', phone: '8306660792', department: 'MDO', roles: ['Admin', 'User'] },
  { name: 'Nisha Madaan', email: 'madaan.nisha@e-marketing.io', phone: '9988820092', department: 'Google Ads', roles: ['User'] },
  { name: 'Nupur Kothari', email: 'kothari.nupur@e-marketing.io', phone: '9314050398', department: 'Graphic Designing', roles: ['User'] },
  { name: 'Pradhuman Kumar', email: 'pradhuman@e-marketing.io', phone: '7973006643', department: 'Google Ads', roles: ['HOD'] },
  { name: 'Priya Saini', email: 'saini.priya@e-marketing.io', phone: '9652295500', department: 'SEO', roles: ['User'] },
  { name: 'Purvi Saini', email: 'saini.purvi@e-marketing.io', phone: '9301878061', department: 'MDO', roles: ['Admin', 'User'] },
  { name: 'Rahul Maharchandani', email: 'maharchandani.rahul@e-marketing.io', phone: '8302671330', department: 'AI', roles: ['HOD'] },
  { name: 'Ritu Tilokani', email: 'tilokani.ritu@e-marketing.io', phone: '9772779351', department: 'Content Writing', roles: ['HOD'] },
  { name: 'Sakshi Saini', email: 'sakshi.saini@e-marketing.io', phone: '9530000022', department: 'Google Ads', roles: ['User'] },
  { name: 'Satish Khichi', email: 'khichi.satish@e-marketing.io', phone: '9530000023', department: 'Google Ads', roles: ['User'] },
  { name: 'Saurav Pareek', email: 'pareek.saurav@e-marketing.io', phone: '9530000024', department: 'Social Media', roles: ['User'] },
  { name: 'Swati Joshi', email: 'joshi.swati@e-marketing.io', phone: '9530000025', department: 'Content Writing', roles: ['User'] },
  { name: 'Tushar Chauhan', email: 'chauhan.tushar@e-marketing.io', phone: '9530000026', department: 'Website Design & Development', roles: ['User'] },
  { name: 'Vishal Jaga', email: 'mis1@e-marketing.io', phone: '00756492939', department: 'MDO', roles: ['Admin'] },
];

const SEED_DELEGATIONS = [
  { desc: 'Need to automate the Advance Qualified Leads data (Last 90 Days in the Google Sheet)', doer: 'Akhilesh Vyas', date: '2026-04-08', client: '' },
  { desc: 'Need to Connect the Google ads account to the Claude.ai', doer: 'Akhilesh Vyas', date: '2026-04-07', client: '' },
  { desc: 'Start Curiosity based ads', doer: 'Saurav Pareek', date: '2026-04-08', client: '' },
  { desc: 'Ads Video Start for GLP', doer: 'Saurav Pareek', date: '2026-04-11', client: '' },
  { desc: '3 new shoot videos- Ads to be started including GLP', doer: 'Saurav Pareek', date: '2026-04-21', client: '' },
  { desc: 'Content for new video in which we have to write high value offer and content for summer play also...', doer: 'Ritu Tilokani', date: '2026-04-22', client: 'Hero Play' },
  { desc: 'Create google form and tasks - Employee Onboarding Process', doer: 'Vishal Jaga', date: '2026-05-04', client: '' },
  { desc: 'Speed is slow', doer: 'Satish Khichi', date: '2026-05-05', client: '' },
  { desc: 'Google review widget on home page', doer: 'Satish Khichi', date: '2026-05-06', client: '' },
];

const SEED_HOLIDAYS = [
  { date: '2026-01-26', name: 'Republic Day', type: 'National' },
  { date: '2026-03-14', name: 'Holi', type: 'Festival' },
  { date: '2026-08-15', name: 'Independence Day', type: 'National' },
  { date: '2026-10-02', name: 'Gandhi Jayanti', type: 'National' },
  { date: '2026-11-08', name: 'Diwali', type: 'Festival' },
];

const SEED_CHECKLIST_MASTERS = [
  { task: 'Daily Standup Meeting', assignedTo: 'All HODs', frequency: 'Daily' },
  { task: 'Weekly Client Report', assignedTo: 'Account Managers', frequency: 'Weekly' },
  { task: 'Monthly Budget Review', assignedTo: 'Pradhuman Kumar', frequency: 'Monthly' },
  { task: 'Quarterly Performance Review', assignedTo: 'All Employees', frequency: 'Monthly' },
];

async function ensureStoreJson() {
  try { await fs.access(STORE_FILE); }
  catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await seedStoreJson();
  }
}

async function seedStoreJson() {
  const users = SEED_USERS.map((u, i) => ({
    id: 'U' + (i + 1).toString().padStart(3, '0'),
    ...u, active: true, createdAt: new Date().toISOString(),
  }));
  const delegations = SEED_DELEGATIONS.map((d, i) => {
    const user = users.find((u) => u.name === d.doer);
    return {
      id: 'DEL' + (i + 1).toString().padStart(3, '0'),
      description: d.desc, doerId: user?.id || null, doer: d.doer,
      delegatedBy: 'U001', dueDate: d.date, client: d.client || '',
      status: 'pending', type: 'delegation',
      createdAt: new Date().toISOString(),
    };
  });
  const masters = SEED_CHECKLIST_MASTERS.map((m, i) => ({
    id: 'CHK' + (i + 1).toString().padStart(3, '0'),
    ...m, createdAt: new Date().toISOString(),
  }));
  const holidays = SEED_HOLIDAYS.map((h, i) => ({
    id: 'HOL' + (i + 1).toString().padStart(3, '0'), ...h,
  }));
  const initial = {
    users, delegations, masters, holidays, fms: [],
    approvals: { tasks: [], transfers: [], leaves: [] },
    profile: { userId: 'U032', notificationEmail: 'yourrealemail@gmail.com' },
  };
  await fs.writeFile(STORE_FILE, JSON.stringify(initial, null, 2));
}

async function readStoreJson() {
  await ensureStoreJson();
  const raw = await fs.readFile(STORE_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeStoreJson(data) {
  await ensureStoreJson();
  await fs.writeFile(STORE_FILE, JSON.stringify(data, null, 2));
}

/* =====================================================================
   Pure helpers (used in pages, no IO)
   ===================================================================== */

export function buildPlannedSteps(startDate = new Date()) {
  return FMS_STEPS.map((_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i + 1);
    return { planned: d.toISOString(), actual: null };
  });
}

export function computeDashboard(store, filter = 'all') {
  let total = 0, completed = 0, pending = 0, revised = 0;
  const items = [];
  const now = new Date();

  if (filter === 'all' || filter === 'delegation') {
    (store.delegations || []).forEach((d) => {
      // approval_pending tasks admin ke approval ka wait kar rahe hain — regular list mein nahi
      if (d.status === 'approval_pending') return;
      total++;
      if (d.status === 'done') completed++;
      else if (d.status === 'revise') { pending++; revised++; }
      else {
        pending++;
        if (d.status === 'revise_requested') revised++;
        items.push({
          id: d.id,
          doerId: d.doerId,
          type: 'Delegation',
          description: d.description,
          doer: d.doer,
          date: d.dueDate || d.due_date,
          client: d.client || '-',
          overdue: new Date(d.dueDate || d.due_date) < now,
          status: d.status || 'pending',
          remarks: d.remarks || '',
        });
      }
    });
  }

  if (filter === 'all' || filter === 'checklist') {
    (store.masters || []).forEach((m) => {
      // Checklist masters are recurring task templates (no per-occurrence
      // status), so we surface each one as a pending item that's "due today".
      total++;
      pending++;
      items.push({
        id: m.id,
        doerId: m.doerId || null,
        type: 'Checklist',
        description: m.task,
        doer: m.assignedTo,
        date: now.toISOString(),
        client: '-',
        overdue: false,
        status: 'pending',
      });
    });
  }

  if (FMS_ENABLED && (filter === 'all' || filter === 'fms')) {
    (store.fms || []).forEach((entry) => {
      entry.steps.forEach((s, idx) => {
        if (!s.planned) return;
        total++;
        if (s.actual) completed++;
        else {
          pending++;
          items.push({
            id: entry.id + '-' + idx, type: 'FMS',
            description: FMS_STEPS[idx].name + ' — ' + entry.clientName,
            doer: entry.doer || '-', date: s.planned, client: entry.clientName,
            overdue: new Date(s.planned || s.due_date) < now, status: 'pending',
          });
        }
      });
    });
  }

  return {
    total, completed, pending, revised,
    pendingTasks: items.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)).slice(0, 50),
  };
}

export function computePerformance(store, fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  to.setHours(23, 59, 59);

  const stats = {};
  (store.users || []).forEach((u) => {
    stats[u.name] = { name: u.name, completed: 0, total: 0, pending: 0 };
  });

  (store.delegations || []).forEach((d) => {
    const date = new Date(d.createdAt);
    if (date >= from && date <= to && stats[d.doer]) {
      stats[d.doer].total++;
      if (d.status === 'done') stats[d.doer].completed++;
      else stats[d.doer].pending++;
    }
  });

  const arr = Object.values(stats).filter((s) => s.total > 0);
  arr.sort((a, b) => b.completed - a.completed);

  return {
    top5: arr.slice(0, 5),
    bottom5: [...arr].sort((a, b) => b.pending - a.pending).slice(0, 5),
    mostActive: [...arr].sort((a, b) => b.total - a.total).slice(0, 5),
  };
}