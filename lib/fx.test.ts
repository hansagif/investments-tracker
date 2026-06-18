import { describe, it, expect } from "vitest";
import { toRON, portfolioTotalRON, type ExchangeRates } from "./fx";
import type { Asset } from "@prisma/client";

const rates: ExchangeRates = {
    RON_USD: 4.6,
    RON_EUR: 5.0,
    fetchedAt: new Date("2024-01-15"),
};

// Helper to build a minimal Asset object for testing
function makeAsset(
    overrides: Partial<Asset> & { currentValue: number; currency: string }
): Asset {
    return {
        id: "test-id",
        ticker: "TEST",
        name: "Test Asset",
        type: "Stock",
        sector: "Technology",
        costBasis: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as Asset;
}

describe("toRON", () => {
    describe("RON pass-through — no penalty for same-currency amounts", () => {
        it("returns the amount unchanged for RON", () => {
            expect(toRON(100, "RON", rates)).toBe(100);
        });

        it("returns zero unchanged for RON", () => {
            expect(toRON(0, "RON", rates)).toBe(0);
        });

        it("returns negative amounts unchanged for RON", () => {
            expect(toRON(-500, "RON", rates)).toBe(-500);
        });
    });

    describe("USD cross-currency — applies 0.5% penalty", () => {
        it("converts USD using RON_USD rate with penalty", () => {
            // 100 USD × 4.6 × (1 - 0.005) = 100 × 4.6 × 0.995 = 457.7
            const result = toRON(100, "USD", rates);
            expect(result).toBeCloseTo(100 * 4.6 * 0.995, 10);
        });

        it("result is less than raw conversion without penalty", () => {
            const withPenalty = toRON(100, "USD", rates);
            const withoutPenalty = 100 * rates.RON_USD;
            expect(withPenalty).toBeLessThan(withoutPenalty);
        });
    });

    describe("EUR cross-currency — applies 0.5% penalty", () => {
        it("converts EUR using RON_EUR rate with penalty", () => {
            // 200 EUR × 5.0 × (1 - 0.005) = 200 × 5.0 × 0.995 = 995
            const result = toRON(200, "EUR", rates);
            expect(result).toBeCloseTo(200 * 5.0 * 0.995, 10);
        });

        it("result is less than raw conversion without penalty", () => {
            const withPenalty = toRON(200, "EUR", rates);
            const withoutPenalty = 200 * rates.RON_EUR;
            expect(withPenalty).toBeLessThan(withoutPenalty);
        });
    });
});

describe("portfolioTotalRON", () => {
    it("returns 0 for an empty portfolio", () => {
        expect(portfolioTotalRON([], rates)).toBe(0);
    });

    it("sums a single RON asset without penalty", () => {
        const assets = [makeAsset({ currentValue: 1000, currency: "RON" })];
        expect(portfolioTotalRON(assets, rates)).toBe(1000);
    });

    it("converts and sums multiple assets across currencies", () => {
        const assets = [
            makeAsset({ id: "1", ticker: "A", currentValue: 100, currency: "USD" }),
            makeAsset({ id: "2", ticker: "B", currentValue: 200, currency: "EUR" }),
            makeAsset({ id: "3", ticker: "C", currentValue: 500, currency: "RON" }),
        ];

        const expected =
            toRON(100, "USD", rates) +
            toRON(200, "EUR", rates) +
            toRON(500, "RON", rates);

        expect(portfolioTotalRON(assets, rates)).toBeCloseTo(expected, 10);
    });

    it("penalty reduces total compared to a raw sum", () => {
        const assets = [
            makeAsset({ id: "1", ticker: "A", currentValue: 100, currency: "USD" }),
            makeAsset({ id: "2", ticker: "B", currentValue: 100, currency: "EUR" }),
        ];

        const rawTotal = 100 * rates.RON_USD + 100 * rates.RON_EUR;
        const penaltyTotal = portfolioTotalRON(assets, rates);

        expect(penaltyTotal).toBeLessThan(rawTotal);
    });
});
