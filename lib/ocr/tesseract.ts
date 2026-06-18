/**
 * TesseractBackend — OCR_Engine implementation using tesseract.js.
 *
 * Pre-processes the image with sharp (greyscale + contrast normalisation) and
 * then extracts the three key XTB fields using regex patterns calibrated to the
 * XTB platform UI. Out-of-range values are flagged in the errors array.
 *
 * Requirements: 2.2, 2.5, 2.7, 2.8
 */

import Tesseract from "tesseract.js";
import sharp from "sharp";
import path from "path";
import type { OCREngine, ParsedSnapshot } from "./types";

// Numeric range boundaries (Requirement 2.8)
const RANGE_MIN = -1_000_000;
const RANGE_MAX = 1_000_000;

/**
 * Parse a raw OCR text string for a numeric value that follows a label
 * matched by the supplied regex.
 *
 * Number format handled:
 *  - Optional leading minus sign
 *  - Thousands separators (commas or spaces)
 *  - Decimal separator (period)
 *
 * Returns the parsed float, or null if no match / unparseable.
 */
function extractField(text: string, pattern: RegExp): number | null {
    const match = text.match(pattern);
    if (!match) return null;

    // The capture group contains the raw numeric string (e.g. "-1,234.56")
    const raw = match[1];
    if (!raw) return null;

    // Strip thousands separators (commas and spaces used in XTB), keep minus and decimal point
    const normalised = raw.replace(/[\s,]/g, "");
    const value = parseFloat(normalised);
    return isNaN(value) ? null : value;
}

/**
 * Validate a parsed field against the allowed numeric range.
 * Returns true when the value is within range or is null (missing — handled separately).
 */
function isInRange(value: number | null): boolean {
    if (value === null) return true; // null means extraction failed, not out-of-range
    return value >= RANGE_MIN && value <= RANGE_MAX;
}

/**
 * Pre-process an image buffer with sharp for improved OCR accuracy:
 *   1. Convert to greyscale (removes colour noise)
 *   2. Normalise contrast (stretches histogram to full 0–255 range)
 *
 * Returns a PNG buffer suitable for tesseract.js.
 */
async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    return sharp(imageBuffer)
        .greyscale()
        .normalise()
        .png()
        .toBuffer();
}

/**
 * Run tesseract.js on the supplied buffer and return the recognised text.
 * Uses English language data with the default LSTM engine.
 *
 * We pass an explicit workerPath so Next.js doesn't need to resolve it
 * relative to the .next output directory (which fails in dev mode).
 */
async function runTesseract(imageBuffer: Buffer): Promise<string> {
    const workerPath = path.resolve(
        process.cwd(),
        "node_modules/tesseract.js/src/worker-script/node/index.js"
    );
    const worker = await Tesseract.createWorker("eng", 1, {
        workerPath,
        logger: () => { }, // suppress progress logs
    });
    try {
        const { data } = await worker.recognize(imageBuffer);
        return data.text;
    } finally {
        await worker.terminate();
    }
}

/**
 * XTB-calibrated regex patterns.
 *
 * XTB Romania uses Romanian labels:
 *   - "Valoarea tranzacțiilor mele" = Total Transaction Value
 *   - "Fonduri libere"              = Free Funds
 *   - "Profit"                      = Net P&L
 *
 * English fallbacks are kept for other locales.
 */
const NUMERIC = "(-?[\\d][\\d\\s,.']*(?:[.,]\\d{1,2})?)";

const FIELD_PATTERNS: Record<keyof Omit<ParsedSnapshot, "errors" | "rawText">, RegExp[]> = {
    totalTransactionValue: [
        // Romanian: "Valoarea tranzacțiilor mele 395.33"
        new RegExp(`valoarea\\s+tranzac[t\\u0163\\u021b]iilor\\s+mele\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        new RegExp(`valoarea\\s+tranzac[t\\u0163\\u021b]iilor\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        // English fallbacks
        new RegExp(`total\\s+transaction\\s+value\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        new RegExp(`transaction\\s+value\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        new RegExp(`equity\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
    ],
    freeFunds: [
        // Romanian: "Fonduri libere 21.96"
        new RegExp(`fonduri\\s+libere\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        // English fallbacks
        new RegExp(`free\\s+funds\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        new RegExp(`available\\s+funds\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        new RegExp(`free\\s+margin\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        new RegExp(`cash\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
    ],
    netProfitLoss: [
        // Romanian: "Profit -7.92" (bare label, word boundary so it doesn't match mid-word)
        new RegExp(`\\bprofit\\b\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        // Romanian with slash
        new RegExp(`profit\\s*\\/\\s*pierdere\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        // English fallbacks
        new RegExp(`net\\s+p\\s*[&a]?n?d?\\s*l\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        new RegExp(`net\\s+profit\\s*[/\\\\]?\\s*loss\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
        new RegExp(`p\\s*[/&]\\s*l\\s*[:\\-|]?\\s*${NUMERIC}`, "i"),
    ],
};

/**
 * Attempt to extract a field value by trying each pattern in order.
 * Returns the first successful match, or null if all patterns fail.
 */
function extractFieldWithFallbacks(
    text: string,
    patterns: RegExp[]
): number | null {
    for (const pattern of patterns) {
        const value = extractField(text, pattern);
        if (value !== null) return value;
    }
    return null;
}

// ─── TesseractBackend ──────────────────────────────────────────────────────────

export class TesseractBackend implements OCREngine {
    /**
     * Parse an XTB closing screenshot and return the three key numeric fields.
     *
     * @param imageBuffer - Raw image bytes. Must be non-empty / non-null.
     * @param mimeType    - MIME type of the image (informational; sharp auto-detects format).
     * @throws Error if imageBuffer is empty or falsy.
     */
    async parse(imageBuffer: Buffer, mimeType: string): Promise<ParsedSnapshot> {
        // Guard: reject empty/null buffers (Requirement 2.2)
        if (!imageBuffer || imageBuffer.length === 0) {
            throw new Error("imageBuffer must be a non-empty Buffer");
        }

        // Step 1: Pre-process image (greyscale + contrast normalisation)
        const processedBuffer = await preprocessImage(imageBuffer);

        // Step 2: Run Tesseract OCR
        const rawText = await runTesseract(processedBuffer);

        // Step 3: Extract each field using XTB-calibrated regex patterns
        const totalTransactionValue = extractFieldWithFallbacks(
            rawText,
            FIELD_PATTERNS.totalTransactionValue
        );
        const freeFunds = extractFieldWithFallbacks(
            rawText,
            FIELD_PATTERNS.freeFunds
        );
        const netProfitLoss = extractFieldWithFallbacks(
            rawText,
            FIELD_PATTERNS.netProfitLoss
        );

        // Step 4: Apply numeric range validation (Requirement 2.8)
        const errors: string[] = [];

        if (!isInRange(totalTransactionValue)) {
            errors.push("totalTransactionValue");
        }
        if (!isInRange(freeFunds)) {
            errors.push("freeFunds");
        }
        if (!isInRange(netProfitLoss)) {
            errors.push("netProfitLoss");
        }

        return {
            totalTransactionValue: isInRange(totalTransactionValue)
                ? totalTransactionValue
                : null,
            freeFunds: isInRange(freeFunds) ? freeFunds : null,
            netProfitLoss: isInRange(netProfitLoss) ? netProfitLoss : null,
            errors,
            rawText,
        };
    }
}

// ─── Exported helpers (used by property tests and unit tests) ─────────────────

/**
 * Validate a set of already-parsed numeric values against the allowed range.
 * Returns the errors array — useful for the property test (Property 7).
 *
 * This pure function is the same logic used by both OCR backends so it can be
 * tested in isolation without spinning up Tesseract.
 */
export function validateOCRRange(fields: {
    totalTransactionValue: number | null;
    freeFunds: number | null;
    netProfitLoss: number | null;
}): string[] {
    const errors: string[] = [];
    if (!isInRange(fields.totalTransactionValue)) errors.push("totalTransactionValue");
    if (!isInRange(fields.freeFunds)) errors.push("freeFunds");
    if (!isInRange(fields.netProfitLoss)) errors.push("netProfitLoss");
    return errors;
}

export { RANGE_MIN, RANGE_MAX };
