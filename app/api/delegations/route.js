import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export async function GET() {
  try {
    const delegations = await sql`
      SELECT
        id,
        description,
        doer_id as "doerId",
        doer,
        delegated_by as "delegatedBy",
        due_date as "dueDate",
        client,
        status,
        type,
        created_at as "createdAt",
        completed_at as "completedAt"
      FROM delegations
      ORDER BY created_at DESC
    `;

    return NextResponse.json(delegations);

  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    if (
      !body.description ||
      !body.doerId ||
      !body.dueDate
    ) {
      return NextResponse.json(
        {
          error:
            'description, doerId, dueDate required',
        },
        { status: 400 }
      );
    }

    const users = await sql`
      SELECT *
      FROM users
      WHERE id = ${body.doerId}
    `;

    const doer = users[0];

    const count = await sql`
      SELECT COUNT(*) FROM delegations
    `;

    const nextId =
      'DEL' +
      (
        Number(count[0].count) + 1
      )
        .toString()
        .padStart(3, '0');

    const result = await sql`
      INSERT INTO delegations (
        id,
        description,
        doer_id,
        doer,
        delegated_by,
        due_date,
        client,
        status,
        type
      )
      VALUES (
        ${nextId},
        ${body.description},
        ${body.doerId},
        ${doer?.name || ''},
        ${body.delegatedBy || 'U001'},
        ${body.dueDate},
        ${body.client || ''},
        'pending',
        'delegation'
      )
      RETURNING *
    `;

    return NextResponse.json(
      result[0],
      { status: 201 }
    );

  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}