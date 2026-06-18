// Feature: ai-wealth-dashboard, Property 4: Delta arithmetic correctness
// Feature: ai-wealth-dashboard, Property 5: Delta color sign consistency
import { test, expect } from "vitest";
import * as fc from "fast-check";
import { calculateDelta, getDeltaColorClass, type ClosingSnapshot } from "./delta";

/**
 * Property 4: Delta arithmetic correctness
 * Validates: Requirements 3.1
 *
 * For any two non-zero previous and current totalTransactionValue values,
 * calculateDelta SHALL return:
 *   - absoluteDelta === b − a
 *   - percentageDelta === (b − a) / a × 100
 */
test("Property 4: Delta arithmetic correctness", () => {
    fc.assert(
        fc.property(
            fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
            fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
            (a, b) => {
                const prev: ClosingSnapshot = { totalTransactionValue: a, freeFunds: 100, netProfitLoss: 0 };
                const curr: ClosingSnapshot = { totalTransactionValue: b, freeFunds: 100, netProfitLoss: 0 };
                const result = calculateDelta(prev, curr);

                // absoluteDelta === b - a
                expect(result.totalTransactionValue.absolute).toBeCloseTo(b - a, 5);

                // percentageDelta === (b - a) / a * 100
                expect(result.totalTransactionValue.percentage).toBeCloseTo((b - a) / a * 100, 5);
            }
        ),
        { numRuns: 25 }
    );
});

// When a === 0, percentageDelta should be NaN
test("Property 4: percentageDelta is NaN when prev is 0", () => {
    fc.assert(
        fc.property(
            fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
            (b) => {
                const prev: ClosingSnapshot = { totalTransactionValue: 0, freeFunds: 0, netProfitLoss: 0 };
                const curr: ClosingSnapshot = { totalTransactionValue: b, freeFunds: 0, netProfitLoss: 0 };
                const result = calculateDelta(prev, curr);
                expect(result.totalTransactionValue.percentage).toBeNaN();
            }
        ),
        { numRuns: 25 }
    );
});

/**
 * Property 5: Delta color sign consistency
 * Validates: Requirements 3.3
 *
 * For any strictly positive delta value, getDeltaColorClass SHALL return 'text-positive'.
 * For any strictly negative delta value, getDeltaColorClass SHALL return 'text-negative'.
 * For exactly zero, getDeltaColorClass SHALL return '' (no color class).
 */
test('Property 5: Delta color sign consistency — positive values get green class', () => {
    fc.assert(
        fc.property(
            fc.float({ min: Math.fround(0.0001), max: Math.fround(1000000), noNaN: true }),
            (delta) => {
                expect(getDeltaColorClass(delta)).toBe('text-positive');
            }
        ),
        { numRuns: 25 }
    );
});

test('Property 5: Delta color sign consistency — negative values get red class', () => {
    fc.assert(
        fc.property(
            fc.float({ min: Math.fround(-1000000), max: Math.fround(-0.0001), noNaN: true }),
            (delta) => {
                expect(getDeltaColorClass(delta)).toBe('text-negative');
            }
        ),
        { numRuns: 25 }
    );
});

test('Property 5: Delta color sign consistency — zero gets no color class', () => {
    expect(getDeltaColorClass(0)).toBe('');
});

/**
 * Property 6: Winners and losers top-5 ordering
 * Validates: Requirements 3.5
 *
 * For any collection of assets with varying values between snapshots:
 * - winners contains only positive deltas, sorted descending, capped at 5
 * - losers contains only negative deltas, sorted ascending (most negative first), capped at 5
 */
// Feature: ai-wealth-dashboard, Property 6: Winners and losers top-5 ordering
test('Property 6: Winners are top-5 ordered descending by delta', () => {
    fc.assert(
        fc.property(
            fc.array(
                fc.record({
                    ticker: fc.string({ minLength: 1, maxLength: 5 }),
                    currentValue: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
                }),
                { minLength: 0, maxLength: 20 }
            ),
            (assets) => {
                const snapshot = { totalTransactionValue: 5000, freeFunds: 100, netProfitLoss: 0 };

                // Unique tickers
                const uniqueAssets = assets.filter((a, i, arr) => arr.findIndex(x => x.ticker === a.ticker) === i);

                // prev assets at currentValue, curr assets at slightly different values
                const prevAssets = uniqueAssets.map(a => ({ ticker: a.ticker, currentValue: a.currentValue }));
                const currAssets = uniqueAssets.map((a, i) => ({ ticker: a.ticker, currentValue: a.currentValue * (1 + (i % 3 === 0 ? 0.1 : i % 3 === 1 ? -0.1 : 0)) }));

                const result = calculateDelta(snapshot, snapshot, prevAssets, currAssets);

                // Winners must have all positive deltas
                expect(result.winners.every(w => w.delta > 0)).toBe(true);

                // Winners must be ordered descending
                for (let i = 0; i < result.winners.length - 1; i++) {
                    expect(result.winners[i].delta).toBeGreaterThanOrEqual(result.winners[i + 1].delta);
                }

                // At most 5 winners
                expect(result.winners.length).toBeLessThanOrEqual(5);

                // Losers must have all negative deltas
                expect(result.losers.every(l => l.delta < 0)).toBe(true);

                // Losers ordered ascending (most negative first)
                for (let i = 0; i < result.losers.length - 1; i++) {
                    expect(result.losers[i].delta).toBeLessThanOrEqual(result.losers[i + 1].delta);
                }

                // At most 5 losers
                expect(result.losers.length).toBeLessThanOrEqual(5);
            }
        ),
        { numRuns: 25 }
    );
});
