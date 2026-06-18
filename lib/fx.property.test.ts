// Feature: ai-wealth-dashboard, Property 1: FX penalty applied to cross-currency conversions
import { test, expect } from "vitest";
import * as fc from "fast-check";
import { toRON, type ExchangeRates } from "./fx";

/**
 * Property 1: FX penalty applied to cross-currency conversions
 * Validates: Requirements 1.4
 *
 * For any amount in USD or EUR and any valid RON exchange rate,
 * toRON(amount, currency, rates) SHALL return a value equal to
 * amount × rate × (1 - 0.005) — i.e., exactly 0.5% less than the raw converted amount.
 */
test("Property 1: FX penalty applied to cross-currency conversions", () => {
    fc.assert(
        fc.property(
            fc.float({ min: Math.fround(0.01), max: Math.fround(999999), noNaN: true }),
            fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
            (amount, rate) => {
                const rates: ExchangeRates = {
                    RON_USD: rate,
                    RON_EUR: rate + 0.1,
                    fetchedAt: new Date(),
                };
                // USD conversion
                const resultUSD = toRON(amount, "USD", rates);
                expect(resultUSD).toBeCloseTo(amount * rate * 0.995, 5);
                // EUR conversion
                const resultEUR = toRON(amount, "EUR", rates);
                expect(resultEUR).toBeCloseTo(amount * (rate + 0.1) * 0.995, 5);
            }
        ),
        { numRuns: 25 }
    );
});

// Feature: ai-wealth-dashboard, Property 2: FX RON pass-through (no penalty on same-currency)

/**
 * Property 2: FX RON pass-through (no penalty on same-currency)
 * Validates: Requirements 1.4
 *
 * For any amount in RON, toRON(amount, 'RON', rates) SHALL return the amount unchanged.
 * No exchange penalty is applied when the source currency is already RON.
 */
test("Property 2: FX RON pass-through (no penalty on same-currency)", () => {
    fc.assert(
        fc.property(
            fc.float({ min: -999999, max: 999999 }),
            (amount) => {
                const rates: ExchangeRates = { RON_USD: 4.6, RON_EUR: 5.0, fetchedAt: new Date() };
                const result = toRON(amount, "RON", rates);
                expect(result).toBe(amount);
            }
        ),
        { numRuns: 25 }
    );
});
