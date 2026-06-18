/**
 * Represents a single news article fetched from an RSS feed or news API.
 * relevanceTags and score are populated by the ranker (ranker.ts / gemini.ts);
 * fetcher.ts initialises them to empty / zero.
 */
export interface NewsArticle {
    /** Deterministic id — base64 of the article URL, first 16 chars */
    id: string;
    headline: string;
    /** Channel title from the RSS feed */
    source: string;
    publishedAt: Date;
    url: string;
    /** Matched ticker symbols or priority keywords — filled by ranker */
    relevanceTags: string[];
    /** 0–100 relevance score — filled by ranker or Gemini */
    score: number;
}
