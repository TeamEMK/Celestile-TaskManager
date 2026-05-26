    import { NextResponse } from 'next/server';
    import bcrypt from 'bcryptjs';
    import { q } from '@/lib/db-postgres';
    import { getServerSession } from 'next-auth';

    export async function POST(req) {
    const session = await getServerSession();
    if (!session?.user?.roles?.includes('Admin')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userId, password } = await req.json();
    if (!userId || !password || password.length < 6) {
        return NextResponse.json({ error: 'userId and password (min 6 chars) required' }, { status: 400 });
    }
    const hash = await bcrypt.hash(password, 10);
    await q('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    return NextResponse.json({ success: true });
    }