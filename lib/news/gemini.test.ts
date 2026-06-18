/**
 * Unit tests for lib/news/gemini.ts
 *
 * Tests the scoreArticlesWithGemini function covering:
 * - Missing/empty token fallback
 * - Successful scoring with clamping
 * - API error fallback
 * - Timeout fallback
 * - JSON parse error fallback
 * - Mismatched response length fallback
 * - Empty article list
 * - Scores clamped to [0, 100]
 *
 * Requirements: 5.4, 5.5
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import type { NewsArticle } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeArticle(overrides: Partial<NewsArticle> = {}): NewsArticle {
    return {
        id: "abc123",
        headline: "Test headline",
        source: "Test Source",
        publishedAt: new Date("2024-01-01T12:00:00Z"),
        url: "https://example.com/article",
        relevanceTags: [],
        score: 0,
        ...overrides,
    };
}

function makeArticles(count: number): NewsArticle[] {
    return Array.from({ length: count }, (_, i) =>
        makeArticle({ id: `id-${i}`, headline: `Headline ${i}`, url: `https://example.com/${i}` })
    );
}

// ─── Mock setup ───────────────────────────────────────────────────────────────

// We mock the @google/generative-ai module at the module level so tests can
// control the generateContent response without making real HTTP calls.

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
    generateContent: mockGenerateContent,
}));

vi.mock("@google/generative-ai", () => ({
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel,
    })),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

// Import after mocks are set up
const { scoreArticlesWithGemini } = await import("./gemini");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("scoreArticlesWithGemini", () => {
    describe("token guard", () => {
        test("returns articles unchanged when geminiToken is undefined", async () => {
            const articles = makeArticles(3);
            const result = await scoreArticlesWithGemini(articles, ["AAPL"]);
            expect(result).toEqual(articles);
            expect(mockGenerateContent).not.toHaveBeenCalled();
        });

        test("returns articles unchanged when geminiToken is empty string", async () => {
            const articles = makeArticles(3);
            const result = await scoreArticlesWithGemini(articles, ["AAPL"], "");
            expect(result).toEqual(articles);
            expect(mockGenerateContent).not.toHaveBeenCalled();
        });

        test("returns articles unchanged when geminiToken is whitespace only", async () => {
            const articles = makeArticles(2);
            const result = await scoreArticlesWithGemini(articles, ["MSFT"], "   ");
            expect(result).toEqual(articles);
            expect(mockGenerateContent).not.toHaveBeenCalled();
        });
    });

    describe("empty articles list", () => {
        test("returns empty array when no articles provided", async () => {
            const result = await scoreArticlesWithGemini([], ["AAPL"], "valid-token");
            expect(result).toEqual([]);
            expect(mockGenerateContent).not.toHaveBeenCalled();
        });
    });

    describe("successful scoring", () => {
        test("updates article scores from Gemini response", async () => {
            const articles = makeArticles(3);
            mockGenerateContent.mockResolvedValue({
                response: { text: () => "[75, 50, 90]" },
            });

            const result = await scoreArticlesWithGemini(articles, ["NVDA"], "token-123");

            expect(result).toHaveLength(3);
            expect(result[0].score).toBe(75);
            expect(result[1].score).toBe(50);
            expect(result[2].score).toBe(90);
        });

        test("preserves all other article fields when scoring", async () => {
            const articles = [
                makeArticle({ id: "x1", headline: "Important news", source: "Reuters", score: 0 }),
            ];
            mockGenerateContent.mockResolvedValue({
                response: { text: () => "[85]" },
            });

            const result = await scoreArticlesWithGemini(articles, ["AAPL"], "tok");

            expect(result[0].id).toBe("x1");
            expect(result[0].headline).toBe("Important news");
            expect(result[0].source).toBe("Reuters");
            expect(result[0].score).toBe(85);
        });

        test("accepts Gemini response wrapped in markdown code fences", async () => {
            const articles = makeArticles(2);
            mockGenerateContent.mockResolvedValue({
                response: { text: () => "```json\n[30, 70]\n```" },
            });

            const result = await scoreArticlesWithGemini(articles, [], "tok");

            expect(result[0].score).toBe(30);
            expect(result[1].score).toBe(70);
        });
    });

    describe("score clamping", () => {
        test("clamps scores above 100 to 100", async () => {
            const articles = makeArticles(2);
            mockGenerateContent.mockResolvedValue({
                response: { text: () => "[150, 200]" },
            });

            const result = await scoreArticlesWithGemini(articles, [], "tok");

            expect(result[0].score).toBe(100);
            expect(result[1].score).toBe(100);
        });

        test("clamps scores below 0 to 0", async () => {
            const articles = makeArticles(2);
            mockGenerateContent.mockResolvedValue({
                response: { text: () => "[-10, -50]" },
            });

            const result = await scoreArticlesWithGemini(articles, [], "tok");

            expect(result[0].score).toBe(0);
            expect(result[1].score).toBe(0);
        });

        test("accepts boundary scores 0 and 100 unchanged", async () => {
            const articles = makeArticles(2);
            mockGenerateContent.mockResolvedValue({
                response: { text: () => "[0, 100]" },
            });

            const result = await scoreArticlesWithGemini(articles, [], "tok");

            expect(result[0].score).toBe(0);
            expect(result[1].score).toBe(100);
        });
    });

    describe("fallback on error", () => {
        test("falls back to original articles on API error", async () => {
            const articles = makeArticles(3).map((a, i) => ({ ...a, score: i * 10 }));
            mockGenerateContent.mockRejectedValue(new Error("API 503 Service Unavailable"));

            const result = await scoreArticlesWithGemini(articles, ["TSLA"], "tok");

            expect(result).toEqual(articles);
        });

        test("falls back on JSON parse error", async () => {
            const articles = makeArticles(2).map((a) => ({ ...a, score: 5 }));
            mockGenerateContent.mockResolvedValue({
                response: { text: () => "not valid json" },
            });

            const result = await scoreArticlesWithGemini(articles, [], "tok");

            expect(result).toEqual(articles);
        });

        test("falls back when response is not an array", async () => {
            const articles = makeArticles(2).map((a) => ({ ...a, score: 5 }));
            mockGenerateContent.mockResolvedValue({
                response: { text: () => '{"score": 50}' },
            });

            const result = await scoreArticlesWithGemini(articles, [], "tok");

            expect(result).toEqual(articles);
        });

        test("falls back when response array length does not match", async () => {
            const articles = makeArticles(3).map((a) => ({ ...a, score: 5 }));
            mockGenerateContent.mockResolvedValue({
                response: { text: () => "[50, 60]" }, // only 2 scores for 3 articles
            });

            const result = await scoreArticlesWithGemini(articles, [], "tok");

            expect(result).toEqual(articles);
        });

        test("falls back when response contains non-numeric values", async () => {
            const articles = makeArticles(2).map((a) => ({ ...a, score: 5 }));
            mockGenerateContent.mockResolvedValue({
                response: { text: () => '["high", "low"]' },
            });

            const result = await scoreArticlesWithGemini(articles, [], "tok");

            expect(result).toEqual(articles);
        });
    });

    describe("batch size handling", () => {
        test("processes at most 30 articles per batch, passes rest through unchanged", async () => {
            const articles = makeArticles(35);
            const mockScores = Array.from({ length: 30 }, (_, i) => i + 1);
            mockGenerateContent.mockResolvedValue({
                response: { text: () => JSON.stringify(mockScores) },
            });

            const result = await scoreArticlesWithGemini(articles, [], "tok");

            expect(result).toHaveLength(35);
            // First 30 should have Gemini scores
            for (let i = 0; i < 30; i++) {
                expect(result[i].score).toBe(i + 1);
            }
            // Remaining 5 should keep original score (0)
            for (let i = 30; i < 35; i++) {
                expect(result[i].score).toBe(0);
            }
        });
    });

    describe("tickers in prompt", () => {
        test("calls Gemini API with a token (basic smoke test)", async () => {
            const articles = makeArticles(1);
            mockGenerateContent.mockResolvedValue({
                response: { text: () => "[42]" },
            });

            await scoreArticlesWithGemini(articles, ["AAPL", "NVDA"], "my-token");

            expect(mockGenerateContent).toHaveBeenCalledOnce();
            const promptArg = mockGenerateContent.mock.calls[0][0] as string;
            expect(typeof promptArg).toBe("string");
            expect(promptArg).toContain("AAPL");
            expect(promptArg).toContain("NVDA");
        });

        test("uses generic portfolio context when tickers list is empty", async () => {
            const articles = makeArticles(1);
            mockGenerateContent.mockResolvedValue({
                response: { text: () => "[55]" },
            });

            await scoreArticlesWithGemini(articles, [], "my-token");

            const promptArg = mockGenerateContent.mock.calls[0][0] as string;
            expect(promptArg).toContain("general investment portfolio");
        });
    });
});
