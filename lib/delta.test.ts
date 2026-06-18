/**
 * Tests for Delta_Tracker (/lib/delta.ts)
 *
 * Covers:
 *   - Unit tests for calculateDelta and getDeltaColorClass
 *   - Sub-task: percentageDelta is NaN when prev === 0
 *   - Sub-task: winners/losers sorted by absolute asset value change desc/asc
 */

import { describe, it, expect } from "vitest";
import {
    calculateDelta,
    getDeltaColorClass,
    type ClosingSnapshot,
    type AssetSnapshot,
} from "./delta";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSnapshot(
    total: number,
    free: number,
    pnl: number
): ClosingSnapshot {
    return {
        totalTransactionValue: total,
        freeFunds: free,
        netProfitLoss: pnl,
    };
}

// ─── calculateDelta — core field arithmetic ──────────────────────────────────

describe("calculateDelta — core arithmetic", () => {
    it("computes absolute delta as curr - prev", () => {
        const prev = makeSnapshot(1000, 200, -50);
        const curr = makeSnapshot(1100, 220, 30);

        const result = calculateDelta(prev, curr);

        expect(result.totalTransactionValue.absolute).toBe(100);
        expect(result.freeFunds.absolute).toBe(20);
        expect(result.netProfitLoss.absolute).toBe(80);
    });

    it("computes percentage delta as (curr - prev) / prev * 100", () => {
        const prev = makeSnapshot(1000, 200, 100);
        const curr = makeSnapshot(1100, 250, 120);

        const result = calculateDelta(prev, curr);

        expect(result.totalTransactionValue.percentage).toBeCloseTo(10, 5);
        expect(result.freeFunds.percentage).toBeCloseTo(25, 5);
        expect(result.netProfitLoss.percentage).toBeCloseTo(20, 5);
    });

    it("returns NaN percentage when prev value is 0", () => {
        const prev = makeSnapshot(0, 0, 0);
        const curr = makeSnapshot(500, 100, 50);

        const result = calculateDelta(prev, curr);

        expect(result.totalTransactionValue.percentage).toBeNaN();
        expect(result.freeFunds.percentage).toBeNaN();
        expect(result.netProfitLoss.percentage).toBeNaN();
    });

    it("handles negative deltas correctly", () => {
        const prev = makeSnapshot(1000, 200, 50);
        const curr = makeSnapshot(800, 150, -30);

        const result = calculateDelta(prev, curr);

        expect(result.totalTransactionValue.absolute).toBe(-200);
        expect(result.totalTransactionValue.percentage).toBeCloseTo(-20, 5);
    });

    it("returns zero delta for identical snapshots", () => {
        const snap = makeSnapshot(1234.56, 100, 0);
        const result = calculateDelta(snap, snap);

        expect(result.totalTransactionValue.absolute).toBe(0);
        expect(result.totalTransactionValue.percentage).toBe(0);
        expect(result.freeFunds.absolute).toBe(0);
    });
});

// ─── calculateDelta — attribution ────────────────────────────────────────────

describe("calculateDelta — attribution", () => {
    it("returns null attribution when prev totalTransactionValue is 0", () => {
        const prev = makeSnapshot(0, 0, 0);
        const curr = makeSnapshot(500, 100, 50);

        const result = calculateDelta(prev, curr);

        expect(result.attribution).toBeNull();
    });

    it("returns non-null attribution when prev totalTransactionValue > 0", () => {
        const prev = makeSnapshot(1000, 200, 50);
        const curr = makeSnapshot(1100, 300, 80);

        const result = calculateDelta(prev, curr);

        expect(result.attribution).not.toBeNull();
    });

    it("new deposits are estimated as positive free funds change", () => {
        // freeFunds increases by 100 → new deposits = 100
        const prev = makeSnapshot(1000, 200, 50);
        const curr = makeSnapshot(1200, 300, 60);

        const result = calculateDelta(prev, curr);

        expect(result.attribution!.newDeposits.absolute).toBeCloseTo(100, 5);
    });

    it("new deposits are 0 when free funds decrease", () => {
        const prev = makeSnapshot(1000, 300, 50);
        const curr = makeSnapshot(1100, 200, 60);

        const result = calculateDelta(prev, curr);

        expect(result.attribution!.newDeposits.absolute).toBe(0);
    });

    it("currency movement is 0 (cross-snapshot rates unavailable)", () => {
        const prev = makeSnapshot(1000, 200, 50);
        const curr = makeSnapshot(1100, 250, 60);

        const result = calculateDelta(prev, curr);

        expect(result.attribution!.currencyMovement.absolute).toBe(0);
    });

    it("priceAppreciation + currencyMovement + newDeposits ≈ totalTransactionValue delta", () => {
        const prev = makeSnapshot(1000, 200, 50);
        const curr = makeSnapshot(1150, 250, 70);

        const result = calculateDelta(prev, curr);
        const attr = result.attribution!;

        const reconstructed =
            attr.priceAppreciation.absolute +
            attr.currencyMovement.absolute +
            attr.newDeposits.absolute;

        expect(reconstructed).toBeCloseTo(result.totalTransactionValue.absolute, 5);
    });
});

// ─── calculateDelta — winners and losers ─────────────────────────────────────

describe("calculateDelta — winners and losers", () => {
    const prev: ClosingSnapshot = makeSnapshot(10000, 500, 100);
    const curr: ClosingSnapshot = makeSnapshot(10500, 550, 150);

    const prevAssets: AssetSnapshot[] = [
        { ticker: "AAPL", currentValue: 1000 },
        { ticker: "NVDA", currentValue: 2000 },
        { ticker: "MSFT", currentValue: 1500 },
        { ticker: "GOOG", currentValue: 500 },
        { ticker: "AMZN", currentValue: 800 },
        { ticker: "TSLA", currentValue: 600 },
        { ticker: "META", currentValue: 400 },
    ];

    const currAssets: AssetSnapshot[] = [
        { ticker: "AAPL", currentValue: 1200 },  // +200
        { ticker: "NVDA", currentValue: 2500 },  // +500 (biggest winner)
        { ticker: "MSFT", currentValue: 1400 },  // -100
        { ticker: "GOOG", currentValue: 300 },   // -200 (biggest loser)
        { ticker: "AMZN", currentValue: 900 },   // +100
        { ticker: "TSLA", currentValue: 500 },   // -100
        { ticker: "META", currentValue: 350 },   // -50
    ];

    it("winners contain assets with positive delta, sorted descending", () => {
        const result = calculateDelta(prev, curr, prevAssets, currAssets);

        expect(result.winners.length).toBeGreaterThan(0);
        expect(result.winners.every((w) => w.delta > 0)).toBe(true);

        // Verify descending order
        for (let i = 0; i < result.winners.length - 1; i++) {
            expect(result.winners[i].delta).toBeGreaterThanOrEqual(
                result.winners[i + 1].delta
            );
        }
    });

    it("losers contain assets with negative delta, sorted ascending", () => {
        const result = calculateDelta(prev, curr, prevAssets, currAssets);

        expect(result.losers.length).toBeGreaterThan(0);
        expect(result.losers.every((l) => l.delta < 0)).toBe(true);

        // Verify ascending order (most negative first)
        for (let i = 0; i < result.losers.length - 1; i++) {
            expect(result.losers[i].delta).toBeLessThanOrEqual(
                result.losers[i + 1].delta
            );
        }
    });

    it("top winner is NVDA (+500)", () => {
        const result = calculateDelta(prev, curr, prevAssets, currAssets);
        expect(result.winners[0].ticker).toBe("NVDA");
        expect(result.winners[0].delta).toBe(500);
    });

    it("top loser is GOOG (-200)", () => {
        const result = calculateDelta(prev, curr, prevAssets, currAssets);
        expect(result.losers[0].ticker).toBe("GOOG");
        expect(result.losers[0].delta).toBe(-200);
    });

    it("caps winners and losers at 5 entries", () => {
        // 6 winners and 6 losers
        const p = makeSnapshot(10000, 500, 0);
        const c = makeSnapshot(11000, 600, 0);

        const pa: AssetSnapshot[] = Array.from({ length: 12 }, (_, i) => ({
            ticker: `TICK${i}`,
            currentValue: 100,
        }));

        const ca: AssetSnapshot[] = pa.map((a, i) => ({
            ticker: a.ticker,
            currentValue: i < 6 ? 200 : 50, // 6 winners (+100), 6 losers (-50)
        }));

        const result = calculateDelta(p, c, pa, ca);

        expect(result.winners.length).toBe(5);
        expect(result.losers.length).toBe(5);
    });

    it("returns fewer than 5 when fewer matching assets exist", () => {
        const p = makeSnapshot(1000, 100, 0);
        const c = makeSnapshot(1100, 120, 0);

        const pa: AssetSnapshot[] = [
            { ticker: "A", currentValue: 500 },
            { ticker: "B", currentValue: 500 },
        ];
        const ca: AssetSnapshot[] = [
            { ticker: "A", currentValue: 600 }, // +100
            { ticker: "B", currentValue: 400 }, // -100
        ];

        const result = calculateDelta(p, c, pa, ca);

        expect(result.winners.length).toBe(1);
        expect(result.losers.length).toBe(1);
    });

    it("returns empty winners/losers when no assets supplied", () => {
        const result = calculateDelta(prev, curr);

        expect(result.winners).toEqual([]);
        expect(result.losers).toEqual([]);
    });

    it("assets removed in curr appear in losers", () => {
        const p = makeSnapshot(1000, 100, 0);
        const c = makeSnapshot(800, 100, 0);

        const pa: AssetSnapshot[] = [{ ticker: "GONE", currentValue: 200 }];
        const ca: AssetSnapshot[] = []; // asset disappeared

        const result = calculateDelta(p, c, pa, ca);

        expect(result.losers.length).toBe(1);
        expect(result.losers[0].ticker).toBe("GONE");
        expect(result.losers[0].delta).toBe(-200);
    });
});

// ─── getDeltaColorClass ───────────────────────────────────────────────────────

describe("getDeltaColorClass", () => {
    it("returns 'text-positive' for strictly positive values", () => {
        expect(getDeltaColorClass(1)).toBe("text-positive");
        expect(getDeltaColorClass(0.0001)).toBe("text-positive");
        expect(getDeltaColorClass(999999)).toBe("text-positive");
    });

    it("returns 'text-negative' for strictly negative values", () => {
        expect(getDeltaColorClass(-1)).toBe("text-negative");
        expect(getDeltaColorClass(-0.0001)).toBe("text-negative");
        expect(getDeltaColorClass(-999999)).toBe("text-negative");
    });

    it("returns '' for exactly zero", () => {
        expect(getDeltaColorClass(0)).toBe("");
    });
});
