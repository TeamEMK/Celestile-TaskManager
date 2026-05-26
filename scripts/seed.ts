import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);

async function seed() {
  // Tables banao
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(10) PRIMARY KEY,
      name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(20),
      department VARCHAR(255),
      roles TEXT[],
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS delegations (
      id VARCHAR(10) PRIMARY KEY,
      description TEXT,
      doer_id VARCHAR(10),
      doer VARCHAR(255),
      delegated_by VARCHAR(10),
      due_date DATE,
      client VARCHAR(255),
      status VARCHAR(50),
      type VARCHAR(50),
      created_at TIMESTAMPTZ
    )
  `;

  // Users insert karo
  await sql`
    INSERT INTO users (id,name,email,phone,department,roles,active,created_at) VALUES
    ('U001','Abhishek Jain','abhishek@e-marketing.io','9602684444','CXO',ARRAY['Admin'],true,NOW()),
    ('U002','Akhilesh Vyas','vyas.akhilesh@e-marketing.io','7048462985','Business Automation',ARRAY['Admin','HOD'],true,NOW()),
    ('U003','Akshita Jain','jain.akshita@e-marketing.io','7340302359','Social Media',ARRAY['User'],true,NOW()),
    ('U004','Aman Bejal','bejal.aman@e-marketing.io','6376724283','Graphic Designing',ARRAY['User'],true,NOW()),
    ('U005','Aman Pareek','pareek.aman@e-marketing.io','7507905684','Business Automation',ARRAY['Admin','User'],true,NOW()),
    ('U032','Vishal Jaga','mis1@e-marketing.io','00756492939','MDO',ARRAY['Admin'],true,NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  console.log('✅ Seed complete!');
}

seed().catch(console.error);