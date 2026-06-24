/**
 * positions.ts — Extract individual stock positions from an XTB screenshot
 * using the Gemini multimodal API.
 *
 * Sends the full screenshot to Gemini with a prompt asking it to return every
 * row from the positions table as a JSON array. The result is used to update
 * the Asset table with today's current values.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { withGeminiRetry } from "@/lib/gemini-retry";

export interface ExtractedPosition {
    name: string;
    /** Stock ticker symbol e.g. "MA", "NVDA" */
    ticker: string | null;
    /** Total current USD value — Valoare column */
    currentValue: number;
    /** Number of shares — Volum column */
    volume: number | null;
    /** Avg price paid per share — Pret deschidere */
    avgBuyPrice: number | null;
    /** Current price per share — Pret actual */
    currentPrice: number | null;
    /** Total cost basis = volume × avgBuyPrice (calculated) */
    totalCostBasis: number | null;
    /** Net P&L in USD — Profit net column */
    netPnl: number | null;
}

const POSITIONS_PROMPT = `This is a screenshot of an XTB trading platform showing open stock positions. The UI is in Romanian.

Column meanings:
- "Instrument/Pozitie" = stock name
- "Volum" = number of shares held
- "Valoare" = TOTAL current USD value of the position (what you'd get if you sold)
- "Pret actual" = CURRENT price per share right now (the live market price)
- "Pret deschidere" = AVERAGE price per share you originally paid
- "Profit net" = profit/loss in USD

Extract every row and return ONLY a JSON array with no extra text:
[
  {
    "name": "Nvidia",
    "ticker": "NVDA",
    "currentValue": 120.60,
    "avgBuyPrice": 217.45,
    "currentPrice": 205.56,
    "volume": 0.5779,
    "profitNet": -6.88
  }
]

Rules:
- "ticker" = the standard stock exchange ticker symbol (e.g. "MA" for Mastercard, "NVDA" for Nvidia)
- "currentValue" = number from "Valoare" column
- "avgBuyPrice" = number from "Pret deschidere" column  
- "currentPrice" = number from "Pret actual" column
- "volume" = number from "Volum" column
- "profitNet" = number from "Profit net" column (negative for losses)
- ALL numeric fields must be numbers, not strings
- Return ONLY the JSON array, nothing else`;

function stripCodeFences(text: string): string {
    return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

/**
 * Extract all stock positions from an XTB screenshot using Gemini.
 *
 * @param imageBuffer  Raw image bytes
 * @param mimeType     e.g. "image/png"
 * @param apiToken     Gemini API key
 * @returns Array of extracted positions (may be empty if extraction fails)
 */
export async function extractPositions(
    imageBuffer: Buffer,
    mimeType: string,
    apiToken: string
): Promise<ExtractedPosition[]> {
    if (!imageBuffer || imageBuffer.length === 0 || !apiToken) {
        return [];
    }

    const genAI = new GoogleGenerativeAI(apiToken);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await withGeminiRetry(() => model.generateContent([
        {
            inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType,
            },
        },
        POSITIONS_PROMPT,
    ]));

    const raw = result.response.text();
    const clean = stripCodeFences(raw);

    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return [];

    return parsed
        .filter((p: Record<string, unknown>) => p.name && typeof p.currentValue === "number")
        .map((p: Record<string, unknown>) => {
            const volume = typeof p.volume === "number" ? p.volume : null;
            const avgBuyPrice = typeof p.avgBuyPrice === "number" ? p.avgBuyPrice : null;
            const currentPrice = typeof p.currentPrice === "number" ? p.currentPrice : null;
            // Total cost = volume × avg buy price
            const totalCostBasis = (volume !== null && avgBuyPrice !== null)
                ? Math.round(volume * avgBuyPrice * 100) / 100
                : null;
            return {
                name: String(p.name),
                ticker: typeof p.ticker === "string" ? p.ticker.toUpperCase().trim() : null,
                currentValue: Number(p.currentValue),
                volume,
                avgBuyPrice,
                currentPrice,
                totalCostBasis,
                netPnl: typeof p.profitNet === "number" ? p.profitNet : null,
            };
        });
}
