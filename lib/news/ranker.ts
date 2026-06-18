/**
 * ranker.ts — Filtering, priority keyword boost, recency score, and fallback sort.
 *
 * Ranking pipeline:
 *   1. Filter: keep articles mentioning at least one ticker/watchlist symbol
 *      (case-insensitive substring match in headline). When tickers is empty,
 *      skip the filter and keep all articles.
 *   2. Priority keyword boost: +20 points per matching hard-coded keyword.
 *   3. Recency score: decays linearly from 100 → 0 over 24 hours.
 *   4. Fallback sort: descending by (priorityBoost + recencyScore).
 *   5. Cap: return at most 30 articles.
 *   6. relevanceTags: populated with matched tickers and priority keywords.
 *
 * Requirements: 5.2, 5.3, 5.5
 */

import type { NewsArticle } from "./types";

export const PRIORITY_KEYWORDS = [
    "Nvidia Blackwell",
    "SpaceX IPO",
    "Broadcom earnings",
    "Quantum Computing",
    "Palantir defense contracts",
] as const;

export const MAX_ARTICLES = 30;
export const PRIORITY_BOOST = 20;

/** Minutes in 24 hours — the recency decay window. */
const DECAY_WINDOW_MINUTES = 24 * 60;

/**
 * Compute a recency score in the range [0, 100].
 * The score is 100 for a brand-new article and decays linearly to 0 at 24 h.
 * Articles older than 24 h clamp to 0.
 */
function computeRecencyScore(publishedAt: Date, now: Date): number {
    const ageMs = now.getTime() - publishedAt.getTime();
    const ageMinutes = ageMs / 60_000;
    return Math.max(0, 100 - (ageMinutes / DECAY_WINDOW_MINUTES) * 100);
}

/**
 * Rank a list of raw NewsArticle objects.
 *
 * @param articles  Flat list of raw articles (e.g. from fetcher.ts).
 * @param tickers   Asset ticker symbols plus watchlist items to filter by.
 *                  When empty, the filter step is skipped and all articles
 *                  are retained.
 * @param now       Reference timestamp used for recency scoring (defaults to
 *                  `new Date()`). Injected to keep the function pure and
 *                  testable.
 * @returns         Up to MAX_ARTICLES ranked articles with relevanceTags and
 *                  score populated.
 */
export function rankArticles(
    articles: NewsArticle[],
    tickers: string[],
    now: Date = new Date()
): NewsArticle[] {
    // -----------------------------------------------------------------------
    // Step 1 — Filter
    // -----------------------------------------------------------------------
    // Only filter when the caller provides at least one ticker/symbol.
    // This covers the fallback case (Requirement 5.5): when no tickers are
    // configured, surface all fetched articles rather than returning nothing.
    const lowerTickers = tickers.map((t) => t.toLowerCase());

    const filtered =
        lowerTickers.length === 0
            ? articles
            : articles.filter((article) => {
                const lowerHeadline = article.headline.toLowerCase();
                return lowerTickers.some((ticker) => lowerHeadline.includes(ticker));
            });

    // -----------------------------------------------------------------------
    // Steps 2–4 — Score and sort (immutable — create new article objects)
    // -----------------------------------------------------------------------
    const scored = filtered.map((article): NewsArticle & { _totalScore: number } => {
        const lowerHeadline = article.headline.toLowerCase();

        // Matched tickers for relevanceTags
        const matchedTickers = lowerTickers.filter((ticker) =>
            lowerHeadline.includes(ticker)
        );

        // Matched priority keywords for relevanceTags + boost
        const matchedKeywords = PRIORITY_KEYWORDS.filter((kw) =>
            lowerHeadline.includes(kw.toLowerCase())
        );

        const priorityBoost = matchedKeywords.length * PRIORITY_BOOST;
        const recencyScore = computeRecencyScore(article.publishedAt, now);
        const totalScore = priorityBoost + recencyScore;

        // Restore original ticker casing by looking up from the original tickers array
        const originalMatchedTickers = tickers.filter((t) =>
            lowerHeadline.includes(t.toLowerCase())
        );

        // Merge new tags with any pre-existing ones (deduplicated)
        const newTags = [...originalMatchedTickers, ...matchedKeywords];
        const mergedTags = Array.from(new Set([...article.relevanceTags, ...newTags]));

        return {
            ...article,
            relevanceTags: mergedTags,
            score: totalScore,
            _totalScore: totalScore,
        };
    });

    // Sort descending by total score (step 4 — fallback sort)
    scored.sort((a, b) => b._totalScore - a._totalScore);

    // -----------------------------------------------------------------------
    // Step 5 — Cap at MAX_ARTICLES
    // -----------------------------------------------------------------------
    return scored.slice(0, MAX_ARTICLES).map(({ _totalScore, ...article }) => article);
}
