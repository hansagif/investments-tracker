/**
 * Unit tests for lib/news/fetcher.ts
 *
 * Uses vitest's built-in fetch mock to avoid real network calls.
 * Requirements: 5.1
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchArticles } from "./fetcher";

// ---------------------------------------------------------------------------
// RSS helpers
// ---------------------------------------------------------------------------

function makeRssXml(channelTitle: string, items: { title: string; link: string; pubDate?: string }[]): string {
    const itemsXml = items
        .map(
            ({ title, link, pubDate }) => `
    <item>
      <title><![CDATA[${title}]]></title>
      <link>${link}</link>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}
    </item>`
        )
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${channelTitle}</title>
    <link>https://example.com</link>
    ${itemsXml}
  </channel>
</rss>`;
}

function mockFetch(xml: string, status = 200) {
    return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(xml),
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.restoreAllMocks();
});

describe("fetchArticles", () => {
    it("returns an empty array when no feed URLs are provided", async () => {
        const result = await fetchArticles([]);
        expect(result).toEqual([]);
    });

    it("parses a valid RSS feed into NewsArticle objects", async () => {
        const xml = makeRssXml("Test Finance", [
            {
                title: "Nvidia earnings beat estimates",
                link: "https://example.com/nvidia",
                pubDate: "Mon, 01 Jan 2024 12:00:00 GMT",
            },
        ]);

        vi.stubGlobal("fetch", mockFetch(xml));

        const articles = await fetchArticles(["https://example.com/rss"]);

        expect(articles).toHaveLength(1);
        expect(articles[0].headline).toBe("Nvidia earnings beat estimates");
        expect(articles[0].source).toBe("Test Finance");
        expect(articles[0].url).toBe("https://example.com/nvidia");
        expect(articles[0].publishedAt).toBeInstanceOf(Date);
        expect(articles[0].id).toHaveLength(16);
        expect(articles[0].relevanceTags).toEqual([]);
        expect(articles[0].score).toBe(0);
    });

    it("uses a deterministic id derived from the URL", async () => {
        const url = "https://example.com/article-abc";
        const xml = makeRssXml("Feed", [{ title: "Title", link: url, pubDate: "Mon, 01 Jan 2024 12:00:00 GMT" }]);

        vi.stubGlobal("fetch", mockFetch(xml));

        const articles = await fetchArticles(["https://example.com/rss"]);
        const expectedId = Buffer.from(url).toString("base64").slice(0, 16);
        expect(articles[0].id).toBe(expectedId);
    });

    it("decodes CDATA and HTML entities in headlines", async () => {
        // makeRssXml wraps item titles in <![CDATA[...]]> — pass plain text here.
        // Real RSS feeds use CDATA to avoid escaping special characters like & and '.
        const xml = makeRssXml("Feed", [
            {
                title: "Apple & Google: What's Next?",
                link: "https://example.com/apple-google",
                pubDate: "Mon, 01 Jan 2024 12:00:00 GMT",
            },
        ]);

        vi.stubGlobal("fetch", mockFetch(xml));

        const articles = await fetchArticles(["https://example.com/rss"]);
        expect(articles[0].headline).toBe("Apple & Google: What's Next?");
    });

    it("decodes raw CDATA section when present in title tag", async () => {
        // Simulate a raw RSS feed where CDATA appears inline in the XML title tag.
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Finance Feed</title>
    <item>
      <title><![CDATA[Apple & Google: What's Next?]]></title>
      <link>https://example.com/cdata-article</link>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

        vi.stubGlobal("fetch", mockFetch(xml));

        const articles = await fetchArticles(["https://example.com/rss"]);
        expect(articles[0].headline).toBe("Apple & Google: What's Next?");
    });

    it("fetches multiple feeds in parallel and returns a flat list", async () => {
        const xml1 = makeRssXml("Feed A", [{ title: "Article 1", link: "https://a.com/1", pubDate: "Mon, 01 Jan 2024 12:00:00 GMT" }]);
        const xml2 = makeRssXml("Feed B", [{ title: "Article 2", link: "https://b.com/2", pubDate: "Mon, 01 Jan 2024 12:00:00 GMT" }]);

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(xml1) })
            .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(xml2) });

        vi.stubGlobal("fetch", fetchMock);

        const articles = await fetchArticles(["https://a.com/rss", "https://b.com/rss"]);

        expect(articles).toHaveLength(2);
        expect(articles.map((a) => a.headline)).toEqual(
            expect.arrayContaining(["Article 1", "Article 2"])
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("skips a failed feed and still returns articles from successful ones", async () => {
        const xml = makeRssXml("Good Feed", [{ title: "Good Article", link: "https://good.com/1", pubDate: "Mon, 01 Jan 2024 12:00:00 GMT" }]);

        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error("Network failure"))
            .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(xml) });

        vi.stubGlobal("fetch", fetchMock);

        const articles = await fetchArticles(["https://bad.com/rss", "https://good.com/rss"]);

        expect(articles).toHaveLength(1);
        expect(articles[0].headline).toBe("Good Article");
    });

    it("skips a feed that returns a non-2xx HTTP status", async () => {
        const xml = makeRssXml("Good Feed", [{ title: "OK", link: "https://ok.com/1", pubDate: "Mon, 01 Jan 2024 12:00:00 GMT" }]);

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve("") })
            .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(xml) });

        vi.stubGlobal("fetch", fetchMock);

        const articles = await fetchArticles(["https://notfound.com/rss", "https://ok.com/rss"]);
        expect(articles).toHaveLength(1);
    });

    it("deduplicates articles with the same URL across multiple feeds", async () => {
        const sharedLink = "https://shared.com/article";
        const xml1 = makeRssXml("Feed A", [{ title: "Shared Story", link: sharedLink, pubDate: "Mon, 01 Jan 2024 12:00:00 GMT" }]);
        const xml2 = makeRssXml("Feed B", [{ title: "Shared Story", link: sharedLink, pubDate: "Mon, 01 Jan 2024 12:00:00 GMT" }]);

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(xml1) })
            .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(xml2) });

        vi.stubGlobal("fetch", fetchMock);

        const articles = await fetchArticles(["https://a.com/rss", "https://b.com/rss"]);
        expect(articles).toHaveLength(1);
    });

    it("skips items that are missing a title or link", async () => {
        const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Feed</title>
    <item>
      <title></title>
      <link>https://example.com/no-title</link>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>No Link Article</title>
      <link></link>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Valid Article</title>
      <link>https://example.com/valid</link>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

        vi.stubGlobal("fetch", mockFetch(xml));

        const articles = await fetchArticles(["https://example.com/rss"]);
        expect(articles).toHaveLength(1);
        expect(articles[0].headline).toBe("Valid Article");
    });

    it("falls back to current date when pubDate is missing", async () => {
        const before = new Date();
        const xml = makeRssXml("Feed", [{ title: "No Date", link: "https://example.com/no-date" }]);

        vi.stubGlobal("fetch", mockFetch(xml));

        const articles = await fetchArticles(["https://example.com/rss"]);
        const after = new Date();

        expect(articles).toHaveLength(1);
        expect(articles[0].publishedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(articles[0].publishedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("uses the feed URL as source when channel title is missing", async () => {
        const feedUrl = "https://example.com/rss";
        const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Some Article</title>
      <link>https://example.com/article</link>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

        vi.stubGlobal("fetch", mockFetch(xml));

        const articles = await fetchArticles([feedUrl]);
        expect(articles[0].source).toBe(feedUrl);
    });

    it("returns an empty array when all feeds fail", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("All down")));

        const articles = await fetchArticles(["https://a.com/rss", "https://b.com/rss"]);
        expect(articles).toEqual([]);
    });
});
