/**
 * /api/daily-entry
 *
 * GET  — returns all entries ordered by date desc (for history / Live Dashboard)
 * POST — upsert today's entry (all 4 ingestion fields)
 *
 * Body: {
 *   date: string           // "YYYY-MM-DD"
 *   totalDepositedRON: number
 *   freeRON: number
 *   etfValueEUR: number
 *   usdTotalValue: number
 *   usdFreeFunds: number
 *   usdNetProfitLoss: number
 *   force?: boolean        // overwrite if date already exists
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { log } from '@/lib/logger';

const prisma = new PrismaClient();

export async function GET() {
    try {
        const entries = await prisma.dailyEntry.findMany({
            orderBy: { date: 'desc' },
        });
        return NextResponse.json(entries);
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as {
            date: string;
            totalDepositedRON: number;
            freeRON: number;
            etfValueEUR: number;
            etfDepositedEUR?: number;
            usdTotalValue: number;
            usdFreeFunds: number;
            usdNetProfitLoss: number;
            usdRealizedPnl?: number;
            force?: boolean;
        };

        const { date, force = false } = body;

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json({ error: 'Invalid or missing date (YYYY-MM-DD)' }, { status: 400 });
        }

        // Check for existing entry for this date
        const existing = await prisma.dailyEntry.findUnique({ where: { date } });
        if (existing && !force) {
            return NextResponse.json({ conflict: true, date }, { status: 409 });
        }

        const data = {
            totalDepositedRON: Number(body.totalDepositedRON) || 0,
            freeRON: Number(body.freeRON) || 0,
            etfValueEUR: Number(body.etfValueEUR) || 0,
            etfDepositedEUR: Number(body.etfDepositedEUR) || 0,
            usdTotalValue: Number(body.usdTotalValue) || 0,
            usdFreeFunds: Number(body.usdFreeFunds) || 0,
            usdNetProfitLoss: Number(body.usdNetProfitLoss) || 0,
            usdRealizedPnl: Number(body.usdRealizedPnl) || 0,
        };

        const entry = await prisma.dailyEntry.upsert({
            where: { date },
            update: data,
            create: { date, ...data },
        });

        log.info("daily-entry", `upserted entry for ${date}`, data);

        // Always refresh today's AssetSnapshot with current Asset values on save
        const assets = await prisma.asset.findMany();
        log.info("daily-entry", `snapshotting ${assets.length} assets for ${date}`);
        if (assets.length > 0) {
            await Promise.allSettled(assets.map(a =>
                prisma.assetSnapshot.upsert({
                    where: { date_ticker: { date, ticker: a.ticker } },
                    update: {
                        currentValue: a.currentValue,
                        currentPrice: a.currentPrice,
                        avgBuyPrice: a.costBasis,
                    },
                    create: {
                        id: Math.random().toString(36).slice(2),
                        date,
                        ticker: a.ticker,
                        currentValue: a.currentValue,
                        currentPrice: a.currentPrice,
                        avgBuyPrice: a.costBasis,
                    },
                })
            ));
            log.info("daily-entry", `snapshot complete for ${date}`);
        }

        return NextResponse.json(entry, { status: existing ? 200 : 201 });
    } catch (error) {
        log.error("daily-entry", "POST failed", (error as Error).message);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
