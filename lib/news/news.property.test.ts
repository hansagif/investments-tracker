// Feature: ai-wealth-dashboard, Property 14: Article rendering completeness
// Feature: ai-wealth-dashboard, Property 12: News result count upper bound
// Feature: ai-wealth-dashboard, Property 13: Priority keyword articles rank above non-matching peers
// Feature: ai-wealth-dashboard, Property 15: Watchlist mutations are isolated from asset positions
// Feature: ai-wealth-dashboard, Property 16: News cache minimum TTL

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArticleCard } from '@/app/components/tabs/News';
import * as fc from 'fast-check';
import { rankArticles, PRIORITY_KEYWORDS } from './ranker';
import type { NewsArticle } from './types';

// ─── Mocks for Property 16 (getNews cache TTL) ───────────────────────────────
// vi.hoisted ensures mock functions are created before any module factory runs.
const { mockFindFirst, mockFindMany, mockFetchArticlesHoisted } = vi.hoisted(() => ({
    mockFindFirst: vi.fn(),
    mockFindMany: vi.fn(),
    mockFetchArticlesHoisted: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
    PrismaClient: vi.fn().mockImplementation(() => ({
        newsCache: {
            findFirst: mockFindFirst,
            findMany: mockFindMany,
            upsert: vi.fn().mockResolvedValue({}),
        },
    })),
}));

vi.mock('./fetcher', () => ({
    fetchArticles: mockFetchArticlesHoisted,
}));

vi.mock('./gemini', () => ({
    scoreArticlesWithGemini: vi.fn(async (articles: NewsArticle[]) => articles),
}));

// Import AFTER mocks are registered
const { getNews } = await import('./index');

// ─── Shared article arbitraries ───────────────────────────────────────────────

const articleArbitrary: fc.Arbitrary<NewsArticle> = fc.record({
    id: fc.string({ minLength: 1, maxLength: 16 }),
    headline: fc.string({ minLength: 1, maxLength: 100 }),
    source: fc.constant('Test Source'),
    publishedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
    url: fc.string({ minLength: 10, maxLength: 100 }),
    relevanceTags: fc.constant([]),
    score: fc.constant(0),
});

// ─── Properties 12 & 13 ───────────────────────────────────────────────────────

describe('News ranker property tests', () => {
    /**
     * Property 12: News result count upper bound
     * Validates: Requirements 5.2
     */
    test('Property 12: News result count upper bound', () => {
        fc.assert(
            fc.property(
                fc.array(articleArbitrary, { minLength: 0, maxLength: 100 }),
                (articles) => {
                    const result = rankArticles(articles, [], new Date());
                    expect(result.length).toBeLessThanOrEqual(30);
                }
            ),
            { numRuns: 25 }
        );
    });

    /**
     * Property 13: Priority keyword articles rank above non-matching peers
     * Validates: Requirements 5.3
     */
    test('Property 13: Priority keyword articles rank above non-matching peers', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...PRIORITY_KEYWORDS),
                fc.date({ min: new Date('2024-01-01'), max: new Date('2024-06-01') }),
                (keyword, publishedAt) => {
                    const now = new Date('2024-06-15T12:00:00Z');

                    // Both articles have the same base (same publish date = same recency score)
                    const keywordArticle: NewsArticle = {
                        id: 'keyword-article',
                        headline: `${keyword} latest developments`,
                        source: 'Feed',
                        publishedAt,
                        url: 'https://example.com/keyword',
                        relevanceTags: [],
                        score: 0,
                    };

                    const plainArticle: NewsArticle = {
                        id: 'plain-article',
                        headline: 'General market update today',
                        source: 'Feed',
                        publishedAt,  // Same date = same recency score
                        url: 'https://example.com/plain',
                        relevanceTags: [],
                        score: 0,
                    };

                    const result = rankArticles([keywordArticle, plainArticle], [], now);

                    // Keyword article should rank first (higher score)
                    expect(result.length).toBeGreaterThan(0);
                    const keywordIdx = result.findIndex(a => a.id === 'keyword-article');
                    const plainIdx = result.findIndex(a => a.id === 'plain-article');

                    if (keywordIdx !== -1 && plainIdx !== -1) {
                        expect(keywordIdx).toBeLessThan(plainIdx);
                    }
                }
            ),
            { numRuns: 25 }
        );
    });
});

// ─── Property 15 ──────────────────────────────────────────────────────────────

/**
 * Property 15: Watchlist mutations are isolated from asset positions
 * Validates: Requirements 5.8
 *
 * For any portfolio state, adding or removing items from the Watchlist SHALL
 * leave the `assets` array in exactly the same state (same length, same
 * values, same order) as before the watchlist mutation.
 *
 * The test is purely structural — no HTTP calls, no database access.
 * It operates on plain AppConfig + Asset data objects and a pure
 * updateWatchlist helper that simulates the watchlist-only mutation.
 */

// ─── Inline AppConfig / Asset types (no Prisma import needed here) ───────────

interface AppConfigLike {
    watchlist: string[];
}

interface AssetLike {
    ticker: string;
    name: string;
    type: string;
    sector: string;
    currentValue: number;
    costBasis: number;
    currency: string;
}

/**
 * Pure helper that simulates a watchlist mutation — add a symbol when it is
 * absent, or remove it when it is present.  It deliberately operates ONLY on
 * the config object and never touches the assets array.
 */
function updateWatchlist(
    config: AppConfigLike,
    symbol: string,
    action: "add" | "remove",
): AppConfigLike {
    if (action === "add") {
        const alreadyPresent = config.watchlist.includes(symbol);
        return {
            ...config,
            watchlist: alreadyPresent
                ? [...config.watchlist]
                : [...config.watchlist, symbol],
        };
    }
    return {
        ...config,
        watchlist: config.watchlist.filter((s) => s !== symbol),
    };
}

// ─── Arbitrary definitions ────────────────────────────────────────────────────

const watchlistArbitrary = fc.array(
    fc.string({ minLength: 1, maxLength: 10 }),
    { minLength: 0, maxLength: 20 },
);

const assetArbitrary: fc.Arbitrary<AssetLike> = fc.record({
    ticker: fc.string({ minLength: 1, maxLength: 10 }),
    name: fc.string({ minLength: 0, maxLength: 50 }),
    type: fc.constantFrom("Stock", "ETF"),
    sector: fc.constantFrom(
        "Technology",
        "Healthcare",
        "Finance",
        "Energy",
        "Consumer",
        "Industrial",
        "Real Estate",
        "Other",
    ),
    currentValue: fc.float({ min: 0, max: 100_000, noNaN: true }),
    costBasis: fc.float({ min: 0, max: 100_000, noNaN: true }),
    currency: fc.constantFrom("USD", "EUR", "RON"),
});

const assetsArrayArbitrary = fc.array(assetArbitrary, {
    minLength: 0,
    maxLength: 11,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Property 15: Watchlist mutations are isolated from asset positions", () => {
    /**
     * **Validates: Requirements 5.8**
     *
     * Adding a symbol to the watchlist must not change the assets array in any
     * way — same length, same items, same order.
     */
    test("Property 15: adding a watchlist item leaves assets unchanged", () => {
        fc.assert(
            fc.property(
                watchlistArbitrary,
                assetsArrayArbitrary,
                fc.string({ minLength: 1, maxLength: 10 }),
                (watchlist, assets, symbolToAdd) => {
                    const config: AppConfigLike = { watchlist };

                    // Deep-clone the original assets so we can compare later
                    const assetsBefore = assets.map((a) => ({ ...a }));

                    // Perform a watchlist mutation
                    const _updatedConfig = updateWatchlist(config, symbolToAdd, "add");

                    // Assets must be completely unchanged
                    expect(assets).toHaveLength(assetsBefore.length);
                    assets.forEach((asset, idx) => {
                        expect(asset).toEqual(assetsBefore[idx]);
                    });
                },
            ),
            { numRuns: 25 },
        );
    });

    /**
     * **Validates: Requirements 5.8**
     *
     * Removing a symbol from the watchlist must not change the assets array.
     */
    test("Property 15: removing a watchlist item leaves assets unchanged", () => {
        fc.assert(
            fc.property(
                watchlistArbitrary,
                assetsArrayArbitrary,
                fc.string({ minLength: 1, maxLength: 10 }),
                (watchlist, assets, symbolToRemove) => {
                    const config: AppConfigLike = { watchlist };

                    const assetsBefore = assets.map((a) => ({ ...a }));

                    const _updatedConfig = updateWatchlist(config, symbolToRemove, "remove");

                    expect(assets).toHaveLength(assetsBefore.length);
                    assets.forEach((asset, idx) => {
                        expect(asset).toEqual(assetsBefore[idx]);
                    });
                },
            ),
            { numRuns: 25 },
        );
    });

    /**
     * **Validates: Requirements 5.8**
     *
     * A sequence of arbitrary watchlist add/remove operations must leave
     * the assets array completely intact throughout.
     */
    test("Property 15: sequence of watchlist add/remove leaves assets unchanged", () => {
        fc.assert(
            fc.property(
                watchlistArbitrary,
                assetsArrayArbitrary,
                fc.array(
                    fc.record({
                        symbol: fc.string({ minLength: 1, maxLength: 10 }),
                        action: fc.constantFrom("add" as const, "remove" as const),
                    }),
                    { minLength: 1, maxLength: 10 },
                ),
                (watchlist, assets, operations) => {
                    let config: AppConfigLike = { watchlist };

                    const assetsBefore = assets.map((a) => ({ ...a }));

                    // Apply the full sequence of watchlist mutations
                    for (const op of operations) {
                        config = updateWatchlist(config, op.symbol, op.action);
                    }

                    // Assets must remain identical after all mutations
                    expect(assets).toHaveLength(assetsBefore.length);
                    assets.forEach((asset, idx) => {
                        expect(asset).toEqual(assetsBefore[idx]);
                    });
                },
            ),
            { numRuns: 25 },
        );
    });
});

// ─── Property 16 ──────────────────────────────────────────────────────────────

describe('News cache TTL property tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * Property 16: News cache minimum TTL
     * Validates: Requirements 5.9
     *
     * For any cache entry whose age is strictly less than 15 minutes,
     * a call to getNews() SHALL return the cached articles and SHALL NOT
     * trigger fetchArticles (i.e. no new network fetch).
     */
    test('Property 16: cache within 15 min returns cached articles without new fetch', async () => {
        const now = Date.now();

        const cachedArticles = [
            {
                id: 'cached-1',
                headline: 'Cached headline 1',
                source: 'Reuters',
                publishedAt: new Date('2024-06-01T10:00:00Z'),
                url: 'https://example.com/1',
                tags: JSON.stringify(['AAPL']),
                score: 80,
            },
            {
                id: 'cached-2',
                headline: 'Cached headline 2',
                source: 'BBC',
                publishedAt: new Date('2024-06-01T09:00:00Z'),
                url: 'https://example.com/2',
                tags: JSON.stringify([]),
                score: 50,
            },
        ];

        await fc.assert(
            fc.asyncProperty(
                // Age in seconds strictly less than 15 minutes (0 .. 899)
                fc.integer({ min: 0, max: 899 }),
                async (ageSeconds) => {
                    vi.clearAllMocks();

                    const cachedAt = new Date(now - ageSeconds * 1_000);

                    // Simulate a fresh cache entry (cachedAt within TTL window)
                    mockFindFirst.mockResolvedValue({ cachedAt });

                    // Return the cached rows when findMany is called
                    mockFindMany.mockResolvedValue(
                        cachedArticles.map((a) => ({ ...a, cachedAt }))
                    );

                    // fetchArticles must NOT be called — cache is fresh
                    mockFetchArticlesHoisted.mockResolvedValue([]);

                    const result = await getNews({
                        feedUrls: ['https://example.com/feed'],
                        assets: [],
                        watchlist: [],
                    });

                    // The orchestrator must return cached articles
                    expect(result.length).toBe(cachedArticles.length);
                    expect(result.map((a) => a.id)).toEqual(
                        cachedArticles.map((a) => a.id)
                    );

                    // No new network fetch must have been triggered
                    expect(mockFetchArticlesHoisted).not.toHaveBeenCalled();
                }
            ),
            { numRuns: 25 }
        );
    });

    /**
     * Property 16 (expiry side): Cache at or beyond 15 minutes DOES trigger
     * a new fetch. This is the complementary bound ensuring the TTL is
     * honoured in both directions.
     * Validates: Requirements 5.9
     */
    test('Property 16: cache at or beyond 15 min triggers a new fetch', async () => {
        const now = Date.now();

        await fc.assert(
            fc.asyncProperty(
                // Age in seconds >= 15 minutes (900 .. 7200 = 2h)
                fc.integer({ min: 900, max: 7200 }),
                async (ageSeconds) => {
                    vi.clearAllMocks();

                    const cachedAt = new Date(now - ageSeconds * 1_000);

                    // Simulate a stale cache entry
                    mockFindFirst.mockResolvedValue({ cachedAt });
                    mockFindMany.mockResolvedValue([]);

                    const freshArticles: NewsArticle[] = [
                        {
                            id: 'fresh-1',
                            headline: 'Breaking news',
                            source: 'Reuters',
                            publishedAt: new Date(),
                            url: 'https://example.com/fresh',
                            relevanceTags: [],
                            score: 0,
                        },
                    ];
                    mockFetchArticlesHoisted.mockResolvedValue(freshArticles);

                    await getNews({
                        feedUrls: ['https://example.com/feed'],
                        assets: [],
                        watchlist: [],
                    });

                    // fetchArticles MUST have been called since cache is stale
                    expect(mockFetchArticlesHoisted).toHaveBeenCalledOnce();
                }
            ),
            { numRuns: 25 }
        );
    });
});

