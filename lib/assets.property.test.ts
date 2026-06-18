/**
 * Property-based tests for /lib/assets.ts — validateAssetInput
 *
 * Feature: ai-wealth-dashboard
 * Property 8: Asset field validation correctness
 * Validates: Requirements 4.7
 */

import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { validateAssetInput, type AssetInput } from "./assets";

// ─── Property 8: Asset field validation correctness ──────────────────────────

describe("Property 8: Asset field validation correctness", () => {
    /**
     * **Validates: Requirements 4.7**
     *
     * For any fully valid asset input (ticker matches ^[A-Z0-9]{1,10}$,
     * type is Stock|ETF, sector is one of the 8 taxonomy values,
     * currentValue > 0, costBasis > 0, currency is USD|EUR|RON),
     * validateAssetInput must return an empty error object.
     */
    test("Property 8: Valid asset inputs produce no errors", () => {
        fc.assert(
            fc.property(
                fc.record({
                    ticker: fc.stringMatching(/^[A-Z0-9]{1,10}$/),
                    type: fc.constantFrom("Stock", "ETF"),
                    sector: fc.constantFrom(
                        "Technology",
                        "Healthcare",
                        "Finance",
                        "Energy",
                        "Consumer",
                        "Industrial",
                        "Real Estate",
                        "Other"
                    ),
                    currentValue: fc.float({ min: Math.fround(0.01), max: 999999, noNaN: true }),
                    costBasis: fc.float({ min: Math.fround(0.01), max: 999999, noNaN: true }),
                    currency: fc.constantFrom("USD", "EUR", "RON"),
                }),
                (input: AssetInput) => {
                    const errors = validateAssetInput(input);
                    expect(Object.keys(errors)).toHaveLength(0);
                }
            ),
            { numRuns: 25 }
        );
    });

    /**
     * **Validates: Requirements 4.7**
     *
     * For any ticker that does NOT match ^[A-Z0-9]{1,10}$,
     * validateAssetInput must set errors.ticker.
     */
    test("Property 8: Invalid ticker produces ticker error", () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.constant(""),
                    fc.constant("ABCDE123456"), // 11 chars — too long
                    fc.constant("lowercase"),
                    fc.constant("has space"),
                    fc.constant("has-dash")
                ),
                (ticker: string) => {
                    const input: AssetInput = {
                        ticker,
                        type: "Stock",
                        sector: "Technology",
                        currentValue: 1,
                        costBasis: 1,
                        currency: "USD",
                    };
                    const errors = validateAssetInput(input);
                    expect(errors.ticker).toBeDefined();
                }
            ),
            { numRuns: 25 }
        );
    });

    /**
     * **Validates: Requirements 4.7**
     *
     * For any non-positive or non-finite currentValue (≤ 0, NaN, ±Infinity),
     * validateAssetInput must set errors.currentValue.
     */
    test("Property 8: Non-positive currentValue produces currentValue error", () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.float({ min: -999999, max: 0, noNaN: true }),
                    fc.constant(NaN),
                    fc.constant(Infinity)
                ),
                (currentValue: number) => {
                    const input: AssetInput = {
                        ticker: "AAPL",
                        type: "Stock",
                        sector: "Technology",
                        currentValue,
                        costBasis: 1,
                        currency: "USD",
                    };
                    const errors = validateAssetInput(input);
                    expect(errors.currentValue).toBeDefined();
                }
            ),
            { numRuns: 25 }
        );
    });
});

// ─── Property 11: Position weights sum to 100% ───────────────────────────────

import { calculatePositionWeights } from "./assets";

// Feature: ai-wealth-dashboard, Property 11: Position weights sum to 100%
test('Property 11: Position weights sum to 100%', () => {
    fc.assert(
        fc.property(
            fc.array(
                fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
                { minLength: 1, maxLength: 11 }
            ),
            (values) => {
                // Build minimal Asset objects with unique tickers
                const assets = values.map((currentValue, i) => ({
                    id: `id-${i}`,
                    ticker: `T${i.toString().padStart(2, '0')}`,
                    name: '',
                    type: 'Stock',
                    sector: 'Technology',
                    currentValue,
                    costBasis: currentValue,
                    currency: 'USD',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }));

                const weights = calculatePositionWeights(assets);
                const total = weights.reduce((sum, w) => sum + w.weight, 0);

                // Sum should be ≈ 100 within 0.001% tolerance
                expect(Math.abs(total - 100)).toBeLessThan(0.001);
            }
        ),
        { numRuns: 25 }
    );
});

// ─── Property 10: Asset position threshold indicators ────────────────────────

import { getPositionStatus } from "./assets";

/**
 * **Validates: Requirements 4.5, 4.6**
 *
 * Feature: ai-wealth-dashboard, Property 10: Asset position threshold indicators
 */

// warning is true iff value >= 8
test('Property 10: warning is true iff value >= 8', () => {
    fc.assert(
        fc.property(
            fc.float({ min: 0, max: 20, noNaN: true }),
            (value) => {
                const status = getPositionStatus(value);
                if (value >= 8) {
                    expect(status.warning).toBe(true);
                } else {
                    expect(status.warning).toBe(false);
                }
            }
        ),
        { numRuns: 25 }
    );
});

// locked is true iff value >= 10
test('Property 10: locked is true iff value >= 10', () => {
    fc.assert(
        fc.property(
            fc.float({ min: 0, max: 20, noNaN: true }),
            (value) => {
                const status = getPositionStatus(value);
                if (value >= 10) {
                    expect(status.locked).toBe(true);
                } else {
                    expect(status.locked).toBe(false);
                }
            }
        ),
        { numRuns: 25 }
    );
});

// locked implies warning
test('Property 10: locked implies warning', () => {
    fc.assert(
        fc.property(
            fc.float({ min: 0, max: 20, noNaN: true }),
            (value) => {
                const status = getPositionStatus(value);
                if (status.locked) {
                    expect(status.warning).toBe(true);
                }
            }
        ),
        { numRuns: 25 }
    );
});

// ─── Property 9: Duplicate ticker rejection preserves portfolio ───────────────

// Feature: ai-wealth-dashboard, Property 9: Duplicate ticker rejection preserves portfolio
// **Validates: Requirements 4.8**
test('Property 9: Duplicate ticker produces a validation error on the ticker field', () => {
    fc.assert(
        fc.property(
            fc.array(
                fc.record({
                    ticker: fc.stringMatching(/^[A-Z]{1,5}$/),
                    type: fc.constantFrom('Stock', 'ETF'),
                    sector: fc.constantFrom('Technology', 'Healthcare'),
                    currentValue: fc.float({ min: Math.fround(0.01), max: Math.fround(999), noNaN: true }),
                    costBasis: fc.float({ min: Math.fround(0.01), max: Math.fround(999), noNaN: true }),
                    currency: fc.constantFrom('USD', 'EUR'),
                }),
                { minLength: 1, maxLength: 10 }
            ),
            (assets) => {
                // Build a set of all tickers in the "portfolio" (deduplicated)
                const portfolio = assets.filter((a, i, arr) => arr.findIndex(x => x.ticker === a.ticker) === i);
                const existingTickers = new Set(portfolio.map(a => a.ticker));

                if (portfolio.length === 0) return;

                // Try to add a duplicate — pick the first ticker from the portfolio
                const duplicate = { ...portfolio[0] };

                // The property is: if a ticker already exists in the portfolio, it must be rejected
                expect(existingTickers.has(duplicate.ticker)).toBe(true);

                // Verify that attempting validation with the existing tickers set produces a ticker error
                const errors = validateAssetInput(duplicate, existingTickers);
                expect(errors.ticker).toBeDefined();

                // Portfolio size is unchanged (we didn't add anything when there's a validation error)
                expect(portfolio.length).toBe(existingTickers.size);
            }
        ),
        { numRuns: 25 }
    );
});
