import { NextResponse } from 'next/server';
import { pool, ensureSchema } from '@/lib/db';

const USERS = [
  { id:'U001',name:'Abhishek Jain',email:'abhishek@e-marketing.io',phone:'9602684444',department:'CXO',roles:'Admin',active:1 },
  { id:'U002',name:'Akhilesh Vyas',email:'vyas.akhilesh@e-marketing.io',phone:'7048462985',department:'Business Automation',roles:'Admin,HOD',active:1 },
  { id:'U003',name:'Akshita Jain',email:'jain.akshita@e-marketing.io',phone:'7340302359',department:'Social Media',roles:'User',active:1 },
  { id:'U004',name:'Aman Bejal',email:'bejal.aman@e-marketing.io',phone:'6376724283',department:'Graphic Designing',roles:'User',active:1 },
  { id:'U005',name:'Aman Pareek',email:'pareek.aman@e-marketing.io',phone:'7507905684',department:'Business Automation',roles:'Admin,User',active:1 },
  { id:'U006',name:'Ankit Ladha',email:'ladha.ankit@e-marketing.io',phone:'7737270516',department:'Google Ads',roles:'User',active:1 },
  { id:'U007',name:'Ashish Jha',email:'seo@e-marketing.io',phone:'9024736048',department:'SEO',roles:'User',active:1 },
  { id:'U008',name:'Bhanu Sharma',email:'sharma.bhanu@e-marketing.io',phone:'9351842255',department:'SEO',roles:'User',active:1 },
  { id:'U009',name:'Chetna Agrawal',email:'chetna@e-marketing.io',phone:'8238999732',department:'CXO',roles:'User',active:1 },
  { id:'U010',name:'Ching Thakral',email:'googlexecutive@e-marketing.io',phone:'9988716423',department:'Google Ads',roles:'User',active:1 },
  { id:'U011',name:'Divvy Jain',email:'jain.divvy@e-marketing.io',phone:'8769533770',department:'Meta Ads',roles:'User',active:1 },
  { id:'U012',name:'Divya Srivastava',email:'srivastava.divya@e-marketing.io',phone:'9001798754',department:'Graphic Designing',roles:'User',active:1 },
  { id:'U013',name:'Garvit Kedia',email:'kedia.garvit@e-marketing.io',phone:'9782800257',department:'Meta Ads',roles:'User',active:1 },
  { id:'U014',name:'Gaurav Gupta',email:'gupta.gaurav@e-marketing.io',phone:'9155836021',department:'Website Design & Development',roles:'User',active:1 },
  { id:'U015',name:'Harsh Daharwal',email:'daharwal.harsh@e-marketing.io',phone:'9596896449',department:'Business Automation',roles:'Admin,User',active:1 },
  { id:'U016',name:'Kritika Saini',email:'saini.kritika@e-marketing.io',phone:'8696482750',department:'Google Ads',roles:'User',active:1 },
  { id:'U017',name:'Kushagra Dubey',email:'dubey.kushagra@e-marketing.io',phone:'8203058282',department:'Meta Ads',roles:'User',active:1 },
  { id:'U018',name:'Mohit Kumawat',email:'kumawat.mohit@e-marketing.io',phone:'6290552269',department:'Content Writing',roles:'User',active:1 },
  { id:'U019',name:'Nikita Khandelwal',email:'khandelwal.nikita@e-marketing.io',phone:'8306660792',department:'MDO',roles:'Admin,User',active:1 },
  { id:'U020',name:'Nisha Madaan',email:'madaan.nisha@e-marketing.io',phone:'9988820092',department:'Google Ads',roles:'User',active:1 },
  { id:'U021',name:'Nupur Kothari',email:'kothari.nupur@e-marketing.io',phone:'9314050398',department:'Graphic Designing',roles:'User',active:1 },
  { id:'U022',name:'Pradhuman Kumar',email:'pradhuman@e-marketing.io',phone:'7973006643',department:'Google Ads',roles:'HOD',active:1 },
  { id:'U023',name:'Priya Saini',email:'saini.priya@e-marketing.io',phone:'9652295500',department:'SEO',roles:'User',active:1 },
  { id:'U024',name:'Purvi Saini',email:'saini.purvi@e-marketing.io',phone:'9301878061',department:'MDO',roles:'Admin,User',active:1 },
  { id:'U025',name:'Rahul Maharchandani',email:'maharchandani.rahul@e-marketing.io',phone:'8302671330',department:'AI',roles:'HOD',active:1 },
  { id:'U026',name:'Ritu Tilokani',email:'tilokani.ritu@e-marketing.io',phone:'9772779351',department:'Content Writing',roles:'HOD',active:1 },
  { id:'U027',name:'Sakshi Saini',email:'sakshi.saini@e-marketing.io',phone:'9530000022',department:'Google Ads',roles:'User',active:1 },
  { id:'U028',name:'Satish Khichi',email:'khichi.satish@e-marketing.io',phone:'9530000023',department:'Google Ads',roles:'User',active:1 },
  { id:'U029',name:'Saurav Pareek',email:'pareek.saurav@e-marketing.io',phone:'9530000024',department:'Social Media',roles:'User',active:1 },
  { id:'U030',name:'Swati Joshi',email:'joshi.swati@e-marketing.io',phone:'9530000025',department:'Content Writing',roles:'User',active:1 },
  { id:'U031',name:'Tushar Chauhan',email:'chauhan.tushar@e-marketing.io',phone:'9530000026',department:'Website Design & Development',roles:'User',active:1 },
  { id:'U032',name:'Vishal Jaga',email:'mis1@e-marketing.io',phone:'00756492939',department:'MDO',roles:'Admin',active:1 },
  { id:'U033',name:'Naman Gupta',email:'mis2@e-marketing.io',phone:'6367577176',department:'Business Automation',roles:'User',active:1,password_hash:'$2b$10$fF1PhyruhuhcYZtrqIC2DOjPlGZct61n/b9azuwsuRCSrpI4SKtD6' },
];

const DELEGATIONS = [
  { id:'DEL001',description:'Need to automate the Advance Qualified Leads data (Last 90 Days in the Google Sheet)',doer_id:'U002',doer:'Akhilesh Vyas',delegated_by:'U001',due_date:'2026-04-08',client:'',status:'pending',type:'delegation',priority:'Low',approval:'No Approval' },
  { id:'DEL002',description:'Need to Connect the Google ads account to the Claude.ai',doer_id:'U002',doer:'Akhilesh Vyas',delegated_by:'U001',due_date:'2026-04-07',client:'',status:'pending',type:'delegation',priority:'Low',approval:'No Approval' },
  { id:'DEL003',description:'Start Curiosity based ads',doer_id:'U029',doer:'Saurav Pareek',delegated_by:'U001',due_date:'2026-04-08',client:'',status:'pending',type:'delegation',priority:'Low',approval:'No Approval' },
  { id:'DEL004',description:'Ads Video Start for GLP',doer_id:'U029',doer:'Saurav Pareek',delegated_by:'U001',due_date:'2026-04-11',client:'',status:'pending',type:'delegation',priority:'Low',approval:'No Approval' },
  { id:'DEL005',description:'3 new shoot videos- Ads to be started including GLP',doer_id:'U029',doer:'Saurav Pareek',delegated_by:'U001',due_date:'2026-04-21',client:'',status:'pending',type:'delegation',priority:'Low',approval:'No Approval' },
  { id:'DEL006',description:'Content for new video in which we have to write high value offer and content for summer play also...',doer_id:'U026',doer:'Ritu Tilokani',delegated_by:'U001',due_date:'2026-04-22',client:'Hero Play',status:'pending',type:'delegation',priority:'Low',approval:'No Approval' },
  { id:'DEL007',description:'Create google form and tasks - Employee Onboarding Process',doer_id:'U032',doer:'Vishal Jaga',delegated_by:'U001',due_date:'2026-05-04',client:'',status:'revise_requested',type:'delegation',priority:'Low',approval:'No Approval',revise_action:'pending' },
  { id:'DEL008',description:'Speed is slow',doer_id:'U028',doer:'Satish Khichi',delegated_by:'U001',due_date:'2026-05-05',client:'',status:'pending',type:'delegation',priority:'Low',approval:'No Approval' },
  { id:'DEL009',description:'Google review widget on home page',doer_id:'U028',doer:'Satish Khichi',delegated_by:'U001',due_date:'2026-05-06',client:'',status:'done',type:'delegation',priority:'Low',approval:'No Approval',completed_at:'2026-05-29T15:20:33.132Z' },
  { id:'DEL010',description:'hjhjnj',doer_id:'U004',doer:'Aman Bejal',delegated_by:'U032',due_date:'2026-05-30',client:'',status:'pending',type:'delegation',priority:'Medium',approval:'Approval Required',transferred_by:'Vishal Jaga' },
  { id:'DEL011',description:'oooooooooooooooooooooo',doer_id:'U033',doer:'Naman Gupta',delegated_by:'U032',due_date:'2026-05-30',client:'',status:'revise',type:'delegation',priority:'Low',approval:'No Approval',remarks:'qq',transferred_by:'Vishal Jaga',transferred_from:'Aman Bejal' },
  { id:'DEL012',description:'ppopoppopopo',doer_id:'U004',doer:'Aman Bejal',delegated_by:'U032',due_date:'2026-05-30',client:'',status:'revise',type:'delegation',priority:'Low',approval:'Approval Required',url:'lnkn',remarks:'kjhb',transferred_by:'Vishal Jaga' },
  { id:'DEL013',description:'aaaaaaaaaaaaaaaaaaaaaaa',doer_id:'U033',doer:'Naman Gupta',delegated_by:'U032',due_date:'2026-05-29',client:'',status:'pending',type:'delegation',priority:'High',approval:'Approval Required',transferred_by:'Vishal Jaga',transferred_from:'Aman Bejal' },
  { id:'DEL014',description:'aaaaaaaaaaaa',doer_id:'U004',doer:'Aman Bejal',delegated_by:'U032',due_date:'2026-05-29',client:'',status:'pending',type:'delegation',priority:'Low',approval:'Approval Required',transferred_by:'Vishal Jaga' },
  { id:'DEL015',description:'aaaaaaaaaa',doer_id:'U004',doer:'Aman Bejal',delegated_by:'U032',due_date:'2026-05-29',client:'',status:'pending',type:'delegation',priority:'Low',approval:'No Approval',transferred_by:'Vishal Jaga' },
  { id:'DEL016',description:'yukfkygvmhv',doer_id:'U004',doer:'Aman Bejal',delegated_by:'U032',due_date:'2026-05-30',client:'',status:'pending',type:'delegation',priority:'Medium',approval:'No Approval',transferred_by:'Vishal Jaga' },
  { id:'DEL017',description:'gggggggggg',doer_id:'U004',doer:'Aman Bejal',delegated_by:'U032',due_date:'2026-05-30',client:'',status:'revise',type:'delegation',priority:'Low',approval:'No Approval',remarks:'aaaaaaaa',revise_action:'granted',transferred_by:'Vishal Jaga' },
  { id:'DEL018',description:'bbbbbbbbbbbbb',doer_id:'U004',doer:'Aman Bejal',delegated_by:'U032',due_date:'2026-05-30',client:'',status:'revise',type:'delegation',priority:'Low',approval:'Approval Required',remarks:'xx',revise_action:'granted',transferred_by:'Vishal Jaga' },
  { id:'DEL019',description:'bbbbbbb',doer_id:'U004',doer:'Aman Bejal',delegated_by:'U032',due_date:'2026-06-05',client:'',status:'pending',type:'delegation',priority:'Low',approval:'Approval Required',transferred_by:'Vishal Jaga' },
  { id:'DEL020',description:'qqqqqqqqqq',doer_id:'U032',doer:'Vishal Jaga',delegated_by:'U008',due_date:'2026-06-06',client:'',status:'pending',type:'delegation',priority:'Low',approval:'Approval Required' },
  { id:'DEL021',description:'qqqqqqqqqq',doer_id:'U032',doer:'Vishal Jaga',delegated_by:'U008',due_date:'2026-05-29',client:'',status:'pending',type:'delegation',priority:'High',approval:'No Approval' },
  { id:'DEL022',description:'hy naman',doer_id:'U032',doer:'Vishal Jaga',delegated_by:'U032',due_date:'2026-06-06',client:'',status:'revise_requested',type:'delegation',priority:'High',approval:'Approved',remarks:'zzzz',revise_action:'pending' },
  { id:'DEL023',description:'jjjjjjjjjjjfff',doer_id:'U032',doer:'Vishal Jaga',delegated_by:'U032',due_date:'2026-06-02',client:'',status:'pending',type:'delegation',priority:'Medium',approval:'Approved',revise_action:'denied' },
  { id:'DEL024',description:'hy naman',doer_id:'U032',doer:'Vishal Jaga',delegated_by:'U032',due_date:'2026-06-06',client:'',status:'pending',type:'delegation',priority:'Low',approval:'No Approval' },
  { id:'DEL025',description:'chor',doer_id:'U032',doer:'Vishal Jaga',delegated_by:'U032',due_date:'2026-06-04',client:'',status:'pending',type:'delegation',priority:'Low',approval:'Approved',transferred_by:'Naman Gupta' },
  { id:'DEL026',description:'okokokokok',doer_id:'U004',doer:'Aman Bejal',delegated_by:'U032',due_date:'2026-06-01',client:'',status:'pending',type:'delegation',priority:'High',approval:'Approved',transferred_by:'Naman Gupta' },
];

const MASTERS = [
  { id:'CHK001',task:'Daily Standup Meeting',assigned_to:'All HODs',frequency:'Daily' },
  { id:'CHK002',task:'Weekly Client Report',assigned_to:'Account Managers',frequency:'Weekly' },
  { id:'CHK003',task:'Monthly Budget Review',assigned_to:'Pradhuman Kumar',frequency:'Monthly' },
  { id:'CHK004',task:'Quarterly Performance Review',assigned_to:'All Employees',frequency:'Monthly' },
  { id:'CHK005',task:'xxxx',assigned_to:'Bhanu Sharma',frequency:'Daily' },
  { id:'CHK006',task:'bro',assigned_to:'Naman Gupta',frequency:'Weekly' },
];

const HOLIDAYS = [
  { id:'HOL001',date:'2026-01-26',name:'Republic Day',type:'National' },
  { id:'HOL002',date:'2026-03-14',name:'Holi',type:'Festival' },
  { id:'HOL003',date:'2026-08-15',name:'Independence Day',type:'National' },
  { id:'HOL004',date:'2026-10-02',name:'Gandhi Jayanti',type:'National' },
  { id:'HOL005',date:'2026-11-08',name:'Diwali',type:'Festival' },
];

export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (key !== 'migrate-india-auto-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureSchema();
    const results = { users: 0, delegations: 0, masters: 0, holidays: 0, errors: [] };

    for (const u of USERS) {
      try {
        await pool.query(
          `INSERT INTO users (id,name,email,phone,department,roles,active,password_hash,created_at)
           VALUES (?,?,?,?,?,?,?,?,NOW())
           ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),phone=VALUES(phone),
           department=VALUES(department),roles=VALUES(roles),active=VALUES(active),
           password_hash=COALESCE(VALUES(password_hash),password_hash)`,
          [u.id,u.name,u.email,u.phone||'',u.department||'',u.roles,u.active,u.password_hash||null]
        );
        results.users++;
      } catch(e) { results.errors.push(`User ${u.id}: ${e.message}`); }
    }

    for (const d of DELEGATIONS) {
      try {
        await pool.query(
          `INSERT INTO delegations (id,description,doer_id,doer,delegated_by,due_date,client,status,type,priority,approval,url,remarks,revise_action,transferred_by,transferred_from,created_at,completed_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)
           ON DUPLICATE KEY UPDATE status=VALUES(status)`,
          [d.id,d.description,d.doer_id||null,d.doer||'',d.delegated_by||null,d.due_date||null,
           d.client||'',d.status,d.type,d.priority||'Low',d.approval||'No Approval',
           d.url||'',d.remarks||'',d.revise_action||null,
           d.transferred_by||null,d.transferred_from||null,
           d.completed_at||null]
        );
        results.delegations++;
      } catch(e) { results.errors.push(`Del ${d.id}: ${e.message}`); }
    }

    for (const m of MASTERS) {
      try {
        await pool.query(
          `INSERT INTO masters (id,task,assigned_to,frequency,created_at) VALUES (?,?,?,?,NOW())
           ON DUPLICATE KEY UPDATE task=VALUES(task)`,
          [m.id,m.task,m.assigned_to,m.frequency]
        );
        results.masters++;
      } catch(e) { results.errors.push(`Master ${m.id}: ${e.message}`); }
    }

    for (const h of HOLIDAYS) {
      try {
        await pool.query(
          `INSERT INTO holidays (id,date,name,type) VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE name=VALUES(name)`,
          [h.id,h.date,h.name,h.type]
        );
        results.holidays++;
      } catch(e) { results.errors.push(`Holiday ${h.id}: ${e.message}`); }
    }

    return NextResponse.json({ success: true, ...results });
  } catch(err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
