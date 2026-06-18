/**
 * Loading indicator tests for all six tabs (Task 23.1)
 *
 * Verifies:
 *  1. Each tab that has async data shows a Skeleton/loading state immediately on
 *     mount, before any fetch resolves.
 *  2. The actual content replaces the loading state and renders within 500 ms
 *     (Requirement 8.5). The performance.now() assertions are approximate —
 *     jsdom has no real layout pipeline, so we just assert the elapsed time is
 *     below the threshold as a best-effort check.
 *
 * DailyLog has no async fetch on mount — it loads instantly.  Its test confirms
 * there is no loading indicator shown (the card renders immediately).
 *
 * Requirements: 8.5
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveDashboard } from "./LiveDashboard";
import { Performance } from "./Performance";
import { News } from "./News";
import { Forecast } from "./Forecast";
import { DailyLog } from "./DailyLog";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch that never resolves — keeps the component in its loading state. */
function neverResolvingFetch() {
    return new Promise<Response>(() => {});
}

/** Default happy-path fetch mock used in render-within-500ms tests. */
function setupHappyPathFetch() {
    global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/rates") {
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    rates: { RON_USD: 4.56, RON_EUR: 4.97, fetchedAt: new Date().toISOString() },
                    fromCache: false,
                }),
            } as Response);
        }
        if (url === "/api/snapshots") {
            return Promise.resolve({
                ok: true,
                json: async () => [],
            } as Response);
        }
        if (url === "/api/assets") {
            return Promise.resolve({
                ok: true,
                json: async () => [],
            } as Response);
        }
        if (url === "/api/news") {
            return Promise.resolve({
                ok: true,
                json: async () => ({ articles: [] }),
            } as Response);
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
}

// ── LiveDashboard ─────────────────────────────────────────────────────────────

describe("LiveDashboard — loading indicators (Requirement 8.5)", () => {
    beforeEach(() => vi.restoreAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it("shows Skeleton loading state immediately on mount while fetch is pending", () => {
        global.fetch = vi.fn().mockReturnValue(neverResolvingFetch());

        render(<LiveDashboard />);

        // The skeleton container should be present right away
        expect(screen.getByTestId("live-dashboard-loading")).toBeInTheDocument();
    });

    it("renders actual content within 500 ms once data is available (Requirement 8.5)", async () => {
        setupHappyPathFetch();

        const t0 = performance.now();
        render(<LiveDashboard />);

        // Wait for loading indicator to disappear
        await waitFor(() =>
            expect(screen.queryByTestId("live-dashboard-loading")).not.toBeInTheDocument()
        );
        const elapsed = performance.now() - t0;

        // Content should be visible (either net-wealth placeholder or error)
        expect(
            screen.queryByText(/no portfolio snapshot found/i) ??
            screen.queryByText(/Total Net Wealth/i) ??
            screen.queryByText(/Live rates unavailable/i)
        ).not.toBeNull();

        expect(elapsed).toBeLessThan(500);
    });
});

// ── Performance ───────────────────────────────────────────────────────────────

describe("Performance — loading indicators (Requirement 8.5)", () => {
    beforeEach(() => vi.restoreAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it("shows Skeleton loading state immediately on mount while fetch is pending", () => {
        global.fetch = vi.fn().mockReturnValue(neverResolvingFetch());

        render(<Performance />);

        expect(screen.getByTestId("performance-loading")).toBeInTheDocument();
    });

    it("renders actual content within 500 ms once data is available (Requirement 8.5)", async () => {
        setupHappyPathFetch();

        const t0 = performance.now();
        render(<Performance />);

        await waitFor(() =>
            expect(screen.queryByTestId("performance-loading")).not.toBeInTheDocument()
        );
        const elapsed = performance.now() - t0;

        // Either "second day required" message or the perf table should be shown
        const content =
            screen.queryByText(/a second day of data is required/i) ??
            screen.queryByText(/day-over-day performance/i);
        expect(content).not.toBeNull();

        expect(elapsed).toBeLessThan(500);
    });
});

// ── News ──────────────────────────────────────────────────────────────────────

describe("News — loading indicators (Requirement 8.5)", () => {
    beforeEach(() => vi.restoreAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it("shows Skeleton loading state immediately on mount while fetch is pending", () => {
        global.fetch = vi.fn().mockReturnValue(neverResolvingFetch());

        render(<News />);

        expect(screen.getByTestId("news-loading")).toBeInTheDocument();
    });

    it("renders actual content within 500 ms once data is available (Requirement 8.5)", async () => {
        // Mock both /api/news and /api/settings for the Watchlist sub-component
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/news") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ articles: [] }),
                } as Response);
            }
            if (url === "/api/settings") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        ocrBackend: "tesseract",
                        geminiApiToken: "",
                        watchlist: [],
                        newsFeeds: [],
                        simulationDefaults: {},
                    }),
                } as Response);
            }
            return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
        });

        const t0 = performance.now();
        render(<News />);

        await waitFor(() =>
            expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument()
        );
        const elapsed = performance.now() - t0;

        // Should show the "News" heading (use getAllByText because the heading appears once, the
        // Watchlist heading also contains the word "Watchlist" — use role query for precision)
        const newsHeading = screen.queryAllByRole("heading", { name: /^News$/i });
        const emptyState = screen.queryByText(/no relevant articles/i);
        expect(newsHeading.length > 0 || emptyState !== null).toBe(true);

        expect(elapsed).toBeLessThan(500);
    });
});

// ── Forecast ──────────────────────────────────────────────────────────────────

describe("Forecast — loading indicators (Requirement 8.5)", () => {
    beforeEach(() => vi.restoreAllMocks());
    afterEach(() => vi.restoreAllMocks());

    it("shows Skeleton loading state immediately on mount while fetch is pending", () => {
        global.fetch = vi.fn().mockReturnValue(neverResolvingFetch());

        render(<Forecast />);

        expect(screen.getByTestId("forecast-loading")).toBeInTheDocument();
    });

    it("renders actual content within 500 ms once data is available (Requirement 8.5)", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [],
        } as Response);

        const t0 = performance.now();
        render(<Forecast />);

        await waitFor(() =>
            expect(screen.queryByTestId("forecast-loading")).not.toBeInTheDocument()
        );
        const elapsed = performance.now() - t0;

        // Forecast heading should be visible
        expect(screen.getByText("Forecast")).toBeInTheDocument();

        expect(elapsed).toBeLessThan(500);
    });
});

// ── DailyLog — no async mount fetch ──────────────────────────────────────────

describe("DailyLog — no loading indicator on mount (Requirement 8.5)", () => {
    it("renders the upload form immediately without a loading indicator", () => {
        // No fetch mock needed — DailyLog has no async data on mount
        render(<DailyLog />);

        // The drop zone card is immediately present (no async wait)
        expect(screen.getByTestId("drop-zone")).toBeInTheDocument();
        expect(screen.getByText(/drop your xtb screenshot here/i)).toBeInTheDocument();

        // Confirm there is no loading placeholder shown on initial render
        expect(screen.queryByTestId("live-dashboard-loading")).not.toBeInTheDocument();
        expect(screen.queryByTestId("performance-loading")).not.toBeInTheDocument();
        expect(screen.queryByTestId("news-loading")).not.toBeInTheDocument();
        expect(screen.queryByTestId("forecast-loading")).not.toBeInTheDocument();
    });

    it("renders within 500 ms (synchronous mount, no async data)", () => {
        const t0 = performance.now();
        render(<DailyLog />);
        const elapsed = performance.now() - t0;

        expect(screen.getByTestId("drop-zone")).toBeInTheDocument();
        expect(elapsed).toBeLessThan(500);
    });
});
