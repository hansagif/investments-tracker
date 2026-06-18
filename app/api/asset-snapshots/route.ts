import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    try {
        const snapshots = await prisma.assetSnapshot.findMany({
            orderBy: [{ date: 'asc' }, { ticker: 'asc' }],
        });
        return NextResponse.json(snapshots);
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}