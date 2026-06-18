/**
 * Component tests for the Allocation tab (Requirements 4.5, 4.6, 4.8)
 *
 * Covers:
 *  1. Asset at $7.99 → no warning indicator, no locked indicator
 *  2. Asset at $8.00 (exactly) → warning indicator present, no locked indicator
 *  3. Asset at $9.00 → warning indicator present, no locked indicator
 *  4. Asset at $10.00 (exactly) → BOTH warning AND locked indicators present
 *  5. Asset at $11.00 → BOTH warning AND locked indicators present
 *  6. Duplicate ticker → 409 response → error "A position with ticker [X] already exists"
 *  7. Empty portfolio → "No assets in portfolio" message, charts hidden, form available
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Allocation } from "./Allocation";
import type { Asset } from "@prisma/client";

// ─── ResizeObserver stub ──────────────────────────────────────────────────────
// Recharts' ResponsiveContainer relies on ResizeObserver which jsdom does not
// implement. Assign a no-op class to window before any tests run.

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}

beforeAll(() => {
    Object.defineProperty(window, "ResizeObserver", {
        writable: true,
        configurable: true,
        value: ResizeObserverStub,
    });
});

afterAll(() => {
    // Clean up so we don't leak into other test files
    // @ts-expect-error intentional delete
    delete window.ResizeObserver;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> & { ticker: string; currentValue: number }): Asset {
    return {
        id: 1,
        ticker: overrides.ticker,
        name: overrides.name ?? null,
        type: overrides.type ?? "Stock",
        sector: overrides.sector ?? "Technology",
        currentValue: overrides.currentValue,
        costBasis: overrides.costBasis ?? 5.0,
        currency: overrides.currency ?? "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as Asset;
}

function mockGetAssets(assets: Asset[]): Promise<Response> {
    return Promise.resolve({
        ok: true,
        json: async () => assets,
    } as Response);
}

function mockPost409(ticker: string): Promise<Response> {
    return Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ error: `A position with ticker ${ticker} already exists` }),
    } as Response);
}

// ─── Warning / locked indicators (Requirements 4.5, 4.6) ─────────────────────

describe("Allocation tab — warning / locked indicators (Requirements 4.5, 4.6)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ── Test 1: $7.99 — no indicators ────────────────────────────────────────

    it("shows no warning and no locked indicator for asset at $7.99 (below warning threshold)", async () => {
        const asset = makeAsset({ ticker: "AAPL", currentValue: 7.99 });
        global.fetch = vi.fn().mockResolvedValue(mockGetAssets([asset]));

        render(<Allocation />);

        await waitFor(() =>
            expect(screen.queryByText(/loading portfolio/i)).not.toBeInTheDocument()
        );

        // Ticker row is visible
        expect(screen.getByText("AAPL")).toBeInTheDocument();

        // Neither badge should exist for this ticker
        const allStatuses = screen.queryAllByRole("status");
        const aaplWarning = allStatuses.find(
            (el) =>
                el.getAttribute("aria-label")?.includes("AAPL") &&
                el.getAttribute("aria-label")?.includes("warning")
        );
        const aaplLocked = allStatuses.find(
            (el) =>
                el.getAttribute("aria-label")?.includes("AAPL") &&
                el.getAttribute("aria-label")?.includes("locked")
        );

        expect(aaplWarning).toBeUndefined();
        expect(aaplLocked).toBeUndefined();
    });

    // ── Test 2: $8.00 — warning only ─────────────────────────────────────────

    it("shows warning indicator but not locked indicator for asset at exactly $8.00", async () => {
        const asset = makeAsset({ ticker: "MSFT", currentValue: 8.0 });
        global.fetch = vi.fn().mockResolvedValue(mockGetAssets([asset]));

        render(<Allocation />);

        await waitFor(() =>
            expect(screen.queryByText(/loading portfolio/i)).not.toBeInTheDocument()
        );

        const allStatuses = screen.queryAllByRole("status");

        const warning = allStatuses.find(
            (el) =>
                el.getAttribute("aria-label")?.includes("MSFT") &&
                el.getAttribute("aria-label")?.includes("warning")
        );
        const locked = allStatuses.find(
            (el) =>
                el.getAttribute("aria-label")?.includes("MSFT") &&
                el.getAttribute("aria-label")?.includes("locked")
        );

        expect(warning).toBeDefined();
        expect(locked).toBeUndefined();
    });

    // ── Test 3: $9.00 — warning only ─────────────────────────────────────────

    it("shows warning indicator but not locked indicator for asset at $9.00", async () => {
        const asset = makeAsset({ ticker: "GOOGL", currentValue: 9.0 });
        global.fetch = vi.fn().mockResolvedValue(mockGetAssets([asset]));

        render(<Allocation />);

        await waitFor(() =>
            expect(screen.queryByText(/loading portfolio/i)).not.toBeInTheDocument()
        );

        const allStatuses = screen.queryAllByRole("status");

        const warning = allStatuses.find(
            (el) =>
                el.getAttribute("aria-label")?.includes("GOOGL") &&
                el.getAttribute("aria-label")?.includes("warning")
        );
        const locked = allStatuses.find(
            (el) =>
                el.getAttribute("aria-label")?.includes("GOOGL") &&
                el.getAttribute("aria-label")?.includes("locked")
        );

        expect(warning).toBeDefined();
        expect(locked).toBeUndefined();
    });

    // ── Test 4: $10.00 — both warning AND locked ──────────────────────────────

    it("shows both warning AND locked indicators for asset at exactly $10.00", async () => {
        const asset = makeAsset({ ticker: "NVDA", currentValue: 10.0 });
        global.fetch = vi.fn().mockResolvedValue(mockGetAssets([asset]));

        render(<Allocation />);

        await waitFor(() =>
            expect(screen.queryByText(/loading portfolio/i)).not.toBeInTheDocument()
        );

        const allStatuses = screen.queryAllByRole("status");

        const warning = allStatuses.find(
            (el) =>
                el.getAttribute("aria-label")?.includes("NVDA") &&
                el.getAttribute("aria-label")?.includes("warning")
        );
        const locked = allStatuses.find(
            (el) =>
                el.getAttribute("aria-label")?.includes("NVDA") &&
                el.getAttribute("aria-label")?.includes("locked")
        );

        expect(warning).toBeDefined();
        expect(locked).toBeDefined();
    });

    // ── Test 5: $11.00 — both warning AND locked ──────────────────────────────

    it("shows both warning AND locked indicators for asset above limit at $11.00", async () => {
        const asset = makeAsset({ ticker: "TSLA", currentValue: 11.0 });
        global.fetch = vi.fn().mockResolvedValue(mockGetAssets([asset]));

        render(<Allocation />);

        await waitFor(() =>
            expect(screen.queryByText(/loading portfolio/i)).not.toBeInTheDocument()
        );

        const allStatuses = screen.queryAllByRole("status");

        const warning = allStatuses.find(
            (el) =>
                el.getAttribute("aria-label")?.includes("TSLA") &&
                el.getAttribute("aria-label")?.includes("warning")
        );
        const locked = allStatuses.find(
            (el) =>
                el.getAttribute("aria-label")?.includes("TSLA") &&
                el.getAttribute("aria-label")?.includes("locked")
        );

        expect(warning).toBeDefined();
        expect(locked).toBeDefined();
    });
});

// ─── Duplicate ticker error (Requirement 4.8) ─────────────────────────────────

describe("Allocation tab — duplicate ticker error (Requirement 4.8)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shows duplicate ticker error message when POST /api/assets returns 409", async () => {
        const user = userEvent.setup();

        // GET returns one existing asset so the full portfolio view is shown
        const existing = makeAsset({ ticker: "NVDA", currentValue: 5.0 });
        global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
            if (!options || options.method !== "POST") {
                return mockGetAssets([existing]);
            }
            return mockPost409("NVDA");
        });

        render(<Allocation />);

        // Wait for the asset list to load
        await waitFor(() =>
            expect(screen.queryByText(/loading portfolio/i)).not.toBeInTheDocument()
        );

        // Fill in the Add Asset form
        await user.type(screen.getByRole("textbox", { name: /ticker/i }), "NVDA");
        await user.selectOptions(screen.getByRole("combobox", { name: /type/i }), "Stock");
        await user.selectOptions(screen.getByRole("combobox", { name: /sector/i }), "Technology");
        await user.type(screen.getByRole("spinbutton", { name: /current value/i }), "5.00");
        await user.type(screen.getByRole("spinbutton", { name: /cost basis/i }), "4.00");
        await user.selectOptions(screen.getByRole("combobox", { name: /currency/i }), "USD");

        // Submit
        await user.click(screen.getByRole("button", { name: /add asset/i }));

        // The submit-level error must appear
        await waitFor(() => {
            const alert = screen.getByRole("alert");
            expect(alert).toHaveTextContent("A position with ticker NVDA already exists");
        });
    });
});

// ─── Empty portfolio state ────────────────────────────────────────────────────

describe("Allocation tab — empty portfolio state", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shows 'No assets in portfolio' message when the portfolio is empty", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockGetAssets([]));

        render(<Allocation />);

        await waitFor(() =>
            expect(screen.queryByText(/loading portfolio/i)).not.toBeInTheDocument()
        );

        expect(screen.getByText(/no assets in portfolio/i)).toBeInTheDocument();
    });

    it("does not render donut charts when the portfolio is empty", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockGetAssets([]));

        render(<Allocation />);

        await waitFor(() =>
            expect(screen.queryByText(/loading portfolio/i)).not.toBeInTheDocument()
        );

        // Chart headings must be absent
        expect(screen.queryByText(/stocks vs etfs/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/sector exposure/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/position sizing/i)).not.toBeInTheDocument();
    });

    it("still renders the Add Asset form when the portfolio is empty", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockGetAssets([]));

        render(<Allocation />);

        await waitFor(() =>
            expect(screen.queryByText(/loading portfolio/i)).not.toBeInTheDocument()
        );

        expect(screen.getByRole("button", { name: /add asset/i })).toBeInTheDocument();
    });
});
