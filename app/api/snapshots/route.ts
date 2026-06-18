import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/snapshots — list all snapshots ordered by date descending
export async function GET() {
    try {
        const snapshots = await prisma.closingSnapshot.findMany({
            orderBy: { date: 'desc' },
        });
        return NextResponse.json(snapshots);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown database error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/snapshots — add or overwrite a snapshot
// Body: { date, totalTransactionValue, freeFunds, netProfitLoss, currency }
// Query: ?force=true to overwrite an existing snapshot for the same date
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { date, totalTransactionValue, freeFunds, netProfitLoss, currency } = body;

        // Basic validation
        if (!date || totalTransactionValue === undefined || freeFunds === undefined || netProfitLoss === undefined) {
            return NextResponse.json(
                { error: 'Missing required fields: date, totalTransactionValue, freeFunds, netProfitLoss' },
                { status: 400 }
            );
        }

        const force = request.nextUrl.searchParams.get('force') === 'true';

        // Check if a snapshot already exists for this date
        const existing = await prisma.closingSnapshot.findUnique({
            where: { date },
        });

        if (existing) {
            if (!force) {
                // Conflict: prompt the caller to confirm overwrite via ?force=true
                return NextResponse.json(
                    { conflict: true, existingId: existing.id },
                    { status: 409 }
                );
            }

            // force=true: update the existing record
            const updated = await prisma.closingSnapshot.update({
                where: { id: existing.id },
                data: {
                    totalTransactionValue: Number(totalTransactionValue),
                    freeFunds: Number(freeFunds),
                    netProfitLoss: Number(netProfitLoss),
                    currency: currency ?? existing.currency,
                },
            });
            return NextResponse.json(updated, { status: 200 });
        }

        // No existing snapshot for this date — create a new record
        const created = await prisma.closingSnapshot.create({
            data: {
                date,
                totalTransactionValue: Number(totalTransactionValue),
                freeFunds: Number(freeFunds),
                netProfitLoss: Number(netProfitLoss),
                currency: currency ?? 'USD',
            },
        });
        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown database error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// DELETE /api/snapshots?id=<id> — delete a snapshot by id
export async function DELETE(request: NextRequest) {
    try {
        const id = request.nextUrl.searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Missing required query parameter: id' },
                { status: 400 }
            );
        }

        await prisma.closingSnapshot.delete({
            where: { id },
        });

        return NextResponse.json({ deleted: true }, { status: 200 });
    } catch (error) {
        // Prisma throws P2025 when record not found
        if (
            error instanceof Error &&
            'code' in error &&
            (error as { code: string }).code === 'P2025'
        ) {
            return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
        }
        const message = error instanceof Error ? error.message : 'Unknown database error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
