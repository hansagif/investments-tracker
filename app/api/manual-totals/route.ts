/**
 * /api/manual-totals
 *
 * GET  — returns the current manually-entered totals (or zeros if not set yet)
 * PUT  — upserts the singleton row with new values
 *
 * Body shape: { totalDepositedRON: number, etfValueEUR: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
    try {
        const row = await prisma.manualTotals.findUnique({ where: { id: 'singleton' } });
        return NextResponse.json(
            row ?? { id: 'singleton', totalDepositedRON: 0, etfValueEUR: 0 }
        );
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json() as { totalDepositedRON?: number; etfValueEUR?: number };

        const totalDepositedRON = typeof body.totalDepositedRON === 'number' ? body.totalDepositedRON : 0;
        const etfValueEUR = typeof body.etfValueEUR === 'number' ? body.etfValueEUR : 0;

        const row = await prisma.manualTotals.upsert({
            where: { id: 'singleton' },
            update: { totalDepositedRON, etfValueEUR },
            create: { id: 'singleton', totalDepositedRON, etfValueEUR },
        });

        return NextResponse.json(row);
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
