// Feature: ai-wealth-dashboard, Property 7: OCR range validation flags out-of-bound fields
import { test, expect } from "vitest";
import * as fc from "fast-check";
import { validateOCRRange } from "./tesseract";

/**
 * Property 7: OCR range validation flags out-of-bound fields
 * Validates: Requirements 2.8
 *
 * For any combination of numeric field values within [-2,000,000, +2,000,000],
 * validateOCRRange SHALL include a field name in the errors array if and only if
 * its absolute value exceeds 1,000,000 (the allowed range boundary).
 */
test("Property 7: Out-of-range values appear in errors", () => {
    fc.assert(
        fc.property(
            fc.record({
                totalTransactionValue: fc.float({ min: -2000000, max: 2000000, noNaN: true }),
                freeFunds: fc.float({ min: -2000000, max: 2000000, noNaN: true }),
                netProfitLoss: fc.float({ min: -2000000, max: 2000000, noNaN: true }),
            }),
            (fields) => {
                const errors = validateOCRRange(fields);

                // Out-of-range fields must appear in errors
                if (Math.abs(fields.totalTransactionValue) > 1000000) {
                    expect(errors).toContain('totalTransactionValue');
                } else {
                    expect(errors).not.toContain('totalTransactionValue');
                }

                if (Math.abs(fields.freeFunds) > 1000000) {
                    expect(errors).toContain('freeFunds');
                } else {
                    expect(errors).not.toContain('freeFunds');
                }

                if (Math.abs(fields.netProfitLoss) > 1000000) {
                    expect(errors).toContain('netProfitLoss');
                } else {
                    expect(errors).not.toContain('netProfitLoss');
                }
            }
        ),
        { numRuns: 25 }
    );
});
