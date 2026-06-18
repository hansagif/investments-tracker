/**
 * Unit tests for /lib/assets.ts — calculatePositionWeights
 *
 * Covers the core requirements for task 10.6:
 * - Empty array → empty array
 * - Single asset → 100% weight
 * - Multiple assets → correct percentage distribution
 * - Weights sum to 100 within floating-point tolerance
 *
 * Requirements: 4.4
 */

import { describe, it, expect } from "vitest";
import {
    calculatePositionWeights,
    validateAssetInput,
    VALID_TYPES,
    VALID_SECTORS,
    VALID_CURRENCIES,
    type AssetInput,
} from "./assets";
import type { Asset } from "@prisma/client";

// Minimal helper to build an Asset fixture; only fields used by the function
// need to be populated.
function makeAsset(ticker: string, currentValue: number): Asset {
    return {
        id: ticker,
        ticker,
        name: ticker,
        type: "Stock",
        sector: "Technology",
        currentValue,
        costBasis: currentValue,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

describe("calculatePositionWeights", () => {
    it("returns an empty array when the assets array is empty", () => {
        expect(calculatePositionWeights([])).toEqual([]);
    });

    it("returns 100% for a single asset", () => {
        const result = calculatePositionWeights([makeAsset("AAPL", 500)]);
        expect(result).toHaveLength(1);
        expect(result[0].ticker).toBe("AAPL");
        expect(result[0].weight).toBeCloseTo(100, 5);
    });

    it("splits weight evenly across two equal-value assets", () => {
        const assets = [makeAsset("AAPL", 500), makeAsset("MSFT", 500)];
        const result = calculatePositionWeights(assets);
        expect(result).toHaveLength(2);
        for (const w of result) {
            expect(w.weight).toBeCloseTo(50, 5);
        }
    });

    it("calculates correct weights for assets with unequal values", () => {
        const assets = [
            makeAsset("A", 200),
            makeAsset("B", 300),
            makeAsset("C", 500),
        ];
        const result = calculatePositionWeights(assets);
        // total = 1000
        expect(result.find((w) => w.ticker === "A")!.weight).toBeCloseTo(20, 5);
        expect(result.find((w) => w.ticker === "B")!.weight).toBeCloseTo(30, 5);
        expect(result.find((w) => w.ticker === "C")!.weight).toBeCloseTo(50, 5);
    });

    it("weights sum to 100 for a non-trivial portfolio", () => {
        const assets = [
            makeAsset("X", 123.45),
            makeAsset("Y", 678.90),
            makeAsset("Z", 246.80),
        ];
        const result = calculatePositionWeights(assets);
        const total = result.reduce((sum, w) => sum + w.weight, 0);
        expect(total).toBeCloseTo(100, 5);
    });

    it("preserves asset order in the returned array", () => {
        const tickers = ["A", "B", "C", "D"];
        const assets = tickers.map((t) => makeAsset(t, 100));
        const result = calculatePositionWeights(assets);
        expect(result.map((w) => w.ticker)).toEqual(tickers);
    });

    it("handles assets with all-zero currentValue (no division by zero)", () => {
        const assets = [makeAsset("A", 0), makeAsset("B", 0)];
        const result = calculatePositionWeights(assets);
        for (const w of result) {
            expect(w.weight).toBe(0);
        }
    });
});

// ─── validateAssetInput tests (task 10.1) ─────────────────────────────────────

function validInput(overrides: Partial<AssetInput> = {}): AssetInput {
    return {
        ticker: "AAPL",
        type: "Stock",
        sector: "Technology",
        currentValue: 9.5,
        costBasis: 8.0,
        currency: "USD",
        ...overrides,
    };
}

describe("validateAssetInput", () => {
    describe("valid input — returns empty error object", () => {
        it("accepts a fully valid asset", () => {
            expect(validateAssetInput(validInput())).toEqual({});
        });

        it("accepts ETF type", () => {
            expect(validateAssetInput(validInput({ type: "ETF" }))).toEqual({});
        });

        it("accepts all valid sector values", () => {
            for (const sector of VALID_SECTORS) {
                expect(validateAssetInput(validInput({ sector }))).toEqual({});
            }
        });

        it("accepts all valid currency values", () => {
            for (const currency of VALID_CURRENCIES) {
                expect(validateAssetInput(validInput({ currency }))).toEqual({});
            }
        });

        it("accepts a single-character ticker", () => {
            expect(validateAssetInput(validInput({ ticker: "A" }))).toEqual({});
        });

        it("accepts a 10-character ticker", () => {
            expect(validateAssetInput(validInput({ ticker: "ABCDE12345" }))).toEqual({});
        });

        it("accepts ticker with digits", () => {
            expect(validateAssetInput(validInput({ ticker: "BRK2" }))).toEqual({});
        });

        it("ignores optional name field", () => {
            expect(validateAssetInput(validInput({ name: "Apple Inc." }))).toEqual({});
        });
    });

    describe("ticker validation", () => {
        it("rejects empty ticker", () => {
            expect(validateAssetInput(validInput({ ticker: "" })).ticker).toBeDefined();
        });

        it("rejects ticker longer than 10 characters", () => {
            expect(validateAssetInput(validInput({ ticker: "ABCDE123456" })).ticker).toBeDefined();
        });

        it("rejects lowercase letters", () => {
            expect(validateAssetInput(validInput({ ticker: "aapl" })).ticker).toBeDefined();
        });

        it("rejects special characters", () => {
            expect(validateAssetInput(validInput({ ticker: "AA-PL" })).ticker).toBeDefined();
        });

        it("rejects spaces in ticker", () => {
            expect(validateAssetInput(validInput({ ticker: "AA PL" })).ticker).toBeDefined();
        });
    });

    describe("type validation", () => {
        it("rejects unknown type", () => {
            expect(validateAssetInput(validInput({ type: "Bond" })).type).toBeDefined();
        });

        it("rejects empty type", () => {
            expect(validateAssetInput(validInput({ type: "" })).type).toBeDefined();
        });

        it("rejects lowercase 'stock'", () => {
            expect(validateAssetInput(validInput({ type: "stock" })).type).toBeDefined();
        });
    });

    describe("sector validation", () => {
        it("rejects unknown sector", () => {
            expect(validateAssetInput(validInput({ sector: "Aerospace" })).sector).toBeDefined();
        });

        it("rejects empty sector", () => {
            expect(validateAssetInput(validInput({ sector: "" })).sector).toBeDefined();
        });

        it("rejects lowercase sector", () => {
            expect(validateAssetInput(validInput({ sector: "technology" })).sector).toBeDefined();
        });
    });

    describe("currentValue validation", () => {
        it("rejects zero", () => {
            expect(validateAssetInput(validInput({ currentValue: 0 })).currentValue).toBeDefined();
        });

        it("rejects negative value", () => {
            expect(validateAssetInput(validInput({ currentValue: -1 })).currentValue).toBeDefined();
        });

        it("rejects NaN", () => {
            expect(validateAssetInput(validInput({ currentValue: NaN })).currentValue).toBeDefined();
        });

        it("rejects Infinity", () => {
            expect(validateAssetInput(validInput({ currentValue: Infinity })).currentValue).toBeDefined();
        });

        it("accepts a small positive value", () => {
            expect(validateAssetInput(validInput({ currentValue: 0.01 })).currentValue).toBeUndefined();
        });
    });

    describe("costBasis validation", () => {
        it("rejects zero", () => {
            expect(validateAssetInput(validInput({ costBasis: 0 })).costBasis).toBeDefined();
        });

        it("rejects negative value", () => {
            expect(validateAssetInput(validInput({ costBasis: -5 })).costBasis).toBeDefined();
        });

        it("rejects NaN", () => {
            expect(validateAssetInput(validInput({ costBasis: NaN })).costBasis).toBeDefined();
        });

        it("accepts a positive value", () => {
            expect(validateAssetInput(validInput({ costBasis: 7.5 })).costBasis).toBeUndefined();
        });
    });

    describe("currency validation", () => {
        it("rejects unknown currency", () => {
            expect(validateAssetInput(validInput({ currency: "GBP" })).currency).toBeDefined();
        });

        it("rejects empty currency", () => {
            expect(validateAssetInput(validInput({ currency: "" })).currency).toBeDefined();
        });

        it("rejects lowercase currency", () => {
            expect(validateAssetInput(validInput({ currency: "usd" })).currency).toBeDefined();
        });
    });

    describe("multiple field failures", () => {
        it("reports errors for every failing field simultaneously", () => {
            const errors = validateAssetInput({
                ticker: "",
                type: "Bond",
                sector: "Space",
                currentValue: -1,
                costBasis: 0,
                currency: "JPY",
            });
            expect(errors.ticker).toBeDefined();
            expect(errors.type).toBeDefined();
            expect(errors.sector).toBeDefined();
            expect(errors.currentValue).toBeDefined();
            expect(errors.costBasis).toBeDefined();
            expect(errors.currency).toBeDefined();
        });

        it("only flags failing fields — valid fields have no entry", () => {
            const errors = validateAssetInput(validInput({ ticker: "invalid!" }));
            expect(errors.ticker).toBeDefined();
            expect(errors.type).toBeUndefined();
            expect(errors.sector).toBeUndefined();
            expect(errors.currentValue).toBeUndefined();
            expect(errors.costBasis).toBeUndefined();
            expect(errors.currency).toBeUndefined();
        });
    });
});

describe("exported constants", () => {
    it("VALID_TYPES contains Stock and ETF", () => {
        expect(VALID_TYPES).toContain("Stock");
        expect(VALID_TYPES).toContain("ETF");
        expect(VALID_TYPES).toHaveLength(2);
    });

    it("VALID_SECTORS contains exactly the 8 taxonomy values", () => {
        expect(VALID_SECTORS).toHaveLength(8);
        const expected = [
            "Technology", "Healthcare", "Finance", "Energy",
            "Consumer", "Industrial", "Real Estate", "Other",
        ];
        for (const s of expected) {
            expect(VALID_SECTORS).toContain(s);
        }
    });

    it("VALID_CURRENCIES contains USD, EUR, RON", () => {
        expect(VALID_CURRENCIES).toContain("USD");
        expect(VALID_CURRENCIES).toContain("EUR");
        expect(VALID_CURRENCIES).toContain("RON");
        expect(VALID_CURRENCIES).toHaveLength(3);
    });
});
