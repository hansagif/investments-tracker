import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { exportSnapshotsCSV } from '@/lib/csv';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const snapshots = await prisma.closingSnapshot.findMany({
      orderBy: { date: 'asc' }
    });
    const csv = exportSnapshotsCSV(snapshots);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="snapshots.csv"',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
