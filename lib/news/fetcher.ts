/**
 * fetcher.ts — parallel RSS fetch from configured feed URLs.
 *
 * Accepts an array of RSS feed URLs, fetches all of them in parallel using
 * Promise.allSettled, parses each XML response into NewsArticle objects, and
 * returns a flat deduplicated array of raw articles.
 *
 * relevanceTags and score are intentionally left at their zero/empty defaults;
 * they will be populated downstream by ranker.ts / gemini.ts.
 *
 * Requirements: 5.1
 */

import type { NewsArticle } from "./types";

/**
 * Generate a deterministic, short id from a URL.
 * Uses a simple FNV-like hash to ensure uniqueness even for URLs
 * with identical prefixes (e.g. all articles from the same domain).
 */
function hashUrl(url: string): string {
    let hash = 5381;
    for (let i = 0; i < url.length; i++) {
        hash = ((hash << 5) + hash) ^ url.charCodeAt(i);
        hash = hash >>> 0; // keep as 32-bit unsigned
    }
    return hash.toString(36).padStart(7, "0");
}

/**
 * Extract the text content of the first matching XML tag in a string.
 * Returns an empty string when the tag is not found.
 */
function extractTag(xml: string, tag: string): string {
    const open = `<${tag}>`;
    const close = `</${tag}>`;
    const start = xml.indexOf(open);
    if (start === -1) return "";
    const contentStart = start + open.length;
    const end = xml.indexOf(close, contentStart);
    if (end === -1) return "";
    return xml.slice(contentStart, end).trim();
}

/**
 * Decode common HTML/XML entities so headlines display cleanly.
 * CDATA sections are unwrapped first so that their raw content is
 * preserved without further entity expansion.
 */
function decodeEntities(text: string): string {
    // Unwrap CDATA sections first — their content is raw text, not escaped.
    const unwrapped = text.replace(/<!\[CDATA\[([\s\S]*?)]]>/g, "$1");
    return unwrapped
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

/**
 * Split a raw RSS XML string into individual <item> blocks.
 */
function splitItems(xml: string): string[] {
    const items: string[] = [];
    let searchFrom = 0;
    while (true) {
        const start = xml.indexOf("<item>", searchFrom);
        if (start === -1) break;
        const end = xml.indexOf("</item>", start);
        if (end === -1) break;
        items.push(xml.slice(start, end + "</item>".length));
        searchFrom = end + "</item>".length;
    }
    return items;
}

/**
 * Parse a single <item> block into a NewsArticle.
 * Returns null if required fields cannot be extracted.
 */
function parseItem(itemXml: string, channelSource: string): NewsArticle | null {
    try {
        const rawTitle = extractTag(itemXml, "title");
        const rawLink = extractTag(itemXml, "link");
        const rawPubDate = extractTag(itemXml, "pubDate");

        const headline = decodeEntities(rawTitle);
        const url = decodeEntities(rawLink).trim();

        if (!headline || !url) return null;

        const publishedAt = rawPubDate ? new Date(rawPubDate) : new Date();
        // Guard against invalid date strings
        if (isNaN(publishedAt.getTime())) return null;

        const id = hashUrl(url);

        return {
            id,
            headline,
            source: channelSource,
            publishedAt,
            url,
            relevanceTags: [],
            score: 0,
        };
    } catch {
        return null;
    }
}

/**
 * Extract the channel-level <title> from an RSS feed XML string.
 * Falls back to the feed URL when no title is found.
 */
function extractChannelTitle(xml: string, feedUrl: string): string {
    // The channel <title> appears before the first <item>
    const firstItem = xml.indexOf("<item>");
    const channelSection = firstItem === -1 ? xml : xml.slice(0, firstItem);
    const title = extractTag(channelSection, "title");
    return title ? decodeEntities(title) : feedUrl;
}

/**
 * Fetch and parse a single RSS feed URL.
 * Returns an array of articles (empty on any failure).
 */
async function fetchFeed(feedUrl: string): Promise<NewsArticle[]> {
    const response = await fetch(feedUrl, {
        headers: { "User-Agent": "investments-tracker/1.0 (RSS reader)" },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${feedUrl}`);
    }

    const xml = await response.text();
    const channelSource = extractChannelTitle(xml, feedUrl);
    const itemBlocks = splitItems(xml);

    const articles: NewsArticle[] = [];
    for (const block of itemBlocks) {
        const article = parseItem(block, channelSource);
        if (article !== null) {
            articles.push(article);
        }
    }

    return articles;
}

/**
 * Fetch all configured RSS feed URLs in parallel and return a flat,
 * deduplicated array of raw NewsArticle objects.
 *
 * - Feeds that fail to load are silently skipped (Promise.allSettled).
 * - Duplicate article ids (same URL) are removed; the first occurrence wins.
 *
 * @param feedUrls  Array of RSS/Atom feed URLs to fetch.
 */
export async function fetchArticles(feedUrls: string[]): Promise<NewsArticle[]> {
    if (feedUrls.length === 0) return [];

    const results = await Promise.allSettled(feedUrls.map(fetchFeed));

    const seen = new Set<string>();
    const articles: NewsArticle[] = [];

    for (const result of results) {
        if (result.status !== "fulfilled") continue;
        for (const article of result.value) {
            if (!seen.has(article.id)) {
                seen.add(article.id);
                articles.push(article);
            }
        }
    }

    return articles;
}
