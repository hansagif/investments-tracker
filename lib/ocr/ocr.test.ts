/**
 * Unit tests for OCR backends: TesseractBackend and GeminiBackend.
 *
 * Tests cover (task 7.4):
 *  - TesseractBackend: field extraction from mocked OCR text with all three fields present
 *  - TesseractBackend: all fields null when OCR text has no recognisable fields
 *  - GeminiBackend: empty/null buffer guard throws
 *  - GeminiBackend: successful parse with correct JSON response
 *  - GeminiBackend: malformed JSON response throws descriptive error
 *  - GeminiBackend: out-of-range values are nulled and flagged in errors
 *
 * Requirements: 2.2, 2.5
 */

import { describe, it, test, expect, vi, beforeEach } from "vitest";

// ─── TesseractBackend mocks ───────────────────────────────────────────────────
// We mock both `tesseract.js` and `sharp` so tests run without native binaries.
// The mock factories are defined before any imports so vi.mock hoisting works.

let mockOCRText = "";

vi.mock("tesseract.js", () => {
    return {
        default: {
            createWorker: vi.fn(async (_lang: string) => ({
                recognize: vi.fn(async (_buf: Buffer) => ({
                    data: { text: mockOCRText },
                })),
                terminate: vi.fn(async () => undefined),
            })),
        },
    };
});

// sharp: chain greyscale().normalise().png().toBuffer() — return the buffer as-is
vi.mock("sharp", () => {
    const chainable = {
        greyscale: () => chainable,
        normalise: () => chainable,
        png: () => chainable,
        toBuffer: vi.fn(async () => Buffer.from("processed")),
    };
    return {
        default: vi.fn(() => chainable),
    };
});

// ─── GeminiBackend mocks ──────────────────────────────────────────────────────

const mockGenerateContent = vi.fn();

vi.mock("@google/generative-ai", () => ({
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
        getGenerativeModel: vi.fn(() => ({
            generateContent: mockGenerateContent,
        })),
    })),
}));

beforeEach(() => {
    vi.clearAllMocks();
    mockOCRText = "";
});

// Import under test AFTER mocks are set up
const { TesseractBackend } = await import("./tesseract");
const { GeminiBackend } = await import("./gemini");

// ─── TesseractBackend — field extraction ─────────────────────────────────────

describe("TesseractBackend.parse — field extraction", () => {
    let backend: InstanceType<typeof TesseractBackend>;
    const validBuffer = Buffer.from("fake-png-data");

    beforeEach(() => {
        backend = new TesseractBackend();
    });

    it("extracts all three fields when OCR text contains recognisable labels", async () => {
        // Simulated OCR output from XTB screenshot
        mockOCRText = [
            "Total Transaction Value: 9,823.45",
            "Free funds: 241.60",
            "Net P&L: -12.30",
        ].join("\n");

        const result = await backend.parse(validBuffer, "image/png");

        expect(result.totalTransactionValue).toBeCloseTo(9823.45);
        expect(result.freeFunds).toBeCloseTo(241.6);
        expect(result.netProfitLoss).toBeCloseTo(-12.3);
        expect(result.errors).toEqual([]);
    });

    it("returns all fields as null when OCR text has no recognisable labels", async () => {
        mockOCRText = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";

        const result = await backend.parse(validBuffer, "image/png");

        expect(result.totalTransactionValue).toBeNull();
        expect(result.freeFunds).toBeNull();
        expect(result.netProfitLoss).toBeNull();
        expect(result.errors).toEqual([]);
    });

    it("handles alternative label variants (Net profit/loss, available funds)", async () => {
        mockOCRText = [
            "Transaction Value: 5,000.00",
            "Available funds: 100.00",
            "Net profit/loss: 25.00",
        ].join("\n");

        const result = await backend.parse(validBuffer, "image/png");

        expect(result.totalTransactionValue).toBeCloseTo(5000.0);
        expect(result.freeFunds).toBeCloseTo(100.0);
        expect(result.netProfitLoss).toBeCloseTo(25.0);
    });

    it("returns errors array and nulls for out-of-range field values", async () => {
        // 2,000,000 exceeds the ±1,000,000 limit
        mockOCRText = [
            "Total Transaction Value: 2000000",
            "Free funds: 100",
            "Net P&L: 0",
        ].join("\n");

        const result = await backend.parse(validBuffer, "image/png");

        expect(result.totalTransactionValue).toBeNull();
        expect(result.errors).toContain("totalTransactionValue");
        expect(result.errors).not.toContain("freeFunds");
    });
});

// ─── GeminiBackend — guard checks ────────────────────────────────────────────

describe("GeminiBackend.parse — input guards", () => {
    let backend: InstanceType<typeof GeminiBackend>;

    beforeEach(() => {
        backend = new GeminiBackend("test-api-key");
    });

    it("throws when imageBuffer is an empty Buffer", async () => {
        await expect(
            backend.parse(Buffer.alloc(0), "image/png")
        ).rejects.toThrow(/imageBuffer must be a non-empty Buffer/i);
    });

    it("throws when imageBuffer is null (runtime coercion)", async () => {
        await expect(
            backend.parse(null as unknown as Buffer, "image/png")
        ).rejects.toThrow();
    });
});

// ─── GeminiBackend — successful parse ────────────────────────────────────────

describe("GeminiBackend.parse — successful extraction", () => {
    let backend: InstanceType<typeof GeminiBackend>;
    const validBuffer = Buffer.from("fake-png-data");

    beforeEach(() => {
        backend = new GeminiBackend("test-api-key");
    });

    it("extracts all three fields from a correct JSON response", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({
                        totalTransactionValue: 9823.45,
                        freeFunds: 241.6,
                        netProfitLoss: -12.3,
                    }),
            },
        });

        const result = await backend.parse(validBuffer, "image/png");

        expect(result.totalTransactionValue).toBeCloseTo(9823.45);
        expect(result.freeFunds).toBeCloseTo(241.6);
        expect(result.netProfitLoss).toBeCloseTo(-12.3);
        expect(result.errors).toEqual([]);
    });

    it("returns null for fields with null values in Gemini response", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({
                        totalTransactionValue: null,
                        freeFunds: 500,
                        netProfitLoss: null,
                    }),
            },
        });

        const result = await backend.parse(validBuffer, "image/png");

        expect(result.totalTransactionValue).toBeNull();
        expect(result.freeFunds).toBeCloseTo(500);
        expect(result.netProfitLoss).toBeNull();
        expect(result.errors).toEqual([]);
    });

    it("accepts a JSON response wrapped in markdown code fences", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    "```json\n" +
                    JSON.stringify({
                        totalTransactionValue: 1000,
                        freeFunds: 200,
                        netProfitLoss: 50,
                    }) +
                    "\n```",
            },
        });

        const result = await backend.parse(validBuffer, "image/png");

        expect(result.totalTransactionValue).toBeCloseTo(1000);
        expect(result.freeFunds).toBeCloseTo(200);
        expect(result.netProfitLoss).toBeCloseTo(50);
    });
});

// ─── GeminiBackend — malformed JSON ──────────────────────────────────────────

describe("GeminiBackend.parse — malformed JSON response", () => {
    let backend: InstanceType<typeof GeminiBackend>;
    const validBuffer = Buffer.from("fake-png-data");

    beforeEach(() => {
        backend = new GeminiBackend("test-api-key");
    });

    it("throws a descriptive error when Gemini returns non-JSON text", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => "Sorry, I cannot process this image.",
            },
        });

        await expect(backend.parse(validBuffer, "image/png")).rejects.toThrow(
            /GeminiBackend: failed to parse JSON response/i
        );
    });

    it("throws a descriptive error when Gemini returns partial JSON", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () => '{"totalTransactionValue": 100, "freeFunds":',
            },
        });

        await expect(backend.parse(validBuffer, "image/png")).rejects.toThrow(
            /GeminiBackend: failed to parse JSON response/i
        );
    });
});

// ─── GeminiBackend — out-of-range validation ─────────────────────────────────

describe("GeminiBackend.parse — out-of-range value validation", () => {
    let backend: InstanceType<typeof GeminiBackend>;
    const validBuffer = Buffer.from("fake-png-data");

    beforeEach(() => {
        backend = new GeminiBackend("test-api-key");
    });

    it("nulls out and flags a field whose value exceeds RANGE_MAX", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({
                        totalTransactionValue: 2_000_000, // out of range
                        freeFunds: 500,
                        netProfitLoss: -10,
                    }),
            },
        });

        const result = await backend.parse(validBuffer, "image/png");

        expect(result.totalTransactionValue).toBeNull();
        expect(result.errors).toContain("totalTransactionValue");
        // In-range fields remain intact
        expect(result.freeFunds).toBeCloseTo(500);
        expect(result.netProfitLoss).toBeCloseTo(-10);
        expect(result.errors).not.toContain("freeFunds");
        expect(result.errors).not.toContain("netProfitLoss");
    });

    it("nulls out and flags a field whose value is below RANGE_MIN", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({
                        totalTransactionValue: 1000,
                        freeFunds: -2_000_000, // out of range
                        netProfitLoss: 0,
                    }),
            },
        });

        const result = await backend.parse(validBuffer, "image/png");

        expect(result.freeFunds).toBeNull();
        expect(result.errors).toContain("freeFunds");
        expect(result.totalTransactionValue).toBeCloseTo(1000);
        expect(result.netProfitLoss).toBeCloseTo(0);
    });

    it("all three fields flagged when all are out of range", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({
                        totalTransactionValue: 1_500_000,
                        freeFunds: -1_500_000,
                        netProfitLoss: 9_000_000,
                    }),
            },
        });

        const result = await backend.parse(validBuffer, "image/png");

        expect(result.totalTransactionValue).toBeNull();
        expect(result.freeFunds).toBeNull();
        expect(result.netProfitLoss).toBeNull();
        expect(result.errors).toHaveLength(3);
    });
});
