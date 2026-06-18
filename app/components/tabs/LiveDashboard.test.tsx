/**
 * Unit tests for LiveDashboard — data loading and error states (Requirement 1.3)
 * and FX ticker component (Requirement 1.5)
 *
 * Covers:
 *  - Normal render: rates available + snapshot present → shows net wealth in RON
 *  - Cache warning: fromCache=true, cacheAgeMinutes=75 → shows elapsed time
 *  - Error suppression: rates API fails → net wealth card hidden, error shown
 *  - Loading state: fetch pending → shows loading indicator
 *  - No snapshot: rates OK but no snapshots → shows placeholder, no net wealth card
 *  - FX ticker renders RON/USD rate with correct label
 *  - FX ticker renders RON/EUR rate with correct label
 *  - Rates are displayed with 4 decimal places
 *  - Both rate boxes are visually separate (each in its own element)
 *  - FX ticker is hidden when rates are unavailable
 *  - Stale-cache warning is shown when rates come from cache
 *  - Error banner is shown when no valid rates exist
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveDashboard } from "./LiveDashboard";

// Helper: mock a successful /api/rates response
function mockRatesResponse(
    rates = { RON_USD: 4.5678, RON_EUR: 4.9765, fetchedAt: "2024-01-15T12:00:00Z" },
    fromCache = false,
    cacheAgeMinutes?: number
) {
    return Promise.resolve({
        ok: true,
        json: async () => ({ rates, fromCache, cacheAgeMinutes }),
    } as Response);
}

// Helper: mock a failed /api/rates response (no cache)
function mockRatesErrorResponse() {
    return Promise.resolve({
        ok: false,
        json: async () => ({ error: "BNR fetch failed and no valid cache exists" }),
    } as Response);
}

// Helper: mock an empty /api/snapshots response
function mockEmptySnapshotsResponse() {
    return Promise.resolve({
        ok: true,
        json: async () => [],
    } as Response);
}

describe("LiveDashboard FX ticker", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders the RON/USD rate with the correct label", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse();
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.getByText("RON / USD")).toBeInTheDocument();
    });

    it("renders the RON/EUR rate with the correct label", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse();
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.getByText("RON / EUR")).toBeInTheDocument();
    });

    it("displays the RON/USD rate with 4 decimal places", async () => {
        const rates = { RON_USD: 4.5678, RON_EUR: 4.9765, fetchedAt: "2024-01-15T12:00:00Z" };
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(rates);
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        // 4.5678 formatted to 4 decimal places
        expect(screen.getByText("4.5678")).toBeInTheDocument();
    });

    it("displays the RON/EUR rate with 4 decimal places", async () => {
        const rates = { RON_USD: 4.5678, RON_EUR: 4.9765, fetchedAt: "2024-01-15T12:00:00Z" };
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(rates);
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        // 4.9765 formatted to 4 decimal places
        expect(screen.getByText("4.9765")).toBeInTheDocument();
    });

    it("renders both RON/USD and RON/EUR rates in separate ticker boxes", async () => {
        const rates = { RON_USD: 4.5678, RON_EUR: 4.9765, fetchedAt: "2024-01-15T12:00:00Z" };
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(rates);
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        // Both labels present
        expect(screen.getByText("RON / USD")).toBeInTheDocument();
        expect(screen.getByText("RON / EUR")).toBeInTheDocument();

        // Both values present
        expect(screen.getByText("4.5678")).toBeInTheDocument();
        expect(screen.getByText("4.9765")).toBeInTheDocument();
    });

    it("does not render the FX ticker when rates are unavailable", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesErrorResponse();
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.queryByText("RON / USD")).not.toBeInTheDocument();
        expect(screen.queryByText("RON / EUR")).not.toBeInTheDocument();
    });

    it("shows an error banner when no valid rates exist", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesErrorResponse();
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(
            screen.getByText(/live rates unavailable and no valid cache exists/i)
        ).toBeInTheDocument();
    });

    it("shows a stale-cache warning with elapsed time when rates come from cache", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates")
                return mockRatesResponse(
                    { RON_USD: 4.5000, RON_EUR: 4.9000, fetchedAt: "2024-01-15T10:00:00Z" },
                    true,
                    75 // 75 minutes → "1h 15m ago"
                );
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.getByRole("status")).toHaveTextContent(/rates from cache/i);
        expect(screen.getByRole("status")).toHaveTextContent("1h 15m ago");
    });

    it("shows a loading indicator while data is being fetched", () => {
        // fetch never resolves in this test
        global.fetch = vi.fn().mockImplementation(() => new Promise(() => { }));

        render(<LiveDashboard />);

        expect(screen.getByTestId("live-dashboard-loading")).toBeInTheDocument();
    });

    it("formats a rate with trailing zeros to exactly 4 decimal places", async () => {
        // 4.5 should display as "4.5000"
        const rates = { RON_USD: 4.5, RON_EUR: 5.0, fetchedAt: "2024-01-15T12:00:00Z" };
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(rates);
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.getByText("4.5000")).toBeInTheDocument();
        expect(screen.getByText("5.0000")).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Unit tests for Deposits vs Portfolio Value comparison (Requirement 1.6)
// ---------------------------------------------------------------------------

function mockSnapshotResponse(snapshot: {
    id?: string;
    date?: string;
    totalTransactionValue: number;
    freeFunds: number;
    netProfitLoss?: number;
    currency?: string;
}) {
    const full = {
        id: snapshot.id ?? "snap-1",
        date: snapshot.date ?? "2024-01-15",
        totalTransactionValue: snapshot.totalTransactionValue,
        freeFunds: snapshot.freeFunds,
        netProfitLoss: snapshot.netProfitLoss ?? 0,
        currency: snapshot.currency ?? "USD",
    };
    return Promise.resolve({
        ok: true,
        json: async () => [full],
    } as Response);
}

const defaultRates = { RON_USD: 4.5678, RON_EUR: 4.9765, fetchedAt: "2024-01-15T12:00:00Z" };

describe("LiveDashboard Deposits vs Portfolio Value (Requirement 1.6)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shows the comparison section when a snapshot exists", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(defaultRates);
            return mockSnapshotResponse({ totalTransactionValue: 1000, freeFunds: 800 });
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.getByText("Deposits vs Portfolio Value")).toBeInTheDocument();
        expect(screen.getByText("Total Deposits")).toBeInTheDocument();
        expect(screen.getByText("Current Portfolio Value")).toBeInTheDocument();
    });

    it("does not show the comparison section when no snapshot exists", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(defaultRates);
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.queryByText("Deposits vs Portfolio Value")).not.toBeInTheDocument();
    });

    it("displays freeFunds as Total Deposits with the snapshot currency", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(defaultRates);
            return mockSnapshotResponse({ totalTransactionValue: 1000, freeFunds: 250, currency: "EUR" });
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        const depositsCard = screen.getByText("Total Deposits").closest("div");
        expect(depositsCard).not.toBeNull();
        expect(depositsCard!.textContent).toMatch(/250/);
        expect(depositsCard!.textContent).toMatch(/EUR/);
    });

    it("displays totalTransactionValue as Current Portfolio Value", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(defaultRates);
            return mockSnapshotResponse({ totalTransactionValue: 1500, freeFunds: 500, currency: "USD" });
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        const portfolioCard = screen.getByText("Current Portfolio Value").closest("div");
        expect(portfolioCard).not.toBeNull();
        expect(portfolioCard!.textContent).toMatch(/1\.500/);
        expect(portfolioCard!.textContent).toMatch(/USD/);
    });

    it("shows gain label when portfolio value exceeds deposits", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(defaultRates);
            return mockSnapshotResponse({ totalTransactionValue: 1200, freeFunds: 800 });
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.getByText("gain vs deposits")).toBeInTheDocument();
    });

    it("shows loss label when portfolio value is below deposits", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(defaultRates);
            return mockSnapshotResponse({ totalTransactionValue: 600, freeFunds: 800 });
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.getByText("loss vs deposits")).toBeInTheDocument();
    });

    it("shows no change label when portfolio value equals deposits", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(defaultRates);
            return mockSnapshotResponse({ totalTransactionValue: 800, freeFunds: 800 });
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.getByText("no change vs deposits")).toBeInTheDocument();
    });

    it("displays the percentage change in the summary row", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(defaultRates);
            // difference = 200, percentage = 200/800 * 100 = 25%
            return mockSnapshotResponse({ totalTransactionValue: 1000, freeFunds: 800 });
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        expect(screen.getByText(/(25\.00%)/)).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Unit tests for data loading and error states (Requirement 1.3)
// ---------------------------------------------------------------------------

describe("LiveDashboard data loading and error states (Requirement 1.3)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shows net wealth in RON when rates and snapshot are available", async () => {
        // RON_USD = 4.5, snapshot totalTransactionValue = 1000 USD
        // toRON(1000, "USD", { RON_USD: 4.5 }) with 0.5% penalty = 1000 * 4.5 * (1 - 0.005) = 4477.5
        const rates = { RON_USD: 4.5, RON_EUR: 4.9, fetchedAt: "2024-01-15T12:00:00Z" };
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(rates);
            return mockSnapshotResponse({ totalTransactionValue: 1000, freeFunds: 800, currency: "USD" });
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        // The net wealth card should be present
        expect(screen.getByText("Total Net Wealth")).toBeInTheDocument();
        // The RON label should appear in the card
        const ronLabels = screen.getAllByText("RON");
        expect(ronLabels.length).toBeGreaterThan(0);
    });

    it("shows cache warning with correct elapsed time when rates are stale (fromCache=true, cacheAgeMinutes=75)", async () => {
        const rates = { RON_USD: 4.5, RON_EUR: 4.9, fetchedAt: "2024-01-15T10:00:00Z" };
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates")
                return mockRatesResponse(rates, true, 75); // 75 minutes → "1h 15m ago"
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        const statusEl = screen.getByRole("status");
        expect(statusEl).toHaveTextContent(/rates from cache/i);
        expect(statusEl).toHaveTextContent("1h 15m ago");
    });

    it("hides the net wealth card and shows error when rates API fails", async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesErrorResponse();
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        // Net wealth card must NOT be shown
        expect(screen.queryByText("Total Net Wealth")).not.toBeInTheDocument();
        // Error message must be shown
        expect(
            screen.getByRole("alert")
        ).toHaveTextContent(/live rates unavailable and no valid cache exists/i);
    });

    it("shows a loading indicator while fetch is pending", () => {
        // fetch never resolves
        global.fetch = vi.fn().mockImplementation(() => new Promise(() => { }));

        render(<LiveDashboard />);

        expect(screen.getByTestId("live-dashboard-loading")).toBeInTheDocument();
    });

    it("shows placeholder and no net wealth card when rates are OK but no snapshots exist", async () => {
        const rates = { RON_USD: 4.5, RON_EUR: 4.9, fetchedAt: "2024-01-15T12:00:00Z" };
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === "/api/rates") return mockRatesResponse(rates);
            return mockEmptySnapshotsResponse();
        });

        render(<LiveDashboard />);
        await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());

        // Net wealth card must NOT appear
        expect(screen.queryByText("Total Net Wealth")).not.toBeInTheDocument();
        // Placeholder message must appear
        expect(
            screen.getByText(/no portfolio snapshot found/i)
        ).toBeInTheDocument();
    });
});
