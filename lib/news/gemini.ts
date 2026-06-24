/**
 * gemini.ts — AI-based relevance scoring for news articles using Google Gemini.
 *
 * Batches article headlines to the Gemini API and obtains a 0–100 relevance
 * score for each headline in the context of the user's portfolio.
 *
 * Falls back to returning articles with their existing scores unchanged when:
 *   - the API token is empty or not provided (Requirement 5.5 — missing token)
 *   - the API call fails with a network or HTTP error (Requirement 5.5 — network error)
 *   - the response times out (Requirement 5.5 — timeout)
 *   - the JSON response cannot be parsed (Requirement 5.5 — API error)
 *
 * Requirements: 5.4, 5.5
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { withGeminiRetry } from "@/lib/gemini-retry";
import type { NewsArticle } from "./types";

// Maximum number of articles processed in a single Gemini call.
// Matches the overall News_Aggregator cap from Requirement 5.2.
const MAX_BATCH_SIZE = 30;

// Request timeout in milliseconds — avoids blocking the news pipeline on a
// slow or unresponsive Gemini endpoint.
const REQUEST_TIMEOUT_MS = 15_000;

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Build the Gemini prompt for scoring article headlines by portfolio relevance.
 */
function buildScoringPrompt(headlines: string[], tickers: string[]): string {
    const tickerContext =
        tickers.length > 0 ? tickers.join(", ") : "a general investment portfolio";

    const numberedHeadlines = headlines
        .map((h, i) => `${i + 1}. ${h}`)
        .join("\n");

    return (
        `Given a portfolio containing: ${tickerContext}\n\n` +
        `Rate the relevance of each news headline for this portfolio ` +
        `(0-100, where 100 is highly relevant):\n` +
        `${numberedHeadlines}\n\n` +
        `Return ONLY a JSON array of numbers, one per headline, in the same order.`
    );
}

// ─── Response parser ──────────────────────────────────────────────────────────

/**
 * Strip Markdown code fences that Gemini sometimes wraps around JSON output.
 * e.g. ```json\n[...]\n``` → [...]
 */
function stripCodeFences(text: string): string {
    return text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
}

/**
 * Parse the Gemini response text into an array of clamped 0–100 scores.
 * Returns null if the text is not a valid JSON array of numbers.
 */
function parseScores(responseText: string, expectedLength: number): number[] | null {
    try {
        const cleaned = stripCodeFences(responseText);
        const parsed = JSON.parse(cleaned);

        if (!Array.isArray(parsed)) return null;
        if (parsed.length !== expectedLength) return null;

        const scores: number[] = [];
        for (const item of parsed) {
            const n = Number(item);
            if (!isFinite(n)) return null;
            // Clamp score to [0, 100]
            scores.push(Math.min(100, Math.max(0, n)));
        }

        return scores;
    } catch {
        return null;
    }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Score articles using Gemini API for 0–100 relevance based on portfolio context.
 * Falls back to returning articles with unchanged scores on any error.
 *
 * @param articles    Articles to score (max 30 at once)
 * @param tickers     Asset tickers and watchlist symbols for context
 * @param geminiToken Gemini API token; if empty/undefined, falls back immediately
 */
export async function scoreArticlesWithGemini(
    articles: NewsArticle[],
    tickers: string[],
    geminiToken?: string
): Promise<NewsArticle[]> {
    // Fallback 1: no token provided
    if (!geminiToken || geminiToken.trim() === "") {
        return articles;
    }

    // Work with at most MAX_BATCH_SIZE articles
    const batch = articles.slice(0, MAX_BATCH_SIZE);
    const rest = articles.slice(MAX_BATCH_SIZE);

    if (batch.length === 0) {
        return articles;
    }

    const headlines = batch.map((a) => a.headline);
    const prompt = buildScoringPrompt(headlines, tickers);

    try {
        const genAI = new GoogleGenerativeAI(geminiToken);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Wrap the API call in a timeout-race so a slow response falls back gracefully
        const apiCall = withGeminiRetry(() => model.generateContent(prompt));
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Gemini request timed out")), REQUEST_TIMEOUT_MS)
        );

        const result = await Promise.race([apiCall, timeoutPromise]);
        const responseText = result.response.text();

        const scores = parseScores(responseText, batch.length);

        // Fallback 2: unparseable or mismatched response
        if (scores === null) {
            return articles;
        }

        // Apply the returned scores to the batch articles
        const scoredBatch = batch.map((article, i) => ({
            ...article,
            score: scores[i],
        }));

        return [...scoredBatch, ...rest];
    } catch {
        // Fallback 3: API error, network error, or timeout
        return articles;
    }
}
