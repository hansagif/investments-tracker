/**
 * index.ts — getNews orchestrator for the News_Aggregator module.
 *
 * Orchestrates the full news pipeline:
 *   1. Check the NewsCache table for articles cached within the last 15 minutes.
 *      Return cached articles immediately if TTL has not expired.
 *   2. Fetch fresh articles from all configured RSS feed URLs.
 *   3. Collect tickers from the user's assets + watchlist.
 *   4. Rank articles with the keyword/recency ranker.
 *   5. Optionally re-score articles with Gemini when a token is configured.
 *   6. Persist the ranked articles to the NewsCache table.
 *   7. Return up to 30 articles.
 *
 * Requirements: 5.6, 5.9
 */

import { PrismaClient } from "@prisma/client";
import type { Asset } from "@prisma/client";
import { fetchArticles } from "./fetcher";
import { rankArticles, MAX_ARTICLES } from "./ranker";
import { scoreArticlesWithGemini } from "./gemini";
import type { NewsArticle } from "./types";

// 15-minute TTL in milliseconds
const CACHE_TTL_MS = 15 * 60 * 1_000;

const prisma = new PrismaClient();

export interface GetNewsOptions {
    feedUrls: string[];
    assets: Asset[];
    watchlist: string[];
    geminiToken?: string;
    /** When true, skip the cache read and always fetch fresh articles. */
    bypassCache?: boolean;
}

/**
 * Fetch, rank, cache, and return news articles for the user's portfolio.
 *
 * @param options  Configuration including feed URLs, assets, watchlist,
 *                 optional Gemini token, and optional cache-bypass flag.
 * @returns        Up to 30 ranked NewsArticle objects.
 */
export async function getNews(options: GetNewsOptions): Promise<NewsArticle[]> {
    const {
        feedUrls,
        assets,
        watchlist,
        geminiToken,
        bypassCache = false,
    } = options;

    // -------------------------------------------------------------------------
    // Step 1 — Cache check (skipped when bypassCache === true)
    // -------------------------------------------------------------------------
    if (!bypassCache) {
        const cached = await readCache();
        if (cached !== null) {
            return cached;
        }
    }

    // -------------------------------------------------------------------------
    // Step 2 — Fetch fresh articles
    // -------------------------------------------------------------------------
    const rawArticles = await fetchArticles(feedUrls);

    // -------------------------------------------------------------------------
    // Step 3 — Collect tickers AND company names (assets + watchlist)
    // -------------------------------------------------------------------------
    // Match on tickers (e.g. "NVDA") AND company names (e.g. "Nvidia") so that
    // headlines like "Nvidia surges..." are caught even without the ticker.
    const tickerTerms = [...assets.map((a) => a.ticker), ...watchlist];
    const nameTerms = assets
        .map((a) => a.name)
        .filter((n) => n && n.length > 2);
    const tickers = [...tickerTerms, ...nameTerms];

    // -------------------------------------------------------------------------
    // Step 4 — Rank articles
    // -------------------------------------------------------------------------
    const now = new Date();
    const ranked = rankArticles(rawArticles, tickers, now);

    // -------------------------------------------------------------------------
    // Step 5 — Gemini scoring (optional)
    // -------------------------------------------------------------------------
    const scored = geminiToken
        ? await scoreArticlesWithGemini(ranked, tickers, geminiToken)
        : ranked;

    // -------------------------------------------------------------------------
    // Step 6 — Persist to NewsCache
    // -------------------------------------------------------------------------
    await writeCache(scored, now);

    // -------------------------------------------------------------------------
    // Step 7 — Return up to 30 articles
    // -------------------------------------------------------------------------
    return scored.slice(0, MAX_ARTICLES);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

/**
 * Read articles from the NewsCache table if the most recent cachedAt timestamp
 * is within the 15-minute TTL window. Returns null when the cache is empty or
 * stale.
 */
async function readCache(): Promise<NewsArticle[] | null> {
    // Check the most recently cached article to determine cache freshness.
    const newest = await prisma.newsCache.findFirst({
        orderBy: { cachedAt: "desc" },
    });

    if (!newest) return null;

    const ageMs = Date.now() - newest.cachedAt.getTime();
    if (ageMs >= CACHE_TTL_MS) return null;

    // Cache is fresh — retrieve only articles from the last 3 days, ordered by score.
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1_000);
    const rows = await prisma.newsCache.findMany({
        where: { publishedAt: { gte: cutoff } },
        orderBy: { score: "desc" },
        take: 10,
    });

    return rows.map((row) => ({
        id: row.id,
        headline: row.headline,
        source: row.source,
        publishedAt: row.publishedAt,
        url: row.url,
        relevanceTags: deserializeTags(row.tags),
        score: row.score,
    }));
}

/**
 * Upsert each article into the NewsCache table, setting cachedAt to `now`.
 */
async function writeCache(articles: NewsArticle[], now: Date): Promise<void> {
    // Use individual upserts so that a partial failure does not roll back
    // successfully written articles. Errors are silently swallowed to ensure the
    // caller always receives the in-memory ranked articles even if persistence
    // fails.
    await Promise.allSettled(
        articles.map((article) =>
            prisma.newsCache.upsert({
                where: { id: article.id },
                create: {
                    id: article.id,
                    headline: article.headline,
                    source: article.source,
                    publishedAt: article.publishedAt,
                    url: article.url,
                    tags: serializeTags(article.relevanceTags),
                    score: article.score,
                    cachedAt: now,
                },
                update: {
                    headline: article.headline,
                    source: article.source,
                    publishedAt: article.publishedAt,
                    url: article.url,
                    tags: serializeTags(article.relevanceTags),
                    score: article.score,
                    cachedAt: now,
                },
            })
        )
    );
}

// ─── Serialisation helpers ────────────────────────────────────────────────────

function serializeTags(tags: string[]): string {
    return JSON.stringify(tags);
}

function deserializeTags(raw: string): string[] {
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.filter((t): t is string => typeof t === "string");
        }
        return [];
    } catch {
        return [];
    }
}
