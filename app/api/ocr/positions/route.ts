/**
 * POST /api/ocr/positions
 *
 * Accepts a multipart/form-data image upload, sends it to Gemini to extract
 * all stock positions, and upserts each position into the Asset table.
 *
 * Returns:
 *   { updated: number, positions: ExtractedPosition[], errors: string[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { extractPositions, type ExtractedPosition } from '@/lib/ocr/positions';
import { log } from '@/lib/logger';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp'];

/**
 * Best-effort mapping from Gemini-returned name to ticker symbol.
 * Gemini returns company names; we need to match them to existing Asset tickers.
 */
function matchToTicker(
    name: string,
    assets: { ticker: string; name: string }[]
): string | null {
    const lower = name.toLowerCase().trim();

    // Exact name match
    const exact = assets.find(a => a.name.toLowerCase() === lower);
    if (exact) return exact.ticker;

    // Partial match — name contains or is contained by asset name
    const partial = assets.find(a => {
        const an = a.name.toLowerCase();
        return lower.includes(an) || an.includes(lower);
    });
    if (partial) return partial.ticker;

    return null;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('image') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }
        if (!ALLOWED_MIME.includes(file.type)) {
            return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 415 });
        }
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 });
        }

        // Read Gemini token from config
        const configPath = path.join(process.cwd(), 'data', 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const apiToken: string = config.geminiApiToken || process.env.GEMINI_API_KEY || '';

        if (!apiToken) {
            return NextResponse.json(
                { error: 'Gemini API token not configured. Add it in Settings.' },
                { status: 422 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Extract positions from screenshot
        const positions = await extractPositions(buffer, file.type, apiToken);
        log.info("ocr/positions", `Gemini extracted ${positions.length} positions`);
        positions.forEach(p => log.info("ocr/positions", `  raw: ${JSON.stringify(p)}`));

        if (positions.length === 0) {
            return NextResponse.json({
                updated: 0,
                positions: [],
                errors: ['Gemini could not extract any positions from the screenshot.'],
            });
        }

        // Load existing assets for ticker matching
        const existingAssets = await prisma.asset.findMany({
            select: { ticker: true, name: true, sector: true, type: true, currency: true },
        });

        const errors: string[] = [];
        let updated = 0;
        const matchedTickers: string[] = [];

        for (const pos of positions) {
            const ticker = matchToTicker(pos.name, existingAssets);

            if (!ticker) {
                errors.push(`Could not match "${pos.name}" to any known ticker — skipped.`);
                log.warn("ocr/positions", `no ticker match for "${pos.name}"`);
                continue;
            }

            try {
                await prisma.asset.update({
                    where: { ticker },
                    data: {
                        currentValue: pos.currentValue,
                        ...(pos.avgBuyPrice !== null && { costBasis: pos.avgBuyPrice }),
                        ...(pos.currentPrice !== null && { currentPrice: pos.currentPrice }),
                    },
                });

                // Record snapshot for the entry date (not necessarily today —
                // user may save a future-dated entry while it's still the previous day)
                const snapshotDate = (formData.get('date') as string | null)?.match(/^\d{4}-\d{2}-\d{2}$/)
                    ? formData.get('date') as string
                    : new Date().toISOString().split('T')[0];
                await prisma.assetSnapshot.upsert({
                    where: { date_ticker: { date: snapshotDate, ticker } },
                    update: {
                        currentValue: pos.currentValue,
                        currentPrice: pos.currentPrice ?? 0,
                        avgBuyPrice: pos.avgBuyPrice ?? 0,
                    },
                    create: {
                        date: snapshotDate,
                        ticker,
                        currentValue: pos.currentValue,
                        currentPrice: pos.currentPrice ?? 0,
                        avgBuyPrice: pos.avgBuyPrice ?? 0,
                    },
                });

                matchedTickers.push(ticker);
                updated++;
                log.info("ocr/positions", `updated ${ticker}`, { value: pos.currentValue, buyPrice: pos.avgBuyPrice, price: pos.currentPrice });
            } catch (err) {
                errors.push(`Failed to update ${ticker}: ${(err as Error).message}`);
                log.error("ocr/positions", `failed to update ${ticker}`, (err as Error).message);
            }
        }

        // Remove assets that were not in the screenshot (i.e. sold positions)
        if (matchedTickers.length > 0) {
            const deleted = await prisma.asset.deleteMany({
                where: { ticker: { notIn: matchedTickers } },
            });
            if (deleted.count > 0) {
                errors.push(`Removed ${deleted.count} sold position(s) not found in screenshot.`);
            }
        }

        return NextResponse.json({ updated, positions, errors });
    } catch (error) {
        log.error("ocr/positions", "POST failed", (error as Error).message);
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
}
