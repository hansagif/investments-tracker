/**
 * Unit tests for the News tab component
 *
 * Covers:
 *  - Staleness indicator: shown when /api/news returns a cachedAt timestamp (Requirement 5.6)
 *  - No staleness indicator when cachedAt is absent (fresh fetch) (Requirement 5.6)
 *  - Error message displayed when /api/news returns an error (Requirement 5.6)
 *  - Refresh button: clicking it calls /api/news?refresh=true (Requirement 5.1)
 *  - Refresh button is disabled while refreshing
 *  - Watchlist add: triggers GET /api/settings then PUT /api/settings (Requirement 5.8)
 *  - Watchlist remove: clicking x calls PUT /api/settings with item removed (Requirement 5.8)
 *  - Watchlist mutation only touches watchlist field, not assets (Requirement 5.8)
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { News } from "./News";

// --- Helpers ------------------------------------------------------------------

const defaultSettings = {
    ocrBackend: "tesseract" as const,
    geminiApiToken: "",
    watchlist: ["AAPL", "MSFT"],
    newsFeeds: ["https://feeds.finance.yahoo.com/rss/2.0/headline"],
    simulationDefaults: {},
};

const sampleArticle = {
    id: "article-1",
    headline: "Markets Rally on Strong Earnings",
    source: "Reuters",
    publishedAt: new Date().toISOString(),
    url: "https://example.com/article-1",
    relevanceTags: ["AAPL"],
    score: 0.9,
};

function mockNewsResponse(overrides: {
    articles?: typeof sampleArticle[];
    cachedAt?: string;
    error?: string;
} = {}) {
    return Promise.resolve({
        ok: !overrides.error,
        status: overrides.error ? 500 : 200,
        json: async () => ({
            articles: overrides.articles ?? [sampleArticle],
            cachedAt: overrides.cachedAt,
            error: overrides.error,
        }),
    } as Response);
}

function mockSettingsResponse(settings = defaultSettings) {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => settings,
    } as Response);
}

function mockSettingsPutResponse(settings = defaultSettings) {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => settings,
    } as Response);
}

// --- Test suite ---------------------------------------------------------------

describe("News tab", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -- Initial loading -------------------------------------------------------

    it("shows a loading indicator while news is being fetched", () => {
        global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

        render(<News />);

        expect(screen.getByTestId("news-loading")).toBeInTheDocument();
    });

    // -- Staleness indicator (Requirement 5.6) ---------------------------------

    it("shows Last updated X minutes ago when /api/news returns a cachedAt timestamp", async () => {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news") return mockNewsResponse({ cachedAt: fiveMinutesAgo });
            return mockSettingsResponse();
        });

        render(<News />);

        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        const stalenessEl = screen.getByRole("status");
        expect(stalenessEl).toHaveTextContent(/last updated/i);
        expect(stalenessEl).toHaveTextContent(/minutes ago/);
    });

    it("does NOT show a staleness indicator when cachedAt is absent (fresh fetch)", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news") return mockNewsResponse({ cachedAt: undefined });
            return mockSettingsResponse();
        });

        render(<News />);

        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("shows just now in staleness indicator for a timestamp less than 1 minute ago", async () => {
        const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news") return mockNewsResponse({ cachedAt: thirtySecondsAgo });
            return mockSettingsResponse();
        });

        render(<News />);

        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        const stalenessEl = screen.getByRole("status");
        expect(stalenessEl).toHaveTextContent(/last updated just now/i);
    });

    // -- Error message (Requirement 5.6) ---------------------------------------

    it("shows an error message when /api/news returns an error", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news") return mockNewsResponse({ error: "Failed to fetch news" });
            return mockSettingsResponse();
        });

        render(<News />);

        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent(/failed to fetch news/i);
    });

    it("shows a fallback error message when /api/news fails with no error text", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news") {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: async () => ({}),
                } as Response);
            }
            return mockSettingsResponse();
        });

        render(<News />);

        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent(/unable to load news/i);
    });

    it("shows a generic error when fetch throws (network failure)", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news") return Promise.reject(new Error("Network error"));
            return mockSettingsResponse();
        });

        render(<News />);

        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent(/unable to load news/i);
    });

    // -- Refresh button (Requirement 5.1) -------------------------------------

    it("clicking the Refresh button calls /api/news?refresh=true", async () => {
        const user = userEvent.setup();
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news" || url === "/api/news?refresh=true") {
                return mockNewsResponse();
            }
            return mockSettingsResponse();
        });
        global.fetch = fetchMock;

        render(<News />);
        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        const refreshBtn = screen.getByRole("button", { name: /refresh news/i });
        await user.click(refreshBtn);

        await waitFor(() => {
            const refreshCalls = fetchMock.mock.calls.filter(
                ([url]: [string]) => url === "/api/news?refresh=true"
            );
            expect(refreshCalls.length).toBeGreaterThan(0);
        });
    });

    it("refresh button is disabled while a refresh is in progress", async () => {
        const user = userEvent.setup();

        let resolveRefresh: (() => void) | null = null;
        const refreshPromise = new Promise<Response>((resolve) => {
            resolveRefresh = () =>
                resolve({
                    ok: true,
                    json: async () => ({ articles: [sampleArticle] }),
                } as Response);
        });

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news?refresh=true") return refreshPromise;
            if (url === "/api/news") return mockNewsResponse();
            return mockSettingsResponse();
        });

        render(<News />);
        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        const refreshBtn = screen.getByRole("button", { name: /refresh news/i });
        await user.click(refreshBtn);

        await waitFor(() => {
            expect(screen.getByRole("button", { name: /refresh news/i })).toBeDisabled();
        });

        act(() => {
            resolveRefresh?.();
        });
    });

    // -- Watchlist add (Requirement 5.8) --------------------------------------

    it("clicking Add after typing a ticker calls GET /api/settings then PUT /api/settings with the new ticker", async () => {
        const user = userEvent.setup();
        const initialSettings = { ...defaultSettings, watchlist: ["AAPL"] };
        const updatedSettings = { ...initialSettings, watchlist: ["AAPL", "NVDA"] };

        const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (url === "/api/news") return mockNewsResponse();
            if (url === "/api/settings" && !options) return mockSettingsResponse(initialSettings);
            if (url === "/api/settings" && options?.method === "PUT") return mockSettingsPutResponse(updatedSettings);
            return mockSettingsResponse(initialSettings);
        });
        global.fetch = fetchMock;

        render(<News />);
        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());
        await waitFor(() => expect(screen.getByRole("button", { name: /remove AAPL from watchlist/i })).toBeInTheDocument());

        const tickerInput = screen.getByRole("textbox", { name: /ticker symbol to add to watchlist/i });
        await user.clear(tickerInput);
        await user.type(tickerInput, "nvda");

        const addBtn = screen.getByRole("button", { name: /^add$/i });
        await user.click(addBtn);

        await waitFor(() => {
            const getCalls = fetchMock.mock.calls.filter(
                ([url, opts]: [string, RequestInit | undefined]) => url === "/api/settings" && !opts
            );
            expect(getCalls.length).toBeGreaterThan(0);

            const putCalls = fetchMock.mock.calls.filter(
                ([url, opts]: [string, RequestInit | undefined]) =>
                    url === "/api/settings" && opts?.method === "PUT"
            );
            expect(putCalls.length).toBeGreaterThan(0);

            const body = JSON.parse(putCalls[0][1].body as string);
            expect(body.watchlist).toContain("NVDA");
        });
    });

    it("shows the newly added ticker in the watchlist after adding", async () => {
        const user = userEvent.setup();
        const initialSettings = { ...defaultSettings, watchlist: [] };
        const updatedSettings = { ...initialSettings, watchlist: ["TSLA"] };

        global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (url === "/api/news") return mockNewsResponse();
            if (url === "/api/settings" && !options) return mockSettingsResponse(initialSettings);
            if (url === "/api/settings" && options?.method === "PUT") return mockSettingsPutResponse(updatedSettings);
            return mockSettingsResponse(initialSettings);
        });

        render(<News />);
        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        const tickerInput = screen.getByRole("textbox", { name: /ticker symbol to add to watchlist/i });
        await user.type(tickerInput, "tsla");
        await user.click(screen.getByRole("button", { name: /^add$/i }));

        await waitFor(() => expect(screen.getByText("TSLA")).toBeInTheDocument());
    });

    it("shows validation error for an invalid ticker (with special chars)", async () => {
        const user = userEvent.setup();

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news") return mockNewsResponse();
            return mockSettingsResponse({ ...defaultSettings, watchlist: [] });
        });

        render(<News />);
        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        const tickerInput = screen.getByRole("textbox", { name: /ticker symbol to add to watchlist/i });
        await user.type(tickerInput, "AA BB");
        await user.click(screen.getByRole("button", { name: /^add$/i }));

        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveTextContent(/ticker must be/i);
        });
    });

    // -- Watchlist remove (Requirement 5.8) -----------------------------------

    it("clicking x on a watchlist item calls PUT /api/settings with the item removed", async () => {
        const user = userEvent.setup();
        const initialSettings = { ...defaultSettings, watchlist: ["AAPL", "MSFT"] };
        const afterRemove = { ...defaultSettings, watchlist: ["MSFT"] };

        const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (url === "/api/news") return mockNewsResponse();
            if (url === "/api/settings" && !options) return mockSettingsResponse(initialSettings);
            if (url === "/api/settings" && options?.method === "PUT") return mockSettingsPutResponse(afterRemove);
            return mockSettingsResponse(initialSettings);
        });
        global.fetch = fetchMock;

        render(<News />);
        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());
        await waitFor(() => expect(screen.getByRole("button", { name: /remove AAPL from watchlist/i })).toBeInTheDocument());

        const removeAAPL = screen.getByRole("button", { name: /remove AAPL from watchlist/i });
        await user.click(removeAAPL);

        await waitFor(() => {
            const putCalls = fetchMock.mock.calls.filter(
                ([url, opts]: [string, RequestInit | undefined]) =>
                    url === "/api/settings" && opts?.method === "PUT"
            );
            expect(putCalls.length).toBeGreaterThan(0);

            const body = JSON.parse(putCalls[0][1].body as string);
            expect(body.watchlist).not.toContain("AAPL");
            expect(body.watchlist).toContain("MSFT");
        });
    });

    it("removes the ticker from the UI immediately after clicking x", async () => {
        const user = userEvent.setup();
        const initialSettings = { ...defaultSettings, watchlist: ["AAPL", "MSFT"] };

        global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (url === "/api/news") return mockNewsResponse();
            if (url === "/api/settings" && !options) return mockSettingsResponse(initialSettings);
            if (url === "/api/settings" && options?.method === "PUT")
                return mockSettingsPutResponse({ ...initialSettings, watchlist: ["MSFT"] });
            return mockSettingsResponse(initialSettings);
        });

        render(<News />);
        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());
        await waitFor(() => expect(screen.getByRole("button", { name: /remove AAPL from watchlist/i })).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: /remove AAPL from watchlist/i }));

        await waitFor(() => expect(screen.queryByRole("button", { name: /remove AAPL from watchlist/i })).not.toBeInTheDocument());
        expect(screen.getByRole("button", { name: /remove MSFT from watchlist/i })).toBeInTheDocument();
    });

    // -- Watchlist mutation separation (Requirement 5.8) ----------------------

    it("PUT /api/settings for watchlist changes does NOT include an assets field", async () => {
        const user = userEvent.setup();
        const initialSettings = { ...defaultSettings, watchlist: ["AAPL"] };
        const updatedSettings = { ...initialSettings, watchlist: ["AAPL", "GOOG"] };

        const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (url === "/api/news") return mockNewsResponse();
            if (url === "/api/settings" && !options) return mockSettingsResponse(initialSettings);
            if (url === "/api/settings" && options?.method === "PUT") return mockSettingsPutResponse(updatedSettings);
            return mockSettingsResponse(initialSettings);
        });
        global.fetch = fetchMock;

        render(<News />);
        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());
        await waitFor(() => expect(screen.getByRole("button", { name: /remove AAPL from watchlist/i })).toBeInTheDocument());

        const tickerInput = screen.getByRole("textbox", { name: /ticker symbol to add to watchlist/i });
        await user.type(tickerInput, "GOOG");
        await user.click(screen.getByRole("button", { name: /^add$/i }));

        await waitFor(() => {
            const putCalls = fetchMock.mock.calls.filter(
                ([url, opts]: [string, RequestInit | undefined]) =>
                    url === "/api/settings" && opts?.method === "PUT"
            );
            expect(putCalls.length).toBeGreaterThan(0);

            const body = JSON.parse(putCalls[0][1].body as string);
            expect(body).not.toHaveProperty("assets");
            expect(body.watchlist).toContain("GOOG");
        });
    });

    // -- Article rendering ----------------------------------------------------

    it("renders article headlines from /api/news", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news") return mockNewsResponse({ articles: [sampleArticle] });
            return mockSettingsResponse();
        });

        render(<News />);

        await waitFor(() =>
            expect(screen.getByText("Markets Rally on Strong Earnings")).toBeInTheDocument()
        );
    });

    it("renders empty state message when articles array is empty", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news") return mockNewsResponse({ articles: [] });
            return mockSettingsResponse();
        });

        render(<News />);

        await waitFor(() => expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument());

        expect(screen.getByText(/no relevant articles found/i)).toBeInTheDocument();
    });
});
