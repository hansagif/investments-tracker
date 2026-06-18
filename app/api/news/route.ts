import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getNews } from '@/lib/news';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const bypassCache = searchParams.get('refresh') === 'true';

        // Read config
        const configPath = path.join(process.cwd(), 'data', 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        // Get assets from DB
        const assets = await prisma.asset.findMany();

        const articles = await getNews({
            feedUrls: config.newsFeeds ?? [],
            assets,
            watchlist: config.watchlist ?? [],
            geminiToken: config.geminiApiToken || undefined,
            bypassCache,
        });

        // Determine if articles came from cache and include cachedAt timestamp
        // so the client can show a staleness indicator (Requirement 5.6).
        let cachedAt: string | undefined;
        if (!bypassCache) {
            const newest = await prisma.newsCache.findFirst({
                orderBy: { cachedAt: 'desc' },
            });
            if (newest) {
                cachedAt = newest.cachedAt.toISOString();
            }
        }

        return NextResponse.json({ articles, cachedAt });
    } catch (error) {
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
}
