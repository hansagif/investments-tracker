import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { importSnapshotsCSV } from '@/lib/csv';

const prisma = new PrismaClient();

/**
 * POST /api/snapshots/import
 *
 * Body: raw CSV text
 * Query param: ?force=true — if provided, existing snapshots are overwritten;
 *              otherwise, any date that already exists in the DB triggers a
 *              conflict response so the client can prompt the user.
 *
 * Normal response (no conflicts, or force=true):
 *   { imported: number, skipped: number, errors: { row: number, reason: string }[] }
 *
 * Conflict response (force not set and at least one date already exists):
 *   { conflict: true, conflictDates: string[] }
 *   HTTP 409
 *
 * Requirements: 7.4, 7.5, 7.6
 */
export async function POST(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get('force') === 'true';
    const csv = await request.text();
    const importResult = importSnapshotsCSV(csv);

    // Only check for conflicts when not forcing.
    if (!force && importResult.records.length > 0) {
      const incomingDates = importResult.records.map((r) => r.date);
      const existing = await prisma.closingSnapshot.findMany({
        where: { date: { in: incomingDates } },
        select: { date: true },
      });

      if (existing.length > 0) {
        const conflictDates = existing.map((e) => e.date);
        return NextResponse.json(
          { conflict: true, conflictDates },
          { status: 409 }
        );
      }
    }

    // Persist valid records.
    // With force=true we upsert (overwrite); without force we know there are
    // no conflicts at this point so create would work, but upsert is safe.
    for (const record of importResult.records) {
      await prisma.closingSnapshot.upsert({
        where: { date: record.date },
        create: record,
        update: record,
      });
    }

    return NextResponse.json({
      imported: importResult.imported,
      skipped: importResult.skipped,
      errors: importResult.errors,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
