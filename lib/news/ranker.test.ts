/**
 * Unit tests for lib/news/ranker.ts
 *
 * Requirements: 5.2, 5.3, 5.5
 */

import { describe, it, expect } from "vitest";
import { rankArticles, PRIORITY_KEYWORDS, MAX_ARTICLES, PRIORITY_BOOST } from "./ranker";
import type { NewsArticle } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArticle(overrides: Partial<NewsArticle> & Pick<NewsArticle, "headline" | "publishedAt">): NewsArticle {
    return {
        id: Math.random().toString(36).slice(2),
        source: "Test Feed",
        url: `https://example.com/${Math.random()}`,
        relevanceTags: [],
        score: 0,
        ...overrides,
    };
}

/** Returns a Date that is `minutesAgo` minutes in the past relative to `now`. */
function minutesAgo(minutes: number, now: Date = new Date()): Date {
    return new Date(now.getTime() - minutes * 60_000);
}

const NOW = new Date("2024-06-15T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Filter step
// ---------------------------------------------------------------------------

describe("rankArticles — filter step", () => {
    it("keeps articles whose headline contains a ticker (case-insensitive)", () => {
        const articles = [
            makeArticle({ headline: "NVDA stock hits new high", publishedAt: minutesAgo(10, NOW) }),
            makeArticle({ headline: "Gold prices fall sharply", publishedAt: minutesAgo(10, NOW) }),
        ];

        const result = rankArticles(articles, ["NVDA"], NOW);

        expect(result).toHaveLength(1);
        expect(result[0].headline).toBe("NVDA stock hits new high");
    });

    it("matches tickers case-insensitively", () => {
        const articles = [
            makeArticle({ headline: "nvda quarterly report", publishedAt: minutesAgo(5, NOW) }),
        ];
        const result = rankArticles(articles, ["NVDA"], NOW);
        expect(result).toHaveLength(1);
    });

    it("skips the filter entirely when tickers array is empty", () => {
        const articles = [
            makeArticle({ headline: "Unrelated article about weather", publishedAt: minutesAgo(5, NOW) }),
            makeArticle({ headline: "Gold prices soar", publishedAt: minutesAgo(10, NOW) }),
        ];

        const result = rankArticles(articles, [], NOW);
        expect(result).toHaveLength(2);
    });

    it("returns empty array when no articles match any ticker", () => {
        const articles = [
            makeArticle({ headline: "Unrelated commodity news", publishedAt: minutesAgo(5, NOW) }),
        ];
        const result = rankArticles(articles, ["TSLA", "AAPL"], NOW);
        expect(result).toHaveLength(0);
    });

    it("keeps an article if any one of several tickers matches", () => {
        const articles = [
            makeArticle({ headline: "TSLA earnings miss estimates", publishedAt: minutesAgo(5, NOW) }),
        ];
        const result = rankArticles(articles, ["AAPL", "TSLA", "NVDA"], NOW);
        expect(result).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Priority keyword boost
// ---------------------------------------------------------------------------

describe("rankArticles — priority keyword boost", () => {
    it("adds +20 points for a single matching priority keyword", () => {
        const kw = PRIORITY_KEYWORDS[0]; // "Nvidia Blackwell"
        const article = makeArticle({
            headline: `${kw} chips supply surge`,
            publishedAt: minutesAgo(0, NOW), // brand-new → recencyScore ≈ 100
        });

        const [ranked] = rankArticles([article], [], NOW);
        // recencyScore ≈ 100 (0 minutes old), priorityBoost = 20 → score ≈ 120
        expect(ranked.score).toBeCloseTo(100 + PRIORITY_BOOST, 1);
    });

    it("adds +20 per keyword — two keywords yields +40", () => {
        // Two keywords in same headline
        const headline = `${PRIORITY_KEYWORDS[0]} and ${PRIORITY_KEYWORDS[2]} outlook`;
        const article = makeArticle({ headline, publishedAt: minutesAgo(0, NOW) });

        const [ranked] = rankArticles([article], [], NOW);
        expect(ranked.score).toBeCloseTo(100 + 2 * PRIORITY_BOOST, 1);
    });

    it("keyword match is case-insensitive", () => {
        const article = makeArticle({
            headline: "NVIDIA BLACKWELL production begins",
            publishedAt: minutesAgo(0, NOW),
        });

        const [ranked] = rankArticles([article], [], NOW);
        expect(ranked.score).toBeGreaterThan(100); // boost was applied
    });

    it("populates relevanceTags with matched priority keywords", () => {
        const kw = PRIORITY_KEYWORDS[1]; // "SpaceX IPO"
        const article = makeArticle({
            headline: `${kw} valuation news`,
            publishedAt: minutesAgo(5, NOW),
        });

        const [ranked] = rankArticles([article], [], NOW);
        expect(ranked.relevanceTags).toContain(kw);
    });

    it("populates relevanceTags with matched tickers", () => {
        const article = makeArticle({
            headline: "PLTR defense contract award",
            publishedAt: minutesAgo(5, NOW),
        });

        const [ranked] = rankArticles([article], ["PLTR"], NOW);
        expect(ranked.relevanceTags).toContain("PLTR");
    });

    it("merges ticker and keyword tags without duplicates", () => {
        const kw = PRIORITY_KEYWORDS[4]; // "Palantir defense contracts"
        const article = makeArticle({
            headline: `PLTR: ${kw} expansion`,
            publishedAt: minutesAgo(5, NOW),
        });

        const [ranked] = rankArticles([article], ["PLTR"], NOW);
        const tags = ranked.relevanceTags;
        expect(tags).toContain("PLTR");
        expect(tags).toContain(kw);
        // No duplicates
        expect(tags.length).toBe(new Set(tags).size);
    });
});

// ---------------------------------------------------------------------------
// Recency score
// ---------------------------------------------------------------------------

describe("rankArticles — recency score", () => {
    it("gives score ≈ 100 for a brand-new article (0 minutes old)", () => {
        const article = makeArticle({ headline: "Fresh news", publishedAt: NOW });
        const [ranked] = rankArticles([article], [], NOW);
        expect(ranked.score).toBeCloseTo(100, 1);
    });

    it("gives score ≈ 50 for an article published 12 hours ago", () => {
        const article = makeArticle({ headline: "Mid-day news", publishedAt: minutesAgo(720, NOW) });
        const [ranked] = rankArticles([article], [], NOW);
        expect(ranked.score).toBeCloseTo(50, 1);
    });

    it("gives score = 0 for an article published exactly 24 hours ago", () => {
        const article = makeArticle({ headline: "Old news", publishedAt: minutesAgo(1440, NOW) });
        const [ranked] = rankArticles([article], [], NOW);
        expect(ranked.score).toBe(0);
    });

    it("clamps score to 0 for articles older than 24 hours", () => {
        const article = makeArticle({ headline: "Very old news", publishedAt: minutesAgo(2880, NOW) });
        const [ranked] = rankArticles([article], [], NOW);
        expect(ranked.score).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Fallback sort
// ---------------------------------------------------------------------------

describe("rankArticles — fallback sort", () => {
    it("sorts articles with higher total score first", () => {
        const kwArticle = makeArticle({
            headline: `${PRIORITY_KEYWORDS[0]} deep dive`,
            publishedAt: minutesAgo(60, NOW), // slightly older
        });
        const plainArticle = makeArticle({
            headline: "Plain market update",
            publishedAt: minutesAgo(10, NOW), // newer but no keyword boost
        });

        const result = rankArticles([plainArticle, kwArticle], [], NOW);

        // kwArticle: recency≈95.8 + boost 20 ≈ 115.8; plainArticle: recency≈99.3
        // kwArticle score is higher due to keyword boost
        expect(result[0].headline).toBe(kwArticle.headline);
    });

    it("puts most recent article first when both have the same boost", () => {
        const older = makeArticle({ headline: "Old article NVDA", publishedAt: minutesAgo(120, NOW) });
        const newer = makeArticle({ headline: "Newer article NVDA", publishedAt: minutesAgo(10, NOW) });

        const result = rankArticles([older, newer], ["NVDA"], NOW);
        expect(result[0].headline).toBe(newer.headline);
    });
});

// ---------------------------------------------------------------------------
// Cap at MAX_ARTICLES
// ---------------------------------------------------------------------------

describe("rankArticles — cap at MAX_ARTICLES", () => {
    it("returns at most 30 articles regardless of input size", () => {
        const articles = Array.from({ length: 50 }, (_, i) =>
            makeArticle({ headline: `Article ${i}`, publishedAt: minutesAgo(i, NOW) })
        );

        const result = rankArticles(articles, [], NOW);
        expect(result.length).toBeLessThanOrEqual(MAX_ARTICLES);
        expect(result).toHaveLength(MAX_ARTICLES);
    });

    it("returns fewer than 30 articles when input has fewer", () => {
        const articles = [
            makeArticle({ headline: "Only one", publishedAt: NOW }),
        ];
        const result = rankArticles(articles, [], NOW);
        expect(result).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Return type integrity
// ---------------------------------------------------------------------------

describe("rankArticles — return type", () => {
    it("returns NewsArticle objects without internal _totalScore field", () => {
        const article = makeArticle({ headline: "AAPL news", publishedAt: NOW });
        const [result] = rankArticles([article], ["AAPL"], NOW);
        expect(result).not.toHaveProperty("_totalScore");
    });

    it("does not mutate the original article objects", () => {
        const article = makeArticle({ headline: "AAPL update", publishedAt: NOW });
        const originalTags = [...article.relevanceTags];
        rankArticles([article], ["AAPL"], NOW);
        expect(article.relevanceTags).toEqual(originalTags);
    });
});
