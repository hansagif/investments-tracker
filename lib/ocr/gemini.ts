/**
 * GeminiBackend — OCR_Engine implementation using the Google Gemini multimodal API.
 *
 * Sends the raw image as a base64-encoded inline data part alongside a structured
 * prompt that requests the three XTB fields as JSON. The response is parsed and
 * the same numeric range validation used by TesseractBackend is applied.
 *
 * Requirements: 2.7, 2.8
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { OCREngine, ParsedSnapshot } from "./types";
import { validateOCRRange, RANGE_MIN, RANGE_MAX } from "./tesseract";

// Re-export so callers that only import the Gemini module can access the constants.
export { RANGE_MIN, RANGE_MAX };

// ─── Structured prompt ────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `Analyze this XTB trading platform screenshot and extract exactly these three numeric values as JSON:
{
  "totalTransactionValue": <number or null>,
  "freeFunds": <number or null>,
  "netProfitLoss": <number or null>
}
Return ONLY valid JSON. Use null for any field you cannot find.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip Markdown code fences that Gemini sometimes wraps around JSON output.
 * e.g. ```json\n{...}\n``` → {...}
 */
function stripCodeFences(text: string): string {
    return text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
}

/**
 * Parse the raw text response from Gemini into the three numeric fields.
 * Any field that is not a finite number is normalised to null.
 */
function parseGeminiResponse(responseText: string): {
    totalTransactionValue: number | null;
    freeFunds: number | null;
    netProfitLoss: number | null;
} {
    const json = JSON.parse(stripCodeFences(responseText));

    const toNumberOrNull = (v: unknown): number | null => {
        if (typeof v === "number" && isFinite(v)) return v;
        if (typeof v === "string") {
            const n = parseFloat(v.replace(/[,\s]/g, ""));
            return isFinite(n) ? n : null;
        }
        return null;
    };

    return {
        totalTransactionValue: toNumberOrNull(json.totalTransactionValue),
        freeFunds: toNumberOrNull(json.freeFunds),
        netProfitLoss: toNumberOrNull(json.netProfitLoss),
    };
}

// ─── GeminiBackend ────────────────────────────────────────────────────────────

export class GeminiBackend implements OCREngine {
    private apiToken: string;

    /**
     * @param apiToken - Gemini API key. Falls back to the `GEMINI_API_KEY`
     *                   environment variable when not supplied explicitly.
     */
    constructor(apiToken?: string) {
        this.apiToken = apiToken ?? process.env.GEMINI_API_KEY ?? "";
    }

    /**
     * Parse an XTB closing screenshot and return the three key numeric fields.
     *
     * @param imageBuffer - Raw image bytes. Must be non-empty / non-null.
     * @param mimeType    - MIME type of the image (e.g. "image/png").
     * @throws Error if imageBuffer is empty or falsy.
     * @throws Error if the Gemini API call fails or returns unparseable JSON.
     */
    async parse(imageBuffer: Buffer, mimeType: string): Promise<ParsedSnapshot> {
        // Guard: reject empty/null buffers (Requirement 2.2)
        if (!imageBuffer || imageBuffer.length === 0) {
            throw new Error("imageBuffer must be a non-empty Buffer");
        }

        // Step 1: Convert image buffer to base64
        const base64Image = imageBuffer.toString("base64");

        // Step 2: Initialise Gemini client and model
        const genAI = new GoogleGenerativeAI(this.apiToken);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        // Step 3: Build multimodal request with inline image data
        const result = await model.generateContent([
            {
                inlineData: {
                    data: base64Image,
                    mimeType,
                },
            },
            EXTRACTION_PROMPT,
        ]);

        const responseText = result.response.text();

        // Step 4: Parse the JSON response
        let parsed: {
            totalTransactionValue: number | null;
            freeFunds: number | null;
            netProfitLoss: number | null;
        };

        try {
            parsed = parseGeminiResponse(responseText);
        } catch (err) {
            throw new Error(
                `GeminiBackend: failed to parse JSON response — ${(err as Error).message}. Raw response: ${responseText}`
            );
        }

        // Step 5: Apply numeric range validation (Requirement 2.8)
        const rangeErrors = validateOCRRange(parsed);

        // Fields that are out of range are nulled out (consistent with TesseractBackend)
        const totalTransactionValue = rangeErrors.includes("totalTransactionValue")
            ? null
            : parsed.totalTransactionValue;
        const freeFunds = rangeErrors.includes("freeFunds")
            ? null
            : parsed.freeFunds;
        const netProfitLoss = rangeErrors.includes("netProfitLoss")
            ? null
            : parsed.netProfitLoss;

        return {
            totalTransactionValue,
            freeFunds,
            netProfitLoss,
            errors: rangeErrors,
        };
    }
}
