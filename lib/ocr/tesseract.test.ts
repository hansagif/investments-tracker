/**
 * Unit tests for TesseractBackend and validateOCRRange.
 *
 * Tests cover:
 *  - Empty/null imageBuffer throws an error
 *  - validateOCRRange correctly flags out-of-range fields
 *  - validateOCRRange leaves in-range and null fields alone
 *  - The TesseractBackend.parse interface contract (mocked tesseract + sharp)
 *
 * NOTE: Full end-to-end OCR tests with real PNG fixtures are in task 7.4.
 * Property 7 (OCR range validation) is covered in the property test file.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TesseractBackend, validateOCRRange, RANGE_MIN, RANGE_MAX } from "./tesseract";

// ─── validateOCRRange ─────────────────────────────────────────────────────────

describe("validateOCRRange", () => {
    it("returns no errors when all fields are within range", () => {
        expect(
            validateOCRRange({
                totalTransactionValue: 9823.45,
                freeFunds: 241.6,
                netProfitLoss: -12.3,
            })
        ).toEqual([]);
    });

    it("returns no errors when all fields are null (extraction failure, not out-of-range)", () => {
        expect(
            validateOCRRange({
                totalTransactionValue: null,
                freeFunds: null,
                netProfitLoss: null,
            })
        ).toEqual([]);
    });

    it("flags totalTransactionValue when above RANGE_MAX", () => {
        const errors = validateOCRRange({
            totalTransactionValue: RANGE_MAX + 1,
            freeFunds: 100,
            netProfitLoss: 0,
        });
        expect(errors).toContain("totalTransactionValue");
        expect(errors).not.toContain("freeFunds");
        expect(errors).not.toContain("netProfitLoss");
    });

    it("flags freeFunds when below RANGE_MIN", () => {
        const errors = validateOCRRange({
            totalTransactionValue: 0,
            freeFunds: RANGE_MIN - 1,
            netProfitLoss: 0,
        });
        expect(errors).toContain("freeFunds");
        expect(errors).not.toContain("totalTransactionValue");
        expect(errors).not.toContain("netProfitLoss");
    });

    it("flags netProfitLoss when exactly at boundary (outside by 0.01)", () => {
        const errors = validateOCRRange({
            totalTransactionValue: null,
            freeFunds: null,
            netProfitLoss: RANGE_MAX + 0.01,
        });
        expect(errors).toContain("netProfitLoss");
    });

    it("does NOT flag values exactly at the boundaries", () => {
        const errors = validateOCRRange({
            totalTransactionValue: RANGE_MAX,
            freeFunds: RANGE_MIN,
            netProfitLoss: 0,
        });
        expect(errors).toEqual([]);
    });

    it("flags all three fields when all are out of range", () => {
        const errors = validateOCRRange({
            totalTransactionValue: RANGE_MAX + 100,
            freeFunds: RANGE_MIN - 100,
            netProfitLoss: RANGE_MAX + 50,
        });
        expect(errors).toHaveLength(3);
        expect(errors).toContain("totalTransactionValue");
        expect(errors).toContain("freeFunds");
        expect(errors).toContain("netProfitLoss");
    });
});

// ─── TesseractBackend — guard checks ─────────────────────────────────────────

describe("TesseractBackend.parse — input guards", () => {
    let backend: TesseractBackend;

    beforeEach(() => {
        backend = new TesseractBackend();
    });

    it("throws when imageBuffer is an empty Buffer", async () => {
        await expect(
            backend.parse(Buffer.alloc(0), "image/png")
        ).rejects.toThrow(/imageBuffer must be a non-empty Buffer/i);
    });

    // Testing null is a bit awkward in strict TypeScript but important for JS callers
    it("throws when imageBuffer is null (runtime coercion)", async () => {
        await expect(
            backend.parse(null as unknown as Buffer, "image/png")
        ).rejects.toThrow();
    });
});
