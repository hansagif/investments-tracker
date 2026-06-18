/**
 * GET /api/asset-snapshots/[date]
 * Returns all AssetSnapshot rows for a specific date, joined with Asset metadata.
 */
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
    _request: NextRequest,
    { params }: { params: { date: string } }
) {
    try {
        const { date } = params;

        const [snapshots, assets] = await Promise.all([
            prisma.assetSnapshot.findMany({
                where: { date },
                orderBy: { ticker: 'asc' },
            }),
            prisma.asset.findMany({
                select: { ticker: true, name: true, type: true, sector: true, currency: true },
            }),
        ]);

        // Merge snapshot values with asset metadata
        const assetMap = Object.fromEntries(assets.map(a => [a.ticker, a]));
        const merged = snapshots.map(s => ({
            ticker: s.ticker,
            name: assetMap[s.ticker]?.name ?? s.ticker,
            type: assetMap[s.ticker]?.type ?? 'Stock',
            sector: assetMap[s.ticker]?.sector ?? 'Other',
            currency: assetMap[s.ticker]?.currency ?? 'USD',
            currentValue: s.currentValue,
            costBasis: s.avgBuyPrice,
            currentPrice: s.currentPrice,
            date: s.date,
        }));

        return NextResponse.json(merged);
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
